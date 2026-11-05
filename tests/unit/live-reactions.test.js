import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const server = read('src/server.js');
const styles = read('public/styles.css');

test('LIVE likes are sent by tapping the stream and chat surface, with no dedicated heart button', () => {
  assert.match(app, /class='live-stage-topbar'/);
  assert.match(app, /class='live-host-profile'/);
  assert.match(app, /class='live-like-count'/);
  assert.match(app, /id='live-reaction-count'/);
  assert.doesNotMatch(app, /id='live-heart-like'|live-heart-button|live-reaction-button/);
  assert.match(app, /stage\?\.addEventListener\("click",event=>/);
  assert.match(app, /interactiveTarget=event\.target\?\.closest\?\./);
  assert.match(app, /showLiveReaction\("heart"\)/);
  assert.match(styles, /\.live-like-count/);
});

test('Host profile, LIVE likes and power control occupy a separate row above the stage', () => {
  assert.match(app, /id='live-leave' class='live-host-power-button' aria-label='Power off LIVE for everyone' title='Power off LIVE'><svg/);
  assert.match(app, /stage\?\.insertAdjacentHTML\("beforebegin",liveStageHud\)/);
  assert.match(app, /stage\?\.insertAdjacentHTML\("beforeend",liveChatOverlay\)/);
  assert.match(styles, /\.live-video-column>\.live-stage-topbar/);
  assert.match(styles, /position:static!important/);
  assert.match(styles, /\.live-host-power-button svg/);
});

test('LIVE reactions travel over the room data channel and are validated before display', () => {
  assert.match(app, /RoomEvent\.DataReceived/);
  assert.match(app, /topic==="minglora-live-reaction"/);
  assert.match(app, /packet\?\.type!=="minglora\.live\.reaction"/);
  assert.match(app, /Object\.hasOwn\(liveReactionEmoji,packet\.reaction\)/);
  assert.match(app, /publishData\(packet,\{reliable:false,topic:"minglora-live-reaction"\}\)/);
  assert.match(app, /receivedLiveReactionAt/);
});

test('Viewer join grants data packets only and retains subscribe-only media permissions', () => {
  const joinStart = server.indexOf("let liveMatch = p.match(/^\\/api\\/live\\/sessions\\/([^/]+)\\/join");
  const joinEnd = server.indexOf("const liveConnectedMatch", joinStart);
  const joinRoute = server.slice(joinStart, joinEnd);
  assert.ok(joinStart >= 0 && joinEnd > joinStart);
  assert.match(joinRoute, /canPublish: role === 'host' \|\| role === 'guest'/);
  assert.match(joinRoute, /canPublishData: true/);
});

test('Reaction effects are transient overlays and respect reduced-motion settings', () => {
  assert.match(styles, /\.live-reaction-layer/);
  assert.match(styles, /\.live-reaction-float/);
  assert.match(styles, /@keyframes minglora-live-reaction-rise/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
});
