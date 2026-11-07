import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [server, app, css, html, serviceWorker] = await Promise.all([
  read('src/server.js'),
  read('public/app.js'),
  read('public/profile-badges.css'),
  read('public/index.html'),
  read('public/sw.js')
]);

test('the designated Minglora admin and members with active grants get LIVE Pro profile recognition', () => {
  assert.ok(server.includes("result.liveProBadge=isDesignatedCreatorHubAdmin(u)||(db.liveProGrants||[]).some(grant=>grant.userId===u.id&&grant.status==='active'&&(!grant.expiresAt||new Date(grant.expiresAt).getTime()>Date.now()));"));
});

test('LIVE Pro appears beside the username in the profile header and previews', () => {
  assert.ok(app.includes("<p class=\"profile-username-line\">@'+esc(u.username)+' '+verifiedProfileBadge(u)+liveProProfileBadge(u)+'</p>"));
  assert.ok(app.includes("live-profile-preview-heading"));
  assert.ok(app.includes("verifiedProfileBadge(member)+liveProProfileBadge(member)"));
  assert.ok(app.includes("verifiedProfileBadge(u)+liveProProfileBadge(u)"));
});

test('active LIVE Pro is included in Creator recognition on the Badges tab', () => {
  assert.ok(app.includes('if(u.liveProBadge===true){'));
  assert.ok(app.includes('kind:"live-pro"'));
  assert.ok(app.includes('title:"Minglora LIVE Pro"'));
  assert.ok(css.includes('.profile-live-pro-badge'));
  assert.ok(css.includes('.profile-award-art--live-pro'));
});

test('the updated app and badge stylesheet are referenced by the service-worker shell', () => {
  const appAsset = html.match(/app\.js\?v=[^"']+/)?.[0] || '';
  const badgeStylesheet = html.match(/profile-badges\.css\?v=[^"']+/)?.[0] || '';
  const cacheName = serviceWorker.match(/CACHE_NAME='([^']+)'/)?.[1] || '';
  assert.ok(appAsset, 'the app script has a versioned URL');
  assert.ok(badgeStylesheet, 'the profile badge stylesheet has a versioned URL');
  assert.ok(serviceWorker.includes('/' + appAsset));
  assert.ok(serviceWorker.includes('/' + badgeStylesheet));
  assert.match(cacheName, /^minglora-shell-v\d+-self-updating-1$/);
});
