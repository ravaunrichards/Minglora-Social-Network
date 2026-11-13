import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const app=read('public/app.js');
const server=read('src/server.js');
const liveCss=read('public/live-room-fit.css');
const meetwave=read('public/meetwave.js');
const meetwaveCss=read('public/meetwave.css');

const seven=['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight'];
const two=['roundtable-1','roundtable-2'];

test('LIVE screen and guest registries are disjoint and exact',()=>{
  const screen=app.match(/const LIVE_SCREEN_LAYOUT_OPTIONS=Object\.freeze\(\[([\s\S]*?)\]\);/);
  const guest=app.match(/const LIVE_GUEST_LAYOUT_OPTIONS=Object\.freeze\(\[([\s\S]*?)\]\);/);
  assert.ok(screen&&guest);
  assert.deepEqual([...screen[1].matchAll(/value:'([^']+)'/g)].map(match=>match[1]),seven);
  assert.deepEqual([...guest[1].matchAll(/value:'([^']+)'/g)].map(match=>match[1]),two);
  assert.match(server,/LIVE_SCREEN_LAYOUTS=\['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight'\]/);
  assert.match(server,/LIVE_GUEST_LAYOUTS=\['roundtable-1','roundtable-2'\]/);
});

test('LIVE persists both values through separate host-authorized endpoints and realtime topics',()=>{
  assert.match(server,/const liveLayoutMatch = p\.match/);
  assert.match(server,/const liveGuestLayoutMatch = p\.match/);
  assert.match(server,/Only the LIVE host can change the screen layout/);
  assert.match(server,/Only the LIVE host can change the guest-box layout/);
  assert.match(server,/session\.liveLayout = layout/);
  assert.match(server,/session\.liveGuestLayout = layout/);
  assert.match(app,/topic:"minglora-live-layout"/);
  assert.match(app,/topic:"minglora-live-guest-layout"/);
  assert.match(app,/applyLiveScreenLayout\(nextLayout\)/);
  assert.match(app,/applyLiveGuestLayout\(nextLayout\)/);
});

test('LIVE screen CSS owns columns and rows while Roundtable CSS only positions the host',()=>{
  const contract=liveCss.slice(liveCss.indexOf('/* FINAL SEVEN-PLUS-TWO CONTRACT'));
  assert.ok(contract.includes('data-live-layout="full-screen"'));
  for(const layout of seven)assert.ok(contract.includes('data-live-layout="'+layout+'"'),layout+' screen template missing');
  const guest=contract.slice(contract.indexOf('/* Guest-box modes only position'));
  const end=guest.indexOf('/* END FINAL LIVE LAYOUT INDEPENDENCE CONTRACT. */');
  assert.ok(end>0);
  const guestRules=guest.slice(0,end);
  for(const layout of two)assert.ok(guestRules.includes('data-live-guest-layout="'+layout+'"'));
  assert.doesNotMatch(guestRules,/grid-template-(columns|rows)/);
  assert.match(guestRules,/grid-column:2/);
  assert.match(guestRules,/grid-column:span 2/);
});

test('MeetWave screen and guest registries are disjoint and exact',()=>{
  const screen=meetwave.match(/const MEETING_SCREEN_LAYOUTS = \{([^}]+)\}/);
  const guest=meetwave.match(/const MEETING_GUEST_LAYOUTS = \{([^}]+)\}/);
  assert.ok(screen&&guest);
  assert.deepEqual([...screen[1].matchAll(/'([^']+)'\s*:/g)].map(match=>match[1]),seven);
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
  assert.doesNotMatch(guestRules,/grid-template-(columns|rows)/);
});

test('No Roundtable identifier is present in the Profile Style Library screen-layout registry',()=>{
  const start=app.indexOf('const PROFILE_SCREEN_LAYOUT_OPTIONS = Object.freeze([');
  const end=app.indexOf('const PROFILE_SCREEN_LAYOUT_IDS',start);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(app.slice(start,end),/roundtable-1|roundtable-2/);
  assert.match(server,/PROFILE_SCREEN_LAYOUT_IDS=\['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight'\]/);
});
