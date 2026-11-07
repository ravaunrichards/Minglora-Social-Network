import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('public/index.html');
const worker=read('public/sw.js');
const css=read('public/call-ui.css');
const app=read('public/app.js');
const server=read('src/server.js');

test('phone call stylesheet loads after global layout overrides and is precached',()=>{
  const styleTag='<link rel="stylesheet" href="/call-ui.css?v=20261107-phone-call-ui-2">';
  assert.ok(html.includes(styleTag),'the phone call stylesheet is loaded');
  assert.ok(html.indexOf(styleTag)>html.indexOf('mobile-profile-navigation.css'),'the call styles override later page layout rules');
  assert.ok(worker.includes("'/call-ui.css?v=20261107-phone-call-ui-2'"),'the service worker precaches call styles');
  assert.match(worker,/CACHE_NAME='minglora-shell-v\\d+-phone-call-ui-2'/);
});

test('incoming and outgoing ringing cards stay visible above the app shell',()=>{
  assert.match(css,/\.call-overlay\{[^}]*display:flex!important/);
  assert.match(css,/\.call-overlay\{[^}]*z-index:100000!important/);
  assert.match(css,/\.call-overlay\{[^}]*background:rgba\(3,8,18/);
  assert.match(css,/\.call-overlay\.call-ringing-overlay\{[^}]*display:flex!important/);
  assert.match(css,/\.call-overlay \.call-ringing-card\{[^}]*visibility:visible!important/);
  assert.match(css,/@media\(max-width:700px\)[\s\S]*?\.call-overlay \.call-panel\{/);
});

test('receiver polling finds invited calls and opens the in-app Answer/Decline screen',()=>{
  const incomingStart=server.indexOf("if(method==='GET'&&p==='/api/calls/incoming')");
  const incomingEnd=server.indexOf('const callStatusMatch',incomingStart);
  const route=server.slice(incomingStart,incomingEnd);
  assert.ok(incomingStart>=0&&incomingEnd>incomingStart);
  assert.match(route,/participant\.status!=='invited'/);
  assert.match(route,/caller:safeUser/);
  assert.match(app,/function startIncomingCallPolling\(\)[\s\S]*?setInterval\(pollIncomingCalls,1800\)/);
  assert.match(app,/async function pollIncomingCalls\(\)[\s\S]*?showIncomingCallOverlay\(call\)/);
  assert.match(app,/id="call-answer-incoming"/);
  assert.match(app,/id="call-decline-incoming"/);
  assert.match(app,/await answerMingloraCall\(call\.id\)/);
});

test('both sides join the same LiveKit call room and subscribe to remote media tracks',()=>{
  assert.match(app,/async function startMingloraCall\([\s\S]*?api\('\/calls'/);
  assert.match(app,/async function waitForCallAnswer\([\s\S]*?status==='active'[\s\S]*?\/join/);
  assert.match(app,/async function answerMingloraCall\([\s\S]*?\/join/);
  assert.match(app,/async function openMingloraCall\([\s\S]*?new client\.Room/);
  assert.match(app,/RoomEvent\.TrackSubscribed/);
  assert.match(app,/room\.connect\(liveKit\.url,liveKit\.token\)/);
  assert.match(app,/setMicrophoneEnabled\(true\)/);
  assert.match(app,/setCameraEnabled\(cameraEnabled\)/);
  assert.match(app,/track\.attach\(\)/);
});

test('active call overlay retains working microphone, camera, invite and hang-up controls',()=>{
  for(const id of ['call-microphone','call-camera','call-add-people','call-leave'])assert.ok(app.includes('id="'+id+'"'));
  assert.match(app,/setMicrophoneEnabled\(microphoneEnabled\)/);
  assert.match(app,/setCameraEnabled\(cameraEnabled\)/);
  assert.match(app,/\/invite/);
  assert.match(app,/id==='call-leave'|#call-leave/);
});
