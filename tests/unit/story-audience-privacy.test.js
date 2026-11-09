import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewStory } from '../../backend/modules/stories/service.js';

const owner = 'story-owner';
const viewer = 'story-viewer';
const thirdParty = 'story-third-party';

test('Story privacy supports public, friends, following, followers, subscribers and custom audiences', () => {
  const follows = [
    { followerId: owner, followedId: viewer },
    { followerId: viewer, followedId: thirdParty }
  ];
  const friendships = [{ from: owner, to: viewer, status: 'accepted' }];
  assert.equal(canViewStory({ viewerId: viewer, story: { userId: owner, audience: 'public' } }), true);
  assert.equal(canViewStory({ viewerId: viewer, story: { userId: owner, audience: 'friends' }, friendships }), true);
  assert.equal(canViewStory({ viewerId: viewer, story: { userId: owner, audience: 'following' }, follows }), true);
  assert.equal(canViewStory({ viewerId: viewer, story: { userId: owner, audience: 'followers' }, follows: [{ followerId: viewer, followedId: owner }] }), true);
  assert.equal(canViewStory({ viewerId: viewer, story: { userId: owner, audience: 'subscribers' }, subscribers: [viewer] }), true);
  assert.equal(canViewStory({ viewerId: viewer, story: { userId: owner, audience: 'custom', customUserIds: [viewer] } }), true);
  assert.equal(canViewStory({ viewerId: thirdParty, story: { userId: owner, audience: 'custom', customUserIds: [viewer] } }), false);
});

test('Hide story from overrides broad and custom audiences', () => {
  assert.equal(canViewStory({
    viewerId: viewer,
    story: { userId: owner, audience: 'public', hiddenUserIds: [viewer] }
  }), false);
  assert.equal(canViewStory({
    viewerId: viewer,
    story: { userId: owner, audience: 'custom', customUserIds: [viewer], hiddenUserIds: [viewer] }
  }), false);
  assert.equal(canViewStory({
    viewerId: owner,
    story: { userId: owner, audience: 'custom', customUserIds: [], hiddenUserIds: [owner] }
  }), true, 'the story owner always retains access to their own story');
});

test('Story privacy never bypasses blocks', () => {
  assert.equal(canViewStory({
    viewerId: viewer,
    story: { userId: owner, audience: 'public', customUserIds: [viewer] },
    blocks: [{ blockerId: owner, blockedId: viewer }]
  }), false);
});
