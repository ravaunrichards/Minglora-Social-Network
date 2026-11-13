import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sprite = fs.readFileSync(path.join(root, 'public/assets/icons/live-control-icons.svg'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

const expected = ["mic","mic-off","camera","camera-off","flip","multi-guest","cohost","message","screen","fullscreen","gift","volume","volume-off","settings","share","end"];
test('the original Minglora LIVE control sprite contains every active icon and state', () => {
  const actual = [...sprite.matchAll(/<symbol id="([^"]+)" viewBox="0 0 24 24">/g)].map(match => match[1]);
  assert.deepEqual(actual, expected);
  for (const id of expected) {
    const start = sprite.indexOf('<symbol id="' + id + '"');
    const end = sprite.indexOf('</symbol>', start);
    assert.ok(start >= 0 && end > start, 'missing symbol: ' + id);
    assert.match(sprite.slice(start, end), /<(?:path|rect|circle)/, 'missing vector geometry: ' + id);
  }
  assert.match(sprite, /stroke="currentColor"/);
});
test('LIVE controls use the external sprite through a strict local symbol allowlist', () => {
  assert.ok(app.includes('const LIVE_CONTROL_ICON_SYMBOLS = new Set('));
  assert.ok(app.includes('/assets/icons/live-control-icons.svg#"+symbol'));
  assert.match(app, /function updateLiveControlButton\([\s\S]*?liveControlIcon\(icon\)/);
});
test('the service worker precaches the sprite and the HTML refreshes the app renderer', () => {
  assert.ok(worker.includes("SHELL.push('/assets/icons/live-control-icons.svg')"));
  assert.ok(worker.includes("'/app.js?v=20261113-complete-gift-artwork-gate-1'"));
  assert.ok(html.includes('/app.js?v=20261113-complete-gift-artwork-gate-1'));
  assert.ok(worker.includes("const CACHE_NAME='minglora-shell-v306-self-updating-1'"));
});
