import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [league, css, rings, index] = await Promise.all([
  readFile(new URL("../../public/leagues.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/leagues.css", import.meta.url), "utf8"),
  readFile(new URL("../../public/creator-rings.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/index.html", import.meta.url), "utf8")
]);

test("League renders the numbered three-step top-three podium and remaining clickable standings", () => {
  assert.match(league, /leaderboard\[0\]/);
  assert.match(league, /leaderboard\[1\]/);
  assert.match(league, /leaderboard\[2\]/);
  assert.match(league, /league-podium-stage/);
  assert.match(league, /league-podium-place--1/);
  assert.match(league, /league-podium-place--2/);
  assert.match(league, /league-podium-place--3/);
  assert.ok(league.includes("daily-ranking-badges/place-"), "podium must use the supplied numbered placement frames");
  assert.match(league, /data-league-profile=/);
  assert.match(league, /minglora:open-profile/);
  assert.match(league, /leaderboard\.slice\(3\)/);
  assert.match(league, /No\. /);
});

test("creator rings retain distinct Stories, LIVE and League meanings", () => {
  assert.match(rings, /story-card \.story-avatar/);
  assert.match(rings, /data-live-ranking-watch/);
  assert.match(league, /ml-creator-ring--league/);
  assert.match(css, /ml-creator-ring--story/);
  assert.match(css, /ml-creator-ring--live/);
  assert.match(css, /ml-creator-ring--league/);
});

test("League rank rows and original image references remain responsive and accessible", () => {
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(css, /league-podium-place:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(index, /creator-rings\.js/);
  assert.match(league, /loading='lazy' decoding='async'/);
  assert.match(league, /aria-label='Original Creator League class progression reference'/);
});

test("The original League progression reference covers all eighteen classes", () => {
  assert.match(league, /function classLadderMarkup\(classes, active\)/);
  assert.match(league, /Screenshot_20261112_020458_TikTok\(1\)\.jpg/);
  assert.match(league, /tier: "A".*Highest tier/s);
  assert.match(league, /tier: "B".*Upper tier/s);
  assert.match(league, /tier: "C".*Middle tier/s);
  assert.match(league, /tier: "D".*Entry tier/s);
  for (const className of ["D5","D4","D3","D2","D1","C5","C4","C3","C2","C1","B5","B4","B3","B2","B1","A3","A2","A1"]) {
    assert.ok(league.includes('"' + className + '"'), "missing Creator League class " + className);
  }
  assert.match(css, /\.league-tier-card--A/);
  assert.match(css, /\.league-tier-card--B/);
  assert.match(css, /\.league-tier-card--C/);
  assert.match(css, /\.league-tier-card--D/);
});

test("Fragment guide uses the exact uploaded A, B, C, D1 and D2–D5 references", () => {
  for (const filename of [
    "Screenshot_20261112_020335_TikTok(1).jpg",
    "Screenshot_20261112_020335_TikTok(2).jpg",
    "Screenshot_20261112_020335_TikTok(3).jpg",
    "Screenshot_20261112_020335_TikTok(4).jpg",
    "Screenshot_20261112_020350_TikTok(1).jpg"
  ]) assert.ok(league.includes(filename), "missing fragment reference " + filename);
  assert.match(league, /Placement fragment guide/);
  assert.match(league, /REFERENCE ONLY/);
  assert.match(league, /D2–D5 have no fragment-loss penalty/);
  assert.match(league, /live placement remains calculated by Minglora/);
});

test("Top-ten and top-twenty recognition retains correct rank ranges", () => {
  assert.match(league, /position >= 4 && position <= 10/);
  assert.match(league, /position >= 11 && position <= 20/);
  assert.match(league, /league-leader-band/);
  assert.match(css, /league-leader-band--top-ten/);
  assert.match(css, /league-leader-band--top-twenty/);
});
