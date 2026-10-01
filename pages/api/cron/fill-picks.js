import { fillAllPending } from '../../../lib/buckets';

/**
 * Evening job (Vercel Cron, weekdays after the close): lock in today's closing
 * prices for every pick that entered or exited today. Reading buckets also
 * fills prices, so this only keeps things tidy for users who don't log in.
 */
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  try {
    return res.status(200).json({ checked: await fillAllPending() });
  } catch (error) {
    console.error('[cron] fill-picks:', error);
    return res.status(500).json({ error: 'Fill failed' });
  }
}
