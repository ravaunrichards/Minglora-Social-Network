import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSignatureJetModel } from "../../assets/3d-assets/gift-models/signature-jet-model.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(readFileSync(path.join(root, "data/minglora-gift-catalog.json"), "utf8"));
const assetRoot = path.join(root, "public/assets/gifts/catalog");
const generatorSource = readFileSync(path.join(root, "scripts/generate-minglora-gifts.mjs"), "utf8");
const effectsSource = readFileSync(path.join(root, "public/gift-effects.js"), "utf8");
const soundManifestSource = readFileSync(path.join(root, "scripts/generate-minglora-live-asset-manifest.mjs"), "utf8");

test("Signature Jet is a dedicated self-contained swept-wing aircraft model", () => {
  const gift = manifest.gifts.find(item => item.code === "signature-jet-exds0m");
  assert.ok(gift, "canonical Signature Jet gift must exist");
  assert.equal(gift.category, "vehicles");
  assert.ok(Number.isSafeInteger(gift.coin_price) && gift.coin_price >= 1);
  assert.equal(typeof gift.active, "boolean");

  const model = createSignatureJetModel();
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-signature-jet-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/signature-jet-model.mjs");
  assert.equal(model.asset?.extras?.reviewStatus, "design-review-pending");
  assert.match(model.asset?.extras?.artDirection || "", /unbranded pearl-titanium private jet.*swept twin wings.*panoramic smoked cockpit glazing.*two turbofan nacelles.*retractable landing gear/i);

  const primitives = model.meshes?.[0]?.primitives || [];
  assert.ok(primitives.length >= 45, "Signature Jet must use distinct aircraft-specific parts, not shared vehicle geometry");
  const names = primitives.map(primitive => primitive.extras?.mingloraPartName);
  assert.equal(new Set(names).size, names.length, "every authored aircraft part must have a unique name");
  for (const required of [
    "Signature Jet - pearl titanium fuselage shell",
    "Signature Jet - panoramic smoked-glass flight deck",
    "Signature Jet - port swept main wing",
    "Signature Jet - starboard swept main wing",
    "Signature Jet - port turbofan nacelle",
    "Signature Jet - starboard turbofan nacelle",
    "Signature Jet - swept vertical tail fin",
    "Signature Jet - port horizontal stabilizer",
    "Signature Jet - starboard horizontal stabilizer",
    "Signature Jet - nose landing tyre"
  ]) assert.ok(names.includes(required), "missing aircraft-specific mesh: " + required);

  const portWing = primitives.find(p => p.extras?.mingloraPartName === "Signature Jet - port swept main wing");
  const wingBounds = model.accessors?.[portWing.attributes?.POSITION];
  assert.ok(wingBounds.min[0] < -1.0, "port swept wing must extend beyond the fuselage");
  const portEngine = primitives.find(p => p.extras?.mingloraPartName === "Signature Jet - port turbofan nacelle");
  const engineBounds = model.accessors?.[portEngine.attributes?.POSITION];
  assert.ok(engineBounds.max[0] < 0 && engineBounds.min[0] < -0.6, "port turbofan must be separately modelled outboard");
  const fin = primitives.find(p => p.extras?.mingloraPartName === "Signature Jet - swept vertical tail fin");
  const finBounds = model.accessors?.[fin.attributes?.POSITION];
  assert.ok(finBounds.max[1] - finBounds.min[1] > 0.4, "vertical stabilizer must retain a tall swept profile");

  assert.equal(model.materials?.length, primitives.length);
  for (const primitive of primitives) {
    const position = model.accessors?.[primitive.attributes?.POSITION];
    const normal = model.accessors?.[primitive.attributes?.NORMAL];
    const indices = model.accessors?.[primitive.indices];
    const material = model.materials?.[primitive.material];
    assert.equal(position?.type, "VEC3");
    assert.equal(normal?.type, "VEC3");
    assert.equal(position?.count, normal?.count);
    assert.ok(position.min.every(Number.isFinite));
    assert.ok(position.max.every(Number.isFinite));
    assert.equal(indices?.type, "SCALAR");
    assert.ok([5123, 5125].includes(indices?.componentType));
    assert.ok(indices.count >= 3);
    assert.ok(material?.pbrMetallicRoughness?.roughnessFactor >= 0.15);
    assert.ok(material?.pbrMetallicRoughness?.roughnessFactor <= 1);
  }
  const embedded = model.buffers?.[0]?.uri || "";
  assert.ok(embedded.startsWith("data:application/octet-stream;base64,"));
  const binary = Buffer.from(embedded.split(",")[1], "base64");
  assert.equal(binary.length, model.buffers[0].byteLength);
});

test("Signature Jet artwork, motion and local sound are mapped to its exact gift code", () => {
  const gift = manifest.gifts.find(item => item.code === "signature-jet-exds0m");
  assert.equal(gift?.coin_price, 4888, "canonical configured value must remain intact");
  assert.equal(gift?.active, true, "canonical source active flag must remain intact");
  assert.match(generatorSource, /signature-jet-exds0m/);
  assert.match(generatorSource, /signature-jet-original-v1/);
  assert.match(effectsSource, /signature-jet-flight/);
  assert.match(effectsSource, /playSignatureJet/);
  assert.match(soundManifestSource, /signature-jet-turbofan-pass-and-airframe-chime-v1/);
  assert.match(soundManifestSource, /gift_specific_web_audio_synthesis/);
  const svg = readFileSync(path.join(assetRoot, gift.code + ".svg"), "utf8");
  const icon = readFileSync(path.join(assetRoot, gift.code + "-icon.svg"), "utf8");
  assert.ok(svg.includes('data-gift-artwork="signature-jet-original-v1"'));
  assert.ok(icon.includes('data-gift-artwork="signature-jet-original-v1"'));
});
