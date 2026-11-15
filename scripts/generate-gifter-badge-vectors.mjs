#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const PALETTES = [{"bg1":"#4b70ad","bg2":"#304c83","border":"#9bb9ed","inner":"#d7e6ff","gem1":"#eff7ff","gem2":"#9ec5f5","gem3":"#628fcf","gem4":"#d7eaff","stroke":"#f4f9ff","accent":"#c6dcff"},{"bg1":"#3262b4","bg2":"#173e83","border":"#9bb9ff","inner":"#d8e7ff","gem1":"#f4f9ff","gem2":"#8fbbf5","gem3":"#4d80c7","gem4":"#cfe6ff","stroke":"#f3f8ff","accent":"#b9d4ff"},{"bg1":"#3e62c4","bg2":"#243e9f","border":"#a9c1ff","inner":"#dce8ff","gem1":"#f0f7ff","gem2":"#9ebdf8","gem3":"#627ee2","gem4":"#dbe4ff","stroke":"#f7f9ff","accent":"#d4e1ff"},{"bg1":"#3e4ac4","bg2":"#252d9b","border":"#b0b8ff","inner":"#e1e6ff","gem1":"#f2f6ff","gem2":"#a8b8fb","gem3":"#6a75e6","gem4":"#d8e1ff","stroke":"#f7f8ff","accent":"#d9e2ff"},{"bg1":"#2728c6","bg2":"#1715a7","border":"#a8a1ff","inner":"#e5dcff","gem1":"#ffe4ff","gem2":"#dc9cf5","gem3":"#8c65df","gem4":"#f5cbff","stroke":"#fff0ff","accent":"#ffd8ff"},{"bg1":"#321bc8","bg2":"#1c0ba9","border":"#c0a9ff","inner":"#e9dbff","gem1":"#ffe5ef","gem2":"#f2a4d2","gem3":"#9d70ed","gem4":"#ffe2a6","stroke":"#fff3f8","accent":"#ffe0a8"},{"bg1":"#5915c8","bg2":"#3606a8","border":"#d5aaff","inner":"#f0dfff","gem1":"#ffe4fb","gem2":"#e79ae8","gem3":"#a16ae2","gem4":"#ffe29a","stroke":"#fff0ff","accent":"#ffe5a9"},{"bg1":"#7420c8","bg2":"#4b0b9d","border":"#f0c8ff","inner":"#f8e5ff","gem1":"#fff0c9","gem2":"#e9a2f4","gem3":"#9875ec","gem4":"#ffe5a1","stroke":"#fff8ee","accent":"#fff0ad"},{"bg1":"#8a1bc9","bg2":"#5b078f","border":"#ffd4ff","inner":"#fae5ff","gem1":"#fff0bd","gem2":"#ee9ee8","gem3":"#a877ee","gem4":"#ffd78e","stroke":"#fff8e9","accent":"#fff1a8"},{"bg1":"#a12bbd","bg2":"#5c087c","border":"#ffe7a6","inner":"#fff0c6","gem1":"#fff4bd","gem2":"#ffbfdf","gem3":"#d58af4","gem4":"#ffe18c","stroke":"#fff8e7","accent":"#fff3b0"}];
function renderBadgeSymbol(level){
 if(!Number.isInteger(level)||level<1||level>50)throw new RangeError("Gifter badge level must be 1–50.");
 const tier=level<=9?0:level<=14?1:level<=19?2:level<=24?3:level<=29?4:level<=34?5:level<=39?6:level<=44?7:level<=49?8:9;
 const p=PALETTES[tier],key=String(level).padStart(2,"0"),last=level===50;
 const pill=last?{x:5,y:5,w:160,h:66,rx:16,iconX:41,textX:123,textY:51,font:34,scale:1.16}:{x:38,y:16,w:94,h:44,rx:12,iconX:64,textX:108,textY:48,font:27,scale:1};
 let gem="";
 if(tier===0){
  gem=`<path d="M64 20 L78 52 L50 52 Z" fill="url(#gem-${key})" stroke="${p.stroke}" stroke-width="2.1" stroke-linejoin="round"/><path d="M64 21 L64 50 L51 51 Z" fill="${p.gem2}" opacity=".83"/><path d="M64 21 L77 51 L64 50 Z" fill="${p.gem3}" opacity=".74"/><path d="M64 21 L64 50" fill="none" stroke="${p.gem1}" stroke-width="1.45" stroke-linecap="round"/><path d="M51 51 L64 37 L77 51" fill="none" stroke="${p.gem1}" stroke-width="1.35" stroke-linejoin="round"/><path d="M59 32 L64 21 L69 32" fill="none" stroke="#fff" stroke-opacity=".82" stroke-width="1.05"/>`;
 }else if(tier===1){
  gem=`<path d="M64 19 L79 52 L49 52 Z" fill="url(#gem-${key})" stroke="${p.stroke}" stroke-width="2" stroke-linejoin="round"/><path d="M64 20 L64 36 L51 50 Z" fill="${p.gem2}" opacity=".88"/><path d="M64 20 L77 50 L64 36 Z" fill="${p.gem3}" opacity=".88"/><path d="M51 50 L64 36 L77 50 Z" fill="${p.gem4}" opacity=".9"/><path d="M64 20 L64 36 M51 50 L77 50" fill="none" stroke="${p.stroke}" stroke-width="1.45"/>`;
 }else if(tier<=4){
  gem=`<path d="M64 19 L79 38 L64 57 L49 38 Z" fill="url(#gem-${key})" stroke="${p.stroke}" stroke-width="2" stroke-linejoin="round"/><path d="M64 20 L70 38 L64 56 L58 38 Z" fill="${p.gem2}" opacity=".84"/><path d="M64 20 L79 38 L70 38 Z" fill="${p.gem1}" opacity=".84"/><path d="M79 38 L64 57 L70 38 Z" fill="${p.gem3}" opacity=".9"/><path d="M64 57 L49 38 L58 38 Z" fill="${p.gem4}" opacity=".9"/><path d="M49 38 L64 20 L58 38 Z" fill="${p.gem2}" opacity=".68"/><path d="M64 20 L70 38 L64 57 L58 38 Z" fill="none" stroke="${p.stroke}" stroke-width="1.05"/><path d="M49 38 H79 M64 20 V57" fill="none" stroke="${p.stroke}" stroke-opacity=".86" stroke-width="1.15"/>`;
 }else if(tier<=6){
  gem=`<path d="M64 18 L77 26 L80 39 L64 58 L48 39 L51 26 Z" fill="url(#gem-${key})" stroke="${p.stroke}" stroke-width="2" stroke-linejoin="round"/><path d="M64 18 L64 38 L51 26 Z" fill="${p.gem1}" opacity=".92"/><path d="M64 18 L77 26 L64 38 Z" fill="${p.gem2}" opacity=".94"/><path d="M77 26 L80 39 L64 58 L64 38 Z" fill="${p.gem3}" opacity=".87"/><path d="M48 39 L51 26 L64 38 L64 58 Z" fill="${p.gem4}" opacity=".82"/><path d="M51 26 L77 26 M48 39 L80 39 M64 18 V58 M51 26 L64 38 L77 26" fill="none" stroke="${p.stroke}" stroke-width="1.05" stroke-linejoin="round"/><path d="M58 25 L64 20 L70 25" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.2"/>`;
 }else if(tier===7){
  gem=`<path d="M64 17 L75 23 L81 37 L75 51 L64 58 L53 51 L47 37 L53 23 Z" fill="url(#gem-${key})" stroke="${p.stroke}" stroke-width="2.1" stroke-linejoin="round"/><path d="M64 18 L75 23 L64 37 L53 23 Z" fill="${p.gem1}" opacity=".94"/><path d="M75 23 L81 37 L64 37 Z" fill="${p.gem2}" opacity=".92"/><path d="M81 37 L75 51 L64 58 L64 37 Z" fill="${p.gem3}" opacity=".94"/><path d="M64 58 L53 51 L47 37 L64 37 Z" fill="${p.gem4}" opacity=".9"/><path d="M53 23 L64 37 L75 23 M47 37 H81 M64 18 V58" fill="none" stroke="${p.stroke}" stroke-width="1.1"/><path d="M60 30 L64 26 L68 30" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>`;
 }else{
  gem=`<path d="M64 16 L72 21 L81 31 L78 45 L64 59 L50 45 L47 31 L56 21 Z" fill="url(#gem-${key})" stroke="${p.stroke}" stroke-width="2.2" stroke-linejoin="round"/><path d="M64 16 L72 21 L64 36 L56 21 Z" fill="${p.gem1}" opacity=".98"/><path d="M72 21 L81 31 L64 36 Z" fill="${p.gem2}" opacity=".94"/><path d="M81 31 L78 45 L64 59 L64 36 Z" fill="${p.gem3}" opacity=".92"/><path d="M64 59 L50 45 L47 31 L64 36 Z" fill="${p.gem4}" opacity=".9"/><path d="M47 31 L56 21 L64 36 Z" fill="${p.gem2}" opacity=".78"/><path d="M64 16 L64 59 M47 31 L81 31 M50 45 L78 45 M56 21 L72 21" fill="none" stroke="${p.stroke}" stroke-width="1.1"/><path d="M60 25 L64 20 L68 25 M58 45 L64 51 L70 45" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.05" stroke-linecap="round"/>`;
 }
 const transform=`translate(${pill.iconX} 38) scale(${pill.scale}) translate(-64 -38)`;
 const finalAccent=last?`<rect x="8" y="8" width="154" height="60" rx="13" fill="none" stroke="${p.accent}" stroke-width="1.05" opacity=".7"/><path d="M18 13 H48 M122 63 H151" stroke="#fff7d7" stroke-width="1.2" stroke-linecap="round" opacity=".76"/><path d="M22 19 l3 -5 3 5 -3 5 Z M148 53 l2.5 -4 2.5 4 -2.5 4 Z" fill="${p.accent}" opacity=".92"/>`:"";
 return `<symbol id="level-${key}" viewBox="0 0 170 76" overflow="visible">
  <title>Level ${level} Gifter Badge</title>
  <desc>Minglora Gifter Level ${level}, original tier colours rendered as crisp vector artwork.</desc>
  <defs>
   <linearGradient id="pill-${key}" x1="0" y1="0" x2=".12" y2="1"><stop offset="0" stop-color="${p.bg1}"/><stop offset="1" stop-color="${p.bg2}"/></linearGradient>
   <linearGradient id="sheen-${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset=".48" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
   <linearGradient id="gem-${key}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.gem1}"/><stop offset=".48" stop-color="${p.gem2}"/><stop offset="1" stop-color="${p.gem3}"/></linearGradient>
   <filter id="shadow-${key}" x="-20%" y="-35%" width="140%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="blur"/><feOffset dy="1.2" result="offset"/><feComponentTransfer><feFuncA type="linear" slope=".35"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
   <filter id="text-shadow-${key}" x="-20%" y="-35%" width="140%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation=".55" result="blur"/><feOffset dy=".65" result="offset"/><feMerge><feMergeNode in="offset"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <g filter="url(#shadow-${key})">
   <rect x="${pill.x}" y="${pill.y}" width="${pill.w}" height="${pill.h}" rx="${pill.rx}" fill="url(#pill-${key})" stroke="${p.border}" stroke-width="${last?2:1.35}"/>
   <rect x="${pill.x+1.3}" y="${pill.y+1.3}" width="${pill.w-2.6}" height="${pill.h-2.6}" rx="${pill.rx-1.2}" fill="url(#sheen-${key})" opacity=".9"/>
   <rect x="${pill.x+2.1}" y="${pill.y+2.1}" width="${pill.w-4.2}" height="${pill.h-4.2}" rx="${pill.rx-2}" fill="none" stroke="${p.inner}" stroke-opacity=".38" stroke-width=".8"/>
   <path d="M${pill.x+pill.rx} ${pill.y+1.5} H${pill.x+pill.w-pill.rx} Q${pill.x+pill.w-1.5} ${pill.y+1.5} ${pill.x+pill.w-1.5} ${pill.y+pill.rx} V${pill.y+pill.h*.38}" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width="1.05" stroke-linecap="round"/>
  </g>
  <g transform="${transform}" stroke-linecap="round" stroke-linejoin="round">${gem}<path d="M55 26 l2 -3 2 3" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="1.05"/></g>
  <text x="${pill.textX}" y="${pill.textY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${pill.font}" font-weight="800" letter-spacing="-.7" fill="#fff" filter="url(#text-shadow-${key})">${level}</text>
  ${finalAccent}
 </symbol>`;
}
function renderGifterBadgeSprite(){
 const symbols=Array.from({length:50},(_,index)=>renderBadgeSymbol(index+1)).join("\n");
 return `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="76" viewBox="0 0 170 76" aria-hidden="true"><title>Minglora Gifter Level Badges</title>${symbols}</svg>\n`;
}
const outputDirectory = path.resolve(process.cwd(), "public/assets/gifter-badges");
export async function generateGifterBadgeVectors() {
  await fs.mkdir(outputDirectory, { recursive: true });
  const outputFile = path.join(outputDirectory, "badges.svg");
  await fs.writeFile(outputFile, renderGifterBadgeSprite(), "utf8");
  return { outputFile, count: 50 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await generateGifterBadgeVectors();
  process.stdout.write(`Generated ${result.count} vector Gifter badges in ${result.outputFile}\\n`);
}
export { renderBadgeSymbol, renderGifterBadgeSprite };
