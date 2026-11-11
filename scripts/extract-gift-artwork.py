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
    d = pytesseract.image_to_data(img, output_type=Output.DICT, config="--oem 3 --psm 11")
    w, h = img.size
    tokens = []
    for i, raw in enumerate(d["text"]):
        word = re.sub(r"\s+", " ", raw).strip(" -_|")
        try: conf = float(d["conf"][i])
        except Exception: continue
        if conf < 50 or not re.search(r"[A-Za-z]", word) or re.fullmatch(r"[\W\d_]+", word):
            continue
        left, top = int(d["left"][i]), int(d["top"][i])
        bw, bh = int(d["width"][i]), int(d["height"][i])
        if bw < 2 or bh < 2: continue
        cy = top + bh / 2
        if cy < h * .07 or cy > h * .92: continue
        col = min(COLS - 1, max(0, int((left + bw / 2) / (w / COLS))))
        letters = re.sub(r"[^A-Za-z0-9]", "", word)
        if len(letters) < 3 and word.lower() not in {"gg", "dj", "vs", "ok"}:
            continue
        tokens.append((cy, top, left, col, word, conf))
    tokens.sort(key=lambda x: x[0])
    groups = []
    for t in tokens:
        if not groups or t[0] - statistics.mean(v[0] for v in groups[-1]) > TOL:
            groups.append([t])
        else:
            groups[-1].append(t)
    result = []
    for group in groups:
        by_col = defaultdict(list)
        for t in group: by_col[t[3]].append(t)
        for col, words in by_col.items():
            words.sort(key=lambda x: x[2])
            name = re.sub(r"\s+", " ", " ".join(x[4] for x in words)).strip(" -_|")
            if len(re.sub(r"[^A-Za-z0-9]", "", name)) >= 3 or name.lower() in {"gg", "dj", "vs", "ok"}:
                result.append({"y": statistics.mean(x[0] for x in words),
                               "top": min(x[1] for x in words), "col": col,
                               "name": name[:70], "confidence": statistics.mean(x[5] for x in words)})
    # Resolve any OCR fragments competing for the same row/column.
    fixed = {}
    for item in result:
        key = (round(item["y"] / TOL), item["col"])
        if key not in fixed or item["confidence"] > fixed[key]["confidence"]:
            fixed[key] = item
    return sorted(fixed.values(), key=lambda x: (x["y"], x["col"]))

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
        if not labels: source_warnings[file.name] = ["no-gift-labels-detected"]
        ys = sorted(x["y"] for x in labels)
        centers = []
        for y in ys:
            if not centers or y-centers[-1] > TOL: centers.append(y)
            else: centers[-1] = (centers[-1]+y)/2
        pitch = statistics.median([b-a for a,b in zip(centers,centers[1:])]) if len(centers)>1 else img.height/3
        tile = img.width / COLS
        for item in labels:
            row = min(range(len(centers)), key=lambda i: abs(centers[i]-item["y"]))
            x0 = round(item["col"]*tile + tile*.10)
            x1 = round((item["col"]+1)*tile - tile*.10)
            y0 = max(0, round(item["top"] - pitch*.56))
            y1 = min(img.height, item["top"]-3)
            if y1 <= y0+8: continue
            art, area, warnings = transparent_icon(img.crop((x0,y0,x1,y1)))
            candidates.append({"name":item["name"], "slug":slug(item["name"]),
                "confidence":round(item["confidence"],1), "source":file.name,
                "row":row+1, "column":item["col"]+1, "art":art, "area":area, "warnings":warnings})
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
