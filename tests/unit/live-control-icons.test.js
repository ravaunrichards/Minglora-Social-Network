import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const iconRoot = path.join(root, 'public/assets/icons/live-controls');
const manifest = JSON.parse(fs.readFileSync(path.join(iconRoot, 'manifest.json'), 'utf8'));
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public/live-tiktok-compact.css'), 'utf8');
const expected = ["mic","mic-off","camera","camera-off","flip","multi-guest","cohost","message","screen","fullscreen","gift","volume","volume-off","settings","share","end"];

test('LIVE controls use individually addressable original SVG icon assets', () => {
  assert.deepEqual(manifest.icons.map(icon => icon.id), expected);
  assert.ok(app.includes('const LIVE_CONTROL_ICON_NAMES=Object.freeze('));
  assert.ok(app.includes('LIVE_CONTROL_ICON_NAMES.includes(name)'));
  assert.ok(app.includes("'/assets/icons/live-controls/\"+name+\".svg#icon'"));
  for (const icon of manifest.icons) {
    const relativePath = icon.file.startsWith('/') ? icon.file.slice(1) : icon.file;
    const assetPath = path.join(root, 'public', relativePath);
    assert.ok(fs.existsSync(assetPath), icon.id + ' icon file must exist');
    const svg = fs.readFileSync(assetPath, 'utf8');
    assert.ok(svg.startsWith('<svg'), icon.id + ' must be an SVG document');
    assert.ok(svg.includes('<symbol id="icon" viewBox="0 0 24 24"'), icon.id + ' must expose the shared symbol');
    assert.ok(svg.includes('stroke="currentColor"'), icon.id + ' must inherit the LIVE button color');
    assert.ok(svg.includes('<path') || svg.includes('<rect') || svg.includes('<circle'), icon.id + ' must contain vector geometry');
    assert.equal(/\p{Extended_Pictographic}/u.test(svg), false, icon.id + ' must not use emoji artwork');
  }
});

test('all LIVE control SVG assets are included in the versioned offline shell cache', () => {
  assert.match(worker, /const CACHE_NAME='minglora-shell-v\\d+-self-updating-1';/);
  for (const icon of manifest.icons) {
    assert.ok(worker.includes("'/assets/icons/live-controls/" + icon.id + ".svg'"), icon.id + ' must be pre-cached');
  }
  assert.ok(worker.includes("'/assets/icons/live-controls/manifest.json'"));
});

test('standalone SVG assets preserve the existing button-driven icon state and sizing contract', () => {
  assert.ok(manifest.state_handling.includes('aria-pressed'));
  assert.ok(manifest.state_handling.includes('disabled'));
  assert.ok(manifest.state_handling.includes('danger'));
  assert.ok(styles.includes('.live-player-controls .live-control-icon svg'));
  assert.ok(app.includes('aria-pressed='));
});
