import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const repository = new URL("../../", import.meta.url);
const leagueFiles = [
  "Screenshot_20261112_020247_TikTok(1).jpg",
  "Screenshot_20261112_020335_TikTok(1).jpg",
  "Screenshot_20261112_020335_TikTok(2).jpg",
  "Screenshot_20261112_020335_TikTok(3).jpg",
  "Screenshot_20261112_020335_TikTok(4).jpg",
  "Screenshot_20261112_020350_TikTok(1).jpg",
  "Screenshot_20261112_020436_TikTok(1).jpg",
  "Screenshot_20261112_020458_TikTok(1).jpg",
  "Screenshot_20261112_020827_TikTok(1).jpg",
  "Screenshot_20261112_020827_TikTok(2).jpg",
  "Screenshot_20261112_020839_TikTok(1).jpg",
  "Screenshot_20261112_020853_TikTok(1).jpg",
  "Screenshot_20261112_021224_TikTok(1).jpg",
  "Screenshot_20261112_021224_TikTok(2).jpg",
  "Screenshot_20261112_021309_TikTok(1).jpg",
  "Screenshot_20261112_021309_TikTok(2).jpg",
  "Screenshot_20261112_021333_TikTok(1).jpg",
  "Screenshot_20261112_021343_TikTok(1).jpg",
  "Screenshot_20261112_021355_TikTok(1).jpg",
  "Screenshot_20261112_021407_TikTok(1).jpg"
];
const displayedReferences = [
  "Screenshot_20261112_020335_TikTok(1).jpg",
  "Screenshot_20261112_020335_TikTok(2).jpg",
  "Screenshot_20261112_020335_TikTok(3).jpg",
  "Screenshot_20261112_020335_TikTok(4).jpg",
  "Screenshot_20261112_020350_TikTok(1).jpg",
  "Screenshot_20261112_020436_TikTok(1).jpg",
  "Screenshot_20261112_020458_TikTok(1).jpg"
];

const [league, css, index, sw, server, artwork, assetReadme] = await Promise.all([
  readFile(new URL("public/leagues.js", repository), "utf8"),
  readFile(new URL("public/leagues.css", repository), "utf8"),
  readFile(new URL("public/index.html", repository), "utf8"),
  readFile(new URL("public/sw.js", repository), "utf8"),
  readFile(new URL("src/server.js", repository), "utf8"),
  readFile(new URL("public/assets/league/league-emblems.svg", repository), "utf8"),
  readFile(new URL("public/assets/league/README.md", repository), "utf8")
]);

test("League Arena displays the user's original uploaded division, class and fragment references", () => {
  for (const filename of displayedReferences) {
    assert.ok(league.includes(filename), "League Arena must use " + filename);
  }
  assert.match(league, /function leagueReferenceImage\(filename, className, label\)/);
  assert.match(league, /league-original-reference-gallery/);
  assert.match(league, /league-original-fragment-references/);
  assert.match(league, /league-progression-reference-image/);
  assert.match(league, /Original 18-class progression/);
  assert.match(league, /league-class-ladder league-tier-grid/);
  assert.doesNotMatch(league, /Screenshot_20261112_020247_TikTok\(1\)\.jpg|league-original-reference--class-order|league-class-order-reference-image|Original class-order reference/);
  assert.doesNotMatch(league, /leagueAssetIcon\("division-/);
  assert.doesNotMatch(league, /leagueAssetIcon\("fragment-/);
  assert.doesNotMatch(league, /leagueAssetIcon\("rank-/);
  assert.doesNotMatch(league, /leagueAssetIcon\(award/);
  assert.match(css, /\.league-original-reference-gallery/);
  assert.match(css, /\.league-original-fragment-references/);
  assert.match(css, /\.league-top-three-row/);
});

test("All 20 uploaded source images are allowlisted, served, precached and preserved", async () => {
  assert.match(server, /const leagueReferenceAssetNames = new Set\(/);
  assert.match(server, /path\.join\(__dirname,'\.\.'\,'assets','League',filename\)/);
  assert.match(server, /Content-Type':'image\/jpeg'/);
  for (const filename of leagueFiles) {
    assert.ok(server.includes("'" + filename + "'"), "server allowlist missing " + filename);
    assert.ok(sw.includes("'/assets/League/" + filename + "'"), "service worker precache missing " + filename);
    const bytes = await readFile(new URL("assets/League/" + filename, repository));
    assert.ok(bytes.length > 1000, "source image missing or unexpectedly small: " + filename);
  }
  assert.match(sw, /minglora-shell-v\d+-self-updating-1/);
});

test("Leaderboard top-three rows follow the supplied No.1/No.2/No.3 layout with live profile data", () => {
  assert.match(league, /league-top-three-list/);
  assert.match(league, /league-rank-pill--place-/);
  assert.match(league, /leaderboard\[0\]/);
  assert.match(league, /leaderboard\[1\]/);
  assert.match(league, /leaderboard\[2\]/);
  assert.match(league, /leaderboard\.slice\(3\)/);
  assert.match(league, /minglora:open-profile/);
});

test("the six Minglora Match Power-Ups use their original branded vector artwork", () => {
  for (const [id, icon] of [
    ["boosting_glove", "powerup-glove"],
    ["magic_mist", "powerup-mist"],
    ["stun_hammer", "powerup-hammer"],
    ["time_maker", "powerup-time-maker"],
    ["boosters", "powerup-boosters"],
    ["speed_challenge", "powerup-speed"]
  ]) {
    assert.ok(league.includes('"' + id + '": "' + icon + '"'), id + " is mapped to its branded icon");
    assert.ok(artwork.includes('<symbol id="' + icon + '"'), "missing " + icon + " artwork");
  }
  assert.match(league, /data-powerup-select=/);
  assert.match(league, /activateSelectedPowerup/);
  assert.match(index, /leagues\.css\?v=20261116-match-powerups-six-reference-1/);
  assert.match(index, /leagues\.js\?v=20261116-match-powerups-six-reference-1/);
});
