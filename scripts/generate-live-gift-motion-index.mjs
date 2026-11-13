import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "data", "minglora-gift-catalog.json");
const PRESET_SOURCE = path.join(ROOT, "assets", "animations", "gifts", "animation-catalog.json");
const OUTPUT = path.join(ROOT, "public", "assets", "animations", "gifts", "catalog-motion-index.json");
const MOTION_DIR = path.join(ROOT, "public", "assets", "animations", "gifts", "per-gift");
const GENERATOR = "Minglora LIVE motion index generator";
const ASSET_GENERATOR = "Minglora LIVE per-gift motion generator";
const checkOnly = process.argv.includes("--check");

const EFFECT_BY_CATEGORY = Object.freeze({
  flowers: "petals", hearts: "rings", animals: "bubbles", vehicles: "trail",
  music: "waves", sports: "rings", food_drink: "bubbles",
  fashion_beauty: "sparkles", luxury: "rings", celebrations: "sparkles",
  fantasy: "orbits", nature: "petals", travel: "waves", games: "rings",
  community: "sparkles", symbols: "orbits", reactions: "rings", other: "sparkles"
});
const PRESET_BY_CATEGORY = Object.freeze({
  flowers: "petal-bloom", hearts: "heart-pulse", animals: "creature-entrance",
  vehicles: "grand-entry", music: "soundwave-ripple", sports: "power-impact",
  food_drink: "delight-pop", fashion_beauty: "glam-spin", luxury: "royal-shimmer",
  celebrations: "celebration-burst", fantasy: "cosmic-orbit", nature: "nature-rise",
  travel: "horizon-sweep", games: "pixel-burst", community: "warm-wave",
  symbols: "cosmic-orbit", reactions: "heart-pulse", other: "gift-reveal"
});
const VALID_EFFECTS = new Set(["petals", "waves", "rings", "trail", "orbits", "bubbles", "sparkles"]);

function fail(message) {
  throw new Error("[Minglora LIVE motion index] " + message);
}
function hash32(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function readPresets() {
  const source = JSON.parse(fs.readFileSync(PRESET_SOURCE, "utf8"));
  if (source.schema_version !== 1 || source.format !== "web-animations-keyframes" || !Array.isArray(source.presets)) {
    fail("gift animation preset catalogue is invalid.");
  }
  const presets = new Map();
  for (const preset of source.presets) {
    if (!preset || !/^[a-z0-9-]{2,48}$/.test(String(preset.id || "")) || presets.has(preset.id)) {
      fail("gift animation preset catalogue contains an invalid or duplicate ID.");
    }
    if (!Array.isArray(preset.keyframes) || preset.keyframes.length < 3) fail("preset has no usable keyframes: " + preset.id);
    presets.set(preset.id, preset);
  }
  if (!presets.has("gift-reveal")) fail("gift-reveal fallback preset is required.");
  return presets;
}
function buildGiftAnimation(gift, ordinal, presets) {
  const requested = String(gift.animation_preset || "");
  const presetId = presets.has(requested) ? requested : (PRESET_BY_CATEGORY[gift.category] || "gift-reveal");
  const preset = presets.get(presetId) || presets.get("gift-reveal");
  const seed = hash32([gift.animation_key, gift.code, gift.name].join("|"));
  const signed = (seed & 1) ? 1 : -1;
  const drift = 4 + (seed % 11);
  const lift = 5 + ((seed >>> 8) % 12);
  const turn = ((seed >>> 16) % 37) - 18;
  // A stable ordinal component guarantees a distinct file/choreography signature
  // for every active gift, while a code-derived component makes the motion subject-aware.
  const ordinalDrift = Number(((ordinal + 1) / 1000).toFixed(3));
  const keyframes = preset.keyframes.map((frame, frameIndex) => {
    const progress = Number(frame.offset);
    const envelope = progress === 0 ? -1 : progress === 1 ? 0 : (progress < 0.5 ? 1 : -0.45);
    const x = Number((signed * (drift * envelope + ordinalDrift)).toFixed(3));
    const y = Number(((-lift * envelope) + (ordinalDrift * (frameIndex % 2 ? 0.4 : -0.25))).toFixed(3));
    const rotation = Number((turn * envelope + ordinalDrift * 0.17).toFixed(6));
    const baseTransform = String(frame.transform || "none");
    return {
      ...frame,
      transform: "translate3d(" + x + "px," + y + "px,0) rotateZ(" + rotation + "deg) " + baseTransform
    };
  });
  return {
    schema_version: 1,
    generator: ASSET_GENERATOR,
    code: gift.code,
    name: gift.name,
    category: gift.category,
    animation_key: gift.animation_key,
    source_preset: presetId,
    ordinal,
    duration_ms: gift.animation_duration_ms,
    keyframes,
    reduced_motion: {
      respect_prefers_reduced_motion: true,
      duration_ms: 320,
      iterations: 1,
      autoplay: false
    }
  };
}
function readSource() {
  const manifest = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  if (!Array.isArray(manifest.gifts) || manifest.gifts.length !== manifest.gift_count) {
    fail("gift catalogue count does not match its rows.");
  }
  const presets = readPresets();
  const codes = new Set();
  const animationKeys = new Set();
  const records = [];
  const assets = [];
  const active = manifest.gifts.filter(gift => gift && gift.active === true).slice().sort((left, right) => String(left.code).localeCompare(String(right.code)));

  for (const gift of manifest.gifts) {
    if (!gift || typeof gift !== "object") fail("catalogue contains a non-object gift row.");
    if (typeof gift.active !== "boolean") fail("active flag must be boolean for " + (gift.code || "unknown gift"));
    if (codes.has(gift.code)) fail("duplicate gift code: " + gift.code);
    codes.add(gift.code);
  }

  for (const [ordinal, gift] of active.entries()) {
    if (!/^[a-z0-9_-]{1,59}$/.test(String(gift.code || ""))) fail("invalid gift code.");
    if (!String(gift.name || "").trim()) fail("missing gift name for " + gift.code);
    if (!String(gift.animation_preset || "").trim()) fail("missing animation preset for " + gift.code);
    if (!String(gift.animation_key || "").trim()) fail("missing animation identity for " + gift.code);
    if (animationKeys.has(gift.animation_key)) fail("duplicate active gift animation identity: " + gift.animation_key);
    animationKeys.add(gift.animation_key);
    if (!String(gift.sound_preset || "").trim()) fail("missing generated sound profile for " + gift.code);
    if (!Number.isInteger(gift.animation_duration_ms) || gift.animation_duration_ms < 900) fail("invalid animation duration for " + gift.code);
    const imageUrl = "/assets/gifts/catalog/" + gift.code + ".svg";
    const modelUrl = "/assets/gifts/catalog/" + gift.code + ".gltf";
    if (gift.image_url !== imageUrl || gift.model_url !== modelUrl) fail("non-canonical local asset paths for " + gift.code);
    if (/^https?:\/\//i.test(imageUrl + " " + modelUrl)) fail("remote asset URL is not permitted for " + gift.code);
    const motionEffect = EFFECT_BY_CATEGORY[gift.category] || "sparkles";
    if (!VALID_EFFECTS.has(motionEffect)) fail("unsupported motion effect for " + gift.code);

    const motionAssetUrl = "/assets/animations/gifts/per-gift/" + gift.code + ".json";
    records.push({
      code: gift.code,
      active: true,
      category: gift.category,
      animation_key: gift.animation_key,
      motion_preset: gift.animation_preset,
      motion_effect: motionEffect,
      motion_duration_ms: gift.animation_duration_ms,
      motion_asset_url: motionAssetUrl,
      image_url: imageUrl,
      model_url: modelUrl,
      sound_preset: gift.sound_preset
    });
    const animation = buildGiftAnimation(gift, ordinal, presets);
    assets.push({
      path: path.join(MOTION_DIR, gift.code + ".json"),
      content: JSON.stringify(animation, null, 2) + "\n"
    });
  }

  if (!records.length) fail("no active gift records were found.");
  return {
    index: {
      schema_version: 2,
      generator: GENERATOR,
      source_catalog_generated_at: String(manifest.generated_at || "unspecified"),
      catalogue_count: manifest.gifts.length,
      active_gift_count: records.length,
      per_gift_motion_asset_count: assets.length,
      gifts: records
    },
    assets
  };
}
function verifyOwnedFile(filePath, expectedGenerator) {
  if (!fs.existsSync(filePath)) return;
  let existing;
  try { existing = JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { fail("refusing to replace an existing non-JSON file: " + filePath); }
  if (existing.generator !== expectedGenerator) {
    fail("refusing to replace a file not owned by this generator: " + filePath);
  }
}
function writeAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = filePath + ".tmp-" + process.pid;
  fs.writeFileSync(temporary, content, { encoding: "utf8", flag: "w" });
  fs.renameSync(temporary, filePath);
}
function main() {
  const { index, assets } = readSource();
  const serializedIndex = JSON.stringify(index, null, 2) + "\n";

  if (checkOnly) {
    if (!fs.existsSync(OUTPUT)) fail("motion index is missing; run npm run build:live-gift-motion.");
    if (fs.readFileSync(OUTPUT, "utf8") !== serializedIndex) fail("motion index is stale; run npm run build:live-gift-motion.");
    for (const asset of assets) {
      if (!fs.existsSync(asset.path)) fail("per-gift motion asset is missing: " + path.relative(ROOT, asset.path));
      if (fs.readFileSync(asset.path, "utf8") !== asset.content) fail("per-gift motion asset is stale: " + path.relative(ROOT, asset.path));
    }
    process.stdout.write("[Minglora LIVE motion index] verified " + index.active_gift_count + " active gifts and " + assets.length + " individual motion files.\n");
    return;
  }

  verifyOwnedFile(OUTPUT, GENERATOR);
  for (const asset of assets) verifyOwnedFile(asset.path, ASSET_GENERATOR);

  // Write individual files first and publish the index last. No stale or unowned
  // file is ever deleted; this generator only manages paths it can identify.
  for (const asset of assets) {
    if (!fs.existsSync(asset.path) || fs.readFileSync(asset.path, "utf8") !== asset.content) {
      writeAtomic(asset.path, asset.content);
    }
  }
  if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, "utf8") !== serializedIndex) {
    writeAtomic(OUTPUT, serializedIndex);
  }
  process.stdout.write("[Minglora LIVE motion index] generated " + index.active_gift_count + " active gift profiles and " + assets.length + " unique per-gift motion files.\n");
}
main();
