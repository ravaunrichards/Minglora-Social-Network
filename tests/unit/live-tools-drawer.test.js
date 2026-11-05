import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const styles = read('public/styles.css');

test('Goody Bags and Treasure Boxes are only mounted in the optional LIVE settings drawer', () => {
  assert.match(app, /const rewardTools=!giftsEnabled\?"":.*live-reward-panel/s);
  assert.match(app, /const liveToolsDrawer=.*speakerTools\+rewardTools\+liveGiftTools/s);
  assert.match(app, /id='live-tools-backdrop' class='live-tools-backdrop hidden'/);
  const roomMarkup = app.slice(app.indexOf('setContent("<section class=\'live-player-shell'), app.indexOf('const room=new client.Room'));
  assert.doesNotMatch(roomMarkup, /live-reaction-bar|live-reaction-buttons|live-community-panel/);
  assert.match(app, /const liveStageHud=/);
  assert.match(app, /class='live-host-profile'/);
  assert.match(app, /class='live-like-count'/);
  assert.doesNotMatch(app, /id='live-heart-like'|live-heart-button|live-reaction-button/);
  assert.match(app, /stage\?\.addEventListener\("click",event=>/);
  assert.match(app, /id='live-leave' class='live-host-power-button'.*<svg/);
  assert.match(styles, /\.live-video-stage>\.live-stage-topbar/);
  assert.match(app, /class='live-chat-overlay'/);
  assert.ok(app.includes('stage?.insertAdjacentHTML("beforeend",liveStageHud)'));
  assert.match(roomMarkup, /liveToolsDrawer/);
});

test('LIVE settings, guest and gift controls open one accessible drawer and rewards have no permanent shortcut', () => {
  assert.match(app, /liveControlButton\("live-settings-toggle","settings"/);
  assert.match(app, /\$\("#live-settings-toggle"\).*openLiveToolsPanel\(\)/);
  assert.match(app, /id='live-tools-close'/);
  assert.match(app, /aria-modal='true'/);
  assert.match(app, /event\.key==="Escape"/);
  assert.match(app, /data-live-tools-target='#live-reward-panel'/);
  assert.doesNotMatch(app, /live-rewards-toggle/);
});

test('Guest tools, gifts and rewards share the drawer while TikTok-style chat overlays the video stage', () => {
  assert.match(app, /liveToolsNavigation/);
  assert.match(app, /speakerTools\+rewardTools\+liveGiftTools/);
  assert.match(app, /id='live-chat-list'/);
  assert.match(app, /id='live-chat-form'/);
  assert.match(app, /live-chat-overlay/);
  assert.match(app, /class='live-chat-avatar'/);
  assert.match(app, /member\.avatar_url/);
  assert.ok(styles.includes(".live-chat-overlay"));
  assert.doesNotMatch(app, /live-reaction-bar/);
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
