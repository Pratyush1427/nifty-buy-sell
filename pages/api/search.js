import { withUser } from '../../lib/api';
import { isUs } from '../../lib/kinds';
import { searchSymbols } from '../../lib/market';

async function handler(req, res, userId) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const q = String(req.query.q || '').trim().slice(0, 50);
  if (q.length < 2) return res.status(200).json([]);
  try {
    // ?market=us for US stocks only, ?market=in for Indian listings only.
    const market = req.query.market;
    const items = await searchSymbols(q);
    return res.status(200).json(market === 'us' ? items.filter((x) => isUs(x.symbol)) : market === 'in' ? items.filter((x) => !isUs(x.symbol)) : items);
  } catch (error) {
    // Search is a convenience; typing the full symbol still works without it.
    return res.status(200).json([]);
  }
}

export default withUser(handler);
