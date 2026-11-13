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
  assert.match(worker, /const CACHE_NAME='minglora-shell-v305-self-updating-1';/);
});
