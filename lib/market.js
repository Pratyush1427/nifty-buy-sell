import YahooFinance from 'yahoo-finance2';
import { query, queryOne } from './db';
import { isUs, yahooSymbol } from './kinds';
import { computeIndicators } from './indicators';
import { cleanCompanyName, loadNames, stockIdentity } from './names';
import { evaluateAll } from './strategies';
import { FX_SYMBOLS, UNIVERSES, getUniverse, publicUniverses, universeSymbols } from './universes';

const QUOTE_TTL_MS = 60 * 1000;
const HISTORY_TTL_MS = 30 * 60 * 1000;
const NEGATIVE_TTL_MS = 5 * 60 * 1000; // don't re-ask for a symbol Yahoo just failed on
const REQUEST_TIMEOUT_MS = 12 * 1000;
const HISTORY_CONCURRENCY = 8;
// ~470 sessions: enough for a 52-week high plus a fully warmed-up 200-day
// average across the chart's whole 1-year range.
const HISTORY_DAYS = 700;
const SPARK_POINTS = 60;
const BACKOFF_MIN_MS = 15 * 1000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;

const yahoo = globalThis.__niftyYahoo
  || (globalThis.__niftyYahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] }));

// In-memory cache: key -> { data, fetchedAt, stale } or { error, fetchedAt }. Good
// entries are mirrored to Postgres so a cold start during an outage still has data.
const memory = globalThis.__niftyMarketCache || (globalThis.__niftyMarketCache = new Map());
const inflight = globalThis.__niftyInflight || (globalThis.__niftyInflight = new Map());

// Circuit breaker: after a network-level failure, stop calling Yahoo for a
// while (doubling up to 5 min) and serve saved data instead of hammering it.
const breaker = globalThis.__niftyBreaker || (globalThis.__niftyBreaker = { until: 0, delay: 0, reason: null });


/**
 * Latest ML scores (written by the Python pipeline) as symbol -> model -> score,
 * plus the evaluation report the dashboard shows. Tolerates a pipeline that
 * has never run: no scores, no report.
 */
export async function loadMl() {
  const rows = await query('SELECT * FROM ml_scores');
  const scores = new Map();
  for (const r of rows) {
    if (!scores.has(r.symbol)) scores.set(r.symbol, {});
    scores.get(r.symbol)[r.model] = {
      prob: r.prob,
      pctRank: r.pct_rank,
      asOf: r.as_of,
      inUniverse: Boolean(r.in_universe),
      drivers: JSON.parse(r.drivers || '[]'),
    };
  }
  const meta = await queryOne('SELECT version, report, predicted_at FROM ml_model WHERE id = 1');
  let report = null;
  try { report = meta ? JSON.parse(meta.report) : null; } catch { report = null; }
  if (!report?.models) return { scores, report: null };
  return {
    scores,
    report: {
      version: meta.version,
      trainedAt: report.trained_at,
      predictedAt: meta.predicted_at,
      asOf: rows[0]?.as_of ?? null,
      target: report.target,
      testPeriod: report.test_period,
      trainPeriod: report.train_period,
      symbols: report.symbols,
      models: report.models,
      momentum: report.momentum_baseline,
      leaderboard: report.leaderboard,
      signalRule: report.signal_rule,
    },
  };
}

const UPSERT_CACHE = `
  INSERT INTO market_cache (key, payload, fetched_at) VALUES ($1, $2, $3)
  ON CONFLICT (key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at
`;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function breakerOpen() {
  return Date.now() < breaker.until;
}

function tripBreaker(error) {
  breaker.delay = breaker.delay ? Math.min(breaker.delay * 2, BACKOFF_MAX_MS) : BACKOFF_MIN_MS;
  breaker.until = Date.now() + breaker.delay;
  breaker.reason = error.message;
}

function resetBreaker() {
  breaker.delay = 0;
  breaker.until = 0;
  breaker.reason = null;
}

/** Symbol-level "not found" is Yahoo answering; anything else is the network. */
function isNotFound(error) {
  return /not found|delisted|no data/i.test(error?.message || '');
}

async function remember(key, data) {
  const entry = { data, fetchedAt: Date.now(), stale: false };
  memory.set(key, entry);
  try {
    await query(UPSERT_CACHE, [key, JSON.stringify(data), entry.fetchedAt]);
  } catch (error) {
    console.warn(`[market] cache write for ${key} failed: ${error.message}`);
  }
  return entry;
}

function rememberError(key, error) {
  const prev = memory.get(key);
  // Keep a previous good value around; just note the failure time.
  if (prev?.data) memory.set(key, { ...prev, failedAt: Date.now(), lastError: error });
  else memory.set(key, { error, fetchedAt: Date.now() });
}

/** Last known good value, from memory or the database, flagged as stale. */
async function lastKnown(key) {
  const hit = memory.get(key);
  if (hit?.data) return { data: hit.data, fetchedAt: hit.fetchedAt, stale: true };
  let row = null;
  try {
    row = await queryOne('SELECT payload, fetched_at FROM market_cache WHERE key = $1', [key]);
  } catch (error) {
    console.warn(`[market] cache read for ${key} failed: ${error.message}`);
  }
  if (!row) return null;
  const entry = { data: JSON.parse(row.payload), fetchedAt: Number(row.fetched_at) };
  memory.set(key, entry);
  return { ...entry, stale: true };
}

/** A cached entry that is still fresh (good data within TTL, or a recent failure). */
function fresh(key, ttl) {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.data && Date.now() - hit.fetchedAt < ttl) return { ...hit, stale: false };
  if (hit.data && hit.failedAt && Date.now() - hit.failedAt < NEGATIVE_TTL_MS) return { ...hit, stale: true };
  if (hit.error && Date.now() - hit.fetchedAt < NEGATIVE_TTL_MS) return hit;
  return null;
}

/** Run `fn` once per key at a time; concurrent callers share the promise. */
function once(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------- quotes

function slimQuote(q) {
  const time = q.regularMarketTime instanceof Date ? q.regularMarketTime.toISOString() : q.regularMarketTime ?? null;
  return {
    symbol: q.symbol,
    name: q.longName || q.shortName || q.symbol,
    price: q.regularMarketPrice ?? null,
    prevClose: q.regularMarketPreviousClose ?? null,
    change: q.regularMarketChange ?? null,
    changePct: q.regularMarketChangePercent ?? null,
    currency: q.currency || 'INR',
    type: q.quoteType || null,
    time,
    marketState: q.marketState ?? null,
  };
}

/**
 * Batch-quote everything whose cache has expired in a single Yahoo request.
 * Returns symbol -> { data, fetchedAt, stale } | { error }.
 */
export async function getQuotes(symbols) {
  const out = {};
  const due = [];
  for (const s of symbols) {
    const hit = fresh(`quote:${s}`, QUOTE_TTL_MS);
    if (hit) out[s] = hit;
    else due.push(s);
  }
  if (due.length === 0) return out;

  if (breakerOpen()) {
    for (const s of due) out[s] = (await lastKnown(`quote:${s}`)) || { error: `Market feed paused after errors: ${breaker.reason}` };
    return out;
  }

  try {
    const quotes = await once(`quotes:${due.join(',')}`, () =>
      withTimeout(yahoo.quote(due.map(yahooSymbol), { return: 'array' }), REQUEST_TIMEOUT_MS, 'Quote request'));
    resetBreaker();
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
    for (const s of due) {
      const q = bySymbol.get(yahooSymbol(s));
      // Keyed by our symbol (e.g. US:AMZN), not Yahoo's (AMZN).
      if (q && q.regularMarketPrice > 0) out[s] = await remember(`quote:${s}`, { ...slimQuote(q), symbol: s });
      else {
        rememberError(`quote:${s}`, 'Symbol not found on Yahoo Finance');
        out[s] = (await lastKnown(`quote:${s}`)) || { error: 'Symbol not found on Yahoo Finance' };
      }
    }
  } catch (error) {
    tripBreaker(error);
    for (const s of due) {
      out[s] = (await lastKnown(`quote:${s}`)) || { error: `Live quote unavailable: ${error.message}` };
    }
  }
  return out;
}

// --------------------------------------------------------------- history

const istDay = (d) => new Date(new Date(d).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);

async function fetchHistory(symbol) {
  const result = await withTimeout(
    yahoo.chart(symbol, { period1: new Date(Date.now() - HISTORY_DAYS * 864e5), interval: '1d' }),
    REQUEST_TIMEOUT_MS,
    `History for ${symbol}`,
  );
  return (result.quotes || [])
    .filter((row) => row.close > 0)
    .map((row) => ({ t: istDay(row.date), c: row.close }));
}

export async function getHistory(symbol) {
  const key = `hist:${symbol}`;
  const hit = fresh(key, HISTORY_TTL_MS);
  if (hit) return hit;
  if (breakerOpen()) return (await lastKnown(key)) || { error: `Market feed paused after errors: ${breaker.reason}` };
  try {
    const rows = await once(key, () => fetchHistory(yahooSymbol(symbol)));
    if (rows.length === 0) throw new Error('No price history returned');
    return await remember(key, rows);
  } catch (error) {
    if (!isNotFound(error)) tripBreaker(error);
    rememberError(key, error.message);
    return (await lastKnown(key)) || { error: error.message };
  }
}

// ---------------------------------------------------------------- series

/**
 * Daily closes with today's live price folded in, so the trend and 52-week
 * high reflect the current session rather than yesterday's close.
 */
function mergeLive(history, quote) {
  const rows = history.slice();
  if (!quote?.price || !quote.time) return rows;
  const today = istDay(quote.time);
  const last = rows.at(-1);
  if (last && last.t === today) rows[rows.length - 1] = { t: today, c: quote.price };
  else if (!last || last.t < today) rows.push({ t: today, c: quote.price });
  return rows;
}

function buildStock(symbol, quoteEntry, historyEntry, ml) {
  const quote = quoteEntry?.data;
  const rows = mergeLive(historyEntry?.data || [], quote);
  const ind = computeIndicators(rows.map((r) => r.c));
  const price = quote?.price ?? ind.closes.at(-1) ?? null;

  const isListed = /\.(NS|BO)$/.test(symbol);
  const identity = isListed ? stockIdentity(symbol, quote?.name) : { name: quote?.name || symbol, isin: null };
  return {
    symbol,
    name: identity.name,
    isin: identity.isin,
    exchange: symbol.endsWith('.BO') ? 'BSE' : symbol.endsWith('.NS') ? 'NSE' : null,
    type: quote?.type || null,
    currency: quote?.currency || 'INR',
    price,
    change: quote?.change ?? null,
    changePct: quote?.changePct ?? null,
    prevClose: quote?.prevClose ?? null,
    high52: ind.high52,
    low52: ind.low52,
    // Every strategy's verdict; the browser picks which one to show.
    signals: evaluateAll(ind, { ml: ml?.scores.get(symbol) || null, type: quote?.type || null, foreign: isUs(symbol) }),
    spark: ind.closes.slice(-SPARK_POINTS),
    asOf: quote?.time ?? rows.at(-1)?.t ?? null,
    marketState: quote?.marketState ?? null,
    stale: Boolean(quoteEntry?.stale || historyEntry?.stale),
    error: (!quote && quoteEntry?.error) || (!historyEntry?.data && historyEntry?.error) || null,
  };
}

// ------------------------------------------------------------------ public

/**
 * Everything the dashboard needs in one call:
 *   benchmarks - headline quote for every tab, plus FX
 *   stocks     - the active tab's instruments plus any extra (held) symbols
 */
export async function getMarket(universeKey, extraSymbols = [], userId = null) {
  await loadNames();
  const universe = getUniverse(universeKey);
  const members = await universeSymbols(universe, userId);
  const memberSet = new Set(members);
  // The tab's benchmark gets full signals too (it's what the chart opens on),
  // but isn't counted as a member of the list.
  const symbols = [...new Set([...members, ...extraSymbols, ...(universe ? [universe.benchmark] : [])])];
  const benchmarkSymbols = [...new Set(UNIVERSES.map((u) => u.benchmark))];
  const fxSymbols = Object.values(FX_SYMBOLS);

  const quotes = await getQuotes([...new Set([...benchmarkSymbols, ...fxSymbols, ...symbols])]);
  const histories = await pool(symbols, HISTORY_CONCURRENCY, (s) =>
    (quotes[s]?.error && !quotes[s]?.data ? Promise.resolve(null) : getHistory(s)));

  const ml = await loadMl();
  const stocks = symbols.map((s, i) => ({
    ...buildStock(s, quotes[s], histories[i], ml),
    inUniverse: memberSet.has(s),
  }));

  const benchmarks = UNIVERSES.filter((u) => u.inStrip !== false).map((u) => {
    const q = quotes[u.benchmark];
    return q?.data
      ? { ...q.data, tab: u.key, label: u.label, stale: Boolean(q.stale) }
      : { symbol: u.benchmark, tab: u.key, label: u.label, price: null, error: q?.error || 'Unavailable' };
  });

  const fx = { INR: 1 };
  for (const [ccy, sym] of Object.entries(FX_SYMBOLS)) {
    const rate = quotes[sym]?.data?.price;
    if (rate > 0) fx[ccy] = rate;
  }

  return {
    universe: universe ? { key: universe.key, label: universe.label, benchmark: universe.benchmark, note: universe.note || null } : null,
    universes: publicUniverses(),
    benchmarks,
    fx,
    stocks,
    ml: ml.report,
    feed: breakerOpen()
      ? { status: 'paused', reason: breaker.reason, retryAt: new Date(breaker.until).toISOString() }
      : { status: 'ok' },
    fetchedAt: new Date().toISOString(),
  };
}

/** One instrument with every model's verdict: for stocks outside the current tab. */
export async function getInstrument(symbol) {
  await loadNames();
  const quotes = await getQuotes([symbol]);
  if (quotes[symbol]?.error && !quotes[symbol]?.data) return { symbol, error: quotes[symbol].error };
  const history = await getHistory(symbol);
  return { ...buildStock(symbol, quotes[symbol], history, await loadMl()), inUniverse: false };
}

export async function getChart(symbol) {
  await loadNames();
  const [quotes, history] = await Promise.all([getQuotes([symbol]), getHistory(symbol)]);
  const q = quotes[symbol];
  if (!history.data) return { symbol, error: history.error || 'No price history' };

  const rows = mergeLive(history.data, q?.data);
  const ind = computeIndicators(rows.map((r) => r.c));
  const round = (v) => (v === null ? null : Math.round(v * 10000) / 10000);
  const series = ['ema20', 'sma50', 'sma200', 'bbUpper', 'bbMid', 'bbLower', 'rsi14', 'macd', 'macdSignal', 'macdHist'];
  return {
    symbol,
    name: /\.(NS|BO)$/.test(symbol) ? stockIdentity(symbol, q?.data?.name).name : q?.data?.name || symbol,
    currency: q?.data?.currency || 'INR',
    type: q?.data?.type || null,
    high52: ind.high52,
    points: rows.map((r, i) => {
      const p = { t: r.t, close: r.c };
      for (const k of series) p[k] = round(ind[k][i]);
      return p;
    }),
    stale: Boolean(history.stale || q?.stale),
  };
}

// Mutual funds are searched via AMFI (lib/funds.js); Yahoo's fund IDs (0P000…) aren't useful here.
const SEARCH_TYPES = new Set(['EQUITY', 'ETF', 'INDEX', 'FUTURE', 'CURRENCY']);
// Nasdaq (NMS, NGM, NCM), NYSE (NYQ), NYSE American (ASE), NYSE Arca (PCX), Cboe BZX (BTS).
const US_EXCHANGES = new Set(['NMS', 'NGM', 'NCM', 'NYQ', 'ASE', 'PCX', 'BTS']);

/** Symbol autocomplete. Indian listings first, then everything else. */
export async function searchSymbols(query) {
  await loadNames();
  const key = `search:${query.toLowerCase()}`;
  const hit = fresh(key, HISTORY_TTL_MS);
  if (hit?.data) return hit.data.filter((x) => SEARCH_TYPES.has(x.type));
  if (breakerOpen()) return [];

  const result = await once(key, () => withTimeout(
    yahoo.search(query, { quotesCount: 12, newsCount: 0 }),
    REQUEST_TIMEOUT_MS,
    'Search',
  ));
  // NSE/BSE first, then US stocks; other countries' listings are left out.
  const toOurs = (x) => (/\.(NS|BO)$/.test(x.symbol) || x.symbol.startsWith('^') || x.symbol.includes('=') ? x.symbol
    : US_EXCHANGES.has(x.exchange) && x.quoteType === 'EQUITY' ? `US:${x.symbol}` : null);
  const rank = (s) => (s.endsWith('.NS') ? 0 : s.endsWith('.BO') ? 1 : isUs(s) ? 2 : 3);
  const items = (result.quotes || [])
    .filter((x) => x.symbol && SEARCH_TYPES.has(x.quoteType) && toOurs(x))
    .map((x) => {
      const symbol = toOurs(x);
      return {
        symbol,
        name: /\.(NS|BO)$/.test(symbol) ? stockIdentity(symbol, x.longname || x.shortname).name : cleanCompanyName(x.longname || x.shortname || x.symbol),
        exchange: symbol.endsWith('.NS') ? 'NSE' : symbol.endsWith('.BO') ? 'BSE' : isUs(symbol) ? `${x.exchDisp || 'US'} · USD` : x.exchDisp || x.exchange,
        type: x.quoteType,
      };
    })
    .sort((a, b) => rank(a.symbol) - rank(b.symbol))
    .slice(0, 8);
  memory.set(key, { data: items, fetchedAt: Date.now() });
  return items;
}
