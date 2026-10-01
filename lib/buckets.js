import { closingDay, lastFinalDay } from './closingDay';
import { query, queryOne } from './db';
import { fundCode, getFund } from './funds';
import { getHistory } from './market';

// Buckets are a game, not portfolios: each pick is just an instrument, every
// pick counts equally, and prices are end-of-day closes only.

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

/** Attach the latest final close and return % to each pick, and an equal-weighted average to the bucket. */
async function withPerformance(picks) {
  const latest = new Map();
  await Promise.all([...new Set(picks.filter((p) => !p.exit_price && p.entry_price).map((p) => p.symbol))].map(async (symbol) => {
    try {
      const closes = await finalCloses(symbol);
      if (closes.length) latest.set(symbol, closes.at(-1));
    } catch {
      /* shown as "price unavailable" */
    }
  }));

  return picks.map((p) => {
    const last = p.exit_price ? { t: p.exit_date, c: p.exit_price } : latest.get(p.symbol);
    const status = p.removed_at ? 'closed' : p.entry_price ? 'open' : 'pending';
    const returnPct = p.entry_price && last ? ((last.c / p.entry_price) - 1) * 100 : null;
    return { ...p, status, lastClose: last?.c ?? null, lastCloseDate: last?.t ?? null, returnPct };
  });
}

const average = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function summarise(bucket, picks) {
  const counted = picks.filter((p) => p.returnPct != null);
  return {
    ...bucket,
    picks,
    openCount: picks.filter((p) => p.status !== 'closed').length,
    pendingCount: picks.filter((p) => p.status === 'pending').length,
    // Every priced pick counts equally, closed ones included, so dropping a
    // losing pick can't hide it.
    returnPct: average(counted.map((p) => p.returnPct)),
  };
}

// ------------------------------------------------------------------- reads

const PICK_COLUMNS = 'id, bucket_id, symbol, added_at, entry_date, entry_price, removed_at, exit_date, exit_price';
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

/** Add an instrument to a bucket. It enters at the close of the current (or next) session. */
export async function addPick(userId, bucketId, symbol) {
  const bucket = await queryOne('SELECT id FROM buckets WHERE user_id = $1 AND id = $2', [userId, bucketId]);
  if (!bucket) throw new BucketError('Bucket not found', 404);
  const [{ n }] = await query('SELECT count(*)::int AS n FROM picks WHERE bucket_id = $1 AND removed_at IS NULL', [bucketId]);
  if (n >= MAX_OPEN_PICKS) throw new BucketError(`A bucket can hold up to ${MAX_OPEN_PICKS} picks`);
  try {
    return toPick(await queryOne(
      `INSERT INTO picks (bucket_id, user_id, symbol, entry_date) VALUES ($1, $2, $3, $4) RETURNING ${PICK_COLUMNS}`,
      [bucketId, userId, symbol, closingDay()],
    ));
  } catch (error) {
    if (error.code === UNIQUE_VIOLATION) throw new BucketError(`${symbol} is already in this bucket`);
    throw error;
  }
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
