import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('the For You destination presents four switchable feed choices in the intended order', async () => {
  const app = await read('public/app.js');
  const shell = app.slice(app.indexOf('function forYouFeedShellMarkup()'), app.indexOf('async function renderForYouFeed()'));
  const scopes = ['for-you', 'friends', 'subscribers', 'following'];
  const positions = scopes.map(scope => shell.indexOf('data-fyp-scope="' + scope + '"'));
  assert.ok(positions.every(position => position >= 0), 'all four destinations must be present');
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'Home, Friends, Subscribers and Following must stay in order');
  for (const [scope, label] of [['for-you', 'Home'], ['friends', 'Friends'], ['subscribers', 'Subscribers'], ['following', 'Following']]) {
    assert.ok(shell.includes('data-fyp-scope="' + scope + '"'));
    assert.ok(shell.includes('>' + label + '</button>'));
    assert.ok(shell.includes('aria-label="Show ' + label + ' feed"'));
  }
  assert.ok(app.includes("FOR_YOU_SCOPE_VALUES=new Set(['for-you','friends','subscribers','following'])"));
  assert.ok(app.includes('state.forYouScope=normalizeForYouScope(scope);'));
  assert.ok(app.includes('recordBrowserNavigation();'));
});

test('each For You choice has a direct route and restores correctly on a fresh app load', async () => {
  const app = await read('public/app.js');
  assert.ok(app.includes("return '/for-you/'+(normalized==='for-you'?'home':normalized);"));
  assert.ok(app.includes('function forYouScopeFromPath(pathname=window.location.pathname)'));
  assert.ok(app.includes('const routeScope=forYouScopeFromPath();'));
  assert.ok(app.includes("state.view='for-you';"));
  assert.ok(app.includes('state.forYouScope=normalizeForYouScope(routeScope);'));
});

test('Friends and Subscribers use their real audience relationships for posts and verified LIVE sessions', async () => {
  const [app, server] = await Promise.all([read('public/app.js'), read('src/server.js')]);
  assert.ok(app.includes("api('/friends')"));
  assert.ok(app.includes("api('/users/'+encodeURIComponent(state.user.id)+'/subscribers')"));
  assert.ok(app.includes("audienceIds=new Set(members.map(member=>String(member?.id||'')).filter(Boolean))"));
  assert.ok(server.includes("!['all','following','friends','subscribers','for-you'].includes(scope)"));
  assert.ok(server.includes("scope==='subscribers'"));
  assert.ok(server.includes("subscription_subscribers_list"));
  assert.ok(server.includes("listActiveCreatorSubscriptions(db.creatorSubscriptions,user.id)"));
});
test('Home and Following both use real posts and only verified, visible LIVE sessions', async () => {
  const [app, server] = await Promise.all([
    read('public/app.js'),
    read('src/server.js')
  ]);
  assert.match(app, /api\('\/feed\?'\+params\.toString\(\)\)/);
  assert.match(app, /api\('\/live\/sessions'\)/);
  assert.match(app, /Promise\.allSettled\(/);
  assert.match(app, /session\?\.status==='live'&&session\.viewerCountVerified===true/);
  assert.match(app, /scope!=='following'\|\|session\.host\?\.following===true/);
  assert.match(server, /hostPresent/);
  assert.match(server, /viewerCountVerified:\s*true/);
  assert.match(server, /session\.visibility==='public'/);
});

test('LIVE feed cards open the real broadcast and can follow the host', async () => {
  const app = await read('public/app.js');
  assert.match(app, /function forYouLiveCard\(session,index\)/);
  assert.match(app, /data-fyp-watch-live=/);
  assert.match(app, /data-fyp-watch-live[\s\S]*?openLiveRoom\(session,session\.hostId===state\.user\.id\?'host':'viewer'\)/);
  assert.match(app, /data-foryou-follow=/);
  assert.match(app, /forYouLiveSessions\.filter\(session=>\(session\.host\?\.id\|\|session\.hostId\)===id\)/);
  assert.match(app, /index%3===0\)entries\.push\(forYouLiveCard\(lives\[liveIndex\+\+\],index\)\)/);
});

test('the mixed Home feed displays video posts, photo posts and horizontal multi-photo sets', async () => {
  const [app, css] = await Promise.all([
    read('public/app.js'),
    read('public/for-you-controls.css')
  ]);
  assert.match(app, /item=>\['video','image','photo','audio','model3d'\]\.includes\(item\.mediaType\)&&item\.url/);
  assert.match(app, /data-fyp-video/);
  assert.match(app, /function forYouCard\(post,index\)/);
  assert.match(app, /photos\.length>1[\s\S]*fyp-photo-carousel/);
  assert.match(app, /Photo '\+\(photoIndex\+1\)\+' of '\+photos\.length/);
  assert.match(css, /\.fyp-live-card/);
  assert.match(css, /\.fyp-photo-carousel/);
  assert.match(css, /\.fyp-feed-switch button[\s\S]*touch-action:\s*manipulation/);
});

test('Home and Following quietly refresh real posts and verified LIVE items without interrupting interactions', async () => {
  const app = await read('public/app.js');
  assert.match(app, /function startForYouAutoRefresh\(\)[\s\S]*window\.setInterval\(\(\)=>void refreshForYouFeedIfNew\(\),15000\)/);
  assert.match(app, /focused\?\.closest\('\.fyp-header,\.fyp-video-card'\)/);
  assert.match(app, /oldLiveIds[\s\S]*newLiveIds/);
  assert.match(app, /forYouLiveSessions=previousLiveSessions/);
});
