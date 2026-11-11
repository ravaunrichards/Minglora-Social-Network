import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const css = read('public/profile-badges.css');
const html = read('public/index.html');
const worker = read('public/sw.js');
const server = read('src/server.js');

test('each earned Gifter Level maps to its original numbered PNG', () => {
  const start = app.indexOf('const gifterBadgeImageMarkup');
  const end = app.indexOf('const gifterProfileBadge', start);
  assert.ok(start >= 0 && end > start, 'shared gifter image renderer exists');
  const renderer = app.slice(start, end);
  assert.ok(renderer.includes('String(level).padStart(2, "0")'));
  assert.ok(renderer.includes('/assets/gifter-badges/level_'));
  assert.ok(renderer.includes('alt="\' + label + \'"'));
  assert.ok(renderer.includes('width="\' + size + \'" height="\' + size'));
  assert.ok(server.includes('Level_Badges_01-50_Individual'));
  assert.ok(server.includes("'Content-Type':'image/png'"));
});

test('main profile, public preview and LIVE profile preview show badges beside usernames', () => {
  assert.ok(app.includes("profile-username-line\">@'+esc(u.username)+' '+verifiedProfileBadge(u)+gifterProfileBadge(u,\"profile\")+liveProProfileBadge(u)+'</p>"));
  assert.ok(app.includes("verifiedProfileBadge(u)+gifterProfileBadge(u,\"profile\")+liveProProfileBadge(u)+'</small>"));
  assert.ok(app.includes("verifiedProfileBadge(member)+gifterProfileBadge(member,\"profile\")+liveProProfileBadge(member)+\"</small></div>\""));
  assert.ok(app.includes("verifiedProfileBadge(member)+gifterProfileBadge(member,\"compact\")"));
});

test('feed, comments and LIVE gifter surfaces use the same original Level badge renderer', () => {
  assert.ok(app.includes('gifterProfileBadge(author)'));
  assert.ok(app.includes('gifterProfileBadge(c.author)'));
  assert.ok(app.includes('live-viewer-gifter-badge'));
  assert.ok(app.includes('gifterProfileBadge({ ...member, gifterBadge: badge },"compact")'));
  assert.ok(app.includes('gifterProfileBadge({ ...member, gifterBadge: item.gifterBadge },"compact")'));
  assert.ok(app.includes('gifterBadgeImageMarkup({ ...badge, level }, "gallery")'));
});

test('profile badge images have consistent responsive sizing and preserve artwork proportions', () => {
  assert.ok(css.includes('object-fit:contain;object-position:center'));
  assert.ok(css.includes('.gp-profile-level-badge--profile{width:40px;height:40px}'));
  assert.ok(css.includes('.gp-profile-level-badge--compact{width:24px;height:24px}'));
  assert.ok(css.includes('.gp-profile-level-badge--gallery{display:block;width:120px;height:132px'));
  assert.ok(css.includes('.gp-profile-level-badge--profile{width:34px;height:34px}'));
  assert.ok(css.includes('.profile-award-art--gifter .gp-profile-level-badge--gallery{width:96px;height:112px}'));
});

test('app bundle, profile badge stylesheet and service-worker cache are versioned together', () => {
  const appAsset = '/app.js?v=20261111-profile-gifter-level-badges-1';
  const badgeStylesheet = '/profile-badges.css?v=20261111-profile-gifter-level-badges-1';
  assert.ok(html.includes(appAsset));
  assert.ok(html.includes(badgeStylesheet));
  assert.ok(worker.includes(appAsset));
  assert.ok(worker.includes(badgeStylesheet));
  assert.ok(worker.includes('minglora-shell-v274-self-updating-1'));
});
