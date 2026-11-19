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
const server = read('src/server.js');
const store = read('src/store.js');
const runtimeState = read('supabase/functions/minglora-runtime-state/index.ts');
const service = read('backend/modules/leagues/service.js');
const svg = read('public/assets/league/league-emblems.svg');

test('League Arena renders the six reference Power-Up cards and viewer Backpack', () => {
  assert.match(leagues, /id='league-powerup-panel'/);
  assert.match(leagues, /MINGLORA MATCH POWER-UP DECK/);
  assert.match(leagues, /My Power-Up Backpack/);
  assert.match(leagues, /powerupInventory/);
  assert.match(leagues, /league-backpack-card/);
  for (const id of ['boosting_glove','magic_mist','stun_hammer','time_maker','boosters','speed_challenge']) {
    assert.ok(leagues.includes(id), id + ' is present in League Arena');
  }
  assert.doesNotMatch(leagues, /activateSelectedPowerup/);
  assert.doesNotMatch(leagues, /powerupModelPaths|league-powerup-preview|model-viewer|ROTATABLE 3D PREVIEW|data-match-powerup-preview/);
});

test('LIVE shows creator-bound Backpack cards, score privacy and match-only effects', () => {
  assert.match(app, /data-inventory-card-id/);
  assert.match(app, /YOUR POWER-UP BACKPACK/);
  assert.match(app, /scoreVisibility/);
  assert.match(app, /live-match-card--stunned/);
  assert.match(app, /broadcastId=.*encodeURIComponent\(session\.id\)/);
  assert.match(app, /inventoryCardId:button\.dataset\.inventoryCardId/);
  assert.match(app, /const payload=\{broadcastId:session\.id/);
  assert.doesNotMatch(app, /data-powerup-id='shield'|data-powerup-id='score_multiplier'/);
});

test('all six original Minglora SVG Power-Up card symbols are available', () => {
  for (const id of ['powerup-glove','powerup-mist','powerup-hammer','powerup-time-maker','powerup-boosters','powerup-speed']) {
    assert.ok(svg.includes('id="' + id + '"'), id + ' SVG symbol exists');
    assert.ok(leagues.includes(id.replace('powerup-','powerup-')), id + ' is referenced by League UI');
  }
  assert.match(svg, /id="powerup-card-front"/);
  assert.match(svg, /id="powerup-card-edge"/);
});

test('legacy Match Power-Up GLTF assets remain intact but are not loaded by League UI', () => {
  for (const asset of ['minglora_momentum_boost.gltf','minglora_shield.gltf','minglora_time_boost.gltf','minglora_score_multiplier.gltf']) {
    const file = path.join(root, 'public/assets/match-powerups', asset);
    assert.ok(fs.existsSync(file), asset + ' remains available');
    assert.ok(!leagues.includes(asset), asset + ' is not loaded by League Arena');
    const model = JSON.parse(fs.readFileSync(file, 'utf8'));
    const binary = model.buffers[0];
    assert.equal(Buffer.from(binary.uri.split(',')[1], 'base64').byteLength, binary.byteLength);
    for (const view of model.bufferViews) {
      assert.ok(view.byteOffset + view.byteLength <= binary.byteLength, asset + ' buffer view is in range');
      assert.equal(view.byteOffset % 4, 0, asset + ' buffer view is aligned');
    }
    for (const accessor of model.accessors) assert.ok(model.bufferViews[accessor.bufferView], asset + ' accessor is valid');
    for (const mesh of model.meshes) for (const primitive of mesh.primitives) {
      assert.ok(model.accessors[primitive.attributes.POSITION], asset + ' has positions');
      assert.ok(model.accessors[primitive.attributes.NORMAL], asset + ' has normals');
      assert.ok(model.accessors[primitive.indices], asset + ' has triangle indices');
      assert.ok(model.materials[primitive.material], asset + ' has a material');
    }
  }
});

test('server enforces LIVE membership, creator-bound card activation and Magic Mist redaction context', () => {
  assert.match(server, /useCreatorLeaguePowerupCard/);
  assert.match(server, /Connect to the creator/);
  assert.match(server, /inventoryCardId/);
  assert.match(server, /viewerHostId:session\?\.hostId/);
  assert.match(server, /broadcastId,viewerHostId/);
  assert.match(service, /scoreVisibility/);
  assert.match(service, /decorated\.scores\[hiddenSide\] = null/);
  assert.match(service, /\["gift_score", "viewer_support"\]/);
});

test('viewer Backpack inventory is persisted through the existing durable store boundary', () => {
  assert.match(store, /creatorLeaguePowerupInventory/);
  assert.match(service, /creatorLeaguePowerupInventory/);
  assert.match(runtimeState, /creatorLeaguePowerupInventory/);
});

test('the HTML and service worker request the same versioned Match Power-Up assets', () => {
  const appAsset = html.match(/src="(\/app\.js\?v=[^"]+)"/)?.[1] || '';
  const leagueAsset = html.match(/src="(\/leagues\.js\?v=[^"]+)"/)?.[1] || '';
  const leagueCss = html.match(/href="(\/leagues\.css\?v=[^"]+)"/)?.[1] || '';
  assert.ok(appAsset && leagueAsset && leagueCss, 'HTML references app, League JS and League CSS');
  for (const asset of [appAsset, leagueAsset, leagueCss]) assert.ok(sw.includes("'" + asset + "'"), asset + ' is cached');
  assert.ok(sw.includes('/assets/league/league-emblems.svg?v=20261116-league-original-reference-assets-1'));
  assert.match(sw, /CACHE_NAME='minglora-shell-v362-self-updating-1'/);
});

test('Backpack and LIVE effects have responsive touch-safe and reduced-motion styles', () => {
  for (const selector of ['.league-powerup-backpack-grid','.league-backpack-card','.live-match-powerups','.live-match-effect--mist','.live-match-effect--hammer','.live-match-card--stunned']) {
    assert.ok(styles.includes(selector), selector + ' is styled');
  }
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(styles, /pointer-events:none/);
});
