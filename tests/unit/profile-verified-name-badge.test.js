import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [app, html, serviceWorker, profileBadges, adminCentre] = await Promise.all([
  read('public/app.js'),
  read('public/index.html'),
  read('public/sw.js'),
  read('public/profile-badges.js'),
  read('public/admin-centre.js')
]);

test('every verified profile shows one blue check beside the username only', () => {
  assert.doesNotMatch(app, /PROFILE_NAME_VERIFICATION_BADGE_HIDDEN_USER_ID|profileNameVerificationBadge/);
  assert.match(app, /profile-name-with-badges"><span>'\+esc\(u\.name\)\+'<\/span>'\+platformAdminProfileBadge\(u\)/);
  assert.match(app, /profile-username-line">@'\+esc\(u\.username\)\+' '\+verifiedProfileBadge\(u\)\+gifterProfileBadge\(u\)/);
  assert.match(app, /profile-preview-name">.*platformAdminProfileBadge\(u\).*<small>@'\+esc\(u\.username\)\+' '\+verifiedProfileBadge\(u\)/);
  assert.ok(profileBadges.includes("const checks = [...profile.querySelectorAll('.profile-blue-verification')];"));
  assert.ok(profileBadges.includes("checks.find(item => usernameLine?.contains(item)) || checks[0] || null"));
  assert.ok(profileBadges.includes("usernameLine.append(' ', check);"));
  assert.doesNotMatch(profileBadges, /name\.append\(check\)/);
});

test('the admin verification control explicitly describes one username check', () => {
  assert.ok(adminCentre.includes('Grant or remove one blue verification sticker.'));
  assert.ok(adminCentre.includes('exactly one check beside the @username.'));
  assert.ok(adminCentre.includes('Verified — one blue check beside username'));
});

test('the updated profile bundle is referenced by the app shell and service worker', () => {
  const appUrl = '/app.js?v=20261105-single-username-verification-1';
  assert.ok(html.includes(appUrl));
  assert.ok(serviceWorker.includes(appUrl));
  assert.ok(serviceWorker.includes("cache:'no-cache'"));
});
