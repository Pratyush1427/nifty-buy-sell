export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// Google sign-in shows only once a Google OAuth client is configured in Supabase.
export const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE === 'true';

/** A same-site path to send the user to after sign-in; anything else becomes '/'. */
export function safeNext(next) {
  const s = Array.isArray(next) ? next[0] : next;
  return typeof s === 'string' && s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : '/';
}

/**
 * Where links in auth emails should land. Supabase's default emails verify the
 * link and then redirect here with a one-time code, which /api/auth/callback
 * swaps for a session. (Our own templates in supabase/templates go through
 * /api/auth/confirm instead; they need a custom SMTP sender on the free plan.)
 */
export const authRedirect = (next = '/') =>
  `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
