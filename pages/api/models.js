import { withUser } from '../../lib/api';
import { loadMl } from '../../lib/market';

/** GET: the ML evaluation report and leaderboard (no market data). */
async function handler(req, res, userId) {
  try {
    return res.status(200).json({ report: (await loadMl()).report });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export default withUser(handler);
