// Phase 1 placeholder until Supabase sign-in lands (Phase 2): in development
// only, requests act as DEV_USER_ID, or as the user in an `x-dev-user` header
// (for testing that users can't see each other's data). In production this
// returns null, so every API route answers 401.
export async function getUserId(req) {
  if (process.env.NODE_ENV === 'production' || !process.env.DEV_USER_ID) return null;
  return req.headers['x-dev-user'] || process.env.DEV_USER_ID;
}
