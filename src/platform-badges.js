const CREATOR_HUB_ADMIN_USER_ID = '5b998c21-86b5-4621-ab37-e0808a2657b1';
const CREATOR_HUB_ADMIN_EMAIL = 'creatorhubcreatornetwork@gmail.com';
const SECONDARY_CREATOR_HUB_USER_ID = '28e1df97-3fe1-488e-bb84-bdc353c58653';
const SECONDARY_CREATOR_HUB_EMAIL = 'larryjones2019ersky@gmail.com';

/**
 * Public profile role marker.
 * The designated Creator Hub owner may see the Admin badge on their own profile,
 * but it is never sent to another viewer. Larry's separate testing account is
 * never treated as platform staff. Authorization remains server-side.
 */
export function getPlatformAdminBadge(user, viewerId = null) {
  if (!user) return null;
  const id = String(user.id || '');
  const email = String(user.email || '').trim().toLowerCase();
  const role = String(user.role || '').trim().toLowerCase();

  const isSecondaryTestAccount =
    id === SECONDARY_CREATOR_HUB_USER_ID || email === SECONDARY_CREATOR_HUB_EMAIL;
  if (isSecondaryTestAccount) return null;

  const isDesignatedCreatorHubAdmin =
    id === CREATOR_HUB_ADMIN_USER_ID &&
    email === CREATOR_HUB_ADMIN_EMAIL &&
    role === 'platform_owner';

  if (isDesignatedCreatorHubAdmin) {
    return String(viewerId || '') === id ? 'admin' : null;
  }

  return ['admin', 'platform_owner'].includes(role) ? 'admin' : null;
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
