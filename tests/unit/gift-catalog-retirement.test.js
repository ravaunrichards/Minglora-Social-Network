import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20261113172423_retire_legacy_cartoon_gifts.sql");
const runtime = read("supabase/functions/minglora-runtime-state/index.ts");
const gifts = read("public/gifts.js");
const html = read("public/index.html");
const sw = read("public/sw.js");

test("legacy gifts are retired without deleting transaction history", () => {
  assert.match(migration, /UPDATE[\s\S]*asset_version = '1'[\s\S]*EXISTS[\s\S]*live_gift_transactions/);
  assert.match(migration, /DELETE[\s\S]*asset_version = '1'[\s\S]*NOT EXISTS[\s\S]*live_gift_transactions/);
});

test("catalogue API and Gifts Center only expose approved version-2 3D assets", () => {
  assert.match(runtime, /\.eq\("active", true\)\s*\.eq\("asset_version", "2"\)/);
  assert.match(gifts, /g\.asset_version==="2"&&g\.image_url&&g\.model_url/);
  assert.doesNotMatch(gifts, /gift-emoji-preview/);
  assert.doesNotMatch(gifts, /fallback\.textContent=g\?\.emoji/);
});

test("Gifts Center script cache is invalidated on reload", () => {
  const versionedPath = "/gifts.js?v=20261113-legacy-cartoon-gift-retirement-1";
  assert.ok(html.includes(versionedPath));
  assert.ok(sw.includes(versionedPath));
});
