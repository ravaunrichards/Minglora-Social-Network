import test from 'node:test';
import assert from 'node:assert/strict';
import { disconnectBlockedConnections } from '../../backend/modules/relationships/blocks.js';

test('blocking either side disconnects direct follows, friends, list memberships, page follows, and profile presence', () => {
  const at = '2026-11-11T12:00:00.000Z';
  const state = {
    follows: [
      { followerId: 'alice', followedId: 'bob' },
      { followerId: 'bob', followedId: 'alice' },
      { followerId: 'alice', followedId: 'carol' }
    ],
    friendships: [
      { from: 'alice', to: 'bob', status: 'accepted' },
      { from: 'carol', to: 'alice', status: 'accepted' }
    ],
    friendPreferences: [
      { ownerId: 'alice', targetId: 'bob', isFavorite: true },
      { ownerId: 'bob', targetId: 'alice', isCloseFriend: true },
      { ownerId: 'alice', targetId: 'carol', isFavorite: true }
    ],
    friendLists: [
      { id: 'alice-list', ownerId: 'alice', memberIds: ['bob', 'carol'], memberCount: 2 },
      { id: 'bob-list', ownerId: 'bob', memberIds: ['alice'], memberCount: 1 },
      { id: 'carol-list', ownerId: 'carol', memberIds: ['alice'], memberCount: 1 }
    ],
    pages: [
      { id: 'alice-page', createdBy: 'alice' },
      { id: 'bob-page', createdBy: 'bob' },
      { id: 'carol-page', createdBy: 'carol' }
    ],
    pageFollows: [
      { pageId: 'alice-page', userId: 'bob' },
      { pageId: 'bob-page', userId: 'alice' },
      { pageId: 'carol-page', userId: 'alice' },
      { pageId: 'alice-page', userId: 'carol' }
    ],
    profileViewPresence: [
      { targetUserId: 'alice', viewerUserId: 'bob' },
      { targetUserId: 'bob', viewerUserId: 'alice' },
      { targetUserId: 'alice', viewerUserId: 'carol' }
    ]
  };

  const result = disconnectBlockedConnections(state, 'alice', 'bob', at);
  assert.deepEqual(result, {
    follows: 2,
    friendships: 1,
    preferences: 2,
    friendListMembers: 2,
    pageFollows: 2,
    presence: 2,
    calls: []
  });
  assert.deepEqual(state.follows, [{ followerId: 'alice', followedId: 'carol' }]);
  assert.deepEqual(state.friendships, [{ from: 'carol', to: 'alice', status: 'accepted' }]);
  assert.deepEqual(state.friendPreferences, [{ ownerId: 'alice', targetId: 'carol', isFavorite: true }]);
  assert.deepEqual(state.friendLists.map(list => list.memberIds), [['carol'], [], ['alice']]);
  assert.deepEqual(state.friendLists.map(list => list.memberCount), [1, 0, 1]);
  assert.deepEqual(state.pageFollows, [
    { pageId: 'carol-page', userId: 'alice' },
    { pageId: 'alice-page', userId: 'carol' }
  ]);
  assert.deepEqual(state.profileViewPresence, [{ targetUserId: 'alice', viewerUserId: 'carol' }]);
});

test('blocking ends a direct one-to-one call but does not tear down a shared group call', () => {
  const at = '2026-11-11T12:00:00.000Z';
  const direct = { id: 'direct-call', status: 'active' };
  const group = { id: 'group-call', status: 'active' };
  const unrelated = { id: 'other-call', status: 'ringing' };
  const state = {
    calls: [direct, group, unrelated],
    callParticipants: [
      { callId: 'direct-call', userId: 'alice', status: 'joined' },
      { callId: 'direct-call', userId: 'bob', status: 'joined' },
      { callId: 'group-call', userId: 'alice', status: 'joined' },
      { callId: 'group-call', userId: 'bob', status: 'joined' },
      { callId: 'group-call', userId: 'carol', status: 'joined' },
      { callId: 'other-call', userId: 'alice', status: 'calling' },
      { callId: 'other-call', userId: 'carol', status: 'invited' }
    ]
  };

  const result = disconnectBlockedConnections(state, 'alice', 'bob', at);
  assert.deepEqual(result.calls.map(call => call.id), ['direct-call']);
  assert.equal(direct.status, 'ended');
  assert.equal(direct.endReason, 'blocked');
  assert.equal(direct.endedById, 'alice');
  assert.equal(direct.endedAt, at);
  assert.deepEqual(state.callParticipants.filter(row => row.callId === 'direct-call').map(row => row.status), ['left', 'left']);
  assert.equal(group.status, 'active', 'a block must not interrupt a group call with other participants');
  assert.equal(unrelated.status, 'ringing');
  assert.deepEqual(state.callParticipants.filter(row => row.callId === 'other-call').map(row => row.status), ['calling', 'invited']);
});

test('blocked relationship cleanup is idempotent and preserves historical content and paid subscriptions', () => {
  const state = {
    follows: [{ followerId: 'alice', followedId: 'bob' }],
    friendships: [{ from: 'alice', to: 'bob' }],
    messages: [{ id: 'history-1', from: 'alice', to: 'bob', text: 'Preserve history' }],
    posts: [{ id: 'post-1', userId: 'alice' }],
    profileViews: [{ targetUserId: 'alice', viewerUserId: 'bob' }],
    creatorSubscriptions: [{ creatorId: 'alice', subscriberId: 'bob', status: 'active' }],
    messageGroupMembers: [
      { groupId: 'g1', userId: 'alice', status: 'active' },
      { groupId: 'g1', userId: 'bob', status: 'active' },
      { groupId: 'g1', userId: 'carol', status: 'active' }
    ]
  };

  disconnectBlockedConnections(state, 'alice', 'bob');
  const second = disconnectBlockedConnections(state, 'bob', 'alice');
  assert.equal(second.follows, 0);
  assert.equal(second.friendships, 0);
  assert.deepEqual(state.messages, [{ id: 'history-1', from: 'alice', to: 'bob', text: 'Preserve history' }]);
  assert.deepEqual(state.posts, [{ id: 'post-1', userId: 'alice' }]);
  assert.deepEqual(state.profileViews, [{ targetUserId: 'alice', viewerUserId: 'bob' }]);
  assert.deepEqual(state.creatorSubscriptions, [{ creatorId: 'alice', subscriberId: 'bob', status: 'active' }]);
  assert.equal(state.messageGroupMembers.length, 3);
});

test('invalid or self-pair cleanup is a harmless no-op', () => {
  const state = { follows: [{ followerId: 'alice', followedId: 'bob' }] };
  assert.deepEqual(disconnectBlockedConnections(state, 'alice', 'alice'), {
    follows: 0, friendships: 0, preferences: 0, friendListMembers: 0,
    pageFollows: 0, presence: 0, calls: []
  });
  assert.equal(state.follows.length, 1);
});
