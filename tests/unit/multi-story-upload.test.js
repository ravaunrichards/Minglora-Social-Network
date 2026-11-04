import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../../src/server.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../public/styles.css', import.meta.url), 'utf8');

test('story uploader accepts multiple photos and videos with per-file and total selection limits', () => {
  assert.match(app, /slot:'story',maxFiles:10,maxTotalBytes:500\*1024\*1024/);
  assert.match(app, /maxFiles>1\?'multiple':''/);
  assert.match(app, /selectedBytes\+file\.size>maxTotalBytes/);
  assert.match(app, /Choose multiple photos and videos/);
  assert.match(app, /data-media-input accept=/);
});

test('story publishing sends all uploaded media IDs in one idempotent batch request', () => {
  assert.match(app, /JSON\.stringify\(\{text:values\.get\('text'\),mediaIds,audience:values\.get\('audience'\),soundtrack:track,requestId\}\)/);
  assert.match(app, /window\.crypto\?\.randomUUID\?\.\(\)/);
  assert.match(server, /normalizeStoryMediaIds\(input,10\)/);
  assert.match(server, /assets\.some\(asset=>!asset\)/);
  assert.match(server, /totalBytes>500\*1024\*1024/);
  assert.match(server, /combined story upload is larger than 500 MB/);
  assert.match(server, /Nothing was published/);
  assert.match(server, /const totalBytes=assets\\.reduce\\(\\(total,asset\\)=>total\\+Number\\(asset\\.byteSize\\|\\|0\\),0\\)/);
  assert.match(server, /if\\(totalBytes>500\\*1024\\*1024\\)/);
  assert.match(server, /combined story upload is larger than 500 MB/);
});

test('each story in a multi-upload batch is stored as its own appended active item', () => {
  assert.match(server, /createStoryBatch\(\{/);
  assert.match(server, /db\.stories=appendStoryBatch\(db\.stories\|\|\[\],createdStories\)/);
  assert.match(server, /item\.storyRequestId===requestId/);
  assert.match(server, /alreadyPublished:true/);
  assert.match(app, /Your earlier stories are still there/);
});

test('a member story card shows the number of active stories and opens a sequence viewer', () => {
  assert.match(app, /const byAuthor=new Map\(\)/);
  assert.match(app, /story-count/);
  assert.match(app, /Story '\+\(storyIndex\+1\)\+' of '\+sequence\.length/);
  assert.match(app, /data-story-previous/);
  assert.match(app, /data-story-next/);
  assert.match(app, /video\?\.addEventListener\('ended',\(\)=>navigate\(storyIndex\+1\)\)/);
});

test('story batch size, duplicate IDs, ownership and media types are validated server-side', () => {
  assert.match(server, /mediaSelection=normalizeStoryMediaIds\(input,10\)/);
  assert.match(server, /item\.ownerId===user\.id&&item\.slot==='story'/);
  assert.match(server, /item\.status==='uploaded'&&\['image','video'\]\.includes\(item\.mediaType\)/);
});

test('story sequence navigation and composer remain usable on narrow phone screens', () => {
  assert.match(css, /\.story-navigation button\{min-height:44px/);
  assert.match(css, /\.story-viewer-backdrop\{align-items:flex-start/);
  assert.match(css, /\.story-viewer\{width:100%;max-width:100%;max-height:calc\(100dvh - 16px\)/);
  assert.match(css, /\.story-composer-modal \.modal-body\{max-height:calc\(100dvh - 90px\);overflow-y:auto\}/);
});
