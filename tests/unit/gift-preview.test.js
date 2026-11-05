import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const gifts = read('public/gifts.js');
const styles = read('public/styles.css');
const html = read('public/index.html');
const sw = read('public/sw.js');

test('Gifts opens with a visible selected 3D preview before the long catalogue', () => {
  assert.ok(gifts.indexOf('Live 3D gift preview') < gifts.indexOf('The complete gift collection'));
  assert.match(gifts, /id='minglora-gift-selected-model'[^>]*camera-controls/);
  assert.match(gifts, /id='minglora-gift-selected-image'/);
  assert.match(gifts, /id='minglora-gift-selected-fallback'/);
  assert.match(gifts, /id='minglora-gift-preview-status'/);
});

test('gift previews retain visible artwork when the 3D model or artwork cannot load', () => {
  assert.match(gifts, /addEventListener\("load"/);
  assert.match(gifts, /addEventListener\("error"/);
  assert.match(gifts, /The 3D model could not load/);
  assert.match(gifts, /The artwork image could not load/);
  assert.match(styles, /\.gift-preview-stage img,\.gift-preview-stage model-viewer/);
  assert.match(styles, /\.gift-preview-fallback/);
});

test('Gifts preview assets are versioned in both the HTML shell and service worker', () => {
  assert.match(html, /gifts\.js\?v=20261105-gift-preview-visible-1/);
  assert.match(sw, /gifts\.js\?v=20261105-gift-preview-visible-1/);
  assert.match(html, /styles\.css\?v=20261105-live-layout-expand-1-live-fullscreen-organized-sidepanel-2-profile-mobile-edit-actions-1/);
  assert.match(sw, /styles\.css\?v=20261105-live-layout-expand-1-live-fullscreen-organized-sidepanel-2-profile-mobile-edit-actions-1/);
  assert.match(sw, /v97-gifts-preview-visible-1/);
});
