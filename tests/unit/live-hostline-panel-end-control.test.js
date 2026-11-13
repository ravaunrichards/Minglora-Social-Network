import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/live-interface-guardrails.css'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const layout = css.slice(css.lastIndexOf('/* Final no-overlap layout:'));

const hudStart = app.indexOf('const liveStageHud=');
const hudEnd = app.indexOf('const liveChatOverlay=', hudStart);
const hud = app.slice(hudStart, hudEnd);
const panelStart = app.indexOf("id='live-fullscreen-chat-slot'");
const panelEnd = app.indexOf('</aside></div>', panelStart);
const panelMarkup = app.slice(panelStart, panelEnd);

test('Host name and heart/count form the first line; LIVE NOW stays under the name', () => {
  assert.ok(hudStart >= 0 && hudEnd > hudStart, 'LIVE HUD markup remains present');
  assert.match(hud, /class='live-host-identity-copy'><strong>/);
  assert.match(hud, /class='live-host-live-status'><i class='live-host-live-dot'><\/i> LIVE NOW/);
  assert.match(hud, /live-host-profile-wrap[\s\S]*?live-like-control live-like-count/);
  assert.match(hud, /id='live-heart-like'[\s\S]*?id='live-reaction-count'/);
  assert.doesNotMatch(hud, /<small>likes<\/small>/i);
});

test('End LIVE exists once inside the LIVE panel header and retains its original handler', () => {
  assert.ok(panelStart >= 0 && panelEnd > panelStart, 'LIVE side panel markup remains present');
  assert.match(panelMarkup, /live-fullscreen-side-head[\s\S]*?live-fullscreen-side-tabs[\s\S]*?id='live-leave'[\s\S]*?class='live-panel-end-button'/);
  assert.doesNotMatch(hud, /live-host-power-button|id='live-leave'/);
  assert.equal((app.match(/id='live-leave'/g) || []).length, 1, 'only one End LIVE control is rendered');
  assert.match(app, /\$\("#live-leave"\)\?\.addEventListener\("click",async\(\)=>/);
  assert.ok(app.includes('liveChatPanel?.insertAdjacentHTML("beforeend",liveChatOverlay)'));
});

test('Broadcast title and metadata have a safe area above the host row', () => {
  assert.match(app, /class='live-player-header'[\s\S]*?esc\(session\.title\)/);
  assert.ok(layout.includes('inset:78px 0 0!important'));
  assert.ok(layout.includes('inset:70px 0 0!important'));
  assert.ok(layout.includes('top:46px!important'));
});

test('Host row, video and control dock occupy distinct flow rows on phones', () => {
  assert.ok(layout.includes('grid-template-rows:minmax(210px,1fr) clamp(150px,24dvh,220px)!important'));
  assert.ok(layout.includes('position:relative!important;inset:auto!important;grid-column:1!important;grid-row:1!important'));
  assert.ok(layout.includes('.live-video-column>#live-video-stage{'));
  assert.ok(layout.includes('grid-column:1!important;grid-row:2!important'));
  assert.ok(layout.includes('.live-player-controls.live-icon-controls{'));
  assert.ok(layout.includes('grid-column:1!important;grid-row:3!important'));
  assert.ok(!layout.includes('top:84px!important'));
});

test('LIVE panel, End LIVE header and chat are contained in the panel without covering the video', () => {
  assert.ok(layout.includes('.live-fullscreen-chat-slot{'));
  assert.ok(layout.includes('position:relative!important;inset:auto!important;grid-column:1!important;grid-row:2!important'));
  assert.ok(layout.includes('.live-fullscreen-side-head{'));
  assert.ok(layout.includes('position:relative!important;inset:auto!important;top:auto!important'));
  assert.ok(layout.includes('.live-fullscreen-chat-slot>.live-chat-overlay,'));
  assert.ok(layout.includes('position:relative!important;inset:auto!important;display:flex!important;flex:1 1 0!important'));
  assert.ok(layout.includes('.live-panel-end-button{'));
  assert.ok(layout.includes('display:inline-flex!important'));
  assert.ok(!layout.includes('top:-38px!important'));
});

test('Final stylesheet and offline service-worker shell use matching cache-busted URLs', () => {
  const styleUrl = '/live-interface-guardrails.css?v=20261112-live-hostline-final-3';
  assert.ok(html.includes(styleUrl));
  assert.ok(html.lastIndexOf(styleUrl) > html.lastIndexOf('/minglora-branding.css'));
  assert.ok(sw.includes(styleUrl));
  assert.ok(sw.includes("const CACHE_NAME='minglora-shell-v307-self-updating-1'"));
  assert.ok(html.includes('/app.js?v=20261113-live-category-icons-1'));
});
