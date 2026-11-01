import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

test('discovery previews use real member content and existing privacy policies', async () => {
  const server = await read('src/server.js');
  assert.match(server, /\/api\/discovery\/people/);
  assert.match(server, /canViewProfile\(user\.id,member\)/);
  assert.match(server, /canViewStory\(user\.id,story\)/);
  assert.match(server, /post\.status!=='hidden'/);
  assert.match(server, /recentPosts/);
  assert.match(server, /latestStory/);
  assert.match(server, /mutualFriendsCount/);
  assert.match(server, /publicDiscoveryPost/);
  assert.match(server, /await pruneExpiredStories\(\)/);
});

test('People You May Know renders real member covers, stories, posts and verified LIVE sessions', async () => {
  const app = await read('public/app.js');
  assert.match(app, /person-cover-image/);
  assert.match(app, /person-avatar-wrap/);
  assert.match(app, /p\.recentPosts/);
  assert.match(app, /p\.latestStory/);
  assert.match(app, /viewerCountVerified===true/);
  assert.match(app, /data-watch-live/);
  assert.match(app, /data-open-profile-story/);
  assert.match(app, /\/discovery\/people/);
  assert.match(app, /No recent public activity/);
  assert.doesNotMatch(app, /Connect and get to know each other\./);
});

test('discovery refreshes only while Friends is visible and uses the real LIVE directory', async () => {
  const app = await read('public/app.js');
  assert.match(app, /setInterval\(\(\)=>void refreshPeopleDiscovery\(\),20000\)/);
  assert.match(app, /state\.view!=='friends'/);
  assert.match(app, /document\.visibilityState!=='visible'/);
  assert.match(app, /api\('\/live\/sessions'\)/);
  assert.match(app, /openLiveRoom\(session,'viewer'\)/);
});

test('outside-profile cards provide dimensional responsive styling and respect reduced motion', async () => {
  const css = await read('public/styles.css');
  assert.match(css, /\.person-card--immersive/);
  assert.match(css, /box-shadow:0 20px 38px/);
  assert.match(css, /\.person-cover:after/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.theme-dark \.person-card--immersive/);
});

test('static shell cache is versioned for the upgraded discovery cards', async () => {
  const html = await read('public/index.html');
  const worker = await read('public/sw.js');
  assert.match(html, /20261031-creator-stage-sticky-fallback-2/);
  assert.match(html, /20261031-creator-stage-sticky-fallback-2/);
  assert.match(worker, /minglora-shell-v36-android-update-ready/);
});
