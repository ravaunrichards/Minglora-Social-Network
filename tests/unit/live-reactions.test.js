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

test('LIVE likes have a white-to-red heart button and also respond to stage taps', () => {
  assert.ok(app.includes("class='live-stage-topbar "));
  assert.match(app, /class='live-host-profile'/);
  assert.match(app, /class='live-like-control live-like-count'/);
  assert.match(app, /id='live-reaction-count'/);
  assert.match(app, /id='live-heart-like'/);
  assert.match(app, /api\('\/live\/sessions\/'\+encodeURIComponent\(session\.id\)\+'\/likes'/);
  assert.match(app, /classList\.add\('is-liked'\)/);
  assert.match(styles, /\.live-heart-like\.is-liked\{color:#ff365c/);
  assert.match(app, /stage\?\.addEventListener\("click",event=>/);
  assert.match(app, /interactiveTarget=event\.target\?\.closest\?\./);
  assert.match(app, /showLiveReaction\("heart",\{count:false\}\)/);
  assert.match(styles, /\.live-like-count/);
});

test('Host identity and heart count stay in the HUD while End LIVE is reserved in the side-panel header', () => {
  const hudStart = app.indexOf('const liveStageHud=');
  const hudEnd = app.indexOf('const liveChatOverlay=', hudStart);
  const hud = app.slice(hudStart, hudEnd);
  const panelStart = app.indexOf("id='live-fullscreen-chat-slot'");
  const panelEnd = app.indexOf('</aside></div>', panelStart);
  const panel = app.slice(panelStart, panelEnd);
  assert.ok(panel.includes("class='live-panel-end-button'"));
  assert.ok(panel.indexOf("live-fullscreen-side-head") < panel.indexOf("id='live-leave'"));
  assert.doesNotMatch(hud, /live-host-power-button|id='live-leave'/);
  assert.equal((app.match(/id='live-leave'/g) || []).length, 1);
  assert.ok(!hud.includes('<small>likes</small>'));
  assert.match(app, /stage\?\.insertAdjacentHTML\("beforebegin",liveStageHud\)/);
  assert.match(app, /liveChatPanel\?\.insertAdjacentHTML\("beforeend",liveChatOverlay\)/);
  assert.doesNotMatch(app, /stage\?\.insertAdjacentHTML\("beforeend",liveChatOverlay\)/);
  assert.match(styles, /\.live-video-column>\.live-stage-topbar/);
  assert.match(styles, /position:static!important/);
  assert.ok(read('public/live-interface-guardrails.css').includes('.live-panel-end-button svg'));
});

test('LIVE reactions travel over the room data channel and are validated before display', () => {
  assert.match(app, /RoomEvent\.DataReceived/);
  assert.match(app, /topic==="minglora-live-reaction"/);
  assert.match(app, /packet\?\.type!=="minglora\.live\.reaction"/);
  assert.match(app, /Object\.hasOwn\(liveReactionEmoji,packet\.reaction\)/);
  assert.match(app, /publishData\(packet,\{reliable:false,topic:"minglora-live-reaction"\}\)/);
  assert.match(app, /receivedLiveReactionAt/);
  assert.match(app, /Number\.isFinite\(Number\(packet\.likeCount\)\)/);
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


test('Minglora LIVE exposes the nine requested switchable screen layouts', () => {
  const layouts = ['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'];
  for (const layout of layouts) {
    assert.match(app, new RegExp("value:'" + layout + "'"));
    assert.ok(styles.includes('data-live-layout="' + layout + '"'));
  }
  assert.match(server, /LIVE_SCREEN_LAYOUTS=\['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'\]/);
  assert.match(app, /function applyLiveScreenLayout/);
  assert.match(app, /topic:"minglora-live-layout"/);
  assert.match(app, /data-live-tools-panel-target='permissions'/);
});

test('Guest requests, co-host permissions, auto-accept, gifter priority and moderators are host controlled', () => {
  assert.match(app, /name='allowGuestRequests' checked/);
  assert.match(app, /name='guestCamera' checked/);
  assert.match(app, /name='autoAcceptRequests'/);
  assert.match(app, /name='prioritizeGifters'/);
  assert.match(app, /name='allowCoHost' checked/);
  assert.match(app, /name='manageModerators' checked/);
  assert.match(server, /liveRoomSettingsMatch/);
  assert.match(server, /Only the LIVE host can change room settings/);
  assert.match(server, /allowGuestRequests === false/);
  assert.match(server, /allowCoHost === false/);
  assert.match(server, /autoAcceptRequests === true/);
  assert.match(server, /prioritizeGifters === true/);
  assert.match(server, /manageModerators === false/);
  assert.match(server, /getLivePublishSourceNames\(session\.liveMode, role, session\.broadcastType, session\.liveSettings \|\| \{\}\)/);
});

test('Guest camera can be disabled by the host and voice rings can be switched off', () => {
  assert.match(app, /liveSettings\.guestCamera!==false/);
  assert.match(app, /topic==="minglora-live-setting"/);
  assert.match(app, /setCameraEnabled\(false\)/);
  assert.match(app, /name='voiceRings' checked/);
  assert.match(app, /session\.liveSettings\?\.voiceRings!==false/);
  assert.match(app, /window\.MingloraAudioEngine\?\.playEvent\('live\.host_notice',\{priority:40\}\)/);
  assert.doesNotMatch(app, /playCallTone|createOscillator/);
});
