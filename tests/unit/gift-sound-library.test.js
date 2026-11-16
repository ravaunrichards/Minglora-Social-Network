import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { before, test } from "node:test";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const output=path.join(root,"public/assets/gift-sounds");
const generator=path.join(root,"scripts/generate-minglora-gift-sounds.mjs");
const fx=readFileSync(path.join(root,"public/gift-effects.js"),"utf8");
const giftsUi=readFileSync(path.join(root,"public/gifts.js"),"utf8");
const worker=readFileSync(path.join(root,"public/sw.js"),"utf8");
const html=readFileSync(path.join(root,"public/index.html"),"utf8");
const expected=[
 "rose-4ieccm","hibiscus-5-mgl","djembe-master-1v3jzkm","palm-breeze-gknyt0",
 "gamer-otter-100-mgl","live-island-rmn3mc","crystal-crown-1itryeu","phoenix-wep6uk",
 "beach-maracas-1exxoag","royal-lions-scepter-15000-mgl","baseball-orcdx9",
 "crocodile-tnyf2j","dolphin-4bkejj","maracas-1wegi7n","pop-parrot-alp4e8"
];
before(()=>execFileSync(process.execPath,[generator],{cwd:root,stdio:"pipe"}));
function manifest(){return JSON.parse(readFileSync(path.join(output,"manifest.json"),"utf8"));}

test("gift audio manifest covers all fifteen current bespoke model identities exactly once",()=>{
 const data=manifest(),codes=data.gifts.map(row=>row.gift_code);
 assert.equal(data.count,15);
 assert.deepEqual([...codes].sort(),[...expected].sort());
 assert.equal(new Set(codes).size,15);
 assert.equal(data.format.container,"WAV");
 assert.equal(data.format.codec,"PCM signed 16-bit little-endian");
 assert.equal(data.format.sample_rate_hz,44100);
 assert.equal(data.format.channels,2);
});

test("Crocodile, Dolphin, Maracas and Pop Parrot use separate sound-design branches",()=>{
 const source=readFileSync(generator,"utf8");
 for(const slug of ["crocodile","dolphin","maracas","pop-parrot"])assert.ok(source.includes('g.slug==="'+slug+'"'),"missing unique sound-design branch: "+slug);
 assert.match(source,/Crocodile/);
 assert.match(source,/Dolphin/);
 assert.match(source,/Maracas/);
 assert.match(source,/Pop Parrot/);
});

test("every original WAV is valid stereo PCM with unique bytes and a verified manifest hash",()=>{
 const data=manifest(),hashes=new Set(),urls=new Set();
 for(const row of data.gifts){
  const file=path.join(output,row.filename),bytes=readFileSync(file),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const ascii=(offset,length)=>bytes.toString("ascii",offset,offset+length);
  assert.equal(ascii(0,4),"RIFF",row.gift_code);
  assert.equal(ascii(8,4),"WAVE",row.gift_code);
  assert.equal(view.getUint16(20,true),1,row.gift_code);
  assert.equal(view.getUint16(22,true),2,row.gift_code);
  assert.equal(view.getUint32(24,true),44100,row.gift_code);
  assert.equal(view.getUint16(34,true),16,row.gift_code);
  assert.equal(view.getUint32(40,true),bytes.length-44,row.gift_code);
  assert.equal(statSync(file).size,row.bytes,row.gift_code);
  const hash=createHash("sha256").update(bytes).digest("hex");
  assert.equal(hash,row.sha256,row.gift_code);
  assert.ok(!hashes.has(hash),"duplicate cue: "+row.gift_code);hashes.add(hash);
  assert.ok(!urls.has(row.url),"duplicate cue URL: "+row.gift_code);urls.add(row.url);
  assert.match(row.url,/^\/assets\/gift-sounds\/gifts\/[a-z0-9-]+\.wav\?v=[a-f0-9]{12}$/);
  assert.equal(row.review_status,"generated-review-required");
  assert.match(row.license,/Original Minglora procedural composition/);
  assert.ok(row.duration_ms>=1000&&row.duration_ms<=2200,row.gift_code);
 }
});

test("GiftFX preloads selected same-origin WAVs, caches decode and keeps synthesis fallbacks",()=>{
 assert.match(fx,/function preloadGiftSound\(gift\)/);
 assert.match(fx,/function decodeGiftSound\(gift/);
 assert.match(fx,/giftSoundBuffers/);
 assert.match(fx,/function playCachedGiftSound/);
 assert.match(fx,/playCachedGiftSound\(c,gift,now\)/);
 assert.match(fx,/function playDjembe/);
 assert.match(fx,/function playBeachMaracas/);
 assert.match(giftsUi,/preloadGiftSound\?\.\(gift\)/);
 assert.match(giftsUi,/prime\(g\)/);
 assert.match(giftsUi,/prime\(gift\)/);
 assert.match(fx,/function prime\(gift=null\)/);
 assert.match(fx,/function loadGiftSoundManifest\(\)/);
 assert.match(fx,/giftSoundCodes=new Set\(/);
 assert.match(fx,/giftSoundCodes.has\(code\)/);
 assert.match(fx,/window.MingloraGiftFX=.*preloadGiftSound/);
 assert.ok(worker.includes("minglora-gift-sounds-v1"));
 assert.ok(worker.includes("/gift-effects.js?v=20261116-live-gift-wav-01"));
 assert.ok(html.includes("/gift-effects.js?v=20261116-live-gift-wav-01"));
 assert.ok(worker.includes("minglora-shell-v331-self-updating-1"));
});
