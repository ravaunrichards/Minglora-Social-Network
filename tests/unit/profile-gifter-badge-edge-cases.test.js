import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const rendererStart = app.indexOf('const normalizeGifterBadgeLevel =');
const rendererEnd = app.indexOf("window.addEventListener('minglora:gifter-badge-updated'", rendererStart);
assert.ok(rendererStart >= 0 && rendererEnd > rendererStart, 'Gifter identity renderers are present');

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const renderers = vm.runInNewContext(
  app.slice(rendererStart, rendererEnd) + '\n({ normalizeGifterBadgeLevel, gifterBadgeImageMarkup, gifterProfileBadge, liveGifterBadgeMarkup, memberGifterBadgeMarkup })',
  { esc: escapeHtml, creatorLeagueProfileBadge: member => member?.testLeague ? '<span>LEAGUE</span>' : '' }
);

test('missing and malformed legacy badge levels never create a false Level 1 identity', () => {
  for (const value of [undefined, null, '', 0, '0', -1, '-8', NaN, Infinity, 'not-a-level', '1x']) {
    assert.equal(renderers.normalizeGifterBadgeLevel(value), null, String(value));
    assert.equal(renderers.gifterBadgeImageMarkup({ level: value }), '', 'image renderer omits ' + String(value));
    assert.equal(renderers.gifterProfileBadge({ gifterBadge: { level: value } }), '', 'profile identity omits ' + String(value));
    assert.equal(renderers.liveGifterBadgeMarkup({ gifterBadge: { level: value } }), '', 'LIVE identity omits ' + String(value));
    assert.equal(renderers.memberGifterBadgeMarkup({ gifterBadge: { level: value } }), '', 'member identity omits ' + String(value));
  }
});

test('valid and legacy numeric levels stay bounded to the original Level 01–50 images', () => {
  assert.equal(renderers.normalizeGifterBadgeLevel('1'), 1);
  assert.equal(renderers.normalizeGifterBadgeLevel(1.9), 1);
  assert.equal(renderers.normalizeGifterBadgeLevel(25), 25);
  assert.equal(renderers.normalizeGifterBadgeLevel(50), 50);
  assert.equal(renderers.normalizeGifterBadgeLevel(500), 50);
  assert.equal(renderers.normalizeGifterBadgeLevel(51), 50);
  assert.match(renderers.gifterProfileBadge({ gifterBadge: { level: '1' } }), /level_01\.png/);
  assert.match(renderers.gifterProfileBadge({ gifterBadge: { level: 50 } }), /level_50\.png/);
  assert.match(renderers.gifterProfileBadge({ gifterBadge: { level: 500 } }), /level_50\.png/);
  assert.match(renderers.liveGifterBadgeMarkup({ gifterBadge: { level: 25, badgeName: 'Gold Gifter · LV 25' } }), /level_25\.png/);
  assert.match(renderers.memberGifterBadgeMarkup({ gifterBadge: { level: 50 } }), /level_50\.png/);
});

test('NEW GIFTER and Creator League recognition survive an invalid Gifter level without inventing artwork', () => {
  const output = renderers.gifterProfileBadge({
    testLeague: true,
    newGifterIdentity: { active: true, expiresAt: '2026-11-18T12:00:00.000Z' },
    gifterBadge: { level: 'invalid', adminAwarded: true, liveEntranceUnlocked: true }
  });
  assert.match(output, /NEW GIFTER/);
  assert.match(output, /LEAGUE/);
  assert.doesNotMatch(output, /level_\d{2}\.png|ADMIN AWARDED|LIVE ENTRY/);
});

test('valid earned recognition preserves Admin Awarded and LIVE Entry markers and safe accessible labels', () => {
  const output = renderers.gifterProfileBadge({
    gifterBadge: {
      level: 25,
      badgeName: '<img src=x onerror=alert(1)>',
      adminAwarded: true,
      liveEntranceUnlocked: true
    }
  });
  assert.match(output, /level_25\.png/);
  assert.match(output, /ADMIN AWARDED/);
  assert.match(output, /LIVE ENTRY/);
  assert.match(output, /title="&lt;img src=x onerror=alert\(1\)&gt;"/);
  assert.doesNotMatch(output, /<img src=x onerror/);
});
