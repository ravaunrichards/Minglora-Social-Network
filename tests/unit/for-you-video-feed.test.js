import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rankForYouVideos } from '../../src/domain/video-ranking.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const now = Date.parse('2026-11-08T18:00:00.000Z');
const post = (id, userId, extra = {}) => ({
  id, userId, createdAt: new Date(now - 60 * 60 * 1000).toISOString(),
  reactions: {}, comments: [], mediaIds: ['video-' + id], ...extra
});

test('For You ranking learns creator interest from genuine completion and watch activity', () => {
  const posts = [post('new', 'new-creator'), post('known', 'known-creator')];
  const ranked = rankForYouVideos(
    posts, 'viewer', [], [],
    [{ userId: 'viewer', authorId: 'known-creator', postId: 'older-video', watchedMs: 18000, durationMs: 20000, completed: true, createdAt: new Date(now - 1000).toISOString() }],
    [], now
  );
  assert.equal(ranked[0].id, 'known');
});

test('For You removes videos a viewer marked Not interested', () => {
  const posts = [post('keep', 'creator-a'), post('hide', 'creator-b')];
  const ranked = rankForYouVideos(
    posts, 'viewer', [], [], [],
    [{ userId: 'viewer', postId: 'hide', action: 'not_interested' }],
    now
  );
  assert.deepEqual(ranked.map(item => item.id), ['keep']);
});

test('For You gives relationship and saved-content signals weight without inventing events', () => {
  const posts = [post('cold', 'unfamiliar'), post('followed', 'followed'), post('saved', 'saved-author')];
  const ranked = rankForYouVideos(
    posts, 'viewer',
    [{ followerId: 'viewer', followedId: 'followed' }],
    [{ userId: 'viewer', postId: 'saved' }],
    [], [], now
  );
  assert.ok(ranked.findIndex(item => item.id === 'followed') < ranked.findIndex(item => item.id === 'cold'));
  assert.ok(ranked.findIndex(item => item.id === 'saved') < ranked.findIndex(item => item.id === 'cold'));
  assert.equal(ranked.length, 3);
});

test('For You interleaves creators instead of repeating one account', () => {
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

test('For You is a full-screen swipe feed with phone navigation and selectable post scopes', async () => {
  const [app, styles, html] = await Promise.all([
    read('../../public/app.js'),
    read('../../public/styles.css'),
    read('../../public/index.html')
  ]);
  assert.match(app, /RESTORABLE_VIEWS=new Set\(\[[^\]]*'for-you'/);
  assert.match(app, /requestedView==='for-you'\)[\s\S]*view='for-you'/);
  assert.match(app, /state\.view==='for-you'\)await renderForYouFeed\(\)/);
  assert.match(app, /async function renderForYouFeed\(\)/);
  assert.match(app, /api\('\/feed\?'/);
  assert.match(app, /data-fyp-scope="for-you"/);
  assert.match(app, /data-fyp-scope="following"/);
  assert.match(app, /data-fyp-scope="following"/);
  assert.match(app, /data-fyp-scope="for-you"/);
  assert.match(app, /fyp-avatar-button/);
  assert.match(app, /fyp-action-rail/);
  assert.doesNotMatch(app, /fyp-bottom-nav|data-fyp-nav="(?:feed|friends|create|messages|profile)"|data-fyp-home/);
  assert.match(styles, /body\.minglora-for-you-active \.topbar[\s\S]*display:none!important/);
  assert.match(styles, /\.fyp-stream\{[\s\S]*scroll-snap-type:y mandatory/);
  assert.match(styles, /\.fyp-video-card\{[\s\S]*height:100dvh/);
  assert.doesNotMatch(styles, /\.fyp-bottom-nav|\.fyp-brand/);
  assert.match(styles, /\.fyp-action-rail\{/);
  assert.match(styles, /\.fyp-overlay-bottom\{bottom:calc\(17px \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(html, /data-view="for-you"/);
});

test('For You playback uses real videos, auto-pauses off-screen videos and records watch time', async () => {
  const app = await read('../../public/app.js');
  assert.match(app, /data-fyp-video[^>]*playsinline[^>]*loop muted preload=/);
  assert.match(app, /new IntersectionObserver\(/);
  assert.match(app, /threshold:\[0,0\.7,1\]/);
  assert.match(app, /if\(other!==video\)other\.pause\(\)/);
  assert.match(app, /api\('\/videos\/'\+encodeURIComponent\(postId\)\+'\/watch'/);
  assert.match(app, /data-fyp-not-interested/);
  assert.match(app, /action:'not_interested'/);
  assert.doesNotMatch(app, /fakeForYouVideos|sampleForYouVideos|seedForYouFeed/i);
});

test('For You API enforces viewer visibility and persists validated watch and feedback events', async () => {
  const [server, store] = await Promise.all([
    read('../../src/server.js'),
    read('../../src/store.js')
  ]);
  assert.match(server, /p==='\/api\/for-you\/videos'/);
  assert.match(server, /rankForYouVideos\(visiblePosts,user\.id,db\.follows\|\|\[\],db\.savedPosts\|\|\[\],db\.videoWatchEvents\|\|\[\],excludedFeedback\)/);
  assert.match(server, /canViewProfileAudience\(user\.id,post\.userId,post\.audience\|\|'public'\)/);
  assert.match(server, /new RegExp\('\^\/api\/videos\/\(\[\^\/\]\+\)\/watch\$'\)/);
  assert.match(server, /new RegExp\('\^\/api\/videos\/\(\[\^\/\]\+\)\/feedback\$'\)/);
  assert.match(server, /durationMs>3600000/);
  assert.match(server, /videoWatchEvents/);
  assert.match(server, /videoFeedback/);
  assert.match(store, /'videoWatchEvents', 'videoFeedback'/);
});
