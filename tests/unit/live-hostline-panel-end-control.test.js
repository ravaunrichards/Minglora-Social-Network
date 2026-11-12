import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/live-interface-guardrails.css'), 'utf8');
const layoutV2 = css.slice(css.lastIndexOf('/* Responsive LIVE layout revision 2:'));

const hudStart = app.indexOf('const liveStageHud=');
const hudEnd = app.indexOf('const liveChatOverlay=', hudStart);
const hud = app.slice(hudStart, hudEnd);
const panelStart = app.indexOf("id='live-fullscreen-chat-slot'");
const panelEnd = app.indexOf('</aside></div>', panelStart);
const panelMarkup = app.slice(panelStart, panelEnd);

test('LIVE host name and heart count share the first line; LIVE NOW stays below the name', () => {
  assert.ok(hudStart >= 0 && hudEnd > hudStart, 'LIVE HUD markup remains present');
  assert.match(hud, /class='live-host-identity-copy'><strong>/);
  assert.match(hud, /class='live-host-live-status'><i class='live-host-live-dot'><\\/i> LIVE NOW/);
  assert.match(hud, /live-host-profile-wrap[\\s\\S]*?live-like-control live-like-count/);
  assert.match(hud, /id='live-heart-like'[\\s\\S]*?id='live-reaction-count'/);
  assert.doesNotMatch(hud, /<small>likes<\\/small>/i);
});

test('End LIVE power action is inside the side-panel header and retains its existing handler', () => {
  assert.ok(panelStart >= 0 && panelEnd > panelStart, 'LIVE side panel markup remains present');
  assert.match(panelMarkup, /live-fullscreen-side-head[\\s\\S]*?live-fullscreen-side-tabs[\\s\\S]*?id='live-leave'[\\s\\S]*?class='live-panel-end-button'/);
  assert.doesNotMatch(hud, /live-host-power-button|id='live-leave'/);
  assert.equal((app.match(/id='live-leave'/g) || []).length, 1, 'only one End LIVE control is rendered');
  assert.match(app, /\\$\\("#live-leave"\\)\\?\\.addEventListener\\("click",async\\(\\)=>/);
});

test('Broadcast title and metadata occupy a safe zone above the LIVE content', () => {
  assert.match(app, /class='live-player-header'[\\s\\S]*?esc\\(session\\.title\\)/);
  assert.match(layoutV2, /#live-player-shell>\\.live-player-layout\\{[\\s\\S]*?inset:72px 0 0!important/);
  assert.match(css, /live-player-header[\\s\\S]*?z-index:80!important/);
  assert.match(css, /live-session-meta\\{z-index:62!important\\}/);
});

test('Host row, video stage and controls have separate flow rows on phones', () => {
  assert.ok(layoutV2.length > 0, 'the final responsive layout override is present');
  assert.match(layoutV2, /@media\\(max-width:900px\\)[\\s\\S]*?grid-template-rows:minmax\\(220px,1fr\\) clamp\\(150px,23dvh,190px\\)/);
  assert.match(layoutV2, /\\.live-video-column>\\.live-stage-topbar\\{[\\s\\S]*?position:relative!important;inset:auto!important;grid-column:1!important;grid-row:1!important/);
  assert.match(layoutV2, /\\.live-video-column>#live-video-stage\\{[\\s\\S]*?grid-column:1!important;grid-row:2!important/);
  assert.match(layoutV2, /\\.live-video-column>\\.live-player-controls\\.live-icon-controls\\{[\\s\\S]*?grid-row:3!important/);
  assert.doesNotMatch(layoutV2, /top:84px!important|top:-38px!important/);
});

test('Mobile LIVE panel is a contained second row; its header and chat do not float over the panel', () => {
  assert.match(layoutV2, /\\.live-fullscreen-chat-slot\\{[\\s\\S]*?position:relative!important;inset:auto!important;grid-column:1!important;grid-row:2!important/);
  assert.match(layoutV2, /\\.live-fullscreen-side-head\\{[\\s\\S]*?position:relative!important;inset:auto!important;top:auto!important/);
  assert.match(layoutV2, /\\.live-fullscreen-chat-slot>\\.live-chat-overlay,[\\s\\S]*?position:relative!important;inset:auto!important/);
  assert.match(layoutV2, /\\.live-panel-end-button\\{[\\s\\S]*?display:inline-flex!important/);
  assert.doesNotMatch(layoutV2, /live-fullscreen-side-head\\{[^}]*position:absolute/);
});

test('Final stylesheet is cache-busted and remains last in the stylesheet stack', () => {
  const finalStyle = html.indexOf('/live-interface-guardrails.css?v=20261112-live-hostline-panel-2');
  const lastPriorStyle = html.lastIndexOf('.css?v=');
  assert.ok(finalStyle >= 0 && finalStyle > lastPriorStyle);
  assert.ok(html.includes('/app.js?v=20261112-live-hostline-panel-1'));
});
