import { methodNotAllowed, withUser } from '../../lib/api';
import { supabaseAdmin } from '../../lib/supabase/admin';

/** DELETE { confirm: 'DELETE' } : permanently delete the account and all its buckets, picks and watchlist. */
export default withUser(async (req, res, userId) => {
  if (req.method !== 'DELETE') return methodNotAllowed(res, ['DELETE']);
  if (req.body?.confirm !== 'DELETE') return res.status(400).json({ error: 'Type DELETE to confirm' });
  // Removing the auth user cascades to profiles, buckets, picks and watchlist.
  const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);
  if (error) throw error;
  return res.status(200).json({ deleted: true });
}, { allowWithoutConsent: true });
