import { withUser } from '../../lib/api';
import { lastFinalDayFor } from '../../lib/closingDay';
import { GST, IMPORT_DUTY, PURITY_22K, goldCloses } from '../../lib/gold';

const changeSince = (series, daysBack) => {
  const last = series.at(-1);
  const cutoff = new Date(`${last.t}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - daysBack);
  const from = series.find((r) => r.t >= cutoff.toISOString().slice(0, 10));
  return from ? ((last.c / from.c) - 1) * 100 : null;
};

/** GET: estimated Indian gold price per gram (24K and 22K), recent changes and a one-year daily series. */
async function handler(req, res) {
  try {
    const lastDay = lastFinalDayFor('US');
    const all = (await goldCloses()).filter((r) => r.t <= lastDay);
    if (all.length < 2) return res.status(502).json({ error: 'Gold prices are unavailable right now' });
    const last = all.at(-1);
    const prev = all.at(-2);
    res.setHeader('Cache-Control', 'private, max-age=600');
    return res.status(200).json({
      asOf: last.t,
      perGram24k: last.c,
      perGram22k: last.c * PURITY_22K,
      perGram24kWithGst: last.c * (1 + GST),
      intlPerGram: last.intl,
      dayChangePct: ((last.c / prev.c) - 1) * 100,
      change: { '1M': changeSince(all, 30), '6M': changeSince(all, 182), '1Y': changeSince(all, 365) },
      importDuty: IMPORT_DUTY,
      gst: GST,
      history: all.slice(-260).map(({ t, c }) => ({ t, c })),
    });
  } catch (error) {
    return res.status(502).json({ error: `Gold prices are unavailable: ${error.message}` });
  }
}

export default withUser(handler);
