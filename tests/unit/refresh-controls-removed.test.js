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
  const assets = [
    '/styles.css?v=20261107-top-gifters-1',
    '/meetwave.css?v=20261107-auto-sync-no-refresh-1',
    '/meetwave.js?v=20261107-top-gifters-profile-controls-functional-1',
    '/leagues.js?v=20261107-top-gifters-profile-controls-functional-1',
    '/gifter-progression.css?v=20261107-auto-sync-no-refresh-1',
    '/gifter-progression.js?v=20261107-top-gifters-profile-controls-functional-1',
    '/app.js?v=20261107-top-gifters-profile-controls-functional-1',
    '/admin-centre.js?v=20261107-top-gifters-profile-controls-functional-1'
  ];
  for (const asset of assets) {
    assert.ok(html.includes(asset), 'Minglora HTML requests ' + asset);
    assert.ok(serviceWorker.includes(asset), 'service worker caches ' + asset);
  }
  assert.match(adminHtml, /admin-centre\.js\?v=20261107-top-gifters-profile-controls-functional-1/);
  assert.match(serviceWorker, /minglora-shell-v131-live-top-gifters-1/);
});

test('service-worker registration does not force an active page reload', () => {
  assert.equal(
    (app.match(/navigator\.serviceWorker\.register\('\/sw\.js\?v=20261107-auto-sync-no-refresh-1/g) || []).length,
    2
  );
  assert.match(app, /updateViaCache:'none'/);
  assert.doesNotMatch(app, /await registration\.update\(\)/);
  assert.doesNotMatch(serviceWorker, /self\.skipWaiting\(\)|self\.clients\.claim\(\)/);
});
