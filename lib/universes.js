import db from './db';
import { readSymbolCsv } from './symbols';

/**
 * Each tab on the dashboard. To add one (Bank Nifty, crude, …) add an entry:
 *   benchmark - the headline instrument shown in the top strip and charted by default
 *   csv       - a data/*.csv of constituents, or
 *   symbols   - a fixed list
 */
export const UNIVERSES = [
  {
    key: 'nifty50',
    label: 'Nifty 50',
    benchmark: '^NSEI',
    csv: 'nifty50.csv',
  },
  {
    key: 'nifty200',
    label: 'Nifty 200',
    benchmark: '^CNX200',
    note: 'Top 200 NSE companies by market cap, the universe the ML models are trained on. List refreshed from NSE by the ML pipeline.',
    csv: 'nifty200.csv',
  },
  {
    key: 'sensex',
    label: 'Sensex',
    benchmark: '^BSESN',
    // NSE tickers for the Sensex 30: same companies, deeper liquidity, and
    // they line up with holdings entered as NSE symbols.
    csv: 'sensex.csv',
  },
  {
    key: 'gold',
    label: 'Gold',
    benchmark: 'GC=F',
    note: 'Gold ETFs listed on NSE (₹ per unit) and COMEX gold futures (US$ per troy ounce).',
    symbols: ['GOLDBEES.NS', 'SETFGOLD.NS', 'HDFCGOLD.NS', 'GOLDIETF.NS', 'GOLD1.NS', 'GC=F'],
  },
  {
    key: 'silver',
    label: 'Silver',
    benchmark: 'SI=F',
    note: 'Silver ETFs listed on NSE (₹ per unit) and COMEX silver futures (US$ per troy ounce).',
    symbols: ['SILVERBEES.NS', 'SILVERIETF.NS', 'HDFCSILVER.NS', 'SILVER1.NS', 'SI=F'],
  },
  {
    key: 'watchlist',
    label: 'Watchlist',
    benchmark: '^NSEI',
    inStrip: false, // shares the Nifty 50 benchmark; no separate card
    note: 'Any NSE or BSE stock you follow. Stocks outside the Nifty 200 get ML scores too, but the models learned from large companies, so treat those scores as less reliable.',
    watchlist: true,
  },
];

/** FX rates fetched with every refresh so foreign-currency holdings can be totalled in ₹. */
export const FX_SYMBOLS = { USD: 'USDINR=X' };

export const DEFAULT_UNIVERSE = UNIVERSES[0].key;

export function getUniverse(key) {
  return UNIVERSES.find((u) => u.key === key) || null;
}

const selectWatchlist = db.prepare('SELECT symbol FROM watchlist ORDER BY added_at, symbol');

export function universeSymbols(universe) {
  if (!universe) return [];
  if (universe.watchlist) return selectWatchlist.all().map((r) => r.symbol);
  return universe.csv ? readSymbolCsv(universe.csv) : universe.symbols;
}

/** Every symbol any index tab covers, for "is this stock in a list?" checks. */
export function indexSymbols() {
  return new Set(UNIVERSES.filter((u) => !u.watchlist).flatMap((u) => universeSymbols(u)));
}

/** Tab metadata safe to send to the browser. */
export function publicUniverses() {
  return UNIVERSES.map(({ key, label, benchmark, note }) => ({ key, label, benchmark, note: note || null }));
}
