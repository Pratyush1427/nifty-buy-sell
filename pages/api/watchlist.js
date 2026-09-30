import { fundCode, getFundQuotes } from '../../lib/funds';
import { getQuotes } from '../../lib/market';
import { scoreInBackground } from '../../lib/mlScore';
import { normalizeSymbol } from '../../lib/symbols';
import { addToWatchlist, listWatchlist, removeFromWatchlist } from '../../lib/watchlist';

const MAX_WATCHLIST = 100;

/**
 * GET                  list
 * POST { symbol }      add (checked against Yahoo first; ML-scored in the background)
 * DELETE ?symbol=      remove
 */
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return res.status(200).json(listWatchlist());

    if (req.method === 'POST') {
      const symbol = normalizeSymbol(req.body?.symbol);
      if (!symbol) return res.status(400).json({ error: 'A valid symbol is required' });
      if (listWatchlist().length >= MAX_WATCHLIST) return res.status(400).json({ error: `Watchlist is limited to ${MAX_WATCHLIST} stocks` });
      const code = fundCode(symbol);
      const q = code
        ? await getFundQuotes([code]).then((r) => (r[symbol].error ? { error: 'not found' } : { data: r[symbol] }))
        : (await getQuotes([symbol]))[symbol];
      if (!q?.data && /not found/i.test(q?.error || '')) {
        return res.status(400).json({ error: `Unknown symbol: ${symbol}. Check the ticker, or use .BO for BSE-only stocks.` });
      }
      const added = addToWatchlist(symbol);
      if (added) scoreInBackground([symbol]);
      return res.status(added ? 201 : 200).json({ symbol, added });
    }

    if (req.method === 'DELETE') {
      const symbol = normalizeSymbol(req.query.symbol);
      if (!symbol || !removeFromWatchlist(symbol)) return res.status(404).json({ error: 'Not on the watchlist' });
      return res.status(200).json({ symbol, removed: true });
    }

    res.setHeader('Allow', 'GET,POST,DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
