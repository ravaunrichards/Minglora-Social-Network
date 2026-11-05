const BANNED_STATUSES = new Set(['banned','suspended','permanently_banned','permanently-banned','suspended_permanently']);
const HIDDEN_STATUSES = new Set(['deactivated','pending_deletion','deleted']);
function accountStatus(account) { return String(account?.status || 'active').trim().toLowerCase().replace(/\s+/g, '_'); }
export function isAccountBanned(account) { return Boolean(account) && BANNED_STATUSES.has(accountStatus(account)); }
export function isAccountHiddenFromPublic(account) {
  if (!account) return true;
  const status = accountStatus(account);
  return BANNED_STATUSES.has(status) || HIDDEN_STATUSES.has(status);
}
