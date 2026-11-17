import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const server = read("src/server.js");
const serviceWorker = read("public/sw.js");
const readme = read("assets/Crop References/README.md");
const sourceDirectory = path.join(root, "assets", "Crop References", "Daily Ranking Badge");

const routedFrames = [
  { file: "Screenshot_20261112_021224_TikTok(1).png", route: "/assets/daily-ranking-badges/place-1.png" },
  { file: "Screenshot_20261112_021224_TikTok(2).png", route: "/assets/daily-ranking-badges/place-2.png" },
  { file: "Screenshot_20261112_021309_TikTok(1).png", route: "/assets/daily-ranking-badges/place-3.png" },
  { file: "Screenshot_20261112_021309_TikTok(2).png", route: "/assets/daily-ranking-badges/top-gifters-place-1.png" },
  { file: "Screenshot_20261112_021333_TikTok(1).png", route: "/assets/daily-ranking-badges/top-gifters-place-2.png" },
  { file: "Screenshot_20261112_021343_TikTok(1).png", route: "/assets/daily-ranking-badges/top-gifters-place-3.png" }
];
const sourceOnlyFrames = [
  "Screenshot_20261112_021355_TikTok(1).png",
  "Screenshot_20261112_021407_TikTok(1).png"
];

test("all eight Daily Ranking crops are preserved, unique and correctly classified", () => {
  assert.equal(routedFrames.length + sourceOnlyFrames.length, 8);
  const names = [...routedFrames.map(frame => frame.file), ...sourceOnlyFrames];
  const hashes = new Set();

  for (const name of names) {
    const filePath = path.join(sourceDirectory, name);
    assert.ok(fs.existsSync(filePath), name + " must exist in the canonical reference folder");
    const hash = createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
    assert.ok(!hashes.has(hash), name + " must not duplicate another Ranking reference");
    hashes.add(hash);
    assert.ok(readme.includes(name), name + " must be documented");
  }

  for (const frame of routedFrames) {
    const mapping = "'" + frame.route + "': '" + frame.file + "'";
    assert.ok(server.includes(mapping), frame.file + " must use its established server route");
    assert.ok(serviceWorker.includes(frame.route), frame.route + " must remain cached");
  }

  for (const name of sourceOnlyFrames) {
    assert.ok(!server.includes(name), name + " must not receive an invented ranking route");
    assert.ok(!serviceWorker.includes(name), name + " must not be exposed as a ranked runtime asset");
  }

  assert.match(readme, /Additional unnumbered source references — retained, not assigned to a rank/);
});
