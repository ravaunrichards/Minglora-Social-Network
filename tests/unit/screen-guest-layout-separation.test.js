import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const app=read('public/app.js');
const server=read('src/server.js');
const guestCss=read('public/live-tiktok-compact.css');
const meetwave=read('public/meetwave.js');
const meetwaveCss=read('public/meetwave.css');

const nine=['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'];
const seven=['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight'];
const two=['roundtable-1','roundtable-2'];

test('LIVE uses one exact nine-layout guest registry and one host layout endpoint',()=>{
  const registry=app.match(/const LIVE_GUEST_LAYOUT_OPTIONS=Object\.freeze\(\[([\s\S]*?)\]\);/);
  assert.ok(registry);
  assert.deepEqual([...registry[1].matchAll(/value:'([^']+)'/g)].map(match=>match[1]),nine);
  assert.equal((app.match(/id='live-layout-options'/g)||[]).length,1);
  assert.doesNotMatch(app,/live-guest-layout-options/);
  assert.match(server,/LIVE_SCREEN_LAYOUTS=\['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'\]/);
  assert.match(server,/Only the LIVE host can change the screen layout/);
  assert.match(app,/topic:"minglora-live-layout"/);
  assert.match(app,/function applyLiveGuestLayout\(value\)\{applyLiveScreenLayout\(value\);\}/);
});

test('All nine reference layouts define their own grid proportions, positions and seat sizing',()=>{
  const start=guestCss.indexOf('/* FINAL NINE GUEST LAYOUTS');
  const contract=guestCss.slice(start);
  assert.ok(start>=0);
  for(const layout of nine)assert.ok(contract.includes('data-live-layout="'+layout+'"'),layout+' layout is missing');
  assert.match(contract,/full-screen[\s\S]*?\.live-host-only-layout/);
  assert.match(contract,/fluid-panel[\s\S]*?bottom:calc/);
  assert.match(contract,/fluid-grid[\s\S]*?grid-template-columns:minmax\(0,2\.05fr\)/);
  assert.match(contract,/fixed-grid[\s\S]*?grid-template-rows:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(contract,/fixed-panel[\s\S]*?grid-template-columns:minmax\(0,2fr\)/);
  assert.match(contract,/side-by-side[\s\S]*?grid-column:1\/3/);
  assert.match(contract,/spotlight[\s\S]*?grid-column:1\/\-1/);
  assert.match(contract,/roundtable-1[\s\S]*?grid-column:2!important/);
  assert.match(contract,/roundtable-2[\s\S]*?grid-column:2\/4/);
  assert.doesNotMatch(contract,/data-live-guest-layout/);
});
test('MeetWave screen and guest registries are disjoint and exact',()=>{
  const screen=meetwave.match(/const MEETING_SCREEN_LAYOUTS = \{([^}]+)\}/);
  const guest=meetwave.match(/const MEETING_GUEST_LAYOUTS = \{([^}]+)\}/);
  assert.ok(screen&&guest);
  assert.deepEqual([...screen[1].matchAll(/(?:'([^']+)'|(spotlight))\s*:/g)].map(match=>match[1]||match[2]),seven);
  assert.deepEqual([...guest[1].matchAll(/'([^']+)'\s*:/g)].map(match=>match[1]),two);
  assert.match(meetwave,/MEETWAVE_GUEST_LIMIT = 8/);
  assert.match(meetwave,/MEETWAVE_PARTICIPANT_LIMIT = MEETWAVE_GUEST_LIMIT \+ 1/);
});

test('MeetWave screen CSS owns grid templates while Roundtable only positions the host',()=>{
  const contract=meetwaveCss.slice(meetwaveCss.indexOf('/* FINAL SEVEN-PLUS-TWO CONTRACT'));
  for(const layout of seven)assert.ok(contract.includes('data-screen-layout="'+layout+'"'),layout+' screen template missing');
  const guest=contract.slice(contract.indexOf('/* Roundtable modes change host-seat placement only'));
  const end=guest.indexOf('/* END FINAL MEETWAVE LAYOUT INDEPENDENCE CONTRACT. */');
  assert.ok(end>0);
  const guestRules=guest.slice(0,end);
  for(const layout of two)assert.ok(guestRules.includes('data-guest-layout="'+layout+'"'));
  assert.ok(guestRules.includes('#mw-screen-stage[data-screen-layout] #mw-grid[data-layout][data-guest-layout="roundtable-1"]'));
  assert.ok(guestRules.includes('#mw-screen-stage[data-screen-layout] #mw-grid[data-layout][data-guest-layout="roundtable-2"]'));
  assert.doesNotMatch(guestRules,/grid-template-(columns|rows)/);
});

test('No Roundtable identifier is present in the Profile Style Library screen-layout registry',()=>{
  const start=app.indexOf('const PROFILE_SCREEN_LAYOUT_OPTIONS = Object.freeze([');
  const end=app.indexOf('const PROFILE_SCREEN_LAYOUT_IDS',start);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(app.slice(start,end),/roundtable-1|roundtable-2/);
  assert.match(server,/PROFILE_SCREEN_LAYOUT_IDS=\['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight'\]/);
});
