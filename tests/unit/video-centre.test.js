import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Minglora Video Centre discovers only real video attachments from the authenticated feed', async () => {
  const [app, html, styles] = await Promise.all([
    read('../../public/app.js'),
    read('../../public/index.html'),
    read('../../public/styles.css')
  ]);

  assert.match(app, /videoFeed:\[\]/);
  assert.match(app, /videoMode:'videos'/);
  assert.match(app, /data-video-mode="reels"/);
  assert.match(app, /function renderReelCard\(/);
  assert.match(app, /function bindReelPlayback\(/);
  assert.match(app, /new IntersectionObserver\(/);
  assert.match(app, /threshold:\[0,0\.65,1\]/);
  assert.match(app, /data-reel-video controls playsinline loop muted preload="metadata"/);
  assert.match(app, /data-react=/);
  assert.match(app, /data-comment-form=/);
  assert.match(app, /state\.videoFeed=\(result\.posts\|\|\[\]\)\.filter\(post=>\(post\.media\|\|\[\]\)\.some\(media=>media\.mediaType==='video'&&media\.url\)\)/);
  assert.match(app, /api\('\/feed\?scope='/);
  assert.match(app, /view:'videos'/);
  assert.match(app, /state\.view==='videos'/);
  assert.match(app, /function renderVideoCentre\(\)/);
  assert.match(app, /function findVisiblePost\(id\)[\s\S]*state\.videoFeed/);
  assert.match(app, /video-create-button/);
  assert.match(app, /data-video-search|video-search/);
  assert.match(html, /video-centre-foundation-1/);
  assert.match(styles, /\.video-centre-feed/);
  assert.match(styles, /\.video-centre-reels/);
  assert.match(styles, /scroll-snap-type:y mandatory/);
  assert.match(styles, /\.minglora-reel-video/);
  assert.match(html, /reels-viewer-1/);
  assert.doesNotMatch(app, /sampleVideoFixtures|fakeVideoFixtures|seedVideoFeed/i);
});
