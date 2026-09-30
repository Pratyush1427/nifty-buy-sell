import { getMarket } from '../../lib/market';
import { normalizeSymbol } from '../../lib/symbols';
import { DEFAULT_UNIVERSE } from '../../lib/universes';

const MAX_EXTRA_SYMBOLS = 100;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // `universe` picks the tab; `symbols` adds holdings so they are always priced.
  // universe=held (or any unknown key) returns just the extra symbols.
  const universe = String(req.query.universe || DEFAULT_UNIVERSE);
  const extra = String(req.query.symbols || '')
    .split(',')
    .map(normalizeSymbol)
    .filter(Boolean)
    .slice(0, MAX_EXTRA_SYMBOLS);

  try {
    const data = await getMarket(universe, extra);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ error: `Market data unavailable: ${error.message}` });
  }
}
