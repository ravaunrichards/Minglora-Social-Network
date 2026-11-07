import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [app, html, serviceWorker, adminCentre] = await Promise.all([
  read('public/app.js'),
  read('public/index.html'),
  read('public/sw.js'),
  read('public/admin-centre.js')
]);

test('every verified profile shows one blue check beside the username only', () => {
  assert.doesNotMatch(app, /PROFILE_NAME_VERIFICATION_BADGE_HIDDEN_USER_ID|profileNameVerificationBadge/);
  assert.match(app, /profile-name-with-badges"><span>'\+esc\(u\.name\)\+'<\/span>'\+platformAdminProfileBadge\(u\)/);
  assert.match(app, /profile-username-line">@'\+esc\(u\.username\)\+' '\+verifiedProfileBadge\(u\)\+gifterProfileBadge\(u\)/);
  assert.ok(app.includes(`profile-preview-name">'+esc(u.name)+platformAdminProfileBadge(u)+'</strong><small>@'+esc(u.username)+' '+verifiedProfileBadge(u)+'</small>`));
});

test('the admin verification control explicitly describes one username check', () => {
  assert.ok(adminCentre.includes('Grant or remove one blue verification sticker.'));
  assert.ok(adminCentre.includes('exactly one check beside the @username.'));
  assert.ok(adminCentre.includes('Verified — one blue check beside username'));
});

test('the app keeps its established asset URL and refreshes the service worker cache', () => {
  assert.ok(html.includes('/app.js?v=20261107-profile-controls-functional-1'));
  assert.ok(serviceWorker.includes('/app.js?v=20261107-profile-controls-functional-1'));
  assert.ok(serviceWorker.includes("cache:'no-cache'"));
  assert.ok(serviceWorker.includes('minglora-shell-v130-profile-controls-functional-1'));
});
