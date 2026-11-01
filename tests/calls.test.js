import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALL_CONNECT_GRACE_MS,
  CALL_MAX_PARTICIPANTS,
  CALL_RING_TIMEOUT_MS,
  canAnswerCall,
  countCallParticipants,
  expireRingingCall,
  isCallParticipantBusy,
  isCallRingExpired,
  isCallTerminalStatus,
  reconcileCallPresence,
  validateCallRingtoneUpload
} from '../backend/modules/calls/service.js';

test('calls enforce an eight-participant maximum',()=>{
  assert.equal(CALL_MAX_PARTICIPANTS,8);
});

test('ring expiry only changes a still-ringing call and its unanswered participants',()=>{
  const expiresAt='2026-01-01T00:00:45.000Z';
  const call={id:'call-1',status:'ringing',createdAt:'2026-01-01T00:00:00.000Z',ringExpiresAt:expiresAt};
  const participants=[
    {callId:'call-1',userId:'caller',status:'calling'},
    {callId:'call-1',userId:'invitee',status:'invited'},
    {callId:'call-1',userId:'joined',status:'joined'},
    {callId:'call-2',userId:'other',status:'invited'}
  ];
  const deadline=Date.parse(expiresAt);
  assert.equal(isCallRingExpired(call,deadline-1),false);
  assert.equal(isCallRingExpired(call,deadline),true);
  assert.equal(expireRingingCall(call,participants,'2026-01-01T00:00:45.000Z',deadline),true);
  assert.equal(call.status,'missed');
  assert.equal(participants[0].status,'missed');
  assert.equal(participants[1].status,'missed');
  assert.equal(participants[2].status,'joined');
  assert.equal(participants[3].status,'invited');
  assert.equal(isCallTerminalStatus(call.status),true);
});

test('answered invitations are accepted only for the invited member',()=>{
  const call={id:'call-1',status:'ringing'};
  const participant={callId:'call-1',userId:'member-2',status:'invited'};
  assert.equal(canAnswerCall(call,participant,'member-2'),true);
  assert.equal(canAnswerCall(call,participant,'member-3'),false);
  assert.equal(canAnswerCall({...call,status:'ended'},participant,'member-2'),false);
  assert.equal(canAnswerCall(call,{...participant,status:'joined'},'member-2'),false);
});

test('busy participation is scoped to ringing or active calls',()=>{
  const invitee={callId:'call-1',userId:'member-2',status:'invited'};
  assert.equal(isCallParticipantBusy({id:'call-1',status:'ringing'},invitee),true);
  assert.equal(isCallParticipantBusy({id:'call-1',status:'active'}, {...invitee,status:'joined'}),true);
  assert.equal(isCallParticipantBusy({id:'call-1',status:'ended'}, {...invitee,status:'joined'}),false);
  assert.equal(isCallParticipantBusy({id:'call-1',status:'active'}, {...invitee,status:'declined'}),false);
});

test('participant counts include active invitations and exclude terminal participant states',()=>{
  const participants=[
    {callId:'call-1',status:'calling'},
    {callId:'call-1',status:'invited'},
    {callId:'call-1',status:'joined'},
    {callId:'call-1',status:'declined'},
    {callId:'call-2',status:'joined'}
  ];
  assert.equal(countCallParticipants(participants,'call-1'),3);
  assert.equal(countCallParticipants(participants,'call-2'),1);
  assert.equal(countCallParticipants([], 'call-1'),0);
});

test('ringtone uploads validate supported audio and enforce the 20 MB limit',()=>{
  const valid=validateCallRingtoneUpload({mimeType:'audio/mpeg',byteSize:1024});
  assert.equal(valid.valid,true);
  assert.equal(valid.extension,'mp3');
  assert.equal(validateCallRingtoneUpload({mimeType:'audio/mpeg',byteSize:20*1024*1024}).valid,true);
  assert.equal(validateCallRingtoneUpload({mimeType:'audio/mpeg',byteSize:20*1024*1024+1}).valid,false);
  assert.equal(validateCallRingtoneUpload({mimeType:'image/png',byteSize:1024}).valid,false);
  assert.equal(validateCallRingtoneUpload({mimeType:'audio/ogg',byteSize:0}).valid,false);
  assert.equal(CALL_RING_TIMEOUT_MS,45_000);
});

test('stale call participants are cleared and an orphaned active call is ended',()=>{
  const call={id:'call-stale',createdBy:'caller',status:'active',createdAt:'2026-10-31T10:00:00.000Z',answeredAt:'2026-10-31T10:00:05.000Z'};
  const participants=[
    {callId:call.id,userId:'caller',role:'host',status:'joined',joinedAt:'2026-10-31T10:00:06.000Z',leftAt:null},
    {callId:call.id,userId:'recipient',role:'participant',status:'joined',joinedAt:'2026-10-31T10:00:07.000Z',leftAt:null}
  ];
  const result=reconcileCallPresence(call,participants,[],'2026-11-01T12:00:00.000Z',Date.parse('2026-11-01T12:00:00.000Z'));
  assert.deepEqual(result,{changed:true,ended:true});
  assert.equal(call.status,'ended');
  assert.equal(call.endedAt,'2026-11-01T12:00:00.000Z');
  assert.deepEqual(participants.map(item=>item.status),['left','left']);
});

test('a connected host keeps a call alive while a disconnected guest is cleared',()=>{
  const call={id:'call-live',createdBy:'caller',status:'active',createdAt:'2026-10-31T10:00:00.000Z',answeredAt:'2026-10-31T10:00:05.000Z'};
  const participants=[
    {callId:call.id,userId:'caller',role:'host',status:'joined',joinedAt:'2026-10-31T10:00:06.000Z',leftAt:null},
    {callId:call.id,userId:'guest',role:'participant',status:'joined',joinedAt:'2026-10-31T10:00:07.000Z',leftAt:null}
  ];
  const result=reconcileCallPresence(call,participants,[{identity:'caller'}],'2026-11-01T12:00:00.000Z',Date.parse('2026-11-01T12:00:00.000Z'));
  assert.deepEqual(result,{changed:true,ended:false});
  assert.equal(call.status,'active');
  assert.equal(participants[0].status,'joined');
  assert.equal(participants[1].status,'left');
});

test('fresh call joins receive a connection grace period during refresh',()=>{
  const call={id:'call-connecting',createdBy:'caller',status:'active',createdAt:'2026-11-01T12:00:00.000Z',answeredAt:'2026-11-01T12:00:10.000Z'};
  const participants=[
    {callId:call.id,userId:'caller',role:'host',status:'calling',joinedAt:null,leftAt:null},
    {callId:call.id,userId:'guest',role:'participant',status:'joined',joinedAt:'2026-11-01T12:00:11.000Z',leftAt:null}
  ];
  const nowMs=Date.parse('2026-11-01T12:00:20.000Z');
  const result=reconcileCallPresence(call,participants,[],'2026-11-01T12:00:20.000Z',nowMs);
  assert.deepEqual(result,{changed:false,ended:false});
  assert.equal(participants[0].status,'calling');
  assert.equal(participants[1].status,'joined');
  assert.equal(CALL_CONNECT_GRACE_MS,30_000);
});

test('a host disconnect ends the call for every remaining participant',()=>{
  const call={id:'call-host-left',createdBy:'caller',status:'active',createdAt:'2026-10-31T10:00:00.000Z',answeredAt:'2026-10-31T10:00:05.000Z'};
  const participants=[
    {callId:call.id,userId:'caller',role:'host',status:'joined',joinedAt:'2026-10-31T10:00:06.000Z',leftAt:null},
    {callId:call.id,userId:'guest',role:'participant',status:'joined',joinedAt:'2026-10-31T10:00:07.000Z',leftAt:null},
    {callId:call.id,userId:'invitee',role:'participant',status:'invited',joinedAt:null,leftAt:null}
  ];
  const result=reconcileCallPresence(call,participants,[{identity:'guest'}],'2026-11-01T12:00:00.000Z',Date.parse('2026-11-01T12:00:00.000Z'));
  assert.deepEqual(result,{changed:true,ended:true});
  assert.equal(call.status,'ended');
  assert.deepEqual(participants.map(item=>item.status),['left','left','cancelled']);
});
