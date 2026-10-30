export function isGroupMember(group, userId) {
  return Boolean(group && userId && Array.isArray(group.members) && group.members.includes(userId));
}

export function canPublishGroupPost(group, userId) {
  return isGroupMember(group, userId);
}

export function canDeleteGroupPost(group, post, userId) {
  if (!group || !post || !userId || post.groupId !== group.id) return false;
  return post.userId === userId || group.ownerId === userId;
}

export function canLeaveGroup(group, userId) {
  return Boolean(group && userId && group.ownerId !== userId && isGroupMember(group, userId));
}
