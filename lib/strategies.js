import { lastCross } from './indicators';

// Each strategy reads the indicator bundle from computeIndicators() and returns
//   { signal: BUY|HOLD|SELL|NO_DATA, reason, score, values }
// BUY/HOLD/SELL are internal codes only; the UI shows them as a model
// outlook: Bullish / Neutral / Bearish (components/ui.js).
// `score` orders the list (higher = more bullish under that strategy) and
// `values` feeds the strategy's table columns. Shared by server and browser.

const RANK = { BUY: 1, HOLD: 0, SELL: -1, NO_DATA: -2, NA: -3 };
const pct = (n) => `${Math.abs(n).toFixed(1)}%`;
const last = (arr) => arr[arr.length - 1] ?? null;
const noData = (reason) => ({ signal: 'NO_DATA', reason, score: RANK.NO_DATA * 1000, values: {} });
// The model doesn't apply to this kind of instrument at all (vs. missing data).
const notApplicable = (reason) => ({ signal: 'NA', reason, score: RANK.NA * 1000, values: {} });
const TYPE_NAMES = { INDEX: 'an index', FUTURE: 'a futures contract', CURRENCY: 'a currency', MUTUALFUND: 'a mutual fund' };
const result = (signal, reason, tiebreak, values) => ({
  signal,
  reason,
  score: RANK[signal] * 1000 + (Number.isFinite(tiebreak) ? tiebreak : 0),
  values,
});
const ago = (n) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} sessions ago`);

export const STRATEGIES = [
  {
    key: 'momentum',
    label: '52W breakout',
    style: 'Trend-following',
    summary: 'Bullish within 2% of the 52-week closing high while above the 20-day EMA. Bearish below the 20-day EMA. Same rules as the Python backtest.',
    overlays: ['ema20', 'high52'],
    columns: [
      { key: 'fromHighPct', label: 'From 52W high', fmt: 'pct', invert: true },
      { key: 'vsTrendPct', label: 'vs 20D EMA', fmt: 'pct', tone: true },
    ],
    evaluate(ind) {
      const price = last(ind.closes);
      const trend = last(ind.ema20);
      const high = ind.high52;
      if (!(price > 0) || !(high > 0)) return noData('Price or 52-week high unavailable.');
      if (!(trend > 0)) return noData('Needs 20+ sessions of history.');
      const fromHighPct = Math.max(0, ((high - price) / high) * 100);
      const vsTrendPct = ((price - trend) / trend) * 100;
      const values = { fromHighPct, vsTrendPct };
      if (price < trend) return result('SELL', `${pct(vsTrendPct)} below its 20-day EMA; momentum has broken.`, vsTrendPct, values);
      if (fromHighPct <= 2) {
        return result('BUY', fromHighPct < 0.05 ? 'At its 52-week high and above trend.' : `Within ${pct(fromHighPct)} of its 52-week high and above trend.`, -fromHighPct, values);
      }
      return result('HOLD', `${pct(fromHighPct)} off the 52-week high, ${pct(vsTrendPct)} above trend.`, -fromHighPct, values);
    },
  },
  {
    key: 'trend',
    label: '50/200 DMA',
    style: 'Trend-following',
    summary: 'Bullish in a confirmed uptrend: price above the 50-day average and the 50-day above the 200-day. Bearish when both are below. Golden and death crosses are flagged.',
    overlays: ['sma50', 'sma200'],
    columns: [
      { key: 'vs50Pct', label: 'vs 50 DMA', fmt: 'pct', tone: true },
      { key: 'spreadPct', label: '50 vs 200 DMA', fmt: 'pct', tone: true },
    ],
    evaluate(ind) {
      const price = last(ind.closes);
      const s50 = last(ind.sma50);
      const s200 = last(ind.sma200);
      if (!(s50 > 0) || !(s200 > 0)) return noData('Needs 200+ sessions of history for the 200-day average.');
      const vs50Pct = ((price - s50) / s50) * 100;
      const spreadPct = ((s50 - s200) / s200) * 100;
      const values = { vs50Pct, spreadPct };
      const cross = lastCross(ind.sma50, ind.sma200, 30);
      const crossNote = cross ? ` ${cross.dir === 'up' ? 'Golden' : 'Death'} cross ${ago(cross.ago)}.` : '';
      if (price > s50 && s50 > s200) return result('BUY', `Uptrend: above the 50 DMA, which is ${pct(spreadPct)} above the 200 DMA.${crossNote}`, spreadPct, values);
      if (price < s50 && s50 < s200) return result('SELL', `Downtrend: below the 50 DMA, which is ${pct(spreadPct)} below the 200 DMA.${crossNote}`, spreadPct, values);
      return result('HOLD', `Mixed: price ${price > s50 ? 'above' : 'below'} the 50 DMA, 50 DMA ${s50 > s200 ? 'above' : 'below'} the 200 DMA.${crossNote}`, spreadPct, values);
    },
  },
  {
    key: 'macd',
    label: 'MACD',
    style: 'Momentum',
    summary: 'MACD (12, 26, 9). Bullish when MACD is above its signal line and above zero. Bearish when it is below both. Recent crossovers are flagged.',
    overlays: ['macdPanel'],
    columns: [
      { key: 'macd', label: 'MACD', fmt: 'num', tone: true },
      { key: 'histPct', label: 'Histogram', fmt: 'pct', tone: true, digits: 2 },
    ],
    evaluate(ind) {
      const price = last(ind.closes);
      const m = last(ind.macd);
      const s = last(ind.macdSignal);
      if (m === null || s === null) return noData('Needs ~35 sessions of history for MACD.');
      const h = m - s;
      const histPct = (h / price) * 100;
      const values = { macd: m, histPct };
      const cross = lastCross(ind.macd, ind.macdSignal, 10);
      const crossNote = cross ? ` ${cross.dir === 'up' ? 'Bullish' : 'Bearish'} crossover ${ago(cross.ago)}.` : '';
      if (h > 0 && m > 0) return result('BUY', `MACD above its signal line and above zero.${crossNote}`, histPct * 10, values);
      if (h < 0 && m < 0) return result('SELL', `MACD below its signal line and below zero.${crossNote}`, histPct * 10, values);
      return result('HOLD', `MACD ${h > 0 ? 'above' : 'below'} its signal line but ${m > 0 ? 'above' : 'below'} zero; unconfirmed.${crossNote}`, histPct * 10, values);
    },
  },
  {
    key: 'rsi',
    label: 'RSI',
    style: 'Mean-reversion',
    summary: 'RSI (14). Bullish when oversold (below 30), on the idea of a bounce. Bearish when overbought (above 70). This is contrarian, so it often disagrees with the trend strategies.',
    overlays: ['rsiPanel'],
    columns: [
      { key: 'rsi', label: 'RSI (14)', fmt: 'num', digits: 1 },
    ],
    evaluate(ind) {
      const r = last(ind.rsi14);
      if (r === null) return noData('Needs 15+ sessions of history for RSI.');
      const values = { rsi: r };
      if (r < 30) return result('BUY', `Oversold: RSI ${r.toFixed(0)} is below 30.`, 50 - r, values);
      if (r > 70) return result('SELL', `Overbought: RSI ${r.toFixed(0)} is above 70.`, 50 - r, values);
      return result('HOLD', `RSI ${r.toFixed(0)} is in the neutral 30–70 range.`, 50 - r, values);
    },
  },
  {
    key: 'bollinger',
    label: 'Bollinger',
    style: 'Mean-reversion',
    summary: 'Bollinger bands (20-day, 2σ). Bullish when the close is below the lower band (stretched down). Bearish above the upper band (stretched up). Contrarian.',
    overlays: ['bb'],
    columns: [
      { key: 'pctB', label: '%B', fmt: 'num', digits: 2 },
      { key: 'widthPct', label: 'Band width', fmt: 'pct', signed: false, digits: 1 },
    ],
    evaluate(ind) {
      const price = last(ind.closes);
      const up = last(ind.bbUpper);
      const lo = last(ind.bbLower);
      const mid = last(ind.bbMid);
      if (up === null || lo === null) return noData('Needs 20+ sessions of history for the bands.');
      const pctB = up === lo ? 0.5 : (price - lo) / (up - lo);
      const values = { pctB, widthPct: ((up - lo) / mid) * 100 };
      if (price < lo) return result('BUY', `Closed ${pct(((lo - price) / lo) * 100)} below the lower band.`, (0.5 - pctB) * 10, values);
      if (price > up) return result('SELL', `Closed ${pct(((price - up) / up) * 100)} above the upper band.`, (0.5 - pctB) * 10, values);
      return result('HOLD', `Inside the bands (%B ${pctB.toFixed(2)}).`, (0.5 - pctB) * 10, values);
    },
  },
];

for (const s of STRATEGIES) s.group = 'rule';
const RULE_KEYS = STRATEGIES.map((s) => s.key);

// ---------------------------------------------------------------- ML models
// Trained offline by the Python pipeline (ml/), which writes one score per
// stock per model. Keys match ml/models.py.

const STALE_ML_DAYS = 4;
const pts = (n) => `${n > 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)} pts`;

const ML_MODELS = [
  { key: 'ensemble', label: 'ML ensemble', style: 'Average of 3 models', blurb: 'The average of the three models below. Averaging usually smooths out each model’s individual mistakes.' },
  { key: 'gbm', label: 'Gradient boosting', style: 'Tree ensemble', blurb: 'Hundreds of small decision trees, each correcting the last. Captures non-linear effects between features.' },
  { key: 'logit', label: 'Logistic regression', style: 'Linear model', blurb: 'Each feature adds or subtracts a fixed amount. Simple, stable and hard to overfit.' },
  { key: 'forest', label: 'Random forest', style: 'Tree ensemble', blurb: 'Many independent trees on random slices of the data, averaged. Robust to noisy features.' },
];

function mlStrategy({ key, label, style, blurb }) {
  return {
    key,
    label,
    style,
    group: 'ml',
    summary: `${blurb} Trained on 16 years of Nifty 200 history to estimate the chance a stock beats the Nifty over the next 20 sessions. Bullish is the top 20% of stocks by that chance and Bearish the bottom 20%.`,
    overlays: ['sma50', 'sma200'],
    columns: [
      { key: 'prob', label: 'P(beat Nifty)', fmt: 'pct', signed: false, digits: 1 },
      { key: 'pctRank', label: 'Percentile', fmt: 'pct', signed: false, digits: 0 },
    ],
    evaluate(ind, results, ctx) {
      const p = ctx?.ml?.[key];
      if (!p) {
        const kind = TYPE_NAMES[ctx?.type];
        if (kind) return notApplicable(`Not applicable to ${kind}. The ML models rank individual stocks by their chance of beating the Nifty.`);
        return noData('No ML score. The models cover Nifty 200 stocks and NSE/BSE holdings with at least a year of price history; scores refresh nightly.');
      }
      const values = { prob: p.prob * 100, pctRank: p.pctRank * 100 };
      const up = p.drivers.filter((d) => d.effect > 0).map((d) => `${d.label} (${pts(d.effect)})`);
      const down = p.drivers.filter((d) => d.effect < 0).map((d) => `${d.label} (${pts(d.effect)})`);
      const why = [up.length && `Helping: ${up.join(', ')}`, down.length && `Hurting: ${down.join(', ')}`].filter(Boolean).join('. ');
      const ageDays = (Date.now() - new Date(`${p.asOf}T00:00:00+05:30`).getTime()) / 864e5;
      const stale = ageDays > STALE_ML_DAYS ? ` Score is from ${p.asOf}; rerun the model.` : '';
      const head = `${(p.prob * 100).toFixed(1)}% chance to beat the Nifty in 20 sessions; ranks above ${Math.round(p.pctRank * 100)}% of Nifty 200 stocks.`
        + (p.inUniverse ? '' : ' (Outside the stocks it was trained on, so less reliable.)');
      const reason = `${head}${why ? ` ${why}.` : ''}${stale}`;
      const tiebreak = p.prob * 100;
      if (p.pctRank > 0.8) return result('BUY', reason, tiebreak, values);
      if (p.pctRank <= 0.2) return result('SELL', reason, tiebreak, values);
      return result('HOLD', reason, tiebreak, values);
    },
  };
}

// ------------------------------------------------------------------ Overall
// One vote each from the five rules and the ML ensemble (not each ML model,
// which would triple-count what is largely the same opinion). Mirrored in
// ml/decisions.py so it is scored on the same test as everything else.
const OVERALL_VOTERS = [...RULE_KEYS, 'ensemble'];

const OVERALL = {
  key: 'overall',
  label: 'Overall',
  style: 'All models vote',
  group: 'overall',
  summary: 'One vote each from the five rules and the ML ensemble. Bullish when bullish votes outnumber bearish ones by 2 or more, Bearish for the reverse, otherwise Neutral. Trend-following and contrarian models often cancel out, so this is the cautious default.',
  overlays: ['sma50', 'sma200'],
  columns: [
    { key: 'votes', label: 'Votes', fmt: 'votes' },
  ],
  evaluate(ind, results) {
    const votes = { BUY: [], HOLD: [], SELL: [] };
    for (const key of OVERALL_VOTERS) {
      const r = results[key];
      if (r && r.signal in votes) votes[r.signal].push(key);
    }
    const counted = votes.BUY.length + votes.HOLD.length + votes.SELL.length;
    if (counted < 3) return noData('Not enough history for most models.');
    const net = votes.BUY.length - votes.SELL.length;
    const values = { votes: { buy: votes.BUY.length, hold: votes.HOLD.length, sell: votes.SELL.length } };
    const names = (keys) => keys.map((k) => STRATEGIES.find((s) => s.key === k).label).join(', ');
    const detail = [
      votes.BUY.length && `Bullish: ${names(votes.BUY)}`,
      votes.SELL.length && `Bearish: ${names(votes.SELL)}`,
    ].filter(Boolean).join(' · ') || 'All neutral';
    if (net >= 2) return result('BUY', `${votes.BUY.length} of ${counted} models lean bullish. ${detail}.`, net, values);
    if (net <= -2) return result('SELL', `${votes.SELL.length} of ${counted} models lean bearish. ${detail}.`, net, values);
    return result('HOLD', `Split vote. ${detail}.`, net, values);
  },
};

STRATEGIES.unshift(OVERALL);
STRATEGIES.push(...ML_MODELS.map(mlStrategy));

export const STRATEGY_GROUPS = [
  { key: 'overall', label: 'Overall' },
  { key: 'rule', label: 'Technical rules' },
  { key: 'ml', label: 'Machine learning' },
];

export const DEFAULT_STRATEGY = 'overall';

export function getStrategy(key) {
  return STRATEGIES.find((s) => s.key === key) || STRATEGIES[0];
}

/** Run every strategy against one instrument's indicators; Overall last, since it reads the others. */
export function evaluateAll(ind, ctx = {}) {
  const results = {};
  for (const s of STRATEGIES) if (s !== OVERALL) results[s.key] = s.evaluate(ind, results, ctx);
  results.overall = OVERALL.evaluate(ind, results, ctx);
  return results;
}
