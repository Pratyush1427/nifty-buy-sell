import db from './db';

export const listWatchlist = () => db.prepare('SELECT symbol, added_at FROM watchlist ORDER BY added_at, symbol').all();

export function addToWatchlist(symbol) {
  return db.prepare('INSERT OR IGNORE INTO watchlist (symbol) VALUES (?)').run(symbol).changes > 0;
}

export function removeFromWatchlist(symbol) {
  return db.prepare('DELETE FROM watchlist WHERE symbol = ?').run(symbol).changes > 0;
}
