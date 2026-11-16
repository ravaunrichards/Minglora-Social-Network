import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const server = read('src/server.js');
const livekit = read('backend/modules/live/livekit.js');
const app = read('public/app.js');
const styles = read('public/styles.css');
const edge = read('supabase/functions/minglora-runtime-state/index.ts');

test('Only the LIVE host can remove an approved or connected speaker', () => {
  const start = server.indexOf("const liveSpeakerDecisionMatch");
  const end = server.indexOf("let liveMatch = p.match(/^\\/api\\/live\\/sessions\\/([^/]+)\\/join", start);
  const route = server.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(route, /session\.hostId !== user\.id/);
  assert.match(route, /\['accept', 'reject', 'remove'\]/);
  assert.match(route, /decision === 'remove' \? \['accepted', 'connected'\]/);
  assert.match(route, /removeLiveKitParticipant\(session\.roomName, speakerId\)/);
  assert.match(route, /requestSupabaseState\('live_speaker_mark_left'/);
});

test('LiveKit participant removal checks the room and calls the server-side RoomServiceClient', () => {
  assert.match(livekit, /export async function removeLiveKitParticipant\(/);
  assert.match(livekit, /new RoomServiceClient\(settings\.serverUrl, settings\.apiKey, settings\.apiSecret\)/);
  assert.match(livekit, /await service\.removeParticipant\(roomName, String\(identity\)\)/);
  assert.match(livekit, /participants\.some\(participant => participant\.identity === String\(identity\)\)/);
});

test('Host controls can remove a guest; removed members return to audience and can request again', () => {
  assert.match(app, /data-speaker-remove=/);
  assert.match(app, /data-speaker-remove=/);
  assert.match(app, /class='live-speaker-remove'/);
  assert.match(app, /:"remove";/);
  assert.match(edge, /if \(action === "live_speaker_mark_left"\)/);
  assert.match(edge, /upsert\(\{\s*broadcast_id:broadcastId,user_id:userId,role:"guest",status:"requested"/);
});

test('Guest moderation button has a visible, responsive disabled state', () => {
  assert.match(styles, /\.live-speaker-remove/);
  assert.match(styles, /\.live-speaker-remove:disabled/);
});
