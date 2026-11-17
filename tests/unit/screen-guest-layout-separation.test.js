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

test('All nine LIVE guest layouts define their own grid proportions and panel placements',()=>{
  const start=guestCss.indexOf('/* FINAL NINE GUEST LAYOUTS');
  const contract=guestCss.slice(start);
  assert.ok(start>=0);
  for(const layout of nine)assert.ok(contract.includes('data-live-layout="'+layout+'"'),layout+' layout is missing');
  assert.match(contract,/full-screen[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(contract,/@media\(max-width:760px\)[\s\S]*?full-screen[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
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

test('MeetWave exposes exactly one nine-layout selector; both Roundtables are complete guest layouts',()=>{
  const registry=meetwave.match(/const MEETING_SCREEN_LAYOUTS = Object\.freeze\(\{([^}]+)\}\);/);
  assert.ok(registry);
  const ids=[...registry[1].matchAll(/(?:'([^']+)'|(spotlight))\s*:/g)].map(match=>match[1]||match[2]);
  assert.deepEqual(ids,nine);
  for(const layout of nine){
    assert.ok(meetwave.includes('data-mw-layout="'+layout+'"'),layout+' is selectable');
    assert.ok(meetwaveCss.includes('#mw-grid[data-layout="'+layout+'"]'),layout+' has its own complete grid selector');
  }
  assert.doesNotMatch(meetwave,/activeGuestLayout|MEETING_GUEST_LAYOUTS|applyMeetingGuestLayout|data-mw-guest-layout/);
  assert.match(meetwave,/nine individual layouts/);
  assert.equal((meetwave.match(/data-mw-layout="roundtable-[12]"/g)||[]).length,2);
});

test('MeetWave nine-layout CSS uses one full-stage grid and nine independent panel arrangements',()=>{
  const start=meetwaveCss.lastIndexOf('/* NINE COMPLETE GUEST LAYOUTS');
  const contract=meetwaveCss.slice(start);
  assert.ok(start>=0,'complete nine-layout CSS contract is present');
  for(const layout of nine)assert.ok(contract.includes('data-layout="'+layout+'"'),layout+' arrangement missing');
  assert.ok(contract.includes('#mw-screen-stage[data-screen-layout] #mw-grid.live-guest-layout'));
  assert.ok(contract.includes('position:absolute!important;inset:0!important'));
  assert.ok(contract.includes('grid-template-columns:repeat(3,minmax(0,1fr))!important'));
  assert.ok(contract.includes('grid-template-columns:repeat(4,minmax(0,1fr))!important'));
  assert.ok(contract.includes('grid-template-columns:minmax(0,2.05fr) minmax(94px,.95fr)!important'));
  assert.ok(contract.includes('grid-template-columns:minmax(0,2fr) minmax(92px,.82fr)!important'));
  assert.ok(contract.includes('grid-column:1/-1!important'));
  assert.ok(contract.includes('grid-column:2/4!important'));
  assert.ok(contract.includes('grid-template-columns:minmax(70px,.78fr) minmax(0,1.45fr) minmax(0,1.45fr) minmax(70px,.78fr)!important'));
  assert.ok(contract.includes('grid-template-columns:minmax(0,1.7fr) minmax(78px,.9fr)!important'));
  assert.doesNotMatch(contract,/(?:\.live-guest-seat|\.mw-empty-seat)[^{}]*\{[^{}]*display:\s*none/i);
  assert.ok(contract.includes('>.live-guest-seat.is-host'));
  assert.ok(contract.includes('.mw-empty-seat'));
  assert.doesNotMatch(contract,/data-guest-layout=/);
  assert.match(meetwave,/MEETWAVE_GUEST_LIMIT = 8/);
  assert.match(meetwave,/MEETWAVE_PARTICIPANT_LIMIT = MEETWAVE_GUEST_LIMIT \+ 1/);
});

test('Both reference sets are served: nine original JPGs and eight retained crops, with no Full Screen crop',()=>{
  const originals=['Full Screen','Fluid Panel','Fluid Grid','Fixed Grid','Fixed Panel','Side by Side','Spotlight','Roundtable 1','Roundtable 2'];
  const crops=['Fluid Panel','Fluid Grid','Fixed Grid','Fixed Panel','Side by Side','Spotlight','Roundtable 1','Roundtable 2'];
  for(const name of originals){
    const slug=name.toLowerCase().replaceAll(' ','-');
    assert.ok(server.includes("'/assets/live-guest-layouts/"+slug+".jpg'"),name+' original JPG route missing');
    assert.ok(server.includes("'/assets/live-guest-layouts/"+slug+".png'"),name+' preview route missing');
  }
  for(const name of crops)assert.ok(server.includes("crop: '"+name+".png', original: '"+name+".jpg'"),name+' crop/original pair missing');
  assert.ok(server.includes("full-screen.png': { crop: null, original: 'Full Screen.jpg' }"));
  assert.ok(server.includes("sendGuestReference(originalFile,'image/jpeg')"));
  assert.ok(server.includes("'assets','Guests Layout',original"));
  assert.ok(server.includes("'assets','Crop References','Guests Layout',crop"));
});

test('Roundtable layouts remain outside the Profile Style Library',()=>{
  const start=app.indexOf('const PROFILE_SCREEN_LAYOUT_OPTIONS = Object.freeze([');
  const end=app.indexOf('const PROFILE_SCREEN_LAYOUT_IDS',start);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(app.slice(start,end),/roundtable-1|roundtable-2/);
  assert.match(server,/PROFILE_SCREEN_LAYOUT_IDS=\['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight'\]/);
});
