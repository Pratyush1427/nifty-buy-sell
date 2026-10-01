import { safeNext } from '../../../lib/supabase/config';
import { createSupabaseServer } from '../../../lib/supabase/server';

const TYPES = new Set(['email', 'recovery', 'email_change']);

/**
 * Landing point for links in our emails (sign-up confirmation, magic link,
 * password reset). Uses the token hash, so the link works in any browser,
 * not only the one that asked for it.
 */
export default async function handler(req, res) {
  const { token_hash: tokenHash, type } = req.query;
  if (typeof tokenHash !== 'string' || !TYPES.has(type)) return res.redirect(303, '/login?error=link');
  const supabase = createSupabaseServer(req, res);
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return res.redirect(303, '/login?error=link');
  return res.redirect(303, type === 'recovery' ? '/reset-password' : safeNext(req.query.next));
}
