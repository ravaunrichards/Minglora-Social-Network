import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const panelFiles = [
  "Levels 1-4.jpg",
  "Levels 5-9.jpg",
  "Levels 10-14.jpg",
  "Levels 15-19.jpg",
  "Levels 20-24.jpg",
  "Levels 25-29.jpg",
  "Levels 30-34.jpg",
  "Levels 35-39.jpg",
  "Levels 40-44.jpg",
  "Levels 45-49.jpg",
  "Levels 50.jpg"
];

test("Gifters Badge Levels keeps and renders all 11 original JPGs in ascending panel order", () => {
  const progression = read("public/gifter-progression.js");
  const server = read("src/server.js");
  panelFiles.forEach((filename, index) => {
    assert.ok(fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", filename)), filename + " remains in the original artwork folder");
    const routeName = filename.toLowerCase().replaceAll(" ", "-").replaceAll(".jpg", ".jpg").replace("levels-", "levels-");
    assert.ok(progression.includes(routeName), "progression view references " + routeName);
    assert.ok(server.includes("'" + filename + "'"), "server allow-lists " + filename);
  });
  assert.match(progression, /BADGE_LEVEL_PANELS = Object\.freeze\(\[/);
  assert.match(progression, /BADGE_LEVEL_PANELS\.map\(panel/);
  assert.match(progression, /gp-art-panel--final/);
  assert.match(progression, /gp-art-panel-stack/);
});

test("Gifters Badge Levels shows complete original panels and no separate per-level badge cards", () => {
  const progression = read("public/gifter-progression.js");
  const styles = read("public/gifter-progression.css");
  assert.doesNotMatch(progression, /function badgeMarkup|function levelCard|function detailMarkup|data-gp-level|gp-selected-badge|gp-level25-emblem|MingloraGifterBadgeArt/);
  assert.match(progression, /loading='lazy' decoding='async'/);
  assert.match(styles, /\.gp-art-panel-stack\{display:grid;grid-template-columns:minmax\(0,1fr\);gap:14px/);
  assert.match(styles, /\.gp-art-panel>img\{display:block;width:100%;max-width:100%;height:auto;object-fit:contain/);
  assert.match(styles, /\.gp-art-panel--final>img\{width:auto;max-width:100%;height:auto;margin-inline:auto/);
});

test("level artwork route is an explicit allow-list and serves JPEG without exposing file paths", () => {
  const server = read("src/server.js");
  assert.match(server, /gifter-badge-level-panels\/levels-1-4\.jpg/);
  assert.match(server, /gifter-badge-level-panels\/levels-50\.jpg/);
  assert.match(server, /path\.join\(__dirname,'\.\.', 'assets'/);
  assert.match(server, /'Content-Type':'image\/jpeg'/);
  assert.match(server, /Gifter badge level artwork not found/);
});

test("updated progression assets and all original JPG panels are included in the app shell", () => {
  const html = read("public/index.html");
  const sw = read("public/sw.js");
  assert.ok(html.includes("/gifter-progression.css?v=20261110-gifter-level-panels-1"));
  assert.ok(html.includes("/gifter-progression.js?v=20261110-gifter-level-panels-1"));
  panelFiles.forEach(filename => {
    const routeName = filename.toLowerCase().replaceAll(" ", "-");
    assert.ok(sw.includes("/assets/gifter-badge-level-panels/" + routeName));
  });
});
