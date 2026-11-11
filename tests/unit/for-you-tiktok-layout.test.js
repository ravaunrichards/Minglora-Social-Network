import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Minglora For You uses an edge-to-edge, TikTok-style vertical video stage', async () => {
  const [app, css, html, sw] = await Promise.all([
    read('public/app.js'),
    read('public/for-you-tiktok.css'),
    read('public/index.html'),
    read('public/sw.js')
  ]);
  assert.match(app, /function forYouCard\(post,index\)/);
  assert.match(app, /class="fyp-video" data-fyp-video/);
  assert.match(app, /class="fyp-action-rail"/);
  assert.match(app, /class="fyp-overlay-bottom"/);
  assert.match(css, /\.fyp-header\s*\{[\s\S]*position:absolute!important/);
  assert.match(css, /\.fyp-stream\s*\{[\s\S]*inset:0!important[\s\S]*scroll-snap-type:y mandatory/);
  assert.match(css, /\.fyp-video-card\s*\{[\s\S]*height:100dvh!important/);
  assert.match(css, /\.fyp-video-card\.has-video\s*\{[\s\S]*width:min\(100vw,56\.25dvh\)!important/);
  assert.match(css, /\.fyp-video-card\.has-video \.fyp-video\s*\{[\s\S]*object-fit:cover!important/);
  assert.match(html, /for-you-tiktok\.css\?v=20261111-tiktok-video-layout-1/);
  assert.ok(sw.includes('/for-you-tiktok.css?v=20261111-tiktok-video-layout-1'));
  assert.match(sw, /CACHE_NAME='minglora-shell-v\\d+-self-updating-1'/);
});

test('For You keeps the established feed actions and real one-at-a-time video playback', async () => {
  const app = await read('public/app.js');
  assert.match(app, /data-react=/);
  assert.match(app, /data-focus-comment=/);
  assert.match(app, /data-toggle-save=/);
  assert.match(app, /data-share=/);
  assert.match(app, /data-foryou-follow=/);
  assert.match(app, /data-fyp-sound=/);
  assert.match(app, /data-fyp-not-interested=/);
  assert.match(app, /new IntersectionObserver\(/);
  assert.match(app, /threshold:\[0,0\.7,1\]/);
  assert.match(app, /if\(other!==video\)other\.pause\(\)/);
  assert.match(app, /api\('\/videos\/'\+encodeURIComponent\(postId\)\+'\/watch'/);
  assert.doesNotMatch(app, /fakeForYouVideos|sampleForYouVideos|seedForYouFeed/i);
});

test('For You search expands from the overlay without losing keyboard focus', async () => {
  const css = await read('public/for-you-tiktok.css');
  const app = await read('public/app.js');
  assert.match(css, /\.fyp-top-search input\s*\{[\s\S]*position:absolute!important[\s\S]*opacity:0!important/);
  assert.match(css, /\.fyp-top-search:focus-within[\s\S]*width:min\(340px,calc\(100vw - 24px\)\)!important/);
  assert.match(css, /\.fyp-top-search:focus-within input[\s\S]*position:static!important[\s\S]*opacity:1!important/);
  assert.match(app, /bindOnce\('\[data-fyp-search\]'[\s\S]*search\.focus\(\)/);
  assert.match(app, /search\.addEventListener\('keydown'[\s\S]*event\.key==='Enter'[\s\S]*searchForYouPosts\(\)/);
});

test('For You layout fits phones, short landscape screens and reduced-motion settings', async () => {
  const css = await read('public/for-you-tiktok.css');
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-height:640px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /overscroll-behavior-y:contain!important/);
  assert.match(css, /scroll-snap-stop:always!important/);
  assert.match(css, /\.fyp-action-rail\s*\{[\s\S]*top:50%!important/);
  assert.match(css, /\.fyp-overlay-bottom\s*\{[\s\S]*bottom:max\(20px,calc\(env\(safe-area-inset-bottom\) \+ 14px\)\)!important/);
});
