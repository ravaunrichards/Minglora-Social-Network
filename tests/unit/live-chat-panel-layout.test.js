import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const styles = read('public/styles.css');
const compact = read('public/live-room-compact.css');

test('LIVE client, compact room stylesheet and service-worker cache are versioned together', () => {
  const html = read('public/index.html');
  const worker = read('public/sw.js');
  const asset = '20261107-live-layout-1';
  assert.ok(html.includes('/app.js?v=' + asset), 'HTML must request the updated LIVE client');
  assert.ok(html.includes('/live-room-compact.css?v=' + asset), 'HTML must request the compact room layout');
  assert.ok(worker.includes('minglora-shell-v161-live-compact-1'), 'service worker must activate a new cache');
  assert.ok(worker.includes('/app.js?v=' + asset), 'precache must include the updated client');
  assert.ok(worker.includes('/live-room-compact.css?v=' + asset), 'precache must include the compact room stylesheet');
});

test('LIVE chat respects the host chat-enabled setting and renders a disabled state', () => {
  assert.ok(app.includes('const liveChatOverlay=liveSettings.groupChatEnabled!==false'), 'chat node must follow the room chat setting');
  assert.ok(app.includes('The host has turned off Group LIVE chat for this broadcast.'), 'disabled chat must expose a readable status');
});

test('One LIVE chat node is mounted in the persistent right-side panel, not over the guest video stage', () => {
  assert.match(app, /id='live-fullscreen-chat-slot' class='live-fullscreen-chat-slot'/);
  assert.ok(app.includes('const liveChatPanel=$("#live-fullscreen-chat-slot");liveChatPanel?.insertAdjacentHTML("beforeend",liveChatOverlay);'));
  assert.match(app, /function restoreLiveChatToStage\(\)[\s\S]*?const slot=\$\('#live-fullscreen-chat-slot'\)[\s\S]*?slot\.append\(chat\)/);
  assert.doesNotMatch(app, /stage\?\.insertAdjacentHTML\("beforeend",liveChatOverlay\)/);
  assert.doesNotMatch(app, /data-live-tools-panel='chat'/, 'the tools drawer must not create a duplicate Chat panel');
  assert.doesNotMatch(app, /data-live-tools-panel-target='chat'/, 'Chat must not be repeated in the Tools navigation');
});

test('Right panel Chat and Tools tabs remain connected to their actions', () => {
  assert.match(app, /const setLiveRoomPanelTab=name=>/);
  assert.match(app, /const showLiveRoomChat=\(\)=>/);
  assert.match(app, /const showLiveRoomTools=\(\)=>/);
  assert.match(app, /\$\("#live-fullscreen-chat-tab"\)\?\.addEventListener\("click",showLiveRoomChat\)/);
  assert.match(app, /\$\("#live-fullscreen-tools-tab"\)\?\.addEventListener\("click",showLiveRoomTools\)/);
});

test('The existing LIVE chat send, emoji and moderation controls remain wired', () => {
  assert.ok(app.includes('$("#live-chat-form")?.addEventListener("submit"'), 'message submission must remain connected');
  assert.ok(app.includes("$('#live-chat-emoji')?.addEventListener('click'"), 'emoji picker must remain connected');
  assert.ok(app.includes('[data-live-chat-pin]'), 'host comment pin controls must remain available');
  assert.ok(app.includes('[data-live-chat-delete]'), 'moderation remove controls must remain available');
});

test('LIVE chat auto-scrolls only while the viewer is already near the newest messages', () => {
  assert.match(app, /const wasNearBottom=!list\.dataset\.liveChatInitialized\|\|list\.scrollHeight-list\.scrollTop-list\.clientHeight<=72/);
  assert.match(app, /if\(wasNearBottom\)list\.scrollTop=list\.scrollHeight/);
  assert.match(app, /list\.dataset\.liveChatInitialized='true'/);
});

test('The room shell and guest grid fit the viewport while chat scrolls only inside its own panel', () => {
  assert.match(compact, /body:has\(#live-player-shell\)\{[\s\S]*height:100dvh!important[\s\S]*overflow:hidden!important/);
  assert.match(compact, /body:has\(#live-player-shell\) \.live-player-layout\{[\s\S]*grid-template-columns:minmax\(0,1fr\) minmax\(250px,310px\)/);
  assert.match(compact, /body:has\(#live-player-shell\) #live-guest-layout\.live-guest-layout\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(compact, /body:has\(#live-player-shell\) \.live-chat-overlay \.live-chat-list\{[\s\S]*overflow-y:auto!important/);
  assert.match(compact, /body:has\(#live-player-shell\) \.live-player-controls\.live-icon-controls\{[\s\S]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(compact, /@media\(max-width:760px\)[\s\S]*grid-template-rows:minmax\(0,1fr\) clamp\(135px,25dvh,205px\)/);
  assert.match(compact, /\.live-tools-backdrop\.hidden\{display:none!important\}/);
  assert.match(styles, /\.live-chat-overlay \.live-chat-line\{/);
});

test('LIVE room chat composer remains touch-accessible and within the chat column', () => {
  assert.match(compact, /\.live-chat-overlay \.live-chat-form\{[\s\S]*display:flex!important/);
  assert.match(compact, /\.live-chat-overlay \.live-chat-form input\{[\s\S]*min-width:0!important[\s\S]*min-height:34px!important/);
  assert.match(compact, /\.live-chat-overlay \.live-chat-form button\{[\s\S]*min-width:30px!important[\s\S]*min-height:30px!important/);
  assert.match(compact, /\.live-chat-overlay \.live-chat-composer-wrap\{[\s\S]*flex:0 0 auto!important/);
});
