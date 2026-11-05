const ADMIN_BADGE_EXCLUDED_EMAILS = new Set([
  'larryjones2019ersky@gmail.com'
]);

/**
 * Returns the public profile badge only. This deliberately does not change
 * the user's role or any server-side authorization decisions.
 */
export function getPlatformAdminBadge(user) {
  if (!user) return null;

  const email = String(user.email || '').trim().toLowerCase();
  if (ADMIN_BADGE_EXCLUDED_EMAILS.has(email)) return null;

  return ['platform_owner', 'admin'].includes(String(user.role || ''))
    ? 'admin'
    : null;
}

const VERIFIED_PROFILE_EMAILS = new Set([
  'creatorhubcreatornetwork@gmail.com'
]);

/**
 * Returns the public profile verification sticker. The explicit creator
 * account gets the blue sticker without changing its administrative role.
 */
export function getProfileVerificationBadge(user) {
  if (!user) return null;

  const email = String(user.email || '').trim().toLowerCase();
  if (VERIFIED_PROFILE_EMAILS.has(email)) return 'blue';

  return user.verificationBadge === 'blue' ? 'blue' : null;
}
