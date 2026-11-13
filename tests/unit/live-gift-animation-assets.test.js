import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const source=JSON.parse(read("assets/animations/gifts/animation-catalog.json"));
const index=JSON.parse(read("public/assets/animations/gifts/preset-index.json"));
const runtime=read("public/gift-effects.js");
const worker=read("public/sw.js");
const generator=path.join(root,"scripts/generate-live-gift-animation-assets.mjs");
test("17 source animation presets have individual public files and valid keyframes",()=>{
  assert.equal(source.presets.length,17);
  assert.equal(index.preset_count,17);
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
test("the LIVE runtime loads standalone same-origin presets and keeps inline fallback choreography",()=>{
  assert.ok(runtime.includes("/assets/animations/gifts/preset-index.json"));
  assert.ok(runtime.includes("/assets/animations/gifts/presets/"));
  assert.ok(runtime.includes("motionPresetAssets.get(String(preset||\"\")"));
  assert.ok(runtime.includes("function buildPreviewFrames(preset,v)"));
  assert.ok(runtime.includes("const neutral="));
});
test("the service worker caches the preset index and every file; generated files are deterministic",()=>{
  assert.ok(worker.includes("preset-index.json"));
  for(const preset of source.presets)assert.ok(worker.includes("/assets/animations/gifts/presets/"+preset.id+".json"));
  execFileSync(process.execPath,[generator,"--check"],{stdio:"pipe"});
});
