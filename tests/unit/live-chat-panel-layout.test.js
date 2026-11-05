import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');


test('PWA cache keys advance with the LIVE chat app and styles', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
  const version = '20261105-live-chat-workspace-1';
  assert.ok(html.includes('/styles.css?v=' + version), 'HTML must request the updated LIVE chat styles');
  assert.ok(html.includes('/app.js?v=' + version), 'HTML must request the updated LIVE chat client');
  assert.ok(worker.includes("minglora-shell-v88-live-chat-workspace-1"), 'service worker must activate a new cache');
  assert.ok(worker.includes('/styles.css?v=' + version), 'precache must include the updated styles');
  assert.ok(worker.includes('/app.js?v=' + version), 'precache must include the updated client');
});

test('LIVE chat panel clearly reflects the host chat-enabled setting', () => {
  assert.ok(app.includes('const liveChatTools=liveSettings.groupChatEnabled!==false'), 'chat panel must follow the room chat setting');
  assert.ok(app.includes('Chat is turned off for this broadcast.'), 'disabled chat must be explained in the panel');
  assert.ok(app.includes('The host has turned off Group LIVE chat for this broadcast.'), 'disabled chat must expose a readable status');
});

test('LIVE chat continues to reuse one conversation node and its existing controls', () => {
  assert.match(app, /function restoreLiveChatToStage\(\)/);
  assert.match(app, /body\.append\(chat\)/);
  assert.ok(app.includes("$(\"#live-chat-form\")?.addEventListener(\"submit\""), 'existing send handler must remain connected');
  assert.ok(app.includes("$('#live-chat-emoji')?.addEventListener('click'"), 'existing emoji picker must remain connected');
  assert.ok(app.includes('[data-live-chat-pin]'), 'host comment pin controls must remain available');
  assert.ok(app.includes('[data-live-chat-delete]'), 'moderation remove controls must remain available');
});

test('LIVE chat auto-scrolls only while the viewer is already near the newest messages', () => {
  assert.match(app, /const wasNearBottom=!list\.dataset\.liveChatInitialized\|\|list\.scrollHeight-list\.scrollTop-list\.clientHeight<=72/);
  assert.match(app, /if\(wasNearBottom\)list\.scrollTop=list\.scrollHeight/);
  assert.match(app, /list\.dataset\.liveChatInitialized='true'/);
});

test('LIVE chat panel gives the conversation its own flexible scroll region', () => {
  assert.match(styles, /#live-chat-panel-body>#live-chat-overlay\{[\s\S]*grid-template-rows:minmax\(0,1fr\) auto/);
  assert.match(styles, /#live-chat-panel-body>#live-chat-overlay>\.live-chat-list\{[\s\S]*min-height:0[\s\S]*overflow-y:auto/);
  assert.match(styles, /#live-chat-panel-body>#live-chat-overlay \.live-chat-line\{[\s\S]*width:100%/);
});

test('LIVE chat composer remains touch-friendly and avoids small mobile input text', () => {
  assert.match(styles, /#live-chat-panel-body>#live-chat-overlay \.live-chat-form input\{[\s\S]*font-size:16px/);
  assert.match(styles, /#live-chat-panel-body>#live-chat-overlay \.live-chat-form button\{[\s\S]*min-width:44px[\s\S]*min-height:44px/);
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*#live-chat-panel-body>#live-chat-overlay/);
  assert.match(styles, /@media\(max-height:620px\)[\s\S]*#live-chat-panel-body>#live-chat-overlay/);
});
