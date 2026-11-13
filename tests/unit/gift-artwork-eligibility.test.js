import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const manifest = read("assets/gift-assets/manifests/artwork-eligibility.json");
const source = read("assets/Artwork/manifest.json");
const generator = path.join(root, "scripts/build-gift-artwork-eligibility.mjs");

test("every extracted gift artwork receives an explicit full-display decision", () => {
  assert.equal(manifest.summary.source_artwork_count, source.gifts.length);
  assert.equal(manifest.assets.length, source.gifts.length);
  assert.equal(manifest.summary.production_eligible_count, 0);

  for (const item of manifest.assets) {
    assert.ok(item.asset_id);
    assert.ok(item.source_artwork_path.startsWith("assets/Artwork/"));
    assert.match(item.source_sha256, /^[a-f0-9]{64}$/);
    assert.equal(item.human_visual_review, "NOT_COMPLETED");
    assert.equal(item.rights_status, "UNVERIFIED");
    assert.equal(item.production_eligible, false);
    assert.equal(item.decision, "BLOCKED_PENDING_FULL_VISUAL_AND_RIGHTS_REVIEW");
  }
});

test("artwork flagged at the original crop edge is blocked and never marked fully visible", () => {
  const edgeFlagged = manifest.assets.filter(item => item.source_warnings.includes("foreground-near-crop-boundary"));
  assert.equal(edgeFlagged.length, manifest.summary.possible_crop_boundary_count);
  assert.ok(edgeFlagged.length > 0);

  for (const item of edgeFlagged) {
    assert.equal(item.source_crop_gate, "BLOCKED_POTENTIAL_CLIP");
    assert.ok(item.reasons.includes("SOURCE_FOREGROUND_REACHES_CROP_BOUNDARY_REVIEW_FOR_MISSING_EDGES"));
    assert.equal(item.production_eligible, false);
  }
});

test("an artwork with no edge warning is only a candidate, not automatically approved", () => {
  const candidates = manifest.assets.filter(item => !item.source_warnings.includes("foreground-near-crop-boundary"));
  assert.equal(candidates.length, manifest.summary.no_crop_boundary_warning_count);
  assert.ok(candidates.length > 0);

  for (const item of candidates) {
    assert.equal(item.source_crop_gate, "NO_EDGE_WARNING_NOT_PROOF_OF_COMPLETENESS");
    assert.equal(item.human_visual_review, "NOT_COMPLETED");
    assert.equal(item.rights_status, "UNVERIFIED");
    assert.equal(item.production_eligible, false);
  }
});

test("unmatched and ambiguous screenshot labels are not attached to guessed catalogue gifts", () => {
  for (const item of manifest.assets) {
    if (item.catalogue_match_count !== 1) {
      assert.ok(item.catalogue_matches.length !== 1);
      assert.ok(item.reasons.includes(item.catalogue_match_count === 0
        ? "NO_EXACT_CANONICAL_CATALOGUE_NAME_MATCH"
        : "AMBIGUOUS_CANONICAL_CATALOGUE_MATCH"));
    }
  }
});

test("the eligibility register is deterministic and matches the read-only source manifests", () => {
  execFileSync(process.execPath, [generator, "--check"], { stdio: "pipe" });
});
