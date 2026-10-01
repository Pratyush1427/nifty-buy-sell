import { BucketError } from './buckets';
import { getUserId } from './currentUser';

export const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

/**
 * API route wrapper: rejects signed-out requests, passes the user's id to the
 * handler, and turns errors into JSON without leaking internals.
 */
export function withUser(handler) {
  return async (req, res) => {
    const userId = await getUserId(req, res);
    if (!userId) return res.status(401).json({ error: 'Please sign in' });
    try {
      return await handler(req, res, userId);
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
