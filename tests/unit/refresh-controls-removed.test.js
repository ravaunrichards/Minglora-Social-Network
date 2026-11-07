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
const settings = read('public/settings.js');
const admin = read('public/admin-centre.js');
const html = read('public/index.html');
const serviceWorker = read('public/sw.js');

test('Minglora refresh controls stay connected and only run on user action', () => {
  assert.doesNotMatch(app, /id=['"](?:refresh-live|live-pro-history-refresh|creator-refresh-audience|creator-refresh-analytics)['"]/);
  assert.doesNotMatch(meetWave, /id=['"]mw-refresh['"]/);
  assert.doesNotMatch(leagues, /data-league-refresh/);
  assert.doesNotMatch(settings, /id=['"](?:settings-refresh-activity|refresh-moderation|refresh-support-inbox)['"]/);
  assert.match(meetWave, /id="mw-lobby-refresh"/);
  assert.match(meetWave, /refreshButton\.onclick=async\(\)=>\{/);
  assert.match(leagues, /id='league-refresh-button'/);
  assert.match(leagues, /refreshButton\.onclick = \(\) => \{ void refreshScores\(true\); \}/);
  assert.match(admin, /id="admin-gift-earnings-refresh"/);
  assert.match(admin, /earningsRefreshButton\.onclick = \(\) => \{ void loadAdminGiftEarnings\(panel\); \}/);
});

test('MeetWave lobby refresh is manual and League refresh is connected to real data', () => {
  assert.match(meetWave, /lobbyPoller=window\.setInterval\(\(\)=>\{/);
  assert.match(meetWave, /\},15000\);/);
  assert.match(leagues, /refreshButton\.onclick = \(\) => \{ void refreshScores\(true\); \}/);
});

test('real retry actions remain available for failed content loads', () => {
  assert.match(app, /id='live-gift-retry'/);
  assert.match(app, /id="gift-gallery-retry"/);
});

test('the app shell and service worker request the cleaned screen assets', () => {
  const appAsset = html.match(/<script src="(\/app\.js\?v=[^"]+)"/)?.[1];
  assert.ok(appAsset, 'HTML requests a versioned app.js');
  assert.ok(serviceWorker.includes(appAsset), 'service worker caches the same app.js URL');
  for (const asset of [
    '/leagues.js?v=20261106-user-controlled-refresh-1',
    '/settings.js?v=20261106-refresh-controls-removed-1',
    '/admin-centre.js?v=20261106-user-controlled-refresh-1',
    '/meetwave.js?v=20261106-user-controlled-refresh-1',\n    '/app.js?v=20261106-user-controlled-refresh-1',\n    '/gifter-progression.js?v=20261106-user-controlled-refresh-1',\n    '/meetwave.css?v=20261106-user-controlled-refresh-1',\n    '/gifter-progression.css?v=20261106-user-controlled-refresh-1'
  ]) {
    assert.ok(html.includes(asset), 'HTML requests ' + asset);
    assert.ok(serviceWorker.includes(asset), 'service worker caches ' + asset);
  }
  assert.match(serviceWorker, /v112-user-controlled-refresh-1/);
  assert.equal(
    (app.match(/navigator\.serviceWorker\.register\('\/sw\.js\?v=20261106-refresh-controls-removed-1/g) || []).length,
    2,
    'both service-worker registrations use the updated version'
  );
});
