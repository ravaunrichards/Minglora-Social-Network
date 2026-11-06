import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const leagues = read('public/leagues.js');
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

test('the 3D model viewer is preserved across background match refreshes', () => {
  assert.match(leagues, /persistentPreview = \$\("#league-powerup-preview-panel"\)/);
  assert.match(leagues, /replacementPreview\.replaceWith\(persistentPreview\)/);
});

test('the service worker versions and caches the Match Power-Up 3D models', () => {
  assert.match(html, /leagues\.js\?v=20261106-match-powerups-3d-preview-1/);
  assert.match(html, /leagues\.css\?v=20261106-match-powerups-3d-preview-1/);
  assert.match(sw, /v100-match-powerups-3d-preview-1/);
  assert.match(sw, /minglora_time_boost\.gltf/);
  assert.ok(sw.includes("url.pathname.startsWith('/assets/match-powerups/')"));
});
