import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "data", "minglora-gift-catalog.json");
const OUTPUT = path.join(ROOT, "public", "assets", "animations", "gifts", "catalog-motion-index.json");
const GENERATOR = "Minglora LIVE gift motion index generator";
const checkOnly = process.argv.includes("--check");

// These are the effect layers supported by public/gift-effects.js.  The
// subject-specific motion remains the catalog's existing animation_preset.
const EFFECT_BY_CATEGORY = Object.freeze({
  flowers: "petals",
  hearts: "rings",
  animals: "bubbles",
  vehicles: "trail",
  music: "waves",
  sports: "rings",
  food_drink: "bubbles",
  fashion_beauty: "sparkles",
  luxury: "rings",
  celebrations: "sparkles",
  fantasy: "orbits",
  nature: "petals",
  travel: "waves",
  games: "rings",
  community: "sparkles",
  symbols: "orbits",
  reactions: "rings",
  other: "sparkles"
});
const VALID_EFFECTS = new Set(["petals", "waves", "rings", "trail", "orbits", "bubbles", "sparkles"]);

function fail(message) {
  throw new Error("[Minglora LIVE motion index] " + message);
}
function readSource() {
  const manifest = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  if (!Array.isArray(manifest.gifts) || manifest.gifts.length !== manifest.gift_count) {
    fail("gift catalogue count does not match its rows.");
  }

  const codes = new Set();
  const records = [];
  for (const gift of manifest.gifts) {
    if (!gift || typeof gift !== "object") fail("catalogue contains a non-object gift row.");
    if (typeof gift.active !== "boolean") fail("active flag must be boolean for " + (gift.code || "unknown gift"));
    if (codes.has(gift.code)) fail("duplicate gift code: " + gift.code);
    codes.add(gift.code);
    if (!gift.active) continue;

    if (!/^[a-z0-9_-]{1,59}$/.test(String(gift.code || ""))) fail("invalid gift code.");
    if (!String(gift.name || "").trim()) fail("missing gift name for " + gift.code);
    if (!String(gift.animation_preset || "").trim()) fail("missing animation preset for " + gift.code);
    if (!String(gift.animation_key || "").trim()) fail("missing animation identity for " + gift.code);
    if (!String(gift.sound_preset || "").trim()) fail("missing generated sound profile for " + gift.code);
    if (!Number.isInteger(gift.animation_duration_ms) || gift.animation_duration_ms < 900) fail("invalid animation duration for " + gift.code);
    const imageUrl = "/assets/gifts/catalog/" + gift.code + ".svg";
    const modelUrl = "/assets/gifts/catalog/" + gift.code + ".gltf";
    if (gift.image_url !== imageUrl || gift.model_url !== modelUrl) fail("non-canonical local asset paths for " + gift.code);
    if (/^https?:\/\//i.test(imageUrl + " " + modelUrl)) fail("remote asset URL is not permitted for " + gift.code);

    const motionEffect = EFFECT_BY_CATEGORY[gift.category] || "sparkles";
    if (!VALID_EFFECTS.has(motionEffect)) fail("unsupported motion effect for " + gift.code);
    records.push({
      code: gift.code,
      active: true,
      category: gift.category,
      animation_key: gift.animation_key,
      motion_preset: gift.animation_preset,
      motion_effect: motionEffect,
      motion_duration_ms: gift.animation_duration_ms,
      image_url: imageUrl,
      model_url: modelUrl,
      sound_preset: gift.sound_preset
    });
  }

  if (!records.length) fail("no active gift records were found.");
  return {
    schema_version: 1,
    generator: GENERATOR,
    source_catalog_generated_at: String(manifest.generated_at || "unspecified"),
    catalogue_count: manifest.gifts.length,
    active_gift_count: records.length,
    gifts: records
  };
}
function main() {
  const output = readSource();
  const serialized = JSON.stringify(output, null, 2) + "\n";

  if (checkOnly) {
    if (!fs.existsSync(OUTPUT)) fail("motion index is missing; run npm run build:live-gift-motion.");
    const existing = fs.readFileSync(OUTPUT, "utf8");
    if (existing !== serialized) fail("motion index is stale; run npm run build:live-gift-motion.");
    process.stdout.write("[Minglora LIVE motion index] verified " + output.active_gift_count + " active gift profiles.\n");
    return;
  }

  if (fs.existsSync(OUTPUT)) {
    let existing;
    try { existing = JSON.parse(fs.readFileSync(OUTPUT, "utf8")); }
    catch { fail("refusing to replace an existing non-JSON file: " + OUTPUT); }
    if (existing.generator !== GENERATOR) {
      fail("refusing to replace a file not owned by this generator: " + OUTPUT);
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  const temporary = OUTPUT + ".tmp-" + process.pid;
  fs.writeFileSync(temporary, serialized, { encoding: "utf8", flag: "w" });
  fs.renameSync(temporary, OUTPUT);
  process.stdout.write("[Minglora LIVE motion index] generated " + output.active_gift_count + " active gift profiles from " + output.catalogue_count + " catalogue rows.\n");
}
main();
