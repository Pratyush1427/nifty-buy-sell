import { methodNotAllowed, withUser } from '../../../lib/api';
import { ACKNOWLEDGEMENTS } from '../../../lib/consent';
import { cleanName, updateProfile, validAvatar } from '../../../lib/profiles';
import { supabaseAdmin } from '../../../lib/supabase/admin';

/**
 * POST { displayName, avatar, acknowledgements: [...] }
 * Records that the user accepted the terms (timestamped in their profile, and
 * flagged in server-only auth metadata so the app can check it on every request).
 */
export default withUser(async (req, res, userId, user) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = req.body || {};
  const acks = new Set(Array.isArray(body.acknowledgements) ? body.acknowledgements : []);
  if (!ACKNOWLEDGEMENTS.every((a) => acks.has(a.key))) return res.status(400).json({ error: 'Please tick every box to continue' });
  const displayName = cleanName(body.displayName);
  if (!displayName) return res.status(400).json({ error: 'Name must be 1–40 characters' });
  const avatar = body.avatar === undefined ? null : validAvatar(body.avatar, user.metadata);

  const profile = await updateProfile(user, { displayName, avatar, acceptTerms: true });
  const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, {
    app_metadata: { accepted_terms_at: profile.acceptedTermsAt },
  });
  if (error) throw error;
  return res.status(200).json(profile);
}, { allowWithoutConsent: true });
