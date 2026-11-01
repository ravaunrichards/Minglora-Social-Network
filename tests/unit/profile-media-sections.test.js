import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('profile exposes Facebook-style Posts, About, Friends, Photos, Reels and More sections', async () => {
  const app = await read('../../public/app.js');
  const sections = [['posts','All'],['about','About'],['friends','Friends'],['photos','Photos'],['reels','Reels'],['more','More']];
  for (const [key,label] of sections) assert.ok(app.includes("['"+key+"','"+label+"']"), label+' profile section must exist');
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
  assert.ok(server.includes("m=p.match(/^\\/api\\/albums\\/([^/]+)\\/photos$/);"), 'album photo attachment route must exist');
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

test('profile More exposes Check-ins, Events, Groups and owner section management', async () => {
  const [app, server] = await Promise.all([read('../../public/app.js'), read('../../src/server.js')]);
  for (const key of ['checkins','events','groups','manage']) {
    assert.ok(app.includes('data-profile-tab="'+key+'"'), key+' must be reachable from More');
    assert.ok(app.includes("if(tab==='"+key+"')"), key+' must have a profile view');
  }
  assert.match(app, /function getProfileSectionPrefs/);
  assert.match(app, /profile-section-manager/);
  assert.match(app, /data-open-group/);
  assert.match(server, /groups:\(db\.groups\|\|\[\]\)\.filter\(group=>group\.ownerId===target\.id/);
});
