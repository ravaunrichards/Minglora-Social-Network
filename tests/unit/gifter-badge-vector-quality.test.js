import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderBadgeSymbol, renderGifterBadgeSprite } from "../../scripts/generate-gifter-badge-vectors.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("the shared vector sprite contains all 50 distinct Gifter badge levels", () => {
  const sprite = read("public/assets/gifter-badges/badges.svg");
  assert.equal(sprite, renderGifterBadgeSprite(), "committed sprite matches its deterministic generator");
  const symbols = [...sprite.matchAll(/<symbol id="level-(\d{2})"/g)].map(match => match[1]);
  assert.equal(symbols.length, 50);
  assert.deepEqual(symbols, Array.from({ length: 50 }, (_, index) => String(index + 1).padStart(2, "0")));
  for (let level = 1; level <= 50; level += 1) {
    const key = String(level).padStart(2, "0");
    const symbol = renderBadgeSymbol(level);
    assert.ok(sprite.includes(symbol), "level " + level + " symbol is present");
    assert.ok(symbol.includes("<title>Level " + level + " Gifter Badge</title>"));
    assert.ok(symbol.includes(">" + level + "</text>"), "level " + level + " has its exact vector number");
    assert.ok(symbol.includes("viewBox=\"0 0 170 76\""));
    assert.doesNotMatch(symbol, /<script|foreignObject|javascript:/i);
  }
});

test("all Gifter identity surfaces use the SVG sprite and keep their established dimensions", () => {
  const app = read("public/app.js");
  const topGifters = read("public/top-gifters.js");
  const progression = read("public/gifter-progression.js");
  const progressionCss = read("public/gifter-progression.css");
  const profileCss = read("public/profile-badges.css");
  const html = read("public/index.html");
  const sw = read("public/sw.js");

  assert.ok(app.includes("badges.svg#level-"));
  assert.ok(app.includes("profile: [48, 21], inline: [44, 20], compact: [40, 18], gallery: [170, 76]"));
  assert.ok(app.includes("width=\"' + size[0] + '\" height=\"' + size[1]"));
  assert.ok(topGifters.includes("badges.svg#level-"));
  assert.ok(topGifters.includes("width='24' height='24'"));
  assert.equal((progression.match(/badges\.svg#level-/g) || []).length, 6);
  assert.ok(progression.includes("width='170' height='76'"));
  assert.ok(progression.includes("width='40' height='18'"));

  assert.ok(progressionCss.includes(".gp-leader-badge svg"));
  assert.ok(progressionCss.includes("width:min(100%,170px);height:auto;aspect-ratio:170 / 76"));
  assert.ok(progressionCss.includes(".gp-level-index-art{width:64px;height:64px}"));
  assert.ok(profileCss.includes(".gp-profile-level-badge--profile{width:40px;height:40px}"));
  assert.ok(profileCss.includes(".gp-profile-level-badge--compact{width:24px;height:24px}"));

  assert.ok(html.includes("/app.js?v=20261115-gifter-badge-vector-sprite-1"));
  assert.ok(html.includes("/top-gifters.js?v=20261115-gifter-badge-vector-sprite-1"));
  assert.ok(html.includes("/gifter-progression.js?v=20261115-gifter-reference-placement-1"));
  assert.ok(sw.includes("SHELL.push('/assets/gifter-badges/badges.svg')"));
  assert.ok(sw.includes("minglora-shell-v320-self-updating-1"));
  assert.ok(sw.includes("/app.js?v=20261115-gifter-badge-vector-sprite-1"));
  assert.ok(sw.includes("/top-gifters.js?v=20261115-gifter-badge-vector-sprite-1"));
  assert.ok(sw.includes("/gifter-progression.js?v=20261115-gifter-reference-placement-1"));
});

test("the original individual PNGs remain available for legacy clients and compatibility", () => {
  const server = read("src/server.js");
  const originalAssetTest = read("tests/unit/gifter-badge-level-panels.test.js");
  assert.ok(server.includes("Level_Badges_01-50_Individual"));
  assert.ok(server.includes("'Content-Type':'image/png'"));
  assert.ok(originalAssetTest.includes('level_${String(index + 1).padStart(2, "0")}.png'));
});
