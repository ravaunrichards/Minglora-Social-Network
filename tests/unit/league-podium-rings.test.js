import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [league, css, rings, index] = await Promise.all([
  readFile(new URL("../../public/leagues.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/leagues.css", import.meta.url), "utf8"),
  readFile(new URL("../../public/creator-rings.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/index.html", import.meta.url), "utf8")
]);

test("League renders a real-data top-three podium and remaining clickable standings", () => {
  assert.match(league, /leaderboard\[0\]/);
  assert.match(league, /leaderboard\[1\]/);
  assert.match(league, /leaderboard\[2\]/);
  assert.match(league, /data-league-profile=/);
  assert.match(league, /minglora:open-profile/);
  assert.match(league, /leaderboard\.slice\(3\)/);
});

test("creator rings distinguish Stories, LIVE and League", () => {
  assert.match(rings, /story-card \.story-avatar/);
  assert.match(rings, /data-live-ranking-watch/);
  assert.match(league, /ml-creator-ring--league/);
  assert.match(css, /ml-creator-ring--story/);
  assert.match(css, /ml-creator-ring--live/);
  assert.match(css, /ml-creator-ring--league/);
});

test("League podium and rings respect small screens and reduced motion", () => {
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(index, /creator-rings\.js/);
});

test("League reference parity includes four original Minglora tier crests and the full class ladder", () => {
  assert.match(league, /function classLadderMarkup\(classes, active\)/);
  assert.match(league, /tier: "A".*Highest tier/s);
  assert.match(league, /tier: "B".*Upper tier/s);
  assert.match(league, /tier: "C".*Middle tier/s);
  assert.match(league, /tier: "D".*Entry tier/s);
  for (const className of ["D5","D4","D3","D2","D1","C5","C4","C3","C2","C1","B5","B4","B3","B2","B1","A3","A2","A1"]) {
    assert.ok(league.includes('"'+className+'"'), "missing Creator League class "+className);
  }
  assert.match(css, /\.league-tier-emblem/);
  assert.match(css, /\.league-tier-card--A/);
  assert.match(css, /\.league-tier-card--B/);
  assert.match(css, /\.league-tier-card--C/);
  assert.match(css, /\.league-tier-card--D/);
});

test("League displays the current reference placement-fragment bands without mixing Match results", () => {
  assert.match(league, /function fragmentRulesMarkup\(\)/);
  for (const rule of [
    "Top 1%", "Top 10%", "Top 20%", "Top 60%", "Top 70%", "Top 80%",
    "Bottom 40%", "Bottom 30%", "Bottom 20%", "Other placements"
  ]) {
    assert.ok(league.includes(rule), "missing current placement rule " + rule);
  }
  assert.match(league, /4 FRAGMENTS = 1 TIER/);
  assert.match(league, /D2–D5 have no fragment-loss penalty/);
  assert.match(league, /Your class is determined by daily placement and fragments, not a lifetime gift threshold/);
  assert.match(league, /weekly and lifetime gift totals remain reporting statistics/);
  assert.match(league, /League Match/);
});

test("League top-20 standings show distinct top-ten and top-twenty awards with responsive styles", () => {
  assert.match(league, /position >= 4 && position <= 10/);
  assert.match(league, /position >= 11 && position <= 20/);
  assert.match(league, /league-ranking-medal/);
  assert.match(league, /league-leader-band/);
  assert.match(css, /league-ranking-medal--top-ten/);
  assert.match(css, /league-ranking-medal--top-twenty/);
  assert.match(css, /league-leader-band--top-ten/);
  assert.match(css, /league-leader-band--top-twenty/);
  assert.match(css, /@media\(max-width:760px\).*league-tier-grid/s);
  assert.match(css, /@media\(max-width:600px\).*league-fragment-reference/s);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
