import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = fs.readFileSync(path.join(root, 'public/live-tiktok-compact.css'), 'utf8');
const fix = css.slice(css.lastIndexOf('/* LIVE HUD recovery:'));

test('Mobile LIVE keeps host identity and Likes in the same visible row', () => {
  assert.match(fix, /live-stage-top-left[\s\S]*?top:76px!important/);
  assert.match(fix, /live-host-profile>span[\s\S]*?flex-direction:row!important/);
  assert.match(fix, /live-like-control[\s\S]*?position:relative!important;top:auto!important;right:auto!important/);
  assert.match(fix, /live-like-control>small\{display:none!important\}/);
});

test('Host End LIVE power control remains visible, clickable and on the HUD row', () => {
  assert.match(fix, /live-stage-top-actions[\s\S]*?top:76px!important/);
  assert.match(fix, /live-host-power-button[\s\S]*?visibility:visible!important;opacity:1!important;pointer-events:auto!important/);
  assert.match(fix, /live-host-power-button svg[\s\S]*?visibility:visible!important;opacity:1!important/);
});

test('Fluid Panel has one dominant host tile and a vertical guest rail', () => {
  assert.match(fix, /data-live-layout="fluid-panel"[\s\S]*?grid-template-columns:minmax\(0,2\.15fr\) minmax\(110px,\.85fr\)!important/);
  assert.match(fix, /data-live-layout="fluid-panel"\]>.live-guest-seat\.is-host\{\s*grid-column:1!important;grid-row:2\/10!important/);
  assert.match(fix, /data-live-layout="fluid-panel"\]>.live-guest-seat\.is-guest,[\s\S]*?grid-column:2!important/);
});

test('Fluid and Fixed Grid use equal tiles and compact two-column phone grids', () => {
  assert.match(fix, /data-live-layout="fluid-grid"[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\))!important/);
  assert.match(fix, /data-live-layout="fixed-grid"[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\))!important/);
  assert.match(fix, /@media\(max-width:900px\)[\s\S]*?data-live-layout="fluid-grid",[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\))!important/);
});
