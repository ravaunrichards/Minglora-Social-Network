#!/usr/bin/env python3
"""Read-only integrity and review audit for extracted Minglora gift artwork."""
from __future__ import annotations

import difflib
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import imagehash
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "Gifts"
ARTWORK = ROOT / "assets" / "Artwork"
CATALOG = ROOT / "data" / "minglora-gift-catalog.json"
REPORT_DIR = ROOT / "reports"
REPORT_JSON = REPORT_DIR / "gift-artwork-audit.json"
REPORT_MD = REPORT_DIR / "gift-artwork-audit.md"
EXPECTED_CAPTURES = 131
EXPECTED_SIZE = (256, 256)


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def safe_artwork_path(relative: str) -> Path:
    base = ARTWORK.resolve()
    path = (ARTWORK / relative).resolve()
    if path == base or base not in path.parents:
        raise ValueError(f"Artwork path escapes the artwork directory: {relative}")
    return path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_image(path: Path) -> dict:
    with Image.open(path) as source:
        source.verify()
    with Image.open(path) as source:
        original_has_alpha = "A" in source.getbands() or "transparency" in source.info
        image = ImageOps.exif_transpose(source).convert("RGBA")
    width, height = image.size
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    visible_pixels = sum(histogram[17:])
    alpha_pixels = sum(histogram[1:])
    bbox_mask = alpha.point(lambda value: 255 if value > 16 else 0)
    bbox = bbox_mask.getbbox()
    if bbox:
        left, top, right, bottom = bbox
        margins = {
            "left": left,
            "top": top,
            "right": width - right,
            "bottom": height - bottom,
        }
        bbox_occupancy = ((right - left) * (bottom - top)) / max(1, width * height)
    else:
        margins = {"left": 0, "top": 0, "right": 0, "bottom": 0}
        bbox_occupancy = 0.0
    visible_ratio = visible_pixels / max(1, width * height)
    alpha_ratio = alpha_pixels / max(1, width * height)
    return {
        "dimensions": [width, height],
        "has_alpha": original_has_alpha,
        "visible_pixels": visible_pixels,
        "visible_ratio": round(visible_ratio, 5),
        "alpha_ratio": round(alpha_ratio, 5),
        "bbox_occupancy": round(bbox_occupancy, 5),
        "bbox_margins": margins,
        "empty": bbox is None or visible_pixels < 80,
        "small_subject": bbox is not None and bbox_occupancy < 0.012,
        "near_canvas_edge": any(value < 8 for value in margins.values()),
        "phash": str(imagehash.phash(composite_for_hash(image))),
    }


def composite_for_hash(image: Image.Image) -> Image.Image:
    background = Image.new("RGBA", image.size, (34, 42, 67, 255))
    return Image.alpha_composite(background, image).convert("RGB")


def main() -> int:
    manifest_path = ARTWORK / "manifest.json"
    review_path = ARTWORK / "review-needed.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    review_queue = json.loads(review_path.read_text(encoding="utf-8"))
    records = manifest.get("gifts", [])
    captures = sorted(
        path for path in SOURCE.glob("capture-*.png")
        if re.fullmatch(r"capture-\d{8}-\d{6}\.png", path.name, re.I)
    )

    integrity_errors: list[dict] = []
    quality_flags: Counter = Counter()
    hash_groups: dict[str, list[str]] = defaultdict(list)
    title_groups: dict[str, list[tuple[str, str]]] = defaultdict(list)
    inspected: dict[str, dict] = {}
    catalog = []
    if CATALOG.is_file():
        catalog = json.loads(CATALOG.read_text(encoding="utf-8")).get("gifts", [])
    catalog_names = sorted(
        {str(item.get("name", "")).strip() for item in catalog if item.get("name")}
    )
    exact_catalog_names = {normalize(name) for name in catalog_names}
    catalog_matches = Counter()
    suggestions = []

    for record in records:
        rel = str(record.get("artwork", ""))
        slug = str(record.get("slug", ""))
        name = str(record.get("name", ""))
        try:
            path = safe_artwork_path(rel)
        except Exception as exc:
            integrity_errors.append({"slug": slug, "error": str(exc)})
            continue
        if not path.is_file():
            integrity_errors.append({"slug": slug, "error": "missing-artwork-file", "path": rel})
            continue
        try:
            details = inspect_image(path)
            actual_hash = sha256_file(path)
        except Exception as exc:
            integrity_errors.append({"slug": slug, "error": "invalid-image", "detail": str(exc)})
            continue

        expected_hash = str(record.get("sha256", ""))
        if actual_hash != expected_hash:
            integrity_errors.append({
                "slug": slug,
                "error": "sha256-mismatch",
                "expected": expected_hash,
                "actual": actual_hash,
            })
        if tuple(details["dimensions"]) != EXPECTED_SIZE:
            quality_flags["wrong-dimensions"] += 1
        if not details["has_alpha"] or details["alpha_ratio"] >= 0.999:
            quality_flags["transparency-missing-or-ineffective"] += 1
        if details["empty"]:
            quality_flags["empty-or-near-empty"] += 1
        if details["small_subject"]:
            quality_flags["very-small-subject"] += 1
        if details["near_canvas_edge"]:
            quality_flags["content-near-final-canvas-edge"] += 1

        hash_groups[actual_hash].append(slug)
        base_slug = re.sub(r"-variant-\d+$", "", slug)
        title_groups[base_slug].append((slug, details["phash"]))
        inspected[slug] = details

        normalized_name = normalize(name)
        if normalized_name in exact_catalog_names:
            catalog_matches["exact"] += 1
        elif any(flag in record.get("warnings", []) for flag in ("truncated-title", "low-ocr-confidence")):
            likely = difflib.get_close_matches(name, catalog_names, n=3, cutoff=0.55)
            if likely:
                catalog_matches["fuzzy-suggestions"] += 1
                suggestions.append({"slug": slug, "ocr_name": name, "suggestions": likely})
            else:
                catalog_matches["no-suggestion"] += 1
        else:
            catalog_matches["no-exact-match"] += 1

    duplicate_hash_groups = [
        {"sha256": digest, "slugs": sorted(slugs)}
        for digest, slugs in hash_groups.items() if len(slugs) > 1
    ]
    variant_near_duplicates = []
    for base_slug, items in title_groups.items():
        if len(items) < 2:
            continue
        for index, (left_slug, left_hash) in enumerate(items):
            left_value = imagehash.hex_to_hash(left_hash)
            for right_slug, right_hash in items[index + 1:]:
                distance = int(left_value - imagehash.hex_to_hash(right_hash))
                if distance <= 5:
                    variant_near_duplicates.append({
                        "base_slug": base_slug,
                        "left": left_slug,
                        "right": right_slug,
                        "phash_distance": distance,
                        "action": "manual-visual-review-required; no files merged or removed",
                    })

    warning_counts = Counter()
    for item in review_queue:
        for warning in item.get("warnings", []):
            warning_counts[warning] += 1

    missing_review_records = sorted(
        set(item.get("slug", "") for item in review_queue)
        - set(record.get("slug", "") for record in records)
    )
    summary = {
        "status": "PASS_WITH_REVIEW_REQUIRED" if not integrity_errors else "FAIL",
        "scope": "Minglora screenshot-derived gift artwork extraction; read-only audit",
        "source_capture_count_expected": EXPECTED_CAPTURES,
        "source_capture_count_found": len(captures),
        "manifest_entries": len(records),
        "manifest_unique_artwork_count": manifest.get("unique_artwork_count"),
        "repeat_appearances_merged": manifest.get("repeat_appearances_merged"),
        "artwork_files_inspected": len(inspected),
        "missing_or_invalid_assets_and_hash_errors": len(integrity_errors),
        "integrity_errors": integrity_errors[:100],
        "exact_duplicate_file_hash_groups": duplicate_hash_groups,
        "quality_flag_counts": dict(sorted(quality_flags.items())),
        "existing_review_queue_count": len(review_queue),
        "existing_review_warning_counts": dict(sorted(warning_counts.items())),
        "review_queue_manifest_mismatches": missing_review_records,
        "same_title_near_duplicate_candidates": variant_near_duplicates,
        "catalog_name_match_counts": dict(catalog_matches),
        "catalog_name_suggestions_for_truncated_or_low_confidence": suggestions[:200],
        "human_visual_review": "NOT COMPLETED",
        "rights_and_license_review": "NOT COMPLETED",
        "production_use": "BLOCKED until original-artwork rights/provenance is documented and human review is complete",
        "source_capture_mutations": 0,
        "artwork_mutations": 0,
    }

    if len(captures) != EXPECTED_CAPTURES:
        integrity_errors.append({
            "error": "source-capture-count-mismatch",
            "expected": EXPECTED_CAPTURES,
            "found": len(captures),
        })
        summary["status"] = "FAIL"
        summary["missing_or_invalid_assets_and_hash_errors"] = len(integrity_errors)
        summary["integrity_errors"] = integrity_errors[:100]

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    md = [
        "# Minglora Gift Artwork — Read-only Quality Audit",
        "",
        f"- **Audit status:** {summary['status']}",
        f"- **Source captures:** {len(captures)} / {EXPECTED_CAPTURES}",
        f"- **Extracted artwork records:** {len(records)}",
        f"- **Artwork files inspected:** {len(inspected)}",
        f"- **Integrity errors:** {summary['missing_or_invalid_assets_and_hash_errors']}",
        f"- **Existing manual-review queue:** {len(review_queue)}",
        f"- **Same-title near-duplicate candidates:** {len(variant_near_duplicates)}",
        "- **Human visual review:** NOT COMPLETED",
        "- **Rights/licence review:** NOT COMPLETED",
        "- **Production status:** BLOCKED pending review and rights clearance",
        "",
        "## Quality flags",
        "",
    ]
    if quality_flags:
        md.extend(f"- {key}: {value}" for key, value in sorted(quality_flags.items()))
    else:
        md.append("- No automated image-integrity flags detected.")
    md.extend([
        "",
        "## Existing OCR/crop review flags",
        "",
    ])
    if warning_counts:
        md.extend(f"- {key}: {value}" for key, value in sorted(warning_counts.items()))
    else:
        md.append("- No existing warnings.")
    md.extend([
        "",
        "## Duplicate handling",
        "",
        f"- Exact duplicate SHA-256 groups: {len(duplicate_hash_groups)}",
        f"- Same-title near-duplicate candidates: {len(variant_near_duplicates)}",
        "- Similarity candidates are review suggestions only; no artwork was merged, overwritten, or deleted.",
        "",
        "## Integrity errors",
        "",
    ])
    if integrity_errors:
        md.extend(f"- {item.get('slug', item.get('error', 'unknown'))}: {item.get('error')}" for item in integrity_errors[:100])
    else:
        md.append("- None.")
    md.extend([
        "",
        "## Important restrictions",
        "",
        "The extracted PNGs are crops from catalogue screenshots. Their visual/source rights are not established by extraction. Keep them in the review-only workspace; do not present them as original Minglora artwork or activate them in a production gift catalogue until rights/provenance is documented or original replacement art is created.",
        "",
        "This audit is read-only. It does not edit source screenshots, extracted artwork, gift prices, active catalogue records, balances, transactions, or production settings.",
        "",
        "Machine checks do not replace individual human visual review.",
        "",
    ])
    REPORT_MD.write_text("\n".join(md), encoding="utf-8")
    print(
        f"Gift artwork audit: {summary['status']} | "
        f"{len(inspected)}/{len(records)} files inspected | "
        f"{len(integrity_errors)} integrity errors | "
        f"{len(review_queue)} assets still require manual review."
    )
    return 1 if integrity_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
