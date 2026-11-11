import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTWORK_ROOT = path.join(ROOT, "assets", "Artwork");
const SCREENSHOT_ROOT = path.join(ROOT, "assets", "Gifts");
const ARTWORK_MANIFEST = path.join(ARTWORK_ROOT, "manifest.json");
const CATALOG_MANIFEST = path.join(ROOT, "data", "minglora-gift-catalog.json");
const AUDIT_REPORT = path.join(ROOT, "reports", "gift-artwork-audit.json");
const OUTPUT_ROOT = path.join(ROOT, "public", "assets", "gifts", "animations");
const OUTPUT_MANIFEST = path.join(OUTPUT_ROOT, "manifest.json");
const CHECK_ONLY = process.argv.includes("--check");

const fail = message => { throw new Error("[gift-animations] " + message); };
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const safeSlug = value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ""));
const escapeXml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
}[character]));

function hash32(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function assertSafeRelative(relative, base, label) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) {
    fail(label + " is not a safe relative path.");
  }
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(path.resolve(base) + path.sep)) {
    fail(label + " escapes its source folder.");
  }
  return resolved;
}

function motionFor(preset, category) {
  const presetMap = {
    "petal-bloom": "sway",
    "heart-pulse": "pulse",
    "creature-entrance": "bounce",
    "horizon-sweep": "glide",
    "soundwave-ripple": "rhythm",
    "power-impact": "impact",
    "delight-pop": "pop",
    "glam-spin": "spin",
    "royal-shimmer": "shimmer",
    "celebration-burst": "burst",
    "cosmic-orbit": "orbit",
    "nature-rise": "float",
    "pixel-burst": "impact",
    "warm-wave": "wave",
    "spark-float": "float",
    "gift-reveal": "float"
  };
  if (presetMap[preset]) return presetMap[preset];
  const categoryMap = {
    flowers: "sway", hearts: "pulse", animals: "bounce", vehicles: "glide",
    music: "rhythm", sports: "impact", food_drink: "pop",
    fashion_beauty: "spin", luxury: "shimmer", celebrations: "burst",
    fantasy: "orbit", nature: "float", travel: "glide", games: "impact",
    community: "wave", symbols: "float", jamaican_culture: "wave"
  };
  return categoryMap[category] || "float";
}

function motionCss(motion) {
  const frames = {
    sway: "0%,100%{transform:rotate(-5deg) translateY(2px) scale(.96)}50%{transform:rotate(5deg) translateY(-8px) scale(1.04)}",
    pulse: "0%,100%{transform:scale(.88)}45%{transform:scale(1.1)}70%{transform:scale(.97)}",
    bounce: "0%,100%{transform:translateY(3px) scale(.98)}38%{transform:translateY(-20px) scale(1.04)}55%{transform:translateY(1px) scale(.95)}",
    glide: "0%,100%{transform:translateX(-8px) rotate(-2deg)}50%{transform:translateX(8px) rotate(2deg)}",
    rhythm: "0%,100%{transform:translateY(2px) rotate(-3deg) scale(.96)}25%{transform:translateY(-7px) rotate(3deg) scale(1.04)}50%{transform:translateY(0) rotate(-2deg) scale(.98)}75%{transform:translateY(-5px) rotate(2deg) scale(1.02)}",
    impact: "0%,100%{transform:scale(.9) rotate(-4deg)}35%{transform:scale(1.12) rotate(4deg)}55%{transform:scale(.97) rotate(-2deg)}",
    pop: "0%,100%{transform:scale(.9) translateY(5px)}35%{transform:scale(1.12) translateY(-10px)}65%{transform:scale(.98) translateY(0)}",
    spin: "0%,100%{transform:rotate(-5deg) scale(.96)}50%{transform:rotate(5deg) scale(1.04)}",
    shimmer: "0%,100%{transform:rotate(-2deg) scale(.97);filter:brightness(1)}50%{transform:rotate(2deg) scale(1.06);filter:brightness(1.3)}",
    burst: "0%,100%{transform:scale(.88) rotate(-4deg)}30%{transform:scale(1.12) rotate(5deg)}65%{transform:scale(1) rotate(-2deg)}",
    orbit: "0%,100%{transform:rotate(-7deg) translateY(2px)}50%{transform:rotate(7deg) translateY(-9px)}",
    float: "0%,100%{transform:translateY(5px) scale(.97)}50%{transform:translateY(-10px) scale(1.04)}",
    wave: "0%,100%{transform:translateX(-4px) rotate(-3deg)}50%{transform:translateX(5px) rotate(3deg)}"
  };
  return frames[motion] || frames.float;
}

function createAnimationSvg(artwork, gift, imageBuffer) {
  const identity = gift?.animation_key || ("minglora-" + artwork.slug);
  const seed = hash32(identity + "|" + artwork.sha256);
  const motion = motionFor(gift?.animation_preset, gift?.category);
  const durationMs = Number.isSafeInteger(gift?.animation_duration_ms)
    ? Math.min(6000, Math.max(700, gift.animation_duration_ms))
    : 1750;
  const phase = -((seed % 1600) / 1000).toFixed(3);
  const title = gift?.name || artwork.name || artwork.slug;
  const description = gift
    ? title + " gift animation. Original artwork retained; catalogue price and identity are unchanged."
    : title + " individual artwork animation. Review-only asset; original artwork retained.";
  const base64 = imageBuffer.toString("base64");
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 256 256" role="img" aria-labelledby="title desc">',
    "<title id=\"title\">" + escapeXml(title) + "</title>",
    "<desc id=\"desc\">" + escapeXml(description) + "</desc>",
    '<ellipse cx="128" cy="229" rx="58" ry="8" fill="#7180a5" opacity=".18"/>',
    '<g class="gift-motion" style="transform-origin:128px 128px;animation:giftMotion ' + durationMs + 'ms ease-in-out infinite;animation-delay:' + phase + 's">',
    '<image href="data:image/png;base64,' + base64 + '" xlink:href="data:image/png;base64,' + base64 + '" x="0" y="0" width="256" height="256" preserveAspectRatio="xMidYMid meet"/>',
    "</g>",
    "<style>@keyframes giftMotion{" + motionCss(motion) + "}",
    ".gift-motion{transform-box:fill-box;will-change:transform}",
    "@media(prefers-reduced-motion:reduce){.gift-motion{animation:none!important;transform:none!important;will-change:auto}}",
    "</style></svg>"
  ].join("");
}

function writeGenerated(file, content) {
  if (CHECK_ONLY) {
    if (!fs.existsSync(file)) fail("Missing generated asset: " + path.relative(ROOT, file));
    if (fs.readFileSync(file, "utf8") !== content) fail("Generated asset is stale: " + path.relative(ROOT, file));
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content) {
    fs.writeFileSync(file, content, "utf8");
  }
}

function canonicalArtwork(records) {
  return [...records].sort((left, right) => {
    const leftVariant = /-variant-\d+$/.test(left.slug) ? 1 : 0;
    const rightVariant = /-variant-\d+$/.test(right.slug) ? 1 : 0;
    return leftVariant - rightVariant || left.slug.localeCompare(right.slug);
  })[0];
}

function resolveArtworkGroups(artworkRecords, catalogRecords, audit) {
  const artworkByName = new Map();
  const catalogByName = new Map();
  for (const artwork of artworkRecords) {
    const key = normalize(artwork.name);
    if (!artworkByName.has(key)) artworkByName.set(key, []);
    artworkByName.get(key).push(artwork);
  }
  for (const gift of catalogRecords) {
    const key = normalize(gift.name);
    if (!catalogByName.has(key)) catalogByName.set(key, []);
    catalogByName.get(key).push(gift);
  }

  const resolved = new Map();
  const matchedCatalogNames = new Set();
  for (const [key, gifts] of catalogByName) {
    const exact = artworkByName.get(key);
    if (!exact?.length) continue;
    resolved.set(key, { method: "exact-title", artwork: exact, gifts });
    matchedCatalogNames.add(key);
  }

  const suggestions = Array.isArray(audit.catalog_name_suggestions_for_truncated_or_low_confidence)
    ? audit.catalog_name_suggestions_for_truncated_or_low_confidence : [];
  const fuzzyByTarget = new Map();
  for (const suggestion of suggestions) {
    if (!Array.isArray(suggestion.suggestions) || suggestion.suggestions.length !== 1) continue;
    const sourceKey = normalize(suggestion.ocr_name);
    const targetName = suggestion.suggestions[0];
    const targetKey = normalize(targetName);
    const sourceCompact = sourceKey.replace(/\s+/g, "");
    const targetCompact = targetKey.replace(/\s+/g, "");
    // Only accept a single, strong prefix match. Loose fuzzy matches remain review-only.
    if (sourceCompact.length < 8 || !targetCompact.startsWith(sourceCompact)) continue;
    if (matchedCatalogNames.has(targetKey)) continue;
    const sourceArtwork = artworkRecords.find(item => item.slug === suggestion.slug);
    const gifts = catalogByName.get(targetKey);
    if (!sourceArtwork || !gifts?.length) continue;
    if (!fuzzyByTarget.has(targetKey)) fuzzyByTarget.set(targetKey, []);
    fuzzyByTarget.get(targetKey).push(sourceArtwork);
  }

  for (const [targetKey, records] of fuzzyByTarget) {
    const catalogNameGroup = catalogByName.get(targetKey);
    if (!catalogNameGroup?.length || resolved.has(targetKey)) continue;
    const sourceNames = new Set(records.map(record => normalize(record.name)));
    const expanded = artworkRecords.filter(record => sourceNames.has(normalize(record.name)));
    resolved.set(targetKey, {
      method: "single-prefix-suggestion",
      artwork: expanded,
      gifts: catalogNameGroup,
      review_required: true
    });
  }

  return { artworkByName, catalogByName, resolved };
}

function validateInputs(artworkManifest, catalogManifest, audit) {
  if (!Array.isArray(artworkManifest.gifts) || artworkManifest.gifts.length !== artworkManifest.unique_artwork_count) {
    fail("Artwork manifest count does not match its records.");
  }
  if (!Array.isArray(catalogManifest.gifts) || catalogManifest.gifts.length !== catalogManifest.gift_count) {
    fail("Gift catalogue count does not match its records.");
  }
  if (!Array.isArray(audit.same_title_near_duplicate_candidates)) {
    fail("Gift artwork audit report is missing its variant review records.");
  }
  if (artworkManifest.source_capture_count !== 131 || artworkManifest.gifts.length !== 1509) {
    fail("Unexpected Artwork manifest size; inspect source changes before generating.");
  }
  const codes = new Set();
  for (const gift of catalogManifest.gifts) {
    if (!gift || !/^[a-z0-9_-]{1,59}$/.test(String(gift.code || ""))) fail("Invalid gift code.");
    if (codes.has(gift.code)) fail("Duplicate gift code: " + gift.code);
    codes.add(gift.code);
    if (!String(gift.name || "").trim() || !Number.isSafeInteger(gift.coin_price) || gift.coin_price < 1) {
      fail("Invalid title or Coin price on catalogue record " + gift.code);
    }
    if (!gift.animation_key || !gift.animation_preset || !gift.sound_preset) {
      fail("Missing existing animation identity or sound preset on " + gift.code);
    }
  }
}

function main() {
  const artworkManifest = JSON.parse(fs.readFileSync(ARTWORK_MANIFEST, "utf8"));
  const catalogManifest = JSON.parse(fs.readFileSync(CATALOG_MANIFEST, "utf8"));
  const audit = JSON.parse(fs.readFileSync(AUDIT_REPORT, "utf8"));
  validateInputs(artworkManifest, catalogManifest, audit);

  const screenshotFiles = new Set(fs.readdirSync(SCREENSHOT_ROOT).filter(name => /^capture-\d{8}-\d{6}\.png$/i.test(name)));
  if (screenshotFiles.size !== artworkManifest.source_capture_count) {
    fail("assets/Gifts contains " + screenshotFiles.size + " screenshots; expected " + artworkManifest.source_capture_count + ".");
  }

  const bySlug = new Map();
  for (const artwork of artworkManifest.gifts) {
    if (!safeSlug(artwork.slug)) fail("Unsafe artwork slug: " + artwork.slug);
    if (bySlug.has(artwork.slug)) fail("Duplicate Artwork slug: " + artwork.slug);
    if (artwork.artwork !== artwork.slug + "/artwork.png") fail("Unexpected original artwork path for " + artwork.slug);
    const imagePath = assertSafeRelative(artwork.artwork, ARTWORK_ROOT, "Artwork path");
    const imageBuffer = fs.readFileSync(imagePath);
    if (imageBuffer.length < 24 || imageBuffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
      fail("Invalid original PNG: " + artwork.slug);
    }
    const width = imageBuffer.readUInt32BE(16), height = imageBuffer.readUInt32BE(20);
    if (width !== 256 || height !== 256) fail("Unexpected original artwork dimensions for " + artwork.slug);
    if (sha256(imageBuffer) !== artwork.sha256) fail("Original Artwork SHA-256 mismatch for " + artwork.slug);

    const captures = new Set([
      artwork.source_primary?.file,
      ...(artwork.duplicate_appearances || []).map(item => item.file)
    ].filter(Boolean));
    for (const capture of captures) {
      if (!/^capture-\d{8}-\d{6}\.png$/i.test(capture) || !screenshotFiles.has(capture)) {
        fail("Missing source screenshot reference for " + artwork.slug + ": " + capture);
      }
      if (!fs.existsSync(path.join(SCREENSHOT_ROOT, capture))) {
        fail("Source capture is missing from assets/Gifts: " + capture);
      }
    }
    bySlug.set(artwork.slug, { ...artwork, imagePath, imageBuffer, captures: [...captures].sort() });
  }

  const artworkRecords = [...bySlug.values()];
  const catalogRecords = catalogManifest.gifts;
  const { resolved } = resolveArtworkGroups(artworkRecords, catalogRecords, audit);
  const groupForGiftCode = new Map();
  const groupForArtworkSlug = new Map();
  const groups = [];
  for (const [catalogNameKey, group] of resolved) {
    const canonical = canonicalArtwork(group.artwork);
    const artworkGroup = [...group.artwork].sort((a, b) => a.slug.localeCompare(b.slug));
    const normalizedGroup = { ...group, canonical, artwork: artworkGroup, catalog_name_key: catalogNameKey };
    groups.push(normalizedGroup);
    for (const gift of group.gifts) groupForGiftCode.set(gift.code, normalizedGroup);
    for (const artwork of artworkGroup) groupForArtworkSlug.set(artwork.slug, normalizedGroup);
  }

  const giftsByCode = {};
  const artworkRows = [];
  const mappedGiftCodes = new Set();
  let generatedFiles = 0;
  let exactArtworkRecords = 0;
  let fuzzyArtworkRecords = 0;
  let variantArtworkRecords = 0;

  for (const artwork of artworkRecords) {
    const group = groupForArtworkSlug.get(artwork.slug);
    const gifts = group?.gifts || [];
    const isCanonical = Boolean(group && group.canonical.slug === artwork.slug);
    const reviewOnlyVariant = Boolean(group && !isCanonical);
    if (group?.method === "exact-title") exactArtworkRecords += 1;
    if (group?.method === "single-prefix-suggestion") fuzzyArtworkRecords += 1;
    if (reviewOnlyVariant) variantArtworkRecords += 1;

    const filePaths = [];
    const targets = gifts.length
      ? gifts.map(gift => ({ gift, filename: gift.code + ".svg" }))
      : [{ gift: null, filename: "animation.svg" }];
    for (const target of targets) {
      const filePath = path.join(OUTPUT_ROOT, artwork.slug, target.filename);
      const svg = createAnimationSvg(artwork, target.gift, artwork.imageBuffer);
      writeGenerated(filePath, svg);
      generatedFiles += 1;
      filePaths.push("/assets/gifts/animations/" + artwork.slug + "/" + target.filename);
    }

    artworkRows.push({
      slug: artwork.slug,
      source_title: artwork.name,
      title: isCanonical && gifts[0] ? gifts[0].name : artwork.name,
      original_artwork: "assets/Artwork/" + artwork.artwork,
      artwork_url: "/assets/Artwork/" + artwork.slug + "/artwork.png",
      artwork_sha256: artwork.sha256,
      source_capture: artwork.source_primary?.file || null,
      source_region: artwork.source_primary ? {
        row: artwork.source_primary.row, column: artwork.source_primary.column
      } : null,
      all_source_captures: artwork.captures,
      review_warnings: artwork.warnings || [],
      review_status: artwork.review_status || "needs-human-review",
      matched_catalog_codes: gifts.map(gift => gift.code),
      animation_urls: filePaths,
      match_method: group?.method || "no-title-match",
      variant_of: reviewOnlyVariant ? group.canonical.slug : null
    });
  }

  for (const group of groups) {
    const variantArtwork = group.artwork;
    const canonicalArtworkRecord = group.canonical;
    for (const gift of group.gifts) {
      const animationUrl = "/assets/gifts/animations/" + canonicalArtworkRecord.slug + "/" + gift.code + ".svg";
      const variantUrls = variantArtwork.map(artwork =>
        "/assets/gifts/animations/" + artwork.slug + "/" + gift.code + ".svg"
      );
      const record = {
        code: gift.code,
        name: gift.name,
        coin_price: gift.coin_price,
        active: gift.active === true,
        category: gift.category,
        emoji: gift.emoji,
        animation_key: gift.animation_key,
        animation_preset: gift.animation_preset,
        sound_preset: gift.sound_preset,
        animation_duration_ms: gift.animation_duration_ms,
        sort_order: gift.sort_order,
        original_image_url: gift.image_url,
        original_model_url: gift.model_url,
        artwork_slug: canonicalArtworkRecord.slug,
        artwork_url: "/assets/Artwork/" + canonicalArtworkRecord.slug + "/artwork.png",
        artwork_sha256: canonicalArtworkRecord.sha256,
        animation_url: animationUrl,
        animation_variant_urls: variantUrls,
        match_method: group.method,
        review_required: group.review_required === true ||
          variantArtwork.some(artwork => (artwork.warnings || []).length > 0) ||
          variantArtwork.some(artwork => artwork.review_status !== "machine-extracted-unreviewed"),
        source_captures: [...new Set(variantArtwork.flatMap(artwork => artwork.captures))].sort()
      };
      giftsByCode[gift.code] = record;
      mappedGiftCodes.add(gift.code);
    }
  }

  const expectedMappings = groups.reduce((total, group) => total + group.gifts.length, 0);
  if (mappedGiftCodes.size !== expectedMappings) fail("Some catalogue gift-code mappings were lost.");
  if (artworkRows.length !== 1509) fail("Not every original Artwork folder received an animation mapping.");
  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_artwork_manifest: "assets/Artwork/manifest.json",
    source_gift_screenshots: "assets/Gifts/",
    source_catalogue: "data/minglora-gift-catalog.json",
    artwork_count: artworkRows.length,
    source_capture_count: screenshotFiles.size,
    catalogue_record_count: catalogRecords.length,
    mapped_catalogue_record_count: mappedGiftCodes.size,
    unmatched_catalogue_record_count: catalogRecords.length - mappedGiftCodes.size,
    exact_title_artwork_count: exactArtworkRecords,
    strong_prefix_suggestion_artwork_count: fuzzyArtworkRecords,
    title_variant_artwork_count: variantArtworkRecords,
    generated_animation_file_count: generatedFiles,
    release_gate: {
      human_visual_review: "NOT_COMPLETED",
      artwork_rights_provenance: "NOT_CLEARED",
      production_activation: "BLOCKED_PENDING_REVIEW_AND_RIGHTS_CLEARANCE",
      note: "Animations preserve the exact original Artwork PNG bytes. They are generated for review and are not automatically approved for production or monetization."
    },
    gifts_by_code: giftsByCode,
    artworks: artworkRows
  };
  writeGenerated(OUTPUT_MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  process.stdout.write(
    "[gift-animations] " + (CHECK_ONLY ? "Verified " : "Generated ") +
    artworkRows.length + " original-artwork folders; " + generatedFiles +
    " individual animations; " + mappedGiftCodes.size + "/" + catalogRecords.length +
    " catalogue records mapped with names and Coin prices preserved.\n"
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(String(error?.stack || error) + "\n");
  process.exitCode = 1;
}
