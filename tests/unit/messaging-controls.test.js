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
