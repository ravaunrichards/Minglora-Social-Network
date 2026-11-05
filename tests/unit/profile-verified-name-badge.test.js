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

test('the profile bundle remains in the app shell and scripts are revalidated from the network', () => {
  const appUrl = '/app.js?v=20261105-coin-funding-sources-1';
  assert.ok(html.includes(appUrl));
  assert.ok(serviceWorker.includes(appUrl));
  assert.match(serviceWorker, /\['style','script','font'\]\.includes\(request\.destination\)/);
  assert.match(serviceWorker, /fetch\(request,\{cache:'no-cache'\}\)/);
});
