import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewStory, expiredStoryIds, isBlockedBetween, removeExpiredStories } from '../../backend/modules/stories/service.js';

const story = { id: 's1', userId: 'author', audience: 'friends', expiresAt: '2026-10-30T12:00:00.000Z' };

test('story audiences require real friendship or follow relationship', () => {
  const friendships = [{ from: 'viewer', to: 'author', status: 'accepted' }];
  assert.equal(canViewStory({ viewerId: 'viewer', story, friendships }), true);
  assert.equal(canViewStory({ viewerId: 'other', story, friendships }), false);
  assert.equal(canViewStory({ viewerId: 'author', story }), true);
  assert.equal(canViewStory({ viewerId: 'viewer', story: { ...story, audience: 'followers' }, follows: [{ followerId: 'viewer', followedId: 'author' }] }), true);
  assert.equal(canViewStory({ viewerId: 'viewer', story: { ...story, audience: 'private' } }), false);
});

test('blocking overrides public story visibility in either direction', () => {
  const blocks = [{ blockerId: 'viewer', blockedId: 'author' }];
  assert.equal(isBlockedBetween(blocks, 'viewer', 'author'), true);
  assert.equal(canViewStory({ viewerId: 'viewer', story: { ...story, audience: 'public' }, blocks }), false);
  assert.equal(canViewStory({ viewerId: 'author', story: { ...story, audience: 'public' }, blocks }), true);
});

test('expiry cleanup removes expired stories and their viewer records only', () => {
  const stories = [
    { id: 'expired', expiresAt: '2026-10-29T00:00:00.000Z' },
    { id: 'active', expiresAt: '2026-10-31T00:00:00.000Z' }
  ];
  assert.deepEqual([...expiredStoryIds(stories, Date.parse('2026-10-30T00:00:00.000Z'))], ['expired']);
  const result = removeExpiredStories({
    stories,
    views: [{ storyId: 'expired' }, { storyId: 'active' }],
    now: Date.parse('2026-10-30T00:00:00.000Z')
  });
  assert.deepEqual(result.stories.map(item => item.id), ['active']);
  assert.deepEqual(result.views.map(item => item.storyId), ['active']);
  assert.equal(result.removedCount, 1);
});


test('Following stories are visible to people the author follows, not every follower',()=>{
 const storyFollowing={...story,audience:'following'},follows=[{followerId:'author',followedId:'viewer'}];
 assert.equal(canViewStory({viewerId:'viewer',story:storyFollowing,follows}),true);
 assert.equal(canViewStory({viewerId:'other',story:storyFollowing,follows}),false);
});
test('Custom stories are restricted to selected member IDs and exclusions win',()=>{
 const customStory={...story,audience:'custom',customUserIds:['viewer','friend-2']};
 assert.equal(canViewStory({viewerId:'viewer',story:customStory}),true);
 assert.equal(canViewStory({viewerId:'other',story:customStory}),false);
 assert.equal(canViewStory({viewerId:'viewer',story:{...customStory,hideUserIds:['viewer']}}),false);
});
test('Hide story from is enforced even for Public stories',()=>{
 const publicStory={...story,audience:'public',hideUserIds:['viewer']};
 assert.equal(canViewStory({viewerId:'viewer',story:publicStory}),false);
 assert.equal(canViewStory({viewerId:'other',story:publicStory}),true);
});
test('Subscribers-only stories require an active subscription to that creator',()=>{
 const subscribersStory={...story,audience:'subscribers'};
 assert.equal(canViewStory({viewerId:'viewer',story:subscribersStory,subscriptions:[{creatorId:'author',subscriberId:'viewer',status:'active'}]}),true);
 assert.equal(canViewStory({viewerId:'viewer',story:subscribersStory,subscriptions:[{creatorId:'someone-else',subscriberId:'viewer',status:'active'}]}),false);
 assert.equal(canViewStory({viewerId:'viewer',story:subscribersStory,subscriberIds:['viewer']}),true);
});
