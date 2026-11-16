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
const styles = read('public/styles.css');

test('The LIVE host and assigned room moderators can remove comments, while pinning stays host-only', () => {
  assert.match(app, /const canModerateChat=activeLiveRole==="host"\|\|Boolean\(activeLiveSession\?\.liveModerators/);
  assert.match(app, /const controls=canModerateChat/);
  assert.match(app, /data-live-chat-delete=/);
  assert.match(app, /if\(deleteButton&&\(role==="host"\|\|Boolean\(session\.liveModerators/);
  assert.match(app, /if\(!button\|\|role!=="host"\)return/);
  assert.match(app, /Remove this comment from the LIVE chat/);
  assert.match(styles, /\.live-chat-delete/);
});

test('The authenticated LIVE API authorizes the host or an assigned room moderator for comment deletion', () => {
  assert.match(server, /const liveChatDelete=p\.match/);
  assert.match(server, /method==='DELETE'&&liveChatDelete/);
  assert.match(server, /session\.hostId===user\.id\|\|\(session\.liveModerators\|\|\[\]\)\.includes\(user\.id\)/);
  assert.match(server, /broadcastId:session\.id,hostId:session\.hostId,messageId:liveChatDelete\[2\]/);
  assert.match(server, /requestSupabaseState\('live_chat_delete'/);
});
test('Trusted runtime verifies broadcast ownership and scopes deletion to that broadcast', () => {
  assert.match(edge, /"live_chat_delete"/);
  assert.match(edge, /action === "live_chat_delete"/);
  assert.match(edge, /\.select\("id,host_id,status"\)/);
  assert.match(edge, /broadcast\.host_id !== hostId/);
  assert.match(edge, /\.delete\(\)\.eq\("id", messageId\)\.eq\("broadcast_id", broadcastId\)/);
  assert.match(edge, /Only the LIVE host can remove comments/);
});

test('Deleting a pinned comment tells the room to clear its pinned overlay', () => {
  assert.match(app, /activeLivePinnedComment\?\.id===messageId/);
  assert.match(app, /action:"unpin",messageId/);
  assert.match(app, /renderLivePinnedComment\(null\)/);
  assert.match(app, /topic:"minglora-live-pin"/);
});
