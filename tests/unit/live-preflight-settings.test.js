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

test('LIVE preflight offers the four requested broadcast formats in one picker', () => {
  for (const mode of ['video_audio', 'mobile_gaming', 'audio_only', 'live_studio']) {
    assert.match(app, new RegExp(`liveModeCard\\('${mode}'`));
    assert.match(server, new RegExp(`'${mode}'`));
  }
  assert.match(app, /liveMode=String\(values\.get\("broadcastType"\)/);
  assert.match(server, /const liveMode = \['video_audio', 'mobile_gaming', 'audio_only', 'live_studio'\]/);
});

test('LIVE preflight contains one compact, expandable settings area and no duplicated audience picker', () => {
  assert.match(app, /class='live-preflight-settings'/);
  assert.match(app, /name='visibility'/);
  assert.match(app, /name='board'/);
  assert.match(app, /name='aboutMe'/);
  assert.match(app, /name='quality'/);
  assert.match(app, /name='contentDisclosure'/);
  assert.equal((app.match(/name='visibility'/g) || []).length, 1);
  assert.match(styles, /\.live-preflight-group/);
  assert.match(styles, /\.live-preflight-toggle-grid/);
  assert.match(styles, /@media\(max-width:760px\)/);
});

test('LIVE setup saves the requested safety, audience, chat, gifts, guardian and recording preferences', () => {
  for (const key of [
    'practiceMode', 'noiseSuppression', 'optimizeForStability', 'markViewers',
    'communitySafety', 'moderators', 'groupChats', 'liveGifts', 'guardian',
    'liveRecordings', 'clientAcquisition', 'audienceControl'
  ]) {
    assert.match(app, new RegExp(`liveSetupToggle\\('${key}'`));
    assert.match(server, new RegExp(`${key}:`));
  }
  assert.match(server, /if \(liveSettings\.practiceMode\) visibility = 'private'/);
  assert.match(server, /!session\.liveSettings\?\.practiceMode/);
});

test('Followers visibility, gifts-off and group-chat-off are enforced by the LIVE API', () => {
  assert.match(server, /session\.visibility === 'followers'/);
  assert.match(server, /session\.visibility==='followers'/);
  assert.match(server, /liveSettings\?\.liveGifts===false/);
  assert.match(server, /liveSettings\?\.groupChats===false/);
});

test('Mobile gaming and LIVE Studio receive screen-share permissions while audio-only remains microphone-only', () => {
  assert.match(server, /liveMode === 'mobile_gaming'[\s\S]{0,150}SCREEN_SHARE/);
  assert.match(server, /session\.liveMode === 'mobile_gaming'[\s\S]{0,180}SCREEN_SHARE/);
  assert.match(app, /const cameraMode=liveMode==="video_audio"\|\|liveMode==="live_studio"/);
  assert.match(app, /const screenShareMode=liveMode==="mobile_gaming"\|\|liveMode==="live_studio"/);
  assert.match(app, /if\(role==="host"&&cameraMode\)/);
  assert.match(app, /if\(role!=="host"\|\|!\(screenShareMode\|\|liveMode==="video_audio"\)\)/);
});
