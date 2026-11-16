import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const app=read('public/app.js');
const server=read('src/server.js');
const liveCss=read('public/live-tiktok-compact.css');
const meetwave=read('public/meetwave.js');
const meetwaveCss=read('public/meetwave.css');
const nine=['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'];

test('LIVE has one exact nine-layout guest registry',()=>{
  const registry=app.match(/const LIVE_GUEST_LAYOUT_OPTIONS=Object\.freeze\(\[([\s\S]*?)\]\);/);
  assert.ok(registry);
  assert.deepEqual([...registry[1].matchAll(/value:'([^']+)'/g)].map(match=>match[1]),nine);
  assert.equal((app.match(/id='live-layout-options'/g)||[]).length,1);
  assert.doesNotMatch(app,/live-guest-layout-options/);
  assert.match(server,/LIVE_SCREEN_LAYOUTS=\['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'\]/);
  assert.match(app,/topic:"minglora-live-layout"/);
  assert.match(app,/function applyLiveGuestLayout\(value\)\{applyLiveScreenLayout\(value\);\}/);
});

test('LIVE applies the nine original crop geometries to its guest seats',()=>{
  const contract=liveCss.slice(liveCss.indexOf('/* LIVE CROPPED NINE GUEST LAYOUTS'));
  for(const layout of nine)assert.ok(contract.includes('data-live-layout="'+layout+'"'),layout+' LIVE geometry missing');
  assert.ok(contract.includes('data-live-layout="full-screen"]>.live-guest-seat:not(.is-host){display:none!important}'));
  assert.ok(contract.includes('data-live-layout="fluid-panel"]>.live-guest-seat[data-seat-index="1"]'));
  assert.ok(contract.includes('data-live-layout="fluid-panel"]>.live-guest-seat[data-seat-index="2"]'));
  assert.ok(contract.includes('data-live-layout="fluid-grid"]>.live-guest-seat.is-host{grid-column:1!important;grid-row:1/3!important}'));
  assert.ok(contract.includes('data-live-layout="fixed-grid"]{\n  display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))'));
  assert.ok(contract.includes('data-live-layout="fixed-panel"]>.live-guest-seat.is-host{grid-column:1!important;grid-row:1/4!important}'));
  assert.ok(contract.includes('data-live-layout="side-by-side"]>.live-guest-seat[data-seat-index="0"]{grid-column:1/3!important'));
  assert.ok(contract.includes('data-live-layout="spotlight"]>.live-guest-seat.is-host{grid-column:1/-1!important;grid-row:1!important}'));
  assert.ok(contract.includes('data-live-layout="roundtable-1"]>.live-guest-seat.is-guest{'));
  assert.ok(contract.includes('data-live-layout="roundtable-2"]{\n  grid-template-columns:minmax(0,1fr) minmax(0,1.7fr) minmax(0,1fr)'));
  assert.ok(app.includes("src='/assets/live-guest-layouts/"+'"+option.value+".png'));
  assert.ok(app.includes('seat.dataset.seatIndex=String(spec.seatIndex??0)'));
});

test('MeetWave uses the same exact nine crop-backed guest layouts as LIVE',()=>{
  const registry=meetwave.match(/const MEETING_GUEST_LAYOUTS = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(registry);
  assert.deepEqual([...registry[1].matchAll(/'([^']+)'\s*:/g)].map(match=>match[1]),nine);
  assert.match(meetwave,/const MEETING_SCREEN_LAYOUTS = MEETING_GUEST_LAYOUTS/);
  assert.equal((meetwave.match(/data-mw-guest-layout="/g)||[]).length,9);
  assert.doesNotMatch(meetwave,/data-mw-layout="/);
  for(const layout of nine)assert.ok(meetwave.includes('src="/assets/live-guest-layouts/'+layout+'.png"'),layout+' MeetWave crop preview missing');
  assert.match(meetwave,/function applyMeetingGuestLayout\(layout\)/);
  assert.match(meetwave,/screen\.dataset\.guestLayout=layout/);
  assert.match(meetwave,/grid\.dataset\.guestLayout=layout/);
  assert.match(meetwave,/MEETWAVE_GUEST_LIMIT = 8/);
  assert.match(meetwave,/MEETWAVE_PARTICIPANT_LIMIT = MEETWAVE_GUEST_LIMIT \+ 1/);
});

test('MeetWave renders nine independently-defined guest panel/grid arrangements',()=>{
  const start=meetwaveCss.indexOf('/* CROPPED NINE GUEST LAYOUTS');
  const contract=meetwaveCss.slice(start);
  assert.ok(start>=0);
  for(const layout of nine){
    assert.ok(contract.includes('data-guest-layout="'+layout+'"'),layout+' MeetWave guest grid missing');
    assert.ok(contract.includes('#mw-grid[data-guest-layout="'+layout+'"]'),layout+' is not applied to its guest grid');
  }
  assert.ok(contract.includes('#mw-grid[data-guest-layout="fluid-panel"]>.live-guest-seat[data-seat-index="1"]'));
  assert.ok(contract.includes('#mw-grid[data-guest-layout="fluid-panel"]>.live-guest-seat[data-seat-index="2"]'));
  assert.ok(contract.includes('#mw-grid[data-guest-layout="fluid-grid"]{\n  grid-template-columns:minmax(0,1.25fr) minmax(0,.9fr)'));
  assert.ok(contract.includes('#mw-grid[data-guest-layout="fixed-grid"]{\n  grid-template-columns:repeat(3,minmax(0,1fr))'));
  assert.ok(contract.includes('#mw-grid[data-guest-layout="fixed-panel"]>.live-guest-seat[data-seat-index="3"]'));
  assert.ok(contract.includes('#mw-grid[data-guest-layout="side-by-side"]>.live-guest-seat[data-seat-index="0"]{grid-column:1/3!important'));
  assert.ok(contract.includes('#mw-grid[data-guest-layout="spotlight"]>.live-guest-seat.is-focused{grid-column:1/-1!important'));
  assert.ok(contract.includes('#mw-grid[data-guest-layout="roundtable-1"]>.live-guest-seat.is-host{'));
  assert.ok(contract.includes('#mw-grid[data-guest-layout="roundtable-2"]{\n  grid-template-columns:minmax(0,1fr) minmax(0,1.7fr) minmax(0,1fr)'));
});

test('Profile Style Library screen modes remain independent from MeetWave guest presets',()=>{
  const start=app.indexOf('const PROFILE_SCREEN_LAYOUT_OPTIONS = Object.freeze([');
  const end=app.indexOf('const PROFILE_SCREEN_LAYOUT_IDS',start);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(app.slice(start,end),/roundtable-1|roundtable-2/);
  assert.match(server,/PROFILE_SCREEN_LAYOUT_IDS=\['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight'\]/);
});
