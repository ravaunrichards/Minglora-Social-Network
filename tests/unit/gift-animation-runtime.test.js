import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const effects = read("public/gift-effects.js");
const app = read("public/app.js");
const giftStudio = read("public/gifts.js");
const html = read("public/index.html");
const worker = read("public/sw.js");

test("LIVE and Gift Studio load the canonical per-gift motion index by exact gift code", () => {
  assert.ok(effects.includes('/assets/animations/gifts/catalog-motion-index.json'));
  assert.ok(effects.includes('catalogMotionIndex.get(String(gift.code||""))'));
  assert.ok(effects.includes('motion_preset:profile.motion_preset'));
  assert.ok(app.includes("loadCatalogMotionIndex"));
  assert.ok(giftStudio.includes("loadCatalogMotionIndex"));
});

test("gift animations preserve and play original artwork, 3D models, Coin values and sounds", () => {
  assert.ok(effects.includes("model.src=gift.model_url"));
  assert.ok(effects.includes('img.src=gift.image_url'));
  assert.ok(effects.includes('if(!reducedMotion){model.setAttribute("auto-rotate","");model.setAttribute("autoplay","");}'));
  assert.ok(effects.includes('if(options.sound!==false)play(gift)'));
  assert.ok(effects.includes('caption.textContent=gift.name'));
  assert.ok(!effects.includes('gift.coin_price='));
  assert.ok(!effects.includes('gift.emoji||"🎁"'), "missing artwork must never become a cartoon emoji");
  assert.ok(!effects.includes("minglora-gift-fx-emoji"), "shared LIVE effects must not render emoji gift substitutes");
});

test("each gift receives subject-specific motion and a matching effect layer", () => {
  assert.ok(effects.includes("function buildPreviewFrames(preset,v)"));
  for (const preset of ["firework-burst","rocket-launch","sky-flight","speed-drift","butterfly-flutter","winged-flight","blossom-bloom","heart-pulse","music-rhythm","ocean-drift","sweet-pop","victory-impact","magic-orbit"]) {
    assert.ok(effects.includes(preset), "missing subject motion profile " + preset);
  }
  assert.ok(effects.includes('motionEffect==="petals"'));
  assert.ok(effects.includes('motionEffect==="waves"'));
  assert.ok(effects.includes('motionEffect==="rings"'));
  assert.ok(effects.includes('motionEffect==="bubbles"'));
  assert.ok(effects.includes('motionElement.animate(semanticFrames'));
});

test("gift motion respects reduced-motion preferences and cleans up its overlay", () => {
  assert.ok(effects.includes('window.matchMedia?.("(prefers-reduced-motion: reduce)")'));
  assert.ok(effects.includes('setTimeout(()=>outer.remove(),duration+250)'));
});

test("the current gift animation bundle and canonical motion index are precached together", () => {
  const bundle = html.match(/\/gift-effects\.js\?v=[^"']+/)?.[0] || "";
  assert.ok(bundle, "HTML references the gift effects bundle");
  assert.ok(worker.includes(bundle), "service worker precaches the same gift effects bundle");
  assert.ok(worker.includes("'/assets/animations/gifts/catalog-motion-index.json'"));
  assert.match(worker, /const CACHE_NAME='minglora-shell-v\d+-self-updating-1';/);
});
