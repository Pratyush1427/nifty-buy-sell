import { fundCode, getFundQuotes } from './funds';
import { GOLD, isGold } from './kinds';
import { getQuotes } from './market';

/**
 * Confirm an instrument exists before saving it, so a typo doesn't become a
 * pick that never gets a price. If the feed itself is down we still allow it
 * and say it couldn't be checked.
 * Returns { ok, name } | { unknown: true } | { ok, unchecked: true }.
 */
export async function checkSymbol(symbol) {
  if (isGold(symbol)) return { ok: true, name: GOLD.name };
  const code = fundCode(symbol);
  const q = code
    ? await getFundQuotes([code]).then((r) => (r[symbol].error
      ? { error: /No fund/.test(r[symbol].error) ? 'not found' : r[symbol].error }
      : { data: r[symbol] }))
    : (await getQuotes([symbol]))[symbol];
  if (q?.data) return { ok: true, name: q.data.name || symbol };
  if (/not found/i.test(q?.error || '')) return { unknown: true };
  return { ok: true, unchecked: true };
}
