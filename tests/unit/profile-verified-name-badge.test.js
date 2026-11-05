import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const OWNER_USER_ID = '28e1df97-3fe1-488e-bb84-bdc353c58653';

const [app, html, serviceWorker] = await Promise.all([
  read('public/app.js'),
  read('public/index.html'),
  read('public/sw.js')
]);

test('Larry keeps the blue verification check beside the username, not the display name', () => {
  assert.match(app, new RegExp(`PROFILE_NAME_VERIFICATION_BADGE_HIDDEN_USER_ID = ['"]${OWNER_USER_ID}['"]`));
  assert.match(app, /member\?\.id === PROFILE_NAME_VERIFICATION_BADGE_HIDDEN_USER_ID \? '' : verifiedProfileBadge\(member\)/);
  assert.match(app, /profile-name-with-badges"><span>'\+esc\(u\.name\)\+'<\/span>'\+profileNameVerificationBadge\(u\)\+platformAdminProfileBadge\(u\)/);
  assert.match(app, /profile-username-line">@'\+esc\(u\.username\)\+' '\+verifiedProfileBadge\(u\)\+gifterProfileBadge\(u\)/);
});

test('other verified members still use the normal display-name badge and app cache points to the updated bundle', () => {
  assert.match(app, /member\?\.id === PROFILE_NAME_VERIFICATION_BADGE_HIDDEN_USER_ID \? '' : verifiedProfileBadge\(member\)/);
  assert.ok(html.includes('/app.js?v=20261105-profile-name-checkmark-1'));
  assert.ok(serviceWorker.includes('/app.js?v=20261105-profile-name-checkmark-1'));
  assert.match(serviceWorker, /CACHE_NAME='minglora-shell-v85-profile-name-checkmark-1'/);
});
