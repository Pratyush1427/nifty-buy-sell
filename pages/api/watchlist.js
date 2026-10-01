import { methodNotAllowed, withUser } from '../../lib/api';
import { checkSymbol } from '../../lib/instruments';
import { normalizeSymbol } from '../../lib/symbols';
import { addToWatchlist, countWatchlist, listWatchlist, removeFromWatchlist } from '../../lib/watchlist';

const MAX_WATCHLIST = 100;

/**
 * GET                  the user's watchlist
 * POST { symbol }      add (checked against the market feed first)
 * DELETE ?symbol=      remove
 */
export default withUser(async (req, res, userId) => {
  if (req.method === 'GET') return res.status(200).json(await listWatchlist(userId));

  if (req.method === 'POST') {
    const symbol = normalizeSymbol(req.body?.symbol);
    if (!symbol) return res.status(400).json({ error: 'A valid symbol is required' });
    if (await countWatchlist(userId) >= MAX_WATCHLIST) return res.status(400).json({ error: `Watchlist is limited to ${MAX_WATCHLIST} stocks` });
    if ((await checkSymbol(symbol)).unknown) {
      return res.status(400).json({ error: `Unknown symbol: ${symbol}. Check the ticker, or use .BO for BSE-only stocks.` });
    }
    const added = await addToWatchlist(userId, symbol);
    return res.status(added ? 201 : 200).json({ symbol, added });
  }

  if (req.method === 'DELETE') {
    const symbol = normalizeSymbol(req.query.symbol);
    if (!symbol || !(await removeFromWatchlist(userId, symbol))) return res.status(404).json({ error: 'Not on the watchlist' });
    return res.status(200).json({ symbol, removed: true });
  }

  return methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
});
