import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const styles = read("public/styles.css");
const liveStyles = read("public/live-gift-access.css");
const giftStudio = read("public/gifts.js");
const liveApp = read("public/app.js");
const giftEffects = read("public/gift-effects.js");
const html = read("public/index.html");
const worker = read("public/sw.js");

test("Gift Studio thumbnails and LIVE gift art use full-fit containment, never cover cropping", () => {
  assert.match(styles, /\.gift-card-image\{[^}]*object-fit:contain[^}]*\}/);
  assert.doesNotMatch(styles, /\.gift-card-image\{[^}]*object-fit:cover[^}]*\}/);
  assert.match(styles, /\.minglora-gift-fx-model\{[^}]*object-fit:contain[^}]*\}/);
  assert.match(liveStyles, /\.live-gift-preview-model,\.live-gift-preview-image,\.live-gift-preview-fallback\{[^}]*object-fit:contain[^}]*\}/);
  assert.match(styles, /\.live-gift-image\{[^}]*object-fit:contain[^}]*\}/);
});

test("Gift Studio hides broken/non-canonical artwork and disables sending until its original image loads", () => {
  assert.ok(giftStudio.includes("function hasCanonicalGiftArtwork(g)"));
  assert.ok(giftStudio.includes("state.unavailableArtwork"));
  assert.ok(giftStudio.includes("image.complete&&image.naturalWidth>0&&image.naturalHeight>0"));
  assert.ok(giftStudio.includes("Complete gift artwork could not be loaded"));
  assert.ok(giftStudio.includes("grid.querySelectorAll(\"img[data-gift-artwork-code]\")"));
  assert.ok(!giftStudio.includes("The artwork image could not load. Showing the gift icon instead."));
  assert.ok(!giftStudio.includes("gift-emoji-preview"));
});

test("LIVE picker hides broken/non-canonical artwork and refuses send until complete art loads", () => {
  assert.ok(liveApp.includes("const liveGiftArtworkUnavailable=new Set()"));
  assert.ok(liveApp.includes("const liveGiftArtworkReady=new Set()"));
  assert.ok(liveApp.includes("const liveGiftHasCanonicalArtwork=item=>"));
  assert.ok(liveApp.includes("data-live-gift-artwork-code"));
  assert.ok(liveApp.includes("Complete artwork unavailable — gift withheld"));
  assert.ok(liveApp.includes("!liveGiftArtworkReady.has(String(gift.code))"));
  assert.ok(!liveApp.includes("live-gift-card-emoji"));
});

test("the app and service worker versions move together for artwork and runtime changes", () => {
  const appRef = html.match(/app\.js\?v=[^"']+/)?.[0] || "";
  const giftsRef = html.match(/gifts\.js\?v=[^"']+/)?.[0] || "";
  const stylesRef = html.match(/styles\.css\?v=[^"']+/)?.[0] || "";
  assert.ok(appRef.includes("complete-gift-artwork-gate-1"));
  assert.ok(giftsRef.includes("complete-gift-artwork-gate-1"));
  assert.ok(stylesRef.includes("gift-artwork-contain-1"));
  assert.ok(worker.includes(appRef));
  assert.ok(worker.includes(giftsRef));
  assert.ok(worker.includes(stylesRef));
  assert.match(worker, /const CACHE_NAME='minglora-shell-v306-self-updating-1';/);
});


test("incoming LIVE gift events only animate a successfully loaded canonical catalogue image", () => {
  assert.ok(liveApp.includes("const catalogueGift=liveGiftCatalogue.find(item=>String(item.code)===code)"));
  assert.ok(liveApp.includes("const expectedImage='/assets/gifts/catalog/'+code+'.svg'"));
  assert.ok(liveApp.includes("const expectedModel='/assets/gifts/catalog/'+code+'.gltf'"));
  assert.ok(liveApp.includes("const imageProbe=new Image()"));
  const eventStart=liveApp.indexOf("function presentLiveGiftEvent(event){");
  const eventEnd=liveApp.indexOf("function renderLiveTopGifters",eventStart);
  const eventHandler=liveApp.slice(eventStart,eventEnd);
  assert.ok(eventHandler.indexOf("rememberLiveGiftEvent(eventId)")<eventHandler.indexOf("new Image()"),"deduplicate before starting a potentially retried artwork request");
  assert.ok(eventHandler.indexOf("liveGiftEventsLastSeenAt=createdAt")<eventHandler.indexOf("new Image()"),"advance the event cursor even when artwork fails");
  assert.ok(liveApp.includes("imageProbe.naturalWidth<1||imageProbe.naturalHeight<1"));
  assert.ok(liveApp.includes("window.MingloraGiftFX?.mount(stage,gift)"));
  assert.ok(!liveApp.includes("image_url:String(event.imageUrl||event.image_url||'')"));
  assert.ok(!liveApp.includes("model_url:String(event.modelUrl||event.model_url||'')"));
});

test("the gift-effect runtime requires canonical artwork and falls back only to that gift's original image", () => {
  assert.ok(giftEffects.includes("function hasCanonicalGiftArtwork(gift)"));
  assert.ok(giftEffects.includes("if(!parent||!gift||!hasCanonicalGiftArtwork(gift))return null;"));
  assert.ok(giftEffects.includes("fallbackImage.src=gift.image_url"));
  assert.ok(giftEffects.includes("model.addEventListener(\"error\","));
  assert.ok(giftEffects.includes("if(modelFailed)fallbackImage.hidden=false"));
  assert.ok(giftEffects.includes("fallbackFailed=false"));
  assert.ok(giftEffects.includes("if(modelFailed)outer.remove()"));
  assert.ok(!giftEffects.includes("emoji.textContent=gift.emoji||\"🎁\""));
  assert.ok(giftEffects.includes("if(!gift||!hasCanonicalGiftArtwork(gift))return false;"));
});
