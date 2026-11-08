import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('profile thought clouds sit above the separate portrait and remain tappable from the feed', async () => {
  const [app,server,css] = await Promise.all([
    read('../../public/app.js'),read('../../src/server.js'),read('../../public/styles.css')
  ]);
  assert.ok(app.includes('function thoughtAvatarMarkup('));
  assert.ok(app.includes('function openProfileThoughtViewer('));
  assert.ok(app.includes('function openProfileThoughtByUserId('));
  assert.ok(app.includes('ml-thought-avatar-indicator'));
  assert.ok(app.includes('data-view-profile-thought-user='));
  assert.ok(app.includes('ml-thought-avatar-add'));
  assert.ok(app.includes('const profileThoughtMarkup=data.profileStatus?.text'));
  assert.ok(app.includes('ml-profile-thought-bubble'));
  assert.ok(app.includes('ml-profile-thought-add'));
  const thoughtSlotStart=app.indexOf(`(profileThoughtMarkup?'<div class="profile-thought-slot">'`);
  const avatarWrapStart=app.indexOf('class="profile-avatar-edit-wrap"><img');
  const infoMainStart=app.indexOf('<div class="profile-info-main">',avatarWrapStart);
  assert.ok(thoughtSlotStart>=0&&avatarWrapStart>thoughtSlotStart,'thought cloud is emitted before the independent portrait');
  assert.ok(infoMainStart>avatarWrapStart,'profile identity stays in its own column beside the portrait');
  assert.doesNotMatch(app.slice(avatarWrapStart,infoMainStart),/profileThoughtMarkup/,'thought content must not be inserted over the portrait or identity');
  assert.ok(app.includes(`(profileThoughtMarkup?' profile-info--with-thought':'')`),'thought profiles receive the dedicated two-row layout class');
  assert.ok(app.includes("bindProfileThoughtControls($('#main-content'))"));
  assert.ok(app.includes("api('/users/'+encodeURIComponent(userId)+'/profile-status')"));
  assert.ok(server.includes('canViewProfileAudience(viewerId,u.id,item.audience)'));
  assert.ok(server.includes('result.profileThought='));
  assert.ok(css.includes('.ml-profile-thought-bubble'));
  assert.ok(css.includes('.ml-thought-avatar-indicator'));
});

test('thought editor retains audience options and expiry and allows edit and removal', async () => {
  const [app,server]=await Promise.all([read('../../public/app.js'),read('../../src/server.js')]);
  assert.ok(app.includes('Share a thought'));
  assert.ok(app.includes('Who can see your thought?'));
  assert.ok(app.includes('How long it stays visible'));
  assert.ok(app.includes('Remove current thought'));
  assert.ok(app.includes("api('/profile-status',{method:'DELETE',body:'{}'})"));
  assert.ok(server.includes("if(method==='DELETE'&&p==='/api/profile-status')"));
  assert.ok(server.includes("['public','friends','followers','private'].includes(audience)"));
  assert.ok(server.includes('Math.min(168,Number(input.expiresInHours)||24)'));
});
