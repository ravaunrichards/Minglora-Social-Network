import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('the For You destination presents Home and Following as the two clear feed choices', async () => {
  const app = await read('public/app.js');
  const shell = app.slice(app.indexOf('function forYouFeedShellMarkup()'), app.indexOf('async function renderForYouFeed()'));
  assert.ok(shell.indexOf('data-fyp-scope="for-you"') < shell.indexOf('data-fyp-scope="following"'));
  assert.match(shell, /data-fyp-scope="for-you"[\s\S]*?>Home<\/button>/);
  assert.match(shell, /data-fyp-scope="following"[\s\S]*?>Following<\/button>/);
  assert.match(shell, /aria-label="Show Home feed"/);
  assert.match(shell, /aria-label="Show Following feed"/);
  assert.match(app, /bindOnce\('\[data-fyp-scope\]'[\s\S]*state\.forYouScope=scope;[\s\S]*await renderForYouFeed\(\)/);
});

test('Home and Following both use real posts and only verified, visible LIVE sessions', async () => {
  const [app, server] = await Promise.all([
    read('public/app.js'),
    read('src/server.js')
  ]);
  assert.match(app, /api\('\/feed\?'\+params\.toString\(\)\)/);
  assert.match(app, /api\('\/live\/sessions'\)/);
  assert.match(app, /Promise\.allSettled\(/);
  assert.match(app, /session\?\.status==='live'&&session\.viewerCountVerified===true/);
  assert.match(app, /scope!=='following'\|\|session\.host\?\.following===true/);
  assert.match(server, /hostPresent/);
  assert.match(server, /viewerCountVerified:true/);
  assert.match(server, /session\.visibility==='public'/);
});

test('LIVE feed cards open the real broadcast and can follow the host', async () => {
  const app = await read('public/app.js');
  assert.match(app, /function forYouLiveCard\(session,index\)/);
  assert.match(app, /data-fyp-watch-live=/);
  assert.match(app, /data-fyp-watch-live[\s\S]*?openLiveRoom\(session,session\.hostId===state\.user\.id\?'host':'viewer'\)/);
  assert.match(app, /data-foryou-follow=/);
  assert.match(app, /forYouLiveSessions\.filter\(session=>\(session\.host\?\.id\|\|session\.hostId\)===id\)/);
  assert.match(app, /index%3===0\)entries\.push\(forYouLiveCard\(lives\[liveIndex\+\+\],index\)\)/);
});

test('the mixed Home feed displays video posts, photo posts and horizontal multi-photo sets', async () => {
  const [app, css] = await Promise.all([
    read('public/app.js'),
    read('public/for-you-controls.css')
  ]);
  assert.match(app, /item=>\['video','image','photo','audio','model3d'\]\.includes\(item\.mediaType\)&&item\.url/);
  assert.match(app, /data-fyp-video/);
  assert.match(app, /function forYouCard\(post,index\)/);
  assert.match(app, /photos\.length>1[\s\S]*fyp-photo-carousel/);
  assert.match(app, /Photo '\+\(photoIndex\+1\)\+' of '\+photos\.length/);
  assert.match(css, /\.fyp-live-card/);
  assert.match(css, /\.fyp-photo-carousel/);
  assert.match(css, /\.fyp-feed-switch button[\s\S]*touch-action:\s*manipulation/);
});
