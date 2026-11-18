import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const parity = read('public/live-audio-layout-parity.css');
const index = read('public/index.html');
const serviceWorker = read('public/sw.js');

const layouts = [
  'full-screen', 'fluid-panel', 'fluid-grid', 'fixed-grid', 'fixed-panel',
  'side-by-side', 'spotlight', 'roundtable-1', 'roundtable-2'
];

test('Audio LIVE gives the reference guest grid the complete stage', () => {
  assert.match(parity, /#live-video-stage\.live-audio-stage\{[\s\S]*?grid-template-rows:minmax\(0,1fr\)!important/);
  assert.match(parity, /#live-video-stage\.live-audio-stage>\.live-audio-scene,[\s\S]*?#live-video-stage\.live-audio-stage>#live-speaker-list\{\s*display:none!important/);
  assert.match(parity, /#live-guest-layout\.audio-guest-layout\{[\s\S]*?grid-template-rows:22px minmax\(0,1fr\)!important/);
});

test('All nine audio presets use dedicated reference panel geometries', () => {
  for (const layout of layouts) {
        const marker = '#live-guest-layout[data-live-layout="' + layout + '"]{';
    const start = parity.indexOf(marker);
    assert.ok(start >= 0, layout + ' must have its own audio layout rule');
    const end = parity.indexOf('}', start);
    const rule = parity.slice(start, end);
    assert.match(rule, /grid-template-columns:[^;]+!important/, layout + ' must define columns');
    assert.match(rule, /grid-template-rows:[^;]+!important/, layout + ' must define rows');
  }
});

test('Reference layouts show only the intended participant panels', () => {
  assert.match(parity, /data-live-layout="full-screen"[^}]*\{[^}]*grid-template-columns:[^}]*\}[\s\S]*?data-live-layout="full-screen"[^}]*display:none!important/);
  assert.match(parity, /data-live-layout="fluid-panel"[\s\S]*?nth-child\(n\+5\)[\s\S]*?display:none!important/);
  assert.match(parity, /data-live-layout="fluid-grid"[\s\S]*?nth-child\(n\+5\)[\s\S]*?display:none!important/);
  assert.match(parity, /data-live-layout="fixed-panel"[\s\S]*?nth-child\(n\+6\)[\s\S]*?display:none!important/);
  assert.match(parity, /data-live-layout="roundtable-1"[\s\S]*?grid-column:2!important;grid-row:2\/6!important/);
  assert.match(parity, /data-live-layout="roundtable-2"[\s\S]*?grid-column:2\/4!important;grid-row:2\/6!important/);
});

test('Audio LIVE controls adapt to short landscape and narrow screens', () => {
  assert.match(parity, /repeat\(auto-fit,minmax\(58px,1fr\)\)/);
  assert.match(parity, /@media\(max-width:760px\)[\s\S]*?grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/);
});

test('The new parity stylesheet loads after the legacy layout rules and is precached', () => {
  const compact = index.indexOf('/live-tiktok-compact.css');
  const parityLink = index.indexOf('/live-audio-layout-parity.css?v=20261118-audio-live-reference-grid-parity-1');
  assert.ok(compact >= 0 && parityLink > compact, 'audio parity CSS must load after compact layout CSS');
  assert.ok(serviceWorker.includes('/live-audio-layout-parity.css?v=20261118-audio-live-reference-grid-parity-1'));
  assert.match(serviceWorker, /minglora-shell-v356-audio-grid-parity-1/);
});
