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
