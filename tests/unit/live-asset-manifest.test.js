import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputPath = path.join(root, "assets/manifests/live-asset-manifest.json");
const generatorPath = path.join(root, "scripts/generate-minglora-live-asset-manifest.mjs");
const giftsGeneratorPath = path.join(root, "scripts/generate-minglora-gifts.mjs");
const motionGeneratorPath = path.join(root, "scripts/generate-live-gift-motion-index.mjs");
const cataloguePath = path.join(root, "data/minglora-gift-catalog.json");
const motionPath = path.join(root, "public/assets/animations/gifts/catalog-motion-index.json");
const iconPath = path.join(root, "public/assets/icons/navigation-3d.svg");

if (!fs.existsSync(path.join(root, "public/assets/gifts/catalog"))) {
  execFileSync(process.execPath, [giftsGeneratorPath], { stdio: "inherit" });
}
if (!fs.existsSync(motionPath)) {
  execFileSync(process.execPath, [motionGeneratorPath], { stdio: "inherit" });
}
if (!fs.existsSync(outputPath)) execFileSync(process.execPath, [generatorPath], { stdio: "inherit" });
execFileSync(process.execPath, [generatorPath, "--check"], { stdio: "inherit" });

const catalogue = JSON.parse(fs.readFileSync(cataloguePath, "utf8"));
const motionIndex = JSON.parse(fs.readFileSync(motionPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(outputPath, "utf8"));
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

test("LIVE asset manifest inventories the complete canonical gift catalogue", () => {
  const activeCount = catalogue.gifts.filter(gift => gift.active === true).length;
  const inactiveCount = catalogue.gifts.length - activeCount;
  assert.equal(manifest.summary.catalogue_gift_count, catalogue.gifts.length);
  assert.equal(manifest.summary.active_gift_count, activeCount);
  assert.equal(manifest.summary.inactive_gift_count, inactiveCount);
  assert.equal(manifest.gifts.length, catalogue.gifts.length);
  assert.equal(manifest.summary.active_motion_profile_count, motionIndex.gifts.length);
  assert.equal(manifest.summary.svg_artwork_file_count, catalogue.gifts.length);
  assert.equal(manifest.summary.transparent_background_artwork_count, catalogue.gifts.length);
  assert.equal(manifest.summary.gltf_model_file_count, catalogue.gifts.length);
  assert.equal(manifest.summary.required_generated_files_verified, true);
  assert.equal(manifest.summary.emoji_font_overlay_count, 0);
  assert.equal(manifest.manifest_status, "generated_inventory_not_a_premium_quality_or_licensing_approval");
});

test("every gift record has measured SVG and GLTF files, dimensions, hashes and source references", () => {
  const byCode = new Map(catalogue.gifts.map(gift => [gift.code, gift]));
  const codes = new Set();
  const ids = new Set();
  let emojiOverlayCount = 0;
  for (const entry of manifest.gifts) {
    const source = byCode.get(entry.code);
    assert.ok(source, "unknown catalogue gift " + entry.code);
    assert.ok(!codes.has(entry.code), "duplicate gift code " + entry.code);
    assert.ok(!ids.has(entry.gift_id), "duplicate gift ID " + entry.gift_id);
    codes.add(entry.code);
    ids.add(entry.gift_id);
    assert.equal(entry.gift_id, "minglora-live-gift:" + source.code);
    assert.equal(entry.name, source.name);
    assert.equal(entry.category, source.category);
    assert.equal(entry.active, source.active);
    assert.equal(entry.coin_price, source.coin_price);
    assert.equal(entry.artwork.transparent_background, true, "gift artwork must have a transparent canvas: " + entry.code);

    for (const asset of [entry.artwork, entry.model]) {
      const file = path.join(root, asset.path);
      assert.ok(fs.existsSync(file), asset.path);
      assert.ok(fs.statSync(file).size > 0, "empty asset " + asset.path);
      assert.equal(asset.file_size_bytes, fs.statSync(file).size, "wrong size " + asset.path);
      assert.equal(asset.sha256, sha256(file), "wrong SHA-256 " + asset.path);
      assert.ok(asset.source?.generator, "missing provenance generator " + asset.path);
      assert.ok(asset.licensing?.status, "missing licence review state " + asset.path);
    }
    assert.equal(entry.artwork.format, "svg");
    assert.equal(entry.artwork.dimensions.width_px, 512);
    assert.equal(entry.artwork.dimensions.height_px, 512);
    assert.ok(entry.artwork.dimensions.view_box.length === 4);
    assert.equal(entry.model.format, "gltf-json");
    assert.ok(entry.model.dimensions.bounds.dimensions.every(value => Number.isFinite(value) && value > 0));
    assert.ok(entry.model.dimensions.vertex_count > 0);
    assert.ok(entry.model.dimensions.triangle_count > 0);
    assert.equal(entry.model.quality.approved_for_premium_production, false);
    assert.equal(entry.artwork.quality.approved_for_premium_production, false);
    assert.equal(entry.artwork.quality.human_visual_review, "not_completed");
    assert.equal(entry.artwork.licensing.status, "review_required");
    if (entry.artwork.quality.emoji_font_overlay_present) emojiOverlayCount++;
    assert.equal(entry.thumbnail.reuse_of_primary_artwork, true);
  }
  assert.equal(codes.size, catalogue.gifts.length);
  assert.equal(emojiOverlayCount, manifest.summary.emoji_font_overlay_count);
  assert.equal(emojiOverlayCount, 0, "every generated SVG must be free of system-font emoji overlays");
  assert.equal(manifest.summary.emoji_font_overlay_count, 0);
});

test("active gift animation profiles match the canonical motion index; retired gifts stay inactive", () => {
  const sourceByCode = new Map(catalogue.gifts.map(gift => [gift.code, gift]));
  const motionByCode = new Map(motionIndex.gifts.map(gift => [gift.code, gift]));
  for (const entry of manifest.gifts) {
    const profile = motionByCode.get(entry.code);
    const source = sourceByCode.get(entry.code);
    if (source.active) {
      assert.ok(profile, "missing active motion profile for " + entry.code);
      assert.equal(entry.animation.animation_key, profile.animation_key);
      assert.equal(entry.animation.motion_preset, profile.motion_preset);
      assert.equal(entry.animation.motion_effect, profile.motion_effect);
      assert.equal(entry.animation.duration_ms, profile.motion_duration_ms);
      assert.equal(entry.animation.standalone_animation_file, null);
    } else {
      assert.equal(profile, undefined);
      assert.equal(entry.animation.status, "inactive_catalogue_item_no_runtime_motion_profile");
    }
  }
});

test("sound, device and fallback limitations are explicit rather than claimed complete", () => {
  assert.equal(manifest.summary.dedicated_mastered_gift_sound_file_count, 0);
  assert.equal(manifest.summary.physical_device_qa_verified_count, 0);
  for (const entry of manifest.gifts) {
    assert.equal(entry.sound.audio_file, null);
    assert.equal(entry.sound.dedicated_mastered_gift_sound, false);
    assert.equal(entry.sound.status, "synthetic_category_profile_not_mastered_gift_audio");
    assert.equal(entry.device_support.device_qa_status, "not_verified_on_physical_devices");
    assert.equal(entry.loading_and_fallback.model_error_fallback_to_svg, true);
    assert.equal(entry.model.loading.model_load_error_image_fallback_implemented, true);
  }
});

test("shared SVG icon sprite metadata matches the repository's actual symbol IDs", () => {
  const source = fs.readFileSync(iconPath, "utf8");
  const symbolIds = [...source.matchAll(/<symbol\b[^>]*\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const record = manifest.shared_assets.icons.find(item => item.path === "public/assets/icons/navigation-3d.svg");
  assert.ok(record);
  assert.equal(record.symbol_count, symbolIds.length);
  assert.deepEqual(record.symbol_ids, symbolIds);
  assert.equal(record.completeness, "shared_application_sprite_not_a_complete_live_control_state_pack");
});

test("shared LIVE control and gift-category SVG packs are inventoried with file hashes", () => {
  const packs = manifest.shared_assets.icons;
  const controlPack = packs.find(item => item.pack_id === "minglora-live-controls");
  const categoryPack = packs.find(item => item.pack_id === "minglora-live-gift-categories");
  const toolsPack = packs.find(item => item.pack_id === "minglora-live-tools-shortcuts");
  assert.ok(controlPack);
  assert.ok(categoryPack);
  assert.ok(toolsPack);
  assert.equal(controlPack.icon_count, 16);
  assert.equal(categoryPack.icon_count, 22);
  assert.equal(toolsPack.icon_count, 12);
  assert.equal(manifest.summary.live_control_icon_count, 16);
  assert.equal(manifest.summary.live_gift_category_icon_count, 22);
  assert.equal(manifest.summary.live_tools_shortcut_icon_count, 12);
  for (const pack of [controlPack, categoryPack, toolsPack]) {
    assert.equal(pack.completeness, "standalone_svg_icon_pack");
    assert.equal(pack.assets.length, pack.icon_count);
    assert.equal(new Set(pack.icon_ids).size, pack.icon_ids.length);
    for (const asset of pack.assets) {
      const file = path.join(root, asset.path);
      assert.ok(fs.existsSync(file), asset.asset_id + " standalone icon must exist");
      assert.equal(asset.sha256, sha256(file), asset.asset_id + " SHA-256 must match the actual SVG");
      assert.equal(asset.format, "svg-symbol");
      assert.deepEqual(asset.dimensions.view_box, [0, 0, 24, 24]);
      assert.equal(asset.quality.approved_for_premium_production, false);
      assert.equal(asset.licensing.status, "review_required");
    }
  }
  assert.ok(controlPack.component_usage.includes("public/app.js"));
  assert.ok(categoryPack.component_usage.includes("public/live-gift-access.css"));
  assert.ok(toolsPack.component_usage.includes("public/app.js"));
  assert.ok(toolsPack.component_usage.includes("public/live-tiktok-compact.css"));
});

test("manifest generation is part of startup, CI and documentation", () => {
  const packageData = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const integration = fs.readFileSync(path.join(root, "reports/ASSET_INTEGRATION_MAP.md"), "utf8");
  assert.match(packageData.scripts.prestart, /generate-minglora-live-asset-manifest\.mjs/);
  assert.match(packageData.scripts["build:live-asset-manifest"], /generate-minglora-live-asset-manifest\.mjs/);
  assert.match(workflow, /npm run build:live-asset-manifest/);
  assert.match(workflow, /minglora-live-asset-manifest/);
  assert.match(integration, /live-asset-manifest\.json/);
  assert.match(integration, /live-tools\/manifest\.json/);
});
