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
const migration = read('supabase/migrations/20261118210000_minglora_live_creator_cohost_sessions.sql');
const cohostCss = read('public/live-cohost.css');

test('Creator Co-host has separate durable records and never writes Multi-guest participant rows', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.live_cohost_sessions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.live_cohost_participants/);
  assert.match(migration, /max_participants integer NOT NULL DEFAULT 4/);
  assert.match(migration, /status IN \('invited','requested','accepted','connected','left','removed','rejected'\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /TO service_role/);
  const start = edge.indexOf('if (action === "live_cohost_session_create")');
  const end = edge.indexOf('if (action === "live_speaker_requests_list")', start);
  assert.ok(start >= 0 && end > start);
  const cohostActions = edge.slice(start, end);
  assert.doesNotMatch(cohostActions, /live_participants/,
    'creator co-host invitations and members must not use Multi-guest speaker rows');
});

test('Creators must each have their own active LIVE before inviting or accepting Co-host', () => {
  assert.match(server, /targetLive=\(db\.liveSessions\|\|\)\.find\(item=>item\.status==='live'&&item\.hostId===target\.id\)/);
  assert.match(server, /The invited creator must still be LIVE on their own account to accept Co-host/);
  assert.match(edge, /hostBroadcast\.host_id!==actorId\|\|hostBroadcast\.status!==\"live\"/);
  assert.match(edge, /broadcast\.host_id!==userId\|\|broadcast\.status!==\"live\"/);
});

test('Accepting or joining Co-host connects a second LiveKit room rather than re-opening the creator LIVE', () => {
  const start = app.indexOf('async function connectLiveCohostStage');
  const end = app.indexOf('function renderLiveCohostMatch', start);
  assert.ok(start >= 0 && end > start);
  const helper = app.slice(start, end);
  assert.match(helper, /new client\.Room/);
  assert.match(helper, /\/live\/cohost\/sessions\/.*\/join/);
  assert.doesNotMatch(helper, /openLiveRoom\(session,\s*["']guest["']/);
  assert.doesNotMatch(helper, /activeLiveRoom=null/);
  assert.match(app, /original\.clone\(\)/);
  assert.match(app, /publishTrack\(clone/);
  assert.match(app, /activeLiveCohostRoom/);
});

test('Leaving the shared Co-host room disconnects only the secondary room and leaves the primary LIVE active', () => {
  const start = app.indexOf('async function stopLiveCohostLocal');
  const end = app.indexOf('async function connectLiveCohostStage', start);
  assert.ok(start >= 0 && end > start);
  const cleanup = app.slice(start, end);
  assert.match(cleanup, /const room=activeLiveCohostRoom/);
  assert.match(cleanup, /await room\.disconnect\(\)/);
  assert.match(cleanup, /activeLiveCohostRoom=null/);
  assert.doesNotMatch(cleanup, /activeLiveRoom=null|activeLiveSession=null|openLiveRoom\(/);
  assert.match(app, /await stopLiveCohostLocal\(\);[\s\S]{0,260}await room\.disconnect\(\)/);
});

test('Host can invite, accept, decline and remove creators through separate Co-host routes', () => {
  assert.match(server, /POST'&&cohostInviteMatch/);
  assert.match(server, /PATCH'&&cohostParticipantMatch/);
  assert.match(server, /live_cohost_invite/);
  assert.match(server, /live_cohost_review/);
  assert.match(server, /live_cohost_mark_connected/);
  assert.match(app, /data-cohost-invitation-accept/);
  assert.match(app, /data-cohost-invitation-reject/);
  assert.match(app, /data-cohost-remove/);
  assert.match(app, /data-cohost-accept/);
  assert.match(app, /data-cohost-reject/);
});

test('Creators can request to join while already LIVE, and hosts can review the request', () => {
  assert.match(server, /cohostRequestMatch/);
  assert.match(server, /live_cohost_request/);
  assert.match(app, /live-cohost-request-button/);
  assert.match(app, /\/requests/);
  assert.match(app, /Request pending/);
  assert.match(edge, /action === "live_cohost_invite" \|\| action === "live_cohost_request"/);
});

test('Co-host has independent Solo and Team match modes and lifecycle', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.live_cohost_matches/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.live_cohost_match_participants/);
  assert.match(migration, /mode IN \('solo','team'\)/);
  assert.match(edge, /live_cohost_match_create/);
  assert.match(edge, /live_cohost_match_end/);
  assert.match(server, /cohostMatchCreate/);
  assert.match(server, /cohostMatchEnd/);
  assert.match(app, /data-cohost-match-start='solo'/);
  assert.match(app, /data-cohost-match-start='team'/);
  assert.match(app, /live-cohost-match-end/);
  assert.match(app, /Every creator's LIVE remains active/);
});

test('The Co-host reference stage supports two, three and four independent creator tiles', () => {
  assert.match(cohostCss, /#live-cohost-stage\[data-count="2"\]/);
  assert.match(cohostCss, /#live-cohost-stage\[data-count="3"\]/);
  assert.match(cohostCss, /#live-cohost-stage\[data-count="4"\]/);
  assert.match(app, /updateLiveCohostStageCount/);
  assert.match(app, /data-count/);
  assert.match(app, /Co-host LIVE stage/);
});

test('Multi-guest remains a separate viewer-to-host speaker request and seat flow', () => {
  const start = edge.indexOf('if (action === "live_speaker_request")');
  const end = edge.indexOf('// Independent creator-to-creator Co-host lifecycle', start);
  assert.ok(start >= 0 && end > start);
  const multiGuest = edge.slice(start, end);
  assert.match(multiGuest, /from\("live_participants"\)/);
  assert.match(multiGuest, /role:"guest",status:"requested"/);
  assert.match(app, /id='live-speaker-request-panel'/);
  assert.match(app, /Multi-guest LIVE/);
  assert.match(app, /Join as a guest/);
  assert.match(app, /liveControlButton\("live-guests-toggle","multi-guest"/);
  assert.match(app, /openLiveToolsPanel\("#live-speaker-request-panel"\)/);
  assert.match(app, /openLiveToolsPanel\("#live-cohost-panel"\)/);
  assert.doesNotMatch(app, /button\.textContent="Join Co-host stage"/);
});

test('Ending a creator LIVE retires their Co-host membership without ending other creator broadcasts', () => {
  assert.match(edge, /action === "live_broadcast_end"/);
  assert.match(edge, /Retire any Co-host invitation or membership bound to the broadcast that just ended/);
  assert.match(edge, /live_cohost_participants/);
  assert.match(edge, /status:"left",left_at:endedAt/);
  assert.match(server, /live_cohost_end/);
  assert.match(server, /endLiveSession\(session, \{ deleteRoom: true \}\)/);
});
