import { safeNext } from '../../../lib/supabase/config';
import { createSupabaseServer } from '../../../lib/supabase/server';

/** Return point after "Continue with Google": swaps the one-time code for a session. */
export default async function handler(req, res) {
  const { code } = req.query;
  if (typeof code !== 'string') return res.redirect(303, '/login?error=oauth');
  const supabase = createSupabaseServer(req, res);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return res.redirect(303, '/login?error=oauth');
  return res.redirect(303, safeNext(req.query.next));
}
