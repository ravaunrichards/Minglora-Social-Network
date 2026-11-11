import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
const layoutsCss = fs.readFileSync(path.join(root, 'public/live-layout-library.css'), 'utf8');

const expected = [
  'solo-host','side-by-side','grid-2x2','grid-3x2','grid-3x3','spotlight',
  'picture-in-picture','vertical-panels','pk-battle','audio-guest-panel',
  'full-screen','fixed-grid','fluid-panel','fixed-panel','floating-guest-window',
  'horizontal-guest-strip','vertical-guest-strip','stage-layout','roundtable-1',
  'fluid-grid','screen-sharing-layout','host-chat-split','dual-host','roundtable-2'
];

test('Minglora LIVE exposes exactly 24 host-selectable responsive layouts', () => {
  const start = app.indexOf('const LIVE_SCREEN_LAYOUT_OPTIONS=Object.freeze([');
  const end = app.indexOf(']);', start);
  assert.ok(start >= 0 && end > start, 'missing LIVE layout registry');
  const registry = app.slice(start, end);
  const values = [...registry.matchAll(/\{value:'([^']+)'/g)].map(match => match[1]);
  assert.equal(values.length, 24);
  assert.deepEqual(values, expected);
  for (const label of [
    'Solo Host','Side-by-Side','2x2 Grid','3x2 Grid','3x3 Grid','Spotlight',
    'Picture-in-Picture','Vertical Panels','PK Battle','Audio Guest Panel',
    'Full-Screen Host','Equal-Sized Guest Grid','Host-Focused Grid','Speaker-Focused Layout',
    'Floating Guest Window','Horizontal Guest Strip','Vertical Guest Strip','Stage Layout',
    'Roundtable Layout','Audience Gallery','Screen-Sharing Layout',
    'Host-and-Chat Split Layout','Dual-Host Layout','Multi-Host Layout'
  ]) assert.ok(registry.includes("label:'" + label + "'"), 'missing layout label: ' + label);
});

test('The API allow-list accepts all 24 layouts while rejecting unknown layout IDs', () => {
  const match = server.match(/const LIVE_SCREEN_LAYOUTS=\[([^\]]+)\];/);
  assert.ok(match, 'missing server LIVE layout allow-list');
  const values = [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
  assert.equal(values.length, 24);
  assert.deepEqual(values, expected);
  assert.match(server, /if \(!LIVE_SCREEN_LAYOUTS\.includes\(layout\)\)/);
  assert.match(server, /Only the LIVE host can change the screen layout/);
});

test('New arrangements have dedicated layout rules and responsive phone breakpoints', () => {
  for (const value of [
    'solo-host','grid-2x2','grid-3x2','grid-3x3','picture-in-picture','vertical-panels',
    'pk-battle','audio-guest-panel','floating-guest-window','horizontal-guest-strip',
    'vertical-guest-strip','stage-layout','screen-sharing-layout','host-chat-split','dual-host'
  ]) assert.ok(layoutsCss.includes('data-live-layout="' + value + '"'), 'missing CSS arrangement: ' + value);
  assert.match(layoutsCss, /@media\(max-width:760px\)/);
  assert.match(layoutsCss, /@media\(max-width:380px\)/);
  assert.match(layoutsCss, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('Layout switching retains host authorization, persistence and LiveKit room synchronization', () => {
  assert.match(app, /await api\("\/live\/sessions\/"\+encodeURIComponent\(session\.id\)\+"\/layout"/);
  assert.match(app, /topic:"minglora-live-layout"/);
  assert.match(app, /type:"minglora\.live\.layout"/);
  assert.match(app, /participant\.identity===session\.hostId/);
  assert.match(app, /applyLiveScreenLayout\(nextLayout\)/);
  assert.match(server, /session\.liveLayout = layout/);
});


test('Stage, screen-share and host/chat layouts fit all nine generated participant seats', () => {
  assert.match(app, /guests\.slice\(0,8\)/, 'guest stage supports up to eight guests plus the host');
  assert.match(app, /while\(specs\.length<9\)/, 'guest stage preserves nine participant slots');
  assert.ok(layoutsCss.includes('grid-template-rows:22px minmax(0,1fr) repeat(2,minmax(48px,.28fr))!important;'),
    'Stage layout must fit two rows of four guest seats beneath the host');
  assert.ok(layoutsCss.includes('grid-template-columns:repeat(3,minmax(0,1fr))!important;\n  grid-template-rows:22px repeat(3,minmax(0,1fr))!important;'),
    'Screen-sharing layout must fit nine participant seats');
  assert.ok(layoutsCss.includes('grid-template-rows:22px minmax(0,1fr) repeat(3,minmax(48px,.24fr))!important;'),
    'Host/chat split must retain all guest rows');
  assert.ok(layoutsCss.includes('grid-template-rows:20px minmax(0,1fr) repeat(2,minmax(42px,.24fr))!important;'),
    'Stage layout must preserve seat capacity at phone widths');
});
