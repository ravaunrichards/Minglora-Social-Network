import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Share thoughts is a real post composer connected to the authenticated post API', async () => {
  const [app, server, html] = await Promise.all([
    read('../../public/app.js'),
    read('../../src/server.js'),
    read('../../public/index.html')
  ]);

  assert.ok(app.includes('Share your thoughts,'));
  assert.ok(app.includes('<span>Share thoughts</span>'));
  assert.ok(app.includes('id="create-post-form"'));
  assert.ok(app.includes('placeholder="What would you like to share?"'));
  assert.ok(app.includes("await api('/posts',{method:'POST',body:JSON.stringify({text:values.get('text'),mediaIds})});"));
  assert.ok(app.includes("createMediaPicker(modal.querySelector('#create-post-media-picker'),{slot:'post',maxFiles:10})"));
  assert.ok(server.includes("if(method==='POST'&&p==='/api/posts')"));
  assert.ok(server.includes('validatePostInput(input)'));
  assert.ok(server.includes('publicPost(post,user.id)'));
  assert.ok(html.includes('app.js?v=20261101-mailharbor-in-app-1'));
});

test('Messenger controls connect to conversation, user, settings and read-receipt routes', async () => {
  const [app, server, settings] = await Promise.all([
    read('../../public/app.js'),
    read('../../src/server.js'),
    read('../../public/settings.js')
  ]);

  assert.ok(app.includes("$('#messenger-btn')?.addEventListener('click',toggleMessengerPanel)"));
  assert.ok(app.includes("panel.querySelector('[data-messenger-close]')?.addEventListener('click',closeMessengerPanel)"));
  assert.ok(app.includes("function activateNav(view){if(state.view==='meetwave'"), 'navigation must not dismiss pinned chats');
  assert.ok(app.includes('Keep Chats pinned while the user works elsewhere.'));
  assert.ok(!app.includes("if(event.key==='Escape'&&state.messengerPanelOpen)closeMessengerPanel()"), 'Escape must not dismiss pinned chats');
  assert.ok(!app.includes("!panel.contains(event.target)&&!button?.contains(event.target))closeMessengerPanel()"), 'outside clicks must not dismiss pinned chats');
  assert.ok(app.includes("panel.querySelectorAll('[data-messenger-destination]').forEach(button=>button.onclick=()=>openMessengerDestination(button.dataset.messengerDestination))"));
  assert.ok(app.includes("const settingsRoutes={"));
  assert.ok(app.includes("privacy:{section:'#settings-privacy'}"));
  assert.ok(app.includes("delivery:{section:'#settings-privacy',focus:'[name=\"messageAudience\"]'}"));
  assert.ok(app.includes("blocking:{section:'#settings-blocking'}"));
  assert.ok(app.includes("await api('/messages')"));
  assert.ok(app.includes("await api('/users')"));
  assert.ok(app.includes("api('/settings',{method:'PATCH'"));
  assert.ok(app.includes("api('/messages/'+encodeURIComponent(member.id)+'/read',{method:'POST'"));
  assert.ok(server.includes("if(method==='GET'&&p==='/api/messages')"));
  assert.ok(server.includes("if(method==='POST'&&p==='/api/messages')"));
  assert.ok(server.includes("if(method==='POST'&&messageReadMatch)"));
  assert.ok(server.includes("if(method==='PATCH'&&p==='/api/settings')"));
  assert.ok(server.includes('messengerRestrictedUserIds'));
  assert.ok(server.includes('messengerArchivedConversationIds'));
  assert.ok(settings.includes('id="settings-privacy"'));
  assert.ok(settings.includes('id="settings-blocking"'));
  assert.ok(settings.includes('name="messageAudience"'));
});

test('Messenger request, archive, restrict and filter actions remain connected to their handlers', async () => {
  const [app, server] = await Promise.all([
    read('../../public/app.js'),
    read('../../src/server.js')
  ]);

  for (const destination of ['requests', 'archived', 'restricted', 'privacy', 'delivery', 'blocking']) {
    assert.ok(app.includes("'" + destination + ":{") || app.includes("'" + destination + "'"), destination + ' destination remains defined');
  }
  assert.ok(app.includes("if(section==='requests')rows=state.conversations.filter(item=>item.isRequest===true)"));
  assert.ok(app.includes("if(section==='archived')rows=state.conversations.filter(item=>archived.has(item.user.id))"));
  assert.ok(app.includes("if(section==='restricted')rows=state.conversations.filter(item=>restricted.has(item.user.id))"));
  assert.ok(app.includes("updateMessengerAccountList('messengerArchivedConversationIds'"));
  assert.ok(app.includes("updateMessengerAccountList('messengerRestrictedUserIds'"));
  assert.ok(app.includes("['all','unread','groups','communities'].map"));
  assert.ok(app.includes("activateNav('groups')"));
  assert.ok(server.includes("allowed[section]"));
  assert.ok(server.includes("'messengerArchivedConversationIds','messengerRestrictedUserIds'"));
});

test('new Share thoughts and Messenger controls use the dimensional SVG sprite', async () => {
  const [app, css, sprite, serviceWorker] = await Promise.all([
    read('../../public/app.js'),
    read('../../public/styles.css'),
    read('../../public/assets/icons/navigation-3d.svg'),
    read('../../public/sw.js')
  ]);

  assert.ok(app.includes("MESSENGER_ICON_SPRITE='/assets/icons/navigation-3d.svg?v=20261101-mailharbor-3d-1'"));
  assert.ok(app.includes("function messenger3dIcon(id"));
  assert.ok(css.includes('.messenger-3d-icon{'));
  assert.ok(css.includes('drop-shadow('));
  for (const id of [
    'share', 'photo', 'feeling', 'call', 'sound', 'privacy', 'request',
    'archive', 'delivery', 'lock', 'block', 'external-link', 'more',
    'close', 'restore', 'unlock', 'arrow-left', 'arrow-right'
  ]) {
    assert.match(sprite, new RegExp('<symbol id="' + id + '" viewBox="0 0 64 64">'));
    assert.ok(app.includes("messenger3dIcon('" + id + "'") || app.includes("'" + id + "'"), id + ' is used by the client');
  }
  assert.ok(serviceWorker.includes('minglora-shell-v57-mailharbor-in-app-1'));
  assert.ok(serviceWorker.includes('navigation-3d.svg?v=20261101-mailharbor-3d-1'));
});
