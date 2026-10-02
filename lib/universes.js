import { listWatchlist } from './watchlist';
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
    key: 'us',
    label: 'US stocks',
    benchmark: '^GSPC',
    benchLabel: 'S&P 500', // the top strip names the index, not the tab
    note: 'About 50 of the largest US companies (Nasdaq and NYSE), priced in US$. In buckets they are valued in ₹ at the day’s USD/INR rate. The ML models are trained on Indian stocks only, so US stocks get rule-based outlooks. Search above for any other US stock.',
    // Roughly the largest US companies by market value; edit freely.
    symbols: ['US:AAPL', 'US:MSFT', 'US:NVDA', 'US:AMZN', 'US:GOOGL', 'US:META', 'US:AVGO', 'US:TSLA', 'US:BRK-B', 'US:LLY', 'US:JPM', 'US:V', 'US:WMT', 'US:XOM', 'US:MA', 'US:UNH', 'US:ORCL', 'US:COST', 'US:HD', 'US:PG', 'US:JNJ', 'US:NFLX', 'US:ABBV', 'US:BAC', 'US:KO', 'US:CRM', 'US:CVX', 'US:AMD', 'US:PLTR', 'US:MRK', 'US:CSCO', 'US:WFC', 'US:PEP', 'US:TMO', 'US:LIN', 'US:ACN', 'US:MCD', 'US:ADBE', 'US:IBM', 'US:ABT', 'US:GE', 'US:NOW', 'US:INTU', 'US:DIS', 'US:QCOM', 'US:TXN', 'US:CAT', 'US:AXP', 'US:GS', 'US:MS'],
  },
  {
    key: 'watchlist',
    label: 'Watchlist',
    benchmark: '^NSEI',
    inStrip: false, // shares the Nifty 50 benchmark; no separate card
    note: 'Any NSE, BSE or US stock you follow. Indian stocks outside the Nifty 200 get ML scores too, but the models learned from large companies, so treat those scores as less reliable.',
    watchlist: true,
  },
];

/** FX rates fetched with every refresh so foreign-currency holdings can be totalled in ₹. */
export const FX_SYMBOLS = { USD: 'USDINR=X' };

export const DEFAULT_UNIVERSE = UNIVERSES[0].key;

export function getUniverse(key) {
  return UNIVERSES.find((u) => u.key === key) || null;
}

/** An index tab's fixed members (no database needed). */
function indexMembers(universe) {
  return universe.csv ? readSymbolCsv(universe.csv) : universe.symbols;
}

/** Members of a tab. The watchlist tab is per user, so it needs the user's id. */
export async function universeSymbols(universe, userId = null) {
  if (!universe) return [];
  if (universe.watchlist) return userId ? (await listWatchlist(userId)).map((r) => r.symbol) : [];
  return indexMembers(universe);
}

/** Every symbol any index tab covers, for "is this stock in a list?" checks. */
export function indexSymbols() {
  return new Set(UNIVERSES.filter((u) => !u.watchlist).flatMap(indexMembers));
}

/** Tab metadata safe to send to the browser. */
export function publicUniverses() {
  return UNIVERSES.map(({ key, label, benchmark, note }) => ({ key, label, benchmark, note: note || null }));
}
