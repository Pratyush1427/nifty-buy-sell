import { closingDay, istClock, lastFinalDay } from './closingDay';
import { query, queryOne } from './db';
import { fundCode, getFund } from './funds';
import { getHistory } from './market';

// Buckets are pretend collections the user fills in: each pick has a quantity
// and a buy price, either typed by the user or filled from the closing price
// of the buy date. Valuation uses end-of-day closes only.

export const MAX_BUCKETS = 5;
export const MAX_OPEN_PICKS = 25;

const UNIQUE_VIOLATION = '23505';

export class BucketError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ------------------------------------------------------------------ closes

/** Final daily closes for one instrument, oldest first: [{ t, c }]. Never includes an unfinished day. */
async function finalCloses(symbol) {
  const lastDay = lastFinalDay();
  const code = fundCode(symbol);
  let rows;
  if (code) rows = (await getFund(code)).navs.map((n) => ({ t: n.t, c: n.nav }));
  else {
    const hist = await getHistory(symbol);
    if (!hist?.data) throw new Error(hist?.error || `No price history for ${symbol}`);
    rows = hist.data;
  }
  return rows.filter((r) => r.t <= lastDay);
}

/** First close on or after `day` (the session the action was priced at; skips holidays). */
const closeOnOrAfter = (closes, day) => closes.find((r) => r.t >= day) || null;

/**
 * Fill entry and exit prices whose closing day is now final. Runs whenever
 * buckets are read, and from the evening cron, so it never depends on one job.
 */
async function fillPrices(picks) {
  const lastDay = lastFinalDay();
  const due = picks.filter((p) =>
    (p.entry_price == null && p.entry_date <= lastDay) || (p.exit_date && p.exit_price == null && p.exit_date <= lastDay));
  if (!due.length) return picks;

  const closesBySymbol = new Map();
  await Promise.all([...new Set(due.map((p) => p.symbol))].map(async (symbol) => {
    try {
      closesBySymbol.set(symbol, await finalCloses(symbol));
    } catch (error) {
      console.warn(`[buckets] no closes for ${symbol}: ${error.message}`);
    }
  }));

  for (const p of due) {
    const closes = closesBySymbol.get(p.symbol);
    if (!closes) continue;
    if (p.entry_price == null) {
      const bar = closeOnOrAfter(closes, p.entry_date);
      if (bar) {
        p.entry_price = bar.c;
        p.entry_date = bar.t;
        await query('UPDATE picks SET entry_price = $2, entry_date = $3 WHERE id = $1 AND entry_price IS NULL', [p.id, bar.c, bar.t]);
      }
    }
    if (p.exit_date && p.exit_price == null) {
      const bar = closeOnOrAfter(closes, p.exit_date);
      if (bar) {
        p.exit_price = bar.c;
        p.exit_date = bar.t;
        await query('UPDATE picks SET exit_price = $2, exit_date = $3 WHERE id = $1 AND exit_price IS NULL', [p.id, bar.c, bar.t]);
      }
    }
  }
  return picks;
}

// ------------------------------------------------------------- performance

/** Attach latest closes, value, P&L and day change to each pick. */
async function withPerformance(picks) {
  const latest = new Map(); // symbol -> { last, prev }
  await Promise.all([...new Set(picks.filter((p) => !p.exit_price && p.entry_price).map((p) => p.symbol))].map(async (symbol) => {
    try {
      const closes = await finalCloses(symbol);
      if (closes.length) latest.set(symbol, { last: closes.at(-1), prev: closes.at(-2) || null });
    } catch {
      /* shown as "price unavailable" */
    }
  }));

  return picks.map((p) => {
    const status = p.removed_at ? 'closed' : p.entry_price ? 'open' : 'pending';
    const l = latest.get(p.symbol);
    const last = p.exit_price ? { t: p.exit_date, c: p.exit_price } : l?.last;
    const q = Number(p.quantity) || 0;
    const invested = p.entry_price ? q * p.entry_price : null;
    const value = invested != null && last ? q * last.c : null;
    // Today's move only for open picks held before the latest close.
    const dayChange = status === 'open' && l?.prev && l.prev.t >= p.entry_date ? q * (l.last.c - l.prev.c) : null;
    return {
      ...p,
      status,
      lastClose: last?.c ?? null,
      lastCloseDate: last?.t ?? null,
      invested,
      value,
      pnl: value != null ? value - invested : null,
      returnPct: value != null ? ((value / invested) - 1) * 100 : null,
      dayChange,
      dayChangePct: dayChange != null && l.prev.c ? ((l.last.c / l.prev.c) - 1) * 100 : null,
    };
  });
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** Bucket totals. Removed picks keep counting (at their exit price), so losses can't be hidden. */
function summarise(bucket, picks) {
  const priced = picks.filter((p) => p.value != null);
  const invested = sum(priced.map((p) => p.invested));
  const value = sum(priced.map((p) => p.value));
  const day = picks.filter((p) => p.dayChange != null);
  const dayChange = sum(day.map((p) => p.dayChange));
  const dayBase = sum(day.map((p) => p.value - p.dayChange));
  return {
    ...bucket,
    picks,
    openCount: picks.filter((p) => p.status !== 'closed').length,
    pendingCount: picks.filter((p) => p.status === 'pending').length,
    invested: priced.length ? invested : null,
    value: priced.length ? value : null,
    pnl: priced.length ? value - invested : null,
    returnPct: priced.length && invested ? ((value / invested) - 1) * 100 : null,
    dayChange: day.length ? dayChange : null,
    dayChangePct: day.length && dayBase ? (dayChange / dayBase) * 100 : null,
  };
}

// ------------------------------------------------------------------- reads

const PICK_COLUMNS = 'id, bucket_id, symbol, quantity, price_source, added_at, entry_date, entry_price, removed_at, exit_date, exit_price';
const iso = (d) => (d instanceof Date ? d.toISOString() : d);
const toPick = (r) => ({ ...r, added_at: iso(r.added_at), removed_at: iso(r.removed_at) });

/** All of a user's buckets with their picks, prices filled and returns computed. */
export async function listBuckets(userId) {
  const buckets = await query('SELECT id, name, created_at FROM buckets WHERE user_id = $1 ORDER BY created_at, name', [userId]);
  const picks = (await query(`SELECT ${PICK_COLUMNS} FROM picks WHERE user_id = $1 ORDER BY added_at`, [userId])).map(toPick);
  const priced = await withPerformance(await fillPrices(picks));
  return buckets.map((b) => summarise({ ...b, created_at: iso(b.created_at) }, priced.filter((p) => p.bucket_id === b.id)));
}

// ------------------------------------------------------------------ writes

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(/[₹,\s]/g, '')));

/**
 * Check a pick's quantity, buy price and buy date. The price is optional: without
 * it, the pick takes the closing price of the buy date (or the next trading day).
 * Returns { quantity, entryPrice, entryDate, priceSource }.
 */
export function parseLot({ quantity, price, date } = {}) {
  const q = num(quantity ?? 1);
  if (!Number.isFinite(q) || q <= 0 || q > 1e9) throw new BucketError('Quantity must be a positive number');
  const pr = num(price);
  if (pr !== null && (!Number.isFinite(pr) || pr <= 0 || pr > 1e8)) throw new BucketError('Buy price must be a positive number');
  const today = istClock().date;
  let d = date ? String(date).slice(0, 10) : null;
  if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) throw new BucketError('Buy date must be a valid date');
  if (d && d > today) throw new BucketError('Buy date can’t be in the future');
  if (d && d < '2000-01-01') throw new BucketError('Buy date must be in 2000 or later');
  if (pr !== null) return { quantity: q, entryPrice: pr, entryDate: d || today, priceSource: 'manual' };
  return { quantity: q, entryPrice: null, entryDate: d || closingDay(), priceSource: 'close' };
}

export async function createBucket(userId, rawName) {
  const name = String(rawName || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 40) throw new BucketError('Bucket name must be 1–40 characters');
  const [{ n }] = await query('SELECT count(*)::int AS n FROM buckets WHERE user_id = $1', [userId]);
  if (n >= MAX_BUCKETS) throw new BucketError(`You can have up to ${MAX_BUCKETS} buckets`);
  try {
    return await queryOne('INSERT INTO buckets (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at', [userId, name]);
  } catch (error) {
    if (error.code === UNIQUE_VIOLATION) throw new BucketError(`You already have a bucket called “${name}”`);
    throw error;
  }
}

export async function renameBucket(userId, bucketId, rawName) {
  const name = String(rawName || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 40) throw new BucketError('Bucket name must be 1–40 characters');
  try {
    const row = await queryOne('UPDATE buckets SET name = $3 WHERE user_id = $1 AND id = $2 RETURNING id, name', [userId, bucketId, name]);
    if (!row) throw new BucketError('Bucket not found', 404);
    return row;
  } catch (error) {
    if (error.code === UNIQUE_VIOLATION) throw new BucketError(`You already have a bucket called “${name}”`);
    throw error;
  }
}

export async function deleteBucket(userId, bucketId) {
  const rows = await query('DELETE FROM buckets WHERE user_id = $1 AND id = $2 RETURNING id', [userId, bucketId]);
  if (!rows.length) throw new BucketError('Bucket not found', 404);
}

/**
 * Add an instrument to a bucket with a quantity and, optionally, the user's buy
 * price and date. Without a price it enters at the close of the buy date (by
 * default the current or next session).
 */
export async function addPick(userId, bucketId, symbol, lot = {}) {
  const { quantity, entryPrice, entryDate, priceSource } = parseLot(lot);
  const bucket = await queryOne('SELECT id FROM buckets WHERE user_id = $1 AND id = $2', [userId, bucketId]);
  if (!bucket) throw new BucketError('Bucket not found', 404);
  const [{ n }] = await query('SELECT count(*)::int AS n FROM picks WHERE bucket_id = $1 AND removed_at IS NULL', [bucketId]);
  if (n >= MAX_OPEN_PICKS) throw new BucketError(`A bucket can hold up to ${MAX_OPEN_PICKS} picks`);
  try {
    return toPick(await queryOne(
      `INSERT INTO picks (bucket_id, user_id, symbol, quantity, entry_date, entry_price, price_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${PICK_COLUMNS}`,
      [bucketId, userId, symbol, quantity, entryDate, entryPrice, priceSource],
    ));
  } catch (error) {
    if (error.code === UNIQUE_VIOLATION) throw new BucketError(`${symbol} is already in this bucket`);
    throw error;
  }
}

/** Change an open pick's quantity, buy price or buy date. */
export async function updatePick(userId, pickId, changes = {}) {
  const pick = await queryOne(`SELECT ${PICK_COLUMNS} FROM picks WHERE user_id = $1 AND id = $2`, [userId, pickId]);
  if (!pick || pick.removed_at) throw new BucketError('Pick not found', 404);
  const merged = {
    quantity: changes.quantity ?? pick.quantity,
    // Keep a typed price unless it's being changed; a closing-price pick stays one unless a price is typed.
    price: changes.price !== undefined ? changes.price : pick.price_source === 'manual' ? pick.entry_price : null,
    date: changes.date ?? (changes.price !== undefined || pick.price_source === 'manual' ? pick.entry_date : null),
  };
  const { quantity, entryPrice, entryDate, priceSource } = parseLot(merged);
  const keepFilled = priceSource === 'close' && entryDate === pick.entry_date && pick.price_source === 'close';
  return toPick(await queryOne(
    `UPDATE picks SET quantity = $3, entry_date = $4, entry_price = $5, price_source = $6
     WHERE user_id = $1 AND id = $2 RETURNING ${PICK_COLUMNS}`,
    [userId, pickId, quantity, entryDate, keepFilled ? pick.entry_price : entryPrice, priceSource],
  ));
}

/**
 * Remove a pick. It exits at the close of the current (or next) session and
 * keeps counting in the bucket's record. A pick removed before it ever
 * entered (same session) is simply deleted.
 */
export async function removePick(userId, pickId) {
  const pick = await queryOne(`SELECT ${PICK_COLUMNS} FROM picks WHERE user_id = $1 AND id = $2`, [userId, pickId]);
  if (!pick || pick.removed_at) throw new BucketError('Pick not found', 404);
  const exitDay = closingDay();
  if (pick.entry_price == null && pick.entry_date >= exitDay) {
    await query('DELETE FROM picks WHERE id = $1', [pickId]);
    return { id: pickId, deleted: true };
  }
  return toPick(await queryOne(
    `UPDATE picks SET removed_at = now(), exit_date = $2 WHERE id = $1 RETURNING ${PICK_COLUMNS}`,
    [pickId, exitDay],
  ));
}

/** Evening job: fill every pending entry and exit across all users. */
export async function fillAllPending() {
  const lastDay = lastFinalDay();
  const picks = await query(
    `SELECT ${PICK_COLUMNS} FROM picks
     WHERE (entry_price IS NULL AND entry_date <= $1) OR (exit_price IS NULL AND exit_date <= $1)`,
    [lastDay],
  );
  await fillPrices(picks.map(toPick));
  return picks.length;
}
