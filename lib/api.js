import { BucketError } from './buckets';
import { getCurrentUser } from './currentUser';

export const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

/**
 * API route wrapper: rejects signed-out requests and users who haven't yet
 * accepted the terms, passes the user's id (and the user) to the handler, and
 * turns errors into JSON without leaking internals.
 * Options: { allowWithoutConsent } for the routes that record consent.
 */
export function withUser(handler, { allowWithoutConsent = false } = {}) {
  return async (req, res) => {
    const user = await getCurrentUser(req, res);
    if (!user) return res.status(401).json({ error: 'Please sign in' });
    if (!user.acceptedTerms && !allowWithoutConsent) {
      return res.status(403).json({ error: 'Please accept the terms to continue', code: 'terms' });
    }
    try {
      return await handler(req, res, user.id, user);
    } catch (error) {
      if (error instanceof BucketError) return res.status(error.status).json({ error: error.message });
      console.error(`[api] ${req.method} ${req.url}:`, error);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  };
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(','));
  return res.status(405).json({ error: 'Method not allowed' });
}
