import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const app = read("public/app.js");
const generator = read("scripts/generate-minglora-gifts.mjs");
const manifestGenerator = read("scripts/generate-minglora-live-asset-manifest.mjs");
const liveCss = read("public/live-gift-access.css");

test("LIVE picker builds gift icon paths from validated canonical catalogue codes", () => {
  assert.ok(app.includes("function liveGiftIconUrl(gift)"));
  assert.ok(app.includes("\"-icon.svg\""));
  assert.ok(app.includes("data-live-gift-icon"));
  assert.ok(app.includes("data-gift-code="));
  assert.ok(!app.includes("const art=gift.image_url?"));
});

test("failed gift icon requests fall back to full Minglora artwork and then an accessible state", () => {
  assert.ok(app.includes("fullArtworkFallbackAttempted"));
  assert.ok(app.includes("image.replaceWith(unavailable)"));
  assert.ok(app.includes('unavailable.setAttribute("role","status")'));
  assert.ok(app.includes('unavailable.textContent="Artwork unavailable"'));
  assert.ok(liveCss.includes(".live-gift-card-unavailable"));
});

test("the gift build emits a separate subject SVG without changing full-art or GLTF paths", () => {
  assert.ok(generator.includes("function svgArt(gift, options = {})"));
  assert.ok(generator.includes("const iconOnly = options.iconOnly === true"));
  assert.ok(generator.includes("svgArt(gift,{iconOnly:true})"));
  assert.ok(generator.includes('gift.code+"-icon.svg"'));
  assert.ok(generator.includes('gift.code+".svg"'));
  assert.ok(generator.includes('gift.code+".gltf"'));
  assert.ok(manifestGenerator.includes("transparent_gift_icon_file_count"));
  assert.ok(manifestGenerator.includes("gift_icon_error_fallback_to_full_artwork: true"));
});
