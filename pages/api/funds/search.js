import { searchFunds } from '../../../lib/funds';

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim().slice(0, 60);
  if (q.length < 2) return res.status(200).json([]);
  try {
    return res.status(200).json(await searchFunds(q));
  } catch (error) {
    return res.status(502).json({ error: `Fund search unavailable: ${error.message}` });
  }
}
