import { loadMl } from '../../lib/market';

/** GET: the ML evaluation report and leaderboard (no market data). */
export default function handler(req, res) {
  try {
    return res.status(200).json({ report: loadMl().report });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
