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
const rankingCss = read("public/rankings.css");

test("LIVE room Top Gifters ranks broadcast-scoped confirmed LIVE gifts and refreshes in the existing gift poll", () => {
  assert.match(service, /export function getLiveGifterLeaderboard/);
  assert.match(service, /event\.contextType !== "live"/);
  assert.match(service, /broadcastId: details\.contextType === "live"/);
  assert.match(server, /getLiveGifterLeaderboard\(db,\{/);
  assert.match(server, /period:'all_time',broadcastId:session\.id/);
  assert.match(server, /topGifters/);
  assert.match(app, /data-live-tools-panel-target='top-gifters'/);
  assert.match(app, /data-live-tools-panel='top-gifters'/);
  assert.match(app, /renderLiveTopGifters\(result\.topGifters,session,result\.weeklyTitleGifters\)/);
  assert.match(server, /weeklyTitleGifters/);
  assert.match(app, /Weekly Gift Gallery · Top Gifters/);
  assert.match(app, /data-live-weekly-title-profile/);
  assert.match(app, /TOP GIFTER/);
  assert.match(app, /Weekly Title Gifter for this gift/);
  assert.match(app, /openLiveProfilePreview\(userId,session\|\|activeLiveSession\)/);
});

test("platform Top Gifters offers period filters, earned rank titles and working profile actions", () => {
  for (const period of ["daily", "weekly", "monthly", "all_time"]) {
    assert.ok(addon.includes('"' + period + '"'), "missing period " + period);
  }
  assert.match(addon, /\/api\/live\/rankings\/top-gifters/);
  assert.match(addon, /TOP 10 GIFTER/);
  assert.match(addon, /position >= 4 && position <= 20/);
  assert.match(addon, /place-4-10/);
  assert.match(addon, /place-11-20/);
  assert.match(rankingCss, /\.minglora-gifter-row \.minglora-gifter-ranked-frame-art/);
  assert.match(addon, /data-top-gifter-profile/);
  assert.match(addon, /window\.openProfile\(userId\)/);
});

test("Top Gifters assets are versioned and included in the PWA shell", () => {
  assert.match(html, /top-gifters\.js\?v=20261118-tiktok-ranking-frames-1/);
  const appAsset=html.match(/app\.js\?v=[^"']+/)?.[0]||"";
  const styleAsset=html.match(/styles\.css\?v=[^"']+/)?.[0]||"";
  assert.ok(appAsset&&sw.includes("/"+appAsset),"service worker caches the current HTML app script");
  assert.ok(styleAsset&&sw.includes("/"+styleAsset),"service worker caches the current HTML stylesheet");
  assert.match(sw, /minglora-shell-v\d+-[^']+/);
  assert.match(sw, /top-gifters\.js\?v=20261118-tiktok-ranking-frames-1/);
  assert.match(css, /\.live-top-gifters-list/);
  assert.match(css, /\.minglora-gifter-profile/);
  assert.match(css, /\.live-weekly-title-gifters/);
});


test("profile Gift Gallery ranks each gift's weekly supporters and lets visitors open each gifter profile", () => {
  const galleryStart = app.indexOf("async function loadProfileGiftGallery");
  const galleryEnd = app.indexOf("function bindProfileTabActions", galleryStart);
  assert.ok(galleryStart >= 0 && galleryEnd > galleryStart, "profile Gift Gallery loader exists");
  const gallery = app.slice(galleryStart, galleryEnd);
  assert.match(gallery, /entry\.topGifters/);
  assert.match(gallery, /TOP GIFTER/);
  assert.match(gallery, /Weekly gifter ranking/);
  assert.ok(gallery.includes('.slice(0,10)'));
  assert.match(gallery, /RUNNER-UP/);
  assert.match(gallery, /data-gift-gallery-gifter-profile/);
  assert.match(gallery, /openProfile\(id\)/);
  assert.match(server, /isTitleGifter:index===0/);
  assert.match(server, /leadingGifterCount:titleGiftCount/);
  assert.match(server, /blockedBetween\(user\.id,member\.id\)/);
});


test("profile Gift Gallery presents the weekly Title Gifter and up to ten ranked supporters without mobile overflow", () => {
  const galleryStart = app.indexOf("async function loadProfileGiftGallery");
  const galleryEnd = app.indexOf("function bindProfileTabActions", galleryStart);
  const gallery = app.slice(galleryStart, galleryEnd);
  assert.ok(gallery.includes("Weekly Title Gifter for this gift"));
  assert.ok(gallery.includes('aria-label="Rank 1"'));
  assert.ok(gallery.includes(".slice(0,10)"));
  assert.ok(gallery.includes("data-gift-gallery-gifter-profile"));
  assert.ok(css.includes("gift-gallery-ranked-row.is-podium-2"));
  assert.ok(css.includes("grid-template-columns:minmax(0,1fr)"));
  const appAsset=html.split('src="').map(part=>part.split('"')[0]).find(asset=>asset.startsWith('/app.js?v='))||'';
  assert.ok(appAsset&&sw.includes("'"+appAsset+"'"),'service worker caches the active application bundle');
  assert.ok(sw.includes("const CACHE_NAME='minglora-shell-v"));
});


test("Platform Top Gifters uses canonical member photos and a shared default avatar", () => {
  assert.ok(addon.includes("function safeAvatarUrl(user)"));
  assert.ok(addon.includes("user?.avatar || user?.avatarUrl || user?.avatar_url || user?.profilePicture"));
  assert.ok(addon.includes("DEFAULT_GIFTER_AVATAR"));
});

test("Daily and embedded Top Gifters podium avatars stay compact and preserve badge framing", () => {
  assert.ok(css.includes(".minglora-gifter-podium .minglora-gifter-rank-frame{position:absolute;inset:0;z-index:0"));
  assert.ok(css.includes(".minglora-gifter-podium .minglora-gifter-rank-avatar"));
  assert.ok(css.includes("width:21px;height:21px;box-sizing:border-box"));
  assert.ok(css.includes(".live-daily-podium-card .live-daily-podium-frame"));
  assert.ok(css.includes("object-fit:contain;object-position:center"));
  assert.ok(css.includes("width:36%;height:36%;max-width:none;box-sizing:border-box"));
  assert.ok(html.includes("leagues.js?v=20261117-avatar-rankings-sync-1"));
  assert.ok(html.includes("rankings.js?v=20261118-tiktok-ranking-frames-1"));
  assert.ok(sw.includes("minglora-shell-v360-self-updating-1"));
});
