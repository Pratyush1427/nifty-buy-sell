const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

const SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

/** Currency amount. `currency: null` prints a bare number (for index levels). */
export function money(n, { whole = false, currency = 'INR' } = {}) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '−' : '';
  const prefix = currency === null ? '' : SYMBOLS[currency] ?? `${currency} `;
  return `${sign}${prefix}${(whole ? inrWhole : inr).format(Math.abs(n))}`;
}

/** Price of an instrument: indices and FX rates have no currency symbol. */
export function priceOf(n, stock, opts = {}) {
  const bare = stock?.type === 'INDEX' || stock?.type === 'CURRENCY';
  return money(n, { ...opts, currency: bare ? null : stock?.currency || 'INR' });
}

export function signedMoney(n, opts) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n > 0 ? `+${money(n, opts)}` : money(n, opts);
}

export function percent(n, { signed = true, digits = 2 } = {}) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const sign = n > 0 && signed ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(digits)}%`;
}

export function qty(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '');
}

export function tone(n) {
  if (!Number.isFinite(n) || n === 0) return '';
  return n > 0 ? 'up' : 'down';
}

export function timeAgo(iso) {
  if (!iso) return '';
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function istTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const FRIENDLY = {
  '^NSEI': 'NIFTY 50', '^CNX200': 'NIFTY 200', '^BSESN': 'SENSEX', '^NSEBANK': 'BANK NIFTY',
  'GC=F': 'GOLD (COMEX)', 'SI=F': 'SILVER (COMEX)', 'USDINR=X': 'USD/INR',
};

export const displaySymbol = (s) => FRIENDLY[s] || String(s || '').replace(/\.NS$/, '');
