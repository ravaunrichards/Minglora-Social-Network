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
  { file: "Screenshot_20261112_021343_TikTok(1).png", route: "/assets/daily-ranking-badges/top-gifters-place-3.png" },
  { file: "Screenshot_20261112_021355_TikTok(1).png", route: "/assets/daily-ranking-badges/place-4-10.png" },
  { file: "Screenshot_20261112_021407_TikTok(1).png", route: "/assets/daily-ranking-badges/place-11-20.png" }
];

test("all eight supplied Daily Ranking references are preserved, unique, mapped and cached", () => {
  assert.equal(routedFrames.length, 8);
  const hashes = new Set();
  for (const frame of routedFrames) {
    const filePath = path.join(sourceDirectory, frame.file);
    assert.ok(fs.existsSync(filePath), frame.file + " must exist in the canonical reference folder");
    const hash = createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
    assert.ok(!hashes.has(hash), frame.file + " must not duplicate another Ranking reference");
    hashes.add(hash);
    assert.ok(readme.includes(frame.file), frame.file + " must be documented");
    assert.ok(server.includes("'" + frame.route + "': '" + frame.file + "'"), frame.file + " must use its canonical server route");
    assert.ok(serviceWorker.includes(frame.route), frame.route + " must remain available in the PWA shell");
  }
  assert.match(readme, /blue\/silver flame frame for ranks \*\*4–10\*\*/);
  assert.match(readme, /blue\/white flame frame for ranks \*\*11–20\*\*/);
});
