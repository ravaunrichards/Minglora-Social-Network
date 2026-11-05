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

test('Audio Only LIVE removes the oversized microphone and keeps the room compact', () => {
  assert.doesNotMatch(app, /live-audio-mic-model|minglora_golden_microphone\.gltf/);
  assert.doesNotMatch(styles, /\.live-audio-mic-model/);
  assert.match(app, /class='live-audio-orb'/);
  assert.match(app, /class='live-audio-host-avatar'/);
  assert.match(styles, /\.live-player-audio-only \.live-audio-stage\{[\s\S]*?min-height:0/);
  assert.match(styles, /\.live-audio-scene\{[\s\S]*?min-height:0/);
  assert.match(styles, /\.live-audio-stage \.audio-guest-layout\{[\s\S]*?height:142px/);
});


test('Host-selectable LIVE layouts expose all nine choices and persist during the room', () => {
  for (const layout of ['full_screen','fluid_panel','fluid_grid','fixed_grid','fixed_panel','side_by_side','spotlight','roundtable_1','roundtable_2']) {
    assert.match(app, new RegExp("value:'"+layout+"'"));
    assert.match(styles, new RegExp('\\.live-guest-layout\\.live-layout-'+layout.replace('_','_')));
  }
  assert.match(app, /function applyLiveRoomLayout/);
  assert.match(app, /dataset\.liveLayout/);
  assert.match(app, /api\('\/live\/sessions\/'\+encodeURIComponent\(session\.id\)\+'\/settings'/);
  assert.match(server, /const liveSettingsMatch = p\.match/);
  assert.match(server, /Only the LIVE host can change room settings/);
});

test('LIVE guest permissions are enforced server-side and passed into LiveKit grants', () => {
  assert.match(server, /allowGuestRequests === false/);
  assert.match(server, /allowCoHost === false/);
  assert.match(server, /autoAcceptRequests === true/);
  assert.match(server, /prioritizeGifters === true/);
  assert.match(server, /getLivePublishSourceNames\(session\.liveMode, role, session\.broadcastType, session\.liveSettings \|\| \{\}\)/);
  assert.match(app, /guestCamera!==false/);
  assert.match(app, /topic:'minglora-live-setting'/);
});

test('Voice rings are optional and play only for newly received speaker requests', () => {
  assert.match(app, /name='voiceRings' checked/);
  assert.match(app, /\['voiceRings','Voice rings',true/);
  assert.match(app, /session\.liveSettings\?\.voiceRings!==false/);
  assert.match(app, /playCallTone\(\[620,820\],520\)/);
});
