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

test('profile status, check-ins, events and Highlights are loaded into visible profile sections', async () => {
  const app = await read('../../public/app.js');
  assert.match(app, /profile-status-badge/);
  assert.match(app, /async function openProfileStatusEditor/);
  assert.match(app, /async function openStoryArchiveManager/);
  assert.match(app, /async function openProfileArchiveManager/);
  assert.match(app, /id="profile-create-checkin"/);
  assert.match(app, /id="profile-create-event"/);
  assert.match(app, /id="profile-manage-highlights"/);
  assert.match(app, /api\('\/profile-sections'/);
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

test('profile tabs include a right-aligned three-dot overflow menu with requested profile actions', async () => {
  const [app, css, html, sw] = await Promise.all([
    read('../../public/app.js'), read('../../public/styles.css'),
    read('../../public/index.html'), read('../../public/sw.js')
  ]);
  assert.match(app, /profile-tabs-overflow/);
  assert.match(app, /id="profile-overflow-trigger"/);
  assert.match(app, /role="menu" aria-label="Profile actions"/);
  for (const label of ['View as','Search','Add Highlights','Profile status','Archive','Story archive','Activity log','Profile and tagging settings','Minglora Verified']) {
    assert.ok(app.includes(label), label+' profile action must be present');
  }
  assert.match(app, /data-profile-overflow-action="lock-toggle"/);
  assert.match(app, /profileVisibility:next/);
  assert.match(css, /\.profile-tabs-overflow\{[^}]*align-items:center/);
  assert.match(css, /\.profile-overflow-trigger\{[^}]*align-self:center/);
  assert.match(html, /styles\.css\?v=20261101-profile-tools-1/);
  assert.match(sw, /minglora-shell-v58-profile-tools-1/);
});
