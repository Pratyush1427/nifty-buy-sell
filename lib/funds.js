import YahooFinance from 'yahoo-finance2';
import { query, queryOne } from './db';

// Indian mutual fund data from mfapi.in, which republishes AMFI's daily NAVs
// with full history. NAVs are published once a day (evening), so caching for
// hours loses nothing.

const MFAPI = 'https://api.mfapi.in/mf';
const FUND_TTL_MS = 6 * 60 * 60 * 1000;
const SEARCH_TTL_MS = 24 * 60 * 60 * 1000;
const BENCH_TTL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 15 * 1000;
// Nifty 50 ETF, dividend-adjusted: a fair stand-in for the Nifty 50 Total
// Return Index that fund returns (which include dividends) should be judged against.
export const FUND_BENCHMARK = { symbol: 'NIFTYBEES.NS', label: 'Nifty 50 (TRI proxy)' };

const yahoo = globalThis.__niftyYahoo
  || (globalThis.__niftyYahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] }));
const memory = globalThis.__niftyFundCache || (globalThis.__niftyFundCache = new Map());

const UPSERT_CACHE = `
  INSERT INTO market_cache (key, payload, fetched_at) VALUES ($1, $2, $3)
  ON CONFLICT (key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at
`;

export const fundCode = (symbol) => {
  const m = /^MF:(\d{3,7})$/.exec(String(symbol || '').toUpperCase());
  return m ? m[1] : null;
};
export const fundSymbol = (code) => `MF:${code}`;

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`mfapi ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Memory -> database -> network, falling back to stale data if the network fails. */
async function cached(key, ttl, load) {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const row = hit ? null : await queryOne('SELECT payload, fetched_at FROM market_cache WHERE key = $1', [key]).catch(() => null);
  if (row && Date.now() - Number(row.fetched_at) < ttl) {
    const data = JSON.parse(row.payload);
    memory.set(key, { data, at: Number(row.fetched_at) });
    return data;
  }
  try {
    const data = await load();
    memory.set(key, { data, at: Date.now() });
    await query(UPSERT_CACHE, [key, JSON.stringify(data), Date.now()]).catch((e) => console.warn(`[funds] cache write for ${key} failed: ${e.message}`));
    return data;
  } catch (error) {
    const stale = hit?.data ?? (row ? JSON.parse(row.payload) : null);
    if (stale) return { ...stale, stale: true };
    throw error;
  }
}

const toIso = (ddmmyyyy) => {
  const [d, m, y] = ddmmyyyy.split('-');
  return `${y}-${m}-${d}`;
};

/** Plan and option from the scheme name, which AMFI doesn't give as fields. */
export function planOf(name) {
  const n = String(name || '').toLowerCase();
  return {
    plan: /direct/.test(n) ? 'Direct' : /regular/.test(n) ? 'Regular' : null,
    option: /idcw|dividend/.test(n) ? 'IDCW' : /growth/.test(n) ? 'Growth' : null,
  };
}

/**
 * The name brokers show: scheme name + plan + option, without AMFI's dashes.
 * "Parag Parikh Flexi Cap Fund - Direct Plan - Growth" -> "Parag Parikh Flexi Cap Fund Direct Growth"
 * "UTI - Nifty Next 50 Index Fund - Direct Plan - Growth" -> "UTI Nifty Next 50 Index Fund Direct Growth"
 */
export function fundDisplayName(schemeName) {
  const { plan, option } = planOf(schemeName);
  const base = String(schemeName || '')
    .split(/\s+-\s+/)
    .filter((part) => !/\b(plan|option|growth|idcw|dividend|payout|reinvest\w*|bonus)\b/i.test(part))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [base || schemeName, plan, option].filter(Boolean).join(' ');
}

/** "Equity Scheme - Flexi Cap Fund" -> { assetClass: "Equity", category: "Flexi Cap" } */
export function categoryOf(raw) {
  const s = String(raw || '');
  const [left, right] = s.includes(' - ') ? s.split(' - ') : ['', s];
  const assetClass = left.replace(/\s*Scheme[s]?\s*$/i, '').trim() || null;
  const category = (right || s).replace(/\s*Fund\s*$/i, '').trim() || null;
  return { assetClass, category };
}

export async function searchFunds(query) {
  const q = query.trim().toLowerCase();
  const list = await cached(`mfsearch:${q}`, SEARCH_TTL_MS, () => fetchJson(`${MFAPI}/search?q=${encodeURIComponent(q)}`));
  // Relevance first (every query word present as a whole word, shorter names
  // = closer match), then Direct-Growth: the cheapest, most comparable class.
  const words = q.split(/\s+/).filter(Boolean);
  const relevance = (name) => {
    const tokens = new Set(name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/));
    return words.filter((w) => tokens.has(w)).length;
  };
  const planRank = (name) => {
    const { plan, option } = planOf(name);
    return (plan === 'Direct' ? 0 : 2) + (option === 'Growth' ? 0 : 1);
  };
  return (Array.isArray(list) ? list : [])
    .map((f) => ({ code: String(f.schemeCode), symbol: fundSymbol(f.schemeCode), name: fundDisplayName(f.schemeName), schemeName: f.schemeName, ...planOf(f.schemeName) }))
    .sort((a, b) => relevance(b.name) - relevance(a.name) || planRank(a.name) - planRank(b.name) || a.name.length - b.name.length)
    .slice(0, 25);
}

/** Full NAV history, oldest first: { meta, navs: [{ t, nav }] }. */
export async function getFund(code) {
  return cached(`mf:${code}`, FUND_TTL_MS, async () => {
    const r = await fetchJson(`${MFAPI}/${code}`);
    if (!r?.meta?.scheme_name || !Array.isArray(r.data) || r.data.length === 0) throw new Error(`No fund with scheme code ${code}`);
    const navs = r.data
      .map((d) => ({ t: toIso(d.date), nav: Number(d.nav) }))
      .filter((d) => d.nav > 0)
      .reverse();
    return { meta: r.meta, navs };
  });
}

function summary(code, fund) {
  const { meta, navs } = fund;
  const last = navs.at(-1);
  const prev = navs.at(-2);
  return {
    symbol: fundSymbol(code),
    code,
    name: fundDisplayName(meta.scheme_name),
    schemeName: meta.scheme_name,
    isin: meta.isin_growth || meta.isin_div_reinvestment || null,
    house: meta.fund_house,
    ...categoryOf(meta.scheme_category),
    ...planOf(meta.scheme_name),
    type: 'MUTUALFUND',
    currency: 'INR',
    price: last?.nav ?? null,
    asOf: last?.t ?? null,
    change: prev ? last.nav - prev.nav : null,
    changePct: prev ? ((last.nav - prev.nav) / prev.nav) * 100 : null,
    stale: Boolean(fund.stale),
  };
}

/** Latest NAV for several funds (portfolio valuation). Failures come back as { error }. */
export async function getFundQuotes(codes) {
  const out = {};
  await Promise.all(codes.map(async (code) => {
    try {
      out[fundSymbol(code)] = summary(code, await getFund(code));
    } catch (error) {
      out[fundSymbol(code)] = { symbol: fundSymbol(code), code, error: error.message };
    }
  }));
  return out;
}

async function benchmarkSeries() {
  return cached(`mfbench:${FUND_BENCHMARK.symbol}`, BENCH_TTL_MS, async () => {
    const r = await yahoo.chart(FUND_BENCHMARK.symbol, { period1: new Date('2005-01-01'), interval: '1d' });
    return (r.quotes || [])
      .filter((q) => (q.adjclose ?? q.close) > 0)
      .map((q) => ({ t: new Date(q.date).toISOString().slice(0, 10), v: q.adjclose ?? q.close }));
  });
}

/** Value on or before date `t` (series sorted ascending by t). */
function valueAt(series, key, t) {
  let lo = 0;
  let hi = series.length - 1;
  let ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) { ans = series[mid][key]; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

const shiftDate = (iso, { months = 0, years = 0 }) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months - years * 12);
  return d.toISOString().slice(0, 10);
};

const PERIODS = [
  { key: '1M', months: 1 }, { key: '3M', months: 3 }, { key: '6M', months: 6 },
  { key: '1Y', years: 1 }, { key: '3Y', years: 3, annualise: true }, { key: '5Y', years: 5, annualise: true },
];

function periodReturn(series, key, endT, p) {
  const startT = shiftDate(endT, p);
  if (series[0].t > startT) return null; // not enough history
  const a = valueAt(series, key, startT);
  const b = valueAt(series, key, endT);
  if (!(a > 0) || !(b > 0)) return null;
  const total = b / a - 1;
  return (p.annualise ? (1 + total) ** (1 / p.years) - 1 : total) * 100;
}

function risk(navs, endT) {
  const startT = shiftDate(endT, { years: 3 });
  const window = navs.filter((d) => d.t >= startT);
  if (window.length < 60) return null;
  const rets = [];
  for (let i = 1; i < window.length; i += 1) rets.push(Math.log(window[i].nav / window[i - 1].nav));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
  let peak = -Infinity;
  let maxDd = 0;
  let ddStart = null;
  let worst = { from: null, to: null };
  for (const d of window) {
    if (d.nav > peak) { peak = d.nav; ddStart = d.t; }
    const dd = d.nav / peak - 1;
    if (dd < maxDd) { maxDd = dd; worst = { from: ddStart, to: d.t }; }
  }
  // Share of rolling 1-year windows (monthly steps) with a positive return.
  let pos = 0;
  let n = 0;
  for (let i = 0; i < navs.length; i += 21) {
    const end = navs[i];
    if (end.t < shiftDate(endT, { years: 2 })) continue;
    const start = valueAt(navs, 'nav', shiftDate(end.t, { years: 1 }));
    if (start > 0 && navs[0].t <= shiftDate(end.t, { years: 1 })) { n += 1; if (end.nav > start) pos += 1; }
  }
  return {
    volatilityPct: sd * Math.sqrt(252) * 100,
    maxDrawdownPct: maxDd * 100,
    drawdownFrom: worst.from,
    drawdownTo: worst.to,
    rolling1yPositivePct: n ? (pos / n) * 100 : null,
    windowYears: 3,
  };
}

/** Everything the fund page shows. */
export async function getFundDetail(code) {
  const fund = await getFund(code);
  const base = summary(code, fund);
  const { navs } = fund;
  const endT = navs.at(-1).t;

  let bench = null;
  try { bench = await benchmarkSeries(); } catch { bench = null; }
  const isEquity = /equity|index|etf|elss|hybrid/i.test(`${fund.meta.scheme_category} ${fund.meta.scheme_name}`);

  const returns = PERIODS.map((p) => {
    const f = periodReturn(navs, 'nav', endT, p);
    const b = bench && isEquity ? periodReturn(bench, 'v', endT, p) : null;
    return { period: p.key, annualised: Boolean(p.annualise), fund: f, benchmark: b, diff: f !== null && b !== null ? f - b : null };
  });
  const years = (new Date(endT) - new Date(navs[0].t)) / (365.25 * 864e5);
  const inception = years >= 1 ? ((navs.at(-1).nav / navs[0].nav) ** (1 / years) - 1) * 100 : null;

  // Chart series: fund NAV and benchmark on shared dates (weekly-ish thinning for long histories).
  const step = navs.length > 1500 ? 3 : 1;
  const points = navs.filter((_, i) => i % step === 0 || i === navs.length - 1).map((d) => ({
    t: d.t,
    nav: d.nav,
    bench: bench && isEquity ? valueAt(bench, 'v', d.t) : null,
  }));

  return {
    ...base,
    scheme: fund.meta.scheme_category,
    schemeType: fund.meta.scheme_type,
    isin: fund.meta.isin_growth || fund.meta.isin_div_reinvestment || null,
    inception: { date: navs[0].t, cagrPct: inception, years },
    returns,
    risk: risk(navs, endT),
    benchmark: bench && isEquity ? { ...FUND_BENCHMARK, available: true } : { ...FUND_BENCHMARK, available: false },
    points,
  };
}
