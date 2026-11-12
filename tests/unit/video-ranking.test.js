import test from 'node:test';
import assert from 'node:assert/strict';
import { rankForYouVideos } from '../../src/domain/video-ranking.js';

const now = Date.parse('2026-11-08T17:00:00.000Z');
const post = (id, userId, extra = {}) => ({
  id, userId, createdAt: new Date(now - 60 * 60 * 1000).toISOString(),
  reactions: {}, comments: [], mediaIds: ['video-' + id], ...extra
});

test('For You videos learn creator preferences from completed watch events', () => {
  const posts = [post('new', 'unfamiliar'), post('known-candidate', 'known-creator')];
  const ranked = rankForYouVideos(
    posts, 'viewer', [],
    [],
    [{ userId: 'viewer', authorId: 'known-creator', postId: 'old-known-video', watchedMs: 18000, durationMs: 20000, completed: true, createdAt: new Date(now - 1000).toISOString() }],
    [],
    now
  );
  assert.equal(ranked[0].id, 'known-candidate');
});

test('For You removes videos explicitly marked not interested', () => {
  const posts = [post('keep', 'creator-a'), post('hide', 'creator-b')];
  const ranked = rankForYouVideos(
    posts, 'viewer', [], [], [],
    [{ userId: 'viewer', postId: 'hide', action: 'not_interested' }],
    now
  );
  assert.deepEqual(ranked.map(item => item.id), ['keep']);
});

test('For You favors followed creators and saved videos', () => {
  const posts = [post('cold', 'unfamiliar'), post('followed', 'followed'), post('saved', 'saved-author')];
  const ranked = rankForYouVideos(
    posts, 'viewer',
    [{ followerId: 'viewer', followedId: 'followed' }],
    [{ userId: 'viewer', postId: 'saved' }],
    [],
    [],
    now
  );
  assert.ok(ranked.findIndex(item => item.id === 'followed') < ranked.findIndex(item => item.id === 'cold'));
  assert.ok(ranked.findIndex(item => item.id === 'saved') < ranked.findIndex(item => item.id === 'cold'));
});

test('For You interleaves creators rather than repeating one account', () => {
  const posts = [
    post('a1', 'creator-a', { reactions: Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['u' + i, 'like'])) }),
    post('a2', 'creator-a', { reactions: Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['v' + i, 'like'])) }),
    post('b1', 'creator-b'),
    post('c1', 'creator-c')
  ];
  const ranked = rankForYouVideos(posts, 'viewer', [], [], [], [], now);
  assert.equal(ranked[0].id, 'a1');
  assert.equal(new Set(ranked.slice(0, 3).map(item => item.userId)).size, 3);
});


test('For You promotes videos and creators after explicit Interested feedback', () => {
  const posts = [
    post('neutral', 'creator-neutral'),
    post('interest-source', 'creator-interest'),
    post('same-creator', 'creator-interest')
  ];
  const ranked = rankForYouVideos(
    posts, 'viewer', [], [], [],
    [{ userId: 'viewer', postId: 'interest-source', action: 'interested' }],
    now
  );
  assert.equal(ranked[0].id, 'interest-source');
  assert.ok(ranked.findIndex(item => item.id === 'same-creator') < ranked.findIndex(item => item.id === 'neutral'));
});

test('For You ignores another viewer\'s Interested feedback and negative feedback still excludes the selected video', () => {
  const posts = [post('neutral', 'creator-b'), post('target', 'creator-a')];
  const otherViewersFeedback = rankForYouVideos(
    posts, 'viewer', [], [], [],
    [{ userId: 'another-viewer', postId: 'target', action: 'interested' }],
    now
  );
  assert.equal(otherViewersFeedback[0].id, 'neutral');
  const ownInterest = rankForYouVideos(
    posts, 'viewer', [], [], [],
    [{ userId: 'viewer', postId: 'target', action: 'interested' }],
    now
  );
  assert.equal(ownInterest[0].id, 'target');
  const hidden = rankForYouVideos(
    posts, 'viewer', [], [], [],
    [{ userId: 'viewer', postId: 'target', action: 'not_interested' }],
    now
  );
  assert.deepEqual(hidden.map(item => item.id), ['neutral']);
});
