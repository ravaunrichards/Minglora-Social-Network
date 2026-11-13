import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const assets = readJson("assets/gift-assets/manifests/asset-register.json");
const rights = readJson("assets/gift-assets/manifests/rights-register.json");

test("the gift asset register inventories real repository GLTF files with matching blob identities", () => {
  assert.equal(assets.asset_count, assets.assets.length);
  assert.ok(assets.assets.length > 0, "asset register must not be an empty placeholder");
  const ids = new Set();
  const paths = new Set();

  for (const asset of assets.assets) {
    assert.ok(asset.asset_id && !ids.has(asset.asset_id), "asset ID must be present and unique");
    assert.ok(asset.repository_path.startsWith("public/assets/gifts/"));
    assert.equal(asset.format, "gltf");
    assert.equal(asset.runtime_url, "/" + asset.repository_path.replace(/^public\//, ""));
    assert.match(asset.source_blob_sha, /^[a-f0-9]{40}$/);
    assert.ok(!paths.has(asset.repository_path), "asset path must be unique");

    const filePath = path.join(root, asset.repository_path);
    assert.ok(fs.existsSync(filePath), "missing inventoried asset: " + asset.repository_path);
    const bytes = fs.readFileSync(filePath);
    assert.equal(bytes.length, asset.file_size_bytes, "file size changed: " + asset.asset_id);
    const gitBlobSha = crypto.createHash("sha1")
      .update("blob " + bytes.length + "\0")
      .update(bytes)
      .digest("hex");
    assert.equal(gitBlobSha, asset.source_blob_sha, "Git blob identity changed: " + asset.asset_id);

    ids.add(asset.asset_id);
    paths.add(asset.repository_path);
  }
});

test("the rights register covers every inventoried model without falsely clearing any asset", () => {
  assert.equal(rights.asset_count, rights.assets.length);
  const records = new Map(rights.assets.map(asset => [asset.asset_id, asset]));
  assert.equal(records.size, assets.assets.length);

  for (const asset of assets.assets) {
    const record = records.get(asset.asset_id);
    assert.ok(record, "missing rights review record: " + asset.asset_id);
    assert.equal(record.repository_path, asset.repository_path);
    assert.equal(record.rights_status, "UNVERIFIED");
    assert.equal(record.commercial_use_permission, "UNVERIFIED");
    assert.equal(record.modification_permission, "UNVERIFIED");
    assert.equal(record.redistribution_permission, "UNVERIFIED");
    assert.equal(record.review_required, true);
    assert.equal(record.licence_name, null);
    assert.equal(record.source_evidence, null);
  }
});
