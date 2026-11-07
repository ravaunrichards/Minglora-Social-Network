import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const service = read("backend/modules/gifter-progression/service.js");
const server = read("src/server.js");
const app = read("public/app.js");
const addon = read("public/top-gifters.js");
const html = read("public/index.html");
const sw = read("public/sw.js");
const css = read("public/styles.css");

test("LIVE room Top Gifters ranks broadcast-scoped confirmed LIVE gifts and refreshes in the existing gift poll", () => {
  assert.match(service, /export function getLiveGifterLeaderboard/);
  assert.match(service, /event\.contextType !== "live"/);
  assert.match(service, /broadcastId: details\.contextType === "live"/);
  assert.match(server, /getLiveGifterLeaderboard\(db,\{/);
  assert.match(server, /period:'all_time',broadcastId:session\.id/);
  assert.match(server, /topGifters/);
  assert.match(app, /data-live-tools-panel-target='top-gifters'/);
  assert.match(app, /data-live-tools-panel='top-gifters'/);
  assert.match(app, /renderLiveTopGifters\(result\.topGifters,session\)/);
  assert.match(app, /openLiveProfilePreview\(userId,session\|\|activeLiveSession\)/);
});

test("platform Top Gifters offers period filters, earned rank titles and working profile actions", () => {
  for (const period of ["daily", "weekly", "monthly", "all_time"]) {
    assert.ok(addon.includes('"' + period + '"'), "missing period " + period);
  }
  assert.match(addon, /\/api\/live\/rankings\/top-gifters/);
  assert.match(addon, /TOP 10 GIFTER/);
  assert.match(addon, /data-top-gifter-profile/);
  assert.match(addon, /window\.openProfile\(userId\)/);
});

test("Top Gifters assets are versioned and included in the PWA shell", () => {
  assert.match(html, /top-gifters\.js\?v=20261107-live-top-gifters-1/);
  assert.match(html, /app\.js\?v=20261107-top-gifters-2/);
  assert.match(html, /styles\.css\?v=20261107-top-gifters-1/);
  assert.match(sw, /minglora-shell-v132-live-top-gifters-2/);
  assert.match(sw, /top-gifters\.js\?v=20261107-live-top-gifters-1/);
  assert.match(css, /\.live-top-gifters-list/);
  assert.match(css, /\.minglora-gifter-profile/);
});
