// Technical indicators over a series of daily closes. Every function returns an
// array aligned with the input, with null where there isn't enough history yet.
// Pure maths, no Node imports: shared by the server and the browser.

export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** EMA seeded with the SMA of the first `span` values, so early points aren't skewed. */
export function ema(values, span) {
  const out = new Array(values.length).fill(null);
  const start = values.findIndex((v) => v !== null && v !== undefined);
  if (start < 0 || values.length - start < span) return out;
  const k = 2 / (span + 1);
  let prev = 0;
  for (let i = start; i < start + span; i += 1) prev += values[i];
  prev /= span;
  out[start + span - 1] = prev;
  for (let i = start + span; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(values, n = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i += 1) {
    const d = values[i] - values[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= n;
  loss /= n;
  const at = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  out[n] = at();
  for (let i = n + 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = at();
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signalSpan = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => (f[i] !== null && s[i] !== null ? f[i] - s[i] : null));
  const signal = ema(line, signalSpan);
  const hist = line.map((m, i) => (m !== null && signal[i] !== null ? m - signal[i] : null));
  return { line, signal, hist };
}

export function bollinger(values, n = 20, k = 2) {
  const mid = sma(values, n);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = n - 1; i < values.length; i += 1) {
    let v = 0;
    for (let j = i - n + 1; j <= i; j += 1) v += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(v / n);
    upper[i] = mid[i] + k * sd;
    lower[i] = mid[i] - k * sd;
  }
  return { mid, upper, lower };
}

/** Sessions since `a` last crossed `b` (positive = crossed up), within `lookback`. */
export function lastCross(a, b, lookback) {
  const end = a.length - 1;
  for (let i = end; i > Math.max(0, end - lookback); i -= 1) {
    if ([a[i], b[i], a[i - 1], b[i - 1]].some((v) => v === null || v === undefined)) return null;
    const now = a[i] - b[i];
    const before = a[i - 1] - b[i - 1];
    if (now > 0 && before <= 0) return { dir: 'up', ago: end - i };
    if (now < 0 && before >= 0) return { dir: 'down', ago: end - i };
  }
  return null;
}

/** Every series any strategy or chart needs, computed once per instrument. */
export function computeIndicators(closes, { highLookback = 252 } = {}) {
  const m = macd(closes);
  const bb = bollinger(closes);
  const window = closes.slice(-highLookback);
  return {
    closes,
    ema20: ema(closes, 20),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    rsi14: rsi(closes, 14),
    macd: m.line,
    macdSignal: m.signal,
    macdHist: m.hist,
    bbUpper: bb.upper,
    bbMid: bb.mid,
    bbLower: bb.lower,
    high52: window.length ? Math.max(...window) : null,
    low52: window.length ? Math.min(...window) : null,
  };
}
