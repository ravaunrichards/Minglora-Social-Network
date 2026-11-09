export const ACCOUNT_STATUS_LABELS = Object.freeze({
  active: 'Active',
  banned: 'Banned',
  restricted: 'Restricted',
  suspended: 'Suspended',
  deactivated: 'Deactivated',
  deleted: 'Deleted'
});
const ACCOUNT_STATUSES = new Set(Object.keys(ACCOUNT_STATUS_LABELS));
export function normalizeAccountStatus(value) {
  const status = String(value ?? 'active').trim().toLowerCase();
  return ACCOUNT_STATUSES.has(status) ? status : 'active';
}
export function accountStatusLabel(value) {
  return ACCOUNT_STATUS_LABELS[normalizeAccountStatus(value)];
}
export function isActiveRelationshipAccount(account) {
  return Boolean(account) && normalizeAccountStatus(account.status) === 'active';
}
