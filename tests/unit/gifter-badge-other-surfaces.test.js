import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const [app, topGifters, progression, identityCss, progressionCss, gifts] = await Promise.all([
  read("public/app.js"),
  read("public/top-gifters.js"),
  read("public/gifter-progression.js"),
  read("public/gifter-badge-3d.css"),
  read("public/gifter-progression.css"),
  read("public/gifts.js")
]);

test("feed post author shows username, display name, then the original individual gifter badge and name", () => {
  const start = app.indexOf("function postCard");
  const end = app.indexOf("function findVisiblePost", start);
  const post = app.slice(start, end);
  assert.ok(post.includes("post-author-username"));
  assert.ok(post.includes("memberGifterBadgeMarkup(author)"));
  assert.ok(!post.includes("verifiedProfileBadge(author)"), "verification remains profile-only");
});

test("post comments show username, display name, then the original individual gifter badge and name", () => {
  const start = app.indexOf("function postCard");
  const end = app.indexOf("function findVisiblePost", start);
  const post = app.slice(start, end);
  assert.ok(post.includes("comment-author-username"));
  assert.ok(post.includes("memberGifterBadgeMarkup(c.author)"));
  assert.ok(post.includes("comment-text"));
  assert.ok(!post.includes("verifiedProfileBadge(c.author)"), "verification remains profile-only");
});

test("Gift Gallery Title Gifters and ranked supporters use the same original badge renderer", () => {
  const start = app.indexOf("async function loadProfileGiftGallery");
  const end = app.indexOf("function bindProfileTabActions", start);
  const gallery = app.slice(start, end);
  assert.ok(gallery.includes("memberGifterBadgeMarkup(leader)"));
  assert.ok(gallery.includes("memberGifterBadgeMarkup({ ...person, gifterBadge: gifter.gifterBadge })"));
});

test("platform Top Gifters uses the original level image and visibly prints its existing badge name", () => {
  assert.ok(topGifters.includes("item.gifterBadge || user.gifterBadge"));
  assert.ok(topGifters.includes("/assets/gifter-badges/level_"));
  assert.ok(topGifters.includes("badgeMarkup"));
  assert.ok(topGifters.includes("minglora-gifter-badge-name"));
});

test("Gifter order reference directory shows the exact assigned badge name beside its original image", () => {
  assert.ok(progression.includes("const badgeName = String(item.badgeName"));
  assert.ok(progression.includes("esc(badgeName)"));
  assert.ok(progression.includes("gp-level-index-art"));
  assert.ok(progression.includes("/assets/gifter-badges/level_"));
});

test("Gifter progression leaderboard shows username, display name, original badge image and exact badge name", () => {
  assert.ok(progression.includes("gp-leader-username"));
  assert.ok(progression.includes("gp-leader-display-name"));
  assert.ok(progression.includes("gp-leader-badge"));
  assert.ok(progression.includes("String(level).padStart(2, \"0\")"));
  assert.ok(progressionCss.includes(".gp-leader-badge img"));
});

test("shared non-LIVE gifter badge styling is responsive and reduced-motion safe", () => {
  assert.ok(identityCss.includes(".minglora-gifter-identity"));
  assert.ok(identityCss.includes(".minglora-gifter-badge-name"));
  assert.ok(identityCss.includes("@media(prefers-reduced-motion:reduce)"));
});


test("original Gifter strip uses only its own artwork and one white live level marker", () => {
  assert.ok(progression.includes("PROGRESSION_TRACK_STAGES = Object.freeze([1, 10, 20, 30, 40, 50])"));
  assert.ok(progression.includes("Boolean(current.hasUnlockedBadge && level > 0)"));
  assert.ok(progression.includes("function progressionTrackState(current = {})"));
  assert.ok(progression.includes("Number(current.progressPercent || 0) / 100"));
  assert.ok(progression.includes("gp-progression-level-marker"));
  assert.ok(progression.includes("track.hasGifterBadge"));
  assert.ok(!progression.includes("gp-progression-marker-cover"), "no black Level 1 cover dot is added");
  assert.ok(!progression.includes("gp-progression-glow-overlay"), "no mismatched SVG overlay is added");
  assert.ok(!progression.includes("gp-progression-link"), "no misaligned connector lines are drawn");
  assert.ok(!progression.includes("gp-progression-stage-glow"), "no misaligned circles are drawn");
  assert.ok(!progressionCss.includes("gp-progression-marker-cover"));
  assert.ok(!progressionCss.includes("gp-progression-glow-overlay"));
  assert.ok(!progressionCss.includes("gp-progression-link"));
  assert.ok(!progressionCss.includes("gp-progression-stage-glow"));

  const markerMarkup = progression.match(/class='gp-progression-level-marker'/g) || [];
  assert.equal(markerMarkup.length, 1, "exactly one live progression marker is rendered");

  const markerRule = progressionCss.match(/\\.gp-progression-level-marker\\s*\\{([^}]+)\\}/)?.[1] || "";
  assert.match(markerRule, /width:1\\.75%;min-width:5px;max-width:19px;aspect-ratio:1;/,
    "the moving marker matches the original dot's 1.75% / 5–19px footprint");
  assert.match(markerRule, /box-sizing:border-box/);
  assert.match(markerRule, /border:1px solid rgba\\(36,24,56,\\.55\\)/,
    "the replacement marker has a crisp defined edge");
  assert.match(markerRule, /box-shadow:0 0 0 1px rgba\\(255,255,255,\\.38\\),0 1px 3px rgba\\(35,21,50,\\.36\\)/,
    "the marker uses a restrained crisp shadow, not a diffuse glow");
  assert.doesNotMatch(markerRule, /0 0 7px|0 0 12px/,
    "the moving dot must not be blurred by a large glow");
});

test("each original numbered badge visibly distinguishes locked, earned, admin-awarded and current states", () => {
  assert.ok(progression.includes("item.current ? \"is-current\""));
  assert.ok(progression.includes("item.unlocked ? \"is-unlocked\""));
  assert.ok(progressionCss.includes(".gp-level-index-item.is-locked .gp-level-index-art"));
  assert.ok(progressionCss.includes(".gp-level-index-item.is-unlocked .gp-level-index-art"));
  assert.ok(progressionCss.includes(".gp-level-index-item.is-current .gp-level-index-art"));
  assert.ok(progressionCss.includes(".gp-level-index-item.is-admin-awarded .gp-level-index-art"));
});

test("a confirmed Gift Center send requests an immediate progression refresh", () => {
  assert.ok(gifts.includes('new CustomEvent("minglora:gifter-progression-refresh")'));
  assert.ok(progression.includes('window.addEventListener("minglora:gifter-progression-refresh"'));
});
