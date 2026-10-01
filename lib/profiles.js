import { queryOne } from './db';

// Avatars are either the photo from the user's Google account or one of a
// few built-in styles; arbitrary image URLs aren't accepted.
export const AVATAR_PRESETS = 8;
const GOOGLE_PHOTO = /^https:\/\/lh\d\.googleusercontent\.com\/[\w\-./=?&%]+$/;

export function validAvatar(value, metadata = {}) {
  if (typeof value !== 'string') return null;
  const m = /^preset:(\d+)$/.exec(value);
  if (m && Number(m[1]) < AVATAR_PRESETS) return value;
  const photo = metadata.avatar_url || metadata.picture;
  if (value === 'google' && GOOGLE_PHOTO.test(photo || '')) return photo;
  if (GOOGLE_PHOTO.test(value) && value === photo) return value;
  return null;
}

export function cleanName(value) {
  const name = String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= 40 ? name : null;
}

/** Sensible defaults for a first visit, from what the sign-in provider gave us. */
function defaults(user) {
  const meta = user.metadata || {};
  const fromEmail = (user.email || '').split('@')[0].replace(/[._-]+/g, ' ');
  const name = cleanName(meta.full_name || meta.name || fromEmail) || 'Player';
  const photo = validAvatar('google', meta);
  const preset = `preset:${[...user.id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_PRESETS}`;
  return { display_name: name, avatar_url: photo || preset };
}

const toProfile = (row, user) => ({
  displayName: row.display_name,
  avatar: row.avatar_url,
  email: user.email,
  googlePhoto: validAvatar('google', user.metadata) || null,
  acceptedTermsAt: row.accepted_terms_at ? row.accepted_terms_at.toISOString() : null,
});

/** The user's profile, created with defaults on first use. */
export async function getProfile(user) {
  const d = defaults(user);
  const row = await queryOne(
    `INSERT INTO profiles (id, display_name, avatar_url) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET id = excluded.id
     RETURNING display_name, avatar_url, accepted_terms_at`,
    [user.id, d.display_name, d.avatar_url],
  );
  return toProfile(row, user);
}

export async function updateProfile(user, { displayName, avatar, acceptTerms = false }) {
  await getProfile(user);
  const row = await queryOne(
    `UPDATE profiles SET
       display_name = coalesce($2, display_name),
       avatar_url = coalesce($3, avatar_url),
       accepted_terms_at = CASE WHEN $4 THEN coalesce(accepted_terms_at, now()) ELSE accepted_terms_at END
     WHERE id = $1
     RETURNING display_name, avatar_url, accepted_terms_at`,
    [user.id, displayName, avatar, acceptTerms],
  );
  return toProfile(row, user);
}
