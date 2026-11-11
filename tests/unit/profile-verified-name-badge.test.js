import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [app, html, serviceWorker, adminCentre, badgeScript] = await Promise.all([
  read('public/app.js'),
  read('public/index.html'),
  read('public/sw.js'),
  read('public/admin-centre.js'),
  read('public/profile-badges.js')
]);

test('verified profiles show only the blue check beside the username', () => {
  assert.ok(app.includes("profile-username-line\">@'+esc(u.username)+' '+verifiedProfileBadge(u)+'</p>"));
  assert.ok(!app.includes('verifiedProfileBadge(u)+gifterProfileBadge(u,"profile")+liveProProfileBadge(u)'));
  assert.ok(app.includes("+(isAdminProfile?'<div class=\"profile-admin-identity\" aria-label=\"Administrator identity\""));
  assert.ok(app.includes('<small>Owner</small>'));
  assert.ok(app.includes('<small>Protected</small>'));
  assert.ok(app.includes('<small>Admin</small>'));
  assert.match(app,/const isAdminProfile=Boolean\(isMe&&/);
});

test('profile previews and friend cards omit all non-verification badges', () => {
  assert.ok(app.includes("<strong class=\"profile-preview-name\">'+esc(u.name)+'</strong><small>@'+esc(u.username)+' '+verifiedProfileBadge(u)+'</small>"));
  assert.ok(app.includes('verifiedProfileBadge(member)+"</small></div>"'));
  assert.ok(app.includes("verifiedProfileBadge(member)+'</small></button>'"));
  assert.ok(!app.includes('verifiedProfileBadge(member)+gifterProfileBadge(member,"profile")+liveProProfileBadge(member)'));
  assert.ok(!app.includes('verifiedProfileBadge(member)+gifterProfileBadge(member,"compact")'));
  assert.ok(badgeScript.includes("'.profile-live-pro-badge'"));
  assert.ok(!badgeScript.includes("'.profile-admin-identity'"));
});

test('the complete badge gallery remains available separately', () => {
  assert.ok(app.includes("if(tab==='badges')return profileBadgesMarkup(data,isMe);"));
  assert.ok(app.includes('gifterBadgeImageMarkup({ ...badge, level }, "gallery")'));
  assert.ok(app.includes('PROFILE RECOGNITION'));
});

test('the admin verification control still grants or removes only the blue username check', () => {
  assert.ok(adminCentre.includes('Grant or remove one blue verification sticker.'));
  assert.ok(adminCentre.includes('exactly one check beside the @username.'));
  assert.ok(adminCentre.includes('Verified — one blue check beside username'));
});

test('the updated app asset and service-worker cache are versioned together', () => {
  const appAsset=html.match(/app\.js\?v=[^"']+/)?.[0]||'';
  const cacheName=serviceWorker.match(/CACHE_NAME='([^']+)'/)?.[1]||'';
  assert.equal(appAsset,'app.js?v=20261111-profile-verification-only-1');
  assert.ok(serviceWorker.includes('/'+appAsset));
  assert.equal(cacheName,'minglora-shell-v276-self-updating-1');
});
