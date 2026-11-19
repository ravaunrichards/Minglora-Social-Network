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
const coreMigration = read('supabase/migrations/20261118235924_minglora_live_cohost_sessions.sql');
const capacityMigration = read('supabase/migrations/20261119004203_minglora_live_cohost_multi_guest_capacity.sql');
const rosterMigration = read('supabase/migrations/20261119004301_minglora_live_cohost_roster_rls_consolidation.sql');
const requestMatchMigration = read('supabase/migrations/20261119010000_minglora_live_cohost_requests_and_matches.sql');
const cohostCss = read('public/live-cohost.css');

test('Creator Co-host has dedicated tables and RLS separate from viewer guest seats', () => {
  assert.match(coreMigration, /CREATE TABLE IF NOT EXISTS public\.live_cohost_sessions/);
  assert.match(coreMigration, /CREATE TABLE IF NOT EXISTS public\.live_cohost_participants/);
  assert.match(coreMigration, /created_by uuid NOT NULL/);
  assert.match(coreMigration, /cohost_session_id uuid NOT NULL/);
  assert.match(coreMigration, /connected_at timestamptz/);
  assert.match(capacityMigration, /position BETWEEN 1 AND 9/);
  assert.match(capacityMigration, /max_participants <= 10/);
  assert.match(rosterMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(rosterMigration, /TO service_role/);
  assert.match(rosterMigration, /read_authorized_member/);
});

test('Co-host runtime matches the deployed database names, seat columns and allowed lifecycle states', () => {
  const start = edge.indexOf('// Independent creator-to-creator Co-host lifecycle.');
  const end = edge.indexOf('if (action === "live_speaker_requests_list")', start);
  assert.ok(start >= 0 && end > start);
  const cohost = edge.slice(start, end);
  for (const field of ['created_by','broadcast_id','cohost_session_id','connected_at','position']) {
    assert.ok(cohost.includes(field), 'Co-host runtime must use ' + field);
  }
  assert.match(cohost, /"requested"/);
  assert.match(cohost, /"declined"/);
  assert.doesNotMatch(cohost, /\.from\("live_participants"\)/,
    'Creator Co-host must never read or write Multi-guest speaker rows');
  assert.match(cohost, /host_user_id: row\.created_by/);
  assert.match(cohost, /host_broadcast_id: row\.broadcast_id/);
});

test('Join requests and Solo/Team matches have dedicated persisted schema', () => {
  assert.match(requestMatchMigration, /status IN \('invited','requested','accepted','connected','declined'/);
  assert.match(requestMatchMigration, /CREATE TABLE IF NOT EXISTS public\.live_cohost_matches/);
  assert.match(requestMatchMigration, /CREATE TABLE IF NOT EXISTS public\.live_cohost_match_participants/);
  assert.match(edge, /action === "live_cohost_request"/);
  assert.match(edge, /action === "live_cohost_match_create"/);
  assert.match(edge, /action === "live_cohost_match_end"/);
});

test('Every Co-host creator must keep their own LIVE broadcast active', () => {
  assert.match(server, /targetLive=\(db\.liveSessions\|\|\[\]\)\.find\(item=>item\.status==='live'&&item\.hostId===target\.id\)/);
  assert.match(server, /The invited creator must still be LIVE on their own account to accept Co-host/);
  assert.match(edge, /Both creators must have their own active LIVE broadcast/);
  assert.match(edge, /Your own LIVE broadcast must remain active while Co-host is connected/);
});

test('Co-host uses a secondary LiveKit room and leaves the primary LIVE connected', () => {
  const start = app.indexOf('async function connectLiveCohostStage');
  const end = app.indexOf('function renderLiveCohostMatch', start);
  assert.ok(start >= 0 && end > start);
  const connect = app.slice(start, end);
  assert.match(connect, /new client\.Room/);
  assert.match(connect, /\/live\/cohost\/sessions\/.*\/join/);
  assert.match(app, /original\.clone\(\)/);
  assert.match(app, /publishTrack\(clone/);
  assert.match(app, /activeLiveCohostRoom/);
  const cleanupStart = app.indexOf('async function stopLiveCohostLocal');
  const cleanupEnd = app.indexOf('async function connectLiveCohostStage', cleanupStart);
  const cleanup = app.slice(cleanupStart, cleanupEnd);
  assert.match(cleanup, /await room\.disconnect\(\)/);
  assert.doesNotMatch(cleanup, /activeLiveRoom=null|activeLiveSession=null|openLiveRoom\(/);
});

test('Multi-guest remains a separate viewer-to-host guest request and seat flow', () => {
  const start = edge.indexOf('if (action === "live_speaker_request")');
  const end = edge.indexOf('// Independent creator-to-creator Co-host lifecycle.', start);
  assert.ok(start >= 0 && end > start);
  const multiGuest = edge.slice(start, end);
  assert.match(multiGuest, /\.from\("live_participants"\)/);
  assert.match(multiGuest, /role:"guest",status:"requested"/);
  assert.match(app, /id='live-speaker-request-panel'/);
  assert.match(app, /Multi-guest LIVE/);
  assert.match(app, /Join as a guest/);
  assert.match(app, /openLiveToolsPanel\("#live-speaker-request-panel"\)/);
  assert.match(app, /openLiveToolsPanel\("#live-cohost-panel"\)/);
});

test('Co-host supports the planned 2, 3 and 4 creator layouts and separate controls', () => {
  assert.match(cohostCss, /#live-cohost-stage\[data-count="2"\]/);
  assert.match(cohostCss, /#live-cohost-stage\[data-count="3"\]/);
  assert.match(cohostCss, /#live-cohost-stage\[data-count="4"\]/);
  assert.match(app, /updateLiveCohostStageCount/);
  assert.match(app, /data-cohost-invitation-accept/);
  assert.match(app, /data-cohost-remove/);
  assert.match(app, /live-cohost-match-end/);
});

test('Ending a creator LIVE closes only the corresponding Co-host membership or shared stage', () => {
  const start = edge.indexOf('if (action === "live_broadcast_end")');
  const end = edge.indexOf('if (action === "live_participant_mark_connected")', start);
  assert.ok(start >= 0 && end > start);
  const cleanup = edge.slice(start, end);
  assert.match(cleanup, /cohost_session_id/);
  assert.match(cleanup, /created_by/);
  assert.match(cleanup, /status:"left"/);
  assert.match(cleanup, /live_cohost_matches/);
  assert.match(cleanup, /Other creators' LIVE broadcasts keep running/);
});
