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

test('Gift Studio no longer renders a separate 3D gift preview', () => {
  assert.doesNotMatch(gifts, /gift-preview-panel|gift-preview-stage|minglora-gift-selected-model|minglora-gift-preview-status|bindPreviewEvents|Live 3D gift preview|rotatable 3D preview/i);
  assert.match(gifts, /id='minglora-gift-grid'/);
  assert.match(gifts, /id='minglora-gift-selected-summary'/);
  assert.doesNotMatch(styles, /\.gift-preview-(?:panel|copy|status|stage|fallback|actions)/);
});

test('gift artwork selection, sound preview and sending remain available', () => {
  assert.match(gifts, /data-gift-select/);
  assert.match(gifts, /data-gift-icon/);
  assert.match(gifts, /id='minglora-gift-sound'/);
  assert.match(gifts, /MingloraGiftFX\?\.preview\(g\)/);
  assert.match(gifts, /function sendGift\(/);
  assert.match(gifts, /id='minglora-gift-send'/);
  assert.match(gifts, /The selected gift's exact coin price is deducted/);
  assert.match(gifts, /MingloraGifterProgression\?\.renderInto/);
});

test('Gift Studio script and stylesheet cache URLs are synchronized', () => {
  const giftsAsset=html.match(/src="(\/gifts\.js\?v=[^"]+)"/)?.[1]||'';
  const stylesAsset=html.match(/href="(\/styles\.css\?v=[^"]+)"/)?.[1]||'';
  assert.ok(giftsAsset&&sw.includes("'" + giftsAsset + "'"), 'current Gifts script is precached');
  assert.ok(stylesAsset&&sw.includes("'" + stylesAsset + "'"), 'current stylesheet is precached');
  assert.match(sw,/CACHE_NAME='minglora-shell-v\d+-/);
});
