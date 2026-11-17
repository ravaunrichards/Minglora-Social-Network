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

test('Every supplied LIVE crop has its own complete layout selector and geometry',()=>{
  const start=liveCss.indexOf('/* FINAL NINE GUEST LAYOUTS');
  const contract=liveCss.slice(start);
  assert.ok(start>=0);
  for(const layout of nine)assert.ok(contract.includes('data-live-layout="'+layout+'"'),layout+' layout is missing');
  assert.match(contract,/full-screen[\s\S]*?display:none!important/);
  assert.match(contract,/fluid-panel[\s\S]*?right:8px/);
  assert.match(contract,/fluid-grid[\s\S]*?grid-template-columns:minmax\(0,1\.12fr\)/);
  assert.match(contract,/fixed-grid[\s\S]*?grid-template-rows:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(contract,/fixed-panel[\s\S]*?grid-template-columns:minmax\(0,1\.72fr\)/);
  assert.match(contract,/side-by-side[\s\S]*?grid-column:1\/3/);
  assert.match(contract,/spotlight[\s\S]*?grid-column:1\/\-1/);
  assert.match(contract,/roundtable-1[\s\S]*?grid-column:2!important/);
  assert.match(contract,/roundtable-2[\s\S]*?grid-column:2\/4/);
  assert.doesNotMatch(contract,/data-live-guest-layout/);
});

test('MeetWave presents all nine layouts as one mutually exclusive selector',()=>{
  const registry=meetwave.match(/const MEETING_SCREEN_LAYOUTS = \{([^}]+)\}/);
  assert.ok(registry);
  assert.deepEqual([...registry[1].matchAll(/'([^']+)'\s*:/g)].map(match=>match[1]),nine);
  assert.equal((meetwave.match(/data-mw-layout="/g)||[]).length,9);
  assert.doesNotMatch(meetwave,/MEETING_GUEST_LAYOUTS|data-mw-guest-layout|applyMeetingGuestLayout/);
  assert.match(meetwave,/function applyMeetingLayout\(layout\)/);
  assert.match(meetwave,/nine individual layouts/);
  assert.match(meetwave,/delete screen\.dataset\.guestLayout/);
  assert.match(meetwave,/delete grid\.dataset\.guestLayout/);
  assert.match(meetwave,/MEETWAVE_GUEST_LIMIT = 8/);
  assert.match(meetwave,/MEETWAVE_PARTICIPANT_LIMIT = MEETWAVE_GUEST_LIMIT \+ 1/);
});

test('MeetWave maps each of the nine original crops to independent full-stage geometry',()=>{
  const start=meetwaveCss.lastIndexOf('/* NINE COMPLETE GUEST LAYOUTS');
  const contract=meetwaveCss.slice(start);
  assert.ok(start>=0);
  for(const layout of nine){
    assert.ok(contract.includes('data-layout="'+layout+'"'),layout+' grid selector missing');
  }
  assert.match(contract,/fluid-panel[\s\S]*?right:8px!important/);
  assert.match(contract,/fluid-grid[\s\S]*?grid-template-columns:minmax\(0,1\.12fr\)/);
  assert.match(contract,/fixed-grid[\s\S]*?repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(contract,/fixed-panel[\s\S]*?grid-template-columns:minmax\(0,1\.72fr\)/);
  assert.match(contract,/side-by-side[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(contract,/spotlight[\s\S]*?grid-column:1\/\-1!important/);
  assert.match(contract,/roundtable-1[\s\S]*?grid-column:2!important/);
  assert.match(contract,/roundtable-2[\s\S]*?grid-column:2\/4!important/);
  assert.match(contract,/\.mw-meeting #mw-screen-stage\[data-screen-layout\] #mw-grid/);
  assert.match(contract,/:is\(\.live-guest-seat\.is-guest,\.mw-empty-seat\)/);
  assert.doesNotMatch(contract,/data-guest-layout=/);
  assert.doesNotMatch(meetwaveCss,/MeetWave correction: equal-size host and guest seats in every preset/);
});

test('Roundtable is not added to the Profile Style Library',()=>{
  const start=app.indexOf('const PROFILE_SCREEN_LAYOUT_OPTIONS = Object.freeze([');
  const end=app.indexOf('const PROFILE_SCREEN_LAYOUT_IDS',start);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(app.slice(start,end),/roundtable-1|roundtable-2/);
  assert.match(server,/PROFILE_SCREEN_LAYOUT_IDS=\['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight'\]/);
});
