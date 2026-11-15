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
    assert.equal(typeof gift.active, "boolean", gift.name);
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
  assert.equal(stamp.svgIconAssets, gifts.length);
  assert.equal(stamp.gltfAssets, gifts.length);
  const generated = readdirSync(assetRoot);
  assert.equal(generated.filter(name => name.endsWith(".svg")).length, gifts.length * 2);
  assert.equal(generated.filter(name => name.endsWith(".gltf")).length, gifts.length);
  const svgPayloads = new Set();
  const modelPayloads = new Set();
  for (const gift of gifts) {
    const svgPath = path.join(assetRoot, gift.code + ".svg");
    const iconPath = path.join(assetRoot, gift.code + "-icon.svg");
    const modelPath = path.join(assetRoot, gift.code + ".gltf");
    assert.ok(statSync(svgPath).size > 1000, gift.name + " SVG should contain real artwork");
    assert.ok(statSync(iconPath).size > 400, gift.name + " transparent icon should contain subject artwork");
    assert.ok(statSync(modelPath).size > 1000, gift.name + " GLTF should contain real mesh geometry");
    const icon = readFileSync(iconPath, "utf8");
    assert.ok(icon.startsWith("<svg"), gift.name + " icon should be valid SVG");
    assert.ok(icon.includes('data-gift-code="' + gift.code + '"'), gift.name + " icon must identify its catalogue source");
    assert.ok(icon.includes("aria-label="), gift.name + " icon must be accessible");
    assert.doesNotMatch(icon,/font-family=["'](?:Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji)/i,gift.name + " icon must not use system emoji fonts");
    assert.ok(!/<rect[^>]*(?:width=["']512["']|height=["']512["'])[^>]*>/i.test(icon), gift.name + " icon must not paint an opaque full-canvas background");
    const svg = readFileSync(svgPath, "utf8");
    assert.ok(svg.startsWith("<svg"), gift.name + " SVG should be a valid SVG document");
    assert.doesNotMatch(svg,/font-family=["'](?:Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji)/i,gift.name + " SVG must not use system emoji fonts");
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

test("newly audited object gifts render self-contained Minglora vector artwork", () => {
  const expected = [
    ["CNC Coin","M256 166v180"],
    ["Fighting","M163 311q-13-22"],
    ["Hibiscus","<ellipse cx=\"256\" cy=\"178\""],
    ["DJ Headphone","M112 268v-36q0-144 144-144"],
    ["Four Leaf Clover","M256 252c-48-75-125-71"]
  ];
  for (const [name,shapeSignature] of expected) {
    const gift = gifts.find(item => item.name === name);
    assert.ok(gift, name + " should exist in the manifest");
    const svg = readFileSync(path.join(assetRoot,gift.code + ".svg"),"utf8");
    assert.ok(svg.includes(shapeSignature), name + " should render its subject-specific vector shape");
    assert.doesNotMatch(svg,/font-family=["'](?:Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji)/i,name + " must not depend on system emoji fonts");
  }
});

test("recognisable gifts use their subject-specific vector artwork without emoji overlays", () => {
  const rose = gifts.find(gift => gift.name === "Rose");
  const baseball = gifts.find(gift => gift.name === "Baseball");
  assert.ok(rose && baseball);
  const roseSvg = readFileSync(path.join(assetRoot, rose.code + ".svg"), "utf8");
  const baseballSvg = readFileSync(path.join(assetRoot, baseball.code + ".svg"), "utf8");
  assert.ok(roseSvg.includes('data-gift-artwork="rose-bloom-original-v1"'), "Rose must contain individually authored flower artwork");
  assert.ok(baseballSvg.includes('stroke="#d84854" stroke-width="12"'), "Baseball must contain its red seam geometry");
  assert.doesNotMatch(roseSvg,/font-family=["'](?:Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji)/i);
  assert.doesNotMatch(baseballSvg,/font-family=["'](?:Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji)/i);
});


test("all generated gift SVGs use a transparent canvas while retaining the foreground artwork and nameplate", () => {
  assert.equal(gifts.length, 1748);
  for (const gift of gifts) {
    const svg = readFileSync(path.join(assetRoot, gift.code + ".svg"), "utf8");
    assert.doesNotMatch(svg, /<rect\b[^>]*\bwidth=["']512["'][^>]*\bheight=["']512["'][^>]*\bfill=["']url\(#bg\)["']/i, gift.name + " must not have an opaque full-canvas background");
    assert.match(svg, /<svg\b[^>]*\bwidth=["']512["'][^>]*\bheight=["']512["']/i, gift.name + " must preserve its 512px canvas");
    assert.match(svg, /<g transform=/, gift.name + " must retain its rendered gift geometry");
    assert.match(svg, /<rect x="86" y="438" width="340" height="43"/, gift.name + " must preserve its local nameplate");
  }
});

test("the active 2026 catalogue excludes obsolete 2025-dated gifts", () => {
  const retiredNames = ["2025","2025 Love","GG 2025","2025 Glasses","2025 JoyLens","Gamer 2025","Celebrate 2025","Extravaganza 2025","Prime Power 2025"];
  for (const name of retiredNames) {
    assert.equal(gifts.some(gift => gift.name === name), false, name + " must not be active in the 2026 catalogue");
  }
  assert.equal(gifts.length, 1748);
});


test("Hibiscus uses an individually authored layered tropical-flower GLTF sculpture", () => {
  const hibiscus = gifts.find(gift => gift.name === "Hibiscus");
  assert.ok(hibiscus, "Hibiscus must remain in the canonical catalogue");
  assert.equal(hibiscus.code, "hibiscus-5-mgl");
  const model = JSON.parse(readFileSync(path.join(assetRoot, hibiscus.code + ".gltf"), "utf8"));
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-hibiscus-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/hibiscus-model.mjs");
  assert.match(model.asset?.extras?.artDirection || "", /five cupped coral-pink petals/i);
  assert.match(model.asset?.extras?.reviewStatus || "", /design-review-pending/);
  assert.ok(model.meshes?.[0]?.primitives?.length >= 30, "Hibiscus should use separately addressable flower, sepal, leaf and stamen meshes");
  assert.ok(model.materials?.some(material => material.name.includes("Hibiscus satin petal")));
  assert.ok(model.materials?.some(material => material.name.includes("Hibiscus sepal")));
  assert.ok(model.materials?.some(material => material.name.includes("Pollen anther")));
  assert.ok(model.materials?.some(material => material.name.includes("sculpted material") && material.name.toLowerCase().includes("leaf")));
  assert.ok(model.buffers?.[0]?.uri.startsWith("data:application/octet-stream;base64,"), "Hibiscus must be self-contained for the existing model viewer");
  assert.ok(model.accessors?.filter(accessor => accessor.type === "VEC3").length >= 30, "Hibiscus should expose mesh position and normal accessors");
});


test("Palm Breeze uses a bespoke tropical tree and island GLTF sculpture", () => {
  const palm = gifts.find(gift => gift.code === "palm-breeze-gknyt0");
  assert.ok(palm, "Palm Breeze must remain in the canonical gift catalogue");
  assert.equal(palm.category, "nature");
  const model = JSON.parse(readFileSync(path.join(assetRoot, palm.code + ".gltf"), "utf8"));
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-palm-breeze-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/palm-breeze-model.mjs");
  assert.match(model.asset?.extras?.artDirection || "", /eight radial pinnate fronds.*three young coconuts/i);
  assert.match(model.asset?.extras?.reviewStatus || "", /design-review-pending/);
  assert.ok(model.meshes?.[0]?.primitives?.length >= 40, "Palm Breeze should expose trunk, root, grouped frond, coconut and island meshes");
  assert.ok(model.materials?.some(material => material.name.includes("Palm curved fibrous trunk")));
  assert.ok(model.materials?.some(material => material.name.includes("Palm frond leaflets")));
  assert.ok(model.materials?.some(material => material.name.includes("Palm coconut husk")));
  assert.ok(model.materials?.some(material => material.name.includes("Palm island turquoise waterline")));
  assert.ok(model.buffers?.[0]?.uri.startsWith("data:application/octet-stream;base64,"), "Palm Breeze must be self-contained for the existing model viewer");
  assert.ok(model.accessors?.filter(accessor => accessor.type === "VEC3").length >= 80, "Palm Breeze must expose mesh positions and normals");
  const svg = readFileSync(path.join(assetRoot, palm.code + ".svg"), "utf8");
  assert.ok(svg.includes('data-gift-artwork="palm-breeze-original-v1"'), "Palm Breeze should use subject-specific transparent vector artwork");
});

test("Djembe Master uses an individually authored, self-contained percussion-instrument GLTF", () => {
  const djembe = gifts.find(gift => gift.code === "djembe-master-1v3jzkm");
  assert.ok(djembe, "Djembe Master must remain in the canonical gift catalogue");
  assert.equal(djembe.category, "music");
  const model = JSON.parse(readFileSync(path.join(assetRoot, djembe.code + ".gltf"), "utf8"));
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-djembe-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/djembe-model.mjs");
  assert.match(model.asset?.extras?.artDirection || "", /mahogany shell.*hide drumhead.*diamond lacing/i);
  assert.match(model.asset?.extras?.reviewStatus || "", /design-review-pending/);
  assert.ok(model.meshes?.[0]?.primitives?.length >= 60, "Djembe should expose shell, hide, rim, rope and carved detail meshes");
  assert.ok(model.materials?.some(material => material.name.includes("mahogany shell")));
  assert.ok(model.materials?.some(material => material.name.includes("drumhead")));
  assert.ok(model.materials?.some(material => material.name.includes("tension rope")));
  assert.ok(model.materials?.some(material => material.name.includes("diamond cross-lacing")));
  assert.ok(model.buffers?.[0]?.uri.startsWith("data:application/octet-stream;base64,"), "Djembe must be self-contained for the existing model viewer");
  assert.ok(model.accessors?.filter(accessor => accessor.type === "VEC3").length >= 120, "Djembe must expose mesh positions and normals for its separately addressable parts");
  const svg = readFileSync(path.join(assetRoot, djembe.code + ".svg"), "utf8");
  assert.ok(svg.includes('data-gift-artwork="djembe-master-original-v1"'), "Djembe should use its subject-specific transparent vector artwork");
});

test("Rose uses an individually authored layered GLTF botanical sculpture", () => {
  const rose = gifts.find(gift => gift.name === "Rose");
  assert.ok(rose, "Rose must remain in the canonical catalogue");
  const model = JSON.parse(readFileSync(path.join(assetRoot, rose.code + ".gltf"), "utf8"));
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-rose-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/rose-model.mjs");
  assert.match(model.asset?.extras?.artDirection || "", /raised midribs and branching leaf venation.*golden stamens/i);
  assert.ok(model.meshes?.[0]?.primitives?.length >= 55, "Rose should include individually addressable botanical, petiole, vein and stamen mesh parts");
  assert.ok(model.materials?.some(material => material.name.includes("Velvet outer petal")), "Rose should include a dedicated outer-petal material");
  assert.ok(model.materials?.some(material => material.name.includes("Rose sepal")), "Rose should include dedicated calyx materials");
  assert.ok(model.materials?.some(material => material.name.toLowerCase().includes("leaf")), "Rose should include dedicated foliage materials");
  assert.ok(model.materials?.some(material => material.name.includes("Lower leaf - left venation")), "Rose foliage must include a raised midrib and branching veins");
  assert.ok(model.materials?.some(material => material.name.includes("Velvet outer petal 1 venation")), "Rose outer petals must include fine raised surface veins");
  assert.ok(model.materials?.some(material => material.name.includes("Satin middle petal 1 venation")), "Rose middle petals must include fine raised surface veins");
  assert.ok(model.materials?.some(material => material.name.includes("Rose leaf petioles")), "Rose leaves must connect visibly to the main stem through petioles");
  assert.ok(model.materials?.some(material => material.name.includes("Rose golden stamen filaments")), "Rose bloom must include individual golden stamen filaments");
  assert.ok(model.materials?.some(material => material.name.includes("Rose golden anther 1")), "Rose bloom must include individually modelled pollen anthers");
  assert.ok(model.buffers?.[0]?.uri.startsWith("data:application/octet-stream;base64,"), "Rose must be self-contained for the existing model viewer");
  assert.ok(model.accessors?.filter(accessor => accessor.type === "VEC3").length >= 20, "Rose should expose mesh position and normal accessors");
});


test("Gamer Otter uses original subject-specific SVG artwork and a self-contained 3D character sculpture", () => {
  const otter = gifts.find(gift => gift.code === "gamer-otter-100-mgl");
  assert.ok(otter, "Gamer Otter must remain in the canonical catalogue");
  assert.equal(otter.name, "Gamer Otter");
  assert.equal(otter.category, "animals");
  assert.equal(otter.coin_price, 100, "the canonical Coin price must remain unchanged");
  assert.equal(otter.active, true);
  const model = JSON.parse(readFileSync(path.join(assetRoot, otter.code + ".gltf"), "utf8"));
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-gamer-otter-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/gamer-otter-model.mjs");
  assert.match(model.asset?.extras?.artDirection || "", /seated otter character.*gaming headset.*custom four-button controller/i);
  assert.match(model.asset?.extras?.reviewStatus || "", /design-review-pending/);
  assert.ok(model.meshes?.[0]?.primitives?.length >= 45, "the character, headset, controller and details must remain individually addressable");
  assert.ok(model.materials?.some(material => material.name.includes("Otter rounded head")));
  assert.ok(model.materials?.some(material => material.name.includes("Gaming headset padded arch")));
  assert.ok(model.materials?.some(material => material.name.includes("Gamer controller shell")));
  assert.ok(model.buffers?.[0]?.uri.startsWith("data:application/octet-stream;base64,"), "Gamer Otter must be self-contained for the existing model viewer");
  assert.ok(model.accessors?.filter(accessor => accessor.type === "VEC3").length >= 90, "the model must expose mesh positions and normals");
  const svg = readFileSync(path.join(assetRoot, otter.code + ".svg"), "utf8");
  const icon = readFileSync(path.join(assetRoot, otter.code + "-icon.svg"), "utf8");
  assert.ok(svg.includes('data-gift-artwork="gamer-otter-original-v1"'), "the primary SVG must be subject-specific");
  assert.ok(icon.includes('data-gift-artwork="gamer-otter-original-v1"'), "the transparent icon must preserve the subject-specific artwork");
});


test("LIVE Island uses an original lagoon, palms, pavilion, canoe and coral reef GLTF sculpture", () => {
  const island = gifts.find(gift => gift.code === "live-island-rmn3mc");
  assert.ok(island, "LIVE Island must remain in the canonical gift catalogue");
  assert.equal(island.name, "LIVE Island");
  assert.equal(island.category, "nature");
  assert.equal(island.coin_price, 10, "the canonical Coin value must remain unchanged");
  assert.equal(island.active, true, "the existing publication state must remain unchanged");
  const model = JSON.parse(readFileSync(path.join(assetRoot, island.code + ".gltf"), "utf8"));
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-live-island-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/live-island-model.mjs");
  assert.match(model.asset?.extras?.artDirection || "", /turquoise lagoon.*cascading waterfall.*three individually detailed palms.*branching coral reef/i);
  assert.match(model.asset?.extras?.reviewStatus || "", /design-review-pending/);
  assert.ok(model.meshes?.[0]?.primitives?.length >= 28, "LIVE Island should expose separate environment, pavilion, palms, boat and reef mesh parts");
  assert.ok(model.materials?.some(material => material.name.includes("LIVE Island deep lagoon plinth")));
  assert.ok(model.materials?.some(material => material.name.includes("LIVE Island cascading waterfall")));
  assert.ok(model.materials?.some(material => material.name.includes("LIVE Island west palm")));
  assert.ok(model.materials?.some(material => material.name.includes("LIVE Island pavilion coral roof")));
  assert.ok(model.materials?.some(material => material.name.includes("LIVE Island reef coral branch")));
  assert.ok(model.buffers?.[0]?.uri.startsWith("data:application/octet-stream;base64,"), "LIVE Island must be self-contained for the existing model viewer");
  assert.ok(model.accessors?.filter(accessor => accessor.type === "VEC3").length >= 56, "LIVE Island must expose position and normal accessors");
  const svg = readFileSync(path.join(assetRoot, island.code + ".svg"), "utf8");
  const icon = readFileSync(path.join(assetRoot, island.code + "-icon.svg"), "utf8");
  assert.ok(svg.includes('data-gift-artwork="live-island-original-v1"'), "the primary SVG must preserve subject-specific original artwork");
  assert.ok(icon.includes('data-gift-artwork="live-island-original-v1"'), "the transparent icon must preserve subject-specific original artwork");
});


test("Crystal Crown uses a bespoke faceted royal tiara with separately named crystal and filigree meshes", () => {
  const crown = gifts.find(gift => gift.code === "crystal-crown-1itryeu");
  assert.ok(crown, "Crystal Crown must remain in the canonical gift catalogue");
  assert.equal(crown.name, "Crystal Crown");
  assert.equal(crown.category, "luxury");
  assert.equal(crown.coin_price, 2000, "the existing Coin value must remain unchanged");
  assert.equal(crown.active, true, "the existing publication state must remain unchanged");
  const model = JSON.parse(readFileSync(path.join(assetRoot, crown.code + ".gltf"), "utf8"));
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-crystal-crown-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/crystal-crown-model.mjs");
  assert.match(model.asset?.extras?.artDirection || "", /tapered sculpted gold band.*five arched points.*individually faceted sapphire.*pendant drops/i);
  assert.match(model.asset?.extras?.reviewStatus || "", /design-review-pending/);
  assert.ok(model.meshes?.[0]?.primitives?.length >= 150, "the crown must expose its own faceted gems, arches, pavé and engraved band meshes");
  assert.ok(model.materials?.some(material => material.name.includes("Crystal Crown tapered gold band")));
  assert.ok(model.materials?.some(material => material.name.includes("Crystal Crown great sapphire upper cut facet")));
  assert.ok(model.materials?.some(material => material.name.includes("Crystal Crown royal point spine")));
  assert.ok(model.materials?.some(material => material.name.includes("Crystal Crown inner velvet lining")));
  assert.ok(model.buffers?.[0]?.uri.startsWith("data:application/octet-stream;base64,"), "Crystal Crown must be self-contained for the existing model viewer");
  assert.ok(model.accessors?.filter(accessor => accessor.type === "VEC3").length >= 300, "the model must expose individual facet positions and normals");
  const svg = readFileSync(path.join(assetRoot, crown.code + ".svg"), "utf8");
  const icon = readFileSync(path.join(assetRoot, crown.code + "-icon.svg"), "utf8");
  assert.ok(svg.includes('data-gift-artwork="crystal-crown-original-v1"'), "the primary SVG must use subject-specific royal artwork");
  assert.ok(icon.includes('data-gift-artwork="crystal-crown-original-v1"'), "the transparent icon must preserve the royal artwork");
});


test("Phoenix uses an original layered firebird sculpture with distinct wing and tail feathers", () => {
  const phoenix = gifts.find(gift => gift.code === "phoenix-wep6uk");
  assert.ok(phoenix, "Phoenix must remain in the canonical gift catalogue");
  assert.equal(phoenix.name, "Phoenix");
  assert.equal(phoenix.category, "animals");
  assert.equal(phoenix.coin_price, 25999, "the existing Coin value must remain unchanged");
  assert.equal(phoenix.active, true, "the existing publication state must remain unchanged");
  const model = JSON.parse(readFileSync(path.join(assetRoot, phoenix.code + ".gltf"), "utf8"));
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-phoenix-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/phoenix-model.mjs");
  assert.match(model.asset?.extras?.artDirection || "", /rising firebird.*layered crimson and amber wings.*comet-tail fan.*ember motes/i);
  assert.match(model.asset?.extras?.reviewStatus || "", /design-review-pending/);
  assert.ok(model.meshes?.[0]?.primitives?.length >= 150, "the model must expose distinct body, wing, covert, flight-feather and tail parts");
  assert.ok(model.materials?.some(material => material.name.includes("Phoenix sculpted torso")));
  assert.ok(model.materials?.some(material => material.name.includes("Phoenix left wing primary flight feather")));
  assert.ok(model.materials?.some(material => material.name.includes("Phoenix right wing covert row")));
  assert.ok(model.materials?.some(material => material.name.includes("Phoenix tail fan feather")));
  assert.ok(model.materials?.some(material => material.name.includes("Phoenix crown flame plume")));
  assert.ok(model.buffers?.[0]?.uri.startsWith("data:application/octet-stream;base64,"), "Phoenix must be self-contained for the existing model viewer");
  assert.ok(model.accessors?.filter(accessor => accessor.type === "VEC3").length >= 300, "Phoenix must expose mesh positions and normals");
  const svg = readFileSync(path.join(assetRoot, phoenix.code + ".svg"), "utf8");
  const icon = readFileSync(path.join(assetRoot, phoenix.code + "-icon.svg"), "utf8");
  assert.ok(svg.includes('data-gift-artwork="phoenix-original-v1"'), "the primary SVG must use original firebird artwork");
  assert.ok(icon.includes('data-gift-artwork="phoenix-original-v1"'), "the transparent icon must preserve the firebird artwork");
});


test("Beach Maracas uses an original crossed Caribbean maraca pair with painted gourd detail", () => {
  const maracas = gifts.find(gift => gift.code === "beach-maracas-1exxoag");
  assert.ok(maracas, "Beach Maracas must remain in the canonical gift catalogue");
  assert.equal(maracas.name, "Beach Maracas");
  assert.equal(maracas.category, "music");
  assert.equal(maracas.coin_price, 349, "the canonical Coin value must remain unchanged");
  assert.equal(maracas.active, true, "the existing publication state must remain unchanged");
  const model = JSON.parse(readFileSync(path.join(assetRoot, maracas.code + ".gltf"), "utf8"));
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-beach-maracas-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/beach-maracas-model.mjs");
  assert.match(model.asset?.extras?.artDirection || "", /crossed pair.*Caribbean calabash maracas.*hand-painted seed motifs.*conch charm/i);
  assert.match(model.asset?.extras?.reviewStatus || "", /design-review-pending/);
  assert.ok(model.meshes?.[0]?.primitives?.length >= 80, "both maracas must expose their own gourds, handles, bands and painted details");
  assert.ok(model.materials?.some(material => material.name.includes("Beach Maracas coral carved gourd shell")));
  assert.ok(model.materials?.some(material => material.name.includes("Beach Maracas lagoon carved gourd shell")));
  assert.ok(model.materials?.some(material => material.name.includes("woven grip band")));
  assert.ok(model.materials?.some(material => material.name.includes("gourd sunburst ray")));
  assert.ok(model.buffers?.[0]?.uri.startsWith("data:application/octet-stream;base64,"), "Beach Maracas must be self-contained for the existing model viewer");
  assert.ok(model.accessors?.filter(accessor => accessor.type === "VEC3").length >= 160, "the model must expose mesh positions and normals");
  for (const accessor of model.accessors.filter(value => value.type === "VEC3" && value.min && value.max)) {
    assert.ok(accessor.min.every(Number.isFinite) && accessor.max.every(Number.isFinite), "all generated mesh bounds must contain finite coordinates");
  }
  const svg = readFileSync(path.join(assetRoot, maracas.code + ".svg"), "utf8");
  const icon = readFileSync(path.join(assetRoot, maracas.code + "-icon.svg"), "utf8");
  assert.ok(svg.includes('data-gift-artwork="beach-maracas-original-v1"'), "the primary SVG must use the original pair artwork");
  assert.ok(icon.includes('data-gift-artwork="beach-maracas-original-v1"'), "the transparent icon must preserve the original pair");
});


test("Royal Lions Scepter uses an original sculpted lion-head and jeweled gold staff model", () => {
  const scepter = gifts.find(gift => gift.code === "royal-lions-scepter-15000-mgl");
  assert.ok(scepter, "Royal Lions Scepter must remain in the canonical gift catalogue");
  assert.equal(scepter.name, "Royal Lions Scepter");
  assert.equal(scepter.category, "fantasy");
  assert.equal(scepter.coin_price, 15000, "the configured Coin value must remain unchanged");
  assert.equal(scepter.active, true, "the source catalogue publication flag must remain unchanged");

  const model = JSON.parse(readFileSync(path.join(assetRoot, scepter.code + ".gltf"), "utf8"));
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-royal-lions-scepter-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/royal-lions-scepter-model.mjs");
  assert.match(model.asset?.extras?.artDirection || "", /forward-facing lion head.*radial individually modelled mane locks.*sapphire eyes.*central deep-blue faceted sapphire.*spiral-fluted shaft/i);
  assert.match(model.asset?.extras?.reviewStatus || "", /design-review-pending/);
  assert.ok(model.meshes?.[0]?.primitives?.length >= 100, "the scepter must expose separately named lion, mane, crown and staff geometry");
  assert.ok(model.materials?.some(material => material.name.includes("Royal Lions Scepter sculpted lion face")));
  assert.ok(model.materials?.some(material => material.name.includes("Royal Lions Scepter radial mane lock")));
  assert.ok(model.materials?.some(material => material.name.includes("Royal Lions Scepter main gold shaft")));
  assert.ok(model.materials?.some(material => material.name.includes("Royal Lions Scepter crown central sapphire upper cut facet")));
  assert.ok(model.materials?.some(material => material.name.includes("Royal Lions Scepter central enamel grip")));
  assert.ok(model.buffers?.[0]?.uri.startsWith("data:application/octet-stream;base64,"), "the model must be self-contained for the existing viewer");
  assert.ok(model.accessors?.filter(accessor => accessor.type === "VEC3").length >= 250, "the model must expose separate positions and normals for its sculpted meshes");

  const svg = readFileSync(path.join(assetRoot, scepter.code + ".svg"), "utf8");
  const icon = readFileSync(path.join(assetRoot, scepter.code + "-icon.svg"), "utf8");
  assert.ok(svg.includes('data-gift-artwork="royal-lions-scepter-original-v1"'), "the primary SVG must use original lion-scepter artwork");
  assert.ok(icon.includes('data-gift-artwork="royal-lions-scepter-original-v1"'), "the transparent icon must preserve the original lion-scepter artwork");
});


test("Baseball uses an original full-grain leather model and subject-specific Minglora artwork", () => {
  const baseball = gifts.find(gift => gift.code === "baseball-orcdx9");
  assert.ok(baseball, "Baseball must remain in the canonical gift catalogue");
  assert.equal(baseball.name, "Baseball");
  assert.equal(baseball.category, "sports");
  assert.equal(baseball.coin_price, 1, "the configured Coin value must remain unchanged");
  assert.equal(baseball.active, true, "the source catalogue publication flag must remain unchanged");

  const model = JSON.parse(readFileSync(path.join(assetRoot, baseball.code + ".gltf"), "utf8"));
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-baseball-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/baseball-model.mjs");
  assert.match(model.asset?.extras?.artDirection || "", /full-grain ivory baseball.*curved recessed red seam channels.*hand-sewn red cotton stitches.*leather-grain detail/i);
  assert.match(model.asset?.extras?.reviewStatus || "", /design-review-pending/);
  assert.ok(model.meshes?.[0]?.primitives?.length >= 7, "the ball must expose separate leather, grain, channel, seam and stitch meshes");
  const partNames = model.meshes?.[0]?.primitives?.map(primitive => primitive.extras?.mingloraPartName) || [];
  assert.ok(partNames.some(name => name?.includes("full-grain warm ivory leather shell")));
  assert.ok(partNames.some(name => name?.includes("fine leather grain")));
  assert.ok(partNames.some(name => name?.includes("recessed red seam channel")));
  assert.ok(partNames.some(name => name?.includes("raised scarlet cotton seam")));
  assert.ok(partNames.some(name => name?.includes("hand-sewn stitches")));
  assert.ok(model.buffers?.[0]?.uri.startsWith("data:application/octet-stream;base64,"), "Baseball must be self-contained for the existing model viewer");
  assert.ok(model.accessors?.filter(accessor => accessor.type === "VEC3").length >= 14, "Baseball must expose per-mesh position and normal accessors");
  for (const accessor of model.accessors.filter(value => value.type === "VEC3" && value.min && value.max)) {
    assert.ok(accessor.min.every(Number.isFinite) && accessor.max.every(Number.isFinite), "Baseball mesh bounds must contain finite coordinates");
  }

  const svg = readFileSync(path.join(assetRoot, baseball.code + ".svg"), "utf8");
  const icon = readFileSync(path.join(assetRoot, baseball.code + "-icon.svg"), "utf8");
  assert.ok(svg.includes('data-gift-artwork="baseball-original-v1"'), "the primary SVG must carry original Baseball artwork provenance");
  assert.ok(icon.includes('data-gift-artwork="baseball-original-v1"'), "the transparent gift icon must preserve the original Baseball artwork");
});

test("Keeper of Atlantis uses an original three-prong trident and underwater sculpture", () => {
  const keeper = gifts.find(gift => gift.code === "keeper-of-atlantis-15000-mgl");
  assert.ok(keeper, "Keeper of Atlantis must remain in the canonical gift catalogue");
  assert.equal(keeper.name, "Keeper of Atlantis");
  assert.equal(keeper.category, "fantasy");
  assert.equal(keeper.coin_price, 15000, "the configured Coin value must remain unchanged");
  assert.equal(keeper.active, true, "the source publication state must remain unchanged");
  assert.equal(keeper.animation_preset, "cosmic-orbit", "the canonical animation preset must remain unchanged");

  const model = JSON.parse(readFileSync(path.join(assetRoot, keeper.code + ".gltf"), "utf8"));
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-keeper-of-atlantis-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/keeper-of-atlantis-model.mjs");
  assert.match(model.asset?.extras?.artDirection || "", /underwater ceremonial trident.*three curved gold prongs.*faceted aquamarine and opal jewels.*pearl-inlaid nautilus shell medallion.*branching coral.*tidal currents/i);
  assert.match(model.asset?.extras?.reviewStatus || "", /design-review-pending/);
  assert.ok(model.meshes?.[0]?.primitives?.length >= 65, "the model must expose distinct trident, shell, coral and ocean details");
  assert.ok(model.materials?.some(material => material.name.includes("Keeper of Atlantis central trident spear")));
  assert.ok(model.materials?.some(material => material.name.includes("Keeper of Atlantis main aquamarine crown cut")));
  assert.ok(model.materials?.some(material => material.name.includes("Keeper of Atlantis shell medallion gold rim")));
  assert.ok(model.materials?.some(material => material.name.includes("Keeper of Atlantis coral branch")));
  assert.ok(model.materials?.some(material => material.name.includes("Keeper of Atlantis spiral shaft engraving")));
  assert.ok(model.buffers?.[0]?.uri.startsWith("data:application/octet-stream;base64,"), "the model must be self-contained for the existing viewer");
  assert.ok(model.accessors?.filter(accessor => accessor.type === "VEC3").length >= 130, "the model must expose separate positions and normals for its named meshes");
  for (const accessor of model.accessors.filter(value => value.type === "VEC3" && value.min && value.max)) {
    assert.ok(accessor.min.every(Number.isFinite) && accessor.max.every(Number.isFinite), "all generated mesh bounds must contain finite coordinates");
  }

  const svg = readFileSync(path.join(assetRoot, keeper.code + ".svg"), "utf8");
  const icon = readFileSync(path.join(assetRoot, keeper.code + "-icon.svg"), "utf8");
  assert.ok(svg.includes('data-gift-artwork="keeper-of-atlantis-original-v1"'), "the primary SVG must use the original trident-and-ocean artwork");
  assert.ok(icon.includes('data-gift-artwork="keeper-of-atlantis-original-v1"'), "the transparent icon must preserve the original Keeper artwork");
});
