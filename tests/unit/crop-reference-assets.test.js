import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const server = read("src/server.js");
const app = read("public/app.js");
const topGifters = read("public/top-gifters.js");
const rankingStyles = read("public/styles.css");
const progressionStyles = read("public/gifter-progression.css");
const profileBadgeStyles = read("public/profile-badges.css");
const serviceWorker = read("public/sw.js");
const html = read("public/index.html");
const leagues = read("public/leagues.js");
const leagueStyles = read("public/leagues.css");


test("Crop References use canonical folders and contain no duplicate image files", () => {
  const milestoneNames = [
    "LV.1 - LV.9.png", "LV.10 - LV.19.png", "LV.20 - LV.29.png",
    "LV.30 - LV.39.png", "LV.40 - LV.49.png", "LV.50+.png"
  ];
  const rangeNames = [
    "LV.1 - LV.9.png", "LV.10 - LV.19.png", "LV.20 - LV.29.png",
    "LV.30 - LV.39.png", "LV.40 - LV.49.png", "LV.50+.png"
  ];
  const rankingNames = [
    "Screenshot_20261112_021224_TikTok(1).png",
    "Screenshot_20261112_021224_TikTok(2).png",
    "Screenshot_20261112_021309_TikTok(1).png",
    "Screenshot_20261112_021309_TikTok(2).png",
    "Screenshot_20261112_021333_TikTok(1).png",
    "Screenshot_20261112_021343_TikTok(1).png"
  ];
  const guestNames = [
    "Full Screen.png", "Fluid Panel.png", "Fluid Grid.png",
    "Fixed Grid.png", "Fixed Panel.png", "Side by Side.png",
    "Spotlight.png", "Roundtable 1.png", "Roundtable 2.png"
  ];
  const sourceFiles = [
    ...milestoneNames.map(name => path.join("assets", "Crop References", "Gifters Badges", name)),
    ...rangeNames.map(name => path.join("assets", "Crop References", "Gifter level range sheets", name)),
    ...rankingNames.map(name => path.join("assets", "Crop References", "Daily Ranking Badge", name)),
    ...guestNames.map(name => path.join("assets", "Crop References", "Guests Layout", "png", name)),
    path.join("assets", "Crop References", "Profile Picture", "ENIGMA.png")
  ];
  const hashes = new Map();
  for (const relativePath of sourceFiles) {
    const bytes = fs.readFileSync(path.join(root, relativePath));
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.ok(!hashes.has(hash), relativePath + " duplicates " + hashes.get(hash));
    hashes.set(hash, relativePath);
  }
  assert.equal(sourceFiles.length, 28);
  for (const name of milestoneNames) {
    assert.ok(fs.existsSync(path.join(root, "assets", "Crop References", "Gifters Badges", name)), name + " is in the canonical milestone folder");
    assert.ok(!fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", "Gifters Badges", "Png", name)), name + " has no legacy PNG duplicate");
    assert.ok(!fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", "Gifters Badges", "psd", name.replace(".png", ".psd"))), name + " has no legacy PSD duplicate");
  }
  for (const name of rangeNames) {
    const stem = name.replace(".png", "");
    const rangeFolder = path.join(root, "assets", "Crop References", "Gifter level range sheets");
    assert.ok(fs.existsSync(path.join(rangeFolder, name)), name + " is the canonical PNG range sheet");
    assert.ok(!fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", name)), name + " has no duplicate legacy range-sheet copy");
  }
});

test("all 50 Gifter levels keep unique artwork while six crop badges light milestone stages", () => {
  assert.match(server, /individualGifterBadgeMatch[\s\S]*?Level_Badges_01-50_Individual/);
  assert.match(server, /gifter-crop-badges\/range-1\.png/);
  assert.match(server, /gifter-crop-badges\/range-6\.png/);
  assert.match(server, /'Crop References','Gifters Badges'/);
  assert.match(read("public/gifter-progression.js"), /PROGRESSION_TRACK_STAGES\.map\(\(stageLevel, index\) => track\.level >= stageLevel/);
  assert.match(read("public/gifter-progression.js"), /gifter-crop-badges\/range-/);

  assert.ok(server.includes("/assets/gifter-badge-range-sheets/lv-1-9.png"));
  assert.ok(serviceWorker.includes("/assets/gifter-badge-range-sheets/lv-1-9.png"));
  assert.ok(!server.includes("/assets/gifter-badge-range-sheets/lv-1-9.jpg"));
  assert.ok(!serviceWorker.includes("/assets/gifter-badge-range-sheets/lv-1-9.jpg"));
  assert.ok(server.includes("'Crop References','Gifter level range sheets'"));
  assert.match(html, /gifter-progression\.js\?v=20261116-gifter-range-sheet-single-layer-1/);
  assert.match(progressionStyles, /\.gp-level-index-item\.is-locked \.gp-level-index-art\{opacity:1\}/);
  assert.match(progressionStyles, /is-unlocked \.gp-level-index-art/);
  assert.match(progressionStyles, /is-current \.gp-level-index-art/);
  assert.match(progressionStyles, /is-admin-awarded \.gp-level-index-art/);
  assert.match(progressionStyles, /\.gp-progression-range-badge/);
  assert.ok(progressionStyles.includes("brightness(1.48)"));
  assert.ok(progressionStyles.includes("gp-progression-milestone-glow"));
  assert.match(progressionStyles, /\.gp-range-reference-grid\{gap:5px\}/);
  assert.match(progressionStyles, /\.gp-range-reference-figure\{gap:4px;padding:5px\}/);
  assert.match(progressionStyles, /aspect-ratio:170 \/ 76/);
  assert.match(progressionStyles, /grid-template-columns:minmax\(0,170px\) minmax\(0,1fr\)/);
  assert.match(progressionStyles, /\.gp-current-badge-image/);
  assert.match(progressionStyles, /\.gp-leader-badge img/);
  assert.match(profileBadgeStyles, /filter:brightness\(1\.48\) saturate\(1\.3\) contrast\(1\.12\)/);
  assert.match(profileBadgeStyles, /@keyframes live-gifter-badge-glow/);
  assert.match(profileBadgeStyles, /@keyframes minglora-gifter-badge-glow/);

});

test("Daily top-three ranking uses the supplied cropped first, second and third place frames", () => {
  assert.match(server, /daily-ranking-badges\/place-1\.png/);
  assert.match(server, /daily-ranking-badges\/place-2\.png/);
  assert.match(server, /daily-ranking-badges\/place-3\.png/);
  assert.match(topGifters, /activePeriod === "daily" && position <= 3/);
  assert.match(server, /daily-ranking-badges\/top-gifters-place-1\.png/);
  assert.match(server, /daily-ranking-badges\/top-gifters-place-2\.png/);
  assert.match(server, /daily-ranking-badges\/top-gifters-place-3\.png/);
  assert.match(topGifters, /daily-ranking-badges\/top-gifters-place-/);
  assert.match(serviceWorker, /daily-ranking-badges\/top-gifters-place-1\.png/);
  assert.match(rankingStyles, /\.minglora-gifter-podium \.minglora-gifter-rank-frame/);
  assert.match(rankingStyles, /\.minglora-gifter-podium \.minglora-gifter-rank-avatar/);
  assert.match(app, /live-daily-podium/);
  assert.match(app, /Daily LIVE Gifter Rankings/);
  assert.match(rankingStyles, /\.live-daily-podium \.live-daily-podium-frame/);

});

test("the nine uploaded guest-layout references are used as LIVE layout thumbnails", () => {
  const layouts = ["full-screen", "fluid-panel", "fluid-grid", "fixed-grid", "fixed-panel", "side-by-side", "spotlight", "roundtable-1", "roundtable-2"];
  for (const layout of layouts) {
    assert.ok(server.includes("/assets/live-guest-layouts/" + layout + ".png"), "missing route for " + layout);
    assert.ok(serviceWorker.includes("/assets/live-guest-layouts/" + layout + ".png"), "missing cache entry for " + layout);
  }
  assert.match(app, /live-layout-preview/);
});

test("ENIGMA is the default profile avatar and is served from the original crop-reference file", () => {
  assert.match(app, /DEFAULT_PROFILE_AVATAR='\/assets\/profile-defaults\/enigma\.png/);
  assert.match(server, /'Crop References','Profile Picture','ENIGMA\.png'/);
  const migration = read("database/migrations/086_minglora_enigma_default_profile_picture.sql");
  assert.match(migration, /ALTER COLUMN avatar_url SET DEFAULT/);
  assert.match(migration, /Crop%20References\/Profile%20Picture\/ENIGMA\.png/);
  assert.match(migration, /WHERE avatar_url IN \(/);
  assert.match(migration, /default-profile-avatar-3d\.svg/);

  assert.match(serviceWorker, /profile-defaults\/enigma\.png/);
});

test("frontend and service-worker versions invalidate old assets and scripts", () => {
  assert.match(serviceWorker, /minglora-shell-v349-self-updating-1/);
  assert.match(html, /app\.js\?v=20261116-standalone-rankings-1/);
  assert.match(html, /top-gifters\.js\?v=20261116-daily-ranking-crop-badges-2/);
  assert.match(html, /gifter-progression\.css\?v=20261116-gifter-range-sheet-single-layer-1/);
  assert.match(html, /gifter-progression\.js\?v=20261116-gifter-range-sheet-single-layer-1/);
});


test("earned Gifter milestone overlays cover original tracker symbols at matching visible size and alignment", () => {
  const progression = read("public/gifter-progression.js");
  const styles = read("public/gifter-progression.css");
  const overlayRule = styles.match(/\.gp-live-progression-track>\.gp-progression-range-badge\{([^}]+)\}/)?.[1] || "";
  assert.match(overlayRule, /width:10%;min-width:0;max-width:none/);
  assert.match(overlayRule, /transform:translate\(-50%,-50%\) scale\(1\.35\)/);
  assert.match(overlayRule, /z-index:1/);
  assert.match(progression, /PROGRESSION_TRACK_STAGES = Object\.freeze\(\[1, 10, 20, 30, 40, 50\]\)/);
  assert.match(progression, /PROGRESSION_TRACK_OVERLAY_ALIGNMENT = Object\.freeze\(\[/);
  assert.match(progression, /PROGRESSION_TRACK_OVERLAY_ALIGNMENT\[index\]\.x/);
  assert.match(progression, /PROGRESSION_TRACK_OVERLAY_ALIGNMENT\[index\]\.y/);
  assert.match(progression, /track\.level >= stageLevel/);
});

test("Daily LIVE ranking serves the complete Top 100 with source-matched podium and medal bands", () => {
  assert.match(server, /\.slice\(0,100\)/);
  assert.match(app, /items\.filter\(item=>Number\(item\.position\|\|0\)>3\)/);
  assert.match(app, /live-daily-podium-stage/);
  assert.match(app, /daily-ranking-badges\/place-/);
  assert.match(rankingStyles, /live-ranking-medal--top-ten/);
  assert.match(rankingStyles, /live-ranking-medal--top-twenty/);
});

test("Creator League displays the first 20 ranks with original first/second/third frames", () => {
  assert.match(leagues, /\[2, 1, 3\]/);
  assert.match(leagues, /leaderboard\.filter\(item =>/);
  assert.match(leagues, /position <= 20/);
  assert.match(leagues, /daily-ranking-badges\/place-/);
  assert.match(leagueStyles, /league-podium-rank-frame/);
  assert.match(leagueStyles, /league-ranking-medal--top-twenty/);
});



test("Gifter range sheets render only their supplied PNG artwork without editing the source files", () => {
  const styles = read("public/gifter-progression.css");
  const progression = read("public/gifter-progression.js");
  const html = read("public/index.html");
  const sw = read("public/sw.js");
  const rendererStart = progression.indexOf("function renderRangeReferenceSheets()");
  const rendererEnd = progression.indexOf("function renderLevelDirectory(", rendererStart);
  const renderer = progression.slice(rendererStart, rendererEnd);

  assert.ok(renderer.includes("class='gp-range-reference-sheet'"), "the original range sheet is rendered");
  assert.ok(!renderer.includes("gp-range-reference-badge"), "no extra badge layer is rendered over the range sheet");
  assert.ok(!renderer.includes("sheet.badge"), "range-sheet entries do not map separate badge overlays");
  assert.ok(!styles.includes(".gp-range-reference-artwork > .gp-range-reference-badge{"), "no badge overlay positioning remains");
  assert.ok(styles.includes(".gp-range-reference-artwork > .gp-range-reference-sheet{"));
  assert.ok(styles.includes("aspect-ratio:1.72 / 1;"));
  assert.ok(styles.includes("object-fit:cover;"));
  assert.ok(styles.includes("object-position:50% 54.5%;"));
  assert.ok(styles.includes(".gp-range-reference-figure{"));
  assert.ok(styles.includes("padding:0;"));
  assert.ok(styles.includes("background:transparent;"));
  assert.ok(styles.includes("box-shadow:none;"));
  assert.ok(progression.includes("PROGRESSION_TRACK_STAGES.map"), "six milestone badge crops remain on the progression tracker");
  assert.ok(progression.includes("gifter-crop-badges/range-"), "the independent progression tracker still loads milestone crops");
  assert.ok(html.includes("/gifter-progression.css?v=20261116-gifter-range-sheet-single-layer-1"));
  assert.ok(html.includes("/gifter-progression.js?v=20261116-gifter-range-sheet-single-layer-1"));
  assert.ok(sw.includes("/gifter-progression.css?v=20261116-gifter-range-sheet-single-layer-1"));
  assert.ok(sw.includes("/gifter-progression.js?v=20261116-gifter-range-sheet-single-layer-1"));
});

test("Daily ranking badge routes resolve from the canonical root-level PNG folder", () => {
  const sourceDirectory = path.join(root, "assets", "Crop References", "Daily Ranking Badge");
  const sourceNames = [
    "Screenshot_20261112_021224_TikTok(1).png",
    "Screenshot_20261112_021224_TikTok(2).png",
    "Screenshot_20261112_021309_TikTok(1).png",
    "Screenshot_20261112_021309_TikTok(2).png",
    "Screenshot_20261112_021333_TikTok(1).png",
    "Screenshot_20261112_021343_TikTok(1).png"
  ];
  for (const name of sourceNames) {
    assert.ok(fs.existsSync(path.join(sourceDirectory, name)), "missing ranking crop: " + name);
  }
  assert.ok(server.includes("path.join(__dirname,'..','assets','Crop References','Daily Ranking Badge',dailyRankingBadgeAssets)"));
  assert.ok(!server.includes("path.join(__dirname,'..','assets','Crop References','Daily Ranking Badge','png',dailyRankingBadgeAssets)"));
});
