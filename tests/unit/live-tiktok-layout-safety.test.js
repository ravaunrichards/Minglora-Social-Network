import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = fs.readFileSync(path.join(root, 'public/live-tiktok-compact.css'), 'utf8');
const fix = css.slice(css.lastIndexOf('/* LIVE HUD recovery:'));
const guardrails = fs.readFileSync(path.join(root, 'public/live-interface-guardrails.css'), 'utf8');

test('Mobile LIVE keeps host name and heart/count in the same row, with LIVE NOW below the name', () => {
  assert.ok(guardrails.includes('top:84px!important'));
  assert.ok(guardrails.includes('live-host-identity-copy'));
  assert.ok(guardrails.includes('live-host-live-status'));
  assert.ok(guardrails.includes('live-like-control>small{display:none!important}'));
  assert.ok(!app.includes("<small>likes</small>"));
});

test('Host End LIVE control is inside the LIVE panel header, not over the video', () => {
  const panelStart = app.indexOf("id='live-fullscreen-chat-slot'");
  const panelEnd = app.indexOf('</aside></div>', panelStart);
  const panel = app.slice(panelStart, panelEnd);
  const hudStart = app.indexOf('const liveStageHud=');
  const hudEnd = app.indexOf('const liveChatOverlay=', hudStart);
  const hud = app.slice(hudStart, hudEnd);
  assert.ok(panel.includes("class='live-panel-end-button'"));
  assert.ok(panel.indexOf('live-fullscreen-side-head') < panel.indexOf("id='live-leave'"));
  assert.doesNotMatch(hud, /live-host-power-button|id='live-leave'/);
  assert.ok(guardrails.includes('.live-panel-end-button svg'));
  assert.ok(guardrails.includes('live-fullscreen-side-head{'));
  assert.ok(guardrails.includes('inset:36px 0 0 0!important'));
});

test('Fluid Panel has one dominant host tile and a vertical guest rail', () => {
  assert.ok(fix.includes('grid-template-columns:minmax(0,2.15fr) minmax(110px,.85fr)!important'));
  assert.ok(fix.includes('grid-column:1!important;grid-row:2/10!important'));
  assert.ok(fix.includes('grid-column:2!important'));
});

test('Fluid and Fixed Grid use equal tiles and compact two-column phone grids', () => {
  assert.ok(fix.includes('grid-template-columns:repeat(3,minmax(0,1fr))!important'));
  assert.ok(fix.includes('grid-template-rows:26px repeat(3,minmax(0,1fr))!important'));
  const phoneLayouts = fix.slice(fix.lastIndexOf('@media(max-width:900px)'));
  assert.ok(phoneLayouts.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'));
  assert.ok(phoneLayouts.includes('grid-template-rows:24px repeat(5,minmax(0,1fr))!important'));
});
