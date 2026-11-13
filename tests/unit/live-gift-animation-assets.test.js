import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const source=JSON.parse(read("assets/animations/gifts/animation-catalog.json"));
const presetIndex=JSON.parse(read("public/assets/animations/gifts/preset-index.json"));
const motionIndex=JSON.parse(read("public/assets/animations/gifts/catalog-motion-index.json"));
const runtime=read("public/gift-effects.js");
const worker=read("public/sw.js");
const animationGenerator=path.join(root,"scripts/generate-live-gift-animation-assets.mjs");
const motionGenerator=path.join(root,"scripts/generate-live-gift-motion-index.mjs");

test("17 source animation presets have individual public files and valid keyframes",()=>{
  assert.equal(source.presets.length,17);
  assert.equal(presetIndex.preset_count,17);
  for(const preset of source.presets){
    const file="public/assets/animations/gifts/presets/"+preset.id+".json";
    assert.ok(fs.existsSync(path.join(root,file)),"missing "+file);
    const output=JSON.parse(read(file));
    assert.equal(output.id,preset.id);
    assert.deepEqual(output.keyframes,preset.keyframes);
    assert.equal(output.keyframes[0].offset,0);
    assert.equal(output.keyframes.at(-1).offset,1);
  }
});
test("every active gift has its own valid and distinct lazy-loaded motion asset",()=>{
  assert.equal(motionIndex.gifts.length,motionIndex.active_gift_count);
  assert.equal(motionIndex.per_gift_motion_asset_count,motionIndex.active_gift_count);
  const identities=new Set();
  const signatures=new Set();
  for(const gift of motionIndex.gifts){
    const expected="/assets/animations/gifts/per-gift/"+gift.code+".json";
    assert.equal(gift.motion_asset_url,expected);
    assert.ok(!identities.has(gift.code),"duplicate gift code "+gift.code);
    identities.add(gift.code);
    const file="public/assets/animations/gifts/per-gift/"+gift.code+".json";
    assert.ok(fs.existsSync(path.join(root,file)),"missing "+file);
    const asset=JSON.parse(read(file));
    assert.equal(asset.code,gift.code);
    assert.equal(asset.animation_key,gift.animation_key);
    assert.equal(asset.generator,"Minglora LIVE per-gift motion generator");
    assert.ok(Array.isArray(asset.keyframes)&&asset.keyframes.length>=3);
    assert.equal(asset.keyframes[0].offset,0);
    assert.equal(asset.keyframes.at(-1).offset,1);
    for(let i=1;i<asset.keyframes.length;i++)assert.ok(asset.keyframes[i].offset>asset.keyframes[i-1].offset);
    const signature=JSON.stringify(asset.keyframes);
    assert.ok(!signatures.has(signature),"identical motion keyframes for "+gift.code);
    signatures.add(signature);
  }
  assert.equal(identities.size,motionIndex.active_gift_count);
  assert.equal(signatures.size,motionIndex.active_gift_count);
});
test("the LIVE runtime lazy-loads exact same-origin gift motions and falls back to presets",()=>{
  assert.ok(runtime.includes("/assets/animations/gifts/per-gift/"+'"+code+".json'));
  assert.ok(runtime.includes("async function loadPerGiftMotionAsset(gift)"));
  assert.ok(runtime.includes("asset?.keyframes||buildPreviewFrames"));
  assert.ok(runtime.includes("function buildPreviewFrames(preset,v)"));
  assert.ok(runtime.includes('cache:"force-cache"'));
});
test("the service worker caches the preset index and every shared preset; generators are deterministic",()=>{
  assert.ok(worker.includes("preset-index.json"));
  assert.ok(worker.includes("SHELL.push('/assets/animations/gifts/presets/'+preset+'.json')"));
  const precacheIds=source.presets.map(preset=>preset.id).sort();
  assert.ok(worker.includes(JSON.stringify(precacheIds)));
  execFileSync(process.execPath,[animationGenerator,"--check"],{stdio:"pipe"});
  execFileSync(process.execPath,[motionGenerator,"--check"],{stdio:"pipe"});
});
