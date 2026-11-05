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
