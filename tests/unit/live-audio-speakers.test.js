import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const server = read('src/server.js');
const edge = read('supabase/functions/minglora-runtime-state/index.ts');

test('Audio LIVE shows connected microphone publishers even when nobody is actively speaking', () => {
  assert.match(app, /function participantHasLiveAudio\(/);
  assert.match(app, /function renderLiveSpeakerRoster\(/);
  assert.match(app, /room\.remoteParticipants/);
  assert.match(app, /RoomEvent\.ParticipantConnected/);
  assert.match(app, /RoomEvent\.ParticipantDisconnected/);
  assert.match(app, /RoomEvent\.ActiveSpeakersChanged/);
  assert.match(app, /refreshSpeakerRoster\(\)/);
  assert.doesNotMatch(app, /list\.innerHTML=active\.length\?active\.map/);
});

test('Minglora confirms actual LiveKit presence before persisting a connected participant', () => {
  assert.match(server, /const liveConnectedMatch = p\.match/);
  assert.match(server, /listLiveKitParticipants\(session\.roomName\)/);
  assert.match(server, /requestSupabaseState\('live_participant_mark_connected'/);
  assert.match(server, /providerParticipants\.some\(participant => participant\.identity === user\.id\)/);
  assert.match(app, /\/live\/sessions\/\"\+encodeURIComponent\(session\.id\)\+\"\/connected/);
});

test('A pending hand-raise is preserved when a listener presence heartbeat is saved', () => {
  assert.match(edge, /if\(role===\"viewer\"&&existing\?\.role===\"guest\"&&existing\.status===\"requested\"\)/);
  assert.match(edge, /requestPending:true/);
  assert.match(edge, /live_participant_mark_connected/);
});

test('Speaker connection is not marked before the LiveKit client has joined', () => {
  const joinStart = server.indexOf("if (method === 'POST' && liveMatch)");
  const connectedStart = server.indexOf("if (method === 'POST' && liveConnectedMatch)");
  assert.ok(joinStart >= 0 && connectedStart > joinStart);
  const joinBlock = server.slice(joinStart, connectedStart);
  assert.doesNotMatch(joinBlock, /live_speaker_mark_connected/);
  assert.doesNotMatch(joinBlock, /db\.liveParticipants\.push/);
});
