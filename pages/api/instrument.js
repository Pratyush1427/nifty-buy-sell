import { getInstrument } from '../../lib/market';
import { normalizeSymbol } from '../../lib/symbols';

/** GET ?symbol= : price, history-based signals and every model's verdict for any one stock. */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const symbol = normalizeSymbol(req.query.symbol);
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  try {
    const data = await getInstrument(symbol);
    if (data.error && !data.price) return res.status(404).json(data);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
}
