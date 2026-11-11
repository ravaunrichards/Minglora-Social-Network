import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => readFileSync(path.join(root, file), "utf8");
const giftSoundsRoot = path.join(root, "assets/Gift Sounds");
const runtimeMap = JSON.parse(read("assets/Gift Sounds/gift-code-map.json"));
const candidateMap = JSON.parse(read("assets/Gift Sounds/candidate-mappings.json"));
const catalogue = JSON.parse(read("data/minglora-gift-catalog.json"));
const fx = read("public/gift-effects.js");
const giftsUi = read("public/gifts.js");
const app = read("public/app.js");
const html = read("public/index.html");
const sw = read("public/sw.js");

function slugify(value) {
  return String(value || "").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

test("gift sound runtime map references active Minglora catalogue gift codes only", () => {
  assert.equal(runtimeMap.schema_version, 1);
  assert.equal(runtimeMap.active_gift_catalog_total, catalogue.gifts.filter(gift => gift.active).length);
  assert.equal(runtimeMap.mapped_active_gifts, Object.keys(runtimeMap.gifts_by_code).length);
  for (const [code, entry] of Object.entries(runtimeMap.gifts_by_code)) {
    const gift = catalogue.gifts.find(item => item.code === code);
    assert.ok(gift, "gift code exists in catalogue: " + code);
    assert.equal(gift.active, true, "only active gifts receive runtime mappings: " + code);
    assert.equal(entry.slug, slugify(gift.name), "sound folder aligns to the exact gift name: " + gift.name);
    assert.equal(entry.reviewStatus, "candidate_real_recording_needs_listening_review");
    assert.equal(entry.playbackApproved, false, "candidate sound cannot automatically play to members");
    assert.equal(entry.audioUrl, "/assets/Gift%20Sounds/" + entry.slug + "/sound.mp3");
  }
});

test("every runtime gift code points to a real MP3 file in its matching artwork-named folder", () => {
  for (const [code, entry] of Object.entries(runtimeMap.gifts_by_code)) {
    const file = path.join(giftSoundsRoot, entry.slug, "sound.mp3");
    assert.ok(existsSync(file), code + " has a matching sound.mp3");
    assert.ok(statSync(file).size > 1024, code + " recording is not an empty placeholder");
  }
});

test("candidate audio preview is permitted but unapproved gift event playback remains silent", () => {
  assert.match(fx, /if\(!entry\|\|\(!entry\.playbackApproved&&options\.review!==true\)\)return false;/);
  assert.match(fx, /play\(gift,\{review:true\}\)/);
  assert.match(fx, /if\(options\.sound!==false\)void play\(gift,options\.soundOptions\|\|\{\}\);/);
  assert.doesNotMatch(fx, /createOscillator|const profiles=/);
  assert.match(fx, /createBufferSource/);
  assert.match(fx, /decodeAudioData/);
});

test("Gifts Studio preview and successful send preserve existing gift preview and animation flow", () => {
  assert.match(giftsUi, /MingloraGiftFX\?\.preview\(g\)/);
  assert.match(giftsUi, /MingloraGiftFX\?\.show\(gift\)/);
  assert.match(app, /window\.MingloraGiftFX\?\.mount\(stage,gift\)/);
});

test("gift sound map is versioned, precached and included in the current application shell", () => {
  const effectsVersion = html.match(/src="(\/gift-effects\.js\?v=[^"]+)"/)?.[1] || "";
  assert.match(effectsVersion, /20261111-real-gift-recordings-1/);
  assert.ok(sw.includes("'" + effectsVersion + "'"), "current gift FX script is precached");
  assert.ok(sw.includes("const CACHE_NAME='minglora-shell-v286-real-gift-audio-1'"));
  assert.ok(sw.includes("SHELL.push('/assets/Gift%20Sounds/gift-code-map.json')"));
});

test("review candidate count remains aligned with the delivered per-gift MP3 files", () => {
  assert.equal(candidateMap.status, "review_required_not_production_approved");
  assert.equal(candidateMap.mappedGiftCount, candidateMap.mappings.length);
  assert.equal(new Set(candidateMap.mappings.map(item => item.giftSlug)).size, candidateMap.mappings.length);
  assert.equal(Object.keys(runtimeMap.gifts_by_code).length, 71);
  assert.equal(candidateMap.mappings.length, 101);
});
