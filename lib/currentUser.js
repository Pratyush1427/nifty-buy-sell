import { createSupabaseServer } from './supabase/server';

/**
 * The signed-in user for this request, from the Supabase session cookie
 * (the token's signature is verified), or null if signed out.
 * Returns { id, email, acceptedTerms, metadata }.
 */
export async function getCurrentUser(req, res) {
  const supabase = createSupabaseServer(req, res);
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return {
    id: claims.sub,
    email: claims.email ?? null,
    // app_metadata can only be written with the secret key, so users can't
    // mark themselves as having accepted the terms.
    acceptedTerms: Boolean(claims.app_metadata?.accepted_terms_at),
    metadata: claims.user_metadata ?? {},
  };
}
