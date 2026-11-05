import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('shared media picker exposes true multi-select and consumes the complete desktop FileList', async () => {
  const app = await read('../../public/app.js');
  assert.ok(app.includes("maxFiles>1?' multiple=\"multiple\":'"));
  assert.ok(app.includes('gallery.multiple=maxFiles>1'));
  assert.ok(app.includes('const selected=[...gallery.files];addFiles(selected);gallery.value=\'\';'));
  assert.match(app, /for\(const file of Array\.from\(fileList\|\|\[\]\)\)/);
});

test('desktop drag-and-drop uses the same picker validation and preview pipeline', async () => {
  const app = await read('../../public/app.js');
  const css = await read('../../public/styles.css');
  assert.ok(app.includes("dropZone.addEventListener('dragenter'"));
  assert.ok(app.includes("dropZone.addEventListener('dragover'"));
  assert.ok(app.includes("dropZone.addEventListener('dragleave'"));
  assert.ok(app.includes("dropZone.addEventListener('drop'"));
  assert.ok(app.includes('addFiles(files)'));
  assert.match(css, /\.media-picker\.is-dragging\{/);
  assert.ok(app.includes('Select multiple files at once, or drag and drop files here'));
});

test('all shared multi-file publishing surfaces keep their intended attachment caps', async () => {
  const app = await read('../../public/app.js');
  assert.match(app, /createMediaPicker\(modal\.querySelector\('#create-post-media-picker'\),\{slot:'post',maxFiles:10\}\)/);
  assert.match(app, /createMediaPicker\(root,\{slot:"post",maxFiles:10\}\)/);
  assert.match(app, /createMediaPicker\(pickerRoot,\{slot:"page",maxFiles:10\}\)/);
  assert.match(app, /createMediaPicker\(\$\('#group-post-media-picker'\),\{slot:'group',maxFiles:10\}\)/);
  assert.match(app, /createMediaPicker\(modal\.querySelector\('\[data-profile-album-picker\]'\),\{slot:'post',maxFiles:30/);
  assert.match(app, /createMediaPicker\(modal\.querySelector\('\[data-profile-photo-picker\]'\),\{slot:'post',maxFiles:10/);
  assert.match(app, /createMediaPicker\(modal\.querySelector\('\[data-profile-reel-picker\]'\),\{slot:'post',maxFiles:10/);
  assert.match(app, /createMediaPicker\(modal\.querySelector\('#story-media-picker'\),\{slot:'story',maxFiles:10,maxTotalBytes:500\*1024\*1024\}\)/);
  assert.match(app, /createMediaPicker\(root,\{slot:'message',maxFiles:5,compact:true\}\)/);
});

test('picker uploads every selected file in order and returns every registered media ID', async () => {
  const app = await read('../../public/app.js');
  assert.match(app, /async upload\(\)\{\s*const ids=\[\];\s*for\(const entry of entries\)/);
  assert.match(app, /const saved=await uploadMediaFile\(slot,entry\.file/);
  assert.match(app, /ids\.push\(saved\.id\)/);
  assert.match(app, /return ids;/);
});

test('Stories accept batches, enforce per-file count and combined size, and retain earlier stories', async () => {
  const [app, server] = await Promise.all([
    read('../../public/app.js'),
    read('../../src/server.js')
  ]);
  assert.match(app, /JSON\.stringify\(\{text:values\.get\('text'\),mediaIds,audience:values\.get\('audience'\),soundtrack:track\}\)/);
  assert.match(server, /const requestedMediaIds=Array\.isArray\(input\.mediaIds\)\?input\.mediaIds:/);
  assert.match(server, /mediaIds\.length>10/);
  assert.match(server, /\['image','video'\]\.includes\(item\.mediaType\)/);
  assert.match(server, /totalBytes>500\*1024\*1024/);
  assert.match(server, /db\.stories\.push\(story\)/);
  assert.match(server, /mediaIds\.forEach\(id=>\{const asset=/);
  assert.match(app, /const storyMedia=Array\.isArray\(s\.mediaItems\)&&s\.mediaItems\.length\?s\.mediaItems:/);
  assert.match(app, /data-story-next/);
});
