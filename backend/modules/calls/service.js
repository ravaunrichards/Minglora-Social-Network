export const CALL_RING_TIMEOUT_MS=45_000;
export const CALL_MAX_PARTICIPANTS=8;
export const CALL_ACTIVE_PARTICIPANT_STATUSES=Object.freeze(["calling","invited","joined"]);
export const CALL_TERMINAL_STATUSES=Object.freeze(["ended","cancelled","declined","missed"]);
export const CALL_RINGTONE_MAX_BYTES=20*1024*1024;
export const CALL_RINGTONE_MIME_TYPES=Object.freeze({
 "audio/mpeg":"mp3","audio/mp4":"m4a","audio/ogg":"ogg","audio/webm":"webm",
 "audio/wav":"wav","audio/x-wav":"wav","audio/flac":"flac","audio/aac":"aac"
});
export function validateCallRingtoneUpload({mimeType,byteSize}={}){
 const type=String(mimeType||"").trim().toLowerCase(),size=Number(byteSize);
 if(!Object.hasOwn(CALL_RINGTONE_MIME_TYPES,type))return {valid:false,error:"Choose an MP3, M4A, OGG, WebM, WAV, FLAC or AAC audio file."};
 if(!Number.isSafeInteger(size)||size<1||size>CALL_RINGTONE_MAX_BYTES)return {valid:false,error:"Ringtones and songs must be between 1 byte and 20 MB."};
 return {valid:true,mimeType:type,extension:CALL_RINGTONE_MIME_TYPES[type],byteSize:size};
}
export function isCallRingExpired(call,nowMs=Date.now()){
 if(!call||call.status!=="ringing")return false;
 const deadline=Date.parse(String(call.ringExpiresAt||""));
 if(Number.isFinite(deadline))return deadline<=nowMs;
 const created=Date.parse(String(call.createdAt||""));
 return Number.isFinite(created)&&created+CALL_RING_TIMEOUT_MS<=nowMs;
}
export function expireRingingCall(call,participants,stamp,nowMs=Date.now()){
 if(!isCallRingExpired(call,nowMs))return false;
 call.status="missed";call.endedAt=call.endedAt||stamp;
 for(const participant of participants||[]){
  if(participant.callId===call.id&&["invited","calling"].includes(participant.status)){
   participant.status="missed";participant.leftAt=participant.leftAt||stamp;
  }
 }
 return true;
}
export function canAnswerCall(call,participant,userId){
 return Boolean(call&&participant&&participant.userId===userId&&participant.status==="invited"&&["ringing","active"].includes(call.status));
}
export function isCallTerminalStatus(status){return CALL_TERMINAL_STATUSES.includes(String(status||""));}
export function isCallParticipantActive(participant){return Boolean(participant&&CALL_ACTIVE_PARTICIPANT_STATUSES.includes(participant.status));}
export function isCallParticipantBusy(call,participant){return Boolean(call&&["ringing","active"].includes(call.status)&&isCallParticipantActive(participant));}
export function countCallParticipants(participants,callId){return (participants||[]).filter(item=>item.callId===callId&&isCallParticipantActive(item)).length;}
