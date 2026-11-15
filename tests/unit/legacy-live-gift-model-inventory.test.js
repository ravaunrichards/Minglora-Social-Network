import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, 'assets/manifests/legacy-live-gift-models.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function gitBlobSha1(bytes) {
  const header = Buffer.from('blob ' + bytes.length + '\0');
  return crypto.createHash('sha1').update(Buffer.concat([header, bytes])).digest('hex');
}

test('legacy LIVE gift-model inventory is explicit and not production-approved', () => {
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.asset_count, manifest.assets.length);
  assert.equal(manifest.assets.length, 45);
  assert.equal(manifest.publication_policy.production_eligible, false);
  assert.equal(manifest.publication_policy.catalogue_mapping_status, 'unverified');
  assert.equal(manifest.publication_policy.visual_review_status, 'pending');
  assert.equal(manifest.publication_policy.technical_render_review_status, 'pending');
  assert.equal(manifest.publication_policy.rights_review_status, 'pending');
  assert.match(manifest.hash_algorithm, /Git blob SHA-1/);

  const ids = new Set();
  const paths = new Set();
  for (const asset of manifest.assets) {
    assert.ok(asset.id && !ids.has(asset.id), 'asset IDs must be present and unique');
    assert.ok(asset.repository_path && !paths.has(asset.repository_path), 'repository paths must be present and unique');
    ids.add(asset.id);
    paths.add(asset.repository_path);
    assert.equal(asset.format, 'glTF 2.0 JSON');
    assert.equal(asset.production_eligible, false);
    assert.equal(asset.catalogue_mapping_status, 'unverified');
    assert.equal(asset.visual_review_status, 'pending');
    assert.equal(asset.technical_render_review_status, 'pending');
    assert.equal(asset.rights_review_status, 'pending');
  }
});

test('every legacy model exists with its recorded size and Git object hash', () => {
  for (const asset of manifest.assets) {
    const filePath = path.join(root, asset.repository_path);
    assert.ok(fs.existsSync(filePath), asset.file_name + ' must exist');
    const bytes = fs.readFileSync(filePath);
    assert.equal(bytes.length, asset.bytes, asset.file_name + ' byte size must match the inventory');
    assert.equal(gitBlobSha1(bytes), asset.git_blob_sha1, asset.file_name + ' Git blob SHA-1 must match the inventory');
  }
});

test('every legacy model parses as a GLTF 2.0 document with renderable scene geometry', () => {
  for (const asset of manifest.assets) {
    const filePath = path.join(root, asset.repository_path);
    const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(document.asset?.version, '2.0', asset.file_name + ' must declare glTF 2.0');
    assert.ok(Array.isArray(document.scenes) && document.scenes.length > 0, asset.file_name + ' must define a scene');
    assert.ok(Array.isArray(document.nodes) && document.nodes.length > 0, asset.file_name + ' must define scene nodes');
    assert.ok(Array.isArray(document.meshes) && document.meshes.length > 0, asset.file_name + ' must define mesh geometry');
    assert.ok(Array.isArray(document.buffers) && document.buffers.length > 0, asset.file_name + ' must define geometry buffers');
    for (const buffer of document.buffers) {
      assert.ok(Number.isInteger(buffer.byteLength) && buffer.byteLength > 0, asset.file_name + ' buffers must declare a positive byteLength');
      if (typeof buffer.uri === 'string' && buffer.uri.startsWith('data:')) {
        const encoded = buffer.uri.slice(buffer.uri.indexOf(',') + 1);
        const decoded = Buffer.from(encoded, 'base64');
        assert.equal(decoded.length, buffer.byteLength, asset.file_name + ' embedded buffer length must match its declaration');
      }
    }
  }
});


test('legacy model files map to unique historical gift identities without implying production activation', () => {
  const provenance = manifest.catalogue_identity_provenance;
  assert.equal(provenance.identity_mapping_count, 45);
  assert.equal(provenance.gift_insert_metadata_count, 38);
  assert.equal(provenance.existing_model_url_case_mapping_count, 7);
  assert.equal(provenance.matching_codes_in_public_live_gift_catalog, 0);
  assert.equal(provenance.production_database_query_date, '2026-11-15');

  const codes = new Set();
  for (const asset of manifest.assets) {
    const identity = asset.historical_catalogue;
    assert.ok(identity?.code, asset.file_name + ' must have a historical catalogue code');
    assert.ok(!codes.has(identity.code), identity.code + ' must map to only one legacy model');
    codes.add(identity.code);
    assert.equal(asset.catalogue_mapping_status, 'historical_identity_mapped');
    assert.equal(asset.current_production_catalogue_status, 'absent_in_2026-11-15_database_snapshot');
    assert.equal(asset.production_eligible, false);

    const migrationPath = path.join(root, identity.source_migration);
    assert.ok(fs.existsSync(migrationPath), identity.source_migration + ' must exist');
    const migration = fs.readFileSync(migrationPath, 'utf8');
    const modelPath = '/assets/gifts/' + asset.file_name;

    if (identity.mapping_basis === 'model_url_case') {
      assert.equal(identity.historical_seed, null);
      assert.ok(migration.includes("WHEN '" + identity.code + "' THEN '" + modelPath + "'"),
        asset.file_name + ' must match its exact historical model_url CASE mapping');
    } else {
      assert.equal(identity.mapping_basis, 'gift_insert');
      const seed = identity.historical_seed;
      assert.ok(seed && seed.name && seed.category);
      assert.equal(seed.active_at_migration, true);
      assert.ok(Number.isInteger(seed.coin_price) && seed.coin_price > 0);
      assert.ok(migration.includes("'" + identity.code + "','" + seed.name + "','" + seed.category + "'"),
        asset.file_name + ' must match its historical gift INSERT identity');
      assert.ok(migration.includes("'" + modelPath + "'"),
        asset.file_name + ' must be referenced by its historical migration');
    }
  }
});
