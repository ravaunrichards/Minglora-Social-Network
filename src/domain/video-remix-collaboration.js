export const VIDEO_REMIX_POLICIES = Object.freeze(['off', 'everyone', 'followers', 'friends']);
export const VIDEO_COLLABORATION_MAX_PER_POST = 5;

export function normalizeVideoRemixPolicy(value, fallback = 'off') {
  const candidate = value === undefined || value === null ? fallback : value;
  const policy = String(candidate).trim().toLowerCase();
  return VIDEO_REMIX_POLICIES.includes(policy) ? policy : null;
}

export function canRemixVideo(post, viewerId, {
  isVisible = false,
  isBlocked = false,
  isFollowing = false,
  isFriend = false
} = {}) {
  if (!post || !viewerId || !post.userId || viewerId === post.userId || !isVisible || isBlocked) return false;
  const policy = normalizeVideoRemixPolicy(post.remixPolicy, 'off');
  if (policy === 'everyone') return true;
  if (policy === 'followers') return isFollowing === true || isFriend === true;
  if (policy === 'friends') return isFriend === true;
  return false;
}

export function createVideoCollaborationInvite(invites, {
  postId, ownerId, collaboratorId, id, createdAt = new Date().toISOString()
} = {}) {
  if (!Array.isArray(invites) || !postId || !ownerId || !collaboratorId || !id || ownerId === collaboratorId) {
    return { status: 'invalid', invite: null };
  }
  const existing = invites.find(invite =>
    invite?.postId === String(postId) &&
    invite?.collaboratorId === String(collaboratorId) &&
    ['pending', 'accepted'].includes(invite.status)
  );
  if (existing) return { status: 'exists', invite: existing };
  const active = invites.filter(invite =>
    invite?.postId === String(postId) && ['pending', 'accepted'].includes(invite.status)
  );
  if (active.length >= VIDEO_COLLABORATION_MAX_PER_POST) return { status: 'limit', invite: null };
  const timestamp = String(createdAt);
  const invite = {
    id: String(id),
    postId: String(postId),
    ownerId: String(ownerId),
    collaboratorId: String(collaboratorId),
    status: 'pending',
    createdAt: timestamp,
    respondedAt: null
  };
  invites.push(invite);
  return { status: 'created', invite };
}

export function respondToVideoCollaborationInvite(invites, {
  inviteId, collaboratorId, response, respondedAt = new Date().toISOString()
} = {}) {
  if (!Array.isArray(invites) || !inviteId || !collaboratorId || !['accept', 'decline'].includes(response)) {
    return { status: 'invalid', invite: null };
  }
  const invite = invites.find(item => item?.id === String(inviteId));
  if (!invite || invite.collaboratorId !== String(collaboratorId)) return { status: 'not_found', invite: null };
  if (invite.status !== 'pending') return { status: 'conflict', invite };
  invite.status = response === 'accept' ? 'accepted' : 'declined';
  invite.respondedAt = String(respondedAt);
  return { status: invite.status, invite };
}

export function listAcceptedVideoCollaboratorIds(invites, postId) {
  if (!Array.isArray(invites) || !postId) return [];
  return [...new Set(invites
    .filter(invite => invite?.postId === String(postId) && invite.status === 'accepted')
    .map(invite => invite.collaboratorId)
    .filter(Boolean))];
}
