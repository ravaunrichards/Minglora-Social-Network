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

test('All nine guest layouts use their own reference proportions and seat sizing',()=>{
  const start=guestCss.indexOf('/* FINAL NINE GUEST LAYOUTS');
  const contract=guestCss.slice(start);
  assert.ok(start>=0);
  for(const layout of nine)assert.ok(contract.includes('data-live-layout="'+layout+'"'),layout+' layout is missing');
  const capacities={
    'full-screen':1,'fluid-panel':3,'fluid-grid':3,'fixed-grid':9,
    'fixed-panel':4,'side-by-side':10,'spotlight':9,'roundtable-1':9,'roundtable-2':9
  };
  for(const [layout,count] of Object.entries(capacities))assert.ok(app.includes("'"+layout+"':"+count),layout+' seat count');

  const fullScreen=contract.slice(contract.indexOf('data-live-layout="full-screen"'),contract.indexOf('data-live-layout="fluid-panel"'));
  assert.ok(fullScreen.includes('display:block!important'));
  assert.ok(fullScreen.includes('inset:0!important'));
  assert.ok(!fullScreen.includes('nth-child(n+2)'));
  assert.ok(contract.includes('right:7%!important'));
  assert.ok(contract.includes('bottom:28%!important'));
  assert.ok(contract.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important'));
  assert.ok(contract.includes('grid-template-columns:repeat(3,minmax(0,1fr))!important'));
  assert.ok(contract.includes('grid-template-columns:minmax(0,2.1fr) minmax(0,.9fr)!important'));
  assert.ok(contract.includes('grid-column:1/3!important'));
  assert.ok(contract.includes('grid-column:3/5!important'));
  assert.ok(contract.includes('grid-column:1/5!important'));
  assert.ok(contract.includes('left:29%!important'));
  assert.ok(contract.includes('width:42%!important'));
  assert.ok(contract.includes('display:none!important'));
  assert.ok(!contract.includes('data-live-guest-layout'));
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
