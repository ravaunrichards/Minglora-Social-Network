#!/usr/bin/env python3
"""Extract one transparent PNG for each distinct gift in assets/Gifts/.

Uses the existing Minglora gift catalog as the authoritative title dictionary.
Source screenshots are read-only; output is isolated to assets/Artwork/.
"""
from __future__ import annotations
import difflib, hashlib, json, re, statistics, unicodedata
from collections import defaultdict
from pathlib import Path
from PIL import Image, ImageFilter, ImageOps
import pytesseract
from pytesseract import Output

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"assets"/"Gifts"
DEST=ROOT/"assets"/"Artwork"
CATALOG=ROOT/"data"/"minglora-gift-catalog.json"
COLS,ROWS,SIZE=6,4,256
OCR_SCALE=4
ICON_TOP,ICON_BOTTOM=0.035,0.655
LABEL_TOP,LABEL_BOTTOM=0.64,0.87
OCR_CONFIG="--oem 1 --psm 7 -c preserve_interword_spaces=1"

def normalize(value:str)->str:
    value=unicodedata.normalize("NFKD",value)
    value="".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+","",value.casefold())

def safe_name(value:str)->str:
    value=unicodedata.normalize("NFKD",value)
    value="".join(c for c in value if not unicodedata.combining(c))
    value=re.sub(r"[^A-Za-z0-9 .&'()+,-]","",value)
    return re.sub(r"\s+"," ",value).strip(" .-_")[:64] or "Unidentified Gift"

def clean_text(value:str)->str:
    value=unicodedata.normalize("NFKC",value or "")
    value=re.sub(r"\s+"," ",value.replace("\n"," ").replace("\r"," ")).strip()
    value=re.sub(r"(?i)\s*(?:[0-9]+\s*)?(?:coin|coins)\s*$","",value)
    value=re.sub(r"^[\W_]+|[\W_]+$","",value)
    value=re.sub(r"\s+[0-9]+$","",value).strip()
    return value[:80]

def load_catalog():
    if not CATALOG.exists():
        return [],{}
    data=json.loads(CATALOG.read_text(encoding="utf-8"))
    names=sorted({str(g.get("name","")).strip() for g in data.get("gifts",[]) if str(g.get("name","")).strip()})
    return names,{normalize(name):name for name in names}

def catalog_match(raw:str,names:list[str],exact:dict[str,str])->tuple[str,float]:
    key=normalize(raw)
    if not key:
        return "",0.0
    if key in exact:
        return exact[key],1.0
    if len(key)<4 or not names:
        return raw,0.0
    choices=[]
    for name in names:
        candidate=normalize(name)
        if not candidate:
            continue
        score=difflib.SequenceMatcher(None,key,candidate,autojunk=False).ratio()
        # Help truncated labels: "love you so mu..." can match "love you so much".
        if key in candidate or candidate in key:
            score=max(score,min(len(key),len(candidate))/max(len(key),len(candidate)))
        choices.append((score,name))
    choices.sort(reverse=True)
    best_score,best_name=choices[0]
    next_score=choices[1][0] if len(choices)>1 else 0.0
    if best_score>=0.82 and (best_score-next_score>=0.035 or best_score>=0.96):
        return best_name,best_score
    return raw,0.0

def ocr_title(image:Image.Image,x0:int,y0:int,x1:int,y1:int)->tuple[str,float,str]:
    cw,ch=x1-x0,y1-y0
    label=image.crop((
        x0+int(cw*0.02),y0+int(ch*LABEL_TOP),
        x1-int(cw*0.02),y0+int(ch*LABEL_BOTTOM)
    )).convert("L")
    label=label.resize((label.width*OCR_SCALE,label.height*OCR_SCALE),Image.Resampling.LANCZOS)
    label=ImageOps.autocontrast(label)
    # Gift-picker titles are white on navy; invert to dark text on a light field for OCR.
    label=ImageOps.invert(label)
    label=label.filter(ImageFilter.UnsharpMask(radius=1.0,percent=150,threshold=2))
    # Preserve antialiasing; Tesseract handles grayscale text better than hard thresholding here.
    data=pytesseract.image_to_data(label,output_type=Output.DICT,config=OCR_CONFIG)
    entries=[]
    for word,confidence in zip(data.get("text",[]),data.get("conf",[])):
        word=(word or "").strip()
        try: conf=float(confidence)
        except (TypeError,ValueError): conf=-1
        if word and conf>=8:
            entries.append((word,conf))
    raw=clean_text(" ".join(word for word,_ in entries))
    score=sum(conf for _,conf in entries)/len(entries) if entries else 0.0
    return raw,round(score,1),raw

def bg_color(image:Image.Image)->tuple[int,int,int]:
    rgb=image.convert("RGB");w,h=rgb.size;points=[]
    for x in range(w):
        points.extend((rgb.getpixel((x,0)),rgb.getpixel((x,h-1))))
    for y in range(h):
        points.extend((rgb.getpixel((0,y)),rgb.getpixel((w-1,y))))
    return tuple(int(statistics.median(p[c] for p in points)) for c in range(3))

def isolate_icon(crop:Image.Image)->Image.Image|None:
    rgb=crop.convert("RGB");bg=bg_color(rgb);pixels=rgb.load();w,h=rgb.size
    alpha=Image.new("L",(w,h),0);ap=alpha.load();visible=[]
    for y in range(h):
        for x in range(w):
            r,g,b=pixels[x,y]
            d=((r-bg[0])**2+(g-bg[1])**2+(b-bg[2])**2)**0.5
            a=0 if d<=22 else 255 if d>=54 else int(255*(d-22)/32)
            ap[x,y]=a
            if a>24:visible.append((x,y))
    if len(visible)<70:return None
    left=max(0,min(p[0] for p in visible)-5);top=max(0,min(p[1] for p in visible)-5)
    right=min(w,max(p[0] for p in visible)+6);bottom=min(h,max(p[1] for p in visible)+6)
    if right-left<8 or bottom-top<8:return None
    rgba=rgb.convert("RGBA");rgba.putalpha(alpha)
    return rgba.crop((left,top,right,bottom))

def image_hash(image:Image.Image)->int:
    base=Image.new("RGBA",image.size,(128,128,128,255));base.alpha_composite(image.convert("RGBA"))
    pixels=list(ImageOps.grayscale(base).resize((8,8),Image.Resampling.LANCZOS).getdata())
    avg=sum(pixels)/64;result=0
    for i,p in enumerate(pixels):
        if p>=avg:result|=1<<i
    return result

def render(icon:Image.Image)->Image.Image:
    icon=icon.convert("RGBA");icon.thumbnail((SIZE-34,SIZE-34),Image.Resampling.LANCZOS)
    sharp=icon.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.2,percent=125,threshold=3)).convert("RGBA")
    sharp.putalpha(icon.getchannel("A"))
    canvas=Image.new("RGBA",(SIZE,SIZE),(0,0,0,0))
    canvas.alpha_composite(sharp,((SIZE-icon.width)//2,(SIZE-icon.height)//2))
    return canvas

def main():
    sources=sorted(SOURCE.glob("*.png"))
    DEST.mkdir(parents=True,exist_ok=True)
    names,exact=load_catalog()
    seen=defaultdict(list);artworks=[]
    inspected=empty=duplicates=unidentified=matched=0
    debug=[]
    for source in sources:
        with Image.open(source) as raw:
            image=ImageOps.exif_transpose(raw).convert("RGB")
        width,height=image.size
        for row in range(ROWS):
            for col in range(COLS):
                inspected+=1
                x0=round(col*width/COLS);x1=round((col+1)*width/COLS)
                y0=round(row*height/ROWS);y1=round((row+1)*height/ROWS)
                raw_title,confidence,_=ocr_title(image,x0,y0,x1,y1)
                title,match_score=catalog_match(raw_title,names,exact)
                if match_score:
                    matched+=1
                cell_w,cell_h=x1-x0,y1-y0
                crop=image.crop((
                    x0+int(cell_w*.08),y0+int(cell_h*ICON_TOP),
                    x1-int(cell_w*.08),y0+int(cell_h*ICON_BOTTOM)
                ))
                icon=isolate_icon(crop)
                if icon is None:
                    empty+=1
                    continue
                if not title:
                    stamp=re.search(r"(\d{6})\.png$",source.name)
                    time_code=stamp.group(1) if stamp else source.stem[-6:]
                    title=f"Unidentified Gift {time_code} R{row+1} C{col+1}"
                    unidentified+=1
                artwork=render(icon);key=normalize(title);fingerprint=image_hash(artwork)
                variant=1;duplicate=False
                for previous in seen[key]:
                    if (fingerprint^previous).bit_count()<=8:
                        duplicate=True;break
                    variant+=1
                if duplicate:
                    duplicates+=1
                    continue
                seen[key].append(fingerprint)
                display=safe_name(title) if variant==1 else f"{safe_name(title)} ({variant})"
                folder=DEST/display;folder.mkdir(parents=True,exist_ok=True)
                output=folder/f"{display}.png"
                if output.exists():
                    display=f"{display} - Extracted"
                    folder=DEST/display;folder.mkdir(parents=True,exist_ok=True)
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
                    "ocr_title":raw_title,"ocr_confidence":confidence,
                    "catalog_match_score":round(match_score,3),
                    "needs_title_review":title.startswith("Unidentified Gift"),
                    "sha256":hashlib.sha256(output.read_bytes()).hexdigest()
                })
                if len(debug)<80 and raw_title:
                    debug.append({"capture":source.name,"row":row+1,"column":col+1,"ocr":raw_title,"title":title,"confidence":confidence,"catalog_match":round(match_score,3)})
    artworks.sort(key=lambda x:(x["title"].casefold(),x["file"].casefold()))
    summary={
        "source_directory":"assets/Gifts/","output_directory":"assets/Artwork/",
        "source_screenshots":len(sources),"gift_catalog_titles":len(names),
        "grid":{"columns":COLS,"rows":ROWS},"output_size":[SIZE,SIZE],
        "artwork_count":len(artworks),"catalog_title_matches":matched,
        "duplicate_slots_removed":duplicates,"empty_slots_skipped":empty,
        "unidentified_titles":unidentified,"debug_title_samples":debug,
        "artworks":artworks
    }
    (DEST/"manifest.json").write_text(json.dumps(summary,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    report=[
        "# Gift artwork extraction report","",
        f"- Source screenshots: **{len(sources)}**",
        f"- Gift slots inspected: **{inspected}**",
        f"- Official catalog titles available: **{len(names)}**",
        f"- Artworks written: **{len(artworks)}**",
        f"- Catalog title matches: **{matched}**",
        f"- Duplicate title/artwork entries removed: **{duplicates}**",
        f"- Empty slots skipped: **{empty}**",
        f"- Titles needing manual review: **{unidentified}**",
        f"- Output: **transparent PNG, {SIZE} × {SIZE}px**","",
        "Each gift is saved under its own title-named folder. Original captures are read-only.",
        "Images are isolated raster extractions from captured gift previews, not recovered original editable 3D/vector source models.",
        "The manifest records official/recognized title, source screenshot, grid position, OCR confidence, match score, output path, and checksum.",""
    ]
    (DEST/"EXTRACTION_REPORT.md").write_text("\n".join(report),encoding="utf-8")
    print("\n".join(report))
    print("OCR TITLE SAMPLES:")
    print(json.dumps(debug,ensure_ascii=False,indent=2))
    if unidentified/max(1,len(artworks))>0.20:
        raise SystemExit("Title-quality gate failed: more than 20% of extracted icons still need manual title review. Generated output was not committed.")

if __name__=="__main__":
    main()
