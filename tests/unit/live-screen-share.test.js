import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const server=read('src/server.js');
const styles=read('public/styles.css');

test('Only the host of a video LIVE can publish a screen-share track',()=>{
  assert.match(server,/session\.broadcastType === 'audio_only' \? \[LIVEKIT_TRACK_SOURCE\.MICROPHONE\] : \[LIVEKIT_TRACK_SOURCE\.MICROPHONE, LIVEKIT_TRACK_SOURCE\.CAMERA, LIVEKIT_TRACK_SOURCE\.SCREEN_SHARE\]/);
  assert.match(app,/role==="host"&&broadcastType==="video_audio"\?liveControlButton\("live-screen-share-toggle","screen"/);
  assert.match(app,/setScreenShareEnabled\(nextEnabled/);
});

test('Screen share video is attached to the main stage and removed when sharing stops',()=>{
  assert.match(app,/function isLiveScreenSharePublication\(/);
  assert.match(app,/screenShare\?\$\("#live-screen-share-stage"\)/);
  assert.match(app,/classList\.add\("has-live-screen-share"\)/);
  assert.match(app,/classList\.remove\("has-live-screen-share"\)/);
  assert.match(app,/live-screen-share-tile/);
});

test('Shared screen keeps real host and guest seats visible in a compact stage strip',()=>{
  assert.match(app,/id='live-screen-share-stage'/);
  assert.match(styles,/\.live-video-stage\.has-live-screen-share #live-guest-layout/);
  assert.match(styles,/\.live-screen-share-tile \.live-video-element/);
  assert.match(styles,/@media\(max-width:760px\)/);
});
