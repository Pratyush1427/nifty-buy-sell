import { isUuid, methodNotAllowed, withUser } from '../../lib/api';
import { createBucket, deleteBucket, listBuckets, renameBucket } from '../../lib/buckets';

/**
 * GET                    the user's buckets, with picks and end-of-day returns
 * POST   { name }        create a bucket
 * PATCH  { id, name }    rename
 * DELETE ?id=            delete a bucket and its picks
 */
export default withUser(async (req, res, userId) => {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ buckets: await listBuckets(userId) });
  }
  if (req.method === 'POST') return res.status(201).json(await createBucket(userId, req.body?.name));
  if (req.method === 'PATCH') {
    if (!isUuid(req.body?.id)) return res.status(404).json({ error: 'Bucket not found' });
    return res.status(200).json(await renameBucket(userId, req.body.id, req.body?.name));
  }
  if (req.method === 'DELETE') {
    if (!isUuid(req.query.id)) return res.status(404).json({ error: 'Bucket not found' });
    await deleteBucket(userId, req.query.id);
    return res.status(200).json({ id: req.query.id, deleted: true });
  }
  return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
});

export const config = { maxDuration: 60 };
