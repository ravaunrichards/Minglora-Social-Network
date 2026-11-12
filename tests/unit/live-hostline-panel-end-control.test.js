import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/live-interface-guardrails.css'), 'utf8');

const hudStart = app.indexOf('const liveStageHud=');
const hudEnd = app.indexOf('const liveChatOverlay=', hudStart);
const hud = app.slice(hudStart, hudEnd);
const panelStart = app.indexOf("id='live-fullscreen-chat-slot'");
const panelEnd = app.indexOf('</aside></div>', panelStart);
const panelMarkup = app.slice(panelStart, panelEnd);

test('LIVE host name, heart and count share the first line; LIVE NOW stays on its own line', () => {
  assert.ok(hudStart >= 0 && hudEnd > hudStart, 'LIVE HUD markup remains present');
  assert.match(hud, /class='live-host-identity-copy'><strong>/);
  assert.match(hud, /class='live-host-live-status'><i class='live-host-live-dot'><\/i> LIVE NOW/);
  assert.match(hud, /live-host-profile-wrap[\s\S]*?live-like-control live-like-count/);
  assert.match(hud, /id='live-heart-like'[\s\S]*?id='live-reaction-count'/);
  assert.doesNotMatch(hud, /<small>likes<\/small>/i);
});

test('End LIVE power action is inside the side-panel header, not the floating video HUD', () => {
  assert.ok(panelStart >= 0 && panelEnd > panelStart, 'LIVE side panel markup remains present');
  assert.match(panelMarkup, /live-fullscreen-side-head[\s\S]*?live-fullscreen-side-tabs[\s\S]*?id='live-leave'[\s\S]*?class='live-panel-end-button'/);
  assert.doesNotMatch(hud, /live-host-power-button|id='live-leave'/);
  assert.equal((app.match(/id='live-leave'/g) || []).length, 1, 'only one End LIVE control is rendered');
  assert.match(app, /\$\("#live-leave"\)\?\.addEventListener\("click",async\(\)=>/);
});

test('The broadcast title retains a dedicated top header above the host HUD safe zone', () => {
  assert.match(app, /class='live-player-header'[\s\S]*?esc\(session\.title\)/);
  assert.ok(css.indexOf('live-player-header') < css.indexOf('top:84px!important'));
  assert.match(css, /live-player-header[\s\S]*?z-index:80!important/);
  assert.match(css, /live-session-meta\{z-index:62!important\}/);
  assert.match(css, /live-stage-top-left\{[\s\S]*?top:84px!important/);
});

test('Final panel styles reserve space for End LIVE without covering panel contents', () => {
  assert.match(css, /live-fullscreen-side-head\{[\s\S]*?display:flex!important;flex:0 0 46px!important/);
  assert.match(css, /live-panel-end-button\{[\s\S]*?display:inline-flex!important/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*?live-fullscreen-side-head\{[\s\S]*?top:-38px!important/);
  assert.match(css, /live-host-power-button\{display:none!important\}/);
});

test('The final stylesheet and updated LIVE script are cache-busted and loaded in order', () => {
  const finalStyle = html.indexOf('/live-interface-guardrails.css?v=20261112-live-hostline-panel-1');
  const lastPriorStyle = html.lastIndexOf('.css?v=');
  assert.ok(finalStyle >= 0 && finalStyle > lastPriorStyle);
  assert.ok(html.includes('/app.js?v=20261112-live-hostline-panel-1'));
});
