import { withUser } from '../../lib/api';
import { searchSymbols } from '../../lib/market';

async function handler(req, res, userId) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const q = String(req.query.q || '').trim().slice(0, 50);
  if (q.length < 2) return res.status(200).json([]);
  try {
    return res.status(200).json(await searchSymbols(q));
  } catch (error) {
    // Search is a convenience; typing the full symbol still works without it.
    return res.status(200).json([]);
  }
}

export default withUser(handler);
