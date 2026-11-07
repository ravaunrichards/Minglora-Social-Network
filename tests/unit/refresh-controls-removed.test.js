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
const serviceWorker = read('public/sw.js');

test('Minglora refresh controls remain visible, connected and user initiated', () => {
  assert.match(app, /id="feed-refresh"/);
  assert.match(app, /id="people-discovery-refresh"/);
  assert.match(app, /id='live-directory-refresh'/);
  assert.match(meetWave, /id="mw-lobby-refresh"/);
  assert.match(meetWave, /refreshButton\.onclick=async\(\)=>\{/);
  assert.doesNotMatch(meetWave, /lobbyPoller=window\.setInterval/);
  assert.match(leagues, /id='league-refresh-button'/);
  assert.match(leagues, /refreshButton\.onclick = \(\) => \{ void refreshScores\(true\); \}/);
  assert.doesNotMatch(leagues, /refreshTimer\s*=\s*window\.setInterval/);
  assert.match(gifter, /id='gp-refresh-button'/);
  assert.match(gifter, /refreshButton\.onclick = \(\) => \{ void refreshOverview\(\); \}/);
  assert.doesNotMatch(gifter, /setInterval\s*\(/);
  assert.match(admin, /id="admin-gift-earnings-refresh"/);
  assert.match(admin, /earningsRefreshButton\.onclick = \(\) => \{ void loadAdminGiftEarnings\(panel\); \}/);
  assert.doesNotMatch(admin, /mingloraWithdrawalTimer|mingloraWithdrawalAutoRefresh/);
});

test('retry actions remain available for failed content loads', () => {
  assert.match(app, /id='live-gift-retry'/);
  assert.match(app, /id="gift-gallery-retry"/);
});

test('manual-refresh assets are versioned and cached consistently', () => {
  const manualAssets = [
    '/styles.css?v=20261106-pinch-zoom-photo-crop-1',
    '/meetwave.css?v=20261106-user-controlled-refresh-1',
    '/meetwave.js?v=20261106-user-controlled-refresh-1',
    '/leagues.js?v=20261106-user-controlled-refresh-1',
    '/gifter-progression.css?v=20261106-user-controlled-refresh-1',
    '/gifter-progression.js?v=20261106-user-controlled-refresh-1',
    '/app.js?v=20261106-pinch-zoom-photo-crop-1',
    '/admin-centre.js?v=20261106-user-controlled-refresh-1'
  ];
  for (const asset of manualAssets) {
    assert.ok(html.includes(asset), 'HTML requests ' + asset);
    assert.ok(serviceWorker.includes(asset), 'service worker caches ' + asset);
  }
  assert.match(serviceWorker, /minglora-shell-v113-pinch-zoom-photo-crop-1/);
});

test('service-worker registration stays non-forcing while using the refreshed worker URL', () => {
  assert.equal(
    (app.match(/navigator\.serviceWorker\.register\('\/sw\.js\?v=20261106-user-controlled-refresh-1/g) || []).length,
    2,
    'both service-worker registrations use the user-controlled refresh version'
  );
  assert.match(app, /updateViaCache:'none'/);
  assert.doesNotMatch(app, /await registration\.update\(\)/);
  assert.doesNotMatch(serviceWorker, /self\.skipWaiting\(\)|self\.clients\.claim\(\)/);
});
