import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const app = read("public/app.js");
const css = read("public/profile-badges.css");
const html = read("public/index.html");
const worker = read("public/sw.js");
const server = read("src/server.js");

test("profile gifter artwork maps the earned level to its own original PNG", () => {
  const start = app.indexOf("const gifterBadgeImageMarkup");
  const end = app.indexOf("window.addEventListener('minglora:gifter-badge-updated'", start);
  assert.ok(start >= 0 && end > start, "shared gifter badge renderer exists");
  const renderer = app.slice(start, end);
  assert.match(renderer, /String\(level\)\.padStart\(2, "0"\)/);
  assert.match(renderer, /\/assets\/gifter-badges\/level_"/);
  assert.match(renderer, /alt="' \+ label/);
  assert.match(renderer, /width="' \+ size \+ '" height="' \+ size/);
  assert.doesNotMatch(renderer, /MingloraGifterBadgeArt/);
  assert.match(server, /individualGifterBadgeMatch[\s\S]*?Level_Badges_01-50_Individual[\s\S]*?'Content-Type':'image\/png'/);
});

test("main profile header, public preview, and LIVE profile preview show the badge beside the username", () => {
  assert.ok(app.includes('profile-username-line">@\'+esc(u.username)+\' \'+verifiedProfileBadge(u)+gifterProfileBadge(u,"profile")+liveProProfileBadge(u)+\'</p>'));
  assert.ok(app.includes("verifiedProfileBadge(u)+gifterProfileBadge(u,\"profile\")+liveProProfileBadge(u)+\'</small>'));
  assert.ok(app.includes('verifiedProfileBadge(member)+gifterProfileBadge(member,"profile")+liveProProfileBadge(member)+"</small></div>"'));
  assert.ok(app.includes('verifiedProfileBadge(member)+gifterProfileBadge(member,"compact")'));
});

test("posts, comments, LIVE viewer identities, and profile recognition use the same Level PNG renderer", () => {
  assert.match(app, /gifterProfileBadge\(author\)/);
  assert.match(app, /gifterProfileBadge\(c\.author\)/);
  assert.match(app, /live-viewer-gifter-badge[^\n]*gifterProfileBadge\(\{ \.\.\.member, gifterBadge: badge \},\"compact\"\)/);
  assert.match(app, /gifterBadgeImageMarkup\(\{ \.\.\.badge, level \}, "gallery"\)/);
  assert.match(app, /gifterProfileBadge\(\{ \.\.\.member, gifterBadge: item\.gifterBadge \},\"compact\"\)/);
});

test("profile badge artwork has consistent size, proportional containment and mobile sizing", () => {
  assert.match(css, /\.gp-profile-level-badge\{[^}]*object-fit:contain[^}]*object-position:center/);
  assert.match(css, /\.gp-profile-level-badge--profile\{width:40px;height:40px\}/);
  assert.match(css, /\.gp-profile-level-badge--compact\{width:24px;height:24px\}/);
  assert.match(css, /\.gp-profile-level-badge--gallery\{[^}]*width:120px;height:132px/);
  assert.match(css, /@media\(max-width:650px\)[\s\S]*?\.gp-profile-level-badge--profile\{width:34px;height:34px\}/);
  assert.match(css, /@media\(max-width:560px\)[\s\S]*?\.profile-award-art--gifter \.gp-profile-level-badge--gallery\{width:96px;height:112px\}/);
});

test("the updated app bundle, profile badge stylesheet and service-worker cache are versioned together", () => {
  const appAsset = "/app.js?v=20261111-profile-gifter-level-badges-1";
  const badgeStylesheet = "/profile-badges.css?v=20261111-profile-gifter-level-badges-1";
  assert.ok(html.includes(appAsset));
  assert.ok(html.includes(badgeStylesheet));
  assert.ok(worker.includes(appAsset));
  assert.ok(worker.includes(badgeStylesheet));
  assert.ok(worker.includes("minglora-shell-v274-self-updating-1"));
});
