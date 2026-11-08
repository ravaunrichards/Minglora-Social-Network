import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('For You and Following are real, independently selectable feed scopes', async () => {
  const [app, server] = await Promise.all([
    read('public/app.js'),
    read('src/server.js')
  ]);
  assert.match(app, /data-fyp-scope="following"/);
  assert.match(app, /data-fyp-scope="for-you"/);
  assert.match(app, /bindOnce\('\[data-fyp-scope\]'[\s\S]*state\.forYouScope=scope;[\s\S]*await renderForYouFeed\(\)/);
  assert.match(app, /new URLSearchParams\(\{scope,limit:'12',followedOnly:'1'\}\)/);
  assert.match(server, /const followedOnly=url\.searchParams\.get\('followedOnly'\)==='1'&&scope==='following'/);
  assert.match(server, /eligibleIds=followedOnly\?followedIds:new Set\(\[user\.id,\.\.\.followedIds\]\)/);
  assert.match(server, /scope==='for-you'\s*\?rankForYouFeed/);
});

test('For You search stays visible, submits immediately, filters results and can be cleared', async () => {
  const app = await read('public/app.js');
  assert.match(app, /function forYouFeedShellMarkup\(\)[\s\S]*id="fyp-search-input" type="search"/);
  assert.match(app, /data-fyp-search aria-label="Search feed"/);
  assert.doesNotMatch(app, /id="fyp-search-input"[^>]*hidden/);
  assert.match(app, /search\.addEventListener\('input'[\s\S]*state\.forYouSearch=search\.value\.slice\(0,100\)/);
  assert.match(app, /event\.key==='Enter'[\s\S]*searchForYouPosts\(\)/);
  assert.match(app, /data-fyp-search-clear/);
  assert.match(app, /params\.set\('q',query\)/);
  assert.match(app, /state\.forYouSearch=''/);
});

test('For You header and search reserve their own space above the scrolling feed on every screen size', async () => {
  const [app, css, html, sw] = await Promise.all([
    read('public/app.js'),
    read('public/for-you-controls.css'),
    read('public/index.html'),
    read('public/sw.js')
  ]);
  assert.match(app, /<header class="fyp-header"[\s\S]*fyp-feed-switch[\s\S]*fyp-top-search[\s\S]*class="fyp-stream"/);
  assert.match(app, /setupForYouPlayback\(feedRoot\)/);
  assert.match(app, /data-fyp-retry/);
  assert.match(css, /\.minglora-for-you\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  assert.match(css, /\.fyp-top-search\s*\{[\s\S]*position:\s*relative !important/);
  assert.match(css, /\.fyp-feed-switch\s*\{[\s\S]*position:\s*relative !important/);
  assert.match(css, /\.fyp-stream\s*\{[\s\S]*grid-row:\s*2 !important[\s\S]*overflow-y:\s*auto !important/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*grid-template-areas:[\s\S]*"search search"/);
  assert.ok(html.includes('/for-you-controls.css?v=20261108-home-live-mixed-feed-2'));
  assert.ok(sw.includes('/for-you-controls.css?v=20261108-home-live-mixed-feed-2'));
  assert.match(sw, /^const CACHE_NAME='minglora-shell-v[0-9]+-[^']+';$/m);
});
