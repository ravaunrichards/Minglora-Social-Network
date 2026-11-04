import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewStory, expiredStoryIds, isBlockedBetween, removeExpiredStories, normalizeStoryMediaIds, createStoryBatch, appendStoryBatch } from '../../backend/modules/stories/service.js';

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

test('multiple story photos and videos normalize as one unique batch with a safe ten-file cap', () => {
  assert.deepEqual(normalizeStoryMediaIds({ mediaIds: ['photo-1', 'video-1', 'photo-2'] }), {
    valid: true, mediaIds: ['photo-1', 'video-1', 'photo-2']
  });
  assert.deepEqual(normalizeStoryMediaIds({ mediaId: 'legacy-single-media' }), {
    valid: true, mediaIds: ['legacy-single-media']
  });
  assert.deepEqual(normalizeStoryMediaIds({ mediaIds: [] }), { valid: true, mediaIds: [] });
  assert.equal(normalizeStoryMediaIds({ mediaIds: Array.from({ length: 11 }, (_, index) => 'media-' + index) }).valid, false);
  assert.equal(normalizeStoryMediaIds({ mediaIds: ['media-1', 'media-1'] }).valid, false);
  assert.equal(normalizeStoryMediaIds({ mediaIds: 'not-an-array' }).valid, false);
  assert.equal(normalizeStoryMediaIds({ mediaIds: ['photo-1'], mediaId: 'photo-1' }).valid, false);
  assert.equal(normalizeStoryMediaIds({ mediaIds: [''] }).valid, false);
});

test('story batches create individual ordered items without replacing existing stories', () => {
  let nextId = 0;
  const idFactory = () => 'story-id-' + (++nextId);
  const createdAt = '2026-11-04T12:00:00.000Z';
  const expiresAt = '2026-11-05T12:00:00.000Z';
  const batch = createStoryBatch({
    userId: 'author',
    text: 'A day out',
    mediaIds: ['photo-1', 'video-1', 'photo-2'],
    audience: 'public',
    idFactory,
    createdAt,
    expiresAt
  });
  assert.equal(batch.length, 3);
  assert.equal(new Set(batch.map(item => item.id)).size, 3);
  assert.equal(new Set(batch.map(item => item.storyBatchId)).size, 1);
  assert.deepEqual(batch.map(item => item.storyBatchIndex), [0, 1, 2]);
  assert.deepEqual(batch.map(item => item.storyBatchSize), [3, 3, 3]);
  assert.deepEqual(batch.map(item => item.mediaId), ['photo-1', 'video-1', 'photo-2']);
  assert.ok(batch.every(item => item.userId === 'author' && item.text === 'A day out'));
  assert.equal(Date.parse(batch[2].createdAt) - Date.parse(batch[0].createdAt), 2);
  assert.equal(Date.parse(batch[2].expiresAt) - Date.parse(batch[0].expiresAt), 2);

  const existing = [{ id: 'old-story', userId: 'author' }];
  const appended = appendStoryBatch(existing, batch);
  assert.equal(existing.length, 1, 'appending must not mutate or replace the original collection');
  assert.deepEqual(appended.map(item => item.id), ['old-story', ...batch.map(item => item.id)]);
});

test('text-only story batches still produce one independent story item', () => {
  let nextId = 0;
  const batch = createStoryBatch({
    userId: 'author',
    text: 'A text update',
    mediaIds: [],
    idFactory: () => 'id-' + (++nextId),
    createdAt: '2026-11-04T12:00:00.000Z',
    expiresAt: '2026-11-05T12:00:00.000Z'
  });
  assert.equal(batch.length, 1);
  assert.equal(batch[0].mediaId, null);
  assert.equal(batch[0].text, 'A text update');
});

test('story batch builder rejects invalid expiry and missing ID generator', () => {
  assert.throws(() => createStoryBatch({ userId: 'author', mediaIds: [], idFactory: null }), /ID generator/);
  assert.throws(() => createStoryBatch({
    userId: 'author', mediaIds: [], idFactory: () => 'id',
    createdAt: '2026-11-05T12:00:00.000Z',
    expiresAt: '2026-11-04T12:00:00.000Z'
  }), /timestamps/);
});

