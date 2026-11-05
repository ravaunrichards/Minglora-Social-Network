import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../../public/gifter-badge-art.js", import.meta.url), "utf8");
const context = vm.createContext({ window: {} });
vm.runInContext(source, context, { filename: "gifter-badge-art.js" });
const art = context.window.MingloraGifterBadgeArt;

test("all 50 levels render distinct 3D badge markup", () => {
  const badges = Array.from({ length: 50 }, (_, index) => art.render({ level: index + 1 }));
  assert.equal(new Set(badges).size, 50);
  badges.forEach((html, index) => {
    const level = index + 1;
    assert.ok(html.includes("gp-level-" + level));
    assert.ok(html.includes('data-gp-level="' + level + '"'));
    assert.ok(html.includes("gp-crest-rim-outer"));
    assert.ok(html.includes("gp-crest-gem"));
  });
});

test("badge design advances from premium Level 1 to legendary Level 50", () => {
  const first = art.designProfile(1);
  const last = art.designProfile(50);
  assert.equal(first.crownPoints, 3);
  assert.equal(last.crownPoints, 7);
  assert.ok(last.wingFeathers > first.wingFeathers);
  assert.ok(last.orbitRings > first.orbitRings);
  assert.ok(last.accentGems > first.accentGems);
  assert.ok(last.facetLines > first.facetLines);
  assert.ok(last.gemScale > first.gemScale);
  assert.ok(last.relief > first.relief);
  assert.ok(last.glow > first.glow);
  for (let level = 2; level <= 50; level++) {
    assert.ok(art.designProfile(level).progress > art.designProfile(level - 1).progress);
  }
});

test("renderer clamps levels and supports full, compact and inline display", () => {
  assert.equal(art.designProfile(0).level, 1);
  assert.equal(art.designProfile(99).level, 50);
  const full = art.render({ level: 25, badgeName: "Platinum Gifter" });
  const compact = art.render({ level: 25, compact: true });
  const inline = art.render({ level: 25, inline: true });
  assert.ok(full.includes('aria-label="Platinum Gifter"'));
  assert.ok(full.includes("gp-badge-level"));
  assert.ok(compact.includes("gp-badge--small"));
  assert.ok(!compact.includes("gp-badge-level"));
  assert.ok(inline.includes("gp-inline-badge"));
  assert.ok(inline.includes("<strong>25</strong>"));
});

test("badge labels are escaped before insertion into accessible markup", () => {
  const html = art.render({ level: 1, badgeName: '<img src=x onerror=alert(1)>' });
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(!html.includes("<img"));
});
