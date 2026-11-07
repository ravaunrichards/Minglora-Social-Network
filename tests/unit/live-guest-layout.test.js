import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');

test('Minglora LIVE Full Screen starts host-only and adds seats only for active guest speakers', () => {
  assert.match(app, /let activeLiveScreenLayout='full-screen'/);
  assert.match(app, /const fullScreenHostOnly=activeLiveScreenLayout==="full-screen"&&!root\.closest\("\.live-audio-stage"\)/);
  assert.match(app, /function participantHasLiveStageMedia\(participant\)/);\n  assert.match(app, /isLiveMedia&&\(publication\?\.track\|\|publication\?\.isSubscribed===true\)/);\n  assert.match(app, /if\(role==="guest"&&local&&participantHasLiveStageMedia\(local\)\)guests\.push\(local\)/);
  assert.match(app, /root\.classList\.toggle\("has-active-guests",fullScreenHostOnly&&guests\.length>0\)/);
  assert.match(app, /if\(!fullScreenHostOnly\)while\(specs\.length<9\)/);
  assert.match(app, /if\(fullScreenHostOnly\)root\.replaceChildren\(\.\.\.nodes\)/);
  assert.match(app, /data-open-guest-panel/);
  assert.match(app, /#live-guests-toggle/);
});

test('Guest camera tracks attach to their participant seat and disappear on unsubscribe or disconnect', () => {
  assert.match(app, /\.live-guest-seat-media/);
  assert.match(app, /seat\?\.classList\.add\("has-video"\)/);
  assert.match(app, /TrackUnsubscribed,track=>\{track\.detach\(\)\.forEach/);
  assert.match(app, /ParticipantDisconnected/);
  assert.match(app, /refreshSpeakerRoster\(\);attachLiveTrack\(track,participant,false,publication\);refreshSpeakerRoster\(\)/);
  assert.match(app, /activeLiveScreenLayout==="full-screen"\?null:\$\("#live-video-stage"\)/);
});

test('Full Screen host stage fills the available area and active guest tiles remain responsive', () => {
  assert.match(styles, /#live-guest-layout\[data-live-layout="full-screen"\]\.live-host-only-layout/);
  assert.match(styles, /\.live-host-only-layout:not\(\.has-active-guests\)/);
  assert.match(styles, /\.live-host-only-layout\.has-active-guests\.has-many-guests/);
  assert.match(styles, /@media\(max-width:640px\)/);
  assert.match(styles, /@media\(max-width:380px\)/);
});

test('Approved guests can publish camera in video LIVE and remain microphone-only in audio LIVE', () => {
  assert.match(app, /if\(role==="guest"&&canUseCamera\)\{\s*await room\.localParticipant\.setCameraEnabled\(true\)/);
  assert.match(app, /role==="guest"\)toast\(broadcastType==="audio_only"/);
  assert.match(app, /Your microphone and camera are connected/);
  assert.match(app, /audio-only LIVE does not use a camera/);
  assert.doesNotMatch(app, /camera publishing is disabled/);
});
