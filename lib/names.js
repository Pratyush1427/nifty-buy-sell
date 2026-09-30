import fs from 'fs';
import path from 'path';

// Display names that match what brokers (Groww, Zerodha, etc.) show. They build
// names from NSE's official securities list, minus "Limited". Yahoo's names
// differ in small ways (and are sometimes ALL CAPS), so NSE's list is the
// source of truth; Yahoo is the fallback for BSE-only stocks and ETFs.

const LIST_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';
const FILE = path.join(process.cwd(), 'data', 'nse_equity.csv');
const REFRESH_DAYS = 7;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36';

const state = globalThis.__niftyNames || (globalThis.__niftyNames = { bySymbol: null, mtime: 0, refreshing: false });

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

function load() {
  try {
    const { mtimeMs } = fs.statSync(FILE);
    if (state.bySymbol && state.mtime === mtimeMs) return state.bySymbol;
    const lines = fs.readFileSync(FILE, 'utf8').split(/\r?\n/).slice(1);
    const map = new Map();
    for (const line of lines) {
      const [symbol, name, , , , , isin] = splitCsv(line);
      if (symbol && name) map.set(`${symbol}.NS`, { name, isin: isin || null });
    }
    state.bySymbol = map;
    state.mtime = mtimeMs;
  } catch {
    state.bySymbol = state.bySymbol || new Map();
  }
  return state.bySymbol;
}

/** Refresh the NSE list in the background when missing or a week old. */
function refreshIfStale() {
  if (state.refreshing) return;
  let age = Infinity;
  try { age = (Date.now() - fs.statSync(FILE).mtimeMs) / 864e5; } catch { /* missing */ }
  if (age < REFRESH_DAYS) return;
  state.refreshing = true;
  fetch(LIST_URL, { headers: { 'User-Agent': UA } })
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`NSE ${r.status}`))))
    .then((text) => {
      if (text.split('\n').length < 1000) throw new Error('unexpectedly short list');
      fs.writeFileSync(FILE, text);
    })
    .catch((e) => console.warn(`[names] NSE list refresh failed: ${e.message}`))
    .finally(() => { state.refreshing = false; });
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
  refreshIfStale();
  const hit = load().get(symbol);
  return {
    name: cleanCompanyName(hit?.name || yahooName || symbol.replace(/\.(NS|BO)$/, '')),
    isin: hit?.isin || null,
  };
}
