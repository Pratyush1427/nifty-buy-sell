import { scoreSymbols } from '../../lib/mlScore';
import { normalizeSymbol } from '../../lib/symbols';

/** POST { symbol } : run the ML models on a stock the nightly job doesn't cover. */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const symbol = normalizeSymbol(req.body?.symbol);
  if (!symbol || !/\.(NS|BO)$/.test(symbol)) return res.status(400).json({ error: 'An NSE (.NS) or BSE (.BO) stock symbol is required' });
  try {
    return res.status(200).json(await scoreSymbols([symbol]));
  } catch (error) {
    return res.status(422).json({ error: error.message });
  }
}
