import test from "node:test";
import assert from "node:assert/strict";
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
const serviceWorker = read("public/sw.js");
const html = read("public/index.html");

test("all 50 Gifter levels keep unique artwork while six crop badges light milestone stages", () => {
  assert.match(server, /individualGifterBadgeMatch[\s\S]*?Level_Badges_01-50_Individual/);
  assert.match(server, /gifter-crop-badges\/range-1\.png/);
  assert.match(server, /gifter-crop-badges\/range-6\.png/);
  assert.match(server, /'Crop References','Gifters Badges','Png'/);
  assert.match(read("public/gifter-progression.js"), /PROGRESSION_TRACK_STAGES\.map\(\(stageLevel, index\) => track\.level >= stageLevel/);
  assert.match(read("public/gifter-progression.js"), /gifter-crop-badges\/range-/);

  assert.match(server, /gifter-badge-range-sheets\/lv-1-9\.jpg/);
  assert.match(server, /'Crop References','Gifter level range sheets'/);
  assert.match(read("public/gifter-progression.js"), /file: "lv-1-9\.jpg"/);
  assert.match(serviceWorker, /gifter-badge-range-sheets\/lv-1-9\.jpg/);
  assert.match(html, /gifter-progression\.js\?v=20261116-gifter-cropped-badges-bright-1/);
  assert.match(progressionStyles, /is-locked \.gp-level-index-art\{filter:grayscale/);
  assert.match(progressionStyles, /is-unlocked \.gp-level-index-art/);
  assert.match(progressionStyles, /is-current \.gp-level-index-art/);
  assert.match(progressionStyles, /is-admin-awarded \.gp-level-index-art/);
  assert.match(progressionStyles, /\.gp-progression-range-badge/);
  assert.match(progressionStyles, /brightness\(1\.48\)/);
  assert.match(progressionStyles, /gp-progression-milestone-glow/);

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
  assert.match(serviceWorker, /minglora-shell-v341-self-updating-1/);
  assert.match(html, /app\.js\?v=20261116-daily-ranking-podium-1/);
  assert.match(html, /top-gifters\.js\?v=20261116-daily-ranking-crop-badges-2/);
  assert.match(html, /gifter-progression\.css\?v=20261116-gifter-cropped-badges-bright-1/);
});
