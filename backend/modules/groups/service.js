const ROLE_RANK = Object.freeze({ member: 0, event_manager: 1, content_manager: 1, moderator: 2, admin: 3, owner: 4 });

const ROLE_PERMISSIONS = Object.freeze({
  member: ['view', 'post', 'comment', 'react', 'report', 'attend_events'],
  event_manager: ['view', 'post', 'comment', 'react', 'report', 'attend_events', 'manage_events'],
  content_manager: ['view', 'post', 'comment', 'react', 'report', 'attend_events', 'manage_announcements', 'moderate_posts'],
  moderator: ['view', 'post', 'comment', 'react', 'report', 'attend_events', 'manage_events', 'manage_announcements', 'moderate_posts', 'moderate_members'],
  admin: ['view', 'post', 'comment', 'react', 'report', 'attend_events', 'manage_events', 'manage_announcements', 'moderate_posts', 'moderate_members', 'manage_settings', 'manage_roles', 'view_analytics'],
  owner: ['view', 'post', 'comment', 'react', 'report', 'attend_events', 'manage_events', 'manage_announcements', 'moderate_posts', 'moderate_members', 'manage_settings', 'manage_roles', 'view_analytics', 'transfer_ownership', 'delete_group']
});

export function isGroupMember(group, userId) {
  return Boolean(group && userId && Array.isArray(group.members) && group.members.includes(userId));
}

export function getGroupRole(group, userId) {
  if (!group || !userId) return null;
  if (group.ownerId === userId) return 'owner';
  const record = (group.memberships || []).find(item => item.userId === userId && item.status !== 'left' && item.status !== 'banned');
  if (record?.role) return record.role;
  return isGroupMember(group, userId) ? 'member' : null;
}

export function canViewGroup(group, userId) {
  if (!group || group.status === 'deleted' || group.status === 'archived') return false;
  const role = getGroupRole(group, userId);
  if (role) return true;
  return group.visibility === 'public' || (group.visibility === 'private' && group.joinApproval !== false && group.discoverable !== false);
}

export function canDiscoverGroup(group) {
  return Boolean(group && group.status !== 'deleted' && group.status !== 'archived' &&
    (group.visibility === 'public' || (group.visibility === 'private' && group.discoverable !== false)));
}

export function canRequestGroupMembership(group, userId) {
  if (!group || !userId || getGroupRole(group, userId) || group.status !== 'active') return false;
  return group.visibility === 'public' || (group.visibility === 'private' && group.discoverable !== false);
}

export function canPublishGroupPost(group, userId) {
  return Boolean(isGroupMember(group, userId) || ['owner', 'admin', 'moderator', 'content_manager', 'event_manager'].includes(getGroupRole(group, userId)));
}

export function canDeleteGroupPost(group, post, userId) {
  if (!group || !post || !userId || post.groupId !== group.id) return false;
  return post.userId === userId || ['owner', 'admin', 'moderator'].includes(getGroupRole(group, userId));
}

export function canModerateGroup(group, userId) {
  return ['owner', 'admin', 'moderator'].includes(getGroupRole(group, userId));
}

export function canManageGroupSettings(group, userId) {
  return ['owner', 'admin'].includes(getGroupRole(group, userId));
}

export function canManageGroupEvents(group, userId) {
  return ['owner', 'admin', 'moderator', 'event_manager'].includes(getGroupRole(group, userId));
}

export function canAssignGroupRole(group, actorId, targetRole) {
  const actorRole = getGroupRole(group, actorId);
  if (!actorRole || !Object.hasOwn(ROLE_RANK, targetRole)) return false;
  if (!['owner', 'admin'].includes(actorRole)) return false;
  if (actorRole === 'admin' && ['owner', 'admin'].includes(targetRole)) return false;
  return true;
}

export function canLeaveGroup(group, userId) {
  return Boolean(group && userId && group.ownerId !== userId && isGroupMember(group, userId));
}

export function groupPermissionSet(role) {
  return [...(ROLE_PERMISSIONS[role] || [])];
}
