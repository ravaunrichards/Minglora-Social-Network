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

test('MeetWave room dock stays attached and meeting chat remains in the room', () => {
  assert.match(js, /class="mw-controls live-player-controls live-icon-controls"/);
  assert.match(js, /id="mw-people-toggle"/);
  assert.match(js, /id="mw-chat-toggle"/);
  assert.match(js, /function toggleSupportPanel\(name\)/);
  assert.match(js, /setRoomControlState\('mw-mic'/);
  assert.match(js, /setRoomControlState\('mw-camera'/);
  assert.match(css, /\.mw-controls\.live-player-controls\.live-icon-controls\{[\s\S]*?position:relative!important/);
  assert.match(css, /\.mw-support-column\[hidden\]\{display:none!important\}/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?bottom:calc\(66px \+ env\(safe-area-inset-bottom\)\)/);
});

test('MeetWave automatic-sync assets bypass stale browser and service-worker caches', () => {
  const cssVersion = '20261107-meetwave-live-shell-1';
  const jsVersion = '20261107-meetwave-full-room-1';
  assert.ok(html.includes('/meetwave.css?v=' + cssVersion));
  assert.ok(html.includes('/meetwave.js?v=' + jsVersion));
  assert.match(serviceWorker, new RegExp('minglora-shell-v121-meetwave-live-shell-1'));
  assert.ok(serviceWorker.includes('/meetwave.css?v=' + cssVersion));
  assert.ok(serviceWorker.includes('/meetwave.js?v=' + jsVersion));
});

test('MeetWave has exactly nine local-screen layout choices', () => {
  const layouts = ['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'];
  for (const layout of layouts) {
    assert.ok(js.includes('data-mw-layout="'+layout+'"'), layout+' choice is present');
    assert.ok(css.includes('data-layout="'+layout+'"'), layout+' has a screen arrangement');
  }
  assert.match(js, /function applyMeetingLayout\\(layout\\)/);
  assert.match(js, /changes only your local screen arrangement/);
  assert.doesNotMatch(js, /data-mw-layout="(?:gallery-2|gallery-3|gallery-4|speaker|sidebar|filmstrip|presentation)"/);
  assert.match(js, /activeLayout='fluid-grid'/);
});

test('MeetWave layouts and settings are integrated into the reachable side panel', () => {
  const aside = js.indexOf('id="mw-support-column"');
  const layouts = js.indexOf('id="mw-layout-picker"', aside);
  const settings = js.indexOf('id="mw-settings-panel"', layouts);
  const end = js.indexOf('</aside></div><p id="mw-room-status"', settings);
  assert.ok(aside >= 0 && layouts > aside && settings > layouts && end > settings);
  assert.ok(js.includes('id="mw-panel-layouts-tab"'));
  assert.match(js, /const panels=\\{chat:[\\s\\S]*?layouts:[\\s\\S]*?settings:/);
  assert.match(css, /\\.mw-meeting \\.mw-support-column\\.live-fullscreen-chat-slot[\\s\\S]*?display:flex/);
  assert.match(css, /\\.mw-meeting \\.mw-support-column>\\.mw-layout-picker[\\s\\S]*?position:static!important/);
  assert.match(css, /\\.mw-meeting \\.mw-support-column>\\.mw-settings-panel[\\s\\S]*?position:static!important/);
  assert.match(css, /live-full-screen-active/);
});
test('MeetWave settings cover devices and appearance while retaining visible room chat', () => {
  for (const id of ['mw-settings-panel','mw-audio-input','mw-audio-output','mw-video-input','mw-echo-cancellation','mw-noise-suppression','mw-auto-gain','mw-video-fit','mw-mirror-self','mw-show-names','mw-chat-panel']) assert.ok(js.includes('id=\"'+id+'\"'));
  assert.match(js, /function switchMeetingDevice\(kind,deviceId\)/);
  assert.match(js, /function applyMeetingVisualSettings\(\)/);
});
