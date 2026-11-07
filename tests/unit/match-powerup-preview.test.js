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

test('Match Power-Ups have an in-page rotatable 3D preview', () => {
  assert.match(leagues, /id='league-powerup-preview-panel'/);
  assert.match(leagues, /id='league-powerup-selected-model'[^>]*camera-controls auto-rotate/);
  assert.match(leagues, /ROTATABLE 3D PREVIEW/);
  assert.match(leagues, /Drag to rotate and pinch or scroll to zoom/);
  assert.match(styles, /\.league-powerup-preview-stage model-viewer/);
});

test('all four Match Power-Ups have valid separate embedded 3D GLTF models', () => {
  for (const asset of ['minglora_momentum_boost.gltf','minglora_shield.gltf','minglora_time_boost.gltf','minglora_score_multiplier.gltf']) {
    const file = path.join(root, 'public/assets/match-powerups', asset);
    assert.ok(fs.existsSync(file), asset + ' exists');
    assert.ok(leagues.includes(asset));
    const model = JSON.parse(fs.readFileSync(file, 'utf8'));
    const binary = model.buffers[0];
    assert.equal(Buffer.from(binary.uri.split(',')[1], 'base64').byteLength, binary.byteLength);
    for (const view of model.bufferViews) {
      assert.ok(view.byteOffset + view.byteLength <= binary.byteLength, asset + ' buffer view is in range');
      assert.equal(view.byteOffset % 4, 0, asset + ' buffer view is aligned');
    }
    for (const accessor of model.accessors) {
      assert.ok(model.bufferViews[accessor.bufferView], asset + ' accessor refers to a buffer view');
    }
    for (const mesh of model.meshes) for (const primitive of mesh.primitives) {
      assert.ok(model.accessors[primitive.attributes.POSITION], asset + ' has positions');
      assert.ok(model.accessors[primitive.attributes.NORMAL], asset + ' has normals');
      assert.ok(model.accessors[primitive.indices], asset + ' has triangle indices');
      assert.ok(model.materials[primitive.material], asset + ' has a material');
    }
  }
});

test('preview is separate from live-match activation and preserves existing restrictions', () => {
  assert.match(leagues, /data-match-powerup-preview/);
  assert.match(leagues, /data-powerup-select/);
  assert.match(leagues, /activateSelectedPowerup/);
  assert.match(leagues, /powerupRestriction/);
  assert.match(leagues, /usedToday/);
  assert.match(leagues, /timerMode === "fixed"/);
  assert.match(leagues, /never multiply Creator League points or official class standings/);
});

test('background League refresh updates only live-data sections and preserves active interactions', () => {
  assert.match(leagues, /const refreshZones = \[/);
  assert.match(leagues, /current\.replaceWith\(incoming\)/);
  assert.match(leagues, /focused && current\.contains\(focused\)/);
  assert.doesNotMatch(leagues, /main\.innerHTML = renderMarkup\(state\.overview, state\.sessions\)/);
  for (const zone of ['league-hero-zone','league-overview-zone','league-progression-zone','league-challenge-zone','league-matches-zone','league-leaderboard-zone','league-events-zone']) {
    assert.ok(leagues.includes("id='" + zone + "'"), zone + ' is patchable without rebuilding the page');
  }
  assert.ok(leagues.includes("id='league-powerup-preview-panel'"), 'the live 3D preview stays outside the refreshed zones');
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

test('the page restore and non-disruptive refresh scripts receive a fresh browser cache version', () => {
  const appAsset = html.match(/app\.js\?v=[^\"' ]+/)?.[0];
  assert.ok(appAsset, 'HTML requests a versioned app script');
  assert.match(html, /leagues\.js\?v=20261106-league-auto-update-1/);
  assert.match(sw, /v102-preserve-active-page-refresh-2/);
  assert.ok(sw.includes(appAsset), 'service worker caches the same app script URL');
  assert.match(sw, /leagues\.js\?v=20261106-league-auto-update-1/);
});

test('the service worker versions and caches the Match Power-Up 3D models', () => {
  assert.match(html, /leagues\.js\?v=20261106-league-auto-update-1/);
  assert.match(html, /leagues\.css\?v=20261106-match-powerups-3d-preview-1/);
  assert.match(sw, /v100-match-powerups-3d-preview-1/);
  assert.match(sw, /minglora_time_boost\.gltf/);
  assert.ok(sw.includes("url.pathname.startsWith('/assets/match-powerups/')"));
});
