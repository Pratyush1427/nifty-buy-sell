import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './config';

/**
 * Server-only client with the secret key, for actions a user can't do on
 * their own session: recording consent in their auth metadata and deleting
 * their account. Never import this from browser code.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY is not set');
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
