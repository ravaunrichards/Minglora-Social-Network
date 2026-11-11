import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => readFileSync(path.join(root, file), "utf8");

test("Minglora Gifter surfaces spell out Level and Levels", () => {
  const paths = [
    "backend/modules/gifter-progression/service.js",
    "public/gifter-progression.js",
    "public/gifter-progression.css",
    "public/gifter-badge-art.js",
    "public/gifts.js"
  ];

  for (const file of paths) {
    assert.doesNotMatch(read(file), /\\bLV\\b/, file + " must not abbreviate Level as LV");
  }

  assert.match(read("backend/modules/gifter-progression/service.js"), /Gifter · Level /);
  assert.match(read("public/gifter-progression.js"), /Levels 1–50/);
  assert.match(read("public/gifter-progression.js"), /How Gifter Levels are earned/);
  assert.match(read("public/gifter-badge-art.js"), /Gifter Level /);
  assert.match(read("public/gifts.js"), /View Gifter Levels &amp; Badges/);
});
