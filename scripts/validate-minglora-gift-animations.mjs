import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "assets", "animations", "gifts");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const REPORT_PATH = path.join(OUTPUT_DIR, "extraction-report.json");
const MOTION_INDEX_PATH = path.join(OUTPUT_DIR, "catalog-motion-index.json");
const PUBLIC_MOTION_INDEX_PATH = path.join(ROOT, "public", "assets", "animations", "gifts", "catalog-motion-index.json");
const CATALOG_PATH = path.join(ROOT, "data", "minglora-gift-catalog.json");
const fail = message => { throw new Error("[gift-animation-validation] " + message); };
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function safeAssetPath(relativePath, field, id) {
  if (typeof relativePath !== "string" || !relativePath.startsWith("assets/animations/gifts/")) {
    fail(id + " has an invalid " + field + " path.");
  }
  const absolute = path.resolve(ROOT, relativePath);
  const root = path.resolve(OUTPUT_DIR) + path.sep;
  if (!absolute.startsWith(root)) fail(id + " escapes the animation output directory.");
  return absolute;
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  if (!Array.isArray(manifest.gifts) || manifest.gifts.length < 1) fail("Manifest has no gift records.");
  if (manifest.unique_gift_count !== manifest.gifts.length) fail("Manifest gift count does not match its records.");

  const ids = new Set();
  let embeddedBytes = 0;
  for (const gift of manifest.gifts) {
    const id = String(gift?.id || "");
    if (!id || ids.has(id)) fail("Missing or duplicate gift ID: " + id);
    ids.add(id);

    const posterPath = safeAssetPath(gift.poster, "poster", id);
    const animationPath = safeAssetPath(gift.animation, "animation", id);
    const [poster, svg] = await Promise.all([
      fs.readFile(posterPath),
      fs.readFile(animationPath, "utf8")
    ]);

    if (poster.length < 16 || poster.toString("ascii", 0, 4) !== "RIFF" ||
        poster.toString("ascii", 8, 12) !== "WEBP") {
      fail(id + " poster is not a valid WebP file.");
    }
    if (gift.poster_sha256 && sha256(poster) !== gift.poster_sha256) {
      fail(id + " poster SHA-256 does not match the manifest.");
    }

    if (!svg.startsWith("<svg ") || !svg.trimEnd().endsWith("</svg>")) {
      fail(id + " animation is not a complete SVG document.");
    }
    if (!svg.includes("@keyframes gift") || !svg.includes("animation:gift")) {
      fail(id + " has no CSS motion profile.");
    }
    if (!svg.includes("@media(prefers-reduced-motion:reduce)") ||
        !svg.includes(".gift-motion{animation:none!important}")) {
      fail(id + " does not disable motion for reduced-motion users.");
    }
    if (/<script\b/i.test(svg) || /\bon[a-z]+\s*=/i.test(svg)) {
      fail(id + " contains script or inline event handlers.");
    }

    const imageMatch = svg.match(/<image\b[^>]*\bhref="data:image\/webp;base64,([A-Za-z0-9+/=]+)"/);
    if (!imageMatch) fail(id + " does not embed its poster as a WebP data URI.");
    const embedded = Buffer.from(imageMatch[1], "base64");
    if (!embedded.equals(poster)) fail(id + " embedded poster does not match poster.webp.");
    const hrefValues = [...svg.matchAll(/(?:xlink:)?href="([^"]+)"/g)].map(match => match[1]);
    if (hrefValues.length < 2 || hrefValues.some(value => !value.startsWith("data:image/webp;base64,"))) {
      fail(id + " has an external or missing SVG image reference.");
    }
    if (gift.animation_sha256 && sha256(svg) !== gift.animation_sha256) {
      fail(id + " animation SHA-256 does not match the manifest.");
    }
    if (gift.visual_review_status !== "needs_visual_review" || gift.original_3d_motion_available !== false) {
      fail(id + " unexpectedly bypasses the manual visual-review gate.");
    }
    embeddedBytes += embedded.length;
  }

  const report = JSON.parse(await fs.readFile(REPORT_PATH, "utf8"));
  if (report.unique_gifts !== manifest.gifts.length) fail("Extraction report and manifest totals differ.");
  if (report.screenshots_with_errors?.length) fail("Extraction report contains screenshot-processing errors.");
  if (report.zero_detection_screenshots?.length) fail("Extraction report contains screenshots with zero detections.");

  // The runtime index is a strict join to the original active catalogue.
  // It must never substitute extracted screenshot crops for production artwork.
  const motionIndex = JSON.parse(await fs.readFile(MOTION_INDEX_PATH, "utf8"));
  const publicMotionIndex = JSON.parse(await fs.readFile(PUBLIC_MOTION_INDEX_PATH, "utf8"));
  const canonicalCatalog = JSON.parse(await fs.readFile(CATALOG_PATH, "utf8"));
  if (JSON.stringify(publicMotionIndex) !== JSON.stringify(motionIndex)) fail("Served public motion index differs from the validated source index.");
  if (!Array.isArray(motionIndex.gifts)) fail("Canonical catalogue motion index has no gifts array.");
  if (report.catalog_motion_profiles !== motionIndex.gifts.length) fail("Motion index and extraction report totals differ.");
  if (report.catalog_motion_invalid_profiles?.length) fail("Some active catalogue gifts have invalid canonical fields.");
  if (report.catalog_motion_duplicate_codes?.length) fail("The generated catalogue motion index contains duplicate gift codes.");
  if (Number(report.catalog_motion_captured_profiles) + Number(report.catalog_motion_fallback_profiles) !== motionIndex.gifts.length) {
    fail("Captured and fallback motion profile totals do not cover the full catalogue index.");
  }
  const activeCatalog = (canonicalCatalog.gifts || []).filter(gift => gift.active !== false);
  if (motionIndex.gifts.length !== activeCatalog.length) fail("Motion index does not cover every active catalogue gift.");
  const catalogCodes = new Set();
  const motionByCode = new Map();
  for (const gift of motionIndex.gifts) {
    const code = String(gift?.code || "");
    if (!code || catalogCodes.has(code)) fail("Missing or duplicate canonical catalogue code in motion index: " + code);
    catalogCodes.add(code);
    motionByCode.set(code, gift);
    if (gift.active !== true) fail(code + " is not an active canonical gift.");
    if (!String(gift.name || "").trim()) fail(code + " has no canonical gift name.");
    if (!Number.isFinite(Number(gift.coin_price)) || Number(gift.coin_price) < 0) fail(code + " has an invalid canonical Coin price.");
    if (typeof gift.image_url !== "string" || !gift.image_url.startsWith("/assets/")) fail(code + " lost its original catalogue image URL.");
    if (typeof gift.model_url !== "string" || !gift.model_url.startsWith("/assets/")) fail(code + " lost its original 3D model URL.");
    if (typeof gift.original_animation_preset !== "string" || !gift.original_animation_preset) fail(code + " lost its original animation preset.");
    if (typeof gift.sound_preset !== "string" || !gift.sound_preset) fail(code + " lost its original sound preset.");
    if (typeof gift.motion_preset !== "string" || !gift.motion_preset) fail(code + " has no generated per-gift motion profile.");
    if (gift.source_kind === "captured-gallery-still") {
      if (!String(gift.source_image || "").startsWith("assets/Gifts/")) fail(code + " has no source Gifts capture reference.");
      if (!Array.isArray(gift.source_capture_references) || !gift.source_capture_references.length) fail(code + " lost its source capture references.");
    } else if (gift.source_kind === "canonical-catalogue-profile") {
      if (gift.source_image !== null || !Array.isArray(gift.source_capture_references) || gift.source_capture_references.length) fail(code + " has invalid catalogue-only fallback source references.");
    } else {
      fail(code + " has an unsupported motion profile source.");
    }
    if (gift.artwork_reference && !String(gift.artwork_reference.path || "").startsWith("assets/Artwork/")) fail(code + " has an unsafe Artwork manifest reference.");
  }
  for (const canonical of activeCatalog) {
    const code = String(canonical.code || "");
    const mapped = motionByCode.get(code);
    if (!mapped) fail("Active catalogue gift has no animation mapping: " + code);
    if (mapped.name !== canonical.name || Number(mapped.coin_price) !== Number(canonical.coin_price) ||
        mapped.image_url !== canonical.image_url || mapped.model_url !== canonical.model_url ||
        mapped.sound_preset !== canonical.sound_preset || mapped.original_animation_preset !== canonical.animation_preset) {
      fail(code + " does not preserve the canonical gift name, Coin price, original image, 3D model, sound or animation metadata.");
    }
  }

  process.stdout.write(
    "[gift-animation-validation] Verified " + manifest.gifts.length +
    " self-contained animated SVGs, matching WebP posters, reduced-motion support, " +
    "the visual-review gate (" + embeddedBytes + " embedded poster bytes), and " +
    motionIndex.gifts.length + " canonical active catalogue motion mappings (" +
    report.catalog_motion_captured_profiles + " capture-matched, " +
    report.catalog_motion_fallback_profiles + " catalogue-profile fallbacks).\\n"
  );
}

main().catch(error => {
  process.stderr.write(String(error?.stack || error) + "\\n");
  process.exitCode = 1;
});
