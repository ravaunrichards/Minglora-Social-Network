#!/usr/bin/env python3
"""Extract separately titled gift preview artwork from assets/Gifts screenshots.

Source captures are read-only. Each distinct gift is written as a transparent,
centered 256x256 PNG at assets/Artwork/<title>/<title>.png.
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
OCR_SCALE = 2
ICON_TOP, ICON_BOTTOM = 0.035, 0.665
LABEL_TOP, LABEL_BOTTOM = 0.655, 0.87

def safe_name(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = re.sub(r"[^A-Za-z0-9 .&'()+,-]", "", value)
    return re.sub(r"\s+", " ", value).strip(" .-_")[:64] or "Unidentified Gift"

def clean_title(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "")
    value = re.sub(r"\s+", " ", value.replace("\n", " ").replace("\r", " ")).strip()
    value = re.sub(r"(?i)\s*(?:[0-9]+\s*)?(?:coin|coins)\s*$", "", value)
    value = re.sub(r"^[\W_]+|[\W_]+$", "", value)
    value = re.sub(r"\s+[0-9]+$", "", value).strip()
    if not re.search(r"[A-Za-z]", value) or re.fullmatch(r"(?i)(coin|coins|send|gift|popular|new|hot)", value):
        return ""
    return value[:64]

def read_titles(image: Image.Image) -> dict[tuple[int,int], tuple[str,float]]:
    width,height=image.size
    enlarged=ImageOps.autocontrast(image.convert("L").resize((width*OCR_SCALE,height*OCR_SCALE),Image.Resampling.LANCZOS))
    data=pytesseract.image_to_data(enlarged,output_type=Output.DICT,config="--psm 11")
    tokens=defaultdict(list)
    for i,word in enumerate(data.get("text",[])):
        word=(word or "").strip()
        try: confidence=float(data["conf"][i])
        except (TypeError,ValueError,KeyError): confidence=-1
        if not word or confidence<18: continue
        x=(float(data["left"][i])+float(data["width"][i])/2)/OCR_SCALE
        y=(float(data["top"][i])+float(data["height"][i])/2)/OCR_SCALE
        col=min(COLS-1,max(0,int(x/(width/COLS))))
        row=min(ROWS-1,max(0,int(y/(height/ROWS))))
        cell_top=row*height/ROWS
        relative_y=(y-cell_top)/(height/ROWS)
        if LABEL_TOP<=relative_y<=LABEL_BOTTOM:
            tokens[(row,col)].append((y,x,word,confidence))
    result={}
    for row in range(ROWS):
        for col in range(COLS):
            entries=sorted(tokens.get((row,col),[]),key=lambda t:(t[0],t[1]))
            raw=" ".join(t[2] for t in entries)
            title=clean_title(raw)
            confidence=round(sum(t[3] for t in entries)/len(entries),1) if entries else 0.0
            result[(row,col)]=(title,confidence)
    return result

def background_color(image: Image.Image) -> tuple[int,int,int]:
    rgb=image.convert("RGB"); w,h=rgb.size; points=[]
    for x in range(w):
        points.extend((rgb.getpixel((x,0)),rgb.getpixel((x,h-1))))
    for y in range(h):
        points.extend((rgb.getpixel((0,y)),rgb.getpixel((w-1,y))))
    return tuple(int(statistics.median(p[c] for p in points)) for c in range(3))

def isolate(crop: Image.Image) -> Image.Image | None:
    rgb=crop.convert("RGB"); bg=background_color(rgb)
    px=rgb.load(); w,h=rgb.size
    alpha=Image.new("L",(w,h),0); ap=alpha.load(); visible=[]
    for y in range(h):
        for x in range(w):
            r,g,b=px[x,y]
            distance=((r-bg[0])**2+(g-bg[1])**2+(b-bg[2])**2)**0.5
            a=0 if distance<=22 else 255 if distance>=54 else int(255*(distance-22)/32)
            ap[x,y]=a
            if a>24: visible.append((x,y))
    if len(visible)<70: return None
    left=max(0,min(p[0] for p in visible)-5); top=max(0,min(p[1] for p in visible)-5)
    right=min(w,max(p[0] for p in visible)+6); bottom=min(h,max(p[1] for p in visible)+6)
    if right-left<8 or bottom-top<8: return None
    rgba=rgb.convert("RGBA"); rgba.putalpha(alpha)
    return rgba.crop((left,top,right,bottom))

def average_hash(image: Image.Image) -> int:
    base=Image.new("RGBA",image.size,(128,128,128,255))
    base.alpha_composite(image.convert("RGBA"))
    pixels=list(ImageOps.grayscale(base).resize((8,8),Image.Resampling.LANCZOS).getdata())
    avg=sum(pixels)/64; value=0
    for i,pixel in enumerate(pixels):
        if pixel>=avg: value|=1<<i
    return value

def render(icon: Image.Image) -> Image.Image:
    icon=icon.convert("RGBA")
    icon.thumbnail((SIZE-34,SIZE-34),Image.Resampling.LANCZOS)
    sharpened=icon.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.2,percent=125,threshold=3)).convert("RGBA")
    sharpened.putalpha(icon.getchannel("A"))
    canvas=Image.new("RGBA",(SIZE,SIZE),(0,0,0,0))
    canvas.alpha_composite(sharpened,((SIZE-icon.width)//2,(SIZE-icon.height)//2))
    return canvas

def main() -> None:
    sources=sorted(SOURCE.glob("*.png"))
    DEST.mkdir(parents=True,exist_ok=True)
    seen=defaultdict(list); artworks=[]
    inspected=empty=duplicates=unidentified=0
    for source in sources:
        with Image.open(source) as raw:
            image=ImageOps.exif_transpose(raw).convert("RGB")
        width,height=image.size
        labels=read_titles(image)
        for row in range(ROWS):
            for col in range(COLS):
                inspected+=1
                title,confidence=labels[(row,col)]
                x0=round(col*width/COLS); x1=round((col+1)*width/COLS)
                y0=round(row*height/ROWS); y1=round((row+1)*height/ROWS)
                cell_w,cell_h=x1-x0,y1-y0
                icon_crop=image.crop((
                    x0+int(cell_w*.08),y0+int(cell_h*ICON_TOP),
                    x1-int(cell_w*.08),y0+int(cell_h*ICON_BOTTOM)
                ))
                icon=isolate(icon_crop)
                if icon is None:
                    empty+=1
                    continue
                if not title:
                    match=re.search(r"(\d{6})\.png$",source.name)
                    stamp=match.group(1) if match else source.stem[-6:]
                    title=f"Unidentified Gift {stamp} R{row+1} C{col+1}"
                    unidentified+=1
                artwork=render(icon)
                key=safe_name(title).casefold()
                fingerprint=average_hash(artwork)
                variant=1; duplicate=False
                for previous in seen[key]:
                    if (fingerprint^previous).bit_count()<=8:
                        duplicate=True
                        break
                    variant+=1
                if duplicate:
                    duplicates+=1
                    continue
                seen[key].append(fingerprint)
                display=safe_name(title) if variant==1 else f"{safe_name(title)} ({variant})"
                folder=DEST/display
                folder.mkdir(parents=True,exist_ok=True)
                output=folder/f"{display}.png"
                # Never overwrite any file that was present before this run.
                if output.exists():
                    display=f"{display} - Extracted"
                    folder=DEST/display
                    folder.mkdir(parents=True,exist_ok=True)
                    output=folder/f"{display}.png"
                artwork.save(output,format="PNG",optimize=True)
                artworks.append({
                    "title":title,"folder":f"assets/Artwork/{display}/",
                    "file":f"assets/Artwork/{display}/{display}.png",
                    "width":SIZE,"height":SIZE,"format":"PNG",
                    "transparent_background":True,
                    "source_capture":f"assets/Gifts/{source.name}",
                    "source_capture_dimensions":{"width":width,"height":height},
                    "source_grid_position":{"row":row+1,"column":col+1},
                    "ocr_confidence":confidence,
                    "needs_title_review":title.startswith("Unidentified Gift"),
                    "sha256":hashlib.sha256(output.read_bytes()).hexdigest()
                })
    artworks.sort(key=lambda item:(item["title"].casefold(),item["file"].casefold()))
    summary={
        "source_directory":"assets/Gifts/","output_directory":"assets/Artwork/",
        "source_screenshots":len(sources),"grid":{"columns":COLS,"rows":ROWS},
        "output_size":[SIZE,SIZE],"artwork_count":len(artworks),
        "duplicate_slots_removed":duplicates,"empty_slots_skipped":empty,
        "unidentified_titles":unidentified,"artworks":artworks
    }
    (DEST/"manifest.json").write_text(json.dumps(summary,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    report=[
        "# Gift artwork extraction report","",
        f"- Source screenshots: **{len(sources)}**",
        f"- Gift slots inspected: **{inspected}**",
        f"- Individual artworks written: **{len(artworks)}**",
        f"- Duplicate title/artwork entries removed: **{duplicates}**",
        f"- Empty slots skipped: **{empty}**",
        f"- Titles needing manual review: **{unidentified}**",
        f"- Output: **transparent PNG, {SIZE} × {SIZE}px**","",
        "Each gift is saved in its own title-named folder. Original captures remain unchanged.",
        "These are isolated raster artworks extracted from the supplied screenshots, not recovered original vector/3D source files.",
        "The manifest records title, source capture, grid position, OCR confidence, output path, and SHA-256 checksum.",""
    ]
    (DEST/"EXTRACTION_REPORT.md").write_text("\n".join(report),encoding="utf-8")
    print("\n".join(report))

if __name__=="__main__":
    main()
