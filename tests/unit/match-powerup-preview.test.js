import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const leagues = read('public/leagues.js');
const app = read('public/app.js');
const styles = read('public/leagues.css');
const html = read('public/index.html');
const sw = read('public/sw.js');

test('Match Power-Ups retain selection and activation without a 3D preview', () => {
  assert.match(leagues, /id='league-powerup-panel'/);
  assert.match(leagues, /data-powerup-select/);
  assert.match(leagues, /data-match-powerup-select/);
  assert.match(leagues, /id='league-powerup-selected-title'/);
  assert.match(leagues, /id='league-powerup-availability'/);
  assert.match(leagues, /activateSelectedPowerup/);
  assert.doesNotMatch(leagues, /powerupModelPaths|league-powerup-preview|league-powerup-selected-model|model-viewer|ROTATABLE 3D PREVIEW|data-match-powerup-preview|View 3D preview/);
  assert.doesNotMatch(styles, /league-powerup-preview-stage|league-powerup-preview-layout|model-viewer/);
});

test('the original Match Power-Up GLTF files remain available but are not loaded by League UI', () => {
  for (const asset of ['minglora_momentum_boost.gltf','minglora_shield.gltf','minglora_time_boost.gltf','minglora_score_multiplier.gltf']) {
    const file = path.join(root, 'public/assets/match-powerups', asset);
    assert.ok(fs.existsSync(file), asset + ' remains available');
    assert.ok(!leagues.includes(asset), asset + ' is no longer referenced by League UI');
    const model = JSON.parse(fs.readFileSync(file, 'utf8'));
    const binary = model.buffers[0];
    assert.equal(Buffer.from(binary.uri.split(',')[1], 'base64').byteLength, binary.byteLength);
    for (const view of model.bufferViews) {
      assert.ok(view.byteOffset + view.byteLength <= binary.byteLength, asset + ' buffer view is in range');
      assert.equal(view.byteOffset % 4, 0, asset + ' buffer view is aligned');
    }
    for (const accessor of model.accessors) {
      assert.ok(model.bufferViews[accessor.bufferView], asset + ' accessor refers to a valid view');
    }
    for (const mesh of model.meshes) for (const primitive of mesh.primitives) {
      assert.ok(model.accessors[primitive.attributes.POSITION], asset + ' has positions');
      assert.ok(model.accessors[primitive.attributes.NORMAL], asset + ' has normals');
      assert.ok(model.accessors[primitive.indices], asset + ' has triangle indices');
      assert.ok(model.materials[primitive.material], asset + ' has a material');
    }
  }
});

test('six reference Match Power-Ups keep activation checks, usage limits and League scoring separated', () => {
  assert.match(leagues, /activateSelectedPowerup/);
  assert.match(leagues, /powerupRestriction/);
  assert.match(leagues, /usedToday/);
  for (const id of ['boosting_glove','magic_mist','stun_hammer','time_maker','boosters','speed_challenge']) {
    assert.ok(leagues.includes(id), id + ' is available in League Arena');
  }
  assert.match(leagues, /boosters/);
  assert.match(leagues, /time_maker/);
  assert.match(leagues, /speed_challenge/);
  assert.match(leagues, /never multiply Creator League points or official class standings/);
  for (const id of ['boosting_glove','magic_mist','stun_hammer','time_maker','boosters','speed_challenge']) {
    assert.ok(app.includes("data-powerup-id='" + id + "'"), id + ' is available in the LIVE match panel');
  }
  assert.match(app, /BOOSTING GLOVE/);
  assert.match(app, /BOOSTERS · NO\. 2 &amp; NO\. 3 GIFTERS/);
  assert.match(app, /STUN HAMMER ACTIVE/);
  assert.match(leagues, /data-match-powerup-select/);
  assert.match(leagues, /data-powerup-select/);
  assert.match(styles, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});

test('background League refresh updates power-up details and preserves active interactions', () => {
  assert.match(leagues, /const refreshZones = \[/);
  assert.match(leagues, /current\.replaceWith\(incoming\)/);
  assert.match(leagues, /focused && current\.contains\(focused\)/);
  assert.doesNotMatch(leagues, /main\.innerHTML = renderMarkup\(state\.overview, state\.sessions\)/);
  for (const zone of ['league-hero-zone','league-overview-zone','league-progression-zone','league-challenge-zone','league-powerup-panel','league-matches-zone','league-leaderboard-zone','league-events-zone']) {
    assert.ok(leagues.includes("id='" + zone + "'"), zone + ' is patchable without rebuilding the page');
  }
});

test('a full app refresh restores the signed-in member to the last page and scroll position', () => {
  assert.match(app, /LAST_VIEW_SESSION_PREFIX/);
  assert.match(app, /function persistCurrentView\(/);
  assert.match(app, /function readPersistedView\(/);
  assert.match(app, /async function restoreLastView\(/);
  assert.match(app, /else await restoreLastView\(\)/);
  assert.match(app, /scrollTo\(Number\(saved\.scrollX\)\|\|0,Number\(saved\.scrollY\)\|\|0\)/);
  assert.doesNotMatch(app, /else activateNav\('feed'\);/);
});

test('the scripts and styles use synchronized fresh browser cache URLs', () => {
  const appAsset = html.match(/src="(\/app\.js\?v=[^"]+)"/)?.[1]||'';
  const leagueAsset = html.match(/src="(\/leagues\.js\?v=[^"]+)"/)?.[1]||'';
  const leagueCss = html.match(/href="(\/leagues\.css\?v=[^"]+)"/)?.[1]||'';
  assert.ok(appAsset&&leagueAsset&&leagueCss, 'HTML requests the active app and League assets');
  assert.ok(sw.includes("'" + appAsset + "'"), 'service worker caches the app script');
  assert.ok(sw.includes("'" + leagueAsset + "'"), 'service worker caches the League script');
  assert.ok(sw.includes("'" + leagueCss + "'"), 'service worker caches the League stylesheet');
  assert.match(sw,/CACHE_NAME='minglora-shell-v\d+-/);
});

test('the service worker no longer preloads or specifically caches Match Power-Up GLTF previews', () => {
  assert.doesNotMatch(sw, /minglora_(?:momentum_boost|shield|time_boost|score_multiplier)\.gltf/);
  assert.doesNotMatch(sw, /url\.pathname\.startsWith\('\/assets\/match-powerups\/'\)/);
});

test('LIVE Match Power-Ups use supplied SVG artwork and disable used or exhausted activations', () => {
  assert.match(app, /const usedPowerupsToday=new Set\(Array\.isArray\(match\.usedPowerupsToday\)/);
  for (const [id, icon] of [
    ['boosting_glove','powerup-glove'],
    ['magic_mist','powerup-mist'],
    ['stun_hammer','powerup-hammer'],
    ['time_maker','powerup-time-maker'],
    ['boosters','powerup-boosters'],
    ['speed_challenge','powerup-speed']
  ]) {
    assert.ok(app.includes("id:'" + id + "'"), id + ' appears in the LIVE action panel');
    assert.ok(app.includes("icon:'" + icon + "'"), id + ' uses its original SVG artwork');
  }
  assert.match(app, /disabled\?' disabled':''/);
  assert.match(app, /'Used today'/);
  assert.match(app, /'3 uses reached'/);
  assert.match(app, /'Used this match'/);
  assert.ok(app.includes("TIME MAKER · +"));
  assert.match(styles, /\.live-match-powerup-icon/);
});
