import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const INPUT_DIR = path.join(ROOT, "assets", "Gifts");
const OUTPUT_DIR = path.join(ROOT, "assets", "animations", "gifts");
const CATALOG_FILE = path.join(ROOT, "data", "minglora-gift-catalog.json");
const CATEGORIES = new Set([
  "flowers","hearts","animals","vehicles","music","sports","food_drink",
  "fashion_beauty","luxury","celebrations","fantasy","nature","travel",
  "games","community","symbols","seasonal","jamaican_culture","reactions",
  "everyday","other"
]);

function normalizeName(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function slugify(value) {
  return normalizeName(value).replace(/\s+/g, "-").slice(0, 72) || "gift";
}
function hash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 8);
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a,b) => a-b);
  const mid = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
}
function categoryFor(name, matchedCategory) {
  if (CATEGORIES.has(matchedCategory)) return matchedCategory;
  const n = normalizeName(name);
  const rules = [
    ["jamaican_culture", /jamaica|jamaican|reggae|dancehall|rast|parish|kingston|caribbean|jerk|blue mountain|bob marley/],
    ["flowers", /rose|flower|bouquet|hibiscus|tulip|lily|orchid|petal|blossom|sunflower|tropical bloom/],
    ["hearts", /heart|love|kiss|romance|cupid|valentine|hug/],
    ["animals", /animal|cat|kitten|dog|puppy|lion|tiger|bear|panda|rabbit|bunny|fox|wolf|horse|unicorn|dragon|whale|dolphin|shark|fish|eagle|falcon|parrot|bird|butterfly|bee|frog|turtle|paw|wings/],
    ["vehicles", /car|vehicle|truck|bus|motorcycle|bike|bicycle|helicopter|train|plane|jet|aircraft|rocket|boat|ship|yacht/],
    ["sports", /baseball|basketball|football|soccer|volleyball|tennis|cricket|boxing|golf|sport|trophy|champion|medal|goal/],
    ["music", /music|guitar|drum|piano|keyboard|microphone|mic|headphone|speaker|melody|beat|dj|album|concert/],
    ["food_drink", /cake|cupcake|ice cream|coffee|tea|juice|pizza|burger|cherry|mango|watermelon|candy|chili|chilli|pepper|food|drink|fruit|bread|sushi/],
    ["fashion_beauty", /perfume|makeup|fashion|dress|shoe|handbag|lipstick|beauty|crown|jewelry|jewellery|ring|necklace/],
    ["luxury", /diamond|crystal|gem|gold|money|cash|luxury|royal|rich|treasure|private jet|yacht|palace/],
    ["celebrations", /firework|confetti|balloon|party|celebration|birthday|congratulation|cheers|festival|anniversary/],
    ["fantasy", /galaxy|universe|space|nebula|alien|magic|wizard|phoenix|pegasus|zeus|cosmic|fairy|mythic|star|lightning/],
    ["nature", /tree|forest|garden|island|ocean|sea|sunset|sunrise|rainbow|sun|moon|cloud|rain|snow|mountain|flower/],
    ["travel", /travel|globe|world|passport|suitcase|landmark|paris|egypt|morocco|uae|ksa|country|flag/],
    ["games", /game|gaming|controller|arcade|dice|chess|puzzle/],
    ["reactions", /thumbs up|clap|wink|cool|awesome|like|gg|popular|wow|haha|lol/],
    ["everyday", /coffee cup|phone|book|clock|umbrella|camera|gift box|house|key/]
  ];
  for (const [category, pattern] of rules) if (pattern.test(n)) return category;
  return "other";
}
function animationProfile(category, seed) {
  const profiles = {
    flowers: ["petal-bloom","2.1s","sway"],
    hearts: ["heart-pulse","1.25s","pulse"],
    animals: ["creature-entrance","1.55s","bounce"],
    vehicles: ["horizon-sweep","1.8s","glide"],
    music: ["soundwave-ripple","1.35s","rhythm"],
    sports: ["power-impact","1.35s","impact"],
    food_drink: ["delight-pop","1.5s","pop"],
    fashion_beauty: ["glam-spin","1.9s","shimmer"],
    luxury: ["royal-shimmer","2.3s","shimmer"],
    celebrations: ["celebration-burst","1.45s","burst"],
    fantasy: ["cosmic-orbit","2.2s","orbit"],
    nature: ["nature-rise","2.4s","float"],
    travel: ["horizon-sweep","2.0s","glide"],
    games: ["pixel-burst","1.2s","impact"],
    community: ["warm-wave","1.8s","wave"],
    symbols: ["spark-float","1.75s","float"],
    seasonal: ["royal-shimmer","2.2s","shimmer"],
    jamaican_culture: ["warm-wave","1.8s","wave"],
    reactions: ["delight-pop","1.15s","pop"],
    everyday: ["gift-reveal","1.7s","float"],
    other: ["gift-reveal","1.7s","float"]
  };
  const [preset, duration, motion] = profiles[category] || profiles.other;
  return { preset, duration, motion, phase: -((seed % 1600) / 1000).toFixed(3) + "s" };
}
function makeAnimationSvg(name, posterName, category, seed) {
  const p = animationProfile(category, seed);
  const escapedName = String(name).replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
  const motion = {
    sway: "giftSway",
    pulse: "giftPulse",
    bounce: "giftBounce",
    glide: "giftGlide",
    rhythm: "giftRhythm",
    impact: "giftImpact",
    pop: "giftPop",
    shimmer: "giftShimmer",
    burst: "giftBurst",
    orbit: "giftOrbit",
    float: "giftFloat",
    wave: "giftWave"
  }[p.motion] || "giftFloat";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 256 256" role="img" aria-labelledby="title desc">
<title id="title">${escapedName} animated gift</title>
<desc id="desc">Individual Minglora gift presentation animation. Original captured artwork is retained as the source.</desc>
<defs><filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<ellipse cx="128" cy="224" rx="56" ry="10" fill="#7c8db7" opacity=".22"/>
<g class="gift-motion" style="transform-origin:128px 128px;animation:${motion} ${p.duration} ease-in-out infinite;animation-delay:${p.phase}">
<image href="${posterName}" xlink:href="${posterName}" x="8" y="8" width="240" height="240" preserveAspectRatio="xMidYMid meet" filter="url(#glow)"/>
</g>
<style>
@keyframes giftSway{0%,100%{transform:rotate(-5deg) translateY(2px) scale(.96)}50%{transform:rotate(5deg) translateY(-8px) scale(1.04)}}
@keyframes giftPulse{0%,100%{transform:scale(.88)}45%{transform:scale(1.1)}70%{transform:scale(.97)}}
@keyframes giftBounce{0%,100%{transform:translateY(4px) scale(.98)}38%{transform:translateY(-22px) scale(1.04)}55%{transform:translateY(1px) scale(.94)}}
@keyframes giftGlide{0%,100%{transform:translateX(-8px) rotate(-2deg)}50%{transform:translateX(8px) rotate(2deg)}}
@keyframes giftRhythm{0%,100%{transform:translateY(2px) rotate(-3deg) scale(.96)}25%{transform:translateY(-7px) rotate(3deg) scale(1.04)}50%{transform:translateY(0) rotate(-2deg) scale(.98)}75%{transform:translateY(-5px) rotate(2deg) scale(1.02)}}
@keyframes giftImpact{0%,100%{transform:scale(.9) rotate(-4deg)}35%{transform:scale(1.12) rotate(4deg)}55%{transform:scale(.97) rotate(-2deg)}}
@keyframes giftPop{0%,100%{transform:scale(.9) translateY(5px)}35%{transform:scale(1.12) translateY(-10px)}65%{transform:scale(.98) translateY(0)}}
@keyframes giftShimmer{0%,100%{transform:rotate(-2deg) scale(.97);filter:brightness(1)}50%{transform:rotate(2deg) scale(1.06);filter:brightness(1.35)}}
@keyframes giftBurst{0%,100%{transform:scale(.88) rotate(-4deg)}30%{transform:scale(1.12) rotate(5deg)}65%{transform:scale(1) rotate(-2deg)}}
@keyframes giftOrbit{0%,100%{transform:rotate(-7deg) translateY(2px)}50%{transform:rotate(7deg) translateY(-9px)}}
@keyframes giftFloat{0%,100%{transform:translateY(5px) scale(.97)}50%{transform:translateY(-10px) scale(1.04)}}
@keyframes giftWave{0%,100%{transform:translateX(-4px) rotate(-3deg)}50%{transform:translateX(5px) rotate(3deg)}}
@media(prefers-reduced-motion:reduce){.gift-motion{animation:none!important}}
</style></svg>`;
}
function edgeBackground(raw, width, height, channels) {
  const counts = new Map();
  const add = (x,y) => {
    const i=(y*width+x)*channels, r=raw[i], g=raw[i+1], b=raw[i+2];
    const key=(r>>3)+","+(g>>3)+","+(b>>3);
    const current=counts.get(key)||{count:0,r:0,g:0,b:0};
    current.count++;current.r+=r;current.g+=g;current.b+=b;counts.set(key,current);
  };
  const step=Math.max(1,Math.floor(Math.min(width,height)/180));
  for(let x=0;x<width;x+=step){add(x,0);add(x,height-1);}
  for(let y=0;y<height;y+=step){add(0,y);add(width-1,y);}
  const best=[...counts.values()].sort((a,b)=>b.count-a.count)[0];
  return best ? [best.r/best.count,best.g/best.count,best.b/best.count] : [24,43,79];
}
function stripBackground(cropRaw, width, height, channels, bg) {
  const rgba=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const si=(y*width+x)*channels, di=(y*width+x)*4;
    const r=cropRaw[si],g=cropRaw[si+1],b=cropRaw[si+2];
    const d=Math.hypot(r-bg[0],g-bg[1],b-bg[2]);
    const alpha=d<26?0:d<62?Math.round((d-26)/36*255):255;
    rgba[di]=r;rgba[di+1]=g;rgba[di+2]=b;rgba[di+3]=alpha;
  }
  return rgba;
}
async function ocrLabels(inputPath, scale) {
  const tempPath=path.join(os.tmpdir(), "minglora-gift-ocr-"+crypto.randomBytes(6).toString("hex")+".png");
  try{
    const meta=await sharp(inputPath).metadata();
    if(!meta.width||!meta.height)throw new Error("Image dimensions unavailable");
    const targetWidth=Math.max(1,Math.min(2400,Math.round(meta.width*scale)));
    // The OCR resize is capped at 2400px. Convert OCR coordinates using the
    // actual resize ratio, not the requested scale, or wide screenshots crop
    // the wrong region and create mismatched gift artwork.
    const actualScale=targetWidth/meta.width;
    await sharp(inputPath).resize({width:targetWidth}).png().toFile(tempPath);
    const {stdout}=await execFileAsync("tesseract",[tempPath,"stdout","-l","eng","--psm","11","tsv"],{maxBuffer:32*1024*1024});
    const lines=new Map();
    const rows=stdout.split(/\r?\n/);
    for(let i=1;i<rows.length;i++){
      const cols=rows[i].split("\t");
      if(cols.length<12||cols[0]!=="5")continue;
      const conf=Number(cols[10]), word=String(cols[11]||"").trim();
      if(!word||!Number.isFinite(conf)||conf<18)continue;
      const key=cols[2]+"."+cols[3]+"."+cols[4];
      const left=Number(cols[6])/actualScale,top=Number(cols[7])/actualScale,w=Number(cols[8])/actualScale,h=Number(cols[9])/actualScale;
      if(!lines.has(key))lines.set(key,[]);
      lines.get(key).push({word,left,top,w,h,conf});
    }
    return [...lines.values()].map(words=>{
      words.sort((a,b)=>a.left-b.left);
      let text=words.map(x=>x.word).join(" ").replace(/\s+([,.'!?])/g,"$1").trim();
      text=text.replace(/\s+[0-9]{1,5}(?:[.,][0-9]{1,2})?$/,"").trim();
      const left=Math.min(...words.map(x=>x.left)),top=Math.min(...words.map(x=>x.top));
      const right=Math.max(...words.map(x=>x.left+x.w)),bottom=Math.max(...words.map(x=>x.top+x.h));
      return {text,left,top,w:right-left,h:bottom-top,cx:(left+right)/2,bottom,confidence:words.reduce((s,x)=>s+x.conf,0)/words.length};
    }).filter(line=>{
      const n=normalizeName(line.text);
      return n.length>=2 && (/[a-z]/i.test(line.text)||/^\d+[/-]\d+$/.test(line.text)) && line.h>=5;
    });
  } finally {
    await fs.rm(tempPath,{force:true}).catch(()=>{});
  }
}
function mergeWrappedLabels(lines, width) {
  const approximateCell=width/6.2;
  const sorted=[...lines].sort((a,b)=>a.top-b.top||a.cx-b.cx);
  const merged=[];
  for(const line of sorted){
    const match=merged.find(item=>Math.abs(item.cx-line.cx)<approximateCell*.42 && Math.abs(item.bottom-line.bottom)<28);
    if(match){
      const parts=[match.text,line.text].filter(Boolean);
      match.text=parts.join(" ").replace(/\s+/g," ").trim();
      match.left=Math.min(match.left,line.left);match.top=Math.min(match.top,line.top);
      match.bottom=Math.max(match.bottom,line.bottom);
      match.w=Math.max(match.left+match.w,line.left+line.w)-match.left;
      match.h=match.bottom-match.top;
      match.confidence=(match.confidence+line.confidence)/2;
    }else merged.push({...line});
  }
  return merged;
}
function groupRows(labels, height) {
  const tolerance=Math.max(9,height*.014);
  const rows=[];
  for(const label of [...labels].sort((a,b)=>a.bottom-b.bottom||a.cx-b.cx)){
    let row=rows.find(r=>Math.abs(r.y-label.bottom)<=tolerance);
    if(!row){row={y:label.bottom,items:[]};rows.push(row);}
    row.items.push(label);row.y=row.items.reduce((sum,x)=>sum+x.bottom,0)/row.items.length;
  }
  return rows;
}
function titleCase(value) {
  return String(value||"").replace(/\s+/g," ").trim().replace(/\b([a-z])/g,m=>m.toUpperCase());
}
async function processScreenshot(file, catalogByName) {
  const inputPath=path.join(INPUT_DIR,file);
  const meta=await sharp(inputPath).metadata();
  if(!meta.width||!meta.height)throw new Error("Image dimensions unavailable");
  const rawInfo=await sharp(inputPath).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const channels=rawInfo.info.channels;
  const bg=edgeBackground(rawInfo.data,meta.width,meta.height,channels);
  const lines=await ocrLabels(inputPath,Math.min(3,Math.max(2,1500/meta.width)));
  const labels=mergeWrappedLabels(lines,meta.width);
  const rows=groupRows(labels,meta.height);
  const results=[];
  for(const row of rows){
    const items=row.items.sort((a,b)=>a.cx-b.cx);
    const gaps=items.slice(1).map((item,index)=>item.cx-items[index].cx).filter(n=>n>24);
    const cellWidth=median(gaps)||meta.width/6;
    const cropSize=clamp(Math.round(cellWidth*.72),64,104);
    for(const label of items){
      const displayName=titleCase(label.text);
      if(!displayName||displayName.length>48)continue;
      const left=clamp(Math.round(label.cx-cropSize/2),0,Math.max(0,meta.width-cropSize));
      // Stop above the label so recognized text is not baked into the gift image.
      const top=clamp(Math.round(label.top-cropSize-9),0,Math.max(0,meta.height-cropSize));
      const cropWidth=Math.min(cropSize,meta.width-left),cropHeight=Math.min(cropSize,meta.height-top);
      if(cropWidth<32||cropHeight<32)continue;
      const crop=await sharp(rawInfo.data,{raw:{width:meta.width,height:meta.height,channels}})
        .extract({left,top,width:cropWidth,height:cropHeight}).raw().toBuffer({resolveWithObject:true});
      const rgba=stripBackground(crop.data,cropWidth,cropHeight,crop.info.channels,bg);
      const originalName=displayName;
      const match=catalogByName.get(normalizeName(originalName));
      const category=categoryFor(originalName,match?.category);
      const code=match?.code||slugify(originalName)+"-"+hash(normalizeName(originalName));
      const posterName="poster.webp";
      const seed=parseInt(hash(code),16)>>>0;
      const profile=animationProfile(category,seed);
      // Hold each crop until duplicate names are resolved; the best OCR source wins.
      const posterBuffer=await sharp(rgba,{raw:{width:cropWidth,height:cropHeight,channels:4}})
        .resize(256,256,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}})
        .webp({quality:91,alphaQuality:100,effort:5}).toBuffer();
      const animationSource=makeAnimationSvg(originalName,posterName,category,seed);
      const posterSha256=crypto.createHash("sha256").update(posterBuffer).digest("hex");
      const animationSha256=crypto.createHash("sha256").update(animationSource).digest("hex");
      const normalizedName=normalizeName(originalName);
      const qualityFlags=[];
      if(label.confidence<55)qualityFlags.push("low_ocr_confidence");
      else if(label.confidence<75)qualityFlags.push("medium_ocr_confidence");
      if(!match)qualityFlags.push("unmatched_catalog_name");
      if(category==="other")qualityFlags.push("generic_other_category");
      if(normalizedName.length<4)qualityFlags.push("short_or_uncertain_name");
      results.push({
        id:code,name:originalName,normalized_name:normalizedName,category,
        animation_key:"minglora-"+slugify(code),animation_preset:profile.preset,
        animation_kind:"individual-svg-css-motion",animation_duration_ms:Math.round(Number.parseFloat(profile.duration)*1000),
        source_kind:"captured-gallery-still",source_image:"assets/Gifts/"+file,
        source_region:{x:left,y:top,width:cropWidth,height:cropHeight},
        ocr_confidence:Number(label.confidence.toFixed(1)),
        matched_catalog_code:match?.code||null,
        matched_catalog_name:match?.name||null,
        poster:null,animation:null,
        poster_sha256:posterSha256,animation_sha256:animationSha256,
        ocr_confidence_band:label.confidence>=85?"high":label.confidence>=65?"medium":"low",
        quality_review_flags:qualityFlags,
        review_priority:qualityFlags.includes("low_ocr_confidence")||qualityFlags.includes("short_or_uncertain_name")?"high":qualityFlags.length?"normal":"routine",
        _poster_buffer:posterBuffer,_animation_source:animationSource,
        visual_review_status:"needs_visual_review",
        original_3d_motion_available:false
      });
    }
  }
  return {file,width:meta.width,height:meta.height,detected:results.length,results};
}
async function mapLimit(items,limit,fn){
  const out=new Array(items.length);let next=0;
  const workers=Array.from({length:Math.min(limit,items.length)},async()=>{
    while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i);}
  });
  await Promise.all(workers);return out;
}

async function main(){
  const files=(await fs.readdir(INPUT_DIR)).filter(f=>/\.(png|jpe?g|webp)$/i.test(f)).sort();
  if(!files.length)throw new Error("No PNG, JPEG or WebP gift captures found in assets/Gifts.");
  let catalog={gifts:[]};
  try{catalog=JSON.parse(await fs.readFile(CATALOG_FILE,"utf8"));}catch(error){console.warn("Catalog matching unavailable:",error.message);}
  const catalogByName=new Map();
  for(const gift of catalog.gifts||[])if(gift.name)catalogByName.set(normalizeName(gift.name),gift);
  const processed=await mapLimit(files,2,async file=>{
    try{return await processScreenshot(file,catalogByName);}
    catch(error){return {file,detected:0,error:String(error?.message||error),results:[]};}
  });
  const unique=new Map();
  for(const batch of processed)for(const gift of batch.results||[]){
    const key=gift.normalized_name;
    const existing=unique.get(key);
    if(!existing)unique.set(key,{...gift,sources:[{image:gift.source_image,region:gift.source_region,confidence:gift.ocr_confidence}]});
    else{
      existing.sources.push({image:gift.source_image,region:gift.source_region,confidence:gift.ocr_confidence});
      if(gift.ocr_confidence>existing.ocr_confidence){
        existing.source_image=gift.source_image;existing.source_region=gift.source_region;
        existing.ocr_confidence=gift.ocr_confidence;
        existing.ocr_confidence_band=gift.ocr_confidence_band;
        existing.quality_review_flags=gift.quality_review_flags;
        existing.review_priority=gift.review_priority;
        existing._poster_buffer=gift._poster_buffer;
        existing._animation_source=gift._animation_source;
        existing.poster_sha256=gift.poster_sha256;
        existing.animation_sha256=gift.animation_sha256;
      }
    }
  }
  const gifts=[...unique.values()].sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));
  const categoryCounts={};
  const confidenceCounts={high:0,medium:0,low:0};
  const qualityFlagCounts={};
  const posterGroups=new Map();
  let matchedCatalogCount=0;
  for(const gift of gifts){
    categoryCounts[gift.category]=(categoryCounts[gift.category]||0)+1;
    confidenceCounts[gift.ocr_confidence_band]=(confidenceCounts[gift.ocr_confidence_band]||0)+1;
    if(gift.matched_catalog_code)matchedCatalogCount++;
    for(const flag of gift.quality_review_flags||[])qualityFlagCounts[flag]=(qualityFlagCounts[flag]||0)+1;
    if(!posterGroups.has(gift.poster_sha256))posterGroups.set(gift.poster_sha256,[]);
    posterGroups.get(gift.poster_sha256).push(gift);
  }
  const duplicatePosterGroups=[...posterGroups.entries()].filter(([,items])=>items.length>1).map(([sha256,items])=>({
    sha256,gifts:items.map(item=>({id:item.id,name:item.name,source_image:item.source_image}))
  }));
  // Write only one canonical pair of assets for each deduplicated gift.
  for(const gift of gifts){
    const folderName=slugify(gift.name)+"-"+hash(gift.id);
    const assetFolder=path.join(OUTPUT_DIR,gift.category,folderName);
    await fs.mkdir(assetFolder,{recursive:true});
    await fs.writeFile(path.join(assetFolder,"poster.webp"),gift._poster_buffer);
    await fs.writeFile(path.join(assetFolder,"animation.svg"),gift._animation_source,"utf8");
    gift.poster="assets/animations/gifts/"+gift.category+"/"+folderName+"/poster.webp";
    gift.animation="assets/animations/gifts/"+gift.category+"/"+folderName+"/animation.svg";
    delete gift._poster_buffer;
    delete gift._animation_source;
  }
  const manifest={
    schema_version:1,generated_at:new Date().toISOString(),project:"Minglora Social Network",
    source_directory:"assets/Gifts",output_directory:"assets/animations/gifts",
    source_screenshots:processed.map(({file,width,height,detected,error})=>({file,width,height,detected,...(error?{error}:{})})),
    screenshot_count:files.length,detected_occurrences:processed.reduce((n,x)=>n+(x.detected||0),0),
    unique_gift_count:gifts.length,category_counts:categoryCounts,
    processing_notes:[
      "Each recognized gift is extracted into its own category folder with an optimized transparent WebP poster and an individual animated SVG.",
      "Matching is by normalized gift name against the existing Minglora gift catalog; unmatched captures receive a stable slug ID.",
      "Repeated names are deduplicated into one asset record with all capture source references retained; the highest-confidence crop is selected.",
      "Artwork crops end above detected label text. Poster and animation files receive SHA-256 digests for duplicate auditing.",
      "OCR confidence, unmatched names, generic categories and short uncertain labels are surfaced as quality-review flags.",
      "Source captures are screenshots, not original animation frame sequences. SVG motion is an original presentation animation and is not a reconstruction of TikTok's proprietary animation or 3D model.",
      "Generated assets require visual review before activating them in the live gift catalog."
    ],
    gifts
  };
  await fs.mkdir(OUTPUT_DIR,{recursive:true});
  await fs.writeFile(path.join(OUTPUT_DIR,"manifest.json"),JSON.stringify(manifest,null,2)+"\n","utf8");
  const report={
    screenshot_count:files.length,detected_occurrences:manifest.detected_occurrences,
    unique_gifts:gifts.length,category_counts:categoryCounts,
    matched_catalog_gifts:matchedCatalogCount,unmatched_catalog_gifts:gifts.length-matchedCatalogCount,
    confidence_counts:confidenceCounts,quality_flag_counts:qualityFlagCounts,
    duplicate_poster_groups:duplicatePosterGroups,
    screenshots_with_errors:processed.filter(x=>x.error).map(x=>({file:x.file,error:x.error})),
    zero_detection_screenshots:processed.filter(x=>!x.error&&!x.detected).map(x=>x.file)
  };
  await fs.writeFile(path.join(OUTPUT_DIR,"extraction-report.json"),JSON.stringify(report,null,2)+"\n","utf8");
  await fs.writeFile(path.join(OUTPUT_DIR,"README.md"),`# Minglora individual gift animations

Generated from the user-provided gallery captures in \`assets/Gifts/\`.

Each gift has its own category folder containing:
- \`poster.webp\`: transparent, normalized 256 × 256 artwork crop.
- \`animation.svg\`: individually keyed, reduced-motion-aware animated SVG presentation.

See \`manifest.json\` for gift IDs, categories, source screenshots, crop coordinates, OCR confidence, catalog matches and per-gift asset paths. See \`extraction-report.json\` for processing totals and any failures.

**Source limitation:** the supplied inputs are still gallery screenshots, not original animation videos or 3D animation files. The SVG motion is an original presentation effect applied to each extracted still; it is not TikTok's proprietary animation. Original 3D motion can only be integrated when the corresponding animation/model sources are supplied. Generated gifts are marked \`needs_visual_review\` and must not be published automatically.

The extractor is repeatable and writes only under \`assets/animations/gifts/\`. It does not modify the source captures, active gift catalog, coin prices, wallets, gift transactions or creator earnings.
`,"utf8");
  console.log(JSON.stringify(report,null,2));
  if(!gifts.length)throw new Error("No gift labels were recognized. Inspect OCR output before accepting extraction.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
