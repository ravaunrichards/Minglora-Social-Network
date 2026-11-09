import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('public/app.js');
const meetWave = read('public/meetwave.js');
const leagues = read('public/leagues.js');
const gifter = read('public/gifter-progression.js');
const quickCurrency = read('public/quick-currency.js');
const fullCurrency = read('public/currency-converter.js');
const admin = read('public/admin-centre.js');
const html = read('public/index.html');
const adminHtml = read('public/admin-centre.html');
const serviceWorker = read('public/sw.js');

test('Minglora screens do not expose manual Refresh buttons', () => {
  assert.doesNotMatch(app, /id=['"](?:feed-refresh|people-discovery-refresh|live-directory-refresh)['"]/);
  assert.doesNotMatch(meetWave, /id=['"]mw-lobby-refresh['"]/);
  assert.doesNotMatch(leagues, /id=['"]league-refresh-button['"]/);
  assert.doesNotMatch(gifter, /id=['"]gp-refresh-button['"]/);
  assert.doesNotMatch(admin, /id=['"]admin-gift-earnings-refresh['"]/);
});

test('Recharge currency tools do not expose manual refresh buttons', () => {
  assert.doesNotMatch(quickCurrency, /data-qcc-refresh|aria-label="Refresh exchange rate"|title="Refresh rate"|↻ Refresh/);
  assert.doesNotMatch(fullCurrency, /data-mcc-refresh|aria-label="Refresh exchange rate"|title="Refresh exchange rate"/);
});

test('Feed, Friends and LIVE quietly sync in the background without replacing active interactions', () => {
  assert.match(app, /feedAutoSyncTimer=window\.setInterval\(\(\)=>void syncFeedAutomatically\(\),30000\)/);
  assert.match(app, /peopleDiscoveryRefreshTimer=window\.setInterval\(\(\)=>void refreshPeopleDiscovery\(\{quiet:true\}\),30000\)/);
  assert.match(app, /liveDirectoryRefreshTimer=window\.setInterval\(\(\)=>void refreshLiveDirectorySessions\(\{quiet:true\}\),15000\)/);
  assert.match(app, /focused&&list\.contains\(focused\)/);
  assert.match(app, /focused&&grid\.contains\(focused\)/);
  assert.match(app, /document\.visibilityState!=='visible'/);
});

test('MeetWave lobby syncs automatically but never refreshes an active meeting page', () => {
  assert.match(meetWave, /lobbyPoller=window\.setInterval\(\(\)=>\{/);
  assert.match(meetWave, /refreshLobby\(\{quiet:true\}\)/);
  assert.match(meetWave, /state\.view==='meetwave'&&!activeRoom/);
  assert.doesNotMatch(meetWave, /id=['"]mw-lobby-refresh['"]/);
});

test('League and Gifter progression use non-disruptive automatic data updates', () => {
  assert.match(leagues, /autoSyncTimer = window\.setInterval\(\(\) => void refreshScores\(\), 20000\)/);
  assert.match(leagues, /if \(focused && current\.contains\(focused\)\) continue/);
  assert.match(gifter, /autoSyncTimer = window\.setInterval\(\(\) => void refreshOverview\(\), 30000\)/);
  assert.match(gifter, /if \(focused && main\.contains\(focused\)\) return/);
  assert.doesNotMatch(leagues, /id=['"]league-refresh-button['"]/);
  assert.doesNotMatch(gifter, /id=['"]gp-refresh-button['"]/);
});

test('Admin earnings and withdrawal records update automatically without a manual refresh button', () => {
  assert.match(admin, /panel\._mingloraCreatorEarningsTimer = window\.setInterval/);
  assert.match(admin, /loadAdminGiftEarnings\(panel, \{ quiet:true \}\)/);
  assert.match(admin, /\}, 30000\)/);
  assert.doesNotMatch(admin, /id=['"]admin-gift-earnings-refresh['"]/);
});

test('retry actions remain available for failed content loads', () => {
  assert.match(app, /id='live-gift-retry'/);
  assert.match(app, /id="gift-gallery-retry"/);
});

test('automatic-update assets are versioned consistently in HTML and the service-worker shell', () => {
  const paths=['/styles.css','/meetwave.css','/meetwave.js','/leagues.js','/gifter-progression.css','/gifter-progression.js','/app.js','/admin-centre.js'];
  for(const path of paths){
    const attribute=path.endsWith('.css')?'href':'src';
    const asset=[...html.matchAll(new RegExp(attribute+'="([^"]+)"','g'))].map(match=>match[1]).find(value=>value.startsWith(path+'?v='))||'';
    assert.ok(asset,'HTML declares '+path);
    assert.ok(serviceWorker.includes("'"+asset+"'"),'service worker caches '+asset);
  }
  const adminAsset=adminHtml.match(/src="(\/admin-centre\.js\?v=[^"]+)"/)?.[1]||'';
  assert.ok(adminAsset&&serviceWorker.includes("'"+adminAsset+"'"));
  assert.match(serviceWorker,/CACHE_NAME='minglora-shell-v\d+-/);
});

test('service-worker updates preserve the current session and never force a page takeover', () => {
  assert.equal((app.match(/navigator\.serviceWorker\.register\('\/sw\.js\?v=/g)||[]).length,1);
  assert.match(app,/updateViaCache:'none'/);
  assert.match(app,/void prepareMingloraServiceWorker\(\)/);
  assert.match(serviceWorker,/cacheCurrentShellAssets/);
  assert.match(serviceWorker,/self\.clients\.claim\(\)/);
  assert.doesNotMatch(serviceWorker,/self\.skipWaiting\(\)|MINGLORA_ACTIVATE_WHEN_SAFE/);
  assert.match(serviceWorker,/CACHE_NAME='minglora-shell-v\d+-[a-z0-9-]+'/);
});
});
