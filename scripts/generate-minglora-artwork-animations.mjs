import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const ARTWORK_ROOT = path.join(ROOT, "assets", "Artwork");
const SCREENSHOT_ROOT = path.join(ROOT, "assets", "Gifts");
const ARTWORK_MANIFEST_PATH = path.join(ARTWORK_ROOT, "manifest.json");
const CATALOG_PATH = path.join(ROOT, "data", "minglora-gift-catalog.json");
const AUDIT_PATH = path.join(ROOT, "reports", "gift-artwork-audit.json");
const OUTPUT_MANIFEST_PATH = path.join(ARTWORK_ROOT, "animation-manifest.json");
const REVIEW_QUEUE_PATH = path.join(ARTWORK_ROOT, "animation-price-review-queue.json");
const IS_CHECK = process.argv.includes("--check");

const PRESET_MOTION = {
  "petal-bloom": "sway", "heart-pulse": "pulse", "creature-entrance": "bounce",
  "horizon-sweep": "glide", "soundwave-ripple": "rhythm", "power-impact": "impact",
  "delight-pop": "pop", "glam-spin": "spin", "royal-shimmer": "shimmer",
  "celebration-burst": "burst", "cosmic-orbit": "orbit", "nature-rise": "float",
  "pixel-burst": "pixel", "warm-wave": "wave", "spark-float": "float", "gift-reveal": "reveal"
};
const CATEGORY_PRESETS = {
  flowers:["sway",2400], hearts:["pulse",1350], animals:["bounce",1600],
  vehicles:["glide",1800], music:["rhythm",1450], sports:["impact",1350],
  food_drink:["pop",1550], fashion_beauty:["spin",2050], luxury:["shimmer",2300],
  celebrations:["burst",1500], fantasy:["orbit",2200], nature:["float",2350],
  travel:["glide",2000], games:["pixel",1300], community:["wave",1800],
  symbols:["spin",1900], seasonal:["shimmer",2200], jamaican_culture:["wave",1800],
  reactions:["pop",1200], everyday:["reveal",1700], other:["reveal",1700]
};

const xml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;"
})[ch]);
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const normalize = value => String(value || "").normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[‘’“”"']/g, "")
  .replace(/[.…]/g, "")
  .toLowerCase().replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const slugHash = value => crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 8);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function assert(ok, message) { if (!ok) throw new Error("[Artwork Animation] " + message); }

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({length:Math.min(limit,items.length)}, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function numericToken(token) {
  const m = String(token || "").replace(/[’']/g, "").match(/^(\d{1,7}(?:,\d{3})*)(?:[^a-z0-9]*)$/i);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function ocrScreenshot(file) {
  const absolute = path.join(SCREENSHOT_ROOT, file);
  const meta = await sharp(absolute).metadata();
  assert(meta.width && meta.height, "Screenshot has unreadable dimensions: " + file);
  const targetWidth = Math.min(2400, meta.width * 2);
  const scale = targetWidth / meta.width;
  const tileWidth = meta.width / 6;
  const rowCount = Math.max(1, Math.min(6, Math.round(meta.height / (tileWidth * 1.15))));
  const temp = path.join(os.tmpdir(), "minglora-artwork-" + crypto.randomBytes(6).toString("hex") + ".png");
  try {
    await sharp(absolute).resize({width:targetWidth}).png().toFile(temp);
    const {stdout} = await execFileAsync("tesseract", [temp,"stdout","-l","eng","--psm","11","tsv"], {maxBuffer:32*1024*1024});
    const cells = new Map();
    for (const line of stdout.split(/\r?\n/).slice(1)) {
      const c = line.split("\t");
      if (c.length < 12 || c[0] !== "5") continue;
      const word = String(c[11] || "").trim(), conf = Number(c[10]);
      if (!word || !Number.isFinite(conf) || conf < 5) continue;
      const left=Number(c[6])/scale, top=Number(c[7])/scale;
      const width=Number(c[8])/scale, height=Number(c[9])/scale;
      const cx=left+width/2, cy=top+height/2;
      const col=clamp(Math.floor(cx/tileWidth)+1,1,6);
      const row=clamp(Math.floor(cy/(meta.height/rowCount))+1,1,rowCount);
      const key=row+":"+col;
      if (!cells.has(key)) cells.set(key,[]);
      cells.get(key).push({word,conf,left,top,width,height,cx,cy,lineKey:[c[2],c[3],c[4],c[5]].join(".")});
    }

    const result = new Map();
    for (const [key, words] of cells) {
      const lines = new Map();
      for (const w of words) {
        if (!lines.has(w.lineKey)) lines.set(w.lineKey,[]);
        lines.get(w.lineKey).push(w);
      }
      const lineData = [...lines.values()].map(items => {
        const sorted=[...items].sort((a,b)=>a.left-b.left);
        return {
          words:sorted,
          text:sorted.map(x=>x.word).join(" ").replace(/\s+/g," ").trim(),
          y:sorted.reduce((s,x)=>s+x.cy,0)/sorted.length,
          confidence:sorted.reduce((s,x)=>s+x.conf,0)/sorted.length
        };
      }).sort((a,b)=>a.y-b.y);

      const rowNum=Number(key.split(":")[0]);
      const cellTop=(rowNum-1)*meta.height/3;
      const cellHeight=meta.height/rowCount;
      const numericLines=lineData.map(line => ({
        ...line,
        nums:line.words.map(w=>({value:numericToken(w.word),word:w}))
          .filter(x=>x.value!==null)
      })).filter(line=>line.nums.length && line.y>=cellTop+cellHeight*.54);

      let price=null, priceConfidence=null, priceText="";
      if (numericLines.length) {
        const bottom=numericLines[numericLines.length-1];
        const nums=bottom.nums;
        let joined=nums.map(x=>String(x.value)).join("");
        if (nums.length>1) {
          const aligned=nums.every(x=>Math.abs(x.word.cy-nums[0].word.cy)<5);
          const close=nums.slice(1).every((x,i)=>x.word.left-(nums[i].word.left+nums[i].word.width)<18);
          if (!aligned || !close) joined=String([...nums].sort((a,b)=>b.word.cy-a.word.cy)[0].value);
        }
        const parsed=Number(joined);
        if (Number.isSafeInteger(parsed) && parsed>0 && parsed<=100000000) {
          price=parsed;
          priceConfidence=bottom.confidence;
          priceText=bottom.text;
        } else {
          const best=[...nums].sort((a,b)=>b.word.cy-a.word.cy || b.word.conf-a.word.conf)[0];
          price=best?.value ?? null;
          priceConfidence=best?.word.conf ?? null;
          priceText=bottom.text;
        }
      }

      const bottomY=numericLines[numericLines.length-1]?.y ?? Infinity;
      const titleText=lineData.filter(line=>line.y<bottomY-2).slice(-2).map(line=>line.text).join(" ").trim();
      result.set(key,{price,price_confidence:priceConfidence,price_ocr_text:priceText,title_ocr_text:titleText,cell_ocr_text:lineData.map(x=>x.text).join(" | ")});
    }
    return {file,width:meta.width,height:meta.height,cells:result};
  } finally {
    await fs.rm(temp,{force:true}).catch(()=>{});
  }
}

function catalogProjection(g) {
  return {
    code:g.code,name:g.name,category:g.category,emoji:g.emoji||null,
    coin_price:Number(g.coin_price),active:g.active!==false,
    sort_order:Number(g.sort_order??0),animation_key:g.animation_key||null,
    animation_preset:g.animation_preset||null,
    animation_duration_ms:Number(g.animation_duration_ms||0),
    sound_preset:g.sound_preset||null,image_url:g.image_url||null,
    model_url:g.model_url||null,asset_version:g.asset_version||null,
    source_label:g.source_label||null
  };
}

function categoryFor(art, exact, candidates) {
  const exactCats=[...new Set(exact.map(x=>x.category).filter(Boolean))];
  if (exactCats.length===1) return exactCats[0];
  const candidateCats=[...new Set(candidates.map(x=>x.category).filter(Boolean))];
  if (!exactCats.length && candidateCats.length===1) return candidateCats[0];
  const n=normalize(art.name+" "+art.slug);
  const rules=[
    ["jamaican_culture",/jamaica|jamaican|reggae|dancehall|rast|parish|kingston|caribbean/],
    ["flowers",/flower|rose|tulip|lily|orchid|blossom|bloom|hibiscus|petal|sakura/],
    ["hearts",/heart|love|kiss|romance|cupid|valentine|hug/],
    ["animals",/animal|cat|kitten|dog|puppy|lion|tiger|bear|panda|rabbit|bunny|fox|wolf|horse|unicorn|dragon|whale|dolphin|shark|fish|eagle|falcon|parrot|bird|butterfly|bee|frog|turtle|paw|giraffe|elephant/],
    ["vehicles",/car|truck|bus|motorcycle|bike|bicycle|helicopter|train|plane|jet|rocket|boat|ship|yacht/],
    ["sports",/baseball|basketball|football|soccer|volleyball|tennis|cricket|boxing|golf|sport|trophy|champion|medal|goal/],
    ["music",/music|guitar|drum|piano|keyboard|microphone|mic|headphone|speaker|melody|beat|dj|concert/],
    ["food_drink",/cake|cupcake|ice cream|coffee|tea|juice|pizza|burger|cherry|mango|watermelon|candy|chili|pepper|food|drink|fruit|bread|sushi/],
    ["fashion_beauty",/perfume|makeup|fashion|dress|shoe|handbag|lipstick|beauty|crown|jewelry|ring|necklace|glasses|hat/],
    ["luxury",/diamond|crystal|gem|gold|money|cash|luxury|royal|rich|treasure|palace/],
    ["celebrations",/firework|confetti|balloon|party|celebration|birthday|congratulation|cheers|festival|anniversary/],
    ["fantasy",/galaxy|universe|space|nebula|alien|magic|wizard|phoenix|pegasus|zeus|cosmic|fairy|mythic|star|lightning/],
    ["nature",/tree|forest|garden|island|ocean|sea|sunset|sunrise|rainbow|sun|moon|cloud|rain|snow|mountain/],
    ["travel",/travel|globe|world|passport|suitcase|landmark|paris|egypt|morocco|country|flag|city/],
    ["games",/game|gaming|controller|arcade|dice|chess|puzzle/],
    ["community",/community|friend|handshake|team|support|clap|applause/],
    ["symbols",/coin|symbol|badge|medal|logo|sign/]
  ];
  for (const [category,pattern] of rules) if (pattern.test(n)) return category;
  return exactCats[0] || candidateCats[0] || "other";
}

function buildIndexes(catalog,audit) {
  const byName=new Map();
  for(const gift of catalog.gifts||[]){
    const key=normalize(gift.name);
    if(!byName.has(key))byName.set(key,[]);
    byName.get(key).push(gift);
  }
  for(const list of byName.values())list.sort((a,b)=>
    Number(a.coin_price)-Number(b.coin_price)||Number(a.sort_order||0)-Number(b.sort_order||0));
  return {
    byName,
    suggestions:new Map((audit.catalog_name_suggestions_for_truncated_or_low_confidence||[])
      .map(item=>[item.slug,item.suggestions||[]])),
    gifts:catalog.gifts||[]
  };
}

function candidateCatalogRows(art,indexes) {
  const found=new Map();
  const add=(gift,reason)=>{
    if(gift?.code&&!found.has(gift.code))found.set(gift.code,{...catalogProjection(gift),match_reason:reason});
  };
  for(const name of indexes.suggestions.get(art.slug)||[]){
    for(const gift of indexes.byName.get(normalize(name))||[])add(gift,"artwork-audit-suggestion");
  }
  const sourceName=normalize(art.name);
  if(sourceName.length>=5){
    for(const gift of indexes.gifts){
      const candidateName=normalize(gift.name);
      if(candidateName.startsWith(sourceName+" ")||sourceName.startsWith(candidateName+" "))
        add(gift,"shared-title-prefix-review");
    }
  }
  return [...found.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.coin_price-b.coin_price);
}

function priceVariants(observations) {
  const grouped=new Map();
  for(const item of observations){
    if(!Number.isSafeInteger(item.coin_price)||item.coin_price<=0)continue;
    if(!grouped.has(item.coin_price))grouped.set(item.coin_price,[]);
    grouped.get(item.coin_price).push(item);
  }
  return [...grouped.entries()].sort((a,b)=>a[0]-b[0]).map(([coin_price,sources])=>({
    coin_price,occurrence_count:sources.length,sources
  }));
}

function priceStatus(variants,exactMatches) {
  const sourcePrices=variants.map(item=>item.coin_price);
  const catalogPrices=[...new Set(exactMatches.map(item=>item.coin_price))];
  if(sourcePrices.length&&catalogPrices.length)
    return sourcePrices.every(price=>catalogPrices.includes(price))
      ?"screenshot-and-catalogue-agree":"screenshot-catalogue-conflict-review-required";
  if(sourcePrices.length)return "screenshot-price-captured-catalogue-name-unmatched";
  if(catalogPrices.length)return "catalogue-price-available-screenshot-ocr-unresolved";
  return "coin-price-unresolved";
}

function chooseMotion(category,exactMatches) {
  const presets=[...new Set(exactMatches.map(x=>x.animation_preset).filter(Boolean))];
  const preset=presets.length===1?presets[0]:"";
  const motion=PRESET_MOTION[preset]||CATEGORY_PRESETS[category]?.[0]||"reveal";
  const durations=exactMatches.map(x=>x.animation_duration_ms)
    .filter(n=>Number.isFinite(n)&&n>=700);
  const duration=durations.length
    ?Math.round(durations.reduce((s,n)=>s+n,0)/durations.length)
    :(CATEGORY_PRESETS[category]?.[1]||1700);
  return {preset:preset||"category-"+category,motion,duration_ms:clamp(duration,900,4000)};
}

function makeSvg(art,pngBase64,title,category,motion,duration,phase,observedPrices,exactMatches,candidates) {
  const priceText=observedPrices.length
    ?"Screenshot-observed: "+observedPrices.map(x=>x.coin_price.toLocaleString("en-US")+" Coins").join(", ")+"."
    :"No readable Coin price was recovered from the referenced screenshot cells.";
  const catalogText=exactMatches.length
    ?"Exact catalogue records: "+exactMatches.map(x=>x.name+" — "+x.coin_price.toLocaleString("en-US")+" Coins").join("; ")+"."
    :candidates.length
      ?"Possible catalogue records requiring confirmation: "+candidates.map(x=>x.name+" — "+x.coin_price.toLocaleString("en-US")+" Coins").join("; ")+"."
      :"No exact catalogue title match was found; review the original screenshot.";
  const desc=xml(title+" individual Minglora gift animation. "+priceText+" "+catalogText+" Original PNG artwork is embedded unchanged.");
  const meta=xml(JSON.stringify({
    slug:art.slug,title,category,source_artwork:"artwork.png",
    source_sha256:art.sha256,
    screenshot_coin_prices:observedPrices.map(x=>x.coin_price),
    catalogue_codes:exactMatches.map(x=>x.code),
    suggested_catalogue_codes:candidates.map(x=>x.code)
  }));
  const glow=(category==="luxury"||category==="fashion_beauty")?"#ffd77a":
    (category==="hearts"||category==="flowers")?"#ff9cc5":
    (category==="fantasy"||category==="symbols")?"#9ce8ff":"#b6c5ff";
  const uri="data:image/png;base64,"+pngBase64;
  const safeTitle=xml(title);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 256 256" role="img" aria-labelledby="gift-title gift-desc" data-gift-slug="'+xml(art.slug)+'" data-gift-category="'+xml(category)+'" data-motion="'+xml(motion)+'">',
    '<title id="gift-title">'+safeTitle+' — Minglora Animated Gift</title>',
    '<desc id="gift-desc">'+desc+'</desc>',
    '<metadata>'+meta+'</metadata>',
    '<defs><filter id="gift-shadow" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur"/><feOffset dy="3" result="offset"/><feComponentTransfer><feFuncA type="linear" slope=".24"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
    '<radialGradient id="gift-aura"><stop offset="0" stop-color="'+glow+'" stop-opacity=".24"/><stop offset="1" stop-color="'+glow+'" stop-opacity="0"/></radialGradient></defs>',
    '<circle class="gift-aura" cx="128" cy="128" r="116" fill="url(#gift-aura)"/><ellipse cx="128" cy="229" rx="55" ry="8" fill="#7184b5" opacity=".18"/>',
    '<g class="gift-motion" style="transform-origin:128px 128px;animation:gift-'+motion+' '+duration+'ms cubic-bezier(.42,0,.2,1) infinite;animation-delay:'+phase+'ms"><image href="'+uri+'" xlink:href="'+uri+'" x="8" y="8" width="240" height="240" preserveAspectRatio="xMidYMid meet" filter="url(#gift-shadow)"/></g>',
    '<g class="gift-sparkles" fill="'+glow+'" opacity=".0"><circle cx="35" cy="67" r="3"/><circle cx="218" cy="55" r="2.5"/><circle cx="220" cy="187" r="3"/><circle cx="42" cy="194" r="2"/></g>',
    '<style>.gift-motion{will-change:transform;transform-box:fill-box}.gift-aura{transform-origin:128px 128px;animation:gift-aura-pulse '+Math.max(1600,duration)+'ms ease-in-out infinite}.gift-sparkles{animation:gift-sparkle '+Math.max(1800,duration+300)+'ms ease-in-out infinite}',
    '@keyframes gift-sway{0%,100%{transform:rotate(-5deg) translateY(2px) scale(.97)}50%{transform:rotate(5deg) translateY(-8px) scale(1.035)}}',
    '@keyframes gift-pulse{0%,100%{transform:scale(.91)}42%{transform:scale(1.075)}72%{transform:scale(.98)}}',
    '@keyframes gift-bounce{0%,100%{transform:translateY(3px) scale(.98)}36%{transform:translateY(-17px) scale(1.035)}55%{transform:translateY(1px) scale(.96)}}',
    '@keyframes gift-glide{0%,100%{transform:translateX(-7px) rotate(-2deg)}50%{transform:translateX(7px) rotate(2deg)}}',
    '@keyframes gift-rhythm{0%,100%{transform:translateY(2px) rotate(-2deg) scale(.98)}25%{transform:translateY(-6px) rotate(2deg) scale(1.035)}50%{transform:translateY(0) rotate(-1deg) scale(.99)}75%{transform:translateY(-4px) rotate(1deg) scale(1.02)}}',
    '@keyframes gift-impact{0%,100%{transform:scale(.94) rotate(-2deg)}34%{transform:scale(1.07) rotate(2deg)}55%{transform:scale(.985) rotate(-1deg)}}',
    '@keyframes gift-pop{0%,100%{transform:scale(.94) translateY(3px)}35%{transform:scale(1.08) translateY(-8px)}66%{transform:scale(.99) translateY(0)}}',
    '@keyframes gift-spin{0%,100%{transform:rotate(-3deg) scale(.97)}50%{transform:rotate(3deg) scale(1.045)}}',
    '@keyframes gift-shimmer{0%,100%{transform:rotate(-1.5deg) scale(.98);filter:brightness(1)}50%{transform:rotate(1.5deg) scale(1.04);filter:brightness(1.23)}}',
    '@keyframes gift-burst{0%,100%{transform:scale(.92) rotate(-3deg)}30%{transform:scale(1.08) rotate(3deg)}65%{transform:scale(1) rotate(-1deg)}}',
    '@keyframes gift-orbit{0%,100%{transform:rotate(-5deg) translateY(2px)}50%{transform:rotate(5deg) translateY(-7px)}}',
    '@keyframes gift-pixel{0%,100%{transform:translateY(3px) scale(.96);filter:drop-shadow(0 0 0 '+glow+')}50%{transform:translateY(-5px) scale(1.04);filter:drop-shadow(0 0 7px '+glow+')}}',
    '@keyframes gift-wave{0%,100%{transform:translateX(-3px) rotate(-2deg)}50%{transform:translateX(4px) rotate(2deg)}}',
    '@keyframes gift-reveal{0%,100%{transform:translateY(4px) scale(.965)}50%{transform:translateY(-7px) scale(1.035)}}',
    '@keyframes gift-aura-pulse{0%,100%{opacity:.45;transform:scale(.94)}50%{opacity:1;transform:scale(1.06)}}@keyframes gift-sparkle{0%,100%{opacity:.08}50%{opacity:.72}}',
    '@media(prefers-reduced-motion:reduce){.gift-motion,.gift-aura,.gift-sparkles{animation:none!important}.gift-motion{transform:none!important;will-change:auto}}</style>',
    '</svg>'
  ].join("\n");
}

async function loadInputs() {
  const [artworkManifest,catalog,audit]=await Promise.all([
    fs.readFile(ARTWORK_MANIFEST_PATH,"utf8").then(JSON.parse),
    fs.readFile(CATALOG_PATH,"utf8").then(JSON.parse),
    fs.readFile(AUDIT_PATH,"utf8").then(JSON.parse)
  ]);
  assert(Array.isArray(artworkManifest.gifts)&&artworkManifest.gifts.length>0,"Artwork manifest is empty.");
  assert(Array.isArray(catalog.gifts)&&catalog.gifts.length>0,"Gift catalogue is empty.");
  assert(artworkManifest.unique_artwork_count===artworkManifest.gifts.length,"Artwork manifest count mismatch.");
  assert(artworkManifest.source_capture_count===131,"Expected 131 gift screenshots.");
  const captureFiles=(await fs.readdir(SCREENSHOT_ROOT)).filter(f=>/\.(png|jpe?g|webp)$/i.test(f)).sort();
  assert(captureFiles.length===artworkManifest.source_capture_count,
    "Expected "+artworkManifest.source_capture_count+" screenshots, found "+captureFiles.length+".");
  return {artworkManifest,catalog,audit,captureFiles};
}

async function main() {
  const {artworkManifest,catalog,audit,captureFiles}=await loadInputs();
  const captureSet=new Set(captureFiles);
  const requiredCaptures=new Set();
  for(const art of artworkManifest.gifts){
    const appearances=art.duplicate_appearances?.length?art.duplicate_appearances:(art.source_primary?[art.source_primary]:[]);
    for(const a of appearances)if(a.file)requiredCaptures.add(a.file);
  }
  const missing=[...requiredCaptures].filter(f=>!captureSet.has(f));
  assert(!missing.length,"Artwork manifest references missing source captures: "+missing.slice(0,10).join(", "));

  const screenshots=await mapLimit(captureFiles,3,ocrScreenshot);
  const ocrByFile=new Map(screenshots.map(item=>[item.file,item]));
  const indexes=buildIndexes(catalog,audit);
  let exactCount=0,candidateCount=0,unmatchedCount=0,appearanceCount=0,pricedCount=0,unresolvedCount=0,conflictCount=0,verifiedPngCount=0;
  const reviewQueue=[];
  const records=[];

  for(const art of artworkManifest.gifts){
    assert(/^[a-z0-9][a-z0-9-]{0,100}$/.test(art.slug),"Unsafe Artwork slug: "+art.slug);
    const relativeArtwork=String(art.artwork||"");
    assert(relativeArtwork===art.slug+"/artwork.png","Unexpected original artwork path: "+art.slug);
    const png=await fs.readFile(path.join(ARTWORK_ROOT,relativeArtwork));
    const actualHash=sha256(png);
    assert(actualHash===art.sha256,"Original artwork hash mismatch; refusing to animate "+art.slug);
    verifiedPngCount++;

    const exact=(indexes.byName.get(normalize(art.name))||[]).map(catalogProjection);
    const candidates=candidateCatalogRows(art,indexes);
    const title=exact.length?exact[0].name:String(art.name||art.slug).replace(/^[‘’"' ]+/,"").trim();
    const category=categoryFor(art,exact,candidates);
    const motion=chooseMotion(category,exact);

    const appearances=art.duplicate_appearances?.length?art.duplicate_appearances:(art.source_primary?[art.source_primary]:[]);
    const observations=[];
    for(const appearance of appearances){
      appearanceCount++;
      const screenshot=ocrByFile.get(appearance.file);
      const cell=screenshot?.cells.get(Number(appearance.row)+":"+Number(appearance.column));
      if(Number.isSafeInteger(cell?.price)&&cell.price>0){
        pricedCount++;
        observations.push({
          coin_price:cell.price,
          ocr_confidence:Number(Number(cell.price_confidence||0).toFixed(1)),
          ocr_text:cell.price_ocr_text,
          screenshot_title_text:cell.title_ocr_text,
          screenshot:appearance.file,row:appearance.row,column:appearance.column
        });
      }else{
        unresolvedCount++;
        reviewQueue.push({
          artwork_slug:art.slug,artwork_title:title,
          screenshot:appearance.file,row:appearance.row,column:appearance.column,
          reason:"coin-price-not-detected-by-ocr",
          catalogue_prices:exact.map(x=>x.coin_price),
          cell_ocr_text:cell?.cell_ocr_text||""
        });
      }
    }

    const grouped=priceVariants(observations);
    const status=priceStatus(grouped,exact);
    if(status==="screenshot-catalogue-conflict-review-required")conflictCount++;
    if(exact.length)exactCount++;else if(candidates.length)candidateCount++;else unmatchedCount++;

    const duration=motion.duration_ms;
    const seed=parseInt(slugHash(art.slug).slice(0,7),16);
    const phase=-(seed%duration);
    const svg=makeSvg(art,png.toString("base64"),title,category,motion.motion,duration,phase,grouped,exact,candidates);
    const record={
      slug:art.slug,artwork_title:art.name,display_title:title,
      artwork_path:"assets/Artwork/"+relativeArtwork,
      animation_path:"assets/Artwork/"+art.slug+"/animation.svg",
      artwork_sha256:actualHash,original_artwork_preserved:true,dimensions:art.dimensions,
      source_primary:art.source_primary,duplicate_appearances:appearances,
      artwork_warnings:art.warnings||[],artwork_review_status:art.review_status||"needs-human-review",
      catalogue_match_status:exact.length?"exact":candidates.length?"candidate-review-required":"unmatched",
      catalogue_matches:exact,catalogue_suggestions:candidates,
      screenshot_coin_price_status:status,screenshot_coin_price_variants:grouped,
      catalogue_coin_prices:[...new Set(exact.map(x=>x.coin_price))],
      motion_profile:{preset:motion.preset,animation:motion.motion,duration_ms:duration,phase_ms:phase}
    };

    const target=path.join(ARTWORK_ROOT,art.slug,"animation.svg");
    if(IS_CHECK){
      const existing=await fs.readFile(target,"utf8").catch(()=>null);
      assert(existing===svg,"Animation missing or stale: "+record.animation_path);
    }else{
      await fs.writeFile(target,svg,"utf8");
    }
    records.push(record);
  }

  const manifest={
    schema_version:1,project:"Minglora Social Network",
    purpose:"One individually animated SVG in each existing Artwork folder, embedding the exact original artwork.png bytes.",
    source_directories:{
      original_artwork:"assets/Artwork/",
      source_gift_screenshots:"assets/Gifts/",
      coin_title_catalogue:"data/minglora-gift-catalog.json",
      artwork_manifest:"assets/Artwork/manifest.json"
    },
    source_capture_count:captureFiles.length,source_artwork_count:artworkManifest.gifts.length,
    generated_animation_count:records.length,appearance_count:appearanceCount,
    priced_appearance_count:pricedCount,unresolved_price_appearance_count:unresolvedCount,
    exact_catalogue_matches:exactCount,catalogue_candidate_matches_requiring_review:candidateCount,
    no_catalogue_match:unmatchedCount,screenshot_catalogue_price_conflicts:conflictCount,
    original_artwork_hashes_verified:verifiedPngCount,
    production_release_gate:"Artwork remains review-only. No gift activation, wallet, price, transaction or earnings data is changed.",
    price_source_policy:"Keep every Coin amount found in every referenced screenshot cell; compare against exact catalogue amounts and flag conflicts instead of silently overwriting either source.",
    artworks:records
  };
  const manifestText=JSON.stringify(manifest,null,2)+"\n";
  const queueText=JSON.stringify({total_unresolved_appearances:reviewQueue.length,unresolved_appearances:reviewQueue},null,2)+"\n";
  if(IS_CHECK){
    assert(await fs.readFile(OUTPUT_MANIFEST_PATH,"utf8").catch(()=>null)===manifestText,"animation-manifest.json missing or stale.");
    assert(await fs.readFile(REVIEW_QUEUE_PATH,"utf8").catch(()=>null)===queueText,"animation-price-review-queue.json missing or stale.");
  }else{
    await fs.writeFile(OUTPUT_MANIFEST_PATH,manifestText,"utf8");
    await fs.writeFile(REVIEW_QUEUE_PATH,queueText,"utf8");
  }

  process.stdout.write("[Artwork Animation] "+(IS_CHECK?"CHECKED ":"GENERATED ")+records.length+
    " original-artwork animations; "+pricedCount+"/"+appearanceCount+" screenshot appearances have Coin prices; "+
    exactCount+" exact catalogue matches; "+candidateCount+" candidate mappings; "+
    conflictCount+" source/catalogue price conflicts; "+unresolvedCount+" unreadable Coin cells.\n");
}

main().catch(error=>{process.stderr.write(String(error?.stack||error)+"\n");process.exitCode=1;});
