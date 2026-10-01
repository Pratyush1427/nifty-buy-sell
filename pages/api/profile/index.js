import { methodNotAllowed, withUser } from '../../../lib/api';
import { cleanName, getProfile, updateProfile, validAvatar } from '../../../lib/profiles';

/**
 * GET                        the signed-in user's profile
 * PATCH { displayName, avatar }
 */
export default withUser(async (req, res, _userId, user) => {
  if (req.method === 'GET') return res.status(200).json(await getProfile(user));
  if (req.method === 'PATCH') {
    const body = req.body || {};
    const displayName = body.displayName === undefined ? null : cleanName(body.displayName);
    const avatar = body.avatar === undefined ? null : validAvatar(body.avatar, user.metadata);
    if (body.displayName !== undefined && !displayName) return res.status(400).json({ error: 'Name must be 1–40 characters' });
    if (body.avatar !== undefined && !avatar) return res.status(400).json({ error: 'Pick one of the avatars shown' });
    return res.status(200).json(await updateProfile(user, { displayName, avatar }));
  }
  return methodNotAllowed(res, ['GET', 'PATCH']);
}, { allowWithoutConsent: true });
