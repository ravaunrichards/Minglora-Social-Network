import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const migrationV1 = read("supabase/migrations/20261113172423_retire_legacy_cartoon_gifts.sql");
const migrationV2 = read("supabase/migrations/20261113173931_retire_remaining_cartoon_gifts_versions_1_and_2.sql");
const runtime = read("supabase/functions/minglora-runtime-state/index.ts");
const gifts = read("public/gifts.js");
const html = read("public/index.html");
const sw = read("public/sw.js");

test("legacy gifts are retired without deleting transaction history", () => {
  assert.match(migrationV1, /UPDATE[\s\S]*asset_version = '1'[\s\S]*EXISTS[\s\S]*live_gift_transactions/);
  assert.match(migrationV1, /DELETE[\s\S]*asset_version = '1'[\s\S]*NOT EXISTS[\s\S]*live_gift_transactions/);
  assert.match(migrationV2, /UPDATE[\s\S]*asset_version IN \('1', '2'\)[\s\S]*EXISTS[\s\S]*live_gift_transactions/);
  assert.match(migrationV2, /DELETE[\s\S]*asset_version IN \('1', '2'\)[\s\S]*NOT EXISTS[\s\S]*live_gift_transactions/);
});

test("all catalogue handlers and Gifts Center only expose the next approved 3D asset version", () => {
  const catalogueHandlers = runtime.split('if (action === "economy_catalog")').slice(1);
  assert.equal(catalogueHandlers.length, 2);
  for (const handler of catalogueHandlers) {
    assert.match(handler.slice(0, 1800), /\.eq\("active", true\)\s*\.eq\("asset_version", "3"\)/);
  }
  assert.match(gifts, /g\.asset_version==="3"&&g\.image_url&&g\.model_url/);
  assert.doesNotMatch(gifts, /gift-emoji-preview/);
  assert.doesNotMatch(gifts, /fallback\.textContent=g\?\.emoji/);
});

test("Gifts Center script cache is invalidated on reload", () => {
  const versionedPath = "/gifts.js?v=20261113-legacy-cartoon-gift-retirement-2";
  assert.ok(html.includes(versionedPath));
  assert.ok(sw.includes(versionedPath));
});
