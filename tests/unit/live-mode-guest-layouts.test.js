import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const fit=read('public/live-room-fit.css');
const modeCss=read('public/live-mode-guest-layouts.css');
const index=read('public/index.html');
const worker=read('public/sw.js');
const settings=read('backend/modules/live/settings.js');

test('Audio Only Roundtable 1 and 2 use the current unified guest layout attribute',()=>{
  for(const layout of ['roundtable-1','roundtable-2']){
    assert.ok(modeCss.includes('audio-guest-layout[data-live-layout="'+layout+'"]'),layout+' must have an Audio Only grid');
  }
  assert.doesNotMatch(fit,/live-audio-stage[^}]*data-live-guest-layout="roundtable-[12]"/);
  assert.match(modeCss,/roundtable-1[\s\S]*?grid-column:2!important;grid-row:2!important/);
  assert.match(modeCss,/roundtable-2[\s\S]*?grid-column:2!important;grid-row:4!important/);
});

test('Audio Only stays camera-free and retains its dedicated guest stage and speaker roster',()=>{
  assert.match(app,/broadcastType==="audio_only"[\s\S]*?live-audio-stage/);
  assert.match(app,/class='live-guest-layout audio-guest-layout'/);
  assert.match(settings,/if \(mode === 'audio_only'\) return \['MICROPHONE'\]/);
});

test('Mobile Gaming and Live Studio keep shared media on the main canvas with a compact guest rail',()=>{
  for(const mode of ['mobile_gaming','live_studio']){
    assert.ok(modeCss.includes('live-mode-'+mode+'.has-live-screen-share #live-screen-share-stage'),mode+' main screen stage');
    assert.ok(modeCss.includes('live-mode-'+mode+'.has-live-screen-share #live-guest-layout'),mode+' guest rail');
  }
  assert.match(modeCss,/grid-auto-flow:column!important/);
  assert.match(modeCss,/grid-auto-columns:clamp\(68px,9vw,112px\)!important/);
  assert.match(modeCss,/overflow-x:auto!important/);
  assert.match(modeCss,/@media\(max-width:760px\)/);
  assert.match(settings,/mode === 'mobile_gaming'/);
  assert.match(settings,/role === 'host'\s*\? \['MICROPHONE', 'CAMERA', 'SCREEN_SHARE'\]/);
});

test('Mode-aware LIVE CSS loads after the existing stage rules and is precached',()=>{
  const existing=index.indexOf('/live-tiktok-compact.css?v=20261117-live-guest-clearance-5');
  const mode=index.indexOf('/live-mode-guest-layouts.css?v=20261117-live-mode-guest-layout-fix-1');
  assert.ok(existing>=0&&mode>existing,'mode rules must win the existing CSS cascade');
  assert.ok(worker.includes("SHELL.push('/live-mode-guest-layouts.css?v=20261117-live-mode-guest-layout-fix-1')"));
  assert.match(worker,/CACHE_NAME='minglora-shell-v356-self-updating-1'/);
  assert.ok(index.includes('live-room-fit.css?v=20261117-audio-roundtable-layout-attrs-1'));
  assert.ok(worker.includes('live-room-fit.css?v=20261117-audio-roundtable-layout-attrs-1'));
});
