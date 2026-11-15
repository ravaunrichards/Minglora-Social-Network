#!/usr/bin/env python3
"""Conservatively remove solid-black outer margins from six Gifter range sheets."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "Gifters Badge Levels"
REPORT = ROOT / "reports" / "GIFTER_RANGE_SHEET_CROP_REPORT.md"
REVIEW = ROOT / "review-output"
FILES = [
    "LV.1 - LV.9.jpg", "LV.10 - LV.19.jpg", "LV.20 - LV.29.jpg",
    "LV.30 - LV.39.jpg", "LV.40 - LV.49.jpg", "LV.50+.jpg",
]
BLACK_MAX = 42
EDGE_DARK_RATIO = 0.992
MAX_EDGE_FRACTION = 0.12

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def find_content_box(rgb: Image.Image):
    arr = np.asarray(rgb.convert("RGB"), dtype=np.uint8)
    dark = np.max(arr, axis=2) <= BLACK_MAX
    height, width = dark.shape
    top, bottom, left, right = 0, height, 0, width
    removed = {"top": 0, "bottom": 0, "left": 0, "right": 0}
    while top < bottom - 32 and top / height < MAX_EDGE_FRACTION and float(dark[top, left:right].mean()) >= EDGE_DARK_RATIO:
        top += 1
        removed["top"] += 1
    while bottom > top + 32 and (height-bottom) / height < MAX_EDGE_FRACTION and float(dark[bottom-1, left:right].mean()) >= EDGE_DARK_RATIO:
        bottom -= 1
        removed["bottom"] += 1
    while left < right - 32 and left / width < MAX_EDGE_FRACTION and float(dark[top:bottom, left].mean()) >= EDGE_DARK_RATIO:
        left += 1
        removed["left"] += 1
    while right > left + 32 and (width-right) / width < MAX_EDGE_FRACTION and float(dark[top:bottom, right-1].mean()) >= EDGE_DARK_RATIO:
        right -= 1
        removed["right"] += 1
    if any(v / (height if k in ("top", "bottom") else width) > MAX_EDGE_FRACTION for k, v in removed.items()):
        raise RuntimeError(f"Detected margin exceeds safety cap: {removed}")
    if right-left < width*0.76 or bottom-top < height*0.76:
        raise RuntimeError(f"Crop would remove too much source artwork: {removed}")
    return (left, top, right, bottom), removed

def make_contact_sheet(entries, originals, cropped):
    REVIEW.mkdir(parents=True, exist_ok=True)
    cell_w, image_h, label_h = 620, 355, 42
    sheet = Image.new("RGB", (cell_w*3, (image_h+label_h)*2), "#f0f2f5")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 17)
        small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
    except OSError:
        font = small = ImageFont.load_default()
    for idx, entry in enumerate(entries):
        row, col = divmod(idx, 3)
        x, y = col*cell_w, row*(image_h+label_h)
        name = entry["file"]
        draw.text((x+12, y+5), name, fill="#182230", font=font)
        draw.text((x+12, y+26), "BEFORE", fill="#4b5563", font=small)
        draw.text((x+cell_w//2+12, y+26), "CROPPED", fill="#166534", font=small)
        for panel_x, img in ((x, originals[name]), (x+cell_w//2, cropped[name])):
            preview = img.copy()
            preview.thumbnail((cell_w//2-24, image_h-48), Image.Resampling.LANCZOS)
            px = panel_x+(cell_w//2-preview.width)//2
            py = y+label_h+(image_h-label_h-preview.height)//2
            sheet.paste(preview, (px, py))
        draw.line((x+cell_w//2, y+label_h, x+cell_w//2, y+image_h), fill="#c4cbd5", width=2)
    sheet.save(REVIEW/"gifter-range-sheets-before-after.jpg", quality=92, optimize=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write cropped JPGs and report")
    args = parser.parse_args()
    entries, originals, cropped = [], {}, {}
    for name in FILES:
        path = SOURCE/name
        if not path.is_file():
            raise FileNotFoundError(path)
        raw = path.read_bytes()
        with Image.open(path) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
        originals[name] = image.copy()
        box, removed = find_content_box(image)
        result = image.crop(box)
        changed = box != (0, 0, image.width, image.height)
        item = {
            "file": name, "before_size": list(image.size), "after_size": list(result.size),
            "crop_box": list(box), "removed_px": removed, "changed": changed,
            "sha256_before": sha256(raw), "sha256_after": None,
        }
        if changed and args.apply:
            import io
            buf = io.BytesIO()
            result.save(buf, format="JPEG", quality=95, optimize=True, progressive=True, subsampling=0)
            cooked = buf.getvalue()
            path.write_bytes(cooked)
            item["sha256_after"] = sha256(cooked)
        else:
            item["sha256_after"] = item["sha256_before"]
        entries.append(item)
        cropped[name] = result
    print(json.dumps(entries, indent=2))
    if args.apply:
        REVIEW.mkdir(parents=True, exist_ok=True)
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        lines = [
            "# Gifter Range-Sheet Crop Report", "",
            "Only the six original Gifter range-reference JPGs were processed to remove solid-black outer edge padding. The badges, lettering, level order, internal artwork, 11 detailed panels, master sheets, Rewards banner, progression logic, Coin thresholds, wallets and deleted Level-Up chart were not changed.", "",
            "| Source sheet | Before | After | Cropped pixels (L / T / R / B) |",
            "|---|---:|---:|---:|",
        ]
        for item in entries:
            m = item["removed_px"]
            lines.append(f'| {item["file"]} | {item["before_size"][0]}×{item["before_size"][1]} | {item["after_size"][0]}×{item["after_size"][1]} | {m["left"]} / {m["top"]} / {m["right"]} / {m["bottom"]} |')
        lines += ["", f"Detection rule: near-black pixels have every RGB channel ≤ {BLACK_MAX}; an outer row or column is removed only when at least {EDGE_DARK_RATIO:.1%} of its pixels meet that rule. A 12% per-edge cap and 76% minimum-content gate prevent aggressive crops.", "", "All six source sheets decoded successfully. Cropped JPGs were re-encoded at quality 95 with progressive encoding and 4:4:4 chroma sampling. The before/after contact sheet and detailed pixel/hash metrics are attached to the workflow review artifact.", ""]
        REPORT.write_text("\n".join(lines), encoding="utf-8")
        (REVIEW/"crop-metrics.json").write_text(json.dumps(entries, indent=2), encoding="utf-8")
        make_contact_sheet(entries, originals, cropped)

if __name__ == "__main__":
    main()
