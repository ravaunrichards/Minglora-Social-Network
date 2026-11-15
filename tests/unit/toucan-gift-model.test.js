import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createToucanModel } from "../../assets/3d-assets/gift-models/toucan-model.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(readFileSync(path.join(root, "data/minglora-gift-catalog.json"), "utf8"));
const assetRoot = path.join(root, "public/assets/gifts/catalog");

test("Toucan gift uses original keel-billed geometry and subject-specific Minglora artwork", () => {
  const gift = manifest.gifts.find(item => item.code === "toucan-1ovzxjb");
  assert.ok(gift, "canonical Toucan gift record must exist");
  assert.equal(gift.category, "animals");
  assert.ok(Number.isSafeInteger(gift.coin_price) && gift.coin_price >= 1);
  assert.equal(typeof gift.active, "boolean");

  const model = createToucanModel();
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-toucan-3d-v1");
  assert.equal(model.asset?.extras?.source, "assets/3d-assets/gift-models/toucan-model.mjs");
  assert.equal(model.asset?.extras?.reviewStatus, "design-review-pending");
  assert.match(model.asset?.extras?.artDirection || "", /three-quarter-profile keel-billed rainforest toucan.*near-black matte plumage.*rich golden-yellow throat bib.*exposed orange bill blaze stripe.*oversized horizontally presented banana-curved lime bill.*scarlet undertail.*zygodactyl feet/i);

  const primitives = model.meshes?.[0]?.primitives || [];
  assert.ok(primitives.length >= 35, "Toucan must be assembled from subject-specific meshes, not a shared animal sphere");
  const partNames = primitives.map(primitive => primitive.extras?.mingloraPartName);
  assert.equal(new Set(partNames).size, partNames.length, "every authored mesh part must have a unique name");
  const requiredParts = [
    "Toucan sculpted glossy-black body plumage",
    "Toucan bright golden-yellow throat and chest bib",
    "Toucan scarlet undertail coverts",
    "Toucan rounded black crown and head",
    "Toucan turquoise lower mandible",
    "Toucan oversized lime-green upper bill",
    "Toucan orange bill blaze",
    "Toucan exposed orange upper-bill blaze stripe",
    "Toucan red upper bill tip",
    "Toucan deep-blue lower bill tip",
    "Toucan left blue-grey leg",
    "Toucan right blue-grey leg",
    "Toucan left backward inner toe",
    "Toucan right backward inner toe",
    "Toucan rainforest perch - textured branch"
  ];
  for (const name of requiredParts) {
    assert.ok(partNames.includes(name), "missing authored anatomy/detail: " + name);
  }
  assert.ok(partNames.some(name => name.startsWith("Toucan left layered wing feather")));
  assert.ok(partNames.some(name => name.startsWith("Toucan right layered wing feather")));
  const upperBill = primitives.find(primitive => primitive.extras?.mingloraPartName === "Toucan oversized lime-green upper bill");
  assert.ok(upperBill, "the original upper bill mesh must exist");
  const upperBillBounds = model.accessors?.[upperBill.attributes?.POSITION];
  assert.ok(upperBillBounds.max[0] - upperBillBounds.min[0] > 0.5, "the bill must project horizontally in the model viewer rather than point into the camera");
  const body = primitives.find(primitive => primitive.extras?.mingloraPartName === "Toucan sculpted glossy-black body plumage");
  assert.ok(body, "the body mesh must exist");
  const bodyMaterial = model.materials?.[body.material];
  assert.ok(bodyMaterial?.pbrMetallicRoughness?.roughnessFactor >= 0.85, "dark plumage must use a matte material to avoid washed-out metallic reflections");
  assert.equal(model.materials?.length, primitives.length, "each named part must retain its own PBR material");

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
    assert.equal(indices?.componentType, 5123);
    assert.ok(indices.count >= 3);
    assert.ok(material?.pbrMetallicRoughness?.roughnessFactor >= 0.15);
    assert.ok(material?.pbrMetallicRoughness?.roughnessFactor <= 0.95);
    assert.ok(material?.pbrMetallicRoughness?.metallicFactor >= 0);
    assert.ok(material?.pbrMetallicRoughness?.metallicFactor <= 1);
  }

  const embedded = model.buffers?.[0]?.uri || "";
  assert.ok(embedded.startsWith("data:application/octet-stream;base64,"), "model must be self-contained for the existing viewer");
  const binary = Buffer.from(embedded.split(",")[1], "base64");
  assert.equal(binary.length, model.buffers[0].byteLength);

  const svg = readFileSync(path.join(assetRoot, gift.code + ".svg"), "utf8");
  const icon = readFileSync(path.join(assetRoot, gift.code + "-icon.svg"), "utf8");
  assert.ok(svg.includes('data-gift-artwork="toucan-rainforest-original-v1"'), "primary artwork must be Toucan-specific");
  assert.ok(icon.includes('data-gift-artwork="toucan-rainforest-original-v1"'), "transparent icon must be Toucan-specific");
});
