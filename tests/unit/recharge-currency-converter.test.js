import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('public/app.js');
const html = read('public/index.html');
const css = read('public/styles.css');
const worker = read('public/sw.js');
const server = read('src/server.js');
const service = read('backend/modules/currency-converter/service.js');
const twoWay = read('public/quick-currency.js');
const global = read('public/currency-converter.js');
const icon = read('public/assets/icons/navigation-3d.svg');

test('Recharge presents four horizontal destinations in the requested order', () => {
  const start = app.indexOf("const tabs=\"<nav class='recharge-tabs'");
  const end = app.indexOf('const bindTabs=', start);
  assert.ok(start >= 0 && end > start, 'Recharge tab markup exists');
  const markup = app.slice(start, end);
  const labels = ['Recharge', 'Earnings', 'Exchange', 'Currency Converter'];
  let last = -1;
  for (const label of labels) {
    const index = markup.indexOf('>' + label + '</button>');
    assert.ok(index > last, 'tab appears in requested order: ' + label);
    last = index;
  }
  assert.match(css, /\.recharge-tabs\{[^}]*flex-wrap:nowrap/);
  assert.match(css, /\.recharge-tabs\{[^}]*overflow-x:auto/);
});

test('Currency Converter is an enabled Recharge tab with persistent two-way and full modes', () => {
  assert.match(app, /\['recharge','earnings','exchange','currency'\]\.includes\(state\.rechargeTab\)/);
  assert.match(app, /if\(activeTab==="currency"\)/);
  assert.match(app, /data-recharge-currency-mode='two-way'/);
  assert.match(app, /data-recharge-currency-mode='global'/);
  assert.match(app, /window\.MingloraQuickCurrency/);
  assert.match(app, /window\.MingloraCurrencyConverter/);
  assert.match(app, /state\.rechargeCurrencyMode=saved\.rechargeCurrencyMode/);
  assert.match(app, /state\.rechargeTab=\['recharge','earnings','exchange','currency'\]/);
});

test('Embedded converter modules mount inside the Recharge tab, not over the whole app', () => {
  assert.match(twoWay, /const getRoot = \(\) => \$\('#recharge-currency-embed'\) \|\| \$\('#main-content'\)/);
  assert.match(global, /const getRoot = \(\) => \$\('#recharge-currency-embed'\) \|\| \$\('#main-content'\)/);
  assert.match(twoWay, /data-qcc-amount="from"/);
  assert.match(twoWay, /data-qcc-amount="to"/);
  assert.match(twoWay, /calculateFromSource\(\)/);
  assert.match(twoWay, /calculateFromTarget\(\)/);
  assert.match(twoWay, /data-qcc-swap/);
  assert.match(global, /data-mcc-amount/);
});

test('Currency API uses active ISO currency directory and reference-rate service endpoints', () => {
  assert.match(server, /createCurrencyConverterService\(\)/);
  assert.ok(server.includes("p==='/api/currency/currencies'"));
  assert.ok(server.includes("p==='/api/currency/rate'"));
  assert.match(server, /currencyConverterService\.getCurrencyDirectory\(\)/);
  assert.match(server, /currencyConverterService\.getRate\(base,quote/);
  assert.match(server, /normalizeCurrencyCode\(/);
  assert.match(service, /ISO 4217/);
});

test('HTML and service worker load and cache both converter modes and 3D artwork', () => {
  for (const asset of [
    'currency-converter.css',
    'quick-currency.css',
    'currency-converter.js',
    'quick-currency.js'
  ]) {
    assert.ok(html.includes(asset), 'index includes ' + asset);
    assert.ok(worker.includes(asset), 'service worker precaches ' + asset);
  }
  const appAsset=html.match(/app\.js\\?v=[^"']+/)?.[0]||'';
  const cacheName=worker.match(/CACHE_NAME='([^']+)'/)?.[1]||'';
  assert.ok(appAsset&&worker.includes("'/"+appAsset+"'"),'service worker caches the exact HTML app script');
  assert.match(cacheName,/^minglora-shell-v\d+-/);
  assert.match(icon, /<symbol id="currency-exchange"/);
  assert.match(icon, /<symbol id="currency-quick"/);
  assert.ok(app.includes('#currency-exchange'));
});
