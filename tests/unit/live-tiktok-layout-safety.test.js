import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = fs.readFileSync(path.join(root, 'public/live-tiktok-compact.css'), 'utf8');
const fix = css.slice(css.lastIndexOf('/* LIVE HUD recovery:'));

test('Mobile LIVE keeps host identity and Likes in the same visible row', () => {
  assert.ok(fix.includes('top:76px!important;left:10px!important;right:54px!important'));
  assert.ok(fix.includes('flex-direction:row!important'));
  assert.ok(fix.includes('position:relative!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;'));
  assert.ok(fix.includes('live-like-control>small{display:none!important}'));
});

test('Host End LIVE power control remains visible, clickable and on the HUD row', () => {
  assert.ok(fix.includes('top:76px!important;right:8px!important;z-index:45!important'));
  assert.ok(fix.includes('visibility:visible!important;opacity:1!important;pointer-events:auto!important;z-index:46!important;'));
  assert.ok(fix.includes('live-host-power-button svg'));
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
