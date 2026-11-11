import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const individualBadgeFiles = Array.from({ length: 50 }, (_, index) => `level_${String(index + 1).padStart(2, "0")}.png`);

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

test("ordered Level references each display their matching individual original badge", () => {
  const progression = read("public/gifter-progression.js");
  const styles = read("public/gifter-progression.css");
  assert.match(progression, /gp-level-index-art/);
  assert.match(progression, /src='\/assets\/gifter-badges\/level_"/);
  assert.match(progression, /String\(levelNumber\)\.padStart\(2, "0"\)/);
  assert.match(progression, /alt='Level " \+ number\(levelNumber\) \+ " gifter badge'/);
  assert.match(progression, /loading='lazy' decoding='async' width='80' height='80'/);
  assert.doesNotMatch(progression, /MingloraGifterBadgeArt/);
  assert.match(styles, /\.gp-level-index-art\{[^}]*width:76px;height:76px[^}]*aspect-ratio:1\/1[^}]*object-fit:contain/);
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*?\.gp-level-index-art\{width:64px;height:64px\}/);
  assert.match(styles, /@media\(max-width:480px\)[\s\S]*?\.gp-level-index-grid\[data-layout="horizontal"\]\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(styles, /\.gp-art-panel-stack\{display:grid;grid-template-columns:minmax\(0,1fr\);gap:14px/);
  assert.match(styles, /\.gp-art-panel>img\{display:block;width:100%;max-width:100%;height:auto;object-fit:contain/);
  assert.match(styles, /\.gp-art-panel--final>img\{width:auto;max-width:100%;height:auto;margin-inline:auto/);
});

test("all 50 individual badge files are valid PNGs with distinct image content", () => {
  const progression = read("public/gifter-progression.js");
  const server = read("src/server.js");
  const hashes = individualBadgeFiles.map(filename => {
    const file = path.join(root, "assets", "Gifters Badge Levels", "Level_Badges_01-50_Individual", filename);
    assert.ok(fs.existsSync(file), filename + " exists in the original badge collection");
    const data = fs.readFileSync(file);
    assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", filename + " is a PNG");
    return createHash("sha256").update(data).digest("hex");
  });
  assert.equal(new Set(hashes).size, 50, "no Level reuses another Level's badge image");
  assert.match(progression, /String\(levelNumber\)\.padStart\(2, "0"\)/);
  assert.match(server, /individualGifterBadgeMatch[\s\S]*?Level_Badges_01-50_Individual[\s\S]*?'Content-Type':'image\/png'/);
  assert.match(server, /badgeLevel<1\|\|badgeLevel>50/);
});

test("level artwork route is an explicit allow-list and serves JPEG without exposing file paths", () => {
  const server = read("src/server.js");
  assert.match(server, /gifter-badge-level-panels\/levels-1-4\.jpg/);
  assert.match(server, /gifter-badge-level-panels\/levels-50\.jpg/);
  assert.match(server, /path\.join\(__dirname,'\.\.',\s*'assets','Gifters Badge Levels'/);
  assert.match(server, /'Content-Type':'image\/jpeg'/);
  assert.match(server, /Gifter badge level artwork not found/);
});

test("updated progression assets and all original JPG panels are included in the app shell", () => {
  const html = read("public/index.html");
  const sw = read("public/sw.js");
  assert.ok(html.includes("/gifter-progression.css?v=20261111-gifter-reference-readability-1"));
  assert.ok(html.includes("/gifter-progression.js?v=20261110-gifter-individual-badges-1"));
  panelFiles.forEach(filename => {
    const routeName = filename.toLowerCase().replaceAll(" ", "-");
    assert.ok(sw.includes("/assets/gifter-badge-level-panels/" + routeName));
  });
});


test("level and badge names have separate horizontal and vertical ordered layouts", () => {
  const progression = read("public/gifter-progression.js");
  const styles = read("public/gifter-progression.css");
  assert.match(progression, /function renderLevelDirectory\(items\)/);
  assert.match(progression, /\.sort\(\(a, b\) => Number\(a\.level\) - Number\(b\.level\)\)/);
  assert.match(progression, /data-gp-level-layout='horizontal'/);
  assert.match(progression, /data-gp-level-layout='vertical'/);
  assert.match(progression, /data-layout='horizontal'/);
  assert.match(progression, /levelGrid\.dataset\.layout = layout/);
  assert.match(progression, /esc\(item\.tier \|\| "Gifter"\)/);
  assert.match(progression, /item\.coinsRequired \?\? item\.xpRequired/);
  assert.match(styles, /\.gp-level-index-grid\[data-layout="horizontal"\]\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/);
  assert.match(styles, /\.gp-level-index-grid\[data-layout="vertical"\]\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(styles, /\.gp-level-layout-button\[aria-pressed="true"\]/);
  assert.ok(progression.indexOf('badgePanels + "</section>" +') < progression.indexOf("levelDirectory +"), "level directory follows the separate artwork stack");
});

test("original artwork panels are centered, responsive, uncropped and capped at native image width", () => {
  const styles = read("public/gifter-progression.css");
  assert.match(styles, /\.gp-art-panel-stack\{[\s\S]*?max-width:820px[\s\S]*?margin:0 auto/);
  assert.match(styles, /\.gp-art-panel>img\{[\s\S]*?max-width:720px[\s\S]*?height:auto[\s\S]*?object-fit:contain/);
  assert.match(styles, /\.gp-art-panel\{[\s\S]*?border-radius:16px[\s\S]*?background:linear-gradient/);
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*?\.gp-art-panel\{padding:5px;border-radius:12px\}/);
});


test("Gifter artwork removes unused outer padding and uses a brighter clean edge", () => {
  const styles = read("public/gifter-progression.css");
  assert.match(styles, /\.gp-art-panel\{[\s\S]*?max-width:720px[\s\S]*?padding:0[\s\S]*?overflow:hidden[\s\S]*?border:1\.5px solid rgba\(196,216,255,\.88\)/);
  assert.match(styles, /\.gp-art-panel>img,[\s\S]*?width:100%[\s\S]*?max-width:none[\s\S]*?height:auto[\s\S]*?transform:scale\(1\.08,1\.05\) translateY\(-\.55%\)/);
  assert.match(styles, /\.gp-art-panel:first-child>img,[\s\S]*?\.gp-art-panel--final>img\{[\s\S]*?transform:scale\(1\.08,1\.10\) translateY\(-2\.5%\)/);
  assert.match(styles, /box-shadow:[\s\S]*?inset 0 0 0 1px rgba\(245,249,255,\.42\)/);
  assert.match(styles, /@media\(max-width:760px\)\{[\s\S]*?\.gp-art-panel\{padding:0/);
});

test("clean-edge stylesheet cache key is current in HTML and service-worker shell", () => {
  const html = read("public/index.html");
  const sw = read("public/sw.js");
  assert.ok(html.includes("/gifter-progression.css?v=20261111-gifter-reference-readability-1"));
  assert.ok(sw.includes("/gifter-progression.css?v=20261111-gifter-reference-readability-1"));
  assert.ok(!sw.includes("/gifter-progression.css?v=20261110-gifter-level-polish-1"));
});



test("Gifters Level-Up chart is readable and offers a full-size zoom view on every device", () => {
  const progression = read("public/gifter-progression.js");
  const styles = read("public/gifter-progression.css");
  const html = read("public/index.html");
  const sw = read("public/sw.js");
  assert.match(progression, /gp-chart-fullsize[\s\S]*?View full-size chart to zoom/);
  assert.match(progression, /href='\/assets\/Gifters%20Level%20Up\.png' target='_blank' rel='noopener noreferrer'/);
  assert.match(styles, /\.gp-hero-art \.gp-reference-art\{[\s\S]*?max-width:1100px[\s\S]*?max-height:none[\s\S]*?height:auto/);
  assert.match(styles, /@media\(max-width:650px\)[\s\S]*?\.gp-hero-art \.gp-reference-art\{width:100%;max-height:none\}/);
  assert.match(styles, /\.gp-chart-fullsize\{[\s\S]*?min-height:46px[\s\S]*?font-size:1rem/);
  assert.ok(html.includes("/gifter-progression.css?v=20261111-gifter-reference-readability-1"));
  assert.ok(sw.includes("/gifter-progression.css?v=20261111-gifter-reference-readability-1"));
  assert.ok(sw.includes("minglora-shell-v276-self-updating-1"));
});


test("ordered gifter badge references are prominent and legible on phone-sized screens", () => {
  const styles = read("public/gifter-progression.css");
  const readable = styles.slice(styles.lastIndexOf("/* Readable ordered gifter badge references */"));
  assert.ok(readable.length > 0, "readability overrides are present at the end of the stylesheet");
  assert.match(readable, /\.gp-level-index-item\{grid-template-columns:92px minmax\(0,1fr\)[^}]*min-height:116px/);
  assert.match(readable, /\.gp-level-index-art\{width:92px;height:92px[^}]*object-fit:contain/);
  assert.match(readable, /\.gp-level-index-badge\{font-size:1rem/);
  assert.match(readable, /@media\(max-width:480px\)[\s\S]*?grid-template-columns:96px minmax\(0,1fr\)[\s\S]*?width:96px;height:96px/);
  assert.match(readable, /@media\(max-width:360px\)[\s\S]*?grid-template-columns:88px minmax\(0,1fr\)[\s\S]*?width:88px;height:88px/);
});
