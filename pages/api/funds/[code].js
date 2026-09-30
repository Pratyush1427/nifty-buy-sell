import { getFundDetail } from '../../../lib/funds';

export default async function handler(req, res) {
  const code = String(req.query.code || '').replace(/^MF:/i, '');
  if (!/^\d{3,7}$/.test(code)) return res.status(400).json({ error: 'A numeric AMFI scheme code is required' });
  try {
    return res.status(200).json(await getFundDetail(code));
  } catch (error) {
    return res.status(/No fund/.test(error.message) ? 404 : 502).json({ error: error.message });
  }
}
