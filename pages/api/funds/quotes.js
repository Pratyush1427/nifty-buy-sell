import { fundCode, getFundQuotes } from '../../../lib/funds';

/** GET ?symbols=MF:122639,MF:120503 : latest NAV for each fund (portfolio valuation). */
export default async function handler(req, res) {
  const codes = [...new Set(String(req.query.symbols || '').split(',').map(fundCode).filter(Boolean))].slice(0, 100);
  try {
    return res.status(200).json(await getFundQuotes(codes));
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
}
