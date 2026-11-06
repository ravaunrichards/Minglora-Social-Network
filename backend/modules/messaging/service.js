export const MESSAGE_GROUP_MAX_MEMBERS = 50;
export const MESSAGE_GROUP_NAME_MAX_LENGTH = 80;
export const MESSAGE_GROUP_MESSAGE_MAX_LENGTH = 3000;
export const MESSAGE_GROUP_REACTIONS = Object.freeze(['👍','❤️','😂','😮','😢','🙏','🔥','🎉']);

export function normalizeMessageGroupName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, MESSAGE_GROUP_NAME_MAX_LENGTH);
}

export function normalizeMessageGroupMemberIds(values, ownerId) {
  const input = Array.isArray(values) ? values : [];
  return [...new Set([String(ownerId || ''), ...input.map(value => String(value || '').trim()).filter(Boolean)])]
    .filter(Boolean);
}

export function getActiveMessageGroupMembers(db, groupId) {
  return (db.messageGroupMembers || [])
    .filter(item => item.groupId === groupId && item.status === 'active')
    .map(item => item.userId);
}

export function canAccessMessageGroup(db, groupId, userId) {
  return Boolean((db.messageGroups || []).some(group =>
    group.id === groupId && group.status === 'active'
  ) && (db.messageGroupMembers || []).some(member =>
    member.groupId === groupId && member.userId === userId && member.status === 'active'
  ));
}

export function canManageMessageGroup(db, groupId, userId) {
  return Boolean((db.messageGroupMembers || []).some(member =>
    member.groupId === groupId && member.userId === userId
      && member.status === 'active' && ['owner','admin'].includes(member.role)
  ));
}

export function summarizeGroupReadState(message, memberIds) {
  const required = (Array.isArray(memberIds) ? memberIds : [])
    .filter(id => id && id !== message?.from);
  const readBy = message?.readBy && typeof message.readBy === 'object' ? message.readBy : {};
  const readCount = required.filter(id => Boolean(readBy[id])).length;
  return { readCount, total: required.length, allRead: required.length > 0 && readCount === required.length };
}

export function validateMessageGroupReaction(value) {
  const reaction = String(value || '');
  return MESSAGE_GROUP_REACTIONS.includes(reaction) ? reaction : null;
}

export const MESSAGE_DISAPPEARING_OPTIONS = Object.freeze([0,30,300,3600,86400,604800]);

export function normalizeMessageDisappearingSeconds(value) {
  if (value === null || value === undefined || value === '') return null;
  const seconds = Number(value);
  return Number.isInteger(seconds) && MESSAGE_DISAPPEARING_OPTIONS.includes(seconds) ? seconds : null;
}

export function messageConversationKey({ groupId = '', userIds = [] } = {}) {
  if (groupId) return 'group:' + String(groupId);
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(value => String(value || '').trim()).filter(Boolean))].sort();
  return ids.length === 2 ? 'direct:' + ids.join(':') : '';
}

export function getMessageDisappearingSeconds(db, conversationKey) {
  const row = (db.messageConversationSettings || []).find(item => item.conversationKey === conversationKey);
  return normalizeMessageDisappearingSeconds(row?.disappearingAfterSeconds ?? 0) ?? 0;
}

export function isMessageExpired(message, at = Date.now()) {
  if (!message?.expiresAt) return false;
  const expiresAt = Date.parse(message.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= at;
}
