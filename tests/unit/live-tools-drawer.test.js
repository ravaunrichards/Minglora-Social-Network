import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const styles = read('public/styles.css');
const compact = read('public/live-room-compact.css');
const liveGuardrails = read('public/live-interface-guardrails.css');

test('Goody Bags and Treasure Boxes are only mounted in the optional LIVE settings drawer', () => {
  assert.match(app, /const rewardTools=!giftsEnabled\?"":.*live-reward-panel/s);
  assert.match(app, /const liveToolsDrawer=.*speakerTools\+rewardTools\+liveGiftTools/s);
  assert.match(app, /id='live-tools-backdrop' class='live-tools-backdrop hidden'/);
  const roomMarkup = app.slice(app.indexOf('setContent("<section id=\'live-player-shell\' class=\'live-player-shell'), app.indexOf('const room=new client.Room'));
  assert.doesNotMatch(roomMarkup, /live-reaction-bar|live-reaction-buttons|live-community-panel/);
  assert.match(app, /const liveStageHud=/);
  assert.match(app, /class='live-host-profile'/);
  assert.match(app, /class='live-like-control live-like-count'/);
  assert.match(app, /id='live-heart-like'/);
  assert.doesNotMatch(app, /live-heart-button|live-reaction-button/);
  assert.match(app, /stage\?\.addEventListener\("click",event=>/);
  const panelStart = app.indexOf("id='live-fullscreen-chat-slot'");
  const panelEnd = app.indexOf('</aside></div>', panelStart);
  const panelMarkup = app.slice(panelStart, panelEnd);
  assert.ok(panelMarkup.includes("class='live-panel-end-button'"));
  assert.ok(panelMarkup.indexOf('live-fullscreen-side-head') < panelMarkup.indexOf("id='live-leave'"));
  assert.doesNotMatch(app, /live-host-power-button/);
  assert.doesNotMatch(app.slice(app.indexOf('const liveStageHud='), app.indexOf('const liveChatOverlay=')), /id='live-leave'/);
  assert.match(styles, /\.live-video-column>\.live-stage-topbar/);
  assert.match(app, /class='live-chat-overlay'/);
  assert.ok(app.includes('stage?.insertAdjacentHTML("beforebegin",liveStageHud)'));
  assert.ok(app.includes('liveChatPanel?.insertAdjacentHTML("beforeend",liveChatOverlay)'));
  assert.doesNotMatch(app, /stage\?\.insertAdjacentHTML\("beforeend",liveChatOverlay\)/);
  assert.match(compact, /\.live-fullscreen-chat-slot\{[\s\S]*flex-direction:column!important/);
  assert.match(liveGuardrails, /\.live-panel-end-button\{[\s\S]*display:inline-flex!important/);
  assert.match(roomMarkup, /liveToolsDrawer/);
});

test('Co-host Match, guest and gift controls open one accessible drawer and rewards have no permanent shortcut', () => {
  assert.match(app, /liveControlButton\("live-cohost-toggle","cohost","Open Co-host Match requests"/);
  assert.match(app, /\$\("#live-cohost-toggle"\)\?\.addEventListener\("click",\(\)=>openLiveToolsPanel\("#live-speaker-request-panel"\)\)/);
  assert.match(app, /let activeLiveToolsTrigger=null/);
  assert.match(app, /activeLiveToolsTrigger\?\.setAttribute\("aria-expanded","true"\)/);
  assert.match(app, /if\(trigger\?\.isConnected\)trigger\.focus\(\)/);
  assert.doesNotMatch(app, /liveControlButton\("live-settings-toggle"/);
  assert.match(app, /id='live-tools-close'/);
  assert.match(app, /aria-modal='true'/);
  assert.match(app, /event\.key==="Escape"/);
  assert.match(app, /data-live-tools-target='#live-reward-panel'/);
  assert.doesNotMatch(app, /live-rewards-toggle/);
});

test('Guest tools, gifts and rewards share the drawer while TikTok-style chat stays in the right-side panel', () => {
  assert.match(app, /liveToolsNavigation/);
  assert.match(app, /speakerTools\+rewardTools\+liveGiftTools/);
  assert.match(app, /id='live-chat-list'/);
  assert.match(app, /id='live-chat-form'/);
  assert.match(app, /live-chat-overlay/);
  assert.match(app, /class='live-chat-avatar'/);
  assert.match(app, /member\.avatar_url/);
  assert.ok(styles.includes(".live-chat-overlay"));
  assert.match(app, /id='live-fullscreen-chat-slot' class='live-fullscreen-chat-slot'/);
  assert.ok(app.includes('liveChatPanel?.insertAdjacentHTML("beforeend",liveChatOverlay)'));
  assert.doesNotMatch(app, /data-live-tools-panel='chat'/, 'do not duplicate Chat inside the Tools drawer');
  assert.doesNotMatch(app, /live-reaction-bar/);
  assert.match(compact, /\.live-fullscreen-chat-slot\{[\s\S]*height:100%!important/);
});

test('Room audio has a working mute/unmute control separate from microphone publishing', () => {
  assert.match(app, /liveControlButton\("live-audio-toggle","volume"/);
  assert.match(app, /liveAudioMuted=!liveAudioMuted/);
  assert.match(app, /querySelectorAll\("audio,video"\)/);
  assert.match(app, /element\.muted=liveAudioMuted/);
  assert.match(app, /live-audio-root/);
});

test('LIVE tools drawer closes on leave and is responsive on phones and desktop', () => {
  assert.match(app, /closeLiveToolsPanel\(\);renderLivePinnedComment\(null\);stopLiveChatRefresh\(\)/);
  assert.match(styles, /\.live-tools-backdrop/);
  assert.match(styles, /\.live-tools-drawer/);
  assert.match(styles, /\.live-tools-content/);
  assert.match(styles, /@media\(max-width:760px\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});

test('Host can change the LIVE stage appearance from the settings drawer using the existing room-theme API', () => {
  assert.match(app, /const liveThemeAppearance=role==="host"/);
  assert.match(app, /LIVE_ROOM_THEME_OPTIONS\.map\(option=>/);
  assert.match(app, /id='live-room-theme-select'/);
  assert.match(app, /api\("\/live\/sessions\/"\+encodeURIComponent\(session\.id\)\+"\/theme"/);
  assert.match(app, /classList\.add\("live-theme-"\+nextTheme\)/);
  assert.match(styles, /\.live-room-appearance/);
});

test('Host and approved guests can use camera controls in video LIVE rooms', () => {
  assert.match(app, /\(role==="host"\|\|role==="guest"\)&&canUseCamera\?liveControlButton\("live-camera-toggle"/);
  assert.match(app, /if\(role==="guest"&&canUseCamera\)/);
  assert.match(app, /await room\.localParticipant\.setCameraEnabled\(true\)/);
  assert.match(app, /cameraControl\.disabled=!\(\(role==="host"\|\|role==="guest"\)&&canUseCamera\)/);
  assert.match(app, /id='live-gift-panel'/);
});

test('MeetWave-style room controls absent from LIVE are active without duplicating existing controls', () => {
  assert.match(app, /liveControlButton\("live-fullscreen-toggle","fullscreen"/);
  assert.match(app, /liveFullscreenControl\?\.addEventListener\("click",async\(\)=>/);
  assert.match(app, /livePlayerShell\?\.requestFullscreen/);
  assert.match(app, /document\.removeEventListener\("fullscreenchange",liveFullscreenChangeListener\)/);
  assert.match(app, /const liveDeviceSettings="<section id='live-device-settings-panel'/);
  assert.match(app, /data-live-tools-panel-target='devices'/);
  assert.match(app, /data-live-device-kind='audioinput'/);
  assert.match(app, /data-live-device-kind='videoinput'/);
  assert.match(app, /data-live-device-kind='audiooutput'/);
  assert.match(app, /room\.switchActiveDevice\(kind,selected\)/);
  assert.match(app, /setSinkId\(selected\)/);
  assert.match(app, /setMicrophoneEnabled\(false\)/);
  assert.match(app, /setMicrophoneEnabled\(true,\{/);
  assert.match(compact, /\.live-device-settings-grid/);
});

test('LIVE room controls and layout are scoped so other Minglora pages are unchanged', () => {
  assert.match(compact, /body:has\(#live-player-shell\)/);
  assert.match(compact, /body:has\(#live-player-shell\) \.layout\{/);
  assert.match(compact, /body:has\(#live-player-shell\) \.mobile-nav\{display:none!important\}/);
  assert.match(compact, /body:has\(#live-player-shell\) #live-tools-backdrop\.hidden\{display:none!important\}/);
  assert.match(compact, /@media\(max-width:760px\)/);
  assert.match(compact, /@media\(max-height:700px\)/);
});
