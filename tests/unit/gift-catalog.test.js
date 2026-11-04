import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(readFileSync(path.join(root, "data/minglora-gift-catalog.json"), "utf8"));
const gifts = manifest.gifts;
const assetRoot = path.join(root, "public/assets/gifts/catalog");
const generatedStamp = path.join(assetRoot, "catalog-build.json");
if (!existsSync(generatedStamp)) {
  execFileSync(process.execPath, [path.join(root, "scripts/generate-minglora-gifts.mjs")], { stdio: "inherit" });
} else {
  execFileSync(process.execPath, [path.join(root, "scripts/generate-minglora-gifts.mjs"), "--check"], { stdio: "inherit" });
}

test("Minglora gift manifest count matches all catalogue entries", () => {
  assert.ok(gifts.length >= 1600, "expected the full large gift collection");
  assert.equal(manifest.gift_count, gifts.length);
});

test("every active Minglora gift has a unique code", () => {
  const codes = gifts.map(gift => gift.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) assert.match(code, /^[a-z0-9_-]{1,59}$/);
});

test("every gift has one distinct name and coin-price pair", () => {
  const pairs = gifts.map(gift => gift.name.toLocaleLowerCase("en-US") + "|" + gift.coin_price);
  assert.equal(new Set(pairs).size, pairs.length);
  assert.ok(gifts.some(gift => gifts.filter(other => other.name === gift.name).length > 1),
    "source price variants should remain represented");
});

test("all gifts have valid coin prices and unique original asset paths", () => {
  const imagePaths = new Set();
  const modelPaths = new Set();
  for (const gift of gifts) {
    assert.ok(Number.isSafeInteger(gift.coin_price) && gift.coin_price >= 1, gift.name);
    assert.equal(gift.active, true, gift.name);
    assert.equal(gift.image_url, "/assets/gifts/catalog/" + gift.code + ".svg", gift.name);
    assert.equal(gift.model_url, "/assets/gifts/catalog/" + gift.code + ".gltf", gift.name);
    assert.ok(!/^https?:\/\//i.test(gift.image_url));
    assert.ok(!/^https?:\/\//i.test(gift.model_url));
    assert.ok(!imagePaths.has(gift.image_url), gift.image_url);
    assert.ok(!modelPaths.has(gift.model_url), gift.model_url);
    imagePaths.add(gift.image_url);
    modelPaths.add(gift.model_url);
  }
  assert.equal(imagePaths.size, gifts.length);
  assert.equal(modelPaths.size, gifts.length);
});

test("every gift has an animation and generated-sound profile", () => {
  for (const gift of gifts) {
    assert.ok(typeof gift.category === "string" && gift.category.length > 0, gift.name);
    assert.ok(typeof gift.animation_key === "string" && gift.animation_key.length > 0, gift.name);
    assert.ok(typeof gift.animation_preset === "string" && gift.animation_preset.length > 0, gift.name);
    assert.ok(typeof gift.sound_preset === "string" && gift.sound_preset.length > 0, gift.name);
    assert.ok(Number.isInteger(gift.animation_duration_ms) && gift.animation_duration_ms >= 900, gift.name);
  }
});

test("Minglora gift identities and generated asset paths are platform-neutral", () => {
  assert.doesNotMatch(JSON.stringify(manifest), /tiktok/i);
  for (const gift of gifts) {
    assert.doesNotMatch(gift.name, /tiktok/i);
    assert.doesNotMatch(gift.code, /tiktok/i);
    assert.doesNotMatch(gift.image_url + " " + gift.model_url, /tiktok/i);
    assert.ok(gift.image_url.startsWith("/assets/gifts/catalog/"));
    assert.ok(gift.model_url.startsWith("/assets/gifts/catalog/"));
  }
});;


test("the build produces one original SVG and one 3D GLTF for every active gift", () => {
  const stamp = JSON.parse(readFileSync(generatedStamp, "utf8"));
  assert.equal(stamp.giftCount, gifts.length);
  assert.equal(stamp.svgAssets, gifts.length);
  assert.equal(stamp.gltfAssets, gifts.length);
  const generated = readdirSync(assetRoot);
  assert.equal(generated.filter(name => name.endsWith(".svg")).length, gifts.length);
  assert.equal(generated.filter(name => name.endsWith(".gltf")).length, gifts.length);
  for (const gift of gifts) {
    const svgPath = path.join(assetRoot, gift.code + ".svg");
    const modelPath = path.join(assetRoot, gift.code + ".gltf");
    assert.ok(statSync(svgPath).size > 1000, gift.name + " SVG should contain real artwork");
    assert.ok(statSync(modelPath).size > 1000, gift.name + " GLTF should contain real mesh geometry");
    const svg = readFileSync(svgPath, "utf8");
    assert.ok(svg.startsWith("<svg"), gift.name + " SVG should be a valid SVG document");
    assert.ok(svg.includes("Minglora") || svg.includes("aria-label"), gift.name);
    const model = JSON.parse(readFileSync(modelPath, "utf8"));
    assert.equal(model.asset?.version, "2.0", gift.name);
    assert.ok(model.meshes?.[0]?.primitives?.length > 0, gift.name);
    assert.ok((model.buffers?.[0]?.uri || "").startsWith("data:application/octet-stream;base64,"), gift.name + " GLTF must include embedded mesh data");
  }
});

test("Livecade source gaps and coin-price variants remain in the Minglora manifest", () => {
  const required = [
    ["CNC Coin",1],["Easter Heart",1],["Fighting",1],["Yalla Sahel",1],
    ["Hibiscus",5],["Kitty Pillow",5],["DJ Headphone",100],["Four Leaf Clover",100],
    ["Gamer Otter",100],["Gamer Pass Otter",100],["Merdeka!",100],["Merdeka",299],
    ["Pop, Don!?",299],["House Hat",500],["Let's Be Friends",500],["Audience Laughter",1500],
    ["Star Hero Stage",5999],["Picture Perfect",6000],["Championship Hall",6600],
    ["It's a festival!",7000],["KLCC",7999],["Alpha Wolves Scepter",15000],
    ["Golden Falcons Scepter",15000],["Keeper of Atlantis",15000],["Legacy in Bloom",15000],
    ["Noble Stallions Scepter",15000],["Royal Lions Scepter",15000],["Ultimate Match",15000],
    ["Jakarta Roundabout",16999],["Legacy in Bloom",21000],["Goal of Glory",21500],
    ["Flamenco dancers",25999],["Thumbs Up",2],["Baseball",5],["Music Bubbles",100],
    ["Dream Team",500],["Crocodile",15000],["Level Ship",21000],
    ["Julius the Champion",43999],["Valerian's Oath",43999]
  ];
  for (const [name,price] of required) {
    assert.ok(gifts.some(gift => gift.name === name && gift.coin_price === price), name + " at " + price + " coins");
  }
});

test("newly audited object gifts render their matching Minglora icons", () => {
  const expected = [["CNC Coin","🪙"],["Fighting","🥊"],["Hibiscus","🌺"],["DJ Headphone","🎧"],["Four Leaf Clover","🍀"]];
  for (const [name,symbol] of expected) {
    const gift = gifts.find(item => item.name === name);
    assert.ok(gift, name + " should exist in the manifest");
    const svg = readFileSync(path.join(assetRoot,gift.code + ".svg"),"utf8");
    assert.ok(svg.includes(symbol), name + " should render the matching icon");
  }
});

test("recognisable gifts use their matching object artwork instead of an unrelated category symbol", () => {
  const rose = gifts.find(gift => gift.name === "Rose");
  const baseball = gifts.find(gift => gift.name === "Baseball");
  assert.ok(rose && baseball);
  const roseSvg = readFileSync(path.join(assetRoot, rose.code + ".svg"), "utf8");
  const baseballSvg = readFileSync(path.join(assetRoot, baseball.code + ".svg"), "utf8");
  assert.ok(roseSvg.includes("🌹"), "Rose must visibly render as a rose");
  assert.ok(baseballSvg.includes("⚾"), "Baseball must visibly render as a baseball");
});
