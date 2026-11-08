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

test('People You May Know renders real member covers, stories, posts and verified LIVE sessions', async () => {
  const app = await read('public/app.js');
  assert.match(app, /person-cover-image/);
  assert.match(app, /person-avatar-wrap/);
  assert.match(app, /p\.recentPosts/);
  assert.match(app, /p\.latestStory/);
  assert.match(app, /viewerCountVerified===true/);
  assert.match(app, /data-watch-live/);
  assert.match(app, /data-open-profile-story/);
  assert.match(app, /\/discovery\/people/);
  assert.match(app, /No recent public activity/);
  assert.doesNotMatch(app, /Connect and get to know each other\./);
});

test('Friends discovery updates quietly in the background while the screen is visible', async () => {
  const app = await read('public/app.js');
  assert.match(app, /peopleDiscoveryRefreshTimer=window.setInterval\(\(\)=>void refreshPeopleDiscovery\(\{quiet:true\}\),30000\)/);
  assert.match(app, /state\.view!=='friends'/);
  assert.match(app, /document\.visibilityState!=='visible'/);
  assert.match(app, /focused&&grid\.contains\(focused\)/);
  assert.match(app, /api\('\/live\/sessions'\)/);
  assert.match(app, /openLiveRoom\(session,'viewer'\)/);
  assert.doesNotMatch(app, /id="people-discovery-refresh"/);
});
test('outside-profile cards provide dimensional responsive styling and respect reduced motion', async () => {
  const css = await read('public/styles.css');
  assert.match(css, /\.person-card--immersive/);
  assert.match(css, /box-shadow:0 20px 38px/);
  assert.match(css, /\.person-cover:after/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.theme-dark \.person-card--immersive/);
});

test('static shell cache includes the active discovery app assets', async () => {
  const html = await read('public/index.html');
  const worker = await read('public/sw.js');
  const assets=[
    html.match(/href="(\/styles\.css\?v=[^"]+)"/)?.[1],
    html.match(/src="(\/app\.js\?v=[^"]+)"/)?.[1]
  ].filter(Boolean);
  assert.ok(worker.includes("const CACHE_NAME='minglora-shell-v"),'service-worker cache is versioned');
  for(const asset of assets)assert.ok(worker.includes("'"+asset+"'"),'service worker caches '+asset);
});

test('outside profile cards preserve the full 3:1 saved cover and uncropped avatar',async()=>{
  const app=await read('public/app.js');
  const css=await read('public/styles.css');
  assert.ok(app.includes('person-cover-image'));
  assert.ok(css.includes('.person-card--immersive .person-cover{'));
  assert.ok(css.includes('aspect-ratio:3/1;padding:0!important'));
  assert.ok(css.includes('.person-cover-image{object-fit:contain!important'));
  assert.ok(css.includes('.person-avatar-wrap .avatar{object-fit:contain'));
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
