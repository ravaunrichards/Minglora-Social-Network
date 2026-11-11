#!/usr/bin/env python3
"""Extract individually titled gift previews from assets/Gifts screenshots.

Original screenshots are read-only. Each unique gift is written as a transparent,
centered 256x256 PNG in assets/Artwork/<title>/<title>.png.
"""
from __future__ import annotations
import hashlib, json, re, statistics, unicodedata
from collections import defaultdict
from pathlib import Path
from PIL import Image, ImageFilter, ImageOps
import pytesseract
from pytesseract import Output

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "Gifts"
DEST = ROOT / "assets" / "Artwork"
COLS, ROWS, SIZE = 6, 4, 256
ICON_TOP, ICON_BOTTOM = 0.035, 0.665
LABEL_TOP, LABEL_BOTTOM = 0.665, 0.865

def safe_name(value):
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = re.sub(r"[^A-Za-z0-9 .&'()+,-]", "", value)
    return re.sub(r"\s+", " ", value).strip(" .-_")[:64] or "Unidentified Gift"

def clean_title(value):
    value = unicodedata.normalize("NFKC", value or "")
    value = re.sub(r"\s+", " ", value.replace("\n", " ").replace("\r", " ")).strip()
    value = re.sub(r"(?i)\s*(?:[0-9]+\s*)?(?:coin|coins)\s*$", "", value)
    value = re.sub(r"^[\W_]+|[\W_]+$", "", value)
    value = re.sub(r"\s+[0-9]+$", "", value).strip()
    if not re.search(r"[A-Za-z]", value) or re.fullmatch(r"(?i)(coin|coins|send|gift|popular|new|hot)", value):
        return ""
    return value[:64]

def read_title(image, x0, y0, x1, y1):
    w, h = x1-x0, y1-y0
    crop = image.crop((x0+int(w*.035), y0+int(h*LABEL_TOP), x1-int(w*.035), y0+int(h*LABEL_BOTTOM)))
    crop = crop.convert("L").resize((crop.width*4, crop.height*4), Image.Resampling.LANCZOS)
    crop = ImageOps.autocontrast(crop)
    data = pytesseract.image_to_data(crop, output_type=Output.DICT, config="--psm 7")
    words, confs = [], []
    for word, conf in zip(data.get("text", []), data.get("conf", [])):
        word = (word or "").strip()
        try: confidence = float(conf)
        except (TypeError, ValueError): confidence = -1
        if word and confidence >= 15:
            words.append(word); confs.append(confidence)
    title = clean_title(" ".join(words))
    return title, round(sum(confs)/len(confs), 1) if confs else 0.0

def background_color(image):
    rgb = image.convert("RGB"); w,h = rgb.size; points=[]
    for x in range(w):
        points.extend((rgb.getpixel((x,0)), rgb.getpixel((x,h-1))))
    for y in range(h):
        points.extend((rgb.getpixel((0,y)), rgb.getpixel((w-1,y))))
    return tuple(int(statistics.median(p[c] for p in points)) for c in range(3))

def isolate(crop):
    rgb = crop.convert("RGB"); bg = background_color(rgb)
    px = rgb.load(); w,h = rgb.size
    alpha = Image.new("L", (w,h), 0); ap=alpha.load(); visible=[]
    for y in range(h):
        for x in range(w):
            r,g,b=px[x,y]
            d=((r-bg[0])**2+(g-bg[1])**2+(b-bg[2])**2)**.5
            a=0 if d<=22 else 255 if d>=54 else int(255*(d-22)/32)
            ap[x,y]=a
            if a>24: visible.append((x,y))
    if len(visible)<70: return None
    left=max(0,min(p[0] for p in visible)-5); top=max(0,min(p[1] for p in visible)-5)
    right=min(w,max(p[0] for p in visible)+6); bottom=min(h,max(p[1] for p in visible)+6)
    if right-left<8 or bottom-top<8: return None
    rgba=rgb.convert("RGBA"); rgba.putalpha(alpha)
    return rgba.crop((left,top,right,bottom))

def ahash(image):
    base=Image.new("RGBA",image.size,(128,128,128,255)); base.alpha_composite(image.convert("RGBA"))
    pixels=list(ImageOps.grayscale(base).resize((8,8),Image.Resampling.LANCZOS).getdata())
    avg=sum(pixels)/64; result=0
    for i,p in enumerate(pixels):
        if p>=avg: result |= 1<<i
    return result

def render(icon):
    icon=icon.convert("RGBA")
    icon.thumbnail((SIZE-34,SIZE-34),Image.Resampling.LANCZOS)
    sharp=icon.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.2,percent=125,threshold=3)).convert("RGBA")
    sharp.putalpha(icon.getchannel("A"))
    canvas=Image.new("RGBA",(SIZE,SIZE),(0,0,0,0))
    canvas.alpha_composite(sharp,((SIZE-icon.width)//2,(SIZE-icon.height)//2))
    return canvas

def main():
    sources=sorted(SOURCE.glob("*.png"))
    DEST.mkdir(parents=True,exist_ok=True)
    seen=defaultdict(list); manifest=[]
    slots=empty=duplicates=unknown=0
    for source in sources:
        with Image.open(source) as raw:
            image=ImageOps.exif_transpose(raw).convert("RGB")
        width,height=image.size
        for row in range(ROWS):
            for col in range(COLS):
                slots+=1
                x0=round(col*width/COLS); x1=round((col+1)*width/COLS)
                y0=round(row*height/ROWS); y1=round((row+1)*height/ROWS)
                title,confidence=read_title(image,x0,y0,x1,y1)
                cw,ch=x1-x0,y1-y0
                crop=image.crop((x0+int(cw*.08),y0+int(ch*ICON_TOP),x1-int(cw*.08),y0+int(ch*ICON_BOTTOM)))
                icon=isolate(crop)
                if icon is None:
                    empty+=1
                    continue
                if not title:
                    match=re.search(r"(\d{6})\.png$",source.name)
                    stamp=match.group(1) if match else source.stem[-6:]
                    title=f"Unidentified Gift {stamp} R{row+1} C{col+1}"
                    unknown+=1
                artwork=render(icon); key=safe_name(title).casefold(); fingerprint=ahash(artwork)
                variant=1; duplicate=False
                for previous in seen[key]:
                    if (fingerprint ^ previous).bit_count()<=8:
                        duplicate=True; break
                    variant+=1
                if duplicate:
                    duplicates+=1
                    continue
                seen[key].append(fingerprint)
                display=safe_name(title) if variant==1 else f"{safe_name(title)} ({variant})"
                folder=DEST/display; folder.mkdir(parents=True,exist_ok=True)
                output=folder/f"{display}.png"
                if output.exists():
                    display=f"{display} - Extracted"
                    folder=DEST/display; folder.mkdir(parents=True,exist_ok=True)
                    output=folder/f"{display}.png"
                artwork.save(output,format="PNG",optimize=True)
                manifest.append({
                    "title":title,"folder":f"assets/Artwork/{display}/",
                    "file":f"assets/Artwork/{display}/{display}.png",
                    "width":SIZE,"height":SIZE,"format":"PNG","transparent_background":True,
                    "source_capture":f"assets/Gifts/{source.name}",
                    "source_capture_dimensions":{"width":width,"height":height},
                    "source_grid_position":{"row":row+1,"column":col+1},
                    "ocr_confidence":confidence,"needs_title_review":title.startswith("Unidentified Gift"),
                    "sha256":hashlib.sha256(output.read_bytes()).hexdigest()
                })
    manifest.sort(key=lambda x:(x["title"].casefold(),x["file"].casefold()))
    summary={
        "source_directory":"assets/Gifts/","output_directory":"assets/Artwork/",
        "source_screenshots":len(sources),"grid":{"columns":COLS,"rows":ROWS},
        "output_size":[SIZE,SIZE],"artwork_count":len(manifest),
        "duplicate_slots_removed":duplicates,"empty_slots_skipped":empty,
        "unidentified_titles":unknown,"artworks":manifest
    }
    (DEST/"manifest.json").write_text(json.dumps(summary,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    report=[
        "# Gift artwork extraction report","",
        f"- Source screenshots: **{len(sources)}**",
        f"- Gift slots inspected: **{slots}**",
        f"- Individual artworks written: **{len(manifest)}**",
        f"- Duplicate title/artwork entries removed: **{duplicates}**",
        f"- Empty slots skipped: **{empty}**",
        f"- Titles needing manual review: **{unknown}**",
        f"- Output: **transparent PNG, {SIZE} × {SIZE}px**","",
        "Each gift is stored in its own title-named folder. Original captures are unchanged.",
        "These are isolated raster previews extracted from the supplied screenshots, not recovered original TikTok vector or 3D source files.",
        "The manifest records title, source capture, grid position, OCR confidence, output path, and SHA-256 checksum.",""
    ]
    (DEST/"EXTRACTION_REPORT.md").write_text("\n".join(report),encoding="utf-8")
    print("\n".join(report))

if __name__=="__main__":
    main()
