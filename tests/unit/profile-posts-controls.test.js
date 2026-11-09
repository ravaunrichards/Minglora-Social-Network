import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFile(path.join(root, file), 'utf8');

test('Minglora profile Posts includes Facebook-style filters, manager and list/grid controls', async () => {
  const app = await read('public/app.js');
  const css = await read('public/profile-facebook-panel.css');
  assert.ok(app.includes('function profilePostFilterFieldsMarkup'));
  assert.ok(app.includes('Use filters to find posts on your timeline. This will not affect how others see your timeline.'));
  assert.ok(app.includes("profilePostFilterOption('you','You'"));
  assert.ok(app.includes("profilePostFilterOption('others','Others'"));
  assert.ok(app.includes("profilePostFilterOption('subscribers','Subscribers'"));
  assert.ok(app.includes("Only show posts I'm tagged in"));
  assert.ok(app.includes('data-manage-profile-posts'));
  assert.ok(app.includes('data-manage-next'));
  assert.ok(app.includes('data-profile-post-layout="grid"'));
  assert.ok(css.includes('.profile-post-list[data-layout="grid"]'));
});

test('profile post reactions remain one-per-member and favorites reuse saved-post records', async () => {
  const app = await read('public/app.js');
  const server = await read('src/server.js');
  assert.ok(app.includes('data-react='));
  assert.ok(app.includes('data-toggle-favorite='));
  assert.ok(server.includes('const previousReaction=post.reactions[user.id]||null;'));
  assert.ok(server.includes('isFavorite:Boolean(savedRecord?.isFavorite)'));
  assert.ok(server.includes('isSaved:Boolean(savedRecord&&savedRecord.isSaved!==false)'));
  assert.ok(server.includes('saved.isSaved=false'));
  assert.ok(server.includes('saved.isSaved!==false||saved.collectionId'));
  assert.ok(server.includes('/favorite$/'));
});

test('profile post pinning is owner-only and allows only one pinned post per profile', async () => {
  const app = await read('public/app.js');
  const server = await read('src/server.js');
  assert.ok(app.includes('data-post-action="pin"'));
  assert.ok(server.includes("post.userId!==user.id)return json(res,403,{error:'Only the author can pin a post to this profile.'}"));
  assert.ok(server.includes('delete item.isPinned;delete item.pinnedAt;'));
  assert.ok(server.includes('post.isPinned=true;'));
});

test('profile post assets are versioned and cached together', async () => {
  const html = await read('public/index.html');
  const sw = await read('public/sw.js');
  const appAsset = '/app.js?v=20261109-facebook-profile-lock-notice-1';
  const cssAsset = '/profile-facebook-panel.css?v=20261109-facebook-profile-lock-notice-1';
  assert.ok(html.includes(appAsset) && sw.includes("'" + appAsset + "'"));
  assert.ok(html.includes(cssAsset) && sw.includes("'" + cssAsset + "'"));
});


test('locked profiles show an owner-only Facebook-style notice above Personal details', async () => {
  const app = await read('public/app.js');
  const css = await read('public/profile-facebook-panel.css');
  const server = await read('src/server.js');
  assert.ok(app.includes('function profileLockNoticeMarkup'));
  assert.ok(app.includes('You locked your profile'));
  assert.ok(app.includes('data-profile-lock-learn-more'));
  assert.ok(app.includes('profileAboutMarkup(u,isMe,data.profileLocked===true)'));
  assert.match(app,/isMe&&isProfileLocked&&key==='personalDetails'/);
  assert.ok(app.includes('function openProfileLockLearnMore'));
  assert.ok(app.includes("state.profile.profileLocked=next==='private'"));
  assert.ok(server.includes("profileLocked:target.id===user.id&&getUserSettings(target).privacy.profileVisibility==='private'"));
  assert.ok(css.includes('.profile-lock-notice'));
  assert.ok(css.includes('grid-column:1/-1'));
  assert.ok(css.includes('border:1px solid var(--line'));
});
