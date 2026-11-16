import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const iconRoot = path.join(root, 'public/assets/icons/live-gift-categories');
const manifest = JSON.parse(fs.readFileSync(path.join(iconRoot, 'manifest.json'), 'utf8'));
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/live-gift-access.css'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const expected = ["all","flowers","hearts","animals","vehicles","music","sports","food_drink","fashion_beauty","luxury","celebrations","fantasy","nature","travel","games","community","symbols","everyday","reactions","seasonal","jamaican_culture","other"];

test('the category icon manifest covers All and every live gift catalogue category', () => {
  assert.deepEqual(manifest.categories.map(item => item.id), expected);
  assert.equal(manifest.view_box, '0 0 24 24');
  for (const item of manifest.categories) {
    const relative = item.file.startsWith('/') ? item.file.slice(1) : item.file;
    const file = path.join(root, 'public', relative);
    assert.ok(fs.existsSync(file), item.id + ' category artwork must exist');
    const svg = fs.readFileSync(file, 'utf8');
    assert.ok(svg.startsWith('<svg'), item.id + ' must be an SVG document');
    assert.ok(svg.includes('<symbol id="icon" viewBox="0 0 24 24"'), item.id + ' must expose its symbol');
    assert.ok(svg.includes('stroke="currentColor"'), item.id + ' must inherit currentColor');
    assert.ok(svg.includes('<path') || svg.includes('<rect') || svg.includes('<circle') || svg.includes('<ellipse'), item.id + ' must contain vector geometry');
    assert.equal(/\p{Extended_Pictographic}/u.test(svg), false, item.id + ' must not contain emoji artwork');
  }
});

test('the LIVE gift picker renders category art alongside escaped accessible labels', () => {
  assert.ok(app.includes('const liveGiftCategoryIconFiles=Object.freeze('));
  assert.ok(app.includes('liveGiftCategoryIcon(item.key)'));
  assert.ok(app.includes('<span>'));
  assert.ok(app.includes("aria-pressed='\"+String(liveGiftCategory===item.key)+\"'"));
  assert.ok(app.includes("data-live-gift-category='\"+esc(item.key)+\"'"));
  assert.ok(app.includes("liveGiftCategory=button.dataset.liveGiftCategory||\"all\""));
  assert.ok(css.includes('.live-gift-category-icon'));
  assert.ok(css.includes('width:16px;height:16px'));
});

test('all category SVGs and the manifest are cached by the versioned service worker', () => {
  assert.match(worker, /const CACHE_NAME='minglora-shell-v\d+-self-updating-1';/);
  assert.ok(worker.includes("'/assets/icons/live-gift-categories/manifest.json'"));
  for (const id of expected) {
    assert.ok(worker.includes("'/assets/icons/live-gift-categories/" + id + ".svg'"), id + ' must be pre-cached');
  }
});

test('Jamaican culture category uses original full-colour flag artwork', () => {
  const svg = fs.readFileSync(path.join(iconRoot, 'jamaican_culture.svg'), 'utf8');
  assert.ok(svg.includes('data-artwork="jamaica-flag-saltire-v1"'));
  assert.ok(svg.includes('clipPath id="jamaica-flag-clip"'));
  assert.ok(svg.includes('linearGradient id="jc-green"'));
  assert.ok(svg.includes('linearGradient id="jc-gold"'));
  assert.ok(svg.includes('linearGradient id="jc-black"'));
  assert.ok(svg.includes('#14753f'), 'Flag artwork must include Jamaica green');
  assert.ok(svg.includes('#f3c63f'), 'Flag artwork must include Jamaica gold');
  assert.ok(svg.includes('#11151c'), 'Flag artwork must include Jamaica black');
  assert.ok(svg.includes('stroke="currentColor"'), 'Pole and outline must still inherit the active UI theme');
  assert.ok(svg.includes('M5.45 4.15L20.8 17.1M20.8 4.15L5.45 17.1'), 'Flag must contain the gold saltire');
});
