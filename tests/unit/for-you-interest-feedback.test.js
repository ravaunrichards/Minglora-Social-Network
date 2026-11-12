import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public/for-you-tiktok.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

test('For You video recommendation menu exposes positive and negative feedback actions', () => {
  assert.match(app, /data-fyp-feedback-menu=/);
  assert.match(app, /data-fyp-interested=/);
  assert.match(app, /Show me more like this/);
  assert.match(app, /data-fyp-not-interested=/);
  assert.match(app, /Not interested/);
});

test('For You recommendation menu is accessible, exclusive and closes after saving a preference', () => {
  assert.match(app, /aria-controls="fyp-feedback-menu-/);
  assert.match(app, /aria-expanded="false"/);
  assert.match(app, /root\.querySelectorAll\('\.fyp-feedback-menu'\)/);
  assert.match(app, /aria-expanded','false'/);
  assert.match(app, /menu\.hidden=true/);
});

test('For You recommendation menu remains readable and touch-friendly on narrow screens', () => {
  assert.match(styles, /\.fyp-feedback-menu\[hidden\]\{display:none!important\}/);
  assert.match(styles, /@media\(max-width:420px\)/);
  assert.match(styles, /min-height:39px!important/);
});

test('Recommendation feedback stylesheet is loaded and cached for offline shell startup', () => {
  assert.match(index, /for-you-tiktok\.css\?v=20261111-tiktok-video-layout-2/);
  assert.match(worker, /for-you-tiktok\.css\?v=20261111-tiktok-video-layout-2/);
});
