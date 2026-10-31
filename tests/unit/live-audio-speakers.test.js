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

test('Connected viewers can create a speaker request without being mistaken for approved speakers', () => {
  const requestStart=edge.indexOf('if (action === "live_speaker_request")');
  const requestEnd=edge.indexOf('if (action === "live_speaker_requests_list")',requestStart);
  const requestBlock=edge.slice(requestStart,requestEnd);
  assert.match(requestBlock,/existing\?\.role==="guest"&&\["accepted","connected"\]\.includes\(existing\.status\)/);
  assert.match(requestBlock,/existing\?\.role==="guest"&&existing\.status==="requested"/);
  assert.match(requestBlock,/A connected listener may raise a hand/);
  assert.doesNotMatch(requestBlock,/if\(existing&&\["accepted","connected"\]\.includes\(existing\.status\)\)/);
});

test('The host appears in the speaker roster independently of active speech', () => {
  const rosterStart=app.indexOf('function renderLiveSpeakerRoster(');
  const rosterEnd=app.indexOf('async function openLiveRoom(',rosterStart);
  const roster=app.slice(rosterStart,rosterEnd);
  assert.match(roster,/role==="host"\|\|role==="guest"/);
  assert.match(roster,/You · Host/);
  assert.match(roster,/Microphone connected/);
  assert.match(roster,/person\.speaking/);
});

test('LIVE participant leave records an ended connection for viewers and speakers', () => {
  assert.match(server,/requestSupabaseState\('live_participant_mark_left'/);
  assert.match(edge,/if \(action === "live_participant_mark_left"\)/);
  assert.match(edge,/status:"left",left_at:new Date\(\)\.toISOString\(\)/);
  assert.match(edge,/\.in\("status",\["requested","invited","accepted","connected"\]\)/);
});

test('Audio LIVE roster appears before speech and reflects microphone publication and mute state', () => {
  assert.match(app,/refreshSpeakerRoster\(\);\s*try\{/);
  assert.match(app,/for\(let attempt=0;attempt<5&&!microphonePublished;attempt\+\+\)/);
  assert.match(app,/refreshSpeakerRoster\(\);\}catch\(error\)\{toast\(error\.message\);\}\}\);/);
});

test('LIVE participant confirmation retries until the server verifies LiveKit presence', () => {
  assert.match(app,/async function syncLiveParticipantPresence\(session\)/);
  assert.match(app,/for\(let attempt=0;attempt<4;attempt\+\+\)/);
  assert.match(app,/liveParticipantSyncTimer=setInterval/);
  assert.match(app,/await syncLiveParticipantPresence\(session\)/);
  assert.match(app,/function stopLiveParticipantSync\(\)/);
});
