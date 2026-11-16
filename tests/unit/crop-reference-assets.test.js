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
const meetwave = read("public/meetwave.js");
const topGifters = read("public/top-gifters.js");
const rankingStyles = read("public/styles.css");
const progressionStyles = read("public/gifter-progression.css");
const serviceWorker = read("public/sw.js");
const html = read("public/index.html");


test("Crop References use canonical folders and contain no duplicate image files", () => {
  const milestoneNames = [
    "LV.1 - LV.9.png", "LV.10 - LV.19.png", "LV.20 - LV.29.png",
    "LV.30 - LV.39.png", "LV.40 - LV.49.png", "LV.50+.png"
  ];
  const rangeNames = [
    "LV.1 - LV.9.jpg", "LV.10 - LV.19.jpg", "LV.20 - LV.29.jpg",
    "LV.30 - LV.39.jpg", "LV.40 - LV.49.jpg", "LV.50+.jpg"
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
    ...milestoneNames.map(name => path.join("assets", "Crop References", "Gifters Badges", "Png", name)),
    ...rangeNames.map(name => path.join("assets", "Crop References", "Gifter level range sheets", name)),
    ...rankingNames.map(name => path.join("assets", "Crop References", "Daily Ranking Badge", "png", name)),
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
    assert.ok(fs.existsSync(path.join(root, "assets", "Crop References", "Gifters Badges", "Png", name)), name + " is in the canonical milestone folder");
    assert.ok(!fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", "Gifters Badges", "Png", name)), name + " has no legacy PNG duplicate");
    assert.ok(!fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", "Gifters Badges", "psd", name.replace(".png", ".psd"))), name + " has no legacy PSD duplicate");
  }
  for (const name of rangeNames) {
    const stem = name.replace(".jpg", "");
    assert.ok(fs.existsSync(path.join(root, "assets", "Crop References", "Gifter level range sheets", name)), name + " is in the canonical range folder");
    assert.ok(!fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", name)), name + " has no legacy JPG duplicate");
    assert.ok(!fs.existsSync(path.join(root, "assets", "Gifters Badge Levels", "Gifter level range sheets", stem + ".png")), name + " has no legacy padded PNG duplicate");
    assert.ok(!fs.existsSync(path.join(root, "assets", "Crop References", "Gifter level range sheets", stem + ".png")), name + " has no padded PNG duplicate");
  }
  const psdDirectory = path.join(root, "assets", "Crop References", "Gifters Badges", "psd");
  assert.equal(fs.readdirSync(psdDirectory).filter(file => file.endsWith(".psd")).length, 5, "five genuine layered PSD references remain");
  assert.ok(!fs.existsSync(path.join(psdDirectory, "LV.1 - LV.9")), "extensionless PNG duplicate removed");
});

test("all 50 Gifter levels keep unique artwork while six crop badges light milestone stages", () => {
  assert.match(server, /individualGifterBadgeMatch[\s\S]*?Level_Badges_01-50_Individual/);
  assert.match(server, /gifter-crop-badges\/range-1\.png/);
  assert.match(server, /gifter-crop-badges\/range-6\.png/);
  assert.match(server, /'Crop References','Gifters Badges','Png'/);
  assert.match(read("public/gifter-progression.js"), /PROGRESSION_TRACK_STAGES\.map\(\(stageLevel, index\) => track\.level >= stageLevel/);
  assert.match(read("public/gifter-progression.js"), /gifter-crop-badges\/range-/);

  assert.ok(server.includes("/assets/gifter-badge-range-sheets/lv-1-9.jpg"));
  assert.ok(serviceWorker.includes("/assets/gifter-badge-range-sheets/lv-1-9.jpg"));
  assert.ok(server.includes("'Crop References','Gifter level range sheets'"));
  assert.match(html, /gifter-progression\.js\?v=20261116-gifter-overlay-alignment-1/);
  assert.match(progressionStyles, /is-locked \.gp-level-index-art\{filter:grayscale/);
  assert.match(progressionStyles, /is-unlocked \.gp-level-index-art/);
  assert.match(progressionStyles, /is-current \.gp-level-index-art/);
  assert.match(progressionStyles, /is-admin-awarded \.gp-level-index-art/);
  assert.match(progressionStyles, /\.gp-progression-range-badge/);
  assert.ok(progressionStyles.includes("brightness(1.48)"));
  assert.ok(progressionStyles.includes("gp-progression-milestone-glow"));

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
  assert.ok(app.includes('liveLayoutIcon(option.icon)'), "LIVE layout buttons use the crop-backed preview helper");
  for (const layout of layouts) assert.ok(app.includes(":"+ "'" + layout + "'"), "LIVE crop helper maps " + layout);
  assert.ok(app.includes('seat.dataset.seatIndex=String(spec.seatIndex??0)'), "LIVE grid seats expose stable crop-layout positions");
  for (const layout of layouts) {
    assert.ok(meetwave.includes('src="/assets/live-guest-layouts/' + layout + '.png"'), "MeetWave preview must use the original crop for " + layout);
  }
  assert.equal((meetwave.match(/data-mw-guest-layout="/g) || []).length, 9, "MeetWave exposes each cropped guest layout once");
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
  assert.match(serviceWorker, /minglora-shell-v345-self-updating-1/);
  assert.match(html, /app\.js\?v=20261116-cropped-guest-layouts-2/);
  assert.match(html, /top-gifters\.js\?v=20261116-daily-ranking-crop-badges-2/);
  assert.match(html, /gifter-progression\.css\?v=20261116-gifter-overlay-alignment-1/);
  assert.match(html, /gifter-progression\.js\?v=20261116-gifter-overlay-alignment-1/);
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
