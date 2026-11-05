import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');

test('Minglora LIVE renders a nine-seat host and guest layout from real LiveKit participants', () => {
  assert.match(app, /function renderLiveGuestLayout\(/);
  assert.match(app, /const hostParticipant=role==="host"\?local:remotes\.find/);
  assert.match(app, /participantHasLiveAudio\(person\)/);
  assert.match(app, /guests\.slice\(0,8\)/);
  assert.match(app, /while\(specs\.length<9\)/);
  assert.match(app, /Multi-guest stage/);
  assert.match(app, /data-open-guest-panel/);
});

test('Video tracks attach inside their matching guest seat and clean up when unsubscribed', () => {
  assert.match(app, /\.live-guest-seat-media/);
  assert.match(app, /seat\?\.classList\.add\("has-video"\)/);
  assert.match(app, /TrackUnsubscribed,track=>\{track\.detach\(\)\.forEach/);
  assert.match(app, /renderLiveGuestLayout\(room,role,session,activeLiveSpeakerIds\)/);
});

test('Guest seats are responsive and display host, guest, speaking and open-seat states', () => {
  assert.match(styles, /\.live-guest-layout/);
  assert.match(styles, /\.live-guest-seat\.is-host/);
  assert.match(styles, /\.live-guest-seat\.is-speaking/);
  assert.match(styles, /\.live-guest-seat\.empty/);
  assert.match(styles, /@media\(max-width:760px\)/);
  assert.match(styles, /@media\(max-width:380px\)/);
});


test('Approved guests can publish camera in video LIVE and remain microphone-only in audio LIVE', () => {
  assert.match(app, /if\(role==="guest"&&canUseCamera\)\{\s*await room\.localParticipant\.setCameraEnabled\(true\)/);
  assert.match(app, /role==="guest"\)toast\(broadcastType==="audio_only"/);
  assert.match(app, /Your microphone and camera are connected/);
  assert.match(app, /audio-only LIVE does not use a camera/);
  assert.doesNotMatch(app, /camera publishing is disabled/);
});
