import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = JSON.parse(fs.readFileSync(path.join(root, "data/minglora-gift-catalog.json"), "utf8"));
const outputPath = path.join(root, "public/assets/animations/gifts/catalog-motion-index.json");
const generatorPath = path.join(root, "scripts/generate-live-gift-motion-index.mjs");

if (!fs.existsSync(outputPath)) {
  execFileSync(process.execPath, [generatorPath], { stdio: "inherit" });
}
execFileSync(process.execPath, [generatorPath, "--check"], { stdio: "inherit" });
const index = JSON.parse(fs.readFileSync(outputPath, "utf8"));

test("LIVE motion index covers every active catalogue gift and excludes retired records", () => {
  const active = source.gifts.filter(gift => gift.active === true);
  assert.equal(index.catalogue_count, source.gifts.length);
  assert.equal(index.active_gift_count, active.length);
  assert.equal(index.gifts.length, active.length);
  assert.ok(index.gifts.every(gift => gift.active === true));
  assert.equal(index.gifts.some(gift => source.gifts.find(row => row.code === gift.code)?.active === false), false);
});

test("each LIVE motion entry resolves the exact unique artwork, model, animation and sound record", () => {
  const sourceByCode = new Map(source.gifts.map(gift => [gift.code, gift]));
  const codes = new Set();
  for (const entry of index.gifts) {
    const gift = sourceByCode.get(entry.code);
    assert.ok(gift && gift.active === true, entry.code);
    assert.ok(!codes.has(entry.code), "duplicate motion record " + entry.code);
    codes.add(entry.code);
    assert.equal(entry.image_url, gift.image_url);
    assert.equal(entry.model_url, gift.model_url);
    assert.equal(entry.animation_key, gift.animation_key);
    assert.equal(entry.motion_preset, gift.animation_preset);
    assert.equal(entry.motion_duration_ms, gift.animation_duration_ms);
    assert.equal(entry.sound_preset, gift.sound_preset);
    assert.match(entry.image_url, /^\/assets\/gifts\/catalog\/[a-z0-9_-]+\.svg$/);
    assert.match(entry.model_url, /^\/assets\/gifts\/catalog\/[a-z0-9_-]+\.gltf$/);
    assert.ok(["petals", "waves", "rings", "trail", "orbits", "bubbles", "sparkles"].includes(entry.motion_effect));
  }
  assert.equal(codes.size, source.gifts.filter(gift => gift.active === true).length);
});

test("runtime and service worker use the generated index at the same canonical path", () => {
  const runtime = fs.readFileSync(path.join(root, "public/gift-effects.js"), "utf8");
  const worker = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  assert.ok(runtime.includes("/assets/animations/gifts/catalog-motion-index.json"));
  assert.ok(runtime.includes('catalogMotionIndex.get(String(gift.code||""))'));
  assert.ok(worker.includes("'/assets/animations/gifts/catalog-motion-index.json'"));
  assert.ok(html.includes("/gift-effects.js?v="));
});
