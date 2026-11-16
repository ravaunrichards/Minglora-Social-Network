import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [league, css, index, sw, artwork, assetReadme] = await Promise.all([
  readFile(new URL("../../public/leagues.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/leagues.css", import.meta.url), "utf8"),
  readFile(new URL("../../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/assets/league/league-emblems.svg", import.meta.url), "utf8"),
  readFile(new URL("../../public/assets/league/README.md", import.meta.url), "utf8")
]);

test("League Arena uses the original Minglora division, fragment and medal assets", () => {
  for (const symbol of [
    "division-a", "division-b", "division-c", "division-d",
    "fragment-a", "fragment-b", "fragment-c", "fragment-d",
    "rank-1", "rank-2", "rank-3", "award-top-ten", "award-top-twenty"
  ]) {
    assert.ok(artwork.includes('<symbol id="' + symbol + '"'), "missing SVG symbol " + symbol);
  }
  assert.match(league, /function leagueAssetIcon\(symbol, className, label\)/);
  assert.match(league, /league-hero-emblem-icon/);
  assert.match(league, /league-tier-emblem-icon/);
  assert.match(league, /league-class-step-icon/);
  assert.match(league, /league-fragment-tier-icon/);
  assert.match(league, /league-fragment-step-icon/);
  assert.match(league, /league-podium-crown-icon/);
  assert.match(league, /league-ranking-medal-icon/);
  assert.match(css, /\.league-asset-icon/);
  assert.match(css, /\.league-hero-emblem-icon/);
  assert.match(css, /\.league-tier-emblem-icon/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(assetReadme, /original Minglora-owned vector asset sprite/i);
});

test("Match Power-Ups keep their existing IDs while using Minglora 2D artwork", () => {
  for (const [id, icon] of [
    ["momentum_boost", "powerup-momentum"],
    ["score_multiplier", "powerup-multiplier"],
    ["shield", "powerup-shield"],
    ["time_boost", "powerup-time"]
  ]) {
    assert.ok(league.includes('"' + id + '":leagueAssetIcon("' + icon + '"'), id + " keeps its original functional identifier");
    assert.ok(artwork.includes('<symbol id="' + icon + '"'), "missing " + icon + " art");
  }
  assert.match(league, /data-powerup-select=/);
  assert.match(league, /activateSelectedPowerup/);
});

test("League asset files and stylesheet/script versions are included in the refreshed app shell", () => {
  const version = "20261116-original-league-svg-assets-1";
  assert.ok(index.includes("/leagues.css?v=" + version));
  assert.ok(index.includes("/leagues.js?v=" + version));
  assert.ok(sw.includes("/leagues.css?v=" + version));
  assert.ok(sw.includes("/leagues.js?v=" + version));
  assert.ok(sw.includes("/assets/league/league-emblems.svg?v=" + version));
  assert.ok(sw.includes("minglora-shell-v329-self-updating-1"));
});
