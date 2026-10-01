import { isUuid, methodNotAllowed, withUser } from '../../lib/api';
import { addPick, removePick } from '../../lib/buckets';
import { checkSymbol } from '../../lib/instruments';
import { normalizeSymbol } from '../../lib/symbols';

/**
 * POST   { bucketId, symbol }   add an instrument; it enters at today's (or the next) close
 * DELETE ?id=                   remove a pick; it exits at today's (or the next) close
 */
export default withUser(async (req, res, userId) => {
  if (req.method === 'POST') {
    if (!isUuid(req.body?.bucketId)) return res.status(404).json({ error: 'Bucket not found' });
    const symbol = normalizeSymbol(req.body?.symbol);
    if (!symbol) return res.status(400).json({ error: 'A valid symbol is required' });
    const check = await checkSymbol(symbol);
    if (check.unknown) return res.status(400).json({ error: `Unknown symbol: ${symbol}. Check the ticker, or use .BO for BSE-only stocks.` });
    const pick = await addPick(userId, req.body.bucketId, symbol);
    return res.status(201).json({
      ...pick,
      warning: check.unchecked ? `Added, but couldn't verify ${symbol} because the market feed is unavailable.` : null,
    });
  }
  if (req.method === 'DELETE') {
    if (!isUuid(req.query.id)) return res.status(404).json({ error: 'Pick not found' });
    return res.status(200).json(await removePick(userId, req.query.id));
  }
  return methodNotAllowed(res, ['POST', 'DELETE']);
});
