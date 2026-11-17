import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");

const normalizerStart = app.indexOf("const normalizeGifterBadgeLevel =");
const rendererEnd = app.indexOf("window.addEventListener('minglora:gifter-badge-updated'", normalizerStart);
assert.ok(normalizerStart >= 0 && rendererEnd > normalizerStart, "shared Gifter level normalization and identity renderers exist");
const rendererSource = app.slice(normalizerStart, rendererEnd);

const galleryStart = app.indexOf("function profileBadgesMarkup(data,isMe){");
const galleryEnd = app.indexOf("\nconst PROFILE_STYLE_OPTIONS", galleryStart);
assert.ok(galleryStart >= 0 && galleryEnd > galleryStart, "profile badge gallery renderer exists");
const gallerySource = app.slice(galleryStart, galleryEnd);

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[character]));

const sandbox = {
  esc: escapeHtml,
  creatorLeagueProfileBadge: member => member?.creatorLeague?.leagueClass
    ? "<span>CREATOR LEAGUE</span>"
    : "",
  verifiedProfileBadge: () => "",
  platformAdminProfileBadge: () => "",
  liveProProfileBadge: () => "",
  profileBadgeCardMarkup: item => "<article>" + item.category + "|" + item.title + "|" + item.artwork + "</article>"
};
const renderers = vm.runInNewContext(
  rendererSource + "\n" + gallerySource +
  "\n({ normalizeGifterBadgeLevel, gifterBadgeImageMarkup, gifterProfileBadge, liveGifterBadgeMarkup, memberGifterBadgeMarkup, profileBadgesMarkup })",
  sandbox
);

test("missing, malformed, non-finite and non-numeric Gifter levels never become a false Level 1 badge", () => {
  const invalidLevels = [
    undefined, null, "", "   ", 0, "0", -1, "-8", NaN, Infinity, -Infinity,
    "not-a-level", "1x", true, false, {}, [], Symbol("invalid-level")
  ];
  for (const value of invalidLevels) {
    assert.equal(renderers.normalizeGifterBadgeLevel(value), null, "invalid level: " + String(value));
    assert.equal(renderers.gifterBadgeImageMarkup({ level: value }), "", "image omitted for: " + String(value));
    const member = { gifterBadge: { level: value, badgeName: "Legacy badge", adminAwarded: true, liveEntranceUnlocked: true } };
    assert.equal(renderers.liveGifterBadgeMarkup(member), "", "LIVE identity omitted for: " + String(value));
    assert.equal(renderers.memberGifterBadgeMarkup(member), "", "member identity omitted for: " + String(value));
  }
});

test("valid numeric and legacy numeric-string levels remain bounded to the original Level 01–50 PNGs", () => {
  assert.equal(renderers.normalizeGifterBadgeLevel("1"), 1);
  assert.equal(renderers.normalizeGifterBadgeLevel(" 25 "), 25);
  assert.equal(renderers.normalizeGifterBadgeLevel(1.9), 1);
  assert.equal(renderers.normalizeGifterBadgeLevel(25), 25);
  assert.equal(renderers.normalizeGifterBadgeLevel(50), 50);
  assert.equal(renderers.normalizeGifterBadgeLevel(51), 50);
  assert.equal(renderers.normalizeGifterBadgeLevel(500), 50);

  assert.match(renderers.gifterBadgeImageMarkup({ level: "1" }), /level_01\.png/);
  assert.match(renderers.gifterProfileBadge({ gifterBadge: { level: 25 } }), /level_25\.png/);
  assert.match(renderers.gifterProfileBadge({ gifterBadge: { level: 500 } }), /level_50\.png/);
  assert.match(renderers.liveGifterBadgeMarkup({ gifterBadge: { level: 25, badgeName: "Level 25 Gifter" } }), /level_25\.png/);
  assert.match(renderers.memberGifterBadgeMarkup({ gifterBadge: { level: 50 } }), /level_50\.png/);
});

test("invalid Gifter levels do not erase independent NEW GIFTER or Creator League recognition", () => {
  const member = {
    newGifterIdentity: { active: true, expiresAt: "2026-11-18T12:00:00.000Z" },
    creatorLeague: { leagueClass: "B2" },
    gifterBadge: { level: "invalid", adminAwarded: true, liveEntranceUnlocked: true }
  };
  const output = renderers.gifterProfileBadge(member);
  assert.match(output, /NEW GIFTER/);
  assert.match(output, /CREATOR LEAGUE/);
  assert.doesNotMatch(output, /level_\d{2}\.png|ADMIN AWARDED|LIVE ENTRY/);
});

test("the badge gallery omits invalid Gifter artwork but retains separate recognition and renders valid levels", () => {
  const invalid = renderers.profileBadgesMarkup({
    user: {
      newGifterIdentity: { active: true },
      creatorLeague: { initialized: true, leagueClass: "B2" },
      gifterBadge: { level: "bad-value", adminAwarded: true, liveEntranceUnlocked: true }
    }
  }, false);
  assert.match(invalid, /New Gifter/);
  assert.match(invalid, /Creator League · B2/);
  assert.doesNotMatch(invalid, /Gifter progression|LIVE Entrance Unlocked|level_\d{2}\.png/);

  const valid = renderers.profileBadgesMarkup({
    user: {
      gifterBadge: { level: "25", badgeName: "Silver Gifter", adminAwarded: true, liveEntranceUnlocked: true }
    }
  }, false);
  assert.match(valid, /Gifter progression/);
  assert.match(valid, /Level 25 of 50/);
  assert.match(valid, /level_25\.png/);
  assert.match(valid, /LIVE Entrance Unlocked/);
});

test("valid Gifter badge names remain HTML-escaped across profile and LIVE identity surfaces", () => {
  const hostileName = '<img src=x onerror="alert(1)">';
  const member = { gifterBadge: { level: 25, badgeName: hostileName, adminAwarded: true, liveEntranceUnlocked: true } };
  const profile = renderers.gifterProfileBadge(member);
  const live = renderers.liveGifterBadgeMarkup(member);
  assert.match(profile, /title="&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;"/);
  assert.match(live, /aria-label="&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;"/);
  assert.doesNotMatch(profile + live, /<img src=x onerror=/);
});

test("all five Gifter identity and gallery paths use the shared strict normalizer", () => {
  assert.match(rendererSource, /const normalizeGifterBadgeLevel = value =>/);
  assert.match(rendererSource, /typeof value !== "number" && typeof value !== "string"/);
  assert.match(rendererSource, /Number\.isFinite\(numeric\)/);
  assert.match(rendererSource, /const level = normalizeGifterBadgeLevel\(badge\?\.level\)/);
  assert.match(gallerySource, /const level=normalizeGifterBadgeLevel\(badge\?\.level\)/);
  assert.doesNotMatch(rendererSource + gallerySource, /Math\.floor\(Number\(badge\??\.level\)\s*\|\|\s*1\)/);
});
