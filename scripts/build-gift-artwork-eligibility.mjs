import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTWORK_SOURCE = path.join(ROOT, "assets/Artwork/manifest.json");
const CATALOG_SOURCE = path.join(ROOT, "data/minglora-gift-catalog.json");
const OUTPUT = path.join(ROOT, "assets/gift-assets/manifests/artwork-eligibility.json");
const GENERATOR = "Minglora source artwork display-eligibility audit";
const checkOnly = process.argv.includes("--check");

function fail(message) {
  throw new Error("[" + GENERATOR + "] " + message);
}
function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail("could not read " + label + ": " + String(error?.message || error));
  }
}
function build() {
  const source = readJson(ARTWORK_SOURCE, "the extracted artwork manifest");
  const catalog = readJson(CATALOG_SOURCE, "the canonical gift catalogue");
  if (!Array.isArray(source.gifts) || !source.gifts.length) fail("artwork manifest contains no records.");
  if (!Array.isArray(catalog.gifts) || catalog.gifts.length !== catalog.gift_count) fail("canonical catalogue count does not match its records.");

  const byName = new Map();
  for (const gift of catalog.gifts) {
    const key = normalize(gift.name);
    if (!key) continue;
    const rows = byName.get(key) || [];
    rows.push(gift);
    byName.set(key, rows);
  }

  const records = source.gifts.map(record => {
    const warnings = [...new Set(Array.isArray(record.warnings) ? record.warnings.map(String) : [])].sort();
    const cropBoundaryWarning = warnings.includes("foreground-near-crop-boundary");
    const truncatedTitle = warnings.includes("truncated-title");
    const lowOcrConfidence = warnings.includes("low-ocr-confidence");
    const variantWarning = warnings.includes("same-title-different-artwork-variant");
    const exactMatches = byName.get(normalize(record.name)) || [];
    const reasons = [];
    if (cropBoundaryWarning) reasons.push("SOURCE_FOREGROUND_REACHES_CROP_BOUNDARY_REVIEW_FOR_MISSING_EDGES");
    if (truncatedTitle) reasons.push("SOURCE_TITLE_TRUNCATED");
    if (lowOcrConfidence) reasons.push("SOURCE_TITLE_OCR_CONFIDENCE_LOW");
    if (variantWarning) reasons.push("SAME_TITLE_ARTWORK_VARIANT_REQUIRES_MANUAL_SELECTION");
    if (exactMatches.length !== 1) reasons.push(exactMatches.length === 0 ? "NO_EXACT_CANONICAL_CATALOGUE_NAME_MATCH" : "AMBIGUOUS_CANONICAL_CATALOGUE_MATCH");
    reasons.push("HUMAN_FULL_ARTWORK_REVIEW_NOT_COMPLETED");
    reasons.push("SOURCE_ARTWORK_RIGHTS_AND_PROVENANCE_NOT_VERIFIED");

    const rel = String(record.artwork || "");
    if (!rel || rel.startsWith("/") || rel.split(/[\\/]/).includes("..")) fail("unsafe artwork path for " + String(record.slug || "unnamed asset"));
    return {
      asset_id: String(record.slug || ""),
      name: String(record.name || ""),
      source_artwork_path: "assets/Artwork/" + rel.replace(/\\/g, "/"),
      source_screenshot: record.source_primary?.file || null,
      source_cell: record.source_primary ? {
        row: record.source_primary.row,
        column: record.source_primary.column
      } : null,
      source_sha256: String(record.sha256 || ""),
      source_dimensions: Array.isArray(record.dimensions) ? record.dimensions : null,
      source_warnings: warnings,
      source_crop_gate: cropBoundaryWarning ? "BLOCKED_POTENTIAL_CLIP" : "NO_EDGE_WARNING_NOT_PROOF_OF_COMPLETENESS",
      catalogue_match_count: exactMatches.length,
      catalogue_matches: exactMatches.map(gift => ({
        code: gift.code,
        name: gift.name,
        coin_price: gift.coin_price,
        active: gift.active === true
      })),
      human_visual_review: "NOT_COMPLETED",
      rights_status: "UNVERIFIED",
      production_eligible: false,
      decision: "BLOCKED_PENDING_FULL_VISUAL_AND_RIGHTS_REVIEW",
      reasons
    };
  });

  const counts = {
    source_artwork_count: records.length,
    possible_crop_boundary_count: records.filter(x => x.source_crop_gate === "BLOCKED_POTENTIAL_CLIP").length,
    no_crop_boundary_warning_count: records.filter(x => x.source_crop_gate === "NO_EDGE_WARNING_NOT_PROOF_OF_COMPLETENESS").length,
    exact_unique_catalogue_match_count: records.filter(x => x.catalogue_match_count === 1).length,
    unmatched_catalogue_count: records.filter(x => x.catalogue_match_count === 0).length,
    ambiguous_catalogue_match_count: records.filter(x => x.catalogue_match_count > 1).length,
    production_eligible_count: records.filter(x => x.production_eligible).length
  };
  return {
    schema_version: 1,
    generator: GENERATOR,
    generated_at: String(catalog.generated_at || "unspecified"),
    source_artwork_manifest: "assets/Artwork/manifest.json",
    canonical_catalogue: "data/minglora-gift-catalog.json",
    rule: "An extracted image is never approved merely because it exists or has no machine warning. Source-edge flags block it from display; all extracted images remain blocked until a human confirms the entire gift is visible and source rights are documented.",
    summary: counts,
    assets: records
  };
}
function main() {
  const payload = build();
  const serialized = JSON.stringify(payload, null, 2) + "\n";
  if (checkOnly) {
    if (!fs.existsSync(OUTPUT)) fail("eligibility manifest is missing; run npm run build:gift-artwork-eligibility.");
    if (fs.readFileSync(OUTPUT, "utf8") !== serialized) fail("eligibility manifest is stale; run npm run build:gift-artwork-eligibility.");
    process.stdout.write("[" + GENERATOR + "] verified " + payload.summary.source_artwork_count + " records; " + payload.summary.possible_crop_boundary_count + " potential crop-boundary blocks; 0 production-approved.\n");
    return;
  }
  if (fs.existsSync(OUTPUT)) {
    let prior;
    try { prior = JSON.parse(fs.readFileSync(OUTPUT, "utf8")); }
    catch { fail("refusing to replace a non-JSON file: " + OUTPUT); }
    if (prior.generator !== GENERATOR) fail("refusing to replace a file not owned by this generator.");
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  const temporary = OUTPUT + ".tmp-" + process.pid;
  fs.writeFileSync(temporary, serialized, { encoding: "utf8", flag: "w" });
  fs.renameSync(temporary, OUTPUT);
  process.stdout.write("[" + GENERATOR + "] generated " + payload.summary.source_artwork_count + " records; " + payload.summary.possible_crop_boundary_count + " potential crop-boundary blocks; 0 production-approved.\n");
}
main();
