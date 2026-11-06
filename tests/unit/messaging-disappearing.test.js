import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGE_DISAPPEARING_OPTIONS,
  normalizeMessageDisappearingSeconds,
  messageConversationKey,
  getMessageDisappearingSeconds,
  isMessageExpired
} from '../../backend/modules/messaging/service.js';

test('Messenger retention offers only supported, bounded expiry choices',()=>{
  assert.deepEqual([...MESSAGE_DISAPPEARING_OPTIONS],[0,30,300,3600,86400,604800]);
  assert.equal(normalizeMessageDisappearingSeconds('300'),300);
  assert.equal(normalizeMessageDisappearingSeconds(0),0);
  for(const invalid of [-1,1,60,120,6048000,'not-a-number',null,undefined,''])assert.equal(normalizeMessageDisappearingSeconds(invalid),null);
});

test('Messenger settings use one shared key for both sides of a direct chat and a distinct key for each group',()=>{
  assert.equal(messageConversationKey({userIds:['member-b','member-a']}),'direct:member-a:member-b');
  assert.equal(messageConversationKey({userIds:['member-a','member-a']}),'');
  assert.equal(messageConversationKey({groupId:'group-123'}),'group:group-123');
});

test('Messenger retention settings default off and read the saved conversation policy',()=>{
  const db={messageConversationSettings:[{conversationKey:'direct:member-a:member-b',disappearingAfterSeconds:86400}]};
  assert.equal(getMessageDisappearingSeconds(db,'direct:member-a:member-b'),86400);
  assert.equal(getMessageDisappearingSeconds(db,'group:missing'),0);
  assert.equal(getMessageDisappearingSeconds({messageConversationSettings:[{conversationKey:'x',disappearingAfterSeconds:60}]},'x'),0);
});

test('Message expiry checks deadlines without treating missing or malformed timestamps as expired',()=>{
  const at=Date.parse('2026-11-06T21:00:00.000Z');
  assert.equal(isMessageExpired({expiresAt:'2026-11-06T20:59:59.000Z'},at),true);
  assert.equal(isMessageExpired({expiresAt:'2026-11-06T21:00:01.000Z'},at),false);
  assert.equal(isMessageExpired({},at),false);
  assert.equal(isMessageExpired({expiresAt:'not a date'},at),false);
});
