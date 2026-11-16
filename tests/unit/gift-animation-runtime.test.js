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
  assert.ok(effects.includes('fallbackImage.src=gift.image_url'));
  assert.ok(effects.includes('if(!reducedMotion){model.setAttribute("auto-rotate","");model.setAttribute("autoplay","");}'));
  assert.ok(effects.includes('if(options.sound!==false)play(gift)'));
  assert.ok(effects.includes('caption.textContent=gift.name'));
  assert.ok(!effects.includes('gift.coin_price='));
  assert.ok(!effects.includes('gift.emoji||"🎁"'), "missing artwork must never become a cartoon emoji");
  assert.ok(!effects.includes("minglora-gift-fx-emoji"), "shared LIVE effects must not render emoji gift substitutes");
});

test("GLTF load failures fall back to the matching SVG and failed SVGs show an accessible error state", () => {
  const modelErrorListener = effects.indexOf('model.addEventListener("error"');
  const modelSource = effects.indexOf("model.src=gift.model_url");
  assert.ok(modelErrorListener >= 0 && modelErrorListener < modelSource, "attach model error recovery before starting the model request");
  assert.ok(effects.includes("const fallbackImage=createArtworkFallback();model.replaceWith(fallbackImage);fallbackImage.src=gift.image_url;"));
  assert.ok(effects.includes('image.addEventListener("error"'));
  assert.ok(effects.includes('createUnavailableNotice("Gift artwork unavailable")'));
  assert.ok(effects.includes('notice.setAttribute("role","status")'));
  assert.ok(effects.includes('event?.detail?.type==="webglcontextlost"'));
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

test("Djembe Master uses a dedicated synchronized hand-drum sound treatment", () => {
  assert.ok(effects.includes("function playDjembe(c,now,seed)"));
  assert.ok(effects.includes('gift.code==="djembe-master-1v3jzkm"'));
  assert.ok(effects.includes("noise.buffer=createGiftNoise(c,seed,0.23)"));
  assert.ok(effects.includes("body.frequency.exponentialRampToValueAtTime(61,now+.17)"));
});

test("Palm Breeze uses a dedicated synchronized breeze-and-chime sound treatment", () => {
  assert.ok(effects.includes("function playPalmBreeze(c,now,seed)"));
  assert.ok(effects.includes('gift.code==="palm-breeze-gknyt0"'));
  assert.ok(effects.includes("wind.buffer=createGiftNoise(c,seed,0.82)"));
  assert.ok(effects.includes("notes=[659.25,880,1174.66]"));
});

test("Djembe and Palm Breeze sound design stays local, action-triggered and fallback-safe", () => {
  assert.ok(effects.includes("function createGiftNoise(c,seed,durationSeconds)"));
  assert.ok(effects.includes("if(options.sound!==false)play(gift)"));
  assert.ok(effects.includes("const p=profiles[gift.category]||profiles.other"));
  assert.ok(!effects.includes("new Audio("), "gift audio must not fetch unreviewed remote recordings");
});

test("Djembe and Palm Breeze use subject-specific motion choreography on the existing visual trigger", () => {
  assert.ok(effects.includes('gift.code==="djembe-master-1v3jzkm"?"djembe-strike"'));
  assert.ok(effects.includes('gift.code==="palm-breeze-gknyt0"?"palm-canopy-sway"'));
  assert.ok(effects.includes('if(preset==="djembe-strike")return'));
  assert.ok(effects.includes('if(preset==="palm-canopy-sway")return'));
  assert.ok(effects.includes("motionElement.animate(semanticFrames"));
  assert.ok(effects.includes('window.matchMedia?.("(prefers-reduced-motion: reduce)")'));
});


test("Gamer Otter has dedicated action-triggered arcade sound and subject motion", () => {
  assert.ok(effects.includes("function playGamerOtter(c,now,seed)"));
  assert.ok(effects.includes('gift.code==="gamer-otter-100-mgl"'));
  assert.ok(effects.includes("notes=[523.25,659.25,783.99,1046.5]"));
  assert.ok(effects.includes('gift.code==="gamer-otter-100-mgl"?"gamer-otter-cheer":'));
  assert.ok(effects.includes('if(preset==="gamer-otter-cheer")return'));
  assert.ok(effects.includes("motionElement.animate(semanticFrames"));
  assert.ok(effects.includes('if(options.sound!==false)play(gift)'));
  assert.ok(effects.includes('window.matchMedia?.("(prefers-reduced-motion: reduce)")'));
});


test("LIVE Island has a dedicated tide animation and locally synthesized surf/chime sound", () => {
  assert.ok(effects.includes("function playLiveIsland(c,now,seed)"));
  assert.ok(effects.includes('gift.code==="live-island-rmn3mc"'));
  assert.ok(effects.includes("surf.buffer=createGiftNoise(c,seed,1.08)"));
  assert.ok(effects.includes("notes=[392,493.88,587.33,783.99]"));
  assert.ok(effects.includes('gift.code==="live-island-rmn3mc"?"island-tide":'));
  assert.ok(effects.includes('if(preset==="island-tide")return'));
  assert.ok(effects.includes("motionElement.animate(semanticFrames"));
  assert.ok(effects.includes('if(options.sound!==false)play(gift)'));
  assert.ok(effects.includes('window.matchMedia?.("(prefers-reduced-motion: reduce)")'));
});


test("Crystal Crown has dedicated royal shimmer choreography and local faceted-glass chimes", () => {
  assert.ok(effects.includes("function playCrystalCrown(c,now,seed)"));
  assert.ok(effects.includes('gift.code==="crystal-crown-1itryeu"'));
  assert.ok(effects.includes("notes=[523.25,659.25,783.99,1046.5,1318.51]"));
  assert.ok(effects.includes("shimmer.buffer=createGiftNoise(c,seed,0.62)"));
  assert.ok(effects.includes('gift.code==="crystal-crown-1itryeu"?"crown-lustre":'));
  assert.ok(effects.includes('if(preset==="crown-lustre")return'));
  assert.ok(effects.includes("motionElement.animate(semanticFrames"));
  assert.ok(effects.includes('if(options.sound!==false)play(gift)'));
  assert.ok(effects.includes('window.matchMedia?.("(prefers-reduced-motion: reduce)")'));
});


test("Phoenix has a dedicated rising-flame choreography and locally synthesized firebird sound", () => {
  assert.ok(effects.includes("function playPhoenix(c,now,seed)"));
  assert.ok(effects.includes('gift.code==="phoenix-wep6uk"'));
  assert.ok(effects.includes("notes=[220,293.66,392,523.25,659.25]"));
  assert.ok(effects.includes("flame.buffer=createGiftNoise(c,seed,1.12)"));
  assert.ok(effects.includes('gift.code==="phoenix-wep6uk"?"phoenix-rise":'));
  assert.ok(effects.includes('if(preset==="phoenix-rise")return'));
  assert.ok(effects.includes("motionElement.animate(semanticFrames"));
  assert.ok(effects.includes('if(options.sound!==false)play(gift)'));
  assert.ok(effects.includes('window.matchMedia?.("(prefers-reduced-motion: reduce)")'));
});


test("Beach Maracas uses dedicated Caribbean shaker rhythm and tonal accent playback", () => {
  assert.ok(effects.includes("function playBeachMaracas(c,now,seed)"));
  assert.ok(effects.includes('gift.code==="beach-maracas-1exxoag"'));
  assert.ok(effects.includes("rattle.buffer=createGiftNoise(c,seed,.92)"));
  assert.ok(effects.includes("notes=[261.63,392,523.25,659.25]"));
  assert.ok(effects.includes('gift.code==="beach-maracas-1exxoag"?"maraca-rhythm":'));
  assert.ok(effects.includes('if(preset==="maraca-rhythm")return'));
  assert.ok(effects.includes("motionElement.animate(semanticFrames"));
  assert.ok(effects.includes('if(options.sound!==false)play(gift)'));
  assert.ok(effects.includes('window.matchMedia?.("(prefers-reduced-motion: reduce)")'));
});


test("Royal Lions Scepter has a dedicated regal rise motion and locally synthesized lion/fanfare sound", () => {
  assert.ok(effects.includes("function playRoyalLionsScepter(c,now,seed)"));
  assert.ok(effects.includes('gift.code==="royal-lions-scepter-15000-mgl"'));
  assert.ok(effects.includes("growl.buffer=createGiftNoise(c,seed,1.04)"));
  assert.ok(effects.includes("notes=[196,293.66,392,587.33,783.99]"));
  assert.ok(effects.includes('gift.code==="royal-lions-scepter-15000-mgl"?"lion-scepter-rise":'));
  assert.ok(effects.includes('preset==="lion-scepter-rise"'));
  assert.ok(effects.includes("motionElement.animate(semanticFrames"));
  assert.ok(effects.includes('if(options.sound!==false)play(gift)'));
  assert.ok(effects.includes('window.matchMedia?.("(prefers-reduced-motion: reduce)")'));
});

 
test("Pop Parrot uses a dedicated soaring choreography and local synthesized chirp", () => {
  assert.ok(effects.includes("function playPopParrot(c,now,seed)"));
  assert.ok(effects.includes('if(gift.code==="pop-parrot-alp4e8")return playPopParrot(c,now,seed);'));
  assert.ok(effects.includes('gift.code==="pop-parrot-alp4e8"?"parrot-swoop":'));
  assert.ok(effects.includes('if(preset==="parrot-swoop")return'));
  assert.ok(effects.includes("motionElement.animate(semanticFrames"));
  assert.ok(effects.includes('window.matchMedia?.("(prefers-reduced-motion: reduce)")'));
});
