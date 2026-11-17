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
  assert.match(progression, /src='\/assets\/gifter-badges\/level_/);
  assert.match(progression, /String\(levelNumber\)\.padStart\(2, "0"\)/);
  assert.match(progression, /alt='" \+ esc\(badgeName\) \+ "'/);
  assert.match(progression, /width='170' height='76'/);
  assert.doesNotMatch(progression, /MingloraGifterBadgeArt/);
  assert.match(styles, /\.gp-level-index-art\{[^}]*width:min\(100%,170px\);height:auto;aspect-ratio:170 \/ 76/);
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
  assert.ok(html.includes("/gifter-progression.css?v=20261116-gifter-range-canvas-crop-2"));
  assert.ok(html.includes("/gifter-progression.js?v=20261116-gifter-range-sheets-png-2"));
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
  assert.match(progression, /esc\(badgeName\)/);
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


test("Gifter sheet wrapper has no black edging while original artwork and sizing stay unchanged", () => {
  const styles = read("public/gifter-progression.css");
  assert.match(styles, /\.gp-art-panel\{[\s\S]*?max-width:720px[\s\S]*?padding:0[\s\S]*?overflow:hidden[\s\S]*?border:1\.5px solid rgba\(196,216,255,\.88\)[\s\S]*?background:transparent[\s\S]*?box-shadow:none/);
  assert.doesNotMatch(styles, /\.gp-art-panel\{[^}]*background:#0b1020/);
  assert.match(styles, /\.gp-art-panel>img,[\s\S]*?width:100%[\s\S]*?max-width:none[\s\S]*?height:auto[\s\S]*?transform:scale\(1\.08,1\.05\) translateY\(-\.55%\)/);
  assert.match(styles, /\.gp-art-panel:first-child>img,[\s\S]*?\.gp-art-panel--final>img\{[\s\S]*?transform:scale\(1\.08,1\.10\) translateY\(-2\.5%\)/);
  assert.match(styles, /@media\(max-width:760px\)\{[\s\S]*?\.gp-art-panel\{padding:0/);
});

test("clean-edge stylesheet cache key is current in HTML and service-worker shell", () => {
  const html = read("public/index.html");
  const sw = read("public/sw.js");
  assert.ok(html.includes("/gifter-progression.css?v=20261116-gifter-range-canvas-crop-2"));
  assert.ok(sw.includes("/gifter-progression.css?v=20261116-gifter-range-canvas-crop-2"));
  assert.ok(!sw.includes("/gifter-progression.css?v=20261110-gifter-level-polish-1"));
});



test("Gifter progression uses the original ordered Level panels as its primary artwork", () => {
  const progression = read("public/gifter-progression.js");
  const styles = read("public/gifter-progression.css");
  const html = read("public/index.html");
  const sw = read("public/sw.js");
  assert.ok(progression.includes("const BADGE_LEVEL_PANELS = Object.freeze(["));
  assert.ok(progression.includes("BADGE_LEVEL_PANELS.map(panel"));
  assert.ok(progression.includes("aria-label='Original Gifter Badge Levels artwork'"));
  assert.ok(progression.includes("const badgePanels = renderBadgePanels();"));
  assert.ok(progression.includes('badgePanels + "</section>" +'));
  assert.ok(!progression.includes("gp-chart-reference"));
  assert.ok(!progression.includes("gifters-level-up.png"));
  assert.ok(!progression.includes("gp-level-up-reference-note"));
  assert.ok(styles.includes(".gp-art-panel-stack{display:grid;grid-template-columns:minmax(0,1fr);gap:14px"));
  assert.ok(html.includes("/gifter-progression.css?v=20261116-gifter-range-canvas-crop-2"));
  assert.ok(sw.includes("/gifter-progression.css?v=20261116-gifter-range-canvas-crop-2"));
  assert.match(sw, /const CACHE_NAME='minglora-shell-v\d+-self-updating-1';/);
});


test("Gifter source references and cropped badge overlays each have one canonical location", () => {
  const progression = read("public/gifter-progression.js");
  const gifts = read("public/gifts.js");
  const server = read("src/server.js");
  const styles = read("public/gifter-progression.css");
  const sw = read("public/sw.js");
  const html = read("public/index.html");
  const rangeSheets = [
    ["LV.1 - LV.9.png", "lv-1-9.png"],
    ["LV.10 - LV.19.png", "lv-10-19.png"],
    ["LV.20 - LV.29.png", "lv-20-29.png"],
    ["LV.30 - LV.39.png", "lv-30-39.png"],
    ["LV.40 - LV.49.png", "lv-40-49.png"],
    ["LV.50+.png", "lv-50-plus.png"]
  ];
  const masterSheets = [
    ["Badges_Level_01-50/Badges_Level_01-50.png", "/assets/gifter-badge-reference/master-sheet.png"],
    ["Badges_Level_01-50/Badges_Level_01-50_preview.jpg", "/assets/gifter-badge-reference/master-sheet-preview.jpg"]
  ];
  const sourcePaths = [
    "Gifters Rewards.png",
    ...panelFiles,
    ...masterSheets.map(([file]) => file),
    ...individualBadgeFiles.map(file => path.join("Level_Badges_01-50_Individual", file))
  ];
  assert.equal(sourcePaths.length, 64, "the remaining Gifter badge collection excludes the six separately catalogued Crop References");
  assert.equal(individualBadgeFiles.length, 50, "every individual Gifter PNG is enumerated");
  sourcePaths.forEach(file => {
    assert.ok(fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", file)), file + " remains in the canonical source folder");
  });

  assert.ok(gifts.includes("/assets/gifters-rewards.png"), "Gifters Rewards artwork remains on the Gifts entry banner");
  assert.ok(!progression.includes("gifters-level-up.png"));
  assert.ok(!progression.includes("gp-chart-reference"));
  assert.ok(!fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", "Gifters Level Up.png")));
  assert.ok(!server.includes("if(p==='/assets/gifters-level-up.png')"));
  assert.ok(!sw.includes("'/assets/gifters-level-up.png'"));

  rangeSheets.forEach(([sourceFile, routeFile]) => {
    const cropPath = path.join(root, "assets", "Crop References", "Gifter level range sheets", sourceFile);
    assert.ok(fs.existsSync(cropPath), sourceFile + " is the canonical PNG range sheet in Crop References");
    assert.ok(!fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", sourceFile)), sourceFile + " is not duplicated in the old root folder");
    assert.ok(!fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", "Gifter level range sheets", sourceFile.replace(".jpg", ".png"))), sourceFile + " has no duplicate legacy range PNG");
    const milestoneCrop = sourceFile;
    assert.ok(fs.existsSync(path.join(root, "assets", "Crop References", "Gifters Badges", milestoneCrop)), milestoneCrop + " is present as the canonical cropped milestone badge");
    assert.ok(!fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", "Gifters Badges", "Png", milestoneCrop)), milestoneCrop + " has no duplicate legacy milestone badge");
    assert.ok(!fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", "Gifters Badges", "psd", milestoneCrop.replace(".png", ".psd"))), milestoneCrop + " has no duplicate legacy PSD");
    assert.ok(progression.includes('file: "' + routeFile + '"'), routeFile + " is rendered in the range gallery");
    assert.ok(server.includes("'/assets/gifter-badge-range-sheets/" + routeFile + "'"), routeFile + " has an explicit server allow-list route");
    assert.ok(sw.includes("'/assets/gifter-badge-range-sheets/" + routeFile + "'"), routeFile + " is precached");
    assert.ok(server.includes("'" + sourceFile + "'"), sourceFile + " maps to its Crop References source");
  });
  assert.ok(!fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", "Gifters Badges", "psd", "LV.1 - LV.9")), "the legacy extensionless PSD duplicate has been removed");
  masterSheets.forEach(([sourceFile, route]) => {
    assert.ok(progression.includes(route), route + " appears in the master collection section");
    assert.ok(server.includes("'" + route + "'"), route + " has an explicit server route");
    assert.ok(sw.includes("'" + route + "'"), route + " is precached");
    assert.ok(server.includes("'" + sourceFile.split("/").at(-1) + "'"), sourceFile + " maps to the correct original file");
  });
  assert.ok(progression.includes("renderMasterBadgeReference()"));
  assert.ok(progression.includes("renderRangeReferenceSheets()"));
  assert.ok(progression.includes("src='/assets/gifter-badges/level_" + '" + badgeNumber + "' + ".png'"), "each level card displays its corresponding original PNG");
  assert.ok(progression.includes("src='/assets/gifter-badges/level_" + '" + badgeNumber + "' + ".png'"), "every original PNG is visibly previewed on its matching level card");
  assert.ok(!progression.includes("gp-level-index-original"), "level cards do not add a duplicate PNG thumbnail");
  assert.match(styles, /\.gp-reference-figure img\{display:block;width:100%[^}]*height:auto[^}]*object-fit:contain/);
  assert.ok(html.includes("/gifter-progression.css?v=20261116-gifter-range-canvas-crop-2"));
  assert.ok(html.includes("/gifter-progression.js?v=20261116-gifter-range-sheets-png-2"));
  assert.ok(sw.includes("/gifter-progression.css?v=20261116-gifter-range-canvas-crop-2"));
  assert.ok(sw.includes("/gifter-progression.js?v=20261116-gifter-range-sheets-png-2"));
});

test("the PWA shell precaches all 50 original numbered Gifter PNGs", () => {
  const sw = read("public/sw.js");
  assert.match(sw, /for\(let level=1;level<=50;level\+\+\)/);
  assert.ok(sw.includes("SHELL.push('/assets/gifter-badges/level_'+String(level).padStart(2,'0')+'.png');"));
  assert.ok(sw.includes("'/assets/gifter-badge-range-sheets/lv-1-9.png'"));
  assert.ok(sw.includes("'/assets/gifter-badge-reference/master-sheet.png'"));
  assert.ok(sw.includes("'/assets/gifter-badge-progression-art.png'"), "the new progression art is precached");
});


test("all 50 individual Gifter badges share the progression artwork's bright premium lighting", () => {
  const styles = read("public/gifter-progression.css");
  const progression = read("public/gifter-progression.js");
  assert.match(styles, /\.gp-level-index-item \.gp-level-index-art\{[\s\S]*?brightness\(1\.48\) saturate\(1\.3\) contrast\(1\.12\)/);
  assert.match(styles, /\.gp-level-index-item\.is-locked \.gp-level-index-art\{opacity:\.88\}/);
  assert.match(styles, /@keyframes gp-earned-badge-pulse[\s\S]*?brightness\(1\.7\) saturate\(1\.42\) contrast\(1\.16\)/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.gp-level-index-item\.is-current \.gp-level-index-art\{animation:none\}/);
  assert.match(progression, /src='\/assets\/gifter-badges\/level_/);
  assert.doesNotMatch(styles, /\.gp-level-index-item\.is-locked \.gp-level-index-art\{filter:grayscale/);
});
