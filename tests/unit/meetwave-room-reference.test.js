import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [css, js, html, serviceWorker] = await Promise.all([
  readFile(new URL('../../public/meetwave.css', import.meta.url), 'utf8'),
  readFile(new URL('../../public/meetwave.js', import.meta.url), 'utf8'),
  readFile(new URL('../../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../../public/sw.js', import.meta.url), 'utf8')
]);

test('Minglora MeetWave keeps the standalone room starting geometry', () => {
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 300px!important/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css, /aspect-ratio:16\/10!important/);
  assert.match(css, /min-height:160px!important/);
});

test('Minglora retains People and Chat as one compact companion column', () => {
  assert.match(js, /class="mw-support-column"/);
  assert.match(css, /\.mw-support-column\{[\s\S]*?grid-template-rows:auto minmax\(390px,1fr\)/);
});

test('phone layout preserves two landscape video tiles and side-by-side People and Chat', () => {
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css, /\.mw-support-column\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css, /@media\(max-width:430px\)[\s\S]*?\.mw-video-grid\s*\{[^}]*grid-template-columns:1fr/);
});

test('MeetWave mirrors LIVE with a bottom control rail and panel toggles', () => {
  assert.match(js, /class="mw-controls live-player-controls live-icon-controls"/);
  assert.match(js, /id="mw-people-toggle"/);
  assert.match(js, /id="mw-chat-toggle"/);
  assert.match(js, /function toggleSupportPanel\(name\)/);
  assert.match(js, /setRoomControlState\('mw-mic'/);
  assert.match(js, /setRoomControlState\('mw-camera'/);
  assert.match(css, /\.mw-controls\.live-player-controls\.live-icon-controls\{[\s\S]*?position:fixed/);
  assert.match(css, /\.mw-support-column\[hidden\]\{display:none!important\}/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?bottom:calc\(66px \+ env\(safe-area-inset-bottom\)\)/);
});

test('MeetWave bottom-control assets bypass stale browser and service-worker caches', () => {
  const version = '20261107-meetwave-bottom-controls-1';
  assert.match(html, new RegExp('/meetwave\\\\.css\\\\?v=' + version));
  assert.match(html, new RegExp('/meetwave\\\\.js\\\\?v=' + version));
  assert.match(serviceWorker, new RegExp('minglora-shell-v115-meetwave-bottom-controls-1'));
  assert.match(serviceWorker, new RegExp('/meetwave\\\\.css\\\\?v=' + version));
  assert.match(serviceWorker, new RegExp('/meetwave\\\\.js\\\\?v=' + version));
});
