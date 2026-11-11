#!/usr/bin/env python3
"""Extract labelled gift icons from read-only Minglora catalogue screenshots."""
import argparse, csv, hashlib, json, re, statistics
from collections import defaultdict
from pathlib import Path
import imagehash
import numpy as np
import pytesseract
from PIL import Image, ImageFilter, ImageOps
from pytesseract import Output

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "Gifts"
OUT = ROOT / "assets" / "Artwork"
COLS, SIZE, TOL = 6, 256, 14
CAPTURE = re.compile(r"^capture-\d{8}-\d{6}\.png$", re.I)

def slug(text):
    text = text.lower().replace("&", " and ").replace("’", "'")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:58] or "unlabelled-gift"

def labels_for(img):
    """Read gift titles only from the expected label band of each six-column row."""
    d = pytesseract.image_to_data(img, output_type=Output.DICT, config="--oem 3 --psm 11")
    width, height = img.size
    tile_width = width / COLS
    row_count = max(1, min(6, round(height / (tile_width * 1.15))))
    pitch = height / row_count
    groups = defaultdict(list)

    for i, raw in enumerate(d["text"]):
        word = re.sub(r"\s+", " ", raw).strip(" -_|")
        try:
            confidence = float(d["conf"][i])
        except Exception:
            continue
        if confidence < 50 or not re.search(r"[A-Za-z]", word) or re.fullmatch(r"[\W\d_]+", word):
            continue
        compact = re.sub(r"[^A-Za-z0-9]", "", word)
        if len(compact) < 3 and word.lower() not in {"gg", "dj", "vs", "ok"}:
            continue
        if re.match(r"^\d", word) and not re.match(r"^\d+(st|nd|rd|th)$", word.lower()):
            continue
        left, top = int(d["left"][i]), int(d["top"][i])
        box_w, box_h = int(d["width"][i]), int(d["height"][i])
        if box_w < 2 or box_h < 2:
            continue
        center_x = left + box_w / 2
        center_y = top + box_h / 2
        row = int(round((center_y - pitch * 0.68) / pitch))
        if row < 0 or row >= row_count:
            continue
        expected_y = row * pitch + pitch * 0.68
        if abs(center_y - expected_y) > max(10, pitch * 0.15):
            continue
        column = min(COLS - 1, max(0, int(center_x / tile_width)))
        groups[(row, column)].append((left, top, word, confidence))

    result = []
    for (row, column), words in sorted(groups.items()):
        words.sort(key=lambda item: item[0])
        name = re.sub(r"\s+", " ", " ".join(item[2] for item in words)).strip(" -_|")
        compact = re.sub(r"[^A-Za-z0-9]", "", name)
        if len(compact) < 3 and name.lower() not in {"gg", "dj", "vs", "ok"}:
            continue
        digits = sum(ch.isdigit() for ch in name)
        if digits and digits / max(1, len(compact)) > 0.25:
            continue
        result.append({
            "row": row, "row_top": round(row * pitch), "pitch": pitch,
            "top": min(item[1] for item in words), "col": column,
            "name": name[:70], "confidence": statistics.mean(item[3] for item in words),
        })
    return result
def transparent_icon(crop):
    rgb = np.asarray(crop.convert("RGB"), dtype=np.int16)
    h, w, _ = rgb.shape
    patch = max(3, min(8, h // 8, w // 8))
    corners = np.concatenate([rgb[:patch,:patch].reshape(-1,3),
                              rgb[:patch,-patch:].reshape(-1,3),
                              rgb[-patch:,:patch].reshape(-1,3),
                              rgb[-patch:,-patch:].reshape(-1,3)])
    bg = np.median(corners, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    alpha = np.clip((dist - 19) * 8, 0, 255).astype(np.uint8)
    alpha_img = Image.fromarray(alpha).filter(ImageFilter.MaxFilter(3))
    a = np.asarray(alpha_img)
    yy, xx = np.where(a > 20)
    if not len(xx):
        return Image.new("RGBA", (SIZE,SIZE)), 0, ["no-foreground-found"]
    x0, x1 = max(0, int(xx.min())-3), min(w, int(xx.max())+4)
    y0, y1 = max(0, int(yy.min())-3), min(h, int(yy.max())+4)
    warnings = []
    if x0 <= 1 or y0 <= 1 or x1 >= w-1 or y1 >= h-1:
        warnings.append("foreground-near-crop-boundary")
    if x1-x0 < 10 or y1-y0 < 10:
        warnings.append("foreground-unusually-small")
    rgba = Image.fromarray(np.dstack([rgb.astype(np.uint8), a]), "RGBA").crop((x0,y0,x1,y1))
    max_side = int(SIZE * .68)
    scale = min(max_side / max(rgba.size), 1.0)
    rgba = rgba.resize((max(1,round(rgba.width*scale)), max(1,round(rgba.height*scale))), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (SIZE,SIZE), (0,0,0,0))
    out.alpha_composite(rgba, ((SIZE-rgba.width)//2,(SIZE-rgba.height)//2))
    return out, (x1-x0)*(y1-y0), warnings

def write_new(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() == data: return
        raise RuntimeError("Refusing to overwrite existing artwork: " + str(path))
    path.write_bytes(data)

def run(source, output, expected):
    files = sorted(p for p in source.glob("capture-*.png") if CAPTURE.match(p.name))
    if expected is not None and len(files) != expected:
        raise RuntimeError(f"Expected {expected} source captures; found {len(files)}. Refusing partial run.")
    if not files: raise RuntimeError("No source capture screenshots found.")
    candidates, source_warnings = [], {}
    for ix, file in enumerate(files, 1):
        with Image.open(file) as im: img = ImageOps.exif_transpose(im).convert("RGB")
        labels = labels_for(img)
        if not labels:
            source_warnings[file.name] = ["no-gift-labels-detected"]
        tile = img.width / COLS
        for item in labels:
            x0 = round(item["col"] * tile + tile * .10)
            x1 = round((item["col"] + 1) * tile - tile * .10)
            # Keep the current row's icon only: start below the preceding row's
            # price line and stop immediately above this gift's own name.
            y0 = max(0, round(item["row_top"] + item["pitch"] * .06))
            y1 = min(img.height, item["top"] - 4)
            if y1 <= y0 + 8:
                source_warnings.setdefault(file.name, []).append("invalid-cell-crop:" + item["name"])
                continue
            art, area, warnings = transparent_icon(img.crop((x0, y0, x1, y1)))
            if "..." in item["name"] or "…" in item["name"]:
                warnings.append("truncated-title")
            candidates.append({"name":item["name"], "slug":slug(item["name"]),
                "confidence":round(item["confidence"],1), "source":file.name,
                "row":item["row"]+1, "column":item["col"]+1, "art":art,
                "area":area, "warnings":warnings})
        print(f"[{ix}/{len(files)}] {file.name}: {len(labels)} label cells")
    if not candidates: raise RuntimeError("No artwork candidates extracted.")
    grouped = defaultdict(list)
    for item in candidates: grouped[item["slug"]].append(item)
    manifest, review, written = [], [], 0
    for key, items in sorted(grouped.items()):
        variants = []
        for item in sorted(items, key=lambda x:(x["confidence"],x["area"]), reverse=True):
            for variant in variants:
                if int(imagehash.phash(item["art"]) - imagehash.phash(variant[0]["art"])) <= 7:
                    variant.append(item); break
            else: variants.append([item])
        for vi, variant in enumerate(variants, 1):
            best = max(variant, key=lambda x:(x["confidence"],x["area"]))
            name = key if vi == 1 else f"{key}-variant-{vi}"
            from io import BytesIO
            buf = BytesIO(); best["art"].save(buf, format="PNG", optimize=True)
            data = buf.getvalue()
            rel = Path(name) / "artwork.png"
            write_new(output / rel, data); written += 1
            warnings = sorted({w for x in variant for w in x["warnings"]})
            if vi > 1: warnings.append("same-title-different-artwork-variant")
            if best["confidence"] < 55: warnings.append("low-ocr-confidence")
            record = {"name":best["name"],"slug":name,"artwork":str(rel).replace("\\\\","/"),
                "format":"png","dimensions":[SIZE,SIZE],"sha256":hashlib.sha256(data).hexdigest(),
                "source_primary":{"file":best["source"],"row":best["row"],"column":best["column"],
                                  "ocr_confidence":best["confidence"]},
                "duplicate_appearances":[{"file":x["source"],"row":x["row"],"column":x["column"],
                                           "ocr_confidence":x["confidence"]} for x in variant],
                "warnings":warnings,"review_status":"needs-human-review" if warnings else "machine-extracted-unreviewed"}
            manifest.append(record)
            if warnings: review.append(record)
    output.mkdir(parents=True, exist_ok=True)
    summary = {"schema_version":1,"source_directory":"assets/Gifts","source_capture_count":len(files),
        "detected_label_count":len(candidates),"unique_artwork_count":written,
        "repeat_appearances_merged":len(candidates)-written,"artwork_directory":"assets/Artwork",
        "human_review_completed":False,"gifts":manifest,"source_warnings":source_warnings}
    write_new(output/"manifest.json", (json.dumps(summary,indent=2,ensure_ascii=False)+"\n").encode())
    write_new(output/"review-needed.json", (json.dumps(review,indent=2,ensure_ascii=False)+"\n").encode())
    readme = ("# Minglora gift artwork extraction\n\n"
      f"- Source captures: **{len(files)}**\n- Labelled cells: **{len(candidates)}**\n"
      f"- Individual artwork files: **{written}**\n- Repeat appearances merged: **{len(candidates)-written}**\n"
      f"- Items flagged for review: **{len(review)}**\n- Human visual review: **NOT COMPLETED**\n\n"
      "Original captures are read-only. OCR names and transparent crops require visual review before production use.\n")
    write_new(output/"README.md", readme.encode())
    print(f"EXTRACTION COMPLETE: {len(files)} captures; {len(candidates)} labels; {written} artwork files; {len(review)} flagged.")
    return written

def self_test():
    a = np.zeros((90,90,3),dtype=np.uint8); a[:]=(23,43,82); a[25:65,30:60]=(235,70,125)
    result, area, _ = transparent_icon(Image.fromarray(a,"RGB"))
    assert result.mode=="RGBA" and result.size==(SIZE,SIZE) and area>500
    assert result.getchannel("A").getbbox() is not None
    print("SELF-TEST PASS: transparent foreground extraction and 256x256 output.")

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--self-test",action="store_true")
    p.add_argument("--expected-captures",type=int,default=None)
    p.add_argument("--source-dir",type=Path,default=SRC)
    p.add_argument("--output-dir",type=Path,default=OUT)
    a=p.parse_args()
    if a.self_test: self_test()
    else: run(a.source_dir.resolve(),a.output_dir.resolve(),a.expected_captures)

if __name__=="__main__": main()
