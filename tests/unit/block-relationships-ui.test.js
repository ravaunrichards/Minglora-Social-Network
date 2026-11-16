import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../../src/server.js', import.meta.url), 'utf8');

test('both users are notified and their direct Messenger connection is closed after a block', () => {
  assert.match(server, /messengerRealtime\?\.disconnectPair\(user\.id,target\.id,'blocked'\)/);
  assert.match(app, /message\.type==='relationship:blocked'/);
  assert.match(app, /win\.user\.id!==peerId/);
  assert.match(app, /cancelMessageVoiceRecording\(win\.user\.id\)/);
  assert.match(app, /conversation\.kind==='direct'&&conversation\.user\?\.id===peerId/);
});

test('shared Messenger groups containing the blocked peer are removed from the affected users inboxes', () => {
  assert.match(server, /getActiveMessageGroupMembers\(db,group\.id\)\.every\(memberId=>!blockedBetween\(user\.id,memberId\)\)/);
  assert.match(app, /disconnectedGroupIds=new Set/);
  assert.match(app, /conversation\.kind==='group'&&disconnectedGroupIds\.has/);
});

test('blocking removes direct social records without deleting durable conversation history', () => {
  assert.match(server, /disconnectBlockedConnections\(db,user\.id,target\.id,now\(\)\)/);
  assert.match(server, /relationship_unfollow/);
  assert.match(server, /cleanupCallRoom\(call,'blocked'\)/);
});
