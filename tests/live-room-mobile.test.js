import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const mobileCss = readFileSync(new URL('../public/mobile-layout.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('mobile LIVE mode is entered and removed on every normal or failed exit', () => {
  assert.match(app, /function setLiveRoomMobileMode\\(enabled\\)/);
  assert.match(app, /setLiveRoomMobileMode\\(true\\)/);
  assert.ok((app.match(/setLiveRoomMobileMode\\(false\\)/g) || []).length >= 3);
  assert.match(app, /window\\.addEventListener\\(["']pagehide["'],closeLiveRoomOnPageHide\\)/);
});

test('mobile LIVE room uses the full viewport and hides competing navigation', () => {
  assert.match(mobileCss, /body\\.live-room-active \\.layout\\s*\\{[^}]*position:fixed/s);
  assert.match(mobileCss, /body\\.live-room-active \\.topbar/);
  assert.match(mobileCss, /body\\.live-room-active \\.mobile-nav/);
  assert.match(mobileCss, /height:100dvh/);
  assert.match(mobileCss, /env\\(safe-area-inset-top\\)/);
  assert.match(mobileCss, /env\\(safe-area-inset-bottom\\)/);
});

test('mobile LIVE controls remain touch-sized and scrollable panels stay contained', () => {
  assert.match(mobileCss, /live-player-controls button\\s*\\{[^}]*min-height:44px/s);
  assert.match(mobileCss, /live-chat-form button\\s*\\{[^}]*min-height:42px/s);
  assert.match(mobileCss, /live-community-panel\\s*\\{[^}]*overflow-x:hidden;overflow-y:auto/s);
  assert.match(mobileCss, /live-gift-grid\\s*\\{[^}]*overflow-y:auto/s);
});

test('phone viewport reserves the display cutout and screen safe areas', () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /mobile-layout\\.css\\?v=20261104-mobile-live-room-1/);
  assert.match(html, /app\\.js\\?v=20261104-mobile-live-room-1/);
});
