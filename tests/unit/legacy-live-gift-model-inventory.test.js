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
