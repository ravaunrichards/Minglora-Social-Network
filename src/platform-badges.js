const CREATOR_HUB_ADMIN_USER_ID = '5b998c21-86b5-4621-ab37-e0808a2657b1';
const CREATOR_HUB_ADMIN_EMAIL = 'creatorhubcreatornetwork@gmail.com';
const SECONDARY_CREATOR_HUB_EMAIL = 'larryjones2019ersky@gmail.com';

/**
 * Public role marker for the one designated Minglora platform-admin account.
 * It is presentation only; server authorization continues to use trusted
 * app_metadata and the MFA-backed session checks in server.js.
 */
export function getPlatformAdminBadge(user) {
  if (!user) return null;
  const email = String(user.email || '').trim().toLowerCase();
  const isPrimaryCreatorHubAccount =
    String(user.id || '') === CREATOR_HUB_ADMIN_USER_ID ||
    email === CREATOR_HUB_ADMIN_EMAIL;
  if (!isPrimaryCreatorHubAccount || email === SECONDARY_CREATOR_HUB_EMAIL) return null;
  return 'admin';
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
