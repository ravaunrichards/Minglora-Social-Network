import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const [app, topGifters, progression, identityCss, progressionCss] = await Promise.all([
  read("public/app.js"),
  read("public/top-gifters.js"),
  read("public/gifter-progression.js"),
  read("public/gifter-badge-3d.css"),
  read("public/gifter-progression.css")
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
  assert.ok(progression.includes("level_"));
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
