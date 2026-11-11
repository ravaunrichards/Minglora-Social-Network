import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const artworkManifest = JSON.parse(fs.readFileSync(path.join(root, "assets/Artwork/manifest.json"), "utf8"));
const catalogue = JSON.parse(fs.readFileSync(path.join(root, "data/minglora-gift-catalog.json"), "utf8"));
const outputRoot = path.join(root, "public/assets/gifts/animations");
const outputManifestPath = path.join(outputRoot, "manifest.json");

execFileSync(process.execPath, [
  path.join(root, "scripts/generate-minglora-gift-animations.mjs")
], { cwd: root, stdio: "pipe" });

const output = JSON.parse(fs.readFileSync(outputManifestPath, "utf8"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

test("all original Artwork folders receive an individual animation without changing source PNGs", () => {
  assert.equal(artworkManifest.gifts.length, 1509);
  assert.equal(output.artwork_count, artworkManifest.gifts.length);
  assert.equal(output.source_capture_count, 131);
  assert.equal(output.catalogue_record_count, catalogue.gifts.length);

  for (const artwork of artworkManifest.gifts) {
    const row = output.artworks.find(item => item.slug === artwork.slug);
    assert.ok(row, "animation manifest retains Artwork folder " + artwork.slug);
    assert.ok(Array.isArray(row.animation_urls) && row.animation_urls.length > 0,
      "individual animation path exists for " + artwork.slug);

    const originalPath = path.join(root, "assets/Artwork", artwork.artwork);
    const original = fs.readFileSync(originalPath);
    assert.equal(sha256(original), artwork.sha256, "original artwork is unchanged: " + artwork.slug);

    for (const url of row.animation_urls) {
      assert.ok(url.startsWith("/assets/gifts/animations/"));
      const relative = url.slice("/assets/gifts/animations/".length);
      const svgPath = path.join(outputRoot, relative);
      assert.ok(fs.existsSync(svgPath), "generated animation exists: " + relative);
      const svg = fs.readFileSync(svgPath, "utf8");
      assert.ok(svg.includes("data:image/png;base64," + original.toString("base64")),
        "animation embeds the exact original artwork bytes: " + relative);
      assert.match(svg, /@keyframes giftMotion/);
      assert.match(svg, /prefers-reduced-motion:reduce/);
      assert.match(svg, /animation:none!important/);
      assert.doesNotMatch(svg, /<script\\b|\\bon[a-z]+\\s*=/i);
    }
  }

  assert.equal(output.artworks.length, 1509);
  assert.ok(output.exact_title_artwork_count >= 997,
    "all exact title matches reported by the read-only artwork audit are retained");
});

test("catalogue mapping preserves each existing gift name, Coin price and identity", () => {
  const mapping = output.gifts_by_code;
  const mappedCodes = Object.keys(mapping);
  assert.equal(mappedCodes.length, output.mapped_catalogue_record_count);
  assert.ok(mappedCodes.length > 800, "the exact-title catalogue matches are mapped");

  for (const gift of catalogue.gifts) {
    const record = mapping[gift.code];
    if (!record) continue;
    assert.equal(record.code, gift.code);
    assert.equal(record.name, gift.name);
    assert.equal(record.coin_price, gift.coin_price);
    assert.equal(record.active, gift.active === true);
    assert.equal(record.category, gift.category);
    assert.equal(record.emoji, gift.emoji);
    assert.equal(record.animation_key, gift.animation_key);
    assert.equal(record.animation_preset, gift.animation_preset);
    assert.equal(record.sound_preset, gift.sound_preset);
    assert.equal(record.animation_duration_ms, gift.animation_duration_ms);
    assert.equal(record.sort_order, gift.sort_order);

    assert.ok(record.artwork_url.startsWith("/assets/Artwork/"));
    assert.ok(record.animation_url.startsWith("/assets/gifts/animations/"));
    assert.ok(fs.existsSync(path.join(root, "public", record.animation_url.slice(1))));
    assert.ok(fs.existsSync(path.join(root, "assets", "Artwork", record.artwork_slug, "artwork.png")));
    assert.ok(Array.isArray(record.animation_variant_urls) && record.animation_variant_urls.length > 0);
  }
  assert.equal(output.unmatched_catalogue_record_count,
    catalogue.gifts.length - output.mapped_catalogue_record_count);
});

test("artwork variants stay separately animated and review-only artwork is not auto-approved", () => {
  const variants = output.artworks.filter(row => row.variant_of);
  assert.ok(variants.length >= 60, "same-title artwork variants remain individually represented");
  assert.equal(output.release_gate.human_visual_review, "NOT_COMPLETED");
  assert.equal(output.release_gate.artwork_rights_provenance, "NOT_CLEARED");
  assert.equal(output.release_gate.production_activation, "BLOCKED_PENDING_REVIEW_AND_RIGHTS_CLEARANCE");
});
