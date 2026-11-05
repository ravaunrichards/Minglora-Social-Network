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
const giftEffectsSource = readFileSync(path.join(root, "public/gift-effects.js"), "utf8");
function giftAnimationMotionSignature(gift) {
  let seed = 2166136261;
  for (const ch of [gift.animation_key, gift.code, gift.name].join("|")) {
    seed ^= ch.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  seed >>>= 0;
  return [seed % 81 - 40,-18 - ((seed >>> 7) % 65),(seed >>> 13) % 71 - 35,((seed >>> 19) % 2 ? 1 : -1) * (50 + ((seed >>> 20) % 311)),(104 + ((seed >>> 3) % 27)) / 100,(90 + ((seed >>> 11) % 15)) / 100,seed % 360,750 + ((seed >>> 9) % 1400),24 + ((seed >>> 15) % 90),(seed >>> 4) % 360].join("|");
}
if (!existsSync(generatedStamp)) {
  execFileSync(process.execPath, [path.join(root, "scripts/generate-minglora-gifts.mjs")], { stdio: "inherit" });
} else {
  execFileSync(process.execPath, [path.join(root, "scripts/generate-minglora-gifts.mjs"), "--check"], { stdio: "inherit" });
}

test("Minglora gift manifest count matches all catalogue entries", () => {
  assert.ok(gifts.length >= 1600, "expected the full large gift collection");
  assert.equal(manifest.gift_count, gifts.length);
});

test("2026 catalogue retires non-gift placeholders and standalone month labels", () => {
  const retiredCodes = ["10-10-12wkkb4","community-gift-uxpqgw","audience-laughter-1500-mgl","pop-don-299-mgl","cnc-coin-1-mgl","raya-gift-card-kog86i","december-6dpx8e","march-1u6p1bk","november-juz9r3","october-1g8qjc7","s-flowers-nyemjm"];
  for (const code of retiredCodes) {
    const gift = manifest.gifts.find(item => item.code === code);
    assert.ok(gift, "retired gift record is retained for history: " + code);
    assert.equal(gift.active, false, "retired gift must not be selectable: " + code);
  }
});

test("recognizable miscellaneous gifts are placed in their real catalogue categories", () => {
  const categories = {"oranges-n1rjgo":"food_drink","dumplings-oqyaok":"food_drink","halo-halo-bh7zag":"food_drink","ice-lolly-mm2ra0":"food_drink","romanian-polenta-e95vn1":"food_drink","takoyaki-13ltr22":"food_drink","bubble-gum-1243ms":"food_drink","bbq-s8c93w":"food_drink","japanese-dinner-141lwam":"food_drink","choco-strawberries-c2xn1y":"food_drink","cooper-s-curry-yqwj60":"food_drink","eid-ma-amoul-lhdz5o":"food_drink","sweet-scoop-vjtutn":"food_drink","bearlicious-sundae-1ewjoef":"food_drink","ramune-1wopl5f":"food_drink","sunny-side-up-12shmzc":"food_drink","durian-best-friends-1tjb1zz":"food_drink","flowers-1nvz0hb":"flowers","forever-rosa-1o6wl0z":"flowers","roses-3mca3z":"flowers","xxxl-flowers-iwtcrx":"flowers","lucky-pig-dt659n":"animals","lucky-pony-14241qt":"animals","alpaca-1yilflf":"animals","corgi-11bz8df":"animals","pug-ojh3jf":"animals","toucan-1ovzxjb":"animals","baby-chicks-1nmqd9a":"animals","goldfish-xk73a9":"animals","gerry-the-giraffe-m025k3":"animals","giraffe-1tio8bz":"animals","kangaroo-189g5gr":"animals","cheeky-pup-1bttjtl":"animals","sloth-peek-1o2i2hm":"animals","raving-snail-1bto3pf":"animals","water-buffalo-jqqv35":"animals","mammoth-1xmbmcq":"animals","leopard-mhfsoy":"animals","cheetah-1ikg4p":"animals","ocelot-chase-m2gmvn":"animals","dancing-capybaras-7xi5r7":"animals","canyon-bighorn-12ndc4u":"animals","roo-mother-15wlwf2":"animals","sheep-joy-1pkkzuy":"animals","caterpillar-chaos-hx073s":"animals","flamingo-floaty-1gskq5p":"animals","g-o-a-t-busker-1s4q9q0":"music","breeze-quena-17wbn2y":"music","djembe-master-1v3jzkm":"music","epic-pianist-f9fnl8":"music","drums-1duv3qy":"music","castanets-1b9uyux":"music","oud-1fwx11r":"music","groove-clarinet-wy6xzb":"music","sax-appeal-1jazqu2":"music","tambourine-1my1x2p":"music","dreamy-strings-1m85c5l":"music","honey-strummer-12ptq73":"music","rock-and-roll-1bo9htk":"music","rock-idol-5wz7qa":"music","last-riff-roar-1hfdege":"music","electro-vibes-19lis52":"music","neon-rockstar-bt736m":"music","pink-cassette-1biwc67":"music","goool-1ovbz4f":"sports","goalkeeper-save-1lnhinp":"sports","ko-1idnuxm":"sports","hit-the-net-kc8wgi":"sports","azura-red-card-1n48q23":"sports","baller-oci0qb":"sports","kicker-challenge-5oglod":"sports","matchtacular-1oygt6n":"sports","superstriker-sage-m578z8":"sports","batting-cutie-6d5zti":"sports","borneo-ihmnu2":"travel","la-route-66-9issrd":"travel","chichen-itza-vvvdr7":"travel","gyeongbokgung-14x4ov9":"travel","madrid-1gcz6zc":"travel","paris-m6w2ao":"travel","riyadh-14cpalq":"travel","rome-gne1h0":"travel","singapore-skyline-1mf0jz6":"travel","taiwan-night-market-tfevcd":"travel","bat-headwear-cbdes5":"fashion_beauty","garland-headpiece-zaaju0":"fashion_beauty","bowknot-lk0rxt":"fashion_beauty","pink-cowboy-ygt7kk":"fashion_beauty","henna-glow-ln2fc6":"fashion_beauty","mom-s-bonnet-ntwp80":"fashion_beauty","fist-bump-v0thfp":"community","you-re-the-best-uazu4":"community","you-are-loved-1e4rz16":"community","sending-positivity-7vpsbb":"community","sending-luck-4ao8km":"community","you-re-amazing-ojre9n":"community","you-re-amazing-6zs0up":"community","you-are-on-a-roll-j8851n":"community","hearts-1a0m01c":"hearts","hand-hearts-k0uda5":"hearts","chirpy-kisses-43k7z0":"hearts","blow-rosie-kisses-1tsyb6z":"hearts","falling-for-you-123gx0c":"hearts","cuddle-with-me-1no8oxw":"hearts","woodland-wonder-1ktufrg":"nature","cactus-shuffle-11c2inv":"nature","snowfall-1jyko1z":"nature","coral-ueuamq":"nature","suncatcher-gir8i7":"nature","palm-breeze-gknyt0":"nature"};
  for (const [code, category] of Object.entries(categories)) {
    const gift = manifest.gifts.find(item => item.code === code);
    assert.ok(gift, "gift record exists: " + code);
    assert.equal(gift.category, category, "correct category for " + gift.name);
  }
});

test("every active Minglora gift has a unique code", () => {
  const codes = gifts.map(gift => gift.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) assert.match(code, /^[a-z0-9_-]{1,59}$/);
});

test("every gift has a unique display name and price variants are clearly labeled", () => {
  const names = gifts.map(gift => gift.name.trim().toLocaleLowerCase("en-US"));
  assert.equal(new Set(names).size, gifts.length);
  assert.equal(gifts.filter(gift => gift.name.endsWith(" — Premium Edition")).length, 19);
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

test("every gift has its own animation key and a distinct movement signature", () => {
  assert.equal(new Set(gifts.map(gift => gift.animation_key)).size, gifts.length);
  assert.equal(new Set(gifts.map(giftAnimationMotionSignature)).size, gifts.length);
});

test("catalog previews and sent gifts use each gift animation identity", () => {
  assert.match(giftEffectsSource, /const animationIdentity=String\(gift\.animation_key/);
  assert.match(giftEffectsSource, /target\.animate\(frames/);
  assert.match(giftEffectsSource, /minglora-gift-fx-particles/);
  assert.match(giftEffectsSource, /dataset\.giftAnimation=animationIdentity/);
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
  const svgPayloads = new Set();
  const modelPayloads = new Set();
  for (const gift of gifts) {
    const svgPath = path.join(assetRoot, gift.code + ".svg");
    const modelPath = path.join(assetRoot, gift.code + ".gltf");
    assert.ok(statSync(svgPath).size > 1000, gift.name + " SVG should contain real artwork");
    assert.ok(statSync(modelPath).size > 1000, gift.name + " GLTF should contain real mesh geometry");
    const svg = readFileSync(svgPath, "utf8");
    assert.ok(svg.startsWith("<svg"), gift.name + " SVG should be a valid SVG document");
    assert.ok(svg.includes("Minglora") || svg.includes("aria-label"), gift.name);
    svgPayloads.add(svg);
    const modelText = readFileSync(modelPath, "utf8");
    const model = JSON.parse(modelText);
    assert.equal(model.asset?.version, "2.0", gift.name);
    assert.ok(model.meshes?.[0]?.primitives?.length > 0, gift.name);
    assert.ok((model.buffers?.[0]?.uri || "").startsWith("data:application/octet-stream;base64,"), gift.name + " GLTF must include embedded mesh data");
    modelPayloads.add(modelText);
  }
  assert.equal(svgPayloads.size, gifts.length, "Every gift must have different generated SVG artwork");
  assert.equal(modelPayloads.size, gifts.length, "Every gift must have a different generated 3D model payload");
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
    ["Jakarta Roundabout",16999],["Legacy in Bloom — Premium Edition",21000],["Goal of Glory",21500],
    ["Flamenco dancers",25999],["Thumbs Up — Premium Edition",2],["Baseball — Premium Edition",5],["Music Bubbles",100],
    ["Dream Team — Premium Edition",500],["Crocodile — Premium Edition",15000],["Level Ship — Premium Edition",21000],
    ["Julius the Champion — Premium Edition",43999],["Valerian's Oath — Premium Edition",43999]
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


test("the active 2026 catalogue excludes obsolete 2025-dated gifts", () => {
  const retiredNames = ["2025","2025 Love","GG 2025","2025 Glasses","2025 JoyLens","Gamer 2025","Celebrate 2025","Extravaganza 2025","Prime Power 2025"];
  for (const name of retiredNames) {
    assert.equal(gifts.some(gift => gift.name === name), false, name + " must not be active in the 2026 catalogue");
  }
  assert.equal(gifts.length, 1748);
});
