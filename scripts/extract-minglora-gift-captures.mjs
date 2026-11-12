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
const ARTWORK_MANIFEST_FILE = path.join(ROOT, "assets", "Artwork", "manifest.json");
const PUBLIC_MOTION_INDEX_FILE = path.join(ROOT, "public", "assets", "animations", "gifts", "catalog-motion-index.json");
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
function animationProfile(category, seed, name = "") {
  const normalizedName = normalizeName(name);
  // Prefer an object-specific motion when the recognized name clearly identifies
  // the subject. Category profiles remain the safe fallback for ambiguous labels.
  const namedProfiles = [
    { pattern: /\b(?:firework|fireworks|sparkler|confetti|celebration|burst)\b/, profile: ["firework-burst", "2.3s", "burst", "sparkles"] },
    { pattern: /\b(?:rocket|spaceship|space shuttle|launch|starship)\b/, profile: ["rocket-launch", "2.2s", "launch", "trail"] },
    { pattern: /\b(?:airplane|plane|jet|helicopter|aircraft|hot air balloon)\b/, profile: ["sky-flight", "2.0s", "glide", "orbits"] },
    { pattern: /\b(?:car|truck|bus|motorcycle|motorbike|bicycle|bike|race|racing|sports car)\b/, profile: ["speed-drift", "1.85s", "glide", "trail"] },
    { pattern: /\b(?:butterfly|moth|dragonfly)\b/, profile: ["butterfly-flutter", "1.8s", "flutter", "petals"] },
    { pattern: /\b(?:bird|falcon|eagle|owl|parrot|chicken|duck|goose|phoenix)\b/, profile: ["winged-flight", "1.65s", "flutter", "trail"] },
    { pattern: /\b(?:cat|kitten|dog|puppy|lion|tiger|bear|panda|rabbit|bunny|fox|wolf|horse|frog|turtle|koala)\b/, profile: ["playful-creature", "1.55s", "bounce", "sparkles"] },
    { pattern: /\b(?:rose|flower|bouquet|hibiscus|tulip|lily|orchid|petal|blossom|sunflower)\b/, profile: ["blossom-bloom", "2.1s", "bloom", "petals"] },
    { pattern: /\b(?:heart|love|kiss|romance|cupid|valentine|hug)\b/, profile: ["heart-pulse", "1.25s", "pulse", "sparkles"] },
    { pattern: /\b(?:crown|diamond|crystal|gem|gold|treasure|royal|palace|jewel)\b/, profile: ["royal-shimmer", "2.35s", "shimmer", "sparkles"] },
    { pattern: /\b(?:balloon|cloud|moon|sun|star|rainbow|comet)\b/, profile: ["gentle-float", "2.3s", "float", "bubbles"] },
    { pattern: /\b(?:guitar|drum|piano|keyboard|microphone|headphone|speaker|music|melody|concert|dj)\b/, profile: ["music-rhythm", "1.35s", "rhythm", "waves"] },
    { pattern: /\b(?:ocean|sea|wave|fish|dolphin|whale|shark|boat|ship|yacht|sail)\b/, profile: ["ocean-drift", "2.2s", "wave", "waves"] },
    { pattern: /\b(?:cake|cupcake|ice cream|coffee|tea|juice|pizza|burger|cherry|mango|watermelon|candy|food|drink)\b/, profile: ["sweet-pop", "1.5s", "pop", "bubbles"] },
    { pattern: /\b(?:trophy|medal|champion|goal|victory|winner|award)\b/, profile: ["victory-impact", "1.45s", "impact", "rings"] },
    { pattern: /\b(?:dragon|unicorn|wizard|magic|fairy|spell|galaxy|nebula|cosmic)\b/, profile: ["magic-orbit", "2.2s", "orbit", "sparkles"] }
  ];
  const named = namedProfiles.find(entry => entry.pattern.test(normalizedName));
  const categoryProfiles = {
    flowers: ["petal-bloom", "2.1s", "bloom", "petals"],
    hearts: ["heart-pulse", "1.25s", "pulse", "sparkles"],
    animals: ["creature-entrance", "1.55s", "bounce", "sparkles"],
    vehicles: ["horizon-sweep", "1.8s", "glide", "trail"],
    music: ["soundwave-ripple", "1.35s", "rhythm", "waves"],
    sports: ["power-impact", "1.35s", "impact", "rings"],
    food_drink: ["delight-pop", "1.5s", "pop", "bubbles"],
    fashion_beauty: ["glam-spin", "1.9s", "spin", "sparkles"],
    luxury: ["royal-shimmer", "2.3s", "shimmer", "sparkles"],
    celebrations: ["celebration-burst", "1.45s", "burst", "sparkles"],
    fantasy: ["cosmic-orbit", "2.2s", "orbit", "orbits"],
    nature: ["nature-rise", "2.4s", "float", "petals"],
    travel: ["horizon-sweep", "2.0s", "glide", "trail"],
    games: ["pixel-burst", "1.2s", "impact", "rings"],
    community: ["warm-wave", "1.8s", "wave", "waves"],
    symbols: ["spark-float", "1.75s", "float", "sparkles"],
    seasonal: ["seasonal-shimmer", "2.2s", "shimmer", "sparkles"],
    jamaican_culture: ["island-wave", "1.8s", "wave", "waves"],
    reactions: ["delight-pop", "1.15s", "pop", "sparkles"],
    everyday: ["gift-reveal", "1.7s", "float", "bubbles"],
    other: ["gift-reveal", "1.7s", "float", "sparkles"]
  };
  const [preset, duration, motion, effect] = named?.profile || categoryProfiles[category] || categoryProfiles.other;
  return {
    preset,
    duration,
    motion,
    effect,
    phase: -((seed % 1600) / 1000).toFixed(3) + "s",
    phaseIndex: seed % 7
  };
}

function makeEffectMarkup(effect, seed) {
  const points = [[38,64],[218,60],[24,137],[232,148],[72,220],[184,218],[128,27]];
  const delayFor = index => -(((seed + index * 317) % 1800) / 1000).toFixed(2) + "s";
  if (effect === "petals") {
    return points.slice(0,6).map((point,index) =>
      '<ellipse class="gift-effect gift-effect-petal" cx="' + point[0] + '" cy="' + point[1] +
      '" rx="3.8" ry="8" transform="rotate(' + (index * 53 + seed % 30) + ' ' + point[0] + ' ' + point[1] +
      ')" style="animation-delay:' + delayFor(index) + '"/>'
    ).join("");
  }
  if (effect === "waves") {
    return [
      '<path class="gift-effect gift-effect-wave" d="M12 94 Q24 82 36 94 T60 94" style="animation-delay:' + delayFor(0) + '"/>',
      '<path class="gift-effect gift-effect-wave" d="M196 164 Q208 152 220 164 T244 164" style="animation-delay:' + delayFor(1) + '"/>',
      '<path class="gift-effect gift-effect-wave" d="M82 238 Q94 226 106 238 T130 238" style="animation-delay:' + delayFor(2) + '"/>'
    ].join("");
  }
  if (effect === "rings") {
    return [0,1,2].map(index =>
      '<circle class="gift-effect gift-effect-ring" cx="128" cy="128" r="' + (84 + index * 12) +
      '" style="animation-delay:' + delayFor(index) + '"/>'
    ).join("");
  }
  if (effect === "trail") {
    return points.slice(0,6).map((point,index) =>
      '<circle class="gift-effect gift-effect-dot" cx="' + point[0] + '" cy="' + point[1] +
      '" r="' + (2.2 + ((seed + index) % 3)) + '" style="animation-delay:' + delayFor(index) + '"/>'
    ).join("");
  }
  if (effect === "orbits") {
    return [0,1,2].map(index =>
      '<circle class="gift-effect gift-effect-orbit" cx="' + (128 + Math.cos(index * 2.1) * 96) +
      '" cy="' + (128 + Math.sin(index * 2.1) * 96) + '" r="' + (3 + index) +
      '" style="animation-delay:' + delayFor(index) + '"/>'
    ).join("");
  }
  if (effect === "bubbles") {
    return points.slice(0,6).map((point,index) =>
      '<circle class="gift-effect gift-effect-bubble" cx="' + point[0] + '" cy="' + point[1] +
      '" r="' + (3 + ((seed + index) % 4)) + '" style="animation-delay:' + delayFor(index) + '"/>'
    ).join("");
  }
  return points.map((point,index) =>
    '<path class="gift-effect gift-effect-spark" d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2 Z" transform="translate(' +
    point[0] + ' ' + point[1] + ') scale(' + (0.72 + ((seed + index) % 5) * 0.08) +
    ')" style="animation-delay:' + delayFor(index) + '"/>'
  ).join("");
}

function makeAnimationSvg(name, posterDataUri, category, seed) {
  const p = animationProfile(category, seed, name);
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
    wave: "giftWave",
    bloom: "giftBloom",
    flutter: "giftFlutter",
    launch: "giftLaunch",
    spin: "giftSpin"
  }[p.motion] || "giftFloat";
  const effects = makeEffectMarkup(p.effect, seed);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 256 256" role="img" aria-labelledby="title desc">',
    '<title id="title">' + escapedName + ' animated gift</title>',
    '<desc id="desc">Individual Minglora gift presentation animation. Original captured artwork is retained as the source.</desc>',
    '<defs><filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>',
    '<ellipse cx="128" cy="224" rx="56" ry="10" fill="#7c8db7" opacity=".22"/>',
    '<g class="gift-effects" aria-hidden="true">' + effects + '</g>',
    '<g class="gift-motion" data-preset="' + p.preset + '" style="transform-origin:128px 128px;animation:' + motion + ' ' + p.duration + ' ease-in-out infinite;animation-delay:' + p.phase + '">',
    '<image href="' + posterDataUri + '" xlink:href="' + posterDataUri + '" x="8" y="8" width="240" height="240" preserveAspectRatio="xMidYMid meet" filter="url(#glow)"/>',
    '</g>',
    '<style>',
    '@keyframes giftSway{0%,100%{transform:rotate(-5deg) translateY(2px) scale(.96)}50%{transform:rotate(5deg) translateY(-8px) scale(1.04)}}',
    '@keyframes giftPulse{0%,100%{transform:scale(.88)}45%{transform:scale(1.1)}70%{transform:scale(.97)}}',
    '@keyframes giftBounce{0%,100%{transform:translateY(4px) scale(.98)}38%{transform:translateY(-22px) scale(1.04)}55%{transform:translateY(1px) scale(.94)}}',
    '@keyframes giftGlide{0%,100%{transform:translateX(-8px) rotate(-2deg)}50%{transform:translateX(8px) rotate(2deg)}}',
    '@keyframes giftRhythm{0%,100%{transform:translateY(2px) rotate(-3deg) scale(.96)}25%{transform:translateY(-7px) rotate(3deg) scale(1.04)}50%{transform:translateY(0) rotate(-2deg) scale(.98)}75%{transform:translateY(-5px) rotate(2deg) scale(1.02)}}',
    '@keyframes giftImpact{0%,100%{transform:scale(.9) rotate(-4deg)}35%{transform:scale(1.12) rotate(4deg)}55%{transform:scale(.97) rotate(-2deg)}}',
    '@keyframes giftPop{0%,100%{transform:scale(.9) translateY(5px)}35%{transform:scale(1.12) translateY(-10px)}65%{transform:scale(.98) translateY(0)}}',
    '@keyframes giftShimmer{0%,100%{transform:rotate(-2deg) scale(.97);filter:brightness(1)}50%{transform:rotate(2deg) scale(1.06);filter:brightness(1.35)}}',
    '@keyframes giftBurst{0%,100%{transform:scale(.88) rotate(-4deg)}30%{transform:scale(1.12) rotate(5deg)}65%{transform:scale(1) rotate(-2deg)}}',
    '@keyframes giftOrbit{0%,100%{transform:rotate(-7deg) translateY(2px)}50%{transform:rotate(7deg) translateY(-9px)}}',
    '@keyframes giftFloat{0%,100%{transform:translateY(5px) scale(.97)}50%{transform:translateY(-10px) scale(1.04)}}',
    '@keyframes giftWave{0%,100%{transform:translateX(-4px) rotate(-3deg)}50%{transform:translateX(5px) rotate(3deg)}}',
    '@keyframes giftBloom{0%,100%{transform:scale(.84) rotate(-6deg)}48%{transform:scale(1.08) rotate(4deg)}72%{transform:scale(.98) rotate(-1deg)}}',
    '@keyframes giftFlutter{0%,100%{transform:rotate(-8deg) scale(.96)}25%{transform:rotate(8deg) scale(1.02)}50%{transform:rotate(-6deg) scale(1.04)}75%{transform:rotate(7deg) scale(.98)}}',
    '@keyframes giftLaunch{0%{transform:translateY(12px) scale(.88) rotate(-3deg)}55%{transform:translateY(-19px) scale(1.05) rotate(3deg)}100%{transform:translateY(0) scale(.98) rotate(0)}}',
    '@keyframes giftSpin{0%,100%{transform:rotate(-8deg) scale(.96)}50%{transform:rotate(8deg) scale(1.06)}}',
    '.gift-effect{opacity:.7;transform-box:fill-box;transform-origin:center}',
    '.gift-effect-spark{fill:#f9df91;animation:giftEffectSpark 1.8s ease-in-out infinite}',
    '.gift-effect-petal{fill:#f4a5c4;animation:giftEffectPetal 2.2s ease-in-out infinite}',
    '.gift-effect-dot{fill:#9edcff;animation:giftEffectBubble 1.9s ease-in-out infinite}',
    '.gift-effect-orbit{fill:#e8d2ff;animation:giftEffectOrbit 2.4s ease-in-out infinite}',
    '.gift-effect-bubble{fill:#aee8e1;animation:giftEffectBubble 2s ease-in-out infinite}',
    '.gift-effect-ring{fill:none;stroke:#f7d98b;stroke-width:2;opacity:.42;animation:giftEffectRing 2s ease-out infinite}',
    '.gift-effect-wave{fill:none;stroke:#a7d9f4;stroke-width:3;stroke-linecap:round;stroke-dasharray:7 6;animation:giftEffectWave 2s linear infinite}',
    '@keyframes giftEffectSpark{0%,100%{opacity:.16;transform:scale(.45) rotate(0)}50%{opacity:.9;transform:scale(1.05) rotate(45deg)}}',
    '@keyframes giftEffectPetal{0%,100%{opacity:.22;transform:translateY(3px) rotate(-8deg)}50%{opacity:.8;transform:translateY(-5px) rotate(8deg)}}',
    '@keyframes giftEffectBubble{0%,100%{opacity:.25;transform:translateY(5px) scale(.85)}50%{opacity:.85;transform:translateY(-7px) scale(1.08)}}',
    '@keyframes giftEffectOrbit{0%{opacity:.2;transform:scale(.7)}50%{opacity:.9;transform:scale(1.2)}100%{opacity:.2;transform:scale(.7)}}',
    '@keyframes giftEffectRing{0%{opacity:.5;transform:scale(.82)}100%{opacity:0;transform:scale(1.15)}}',
    '@keyframes giftEffectWave{0%,100%{opacity:.25;stroke-dashoffset:0}50%{opacity:.85;stroke-dashoffset:26}}',
    '@media(prefers-reduced-motion:reduce){.gift-motion{animation:none!important}.gift-effects>*{animation:none!important}}',
    '</style>',
    '</svg>'
  ].join('\n');
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
      const profile=animationProfile(category,seed,originalName);
      // Hold each crop until duplicate names are resolved; the best OCR source wins.
      const posterBuffer=await sharp(rgba,{raw:{width:cropWidth,height:cropHeight,channels:4}})
        .resize(256,256,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}})
        .webp({quality:91,alphaQuality:100,effort:5}).toBuffer();
      const posterDataUri="data:image/webp;base64,"+posterBuffer.toString("base64");
      const animationSource=makeAnimationSvg(originalName,posterDataUri,category,seed);
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
        animation_key:"minglora-"+slugify(code),animation_preset:profile.preset,animation_effect:profile.effect,
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
  let artworkManifest={gifts:[]};
  try{artworkManifest=JSON.parse(await fs.readFile(ARTWORK_MANIFEST_FILE,"utf8"));}catch(error){console.warn("Artwork reference manifest unavailable:",error.message);}
  const catalogByName=new Map();
  const catalogByCode=new Map();
  const artworkByName=new Map();
  for(const gift of catalog.gifts||[]){
    if(gift.name)catalogByName.set(normalizeName(gift.name),gift);
    if(gift.code)catalogByCode.set(String(gift.code),gift);
  }
  for(const artwork of artworkManifest.gifts||[])if(artwork.name)artworkByName.set(normalizeName(artwork.name),artwork);
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
  // Build one motion record for EVERY active production gift. Exact source
  // captures add the richer individual profile; remaining catalogue gifts get
  // deterministic name/category choreography based on their original model.
  const extractedByCatalogCode=new Map();
  for(const extracted of gifts){
    const code=String(extracted.matched_catalog_code||"");
    const sourceCatalog=catalogByCode.get(code);
    if(!sourceCatalog||normalizeName(sourceCatalog.name)!==extracted.normalized_name)continue;
    if(extractedByCatalogCode.has(code))continue;
    extractedByCatalogCode.set(code,extracted);
  }
  const catalogMotionProfiles=[];
  const catalogMotionCodes=new Set();
  const duplicateCatalogMotionCodes=[];
  let artworkReferenceMatches=0;
  let capturedCatalogProfiles=0;
  let fallbackCatalogProfiles=0;
  let inactiveCatalogMatches=0;
  const invalidCatalogProfiles=[];
  for(const sourceCatalog of catalog.gifts||[]){
    if(sourceCatalog.active===false){inactiveCatalogMatches++;continue;}
    const code=String(sourceCatalog.code||"");
    if(!code||catalogMotionCodes.has(code)){duplicateCatalogMotionCodes.push(code);continue;}
    if(!Number.isFinite(Number(sourceCatalog.coin_price))||Number(sourceCatalog.coin_price)<0||
       typeof sourceCatalog.image_url!=="string"||!sourceCatalog.image_url.startsWith("/assets/")||
       typeof sourceCatalog.model_url!=="string"||!sourceCatalog.model_url.startsWith("/assets/")||
       !String(sourceCatalog.name||"").trim()){
      invalidCatalogProfiles.push({code,name:sourceCatalog.name||null});
      continue;
    }
    const extracted=extractedByCatalogCode.get(code)||null;
    const seed=parseInt(hash(code),16)>>>0;
    const fallback=animationProfile(sourceCatalog.category,seed,sourceCatalog.name);
    const artwork=artworkByName.get(normalizeName(sourceCatalog.name));
    if(artwork)artworkReferenceMatches++;
    if(extracted)capturedCatalogProfiles++;else fallbackCatalogProfiles++;
    catalogMotionCodes.add(code);
    catalogMotionProfiles.push({
      code:sourceCatalog.code,name:sourceCatalog.name,category:sourceCatalog.category,emoji:sourceCatalog.emoji,
      coin_price:Number(sourceCatalog.coin_price),active:true,
      image_url:sourceCatalog.image_url,model_url:sourceCatalog.model_url,
      animation_key:sourceCatalog.animation_key,original_animation_preset:sourceCatalog.animation_preset,
      sound_preset:sourceCatalog.sound_preset,original_animation_duration_ms:sourceCatalog.animation_duration_ms,
      motion_preset:extracted?.animation_preset||fallback.preset,
      motion_effect:extracted?.animation_effect||fallback.effect,
      motion_duration_ms:extracted?.animation_duration_ms||Math.round(Number.parseFloat(fallback.duration)*1000),
      motion_phase:fallback.phase,motion_phase_index:fallback.phaseIndex,
      motion_seed:seed,
      source_kind:extracted?"captured-gallery-still":"canonical-catalogue-profile",
      source_image:extracted?.source_image||null,
      source_region:extracted?.source_region||null,
      source_capture_references:extracted?.sources||[],
      ocr_confidence:extracted?.ocr_confidence??null,
      artwork_reference:artwork?{
        path:"assets/Artwork/"+artwork.artwork,sha256:artwork.sha256,
        source_primary:artwork.source_primary,warnings:artwork.warnings||[],
        review_status:artwork.review_status
      }:null,
      visual_review_status:extracted?"needs_visual_review":"catalogue-original-artwork"
    });
  }
  catalogMotionProfiles.sort((a,b)=>a.name.localeCompare(b.name)||a.code.localeCompare(b.code));
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
    catalog_motion_index_path:"assets/animations/gifts/catalog-motion-index.json",catalog_motion_profile_count:catalogMotionProfiles.length,
    processing_notes:[
      "Each recognized gift is extracted into its own category folder with an optimized transparent WebP poster and an individual animated SVG.",
      "Matching is by normalized gift name against the existing Minglora gift catalog; unmatched captures receive a stable slug ID.",
      "Repeated names are deduplicated into one asset record with all capture source references retained; the highest-confidence crop is selected.",
      "Artwork crops end above detected label text. Poster and animation files receive SHA-256 digests for duplicate auditing.",
      "OCR confidence, unmatched names, generic categories and short uncertain labels are surfaced as quality-review flags.",
      "Source captures are screenshots, not original animation frame sequences. SVG motion is an original presentation animation and is not a reconstruction of TikTok's proprietary animation or 3D model.",
      "The catalogue motion index includes every active canonical gift. Exact capture matches receive their per-gift capture-derived motion; every other active gift receives a deterministic name/category profile over its original catalogue 3D model. Canonical name, Coin price, image URL, 3D model URL, sound and original animation metadata are preserved; screenshot crops never replace production artwork.",
      "Artwork manifest references, source capture names, source crop coordinates, OCR confidence and review flags are retained for traceability. Generated screenshot crops remain review-only."
    ],
    gifts
  };
  await fs.mkdir(OUTPUT_DIR,{recursive:true});
  await fs.writeFile(path.join(OUTPUT_DIR,"manifest.json"),JSON.stringify(manifest,null,2)+"\n","utf8");
  const motionIndex={
    schema_version:1,generated_at:manifest.generated_at,project:"Minglora Social Network",
    source_directory:"assets/Gifts",artwork_reference_manifest:"assets/Artwork/manifest.json",
    authoritative_catalog:"data/minglora-gift-catalog.json",gifts:catalogMotionProfiles
  };
  const serializedMotionIndex=JSON.stringify(motionIndex,null,2)+"\n";
  await fs.writeFile(path.join(OUTPUT_DIR,"catalog-motion-index.json"),serializedMotionIndex,"utf8");
  await fs.mkdir(path.dirname(PUBLIC_MOTION_INDEX_FILE),{recursive:true});
  await fs.writeFile(PUBLIC_MOTION_INDEX_FILE,serializedMotionIndex,"utf8");
  const report={
    screenshot_count:files.length,detected_occurrences:manifest.detected_occurrences,
    unique_gifts:gifts.length,category_counts:categoryCounts,
    matched_catalog_gifts:matchedCatalogCount,unmatched_catalog_gifts:gifts.length-matchedCatalogCount,
    catalog_motion_profiles:catalogMotionProfiles.length,catalog_motion_captured_profiles:capturedCatalogProfiles,
    catalog_motion_fallback_profiles:fallbackCatalogProfiles,catalog_motion_inactive_matches:inactiveCatalogMatches,
    catalog_motion_invalid_profiles:invalidCatalogProfiles,catalog_motion_duplicate_codes:duplicateCatalogMotionCodes,
    artwork_reference_matches:artworkReferenceMatches,
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
- \`animation.svg\`: self-contained animated SVG presentation with its WebP poster embedded, individually keyed motion and reduced-motion support. It can be displayed through a standard image element.

See \`manifest.json\` for captured gift IDs, categories, original screenshots, crop coordinates, OCR confidence and per-gift extraction paths. See \`catalog-motion-index.json\` for a motion profile for every active canonical gift, including its exact gift code, name, Coin price, original image and 3D model URLs, original animation and sound presets, and Artwork/source references. Exact capture matches receive their individual extracted motion profile; gifts not present in the captures receive a deterministic name/category motion profile over their original 3D model. \`extraction-report.json\` records capture totals, exact catalogue matches, fallback profiles and processing errors.

**Source limitation:** the supplied inputs are still gallery screenshots, not original animation videos or 3D animation files. The SVG motion is an original presentation effect applied to each extracted still; it is not TikTok's proprietary animation. Original 3D motion can only be integrated when the corresponding animation/model sources are supplied. Generated gifts are marked \`needs_visual_review\` and must not be published automatically.

The extractor is repeatable and writes only under \`assets/animations/gifts/\`. It does not modify the source captures, active gift catalog, coin prices, wallets, gift transactions or creator earnings.
`,"utf8");
  console.log(JSON.stringify(report,null,2));
  if(!gifts.length)throw new Error("No gift labels were recognized. Inspect OCR output before accepting extraction.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
