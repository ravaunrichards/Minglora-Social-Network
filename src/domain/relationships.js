export function isBlocked(blocks, actorId, targetId) {
  return blocks.some(b => (b.blockerId === actorId && b.blockedId === targetId) || (b.blockerId === targetId && b.blockedId === actorId));
}
export function areFriends(friendships, firstUserId, secondUserId) {
  if (!firstUserId || !secondUserId || firstUserId === secondUserId) return false;
  return friendships.some(f => f.status === 'accepted' &&
    ((f.requesterId === firstUserId && f.recipientId === secondUserId) || (f.requesterId === secondUserId && f.recipientId === firstUserId)));
}
export function canViewAudience({ audience, viewerId, ownerId, friendships = [], follows = [], blocks = [] }) {
  if (!viewerId || !ownerId) return false;
  if (viewerId === ownerId) return true;
  if (isBlocked(blocks, viewerId, ownerId)) return false;
  switch (audience) {
    case 'public': return true;
    case 'friends': return areFriends(friendships, viewerId, ownerId);
    case 'followers': return follows.some(f => f.followerId === viewerId && f.followedId === ownerId);
    case 'private': default: return false;
  }
}
