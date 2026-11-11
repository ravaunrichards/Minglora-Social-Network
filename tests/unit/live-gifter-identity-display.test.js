import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const [app, badgeCss, html, serviceWorker] = await Promise.all([
  read("public/app.js"),
  read("public/gifter-badge-3d.css"),
  read("public/index.html"),
  read("public/sw.js")
]);

test("LIVE uses the original level-specific badge artwork and visibly prints its exact badge name", () => {
  const start = app.indexOf("const liveGifterBadgeMarkup");
  const end = app.indexOf("window.addEventListener('minglora:gifter-badge-updated'", start);
  assert.ok(start >= 0 && end > start, "shared LIVE gifter badge renderer exists");
  const renderer = app.slice(start, end);
  assert.match(renderer, /badge\.badgeName/);
  assert.match(renderer, /gifterBadgeImageMarkup/);
  assert.match(renderer, /live-gifter-badge-name/);
  assert.match(renderer, /level, placement/);
});

test("LIVE comments show username, then display name, then the individual gifter badge and name", () => {
  const start = app.indexOf("async function refreshLiveChat");
  const end = app.indexOf("async function endHostedLiveSession", start);
  const chat = app.slice(start, end);
  assert.match(chat, /live-chat-handle/);
  assert.match(chat, /live-chat-display-name/);
  assert.match(chat, /liveGifterBadgeMarkup\(member\)/);
  assert.ok(chat.indexOf("live-chat-handle") < chat.indexOf("live-chat-display-name"));
  assert.ok(chat.indexOf("live-chat-display-name") < chat.indexOf("liveGifterBadgeMarkup(member)"));
  assert.ok(!chat.includes("verifiedProfileBadge"), "verification stays off LIVE comments");
});

test("LIVE viewer, guest-speaker, room-directory and gifter-leaderboard identities keep username and display name separate", () => {
  assert.match(app, /live-viewer-handle/);
  assert.match(app, /liveGifterBadgeMarkup\(\{ \.\.\.member, gifterBadge: badge \}, "compact"\)/);
  assert.match(app, /live-speaker-username/);
  assert.match(app, /live-speaker-display-name/);
  assert.match(app, /live-room-host-username/);
  assert.match(app, /live-room-host-name/);
  assert.match(app, /live-weekly-title-row/);
  assert.match(app, /live-top-gifter-person/);
  assert.match(app, /liveGifterBadgeMarkup\(item\.user,"compact"\)/);
});

test("LIVE badge names remain legible with restrained glow, responsive sizing and reduced-motion support", () => {
  assert.match(badgeCss, /\.live-gifter-badge-label/);
  assert.match(badgeCss, /\.live-gifter-badge-name/);
  assert.match(badgeCss, /live-gifter-badge-glow/);
  assert.match(badgeCss, /prefers-reduced-motion:reduce/);
  assert.match(badgeCss, /max-width:100%/);
});

test("the LIVE identity assets are versioned together and refreshed in the service-worker shell", () => {
  assert.match(html, /app\.js\?v=20261111-live-gifter-name-badge-1/);
  assert.match(html, /gifter-badge-3d\.css\?v=20261111-live-gifter-name-badge-1/);
  assert.match(serviceWorker, /minglora-shell-v278-self-updating-1/);
  assert.match(serviceWorker, /app\.js\?v=20261111-live-gifter-name-badge-1/);
  assert.match(serviceWorker, /gifter-badge-3d\.css\?v=20261111-live-gifter-name-badge-1/);
});
