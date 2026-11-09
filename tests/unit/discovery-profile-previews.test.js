import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

test('discovery previews use real member content and existing privacy policies', async () => {
  const server = await read('src/server.js');
  assert.match(server, /\/api\/discovery\/people/);
  assert.match(server, /canViewProfile\(user\.id,member\)/);
  assert.match(server, /canViewStory\(user\.id,story\)/);
  assert.match(server, /post\.status!=='hidden'/);
  assert.match(server, /recentPosts/);
  assert.match(server, /latestStory/);
  assert.match(server, /mutualFriendsCount/);
  assert.match(server, /publicDiscoveryPost/);
  assert.match(server, /await pruneExpiredStories\(\)/);
});

test('People You May Know uses Facebook-style photo, name, mutual-friend and Follow/Remove cards', async () => {
  const [app,server] = await Promise.all([read('public/app.js'),read('src/server.js')]);
  const start=app.indexOf('function peopleCard(p){');
  const end=app.indexOf('function peopleGridMarkup(){',start);
  assert.ok(start>=0&&end>start,'People You May Know card renderer exists');
  const card=app.slice(start,end);
  assert.match(card,/facebook-person-photo/);
  assert.match(card,/facebook-person-name/);
  assert.match(card,/p\.mutualFriendsPreview/);
  assert.match(card,/mutualFriendsCount/);
  assert.match(card,/data-toggle-follow/);
  assert.match(card,/data-dismiss-suggestion/);
  assert.match(server,/mutualFriendsPreview/);
  assert.match(server,/mutualFriendsCount:commonFriendIds\.length/);
  assert.match(app,/member\.friendship!=='accepted'/);
});
test('Friends discovery avoids disruptive background rerenders and refreshes when opened', async () => {
  const app = await read('public/app.js');
  assert.match(app, /async function loadPeopleDiscovery\(\)[\s\S]*api\('\/discovery\/people'\)/);
  assert.match(app, /function startPeopleDiscoveryRefresh\(\)[\s\S]*stopPeopleDiscoveryRefresh\(\)/);
  assert.match(app, /if\(peopleDiscoveryRefreshBusy\|\|state\.view!=='friends'\|\|document\.visibilityState!=='visible'\)return/);
  assert.match(app, /syncPeopleDiscoveryVerification\(result\.users\|\|\[\],grid\)/);
  assert.match(app, /api\('\/discovery\/people\/verification'\)/);
  assert.match(app, /window\.setInterval\(\(\)=>void refreshPeopleDiscovery\(\{quiet:true\}\),30000\)/);
  assert.match(app, /api\('\/live\/sessions'\)/);
  assert.match(app, /openLiveRoom\(session,'viewer'\)/);
  assert.doesNotMatch(app, /id="people-discovery-refresh"/);
});
test('Facebook-style people cards have responsive sizing and reduced-motion treatment', async () => {
  const css=await read('public/people-facebook-responsive.css');
  assert.match(css,/\.facebook-person-card/);
  assert.match(css,/\.facebook-person-photo/);
  assert.match(css,/\.facebook-sidebar-suggestion/);
  assert.match(css,/white-space:nowrap!important/);
  assert.match(css,/aspect-ratio:1\/1/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('static shell cache includes the active discovery app assets', async () => {
  const html = await read('public/index.html');
  const worker = await read('public/sw.js');
  const assets=[
    html.match(/href="(\/styles\.css\?v=[^"]+)"/)?.[1],
    html.match(/src="(\/app\.js\?v=[^"]+)"/)?.[1],
    html.match(/src="(\/friends-advanced\.js\?v=[^"]+)"/)?.[1],
    html.match(/href="(\/social-facebook-layout\.css\?v=[^"]+)"/)?.[1],
    html.match(/href="(\/people-facebook-responsive\.css\?v=[^"]+)"/)?.[1]
  ].filter(Boolean);
  assert.ok(worker.includes("const CACHE_NAME='minglora-shell-v"),'service-worker cache is versioned');
  for(const asset of assets)assert.ok(worker.includes("'"+asset+"'"),'service worker caches '+asset);
});

test('People You May Know cards keep Facebook-style square photo proportions on desktop and mobile',async()=>{
  const app=await read('public/app.js');
  const css=await read('public/people-facebook-responsive.css');
  assert.ok(app.includes('facebook-person-photo'));
  assert.ok(app.includes('facebook-person-follow'));
  assert.ok(app.includes('facebook-person-remove'));
  assert.ok(css.includes('.facebook-person-photo{'));
  assert.ok(css.includes('aspect-ratio:1/1!important'));
  assert.ok(css.includes('aspect-ratio:1/1!important'));
  assert.ok(css.includes('grid-template-columns:96px minmax(0,1fr)!important'));
  assert.ok(css.includes('max-height:none!important'));
  assert.ok(css.includes('.facebook-person-photo{width:72px!important;height:72px!important}'));
  assert.ok(css.includes('.facebook-person-photo{width:62px!important;height:62px!important}'));
  assert.ok(css.includes('.people-grid.people-discovery-grid>.facebook-person-card'));
});
test('Supabase sign-in without profile metadata preserves the saved public name and username', async () => {
  const server = await read('src/server.js');
  const start=server.indexOf('function ensureLocalUser(authUser, fallback = {})');
  const end=server.indexOf('function isAccountBanned(account)',start);
  assert.ok(start>=0&&end>start,'ensureLocalUser identity reconciliation exists');
  const ensure=server.slice(start,end);
  assert.ok(ensure.includes('let user = db.users.find'),'existing profile is found before metadata fallback');
  assert.ok(ensure.includes('fallback.name || user?.name'),'saved display name survives a sign-in response without metadata');
  assert.ok(ensure.includes('fallback.username || user?.username'),'saved username survives a sign-in response without metadata');
  assert.ok(ensure.includes('fallback.phoneNumber||user?.contactPhone'),'saved contact phone survives a sign-in response without metadata');
});

test('signed-in members can search for their own profile by name or username', async () => {
  const server = await read('src/server.js');
  const start=server.indexOf("if(method==='GET'&&p==='/api/search')");
  const end=server.indexOf("return json(res,404,{error:'API route not found.'})",start);
  assert.ok(start>=0&&end>start,'member search route exists');
  const route=server.slice(start,end);
  assert.ok(!route.includes('member.id!==user.id'),'search can include the current member profile');
  assert.ok(route.includes('canViewProfile(user.id,member)'),'self search still follows profile access checks');
});

test('search ranks an exact public username or display-name match before broader matches', async () => {
  const server = await read('src/server.js');
  const start=server.indexOf("if(method==='GET'&&p==='/api/search')");
  const end=server.indexOf("return json(res,404,{error:'API route not found.'})",start);
  assert.ok(start>=0&&end>start,'member search route exists');
  const route=server.slice(start,end);
  assert.ok(route.includes('canViewProfile(user.id,member)'),'search respects profile visibility');
  assert.ok(route.includes('member.username||'),'search includes public usernames');
  assert.ok(route.includes('score(second)-score(first)'),'exact identity matches rank before broad matches');
});

test('People You May Know does not hide discoverable member accounts behind a fixed 24-member cutoff', async () => {
  const server = await read('src/server.js');
  const start=server.indexOf("if(method==='GET'&&p==='/api/discovery/people')");
  const end=server.indexOf("const discoveryDismissalMatch=",start);
  assert.ok(start>=0&&end>start,'People You May Know route exists');
  const route=server.slice(start,end);
  assert.ok(route.includes('canViewProfile(user.id,member)'),'discovery respects profile visibility');
  assert.ok(!route.includes('.slice(0,24)'),'eligible member accounts are not silently cut off after 24');
});


test('People You May Know puts the name above the username and shows only the verification check beside the username', async () => {
  const [app, server, css] = await Promise.all([
    read('public/app.js'),
    read('src/server.js'),
    read('public/people-facebook-responsive.css')
  ]);
  const start = app.indexOf('function peopleCard(p){');
  const end = app.indexOf('function peopleGridMarkup(){', start);
  assert.ok(start >= 0 && end > start, 'People You May Know card renderer exists');
  const card = app.slice(start, end);
  const nameStart = card.indexOf('class="facebook-person-name"');
  const nameEnd = card.indexOf('</button>', nameStart);
  assert.ok(nameStart >= 0 && nameEnd > nameStart, 'display-name row exists');
  const nameRow = card.slice(nameStart, nameEnd);
  assert.match(nameRow, /esc\(p\.name\)/);
  assert.doesNotMatch(nameRow, /verifiedProfileBadge|gifterProfileBadge|profile-blue-verification/);
  assert.ok(card.includes('facebook-person-username'));
  assert.match(card, /esc\(p\.username\|\|''\)/);
  assert.match(card, /facebook-person-username[^\n]*verifiedProfileBadge\(p\)/);
  assert.doesNotMatch(card, /gifterProfileBadge\(p\)/);
  assert.match(app, /const verifiedProfileBadge = member => member\?\.verificationBadge==='blue'/);
  assert.match(app, /function syncPeopleDiscoveryVerification\(users,grid\)/);
  assert.match(app, /else if\(!verified&&existing\)\s*\{\s*existing\.remove\(\)/);
  assert.match(server, /p==='\/api\/discovery\/people\/verification'/);
  assert.match(server, /getProfileVerificationBadge\(member\)/);
  assert.match(server, /canViewProfile\(user\.id,member\)/);
  assert.match(css, /\.facebook-person-identity/);
  assert.match(css, /\.facebook-person-username-text/);
});
