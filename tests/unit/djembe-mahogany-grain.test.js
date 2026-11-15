import test from "node:test";
import assert from "node:assert/strict";
import { createDjembeModel } from "../../assets/3d-assets/gift-models/djembe-model.mjs";

test("Djembe Master includes twelve lightweight mahogany grain inlays in its self-contained GLTF", () => {
  const model = createDjembeModel();
  assert.equal(model.asset?.version, "2.0");
  assert.equal(model.asset?.extras?.mingloraAssetId, "gift-djembe-3d-v1");
  assert.equal(model.asset?.extras?.reviewStatus, "design-review-pending");
  assert.match(model.asset?.extras?.artDirection || "", /twelve fine flowing grain inlays/);

  const primitives = model.meshes?.[0]?.primitives || [];
  const grain = primitives.filter(primitive =>
    primitive.extras?.mingloraPartName?.startsWith("Djembe flowing mahogany grain inlay ")
  );
  assert.equal(grain.length, 12, "each original grain path must remain individually inspectable");

  const names = grain.map(primitive => primitive.extras.mingloraPartName);
  assert.equal(new Set(names).size, 12, "grain path names must be unique");

  for (const primitive of grain) {
    const position = model.accessors?.[primitive.attributes?.POSITION];
    const normal = model.accessors?.[primitive.attributes?.NORMAL];
    const indices = model.accessors?.[primitive.indices];
    const material = model.materials?.[primitive.material];

    assert.equal(position?.type, "VEC3");
    assert.equal(normal?.type, "VEC3");
    assert.equal(position?.count, 56, "seven-point grain path should use the expected low-poly tube");
    assert.equal(normal?.count, position?.count);
    assert.equal(indices?.componentType, 5123);
    assert.equal(indices?.count, 294);
    assert.ok(position.min.every(Number.isFinite));
    assert.ok(position.max.every(Number.isFinite));
    assert.ok(position.max[1] - position.min[1] > 1.0, "grain must follow most of the carved shell height");
    assert.equal(material?.pbrMetallicRoughness?.roughnessFactor, 0.82);
    assert.equal(material?.pbrMetallicRoughness?.metallicFactor, 0.01);
  }

  const binary = Buffer.from(model.buffers?.[0]?.uri?.split(",")[1] || "", "base64");
  assert.equal(binary.length, model.buffers?.[0]?.byteLength);
  assert.ok(binary.length > 0, "the completed Djembe model must remain self-contained");
});
