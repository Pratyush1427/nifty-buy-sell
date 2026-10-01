import { query } from './db';

export async function listWatchlist(userId) {
  const rows = await query('SELECT symbol, added_at FROM watchlist WHERE user_id = $1 ORDER BY added_at, symbol', [userId]);
  return rows.map((r) => ({ ...r, added_at: r.added_at.toISOString() }));
}

export async function countWatchlist(userId) {
  const [{ n }] = await query('SELECT count(*)::int AS n FROM watchlist WHERE user_id = $1', [userId]);
  return n;
}

export async function addToWatchlist(userId, symbol) {
  const rows = await query(
    'INSERT INTO watchlist (user_id, symbol) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING symbol',
    [userId, symbol],
  );
  return rows.length > 0;
}

export async function removeFromWatchlist(userId, symbol) {
  return (await query('DELETE FROM watchlist WHERE user_id = $1 AND symbol = $2 RETURNING symbol', [userId, symbol])).length > 0;
}
