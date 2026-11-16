import test from "node:test";
import assert from "node:assert/strict";
import {CALL_RING_TIMEOUT_MS,CALL_RINGTONE_MAX_BYTES,canAnswerCall,expireRingingCall,isCallRingExpired,validateCallRingtoneUpload} from "../../backend/modules/calls/service.js";
test("call ringtone validation accepts common audio formats",()=>{
 for(const mimeType of ["audio/mpeg","audio/mp4","audio/ogg","audio/webm","audio/wav","audio/x-wav","audio/flac","audio/aac"])assert.equal(validateCallRingtoneUpload({mimeType,byteSize:1000}).valid,true,mimeType);
});
test("call ringtone validation rejects unsupported formats and oversized songs",()=>{
 assert.equal(validateCallRingtoneUpload({mimeType:"audio/midi",byteSize:1000}).valid,false);
 assert.equal(validateCallRingtoneUpload({mimeType:"audio/mpeg",byteSize:0}).valid,false);
 assert.equal(validateCallRingtoneUpload({mimeType:"audio/mpeg",byteSize:CALL_RINGTONE_MAX_BYTES+1}).valid,false);
});
test("call invitations expire after the configured ringing period",()=>{
 const call={id:"c1",status:"ringing",createdAt:"2026-11-01T12:00:00.000Z"};
 assert.equal(isCallRingExpired(call,Date.parse(call.createdAt)+CALL_RING_TIMEOUT_MS-1),false);
 assert.equal(isCallRingExpired(call,Date.parse(call.createdAt)+CALL_RING_TIMEOUT_MS),true);
});
test("missed calls stop ringing and mark outstanding participants missed",()=>{
 const call={id:"c1",status:"ringing",ringExpiresAt:"2026-11-01T12:00:45.000Z"};
 const participants=[{callId:"c1",userId:"caller",status:"calling"},{callId:"c1",userId:"callee",status:"invited"},{callId:"c1",userId:"other",status:"invited"}];
 assert.equal(expireRingingCall(call,participants,"2026-11-01T12:00:46.000Z",Date.parse("2026-11-01T12:00:46.000Z")),true);
 assert.equal(call.status,"missed");assert.equal(participants[0].status,"missed");assert.equal(participants[1].status,"missed");
});
test("only invited recipients can answer ringing or active group calls",()=>{
 assert.equal(canAnswerCall({status:"ringing"},{userId:"callee",status:"invited"},"callee"),true);
 assert.equal(canAnswerCall({status:"active"},{userId:"callee",status:"invited"},"callee"),true);
 assert.equal(canAnswerCall({status:"ringing"},{userId:"caller",status:"calling"},"caller"),false);
 assert.equal(canAnswerCall({status:"ended"},{userId:"callee",status:"invited"},"callee"),false);
});
