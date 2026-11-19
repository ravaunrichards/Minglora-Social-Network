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

test('Invited and approved co-hosts can confirm presence regardless of LIVE audience visibility', () => {
  const start = server.indexOf('const liveConnectedMatch = p.match');
  const end = server.indexOf("liveMatch = p.match(/^\\/api\\/live\\/sessions\\/([^/]+)\\/leave$/)", start);
  assert.ok(start >= 0 && end > start, 'connected-presence route exists');
  const route = server.slice(start, end);
  const requestIndex = route.indexOf('const speakerRequest =');
  const canViewIndex = route.indexOf('const canView =');
  assert.ok(requestIndex >= 0 && canViewIndex > requestIndex,
    'speaker access is loaded before audience visibility is evaluated');
  assert.match(route, /const invitedGuest = \['invited', 'accepted', 'connected'\]\.includes\(speakerRequest\?\.status\)/);
  assert.match(route, /const canView = session\.hostId === user\.id \|\| invitedGuest \|\| session\.visibility === 'public'/);
});

test('Pending co-host invitations reserve seats before new speaker approvals', () => {
  assert.match(server, /\['invited', 'accepted', 'connected'\]\.includes\(item\.status\)/);
  assert.match(edge, /\.in\("status",\["invited","accepted","connected"\]\)/);
  assert.match(edge, /\.neq\("user_id",userId\)\.in\("status",\["invited","accepted","connected"\]\)/);
});

test('A member who is hosting another LIVE is still allowed to accept and join as a co-host', () => {
  const inviteStart = server.indexOf('const liveCohostInvitationMatch');
  const inviteEnd = server.indexOf('const liveCohostAcceptMatch', inviteStart);
  const acceptStart = inviteEnd;
  const acceptEnd = server.indexOf('const liveSpeakerStatusMatch', acceptStart);
  assert.ok(inviteStart >= 0 && inviteEnd > inviteStart && acceptEnd > acceptStart);
  const inviteRoute = server.slice(inviteStart, inviteEnd);
  const acceptRoute = server.slice(acceptStart, acceptEnd);
  assert.doesNotMatch(inviteRoute, /targetIsHosting|hosting another LIVE/,
    'a co-host may be invited even when they are currently hosting another LIVE');
  assert.doesNotMatch(acceptRoute, /targetIsHosting|Leave your own LIVE broadcast/,
    'a co-host may accept without ending their own LIVE broadcast');
  assert.match(acceptRoute, /listLiveKitParticipants\(session\.roomName\)/,
    'the invitee must still be verified inside the target LIVE room');
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
  assert.doesNotMatch(route, /allowGuestRequests/,
    'direct invitations stay available when audience hand-raises are disabled');
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
