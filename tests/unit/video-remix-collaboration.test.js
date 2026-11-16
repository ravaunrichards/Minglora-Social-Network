import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDEO_COLLABORATION_MAX_PER_POST,
  canRemixVideo,
  createVideoCollaborationInvite,
  listAcceptedVideoCollaboratorIds,
  normalizeVideoRemixPolicy,
  respondToVideoCollaborationInvite
} from '../../src/domain/video-remix-collaboration.js';

const post = { id: 'video-1', userId: 'creator-1', remixPolicy: 'everyone' };

test('remix permission is policy-driven and never bypasses visibility, blocks or self-remix checks', () => {
  assert.equal(normalizeVideoRemixPolicy(' FRIENDS '), 'friends');
  assert.equal(normalizeVideoRemixPolicy('unknown'), null);
  assert.equal(canRemixVideo(post, 'viewer-1', { isVisible: true }), true);
  assert.equal(canRemixVideo(post, 'viewer-1', { isVisible: false }), false);
  assert.equal(canRemixVideo(post, 'viewer-1', { isVisible: true, isBlocked: true }), false);
  assert.equal(canRemixVideo(post, 'creator-1', { isVisible: true }), false);
  assert.equal(canRemixVideo({ ...post, remixPolicy: 'off' }, 'viewer-1', { isVisible: true }), false);
  assert.equal(canRemixVideo({ ...post, remixPolicy: 'followers' }, 'viewer-1', { isVisible: true }), false);
  assert.equal(canRemixVideo({ ...post, remixPolicy: 'followers' }, 'viewer-1', { isVisible: true, isFollowing: true }), true);
  assert.equal(canRemixVideo({ ...post, remixPolicy: 'friends' }, 'viewer-1', { isVisible: true, isFollowing: true }), false);
  assert.equal(canRemixVideo({ ...post, remixPolicy: 'friends' }, 'viewer-1', { isVisible: true, isFriend: true }), true);
});

test('collaboration invitations are idempotent, consent-based and capped', () => {
  const invites = [];
  const first = createVideoCollaborationInvite(invites, {
    postId: 'video-1', ownerId: 'creator-1', collaboratorId: 'friend-1', id: 'invite-1'
  });
  assert.equal(first.status, 'created');
  assert.equal(first.invite.status, 'pending');
  assert.equal(createVideoCollaborationInvite(invites, {
    postId: 'video-1', ownerId: 'creator-1', collaboratorId: 'friend-1', id: 'duplicate'
  }).status, 'exists');
  assert.equal(respondToVideoCollaborationInvite(invites, {
    inviteId: 'invite-1', collaboratorId: 'stranger', response: 'accept'
  }).status, 'not_found');
  assert.equal(respondToVideoCollaborationInvite(invites, {
    inviteId: 'invite-1', collaboratorId: 'friend-1', response: 'accept'
  }).status, 'accepted');
  assert.deepEqual(listAcceptedVideoCollaboratorIds(invites, 'video-1'), ['friend-1']);
  assert.equal(respondToVideoCollaborationInvite(invites, {
    inviteId: 'invite-1', collaboratorId: 'friend-1', response: 'decline'
  }).status, 'conflict');
  for (let i = 2; i <= VIDEO_COLLABORATION_MAX_PER_POST; i += 1) {
    assert.equal(createVideoCollaborationInvite(invites, {
      postId: 'video-1', ownerId: 'creator-1', collaboratorId: 'friend-' + i, id: 'invite-' + i
    }).status, 'created');
  }
  assert.equal(createVideoCollaborationInvite(invites, {
    postId: 'video-1', ownerId: 'creator-1', collaboratorId: 'friend-over-limit', id: 'invite-over'
  }).status, 'limit');
});

test('invites cannot be created for self and only a pending invitation can be declined', () => {
  const invites = [];
  assert.equal(createVideoCollaborationInvite(invites, {
    postId: 'video-1', ownerId: 'creator-1', collaboratorId: 'creator-1', id: 'self'
  }).status, 'invalid');
  createVideoCollaborationInvite(invites, {
    postId: 'video-1', ownerId: 'creator-1', collaboratorId: 'friend-1', id: 'invite-1'
  });
  assert.equal(respondToVideoCollaborationInvite(invites, {
    inviteId: 'invite-1', collaboratorId: 'friend-1', response: 'decline'
  }).status, 'declined');
  assert.deepEqual(listAcceptedVideoCollaboratorIds(invites, 'video-1'), []);
});
