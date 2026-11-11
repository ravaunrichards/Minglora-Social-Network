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
  assert.ok(renderer.includes("alt=\"' + label + '\""));
  assert.ok(renderer.includes("width=\"' + size + '\" height=\"' + size"));
  assert.ok(server.includes('Level_Badges_01-50_Individual'));
  assert.ok(server.includes("'Content-Type':'image/png'"));
});

test('profile headers and previews show verification only', () => {
  assert.ok(app.includes("profile-username-line\">@'+esc(u.username)+' '+verifiedProfileBadge(u)+'</p>"));
  assert.ok(app.includes("verifiedProfileBadge(u)+'</small></div>"));
  assert.ok(app.includes('verifiedProfileBadge(member)+"</small></div>"'));
  assert.ok(app.includes("verifiedProfileBadge(member)+'</small></button>'"));
  assert.ok(!app.includes('verifiedProfileBadge(u)+gifterProfileBadge(u,"profile")+liveProProfileBadge(u)'));
  assert.ok(!app.includes('verifiedProfileBadge(member)+gifterProfileBadge(member,"profile")+liveProProfileBadge(member)'));
  assert.ok(!app.includes('verifiedProfileBadge(member)+gifterProfileBadge(member,"compact")'));
  assert.ok(app.includes('profile-admin-identity'));
});

test('the badge gallery still displays earned Gifter artwork separately', () => {
  assert.ok(app.includes('gifterBadgeImageMarkup({ ...badge, level }, "gallery")'));
  assert.ok(app.includes('profile-badges-panel'));
  assert.ok(app.includes('Badges &amp; achievements'));
});

test('feed, comments and LIVE gifter surfaces retain their existing badge behavior', () => {
  assert.ok(app.includes('gifterProfileBadge(author)'));
  assert.ok(app.includes('gifterProfileBadge(c.author)'));
  assert.ok(app.includes('live-viewer-gifter-badge'));
  assert.ok(app.includes('liveGifterBadgeMarkup({ ...member, gifterBadge: badge },"compact")'));
  assert.ok(app.includes('liveGifterBadgeMarkup({ ...member, gifterBadge: item.gifterBadge },"compact")'));
});

test('profile badge artwork keeps responsive sizing and original proportions', () => {
  assert.ok(css.includes('object-fit:contain;object-position:center'));
  assert.ok(css.includes('.gp-profile-level-badge--profile{width:40px;height:40px}'));
  assert.ok(css.includes('.gp-profile-level-badge--compact{width:24px;height:24px}'));
  assert.ok(css.includes('.gp-profile-level-badge--gallery{display:block;width:120px;height:132px'));
  assert.ok(css.includes('.gp-profile-level-badge--profile{width:34px;height:34px}'));
  assert.ok(css.includes('.profile-award-art--gifter .gp-profile-level-badge--gallery{width:96px;height:112px}'));
});

test('app asset and service-worker cache are versioned together', () => {
  const appAsset = '/app.js?v=20261111-live-gifter-name-badge-1';
  assert.ok(html.includes(appAsset));
  assert.ok(worker.includes(appAsset));
  assert.ok(worker.includes('minglora-shell-v278-self-updating-1'));
});
