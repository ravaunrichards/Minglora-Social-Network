import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(path,import.meta.url),'utf8');

test('Messenger popups stay right-pinned and expose phone, camera and microphone controls without maximize', async()=>{
  const [app,css]=await Promise.all([read('../../public/app.js'),read('../../public/styles.css')]);
  assert.match(css,/#message-window-dock\\{[^}]*right:[^}]*left:auto/);
  assert.match(app,/data-message-audio=/);
  assert.match(app,/data-message-video=/);
  assert.match(app,/data-message-voice=/);
  assert.match(app,/data-message-remove=/);
  assert.doesNotMatch(app,/data-message-maximize|data-message-expand/);
  assert.match(app,/state\\.messageWindows\\.slice\\(\\)\\.reverse\\(\\)\\.map/);
});

test('Messages expose sender edit, per-user delete, unsend and inbox removal APIs', async()=>{
  const [app,server,store]=await Promise.all([
    read('../../public/app.js'),read('../../src/server.js'),read('../../src/store.js')
  ]);
  assert.match(server,/if\\(method===\'PATCH\'&&messageActionMatch\)/);
  assert.match(server,/if\\(method===\'DELETE\'&&messageActionMatch\)/);
  assert.match(server,/deletedFor/);
  assert.match(server,/messageConversationHides/);
  assert.match(app,/data-message-edit=/);
  assert.match(app,/data-message-delete-me=/);
  assert.match(app,/data-message-unsend=/);
  assert.match(app,/data-remove-inbox-chat=/);
  assert.match(store,/messageConversationHides/);
});

test('Small media files use the official signed-upload URL route and larger files retain TUS', async()=>{
  const [app,server,edge]=await Promise.all([
    read('../../public/app.js'),
    read('../../src/server.js'),
    read('../../supabase/functions/minglora-runtime-state/index.ts')
  ]);
  assert.match(edge,/signedUrl,token,endpoint/);
  assert.match(server,/signedUrl:prepared\\.signedUrl/);
  assert.match(app,/uploadInfo\\.signedUrl/);
  assert.match(app,/formData\\.append\\('cacheControl'/);
  assert.match(app,/window\\.tus\\.Upload/);
});
