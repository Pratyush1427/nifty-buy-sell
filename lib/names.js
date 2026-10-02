import { query, queryOne } from './db';

// Display names that match what brokers (Groww, Zerodha, etc.) show. They build
// names from NSE's official securities list, minus "Limited". Yahoo's names
// differ in small ways (and are sometimes ALL CAPS), so NSE's list is the
// source of truth; Yahoo is the fallback for BSE-only stocks and ETFs.
//
// The list lives in the shared market_cache table (servers can't write files
// in production) and in memory, refreshed from NSE once a week.

const LIST_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';
const CACHE_KEY = 'nse:equity_list';
const REFRESH_MS = 7 * 864e5;
const MEMORY_MS = 60 * 60 * 1000; // re-check the database hourly
const TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36';

const state = globalThis.__niftyNames || (globalThis.__niftyNames = { bySymbol: new Map(), checkedAt: 0, loading: null });

function splitCsv(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parse(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [symbol, name, , , , , isin] = splitCsv(line);
    if (symbol && name) map.set(`${symbol}.NS`, { name, isin: isin || null });
  }
  return map;
}

async function download() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(LIST_URL, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`NSE ${r.status}`);
    const text = await r.text();
    if (text.split('\n').length < 1000) throw new Error('unexpectedly short list');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function refresh() {
  const row = await queryOne('SELECT payload, fetched_at FROM market_cache WHERE key = $1', [CACHE_KEY]).catch(() => null);
  if (row) state.bySymbol = parse(row.payload);
  if (row && Date.now() - Number(row.fetched_at) < REFRESH_MS) return;
  try {
    const text = await download();
    state.bySymbol = parse(text);
    await query(
      `INSERT INTO market_cache (key, payload, fetched_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
      [CACHE_KEY, text, Date.now()],
    );
  } catch (e) {
    // NSE sometimes blocks data-centre IPs: keep the saved list, or fall back to Yahoo's names.
    console.warn(`[names] NSE list refresh failed: ${e.message}`);
  }
}

/** Make sure the NSE name list is loaded. Call (and await) before stockIdentity(). */
export function loadNames() {
  if (Date.now() - state.checkedAt < MEMORY_MS) return Promise.resolve();
  if (!state.loading) {
    state.loading = refresh().finally(() => {
      state.checkedAt = Date.now();
      state.loading = null;
    });
  }
  return state.loading;
}

const KEEP_UPPER = /^(?:[A-Z]{1,4}|[A-Z]+&[A-Z]+|[A-Z]\.[A-Z]\.?)$/;

/** "HDFC Bank Limited" -> "HDFC Bank"; "ETERNAL LIMITED" -> "Eternal". */
export function cleanCompanyName(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/[.,]?\s*\b(Limited|Ltd\.?)$/i, '').trim();
  if (s && s === s.toUpperCase() && /[A-Z]{5,}/.test(s)) {
    s = s.split(' ').map((w) => (KEEP_UPPER.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(' ');
  }
  return s;
}

/** Broker-style name and ISIN for a stock. */
export function stockIdentity(symbol, yahooName) {
  const hit = state.bySymbol.get(symbol);
  return {
    name: cleanCompanyName(hit?.name || yahooName || symbol.replace(/\.(NS|BO)$/, '')),
    isin: hit?.isin || null,
  };
}
