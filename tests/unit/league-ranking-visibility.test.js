import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [league, css, server, service, index, worker] = await Promise.all([
  readFile(new URL("../../public/leagues.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/leagues.css", import.meta.url), "utf8"),
  readFile(new URL("../../src/server.js", import.meta.url), "utf8"),
  readFile(new URL("../../backend/modules/leagues/service.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../../public/sw.js", import.meta.url), "utf8")
]);

test("Creator League exposes a real, accessible ranking visibility switch", () => {
  assert.match(league, /id='league-ranking-toggle'/);
  assert.match(league, /role='switch'/);
  assert.match(league, /Appear in Creator League rankings/);
  assert.match(league, /Your ranking is hidden from public standings/);
  assert.match(league, /request\("\/leagues\/ranking-preference"/);
  assert.match(server, /method==='POST'&&p==='\/api\/leagues\/ranking-preference'/);
  assert.match(server, /setCreatorLeagueRankingPreference\(db,user,input\.enabled/);
  assert.match(service, /rankingEnabled: true/);
  assert.match(service, /item\.rankingEnabled !== false/);
});

test("Creator League reference awards distinguish podium and positions 4–20", () => {
  assert.match(league, /Creator League No\. " \+ place \+ " reward badge/);
  assert.match(league, /position >= 4 && position <= 10/);
  assert.match(league, /position >= 11 && position <= 20/);
  assert.match(league, /Creator League reward badge for positions 4 to 10/);
  assert.match(league, /Creator League reward badge for positions 11 to 20/);
  assert.match(css, /league-podium-avatar-medal\.is-place-1/);
  assert.match(css, /league-podium-avatar-medal\.is-place-2/);
  assert.match(css, /league-podium-avatar-medal\.is-place-3/);
  assert.match(css, /league-ranking-medal--top-ten/);
  assert.match(css, /league-ranking-medal--top-twenty/);
});

test("Ranking assets are versioned in the page and the PWA shell cache", () => {
  assert.match(index, /leagues\.css\?v=20261115-league-ranking-opt-in-rewards-1/);
  assert.match(index, /leagues\.js\?v=20261115-league-ranking-opt-in-rewards-1/);
  assert.match(worker, /minglora-shell-v325-league-ranking-rewards-1/);
  assert.match(worker, /leagues\.css\?v=20261115-league-ranking-opt-in-rewards-1/);
  assert.match(worker, /leagues\.js\?v=20261115-league-ranking-opt-in-rewards-1/);
});
