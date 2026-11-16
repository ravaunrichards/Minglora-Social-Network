import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canAccessMessageGroup,
  canManageMessageGroup,
  getActiveMessageGroupMembers,
  summarizeGroupReadState,
  validateMessageGroupReaction
} from '../../backend/modules/messaging/service.js';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('Messenger group membership, management and read receipts use actual member records',()=>{
  const db={
    messageGroups:[{id:'group-1',status:'active'}],
    messageGroupMembers:[
      {groupId:'group-1',userId:'owner',role:'owner',status:'active'},
      {groupId:'group-1',userId:'member',role:'member',status:'active'},
      {groupId:'group-1',userId:'former',role:'member',status:'left'}
    ]
  };
  assert.equal(canAccessMessageGroup(db,'group-1','owner'),true);
  assert.equal(canAccessMessageGroup(db,'group-1','former'),false);
  assert.equal(canManageMessageGroup(db,'group-1','owner'),true);
  assert.equal(canManageMessageGroup(db,'group-1','member'),false);
  assert.deepEqual(getActiveMessageGroupMembers(db,'group-1'),['owner','member']);
  assert.deepEqual(summarizeGroupReadState({from:'owner',readBy:{member:'2026-11-06T12:00:00Z'}},['owner','member']),{
    readCount:1,total:1,allRead:true
  });
});

test('Messenger reactions are limited to supported choices',()=>{
  for(const reaction of ['👍','❤️','😂','😮','😢','🙏','🔥','🎉']){
    assert.equal(validateMessageGroupReaction(reaction),reaction);
  }
  assert.equal(validateMessageGroupReaction('💣'),null);
  assert.equal(validateMessageGroupReaction('not-an-emoji'),null);
});

test('Conversation search and shared media APIs are scoped to the signed-in conversation',async()=>{
  const server=await read('../../src/server.js');
  assert.ok(server.includes("if(method==='GET'&&p==='/api/messages/search')"));
  assert.ok(server.includes("if(method==='GET'&&p==='/api/messages/shared')"));
  assert.ok(server.includes("message.deletedFor.includes(user.id)"));
  assert.ok(server.includes('canAccessMessageGroup(db,groupId,user.id)'));
  assert.ok(server.includes('blockedBetween(user.id,peerId)'));
  assert.ok(server.includes("item.status==='attached'&&item.slot==='message'"));
  assert.ok(server.includes("new URL(clean)"));
});

test('Messenger chat tools expose history search and private shared-media browsing',async()=>{
  const [app,css]=await Promise.all([
    read('../../public/app.js'),read('../../public/styles.css')
  ]);
  assert.ok(app.includes('function openConversationTools(userId)'));
  assert.ok(app.includes("api('/messages/search?q='"));
  assert.ok(app.includes("api('/messages/shared?conversationId='"));
  assert.ok(app.includes('data-message-tools='));
  assert.ok(app.includes('data-tools-tab="search"'));
  assert.ok(app.includes('data-shared-kind="photos"'));
  assert.ok(app.includes('data-shared-kind="videos"'));
  assert.ok(app.includes('data-shared-kind="audio"'));
  assert.ok(app.includes('data-shared-kind="files"'));
  assert.ok(app.includes('data-shared-kind="links"'));
  assert.ok(css.includes('.message-tools-modal'));
  assert.ok(css.includes('.message-tools-shared-grid'));
  assert.ok(css.includes('.message-window-bubble.is-search-match'));
});

test('Group chat typing and active status update do not fabricate connection state',async()=>{
  const [app,server]=await Promise.all([
    read('../../public/app.js'),read('../../src/server.js')
  ]);
  assert.ok(app.includes('function messengerTypingUsers(win)'));
  assert.ok(app.includes('people are typing'));
  assert.ok(app.includes('state.messengerPresence[win.user.id]===true'));
  assert.ok(app.includes('syncMessageRefreshPolling'));
  assert.ok(server.includes('messengerRealtime?.refreshPresence(user.id)'));
});
