import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(path,import.meta.url),'utf8');

test('Messenger popups stay right-pinned and expose phone, camera and microphone controls without maximize', async()=>{
  const [app,css]=await Promise.all([read('../../public/app.js'),read('../../public/styles.css')]);
  assert.ok(css.includes('#message-window-dock{'));
  assert.ok(css.includes('right:max(12px,env(safe-area-inset-right))!important'));
  assert.ok(app.includes('data-message-audio='));
  assert.ok(app.includes('data-message-video='));
  assert.ok(app.includes('data-message-voice='));
  assert.ok(app.includes('data-message-remove='));
  assert.ok(!app.includes('data-message-maximize')&&!app.includes('data-message-expand'));
  assert.ok(app.includes('state.messageWindows.slice().reverse().map'));
  assert.ok(app.includes('data-message-minimize=')&&app.includes('data-message-close='));
});

test('Messages expose sender edit, per-user delete, unsend and inbox removal APIs', async()=>{
  const [app,server,store]=await Promise.all([
    read('../../public/app.js'),read('../../src/server.js'),read('../../src/store.js')
  ]);
  assert.ok(server.includes("if(method==='PATCH'&&messageActionMatch)"));
  assert.ok(server.includes("if(method==='DELETE'&&messageActionMatch)"));
  assert.ok(server.includes('deletedFor'));
  assert.ok(server.includes('messageConversationHides'));
  assert.ok(app.includes('data-message-edit='));
  assert.ok(app.includes('data-message-delete-me='));
  assert.ok(app.includes('data-message-unsend='));
  assert.ok(app.includes('data-remove-inbox-chat='));
  assert.ok(store.includes('messageConversationHides'));
});

test('Small media files use the signed-upload URL route and large files retain TUS with a signed fallback', async()=>{
  const [app,server,edge]=await Promise.all([
    read('../../public/app.js'),
    read('../../src/server.js'),
    read('../../supabase/functions/minglora-runtime-state/index.ts')
  ]);
  assert.ok(edge.includes('byteSize,token,signedUrl,endpoint'));
  assert.ok(server.includes('signedUrl:prepared.signedUrl||null'));
  assert.ok(app.includes('uploadInfo.signedUrl'));
  assert.ok(app.includes("formData.append('cacheControl','3600')"));
  assert.ok(app.includes('new window.tus.Upload'));
  assert.ok(app.includes('invalid compact jws'));
  assert.ok(edge.includes('action === "media_delete"'));
});


test('Messenger top-right control opens a right-side chats panel with filters, quick actions and individual settings switches', async()=>{
  const [app,css,html,server,settings]=await Promise.all([
    read('../../public/app.js'),read('../../public/styles.css'),read('../../public/index.html'),
    read('../../src/server.js'),read('../../public/settings.js')
  ]);
  assert.ok(app.includes("$('#messenger-btn')?.addEventListener('click',toggleMessengerPanel)"));
  assert.ok(app.includes("state.view==='messages'||state.messageWindows.length>0||state.messengerPanelOpen"));
  assert.ok(app.includes('if(state.messengerPanelOpen)renderMessengerPanelList()'));
  assert.ok(app.includes('data-messenger-new'));
  assert.ok(app.includes('data-messenger-see'));
  assert.ok(app.includes('data-messenger-options'));
  assert.ok(app.includes("['all','unread','groups','communities'].map"));
  for(const label of ['Incoming call sounds','Message sounds','Automatically open new messages','Privacy settings','Active status','Message requests','Archived chats','Message delivery settings','Restricted accounts','Block settings'])assert.ok(app.includes(label));
  assert.ok(app.includes('data-messenger-setting='));
  assert.ok(app.includes('data-messenger-archive=')&&app.includes('data-messenger-restrict='));
  assert.ok(app.includes('data-messenger-destination='));
  assert.ok(css.includes('.messenger-panel{position:fixed')&&css.includes('left:auto;right:max(14px,env(safe-area-inset-right))'));
  assert.ok(css.includes('top:70px;left:auto;right:max(8px,env(safe-area-inset-right))'));
  assert.ok(css.includes('.messenger-switch.is-on'));
  assert.ok(html.includes('20261101-messenger-right-panel-2'));
  assert.ok(server.includes('messengerAutoOpenNewMessages')&&server.includes('messengerArchivedConversationIds'));
  assert.ok(server.includes('isRequest:!isFriend'));
  assert.ok(settings.includes('messengerActiveStatus: true'));
});

test('Messenger restrictions are enforced for incoming messages and archived chats stay out of the main inbox', async()=>{
  const [app,server]=await Promise.all([read('../../public/app.js'),read('../../src/server.js')]);
  assert.ok(server.includes("recipientSettings.preferences.messengerRestrictedUserIds||[]).includes(user.id)"));
  assert.ok(app.includes('const archivedIds=new Set(messengerPreferences().messengerArchivedConversationIds||[])'));
  assert.ok(app.includes('const visibleConversations=state.conversations.filter(conversation=>!archivedIds.has(conversation.user.id))'));
});
test('Messenger notification sound reuses the user-activated call audio context', async()=>{
  const app=await read('../../public/app.js');
  assert.ok(app.includes('const context=callToneContext||messengerMessageSoundContext||new AudioContextClass()'));
  assert.ok(app.includes('if(context.state!==\'running\')return'));
});
