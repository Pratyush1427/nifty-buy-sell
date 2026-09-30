import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'portfolio.db');

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

/** Idempotent schema. Runs on every module load, so a long-running dev server picks up new tables. */
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS holdings (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      shares REAL NOT NULL,
      avg_price REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Last successful market payload per key, so a restart during a Yahoo
    -- outage still serves real (clearly stale) numbers instead of nothing.
    CREATE TABLE IF NOT EXISTS market_cache (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    -- Stocks the user follows that aren't in any index tab.
    CREATE TABLE IF NOT EXISTS watchlist (
      symbol TEXT PRIMARY KEY,
      added_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Written by the Python pipeline (python -m ml.run); read-only here.
    CREATE TABLE IF NOT EXISTS ml_scores (
      symbol TEXT NOT NULL, model TEXT NOT NULL, as_of TEXT NOT NULL, prob REAL NOT NULL,
      pct_rank REAL NOT NULL, drivers TEXT, in_universe INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (symbol, model)
    );
    CREATE TABLE IF NOT EXISTS ml_model (
      id INTEGER PRIMARY KEY CHECK (id = 1), version TEXT NOT NULL, report TEXT NOT NULL, predicted_at TEXT NOT NULL
    );
  `);
}

// Next.js dev mode re-evaluates modules on every edit; reuse one connection.
const db = globalThis.__niftyDb || (globalThis.__niftyDb = open());
migrate(db);

export default db;
