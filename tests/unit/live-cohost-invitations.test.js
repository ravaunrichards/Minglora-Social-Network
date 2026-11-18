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

test('The host can send a Co-host invitation without leaving or reconnecting their LIVE room', () => {
  const start = app.indexOf('cohostInviteForm?.addEventListener("submit",async event=>{');
  const end = app.indexOf('\n    });\n    const moderatorList', start);
  assert.ok(start >= 0 && end > start, 'host invitation form handler exists');
  const handler = app.slice(start, end);
  assert.match(handler, /\/cohost-invitations/);
  assert.doesNotMatch(handler, /room\.disconnect\(|activeLiveRoom=null|openLiveRoom\(/,
    'sending an invitation must never disconnect or recreate the host room');
  assert.match(handler, /await refreshLiveSpeakerPanel\(session,role,room\)/);
});

test('The invitee enters as a viewer, accepts while connected, then reconnects only their own client as a guest', () => {
  const joinStart = server.indexOf("if (method === 'POST' && liveMatch)");
  const connectedStart = server.indexOf("if (method === 'POST' && liveConnectedMatch)");
  assert.ok(joinStart >= 0 && connectedStart > joinStart);
  const joinRoute = server.slice(joinStart, connectedStart);
  assert.match(joinRoute, /const invitedGuest = \['invited', 'accepted', 'connected'\]\.includes\(speakerRequest\?\.status\)/);
  assert.match(joinRoute, /\['accepted', 'connected'\]\.includes\(speakerRequest\?\.status\) \? 'guest' : 'viewer'/);
  assert.match(app, /await room\.disconnect\(\);activeLiveRoom=null;await openLiveRoom\(session,"guest"\)/);
  const hostStart = app.indexOf('cohostInviteForm?.addEventListener("submit",async event=>{');
  const hostEnd = app.indexOf('\n    });\n    const moderatorList', hostStart);
  assert.doesNotMatch(app.slice(hostStart, hostEnd), /room\.disconnect\(|openLiveRoom\(/);
});

test('The host invitation endpoint verifies ownership and synchronizes the durable invited participant before saving', () => {
  const start = server.indexOf('const liveCohostInvitationMatch');
  const end = server.indexOf('const liveCohostAcceptMatch', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /session\.hostId !== user\.id/);
  assert.match(route, /blockedBetween\(user\.id, target\.id\)/);
  assert.match(route, /requestSupabaseState\('live_cohost_invite'/);
  assert.match(route, /role: 'guest', status: 'invited'/);
  assert.ok(route.indexOf("requestSupabaseState('live_cohost_invite'") < route.indexOf('db.liveSpeakerRequests.unshift(invitation)'));
  assert.match(route, /\['invited', 'accepted', 'connected'\]\.includes\(item\.status\)/);
});

test('The invitee must already be connected to the LIVE room before acceptance is synced', () => {
  const start = server.indexOf('const liveCohostAcceptMatch');
  const end = server.indexOf('const liveSpeakerStatusMatch', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /listLiveKitParticipants\(session\.roomName\)/);
  assert.match(route, /participant\.identity === user\.id/);
  assert.match(route, /requestSupabaseState\('live_cohost_invitation_accept'/);
  assert.ok(route.indexOf('listLiveKitParticipants(session.roomName)') < route.indexOf("requestSupabaseState('live_cohost_invitation_accept'"));
  assert.match(route, /request\.status = 'accepted'/);
});

test('Supabase accepts only host-authorized invitations and persists guest invited then accepted states', () => {
  assert.match(edge, /"live_cohost_invite", "live_cohost_invitation_accept"/);
  const inviteStart = edge.indexOf('if (action === "live_cohost_invite")');
  const acceptStart = edge.indexOf('if (action === "live_cohost_invitation_accept")');
  const listStart = edge.indexOf('if (action === "live_speaker_requests_list")');
  assert.ok(inviteStart >= 0 && acceptStart > inviteStart && listStart > acceptStart);
  const invite = edge.slice(inviteStart, acceptStart);
  const accept = edge.slice(acceptStart, listStart);
  assert.match(invite, /broadcast\.host_id!==hostId/);
  assert.match(invite, /role:"guest",status:"invited"/);
  assert.match(invite, /\.in\("status",\["invited","accepted","connected"\]\)/);
  assert.match(accept, /\.eq\("role","guest"\)\.eq\("status","invited"\)/);
  assert.match(accept, /\.update\(\{status:"accepted"\}\)/);
});

test('The viewer presence heartbeat preserves invited co-host status until the invitee accepts', () => {
  assert.match(edge, /existing\.status==="invited"\)\s*return json\(200,\{participant:existing,invitationPending:true\}\)/);
  assert.match(edge, /existing\.status==="requested"\)\s*return json\(200,\{participant:existing,requestPending:true\}\)/);
});

test('The host can cancel a pending Co-host invitation without granting guest access', () => {
  assert.match(edge, /decision==="reject"\?\["requested","invited"\]:\["requested"\]/);
  assert.match(server, /decision === 'reject' \? \['requested', 'invited'\]/);
  const panelStart = app.indexOf('async function refreshLiveSpeakerPanel(session,role,room)');
  const panelEnd = app.indexOf('function startLiveSpeakerRefresh', panelStart);
  const panel = app.slice(panelStart, panelEnd);
  assert.match(panel, /data-speaker-reject/);
  assert.match(panel, /request\.status==="invited"/);
});

test('Invitations and accepted guests appear in the host participant list and seat capacity is enforced', () => {
  assert.match(edge, /\.in\("status",\["requested","invited","accepted","connected"\]\)/);
  assert.match(server, /The ' \+ guestSeatLimit \+ ' guest speaker places are full\./);
  assert.match(server, /session\.broadcastType === 'audio_only' && session\.liveLayout === 'side-by-side' \? 9 : 8/);
});
