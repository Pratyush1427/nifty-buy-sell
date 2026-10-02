import { getHistory } from './market';

// Indian gold price per gram, estimated from public data:
//   COMEX gold (USD per troy ounce)  ×  USD/INR  ÷  31.1035 g per ounce  ×  (1 + import duty)
// There's no free official feed for Indian or digital gold rates, so this is an
// estimate: it's before 3% GST, and jewellers' and digital gold apps add their
// own spreads. Update IMPORT_DUTY if the Union Budget changes it.

export const IMPORT_DUTY = 0.06; // basic customs duty + AIDC on gold, since Budget July 2024
export const GST = 0.03;
const GRAMS_PER_OUNCE = 31.1034768;
export const PURITY_22K = 22 / 24;

/** Value on or before date `t` in an ascending [{ t, c }] series. */
function onOrBefore(series, t) {
  let lo = 0;
  let hi = series.length - 1;
  let ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) { ans = series[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** USD/INR daily closes, oldest first. */
export async function fxCloses() {
  const fx = await getHistory('USDINR=X');
  if (!fx?.data) throw new Error(fx?.error || 'No USD/INR history');
  return fx.data;
}

/** USD/INR on or before a date (falls back to the earliest known rate). */
export function fxOn(fx, day) {
  return (onOrBefore(fx, day) || fx[0])?.c ?? null;
}

/**
 * Daily 24K gold price in ₹ per gram, oldest first: [{ t, c, intl }], where `c`
 * includes import duty (before GST) and `intl` is the international price in ₹.
 */
export async function goldCloses() {
  const [gold, fx] = await Promise.all([getHistory('GC=F'), fxCloses()]);
  if (!gold?.data) throw new Error(gold?.error || 'No gold price history');
  return gold.data
    .map((g) => {
      const rate = fxOn(fx, g.t);
      if (!rate) return null;
      const intl = (g.c * rate) / GRAMS_PER_OUNCE;
      return { t: g.t, c: intl * (1 + IMPORT_DUTY), intl };
    })
    .filter(Boolean);
}
