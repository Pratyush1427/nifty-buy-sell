import pg from 'pg';

// Postgres via DATABASE_URL: the local Supabase stack in development
// (npx supabase start), the hosted Supabase database in production.
const DATABASE_URL = process.env.DATABASE_URL;

// Keep DATE columns as 'YYYY-MM-DD' strings. The default turns them into
// Dates at local midnight, which shifts the day in some time zones.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

/**
 * Hosted Postgres needs TLS. node-postgres treats `sslmode=require` in the URL
 * as "verify the certificate chain", which Supabase's pooler certificate fails,
 * so take TLS settings from code instead: encrypted, without chain checks.
 */
function connectionOptions(url) {
  const u = new URL(url);
  if (['localhost', '127.0.0.1', '::1'].includes(u.hostname)) return { connectionString: url };
  u.searchParams.delete('sslmode');
  return { connectionString: u.toString(), ssl: { rejectUnauthorized: false } };
}

function open() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set. For local development run `npx supabase start` and copy .env.example to .env.local.');
  return new pg.Pool({
    ...connectionOptions(DATABASE_URL),
    // Serverless functions each hold their own pool, so keep it small.
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
  });
}

// The schema lives in supabase/migrations and is applied by the Supabase CLI.

// Next.js dev mode re-evaluates modules on every edit; reuse one pool.
const state = globalThis.__niftyDb || (globalThis.__niftyDb = { pool: null });

export function pool() {
  if (!state.pool) state.pool = open();
  return state.pool;
}

/** Run one statement; resolves to the rows. */
export async function query(text, params = []) {
  const { rows } = await pool().query(text, params);
  return rows;
}

/** First row or null. */
export async function queryOne(text, params = []) {
  return (await query(text, params))[0] ?? null;
}

/** Run fn(client) inside a transaction; rolls back if it throws. */
export async function transaction(fn) {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
