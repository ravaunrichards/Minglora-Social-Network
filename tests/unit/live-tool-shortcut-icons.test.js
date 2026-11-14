import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const iconRoot = path.join(root, 'public/assets/icons/live-tools');
const manifest = JSON.parse(fs.readFileSync(path.join(iconRoot, 'manifest.json'), 'utf8'));
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public/live-tiktok-compact.css'), 'utf8');
const expected = ['layout','permissions','guests','viewers','fanclub','matches','top-gifters','gifts','rewards','moderators','appearance','devices'];

test('the LIVE tools shortcut manifest maps each existing panel to one original SVG icon', () => {
  assert.deepEqual(manifest.shortcuts.map(item => item.id), expected);
  assert.equal(manifest.view_box, '0 0 24 24');
  for (const item of manifest.shortcuts) {
    assert.equal(item.file, '/assets/icons/live-tools/' + item.id + '.svg');
    const file = path.join(root, 'public', item.file.slice(1));
    assert.ok(fs.existsSync(file), item.id + ' shortcut SVG must exist');
    const svg = fs.readFileSync(file, 'utf8');
    assert.ok(svg.startsWith('<svg'), item.id + ' must be an SVG document');
    assert.ok(svg.includes('<symbol id="icon" viewBox="0 0 24 24"'), item.id + ' must expose the canonical symbol');
    assert.ok(svg.includes('stroke="currentColor"'), item.id + ' must inherit the current text color');
    assert.ok(/<(?:path|rect|circle|ellipse|line|polyline|polygon)\b/.test(svg), item.id + ' must contain vector geometry');
    assert.equal([...svg].some(character => character.codePointAt(0) >= 0x1F000 && character.codePointAt(0) <= 0x1FAFF), false, item.id + ' must not use emoji artwork');
  }
});

test('the app renders the existing role-gated LIVE panels through the new shortcut icon allow-list', () => {
  assert.ok(app.includes('const LIVE_TOOLS_SHORTCUT_ICON_NAMES=Object.freeze('));
  assert.ok(app.includes('function liveToolsShortcutIcon(name)'));
  assert.ok(app.includes('function liveToolsShortcutButton(target,label,icon,pressed=false,panelTarget)'));
  for (const id of expected) assert.ok(app.includes('liveToolsShortcutButton("' + id + '"'), id + ' must map to an actual tools panel');
  assert.ok(app.includes('data-live-tools-panel-target='));
  assert.ok(app.includes('data-live-tools-target='));
  assert.ok(app.includes('liveSettings.manageModerators!==false'));
  assert.ok(app.includes('giftsEnabled?liveToolsShortcutButton("rewards"'));
  assert.ok(app.includes('button.setAttribute("aria-pressed",String(active))'));
});

test('LIVE shortcut SVGs preserve the compact drawer layout, selected state and keyboard focus', () => {
  assert.ok(styles.includes('.live-tools-shortcuts button.live-tools-shortcut'));
  assert.ok(styles.includes('.live-tools-shortcut-icon svg'));
  assert.ok(styles.includes('[aria-pressed="true"]'));
  assert.ok(styles.includes(':focus-visible'));
  assert.ok(styles.includes(':disabled'));
  assert.ok(styles.includes('overflow-x:auto'));
});

test('LIVE shortcut artwork and manifest are cached by the v306 service-worker shell', () => {
  assert.ok(worker.includes("const CACHE_NAME='minglora-shell-v306-self-updating-1'"));
  assert.ok(worker.includes("'/assets/icons/live-tools/manifest.json'"));
  for (const id of expected) assert.ok(worker.includes("'/assets/icons/live-tools/" + id + ".svg'"), id + ' must be pre-cached');
});
