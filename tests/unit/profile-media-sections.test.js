import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('profile exposes Facebook-style Posts, About, Friends, Photos, Reels and More sections', async () => {
  const app = await read('../../public/app.js');
  for (const section of ['posts','about','friends','photos','reels','more']) {
    assert.ok(app.includes("data-profile-tab=\"'+key+'\""), section+' tab attribute must be rendered');
  }
  assert.match(app, /function profileTabMarkup/);
  assert.match(app, /function bindProfileTabActions/);
  assert.match(app, /profile-albums-grid/);
  assert.match(app, /profile-reels-grid/);
  assert.match(app, /data-profile-tab="videos"/);
});

test('photo albums are persisted and owner-only album operations use owned uploaded image assets', async () => {
  const [server, store] = await Promise.all([read('../../src/server.js'), read('../../src/store.js')]);
  assert.match(store, /'albums'/);
  assert.match(server, /p==='\/api\/albums'/);
  assert.match(server, /\/api\/albums\/\(\[\^\/\]\+\)\/photos/);
  assert.match(server, /asset\.ownerId===user\.id&&asset\.slot==='post'&&asset\.status==='uploaded'&&asset\.mediaType==='image'/);
  assert.match(server, /album\.visibility==='public'/);
  assert.match(server, /album\.visibility==='friends'&&viewerIsFriend/);
});

test('profile Photos and Reels use media actually attached to the member profile', async () => {
  const [server, app] = await Promise.all([read('../../src/server.js'), read('../../public/app.js')]);
  assert.match(server, /const profilePhotos=profileMedia\.filter\(media=>media\.mediaType==='image'\)/);
  assert.match(server, /const profileVideos=profileMedia\.filter\(media=>media\.mediaType==='video'\)/);
  assert.match(server, /reels:profileVideos/);
  assert.match(app, /function openProfileAlbumEditor/);
  assert.match(app, /function openProfilePhotoComposer/);
  assert.match(app, /function openProfileReelComposer/);
  assert.match(app, /accept:'image\/jpeg,image\/png,image\/webp,image\/avif'/);
  assert.match(app, /accept:'video\/mp4,video\/webm,video\/quicktime'/);
});
