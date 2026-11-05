import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const styles = read('public/styles.css');

test('Goody Bags and Treasure Boxes are inside the optional LIVE settings drawer, not the always-visible community column', () => {
  const drawerStart = app.indexOf("const liveToolsDrawer=");
  const drawerEnd = app.indexOf("setContent(", drawerStart);
  const drawer = app.slice(drawerStart, drawerEnd);
  assert.ok(drawerStart >= 0 && drawerEnd > drawerStart);
  assert.match(drawer, /live-reward-panel/);
  assert.match(drawer, /live-reward-create-form/);
  assert.match(app, /id='live-tools-backdrop' class='live-tools-backdrop hidden'/);
  assert.doesNotMatch(app.slice(app.indexOf("<aside class='live-community-panel'"), drawerStart), /live-reward-panel|live-reward-create-form/);
});

test('LIVE settings drawer opens from settings, guest and gift shortcuts and closes accessibly', () => {
  assert.match(app, /id='live-settings-toggle'/);
  assert.match(app, /openLiveToolsPanel\(\)/);
  assert.match(app, /id='live-tools-close'/);
  assert.match(app, /aria-modal='true'/);
  assert.match(app, /event\.key==="Escape"/);
  assert.match(app, /data-live-tools-target='#live-reward-panel'/);
  assert.doesNotMatch(app, /live-rewards-toggle/);
});

test('Guest tools, gift catalogue and reward setup share the drawer while chat remains in the main room column', () => {
  assert.match(app, /liveToolsNavigation/);
  assert.match(app, /speakerTools\+rewardTools\+liveGiftTools/);
  assert.match(app, /id='live-chat-list'/);
  assert.match(app, /id='live-chat-form'/);
});

test('Room audio has a working mute/unmute control that does not change microphone publishing', () => {
  assert.match(app, /id="live-audio-toggle"/);
  assert.match(app, /liveAudioMuted=!liveAudioMuted/);
  assert.match(app, /querySelectorAll\("audio,video"\)/);
  assert.match(app, /element\.muted=liveAudioMuted/);
  assert.match(app, /live-audio-root/);
});

test('LIVE settings drawer is responsive and scrolls independently without shrinking the stream', () => {
  assert.match(styles, /\.live-tools-backdrop/);
  assert.match(styles, /\.live-tools-drawer/);
  assert.match(styles, /\.live-tools-content/);
  assert.match(styles, /@media\(max-width:760px\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});
