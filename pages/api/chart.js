import { withUser } from '../../lib/api';
import { getChart } from '../../lib/market';
import { normalizeSymbol } from '../../lib/symbols';

async function handler(req, res, userId) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = normalizeSymbol(req.query.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });

  try {
    const data = await getChart(symbol);
    if (data.error) return res.status(404).json(data);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ error: `Chart data unavailable: ${error.message}` });
  }
}

export default withUser(handler);
