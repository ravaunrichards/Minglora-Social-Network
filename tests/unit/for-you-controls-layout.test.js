import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Home, Friends, Subscribers and Following have real click handlers and audience-backed feeds', async () => {
  const [app, server] = await Promise.all([
    read('public/app.js'),
    read('src/server.js')
  ]);
  for (const scope of ['for-you', 'friends', 'subscribers', 'following']) {
    assert.match(app, new RegExp('data-fyp-scope="' + scope + '"'));
  }
  assert.match(app, /function bindForYouScopeControls\(root\)[\s\S]*root\.querySelectorAll\('\[data-fyp-scope\]'\)[\s\S]*button\.addEventListener\('click',async\(\)=>\{[\s\S]*state\.forYouScope=normalizeForYouScope\(scope\);[\s\S]*persistCurrentView\(\);[\s\S]*recordBrowserNavigation\(\);[\s\S]*await renderForYouFeed\(\)/);
  const renderStart = app.indexOf('async function renderForYouFeed()');
  const scopeBinding = app.indexOf('bindForYouScopeControls(feedRoot)', renderStart);
  const firstFeedRequest = app.indexOf('await fetchForYouPage({reset:true})', renderStart);
  assert.ok(scopeBinding > renderStart && firstFeedRequest > scopeBinding, 'tab clicks are wired before the asynchronous feed request');
  assert.match(app, /new URLSearchParams\(\{scope,limit:'12'\}\)/);
  assert.match(app, /if\(scope==='following'\)params\.set\('followedOnly','1'\)/);
  assert.match(app, /forYouRoutePath\(snapshot\.forYouScope\)/);
  assert.match(app, /window\.addEventListener\('popstate',[\s\S]*restoreBrowserNavigation/);
  assert.match(server, /const followedOnly=url\.searchParams\.get\('followedOnly'\)==='1'&&scope==='following'/);
  assert.match(server, /eligibleIds=followedOnly\?followedIds:new Set\(\[user\.id,\.\.\.followedIds\]\)/);
  assert.match(server, /scope==='friends'[\s\S]*getMutualFollowIds/);
  assert.match(server, /scope==='subscribers'[\s\S]*subscription_subscribers_list/);
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
  assert.match(html,/\/app\.js\?v=[^"']+/);
  assert.ok(sw.includes('/app.js?v=20261108-facebook-stories-navigation-2'));
  assert.match(sw, /^const CACHE_NAME='minglora-shell-v[0-9]+-[^']+';$/m);
});

test('Home Stories use a Facebook-style create card, scrollable story rail and navigable fullscreen viewer', async () => {
  const [app, css, html, sw] = await Promise.all([
    read('public/app.js'),
    read('public/styles.css'),
    read('public/index.html'),
    read('public/sw.js')
  ]);
  assert.match(app, /function renderStoriesPanel\(\)[\s\S]*story-create-card[\s\S]*data-open-story/);
  assert.match(app, /data-story-scroll/);
  assert.match(app, /async function openStory\(id\)[\s\S]*data-story-previous[\s\S]*data-story-next/);
  assert.match(app, /api\('\/stories\/'\+encodeURIComponent\(selected\.id\)\+'\/view'/);
  assert.match(app, /id="delete-story"/);
  assert.match(app, /id="report-story"/);
  assert.match(css, /\.story-create-card/);
  assert.match(css, /\.story-viewer-fullscreen-card/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.story-viewer-fullscreen-card/);
  assert.ok(html.includes('/styles.css?v=20261108-facebook-stories-2'));
  assert.match(html,/\/app\.js\?v=[^"']+/);
  assert.ok(sw.includes('/styles.css?v=20261108-facebook-stories-2'));
  assert.ok(sw.includes('/app.js?v=20261108-facebook-stories-navigation-2'));
  assert.match(sw, /^const CACHE_NAME='minglora-shell-v[0-9]+-facebook-friends-profile-1';$/m);
});

test('Stories create button stays above its label and uses consistent Facebook-style card sizing', async () => {
  const css = await read('public/styles.css');
  assert.match(css, /\.story-create-plus\{[\s\S]*z-index:3/);
  assert.match(css, /\.story-create-label\{[\s\S]*z-index:1/);
  assert.match(css, /\.story-create-card,\.story-card\{[\s\S]*flex:0 0 112px[\s\S]*height:196px/);
});
test('Stories support tap, swipe, timed progression and media-end navigation', async () => {
  const app = await read('public/app.js');
  assert.match(app, /const bindStoryTapNavigation=\(\)=>\{/);
  assert.match(app, /touchstart/);
  assert.match(app, /touchend/);
  assert.match(app, /setTimeout\(\(\)=>advanceStoryItem\(1\),5000\)/);
  assert.match(app, /addEventListener\('ended',[\s\S]*advanceStoryItem\(1\)/);
});
