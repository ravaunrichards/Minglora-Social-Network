import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const server=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const worker=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');

test('server reconciles persisted calls against actual LiveKit participants',()=>{
  assert.match(server,/reconcileCallPresenceForUsers\(userIds,\{force=false\}=\{\}\)/);
  assert.match(server,/listLiveKitParticipants\(call\.roomName\)/);
  assert.match(server,/reconcileCallPresence\(call,db\.callParticipants\|\|\[\],providerParticipants,stamp,nowMs\)/);
  assert.match(server,/CALL_PRESENCE_REFRESH_INTERVAL_MS=2500/);
  assert.match(server,/callSessionCleanupReady\s*=\s*cleanupPersistedCalls\(\)/);
});

test('starting or answering a call refreshes stale sessions and rejects overlapping calls',()=>{
  assert.match(server,/await reconcileCallPresenceForUsers\(reservationIds,\{force:true\}\)/);
  assert.match(server,/if\(busyIds\.has\(user\.id\)\)return json\(res,409/);
  assert.match(server,/if\(recipients\.some\(member=>busyIds\.has\(member\.id\)\)\)return json\(res,409/);
  assert.match(server,/await reconcileCallPresenceForUsers\(\[user\.id\],\{force:true\}\)/);
  assert.match(server,/const busyElsewhere=\(db\.callParticipants\|\|\[\]\)\.some/);
  assert.match(server,/callCreationReservations\.add\(id\)/);
  assert.match(server,/callCreationReservations\.delete\(id\)/);
});

test('call notifications are removed only when the user no longer has an active invitation',()=>{
  assert.match(server,/const activeCallIds=new Set\(\(db\.callParticipants\|\|\[\]\)\.filter\(item=>item\.userId===user\.id&&item\.status==='invited'&&\['ringing','active'\]/);
  assert.match(server,/item\.type!=='call'\|\|\(item\.callId&&activeCallIds\.has\(item\.callId\)\)/);
  assert.match(app,/async function clearStaleMingloraCallNotifications\(activeCallIds=\[\]\)/);
  assert.match(app,/notification\.close\(\)/);
});

test('browser call availability refreshes when the app returns to the foreground or reconnects',()=>{
  assert.match(app,/document\.addEventListener\('visibilitychange',refreshMingloraCallAvailability\)/);
  assert.match(app,/window\.addEventListener\('online',refreshMingloraCallAvailability\)/);
  assert.match(app,/window\.addEventListener\('pageshow',refreshMingloraCallAvailability\)/);
  assert.match(app,/void pollIncomingCalls\(\)/);
  assert.match(app,/outgoingCallPending=\{callId:null,cancelled:false,starting:true\}/);
});

test('Minglora service worker tags call notifications by call ID for clean dismissal',()=>{
  assert.match(worker,/tag:payload\.tag\|\|\(isCall\?'minglora-call-'/);
  assert.match(worker,/data:\{url,type,\.\.\.data\}/);
});
