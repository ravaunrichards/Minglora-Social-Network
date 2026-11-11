#!/usr/bin/env python3
"""Build read-only contact sheets for human review of Minglora gift PNG candidates."""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ARTWORK = ROOT / "assets" / "Artwork"
OUTPUT = ROOT / "reports" / "gift-artwork-contact-sheets"
MANIFEST = ARTWORK / "manifest.json"

COLUMNS = 8
ROWS = 8
PER_PAGE = COLUMNS * ROWS
CELL_W = 200
CELL_H = 200
HEADER_H = 56
PAGE_W = COLUMNS * CELL_W
PAGE_H = HEADER_H + ROWS * CELL_H
THUMB_SIZE = 124
BG = (18, 27, 49)
CELL_BG = (31, 43, 69)
BORDER = (68, 86, 120)
TEXT = (244, 247, 255)
MUTED = (180, 194, 218)


def font(size: int, bold: bool = False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    return ImageFont.load_default()


TITLE_FONT = font(23, True)
NAME_FONT = font(14, True)
META_FONT = font(10, False)


def safe_asset(relative: str) -> Path:
    base = ARTWORK.resolve()
    path = (ARTWORK / relative).resolve()
    if path == base or base not in path.parents:
        raise ValueError(f"Artwork reference escapes the review directory: {relative}")
    return path


def trim(value: str, limit: int) -> str:
    value = re.sub(r"\s+", " ", str(value)).strip()
    if len(value) <= limit:
        return value
    return value[: max(1, limit - 1)].rstrip() + "…"


def main() -> int:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    records = sorted(data.get("gifts", []), key=lambda item: (str(item.get("slug", "")), str(item.get("name", ""))))
    if not records:
        raise RuntimeError("No manifest artwork records found.")
    OUTPUT.mkdir(parents=True, exist_ok=True)

    page_count = math.ceil(len(records) / PER_PAGE)
    pages = []
    expected_files = set()

    for page_index in range(page_count):
        start = page_index * PER_PAGE
        group = records[start:start + PER_PAGE]
        page_no = page_index + 1
        filename = f"page-{page_no:03d}.jpg"
        page = Image.new("RGB", (PAGE_W, PAGE_H), BG)
        draw = ImageDraw.Draw(page)
        draw.text((24, 14), f"Minglora Gift Artwork Review — Page {page_no:03d}/{page_count:03d}", fill=TEXT, font=TITLE_FONT)
        draw.text((24, 39), f"Assets {start + 1}–{start + len(group)} of {len(records)} · review-only screenshot crops", fill=MUTED, font=META_FONT)

        for local_index, record in enumerate(group):
            row, col = divmod(local_index, COLUMNS)
            x = col * CELL_W
            y = HEADER_H + row * CELL_H
            box = (x + 6, y + 6, x + CELL_W - 6, y + CELL_H - 6)
            draw.rounded_rectangle(box, radius=12, fill=CELL_BG, outline=BORDER, width=1)

            image_path = safe_asset(str(record.get("artwork", "")))
            if not image_path.is_file():
                raise FileNotFoundError(f"Missing artwork referenced by manifest: {image_path}")
            with Image.open(image_path) as source:
                artwork = ImageOps.exif_transpose(source).convert("RGBA")
            artwork.thumbnail((THUMB_SIZE, THUMB_SIZE), Image.Resampling.LANCZOS)
            px = x + (CELL_W - artwork.width) // 2
            py = y + 12 + (THUMB_SIZE - artwork.height) // 2
            page_rgba = page.convert("RGBA")
            page_rgba.alpha_composite(artwork, (px, py))
            page = page_rgba.convert("RGB")
            draw = ImageDraw.Draw(page)

            name = trim(record.get("name", ""), 23)
            slug = trim(record.get("slug", ""), 28)
            source_info = record.get("source_primary") or {}
            source_file = str(source_info.get("file", ""))
            source_cell = f"r{source_info.get('row', '?')} c{source_info.get('column', '?')}"
            confidence = source_info.get("ocr_confidence", "?")
            y_name = y + 143
            draw.text((x + 12, y_name), name, fill=TEXT, font=NAME_FONT)
            draw.text((x + 12, y_name + 22), slug, fill=MUTED, font=META_FONT)
            draw.text((x + 12, y_name + 39), f"{source_file[-14:]} · {source_cell} · OCR {confidence}", fill=MUTED, font=META_FONT)
            expected_files.add(filename)

        out = OUTPUT / filename
        page.save(out, format="JPEG", quality=88, optimize=True, progressive=True)
        pages.append({
            "page": page_no,
            "file": filename,
            "first_record": start + 1,
            "last_record": start + len(group),
            "record_count": len(group),
            "slugs": [record.get("slug") for record in group],
        })

    # Remove only stale, generated contact-sheet pages from this dedicated output folder.
    for path in OUTPUT.glob("page-*.jpg"):
        if path.name not in expected_files:
            path.unlink()

    index = {
        "schema_version": 1,
        "source_manifest": "assets/Artwork/manifest.json",
        "record_count": len(records),
        "page_count": page_count,
        "columns": COLUMNS,
        "rows": ROWS,
        "records_per_page": PER_PAGE,
        "review_only": True,
        "human_review_completed": False,
        "pages": pages,
    }
    (OUTPUT / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    readme = [
        "# Minglora Gift Artwork Review Contact Sheets",
        "",
        f"- Extracted candidate records: **{len(records)}**",
        f"- Contact sheet pages: **{page_count}**",
        f"- Grid: **{COLUMNS} × {ROWS}** images per page",
        "- Purpose: human visual review only",
        "- Human review status: **NOT COMPLETED**",
        "- Rights/licence status: **NOT CLEARED**",
        "",
        "Open each page image and inspect the artwork, title, crop edges, transparency, image identity and possible duplicates. Use index.json to map page cells back to stable slugs and source screenshot coordinates.",
        "",
        "These images were extracted from screenshots. This review gallery does not establish ownership or permission and does not approve any artwork for production publication.",
        "",
        "## Pages",
        "",
    ]
    for item in pages:
        readme.append(f"- [Page {item['page']:03d} — records {item['first_record']}–{item['last_record']}](./{item['file']})")
    (OUTPUT / "README.md").write_text("\n".join(readme) + "\n", encoding="utf-8")
    print(f"CONTACT SHEETS PASS: {len(records)} artwork records across {page_count} pages; no source or artwork files changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
