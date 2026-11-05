const CREATOR_HUB_ADMIN_USER_ID = '5b998c21-86b5-4621-ab37-e0808a2657b1';
const CREATOR_HUB_ADMIN_EMAIL = 'creatorhubcreatornetwork@gmail.com';
const SECONDARY_CREATOR_HUB_EMAIL = 'larryjones2019ersky@gmail.com';

/**
 * Public profile role marker.
 * The two separate Creator Hub accounts never expose administrator status on
 * public profiles; other platform administrators retain their existing marker.
 * Authorization is enforced separately by server-side role and MFA checks.
 */
export function getPlatformAdminBadge(user) {
  if (!user) return null;
  const email = String(user.email || '').trim().toLowerCase();
  const privateCreatorHubAdmin =
    String(user.id || '') === CREATOR_HUB_ADMIN_USER_ID ||
    email === CREATOR_HUB_ADMIN_EMAIL ||
    email === SECONDARY_CREATOR_HUB_EMAIL;
  if (privateCreatorHubAdmin) return null;
  return ['admin', 'platform_owner'].includes(String(user.role || '').toLowerCase())
    ? 'admin'
    : null;
}

const VERIFIED_PROFILE_EMAILS = new Set([
  CREATOR_HUB_ADMIN_EMAIL,
  SECONDARY_CREATOR_HUB_EMAIL
]);

/** Returns the blue verification sticker for the two separate Creator Hub accounts. */
export function getProfileVerificationBadge(user) {
  if (!user) return null;
  const email = String(user.email || '').trim().toLowerCase();
  if (VERIFIED_PROFILE_EMAILS.has(email)) return 'blue';
  return user.verificationBadge === 'blue' ? 'blue' : null;
}
