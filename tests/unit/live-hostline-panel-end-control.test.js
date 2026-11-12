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

test('Host name and heart/count form the first line; LIVE NOW is under the name', () => {
  assert.ok(hudStart >= 0 && hudEnd > hudStart, 'LIVE HUD markup remains present');
  assert.match(hud, /class='live-host-identity-copy'><strong>/);
  assert.match(hud, /class='live-host-live-status'><i class='live-host-live-dot'><\/i> LIVE NOW/);
  assert.match(hud, /live-host-profile-wrap[\s\S]*?live-like-control live-like-count/);
  assert.match(hud, /id='live-heart-like'[\s\S]*?id='live-reaction-count'/);
  assert.doesNotMatch(hud, /<small>likes<\/small>/i);
});

test('End LIVE exists once and is inside the LIVE panel header, not on the video HUD', () => {
  assert.ok(panelStart >= 0 && panelEnd > panelStart, 'LIVE panel markup remains present');
  assert.match(panelMarkup, /live-fullscreen-side-head[\s\S]*?live-fullscreen-side-tabs[\s\S]*?id='live-leave'[\s\S]*?class='live-panel-end-button'/);
  assert.doesNotMatch(hud, /live-host-power-button|id='live-leave'/);
  assert.equal((app.match(/id='live-leave'/g) || []).length, 1, 'exactly one End LIVE action is rendered');
  assert.match(app, /\$\("#live-leave"\)\?\.addEventListener\("click",async\(\)=>/);
  assert.ok(app.includes('liveChatPanel?.insertAdjacentHTML("beforeend",liveChatOverlay)'));
});

test('The stream title and session metadata have a separate safe zone above the host row', () => {
  assert.match(app, /class='live-player-header'[\s\S]*?esc\(session\.title\)/);
  assert.match(css, /@media\(min-width:901px\)[\s\S]*?live-player-layout\{\s*inset:78px 0 0!important/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*?live-session-meta\{\s*top:46px!important/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*?live-stage-top-left\{\s*position:absolute!important;top:84px!important/);
  assert.match(css, /live-player-header\{\s*position:absolute!important;inset:0 0 auto!important;z-index:90!important/);
});

test('End LIVE is reserved in the LIVE panel header and never overlays panel chat', () => {
  assert.match(css, /live-panel-end-button\{[\s\S]*?display:inline-flex!important/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*?live-fullscreen-side-head\{\s*position:relative!important;top:auto!important/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*?live-chat-overlay,[\s\S]*?inset:36px 0 0 0!important/);
  assert.match(css, /live-stage-top-actions,[\s\S]*?live-host-power-button\{display:none!important\}/);
  assert.match(css, /live-fullscreen-chat-slot\{\s*display:flex!important;flex-direction:column!important/);
});

test('Final guardrails load after the existing CSS stack and the application script is cache-busted', () => {
  const finalStyle = html.indexOf('/live-interface-guardrails.css?v=20261112-live-hostline-final-2');
  assert.ok(finalStyle >= 0 && html.lastIndexOf('/live-interface-guardrails.css') > html.lastIndexOf('/minglora-branding.css'));
  assert.ok(html.includes('/app.js?v=20261112-live-hostline-final-2'));
});
