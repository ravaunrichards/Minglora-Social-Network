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
    assert.equal(asset.catalogue_mapping_status, 'historical_identity_mapped');
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


test('legacy GLTF technical profiles match the actual source documents', () => {
  const summary = manifest.technical_audit_summary;
  assert.equal(summary.audited_model_count, 45);
  assert.equal(summary.gltf_version, '2.0');
  assert.equal(summary.models_with_mesh_geometry, 45);
  assert.equal(summary.texture_files, 0);
  assert.equal(summary.image_files, 0);
  assert.equal(summary.embedded_animation_channels, 0);
  assert.equal(summary.buffers_per_model, 1);
  assert.equal(summary.models_with_position_accessor_bounds, 38);
  assert.equal(summary.models_without_position_accessor_bounds, 7);
  assert.equal(summary.world_space_dimensions_verified, 0);

  const totals = { mesh_count: 0, node_count: 0, material_count: 0, buffer_bytes: 0 };
  for (const asset of manifest.assets) {
    const doc = JSON.parse(fs.readFileSync(path.join(root, asset.repository_path), 'utf8'));
    const profile = asset.technical_profile;
    assert.ok(profile, asset.file_name + ' must have a technical profile');
    assert.equal(doc.asset?.version, profile.gltf_version);
    assert.equal(doc.meshes?.length || 0, profile.mesh_count);
    assert.equal(doc.nodes?.length || 0, profile.node_count);
    assert.equal(doc.materials?.length || 0, profile.material_count);
    assert.equal(doc.textures?.length || 0, profile.texture_count);
    assert.equal(doc.images?.length || 0, profile.image_count);
    assert.equal(doc.animations?.length || 0, profile.embedded_animation_count);
    assert.equal(doc.buffers?.length || 0, profile.buffer_count);
    assert.equal((doc.buffers || []).reduce((sum, buffer) => sum + Number(buffer.byteLength || 0), 0), profile.buffer_bytes);

    let boundedPositionAccessors = 0;
    const localMin = [Infinity, Infinity, Infinity];
    const localMax = [-Infinity, -Infinity, -Infinity];
    for (const mesh of doc.meshes || []) {
      for (const primitive of mesh.primitives || []) {
        const index = primitive.attributes?.POSITION;
        const accessor = doc.accessors?.[index];
        if (!Array.isArray(accessor?.min) || !Array.isArray(accessor?.max)) continue;
        boundedPositionAccessors += 1;
        for (let axis = 0; axis < 3; axis += 1) {
          localMin[axis] = Math.min(localMin[axis], Number(accessor.min[axis]));
          localMax[axis] = Math.max(localMax[axis], Number(accessor.max[axis]));
        }
      }
    }
    assert.equal(boundedPositionAccessors, profile.position_accessors_with_bounds, asset.file_name + ' position-bound count must match');
    if (boundedPositionAccessors > 0) {
      assert.deepEqual(profile.accessor_local_bounds.min, localMin);
      assert.deepEqual(profile.accessor_local_bounds.max, localMax);
    } else {
      assert.equal(profile.accessor_local_bounds, null);
    }
    assert.equal(profile.world_space_dimensions, null, 'world-space dimensions must not be guessed');
    totals.mesh_count += profile.mesh_count;
    totals.node_count += profile.node_count;
    totals.material_count += profile.material_count;
    totals.buffer_bytes += profile.buffer_bytes;
  }
  assert.deepEqual(totals, {
    mesh_count: summary.total_meshes,
    node_count: summary.total_nodes,
    material_count: summary.total_materials,
    buffer_bytes: summary.total_buffer_bytes
  });
});
