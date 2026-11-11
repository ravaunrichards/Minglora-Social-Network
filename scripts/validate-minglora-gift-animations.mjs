import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "assets", "animations", "gifts");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const REPORT_PATH = path.join(OUTPUT_DIR, "extraction-report.json");
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

  process.stdout.write(
    "[gift-animation-validation] Verified " + manifest.gifts.length +
    " self-contained animated SVGs, matching WebP posters, reduced-motion support, " +
    "and the visual-review gate (" + embeddedBytes + " embedded poster bytes).\\n"
  );
}

main().catch(error => {
  process.stderr.write(String(error?.stack || error) + "\\n");
  process.exitCode = 1;
});
