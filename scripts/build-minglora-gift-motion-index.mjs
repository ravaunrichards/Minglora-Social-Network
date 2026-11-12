import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "assets", "animations", "gifts");
const PUBLIC_INDEX = path.join(ROOT, "public", "assets", "animations", "gifts", "catalog-motion-index.json");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const REPORT_PATH = path.join(OUTPUT_DIR, "extraction-report.json");
const CATALOG_PATH = path.join(ROOT, "data", "minglora-gift-catalog.json");
const ARTWORK_PATH = path.join(ROOT, "assets", "Artwork", "manifest.json");

function normalizeName(value) {
  return String(value || "").normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function hash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 8);
}
function animationProfile(category, seed, name = "") {
  const normalizedName = normalizeName(name);
  // Prefer an object-specific motion when the recognized name clearly identifies
  // the subject. Category profiles remain the safe fallback for ambiguous labels.
  const namedProfiles = [
    { pattern: /\b(?:firework|fireworks|sparkler|confetti|celebration|burst)\b/, profile: ["firework-burst", "2.3s", "burst", "sparkles"] },
    { pattern: /\b(?:rocket|spaceship|space shuttle|launch|starship)\b/, profile: ["rocket-launch", "2.2s", "launch", "trail"] },
    { pattern: /\b(?:airplane|plane|jet|helicopter|aircraft|hot air balloon)\b/, profile: ["sky-flight", "2.0s", "glide", "orbits"] },
    { pattern: /\b(?:car|truck|bus|motorcycle|motorbike|bicycle|bike|race|racing|sports car)\b/, profile: ["speed-drift", "1.85s", "glide", "trail"] },
    { pattern: /\b(?:butterfly|moth|dragonfly)\b/, profile: ["butterfly-flutter", "1.8s", "flutter", "petals"] },
    { pattern: /\b(?:bird|falcon|eagle|owl|parrot|chicken|duck|goose|phoenix)\b/, profile: ["winged-flight", "1.65s", "flutter", "trail"] },
    { pattern: /\b(?:cat|kitten|dog|puppy|lion|tiger|bear|panda|rabbit|bunny|fox|wolf|horse|frog|turtle|koala)\b/, profile: ["playful-creature", "1.55s", "bounce", "sparkles"] },
    { pattern: /\b(?:rose|flower|bouquet|hibiscus|tulip|lily|orchid|petal|blossom|sunflower)\b/, profile: ["blossom-bloom", "2.1s", "bloom", "petals"] },
    { pattern: /\b(?:heart|love|kiss|romance|cupid|valentine|hug)\b/, profile: ["heart-pulse", "1.25s", "pulse", "sparkles"] },
    { pattern: /\b(?:crown|diamond|crystal|gem|gold|treasure|royal|palace|jewel)\b/, profile: ["royal-shimmer", "2.35s", "shimmer", "sparkles"] },
    { pattern: /\b(?:balloon|cloud|moon|sun|star|rainbow|comet)\b/, profile: ["gentle-float", "2.3s", "float", "bubbles"] },
    { pattern: /\b(?:guitar|drum|piano|keyboard|microphone|headphone|speaker|music|melody|concert|dj)\b/, profile: ["music-rhythm", "1.35s", "rhythm", "waves"] },
    { pattern: /\b(?:ocean|sea|wave|fish|dolphin|whale|shark|boat|ship|yacht|sail)\b/, profile: ["ocean-drift", "2.2s", "wave", "waves"] },
    { pattern: /\b(?:cake|cupcake|ice cream|coffee|tea|juice|pizza|burger|cherry|mango|watermelon|candy|food|drink)\b/, profile: ["sweet-pop", "1.5s", "pop", "bubbles"] },
    { pattern: /\b(?:trophy|medal|champion|goal|victory|winner|award)\b/, profile: ["victory-impact", "1.45s", "impact", "rings"] },
    { pattern: /\b(?:dragon|unicorn|wizard|magic|fairy|spell|galaxy|nebula|cosmic)\b/, profile: ["magic-orbit", "2.2s", "orbit", "sparkles"] }
  ];
  const named = namedProfiles.find(entry => entry.pattern.test(normalizedName));
  const categoryProfiles = {
    flowers: ["petal-bloom", "2.1s", "bloom", "petals"],
    hearts: ["heart-pulse", "1.25s", "pulse", "sparkles"],
    animals: ["creature-entrance", "1.55s", "bounce", "sparkles"],
    vehicles: ["horizon-sweep", "1.8s", "glide", "trail"],
    music: ["soundwave-ripple", "1.35s", "rhythm", "waves"],
    sports: ["power-impact", "1.35s", "impact", "rings"],
    food_drink: ["delight-pop", "1.5s", "pop", "bubbles"],
    fashion_beauty: ["glam-spin", "1.9s", "spin", "sparkles"],
    luxury: ["royal-shimmer", "2.3s", "shimmer", "sparkles"],
    celebrations: ["celebration-burst", "1.45s", "burst", "sparkles"],
    fantasy: ["cosmic-orbit", "2.2s", "orbit", "orbits"],
    nature: ["nature-rise", "2.4s", "float", "petals"],
    travel: ["horizon-sweep", "2.0s", "glide", "trail"],
    games: ["pixel-burst", "1.2s", "impact", "rings"],
    community: ["warm-wave", "1.8s", "wave", "waves"],
    symbols: ["spark-float", "1.75s", "float", "sparkles"],
    seasonal: ["seasonal-shimmer", "2.2s", "shimmer", "sparkles"],
    jamaican_culture: ["island-wave", "1.8s", "wave", "waves"],
    reactions: ["delight-pop", "1.15s", "pop", "sparkles"],
    everyday: ["gift-reveal", "1.7s", "float", "bubbles"],
    other: ["gift-reveal", "1.7s", "float", "sparkles"]
  };
  const [preset, duration, motion, effect] = named?.profile || categoryProfiles[category] || categoryProfiles.other;
  return {
    preset,
    duration,
    motion,
    effect,
    phase: -((seed % 1600) / 1000).toFixed(3) + "s",
    phaseIndex: seed % 7
  };
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  const report = JSON.parse(await fs.readFile(REPORT_PATH, "utf8"));
  const catalog = JSON.parse(await fs.readFile(CATALOG_PATH, "utf8"));
  const artworkManifest = JSON.parse(await fs.readFile(ARTWORK_PATH, "utf8"));
  if (!Array.isArray(manifest.gifts) || !manifest.gifts.length ||
      manifest.gifts.length !== manifest.unique_gift_count) {
    throw new Error("Existing captured gift manifest is incomplete.");
  }
  if (!Array.isArray(artworkManifest.gifts)) throw new Error("Original Artwork manifest is invalid.");

  // Verify every retained capture asset before reusing it; never regenerate or
  // overwrite the original captured SVG/WebP files on this fast path.
  for (const gift of manifest.gifts) {
    for (const relative of [gift.poster, gift.animation]) {
      if (typeof relative !== "string" || !relative.startsWith("assets/animations/gifts/")) {
        throw new Error("Invalid existing gift asset path for " + gift.name);
      }
      const absolute = path.resolve(ROOT, relative);
      if (!absolute.startsWith(path.resolve(OUTPUT_DIR) + path.sep)) throw new Error("Gift asset path escaped its output directory.");
      const stat = await fs.stat(absolute).catch(() => null);
      if (!stat?.isFile() || stat.size < 64) throw new Error("Missing existing captured gift asset: " + relative);
    }
  }

  const catalogByCode = new Map((catalog.gifts || []).map(gift => [String(gift.code), gift]));
  const extractedByCode = new Map();
  for (const extracted of manifest.gifts) {
    const code = String(extracted.matched_catalog_code || "");
    const canonical = catalogByCode.get(code);
    if (!canonical || normalizeName(canonical.name) !== normalizeName(extracted.name)) continue;
    if (!extractedByCode.has(code)) extractedByCode.set(code, extracted);
  }

  const artworkByName = new Map();
  const ambiguousArtworkNames = new Set();
  for (const artwork of artworkManifest.gifts || []) {
    const key = normalizeName(artwork.name);
    if (!key || ambiguousArtworkNames.has(key)) continue;
    if (artworkByName.has(key)) {
      artworkByName.delete(key);
      ambiguousArtworkNames.add(key);
    } else {
      artworkByName.set(key, artwork);
    }
  }

  const profiles = [];
  const codes = new Set();
  const duplicates = [];
  const invalid = [];
  let capturedCount = 0;
  let fallbackCount = 0;
  let inactiveCount = 0;
  let artworkMatchCount = 0;
  let artworkAmbiguousCount = 0;

  for (const canonical of catalog.gifts || []) {
    if (canonical.active === false) {
      inactiveCount++;
      continue;
    }
    const code = String(canonical.code || "");
    if (!code || codes.has(code)) {
      duplicates.push(code);
      continue;
    }
    if (!String(canonical.name || "").trim() ||
        !Number.isFinite(Number(canonical.coin_price)) || Number(canonical.coin_price) < 0 ||
        typeof canonical.image_url !== "string" || !canonical.image_url.startsWith("/assets/") ||
        typeof canonical.model_url !== "string" || !canonical.model_url.startsWith("/assets/") ||
        !String(canonical.animation_preset || "").trim() ||
        !String(canonical.sound_preset || "").trim()) {
      invalid.push({code, name:canonical.name || null});
      continue;
    }

    const extracted = extractedByCode.get(code) || null;
    const seed = parseInt(hash(code), 16) >>> 0;
    const fallback = animationProfile(canonical.category, seed, canonical.name);
    const artworkKey = normalizeName(canonical.name);
    const artwork = artworkByName.get(artworkKey) || null;
    if (artwork) artworkMatchCount++;
    else if (ambiguousArtworkNames.has(artworkKey)) artworkAmbiguousCount++;
    if (extracted) capturedCount++;
    else fallbackCount++;
    codes.add(code);

    profiles.push({
      code:canonical.code,
      name:canonical.name,
      category:canonical.category,
      emoji:canonical.emoji,
      coin_price:Number(canonical.coin_price),
      active:true,
      image_url:canonical.image_url,
      model_url:canonical.model_url,
      animation_key:canonical.animation_key,
      original_animation_preset:canonical.animation_preset,
      sound_preset:canonical.sound_preset,
      original_animation_duration_ms:canonical.animation_duration_ms,
      motion_preset:extracted?.animation_preset || fallback.preset,
      motion_effect:extracted?.animation_effect || fallback.effect,
      motion_duration_ms:extracted?.animation_duration_ms || Math.round(Number.parseFloat(fallback.duration) * 1000),
      motion_phase:fallback.phase,
      motion_phase_index:fallback.phaseIndex,
      motion_seed:seed,
      source_kind:extracted ? "captured-gallery-still" : "canonical-catalogue-profile",
      source_image:extracted?.source_image || null,
      source_region:extracted?.source_region || null,
      source_capture_references:extracted?.sources || [],
      ocr_confidence:extracted?.ocr_confidence ?? null,
      artwork_reference:artwork ? {
        path:"assets/Artwork/" + artwork.artwork,
        sha256:artwork.sha256,
        source_primary:artwork.source_primary,
        warnings:artwork.warnings || [],
        review_status:artwork.review_status
      } : null,
      visual_review_status:extracted ? "needs_visual_review" : "catalogue-original-artwork"
    });
  }

  const activeCount = (catalog.gifts || []).filter(gift => gift.active !== false).length;
  if (invalid.length || duplicates.length || profiles.length !== activeCount ||
      capturedCount + fallbackCount !== activeCount) {
    throw new Error("Canonical gift index coverage failed: active=" + activeCount +
      ", indexed=" + profiles.length + ", invalid=" + invalid.length +
      ", duplicates=" + duplicates.length);
  }
  profiles.sort((a,b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));

  const motionIndex = {
    schema_version:1,
    generated_at:new Date().toISOString(),
    project:"Minglora Social Network",
    source_directory:"assets/Gifts",
    artwork_reference_manifest:"assets/Artwork/manifest.json",
    authoritative_catalog:"data/minglora-gift-catalog.json",
    gifts:profiles
  };
  const serialized = JSON.stringify(motionIndex, null, 2) + "\\n";
  await fs.mkdir(path.dirname(PUBLIC_INDEX), {recursive:true});
  await fs.writeFile(path.join(OUTPUT_DIR,"catalog-motion-index.json"), serialized, "utf8");
  await fs.writeFile(PUBLIC_INDEX, serialized, "utf8");

  manifest.catalog_motion_index_path = "assets/animations/gifts/catalog-motion-index.json";
  manifest.catalog_motion_profile_count = profiles.length;
  manifest.processing_notes = Array.isArray(manifest.processing_notes) ? manifest.processing_notes : [];
  const note = "The catalogue motion index covers every active canonical gift, keeps the exact Coin price, original image, 3D model, original animation and sound settings, layers capture-derived motion for exact Gifts matches, and uses a deterministic name/category motion profile for the remaining active gifts. Only unique exact-name Artwork references are attached; ambiguous variants remain unlinked.";
  if (!manifest.processing_notes.includes(note)) manifest.processing_notes.push(note);
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\\n", "utf8");

  report.catalog_motion_profiles = profiles.length;
  report.catalog_motion_captured_profiles = capturedCount;
  report.catalog_motion_fallback_profiles = fallbackCount;
  report.catalog_motion_inactive_matches = inactiveCount;
  report.catalog_motion_invalid_profiles = invalid;
  report.catalog_motion_duplicate_codes = duplicates;
  report.artwork_reference_matches = artworkMatchCount;
  report.artwork_reference_ambiguous_matches = artworkAmbiguousCount;
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\\n", "utf8");

  const readme = "# Minglora individual gift animations\\n\\n" +
    "Generated from the original 131 source captures in assets/Gifts/. Each captured gift retains its own transparent WebP poster and self-contained animated SVG.\\n\\n" +
    "catalog-motion-index.json maps every active canonical catalogue gift to a deterministic per-gift motion profile while preserving its exact gift code, name, Coin price, original image URL, original 3D model URL, original animation preset and sound preset. Exact capture matches use their individual Gifts motion profile. The remaining active gifts use a name/category motion profile over their original catalogue model. Unique exact-name Artwork manifest references include the original Artwork path, hash, review status and warnings; ambiguous names are never assigned an arbitrary variant.\\n\\n" +
    "The original source captures and original catalogue artwork/models are not overwritten. Screenshot-derived assets remain marked for visual review. The motion layer is Minglora-owned choreography and is not a reproduction of TikTok's proprietary animation files.\\n";
  await fs.writeFile(path.join(OUTPUT_DIR,"README.md"), readme, "utf8");

  process.stdout.write(JSON.stringify({
    active_catalogue_gifts:activeCount,
    captured_motion_profiles:capturedCount,
    fallback_motion_profiles:fallbackCount,
    total_motion_profiles:profiles.length,
    unique_artwork_references:artworkMatchCount,
    ambiguous_artwork_names:artworkAmbiguousCount,
    inactive_catalogue_gifts:inactiveCount,
    original_captured_gifts:manifest.gifts.length,
    source_screenshots:manifest.source_screenshots.length
  }, null, 2) + "\\n");
}

main().catch(error => {
  process.stderr.write(String(error?.stack || error) + "\\n");
  process.exitCode = 1;
});
