import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Currency Converter is wired into Minglora Wallet, navigation and browser history', () => {
  const html = read('public/index.html');
  const app = read('public/app.js');

  assert.ok(html.includes('currency-converter.css?v='));
  assert.ok(html.includes('currency-converter.js?v='));
  assert.ok(html.includes('data-view="currency-converter"'));
  assert.ok(html.includes('#currency-exchange'));
  assert.ok(app.includes("'currency-converter'"));
  assert.ok(app.includes("view:'currency-converter'"));
  assert.ok(app.includes("state.view==='currency-converter'"));
  assert.ok(app.includes('Currency Converter'));
});

test('Currency reference endpoints are authenticated and separate from Coin wallet routes', () => {
  const server = read('src/server.js');
  assert.ok(server.includes('createCurrencyConverterService'));
  assert.ok(server.includes("p==='/api/currency/currencies'"));
  assert.ok(server.includes("p==='/api/currency/rate'"));
  const authGuard = server.indexOf('requireAuth(user);');
  const currencyRoute = server.indexOf("p==='/api/currency/currencies'");
  assert.ok(authGuard >= 0 && currencyRoute > authGuard, 'currency endpoints must remain behind the member session guard');
  assert.ok(server.includes('currencyConverterService.getRate(base,quote'));
  assert.ok(server.includes("requestSupabaseState('economy_wallet'"));
});

test('Currency converter client assets and custom 3D icon are included in the offline shell', () => {
  const worker = read('public/sw.js');
  const icons = read('public/assets/icons/navigation-3d.svg');
  assert.ok(worker.includes('currency-converter.css?v='));
  assert.ok(worker.includes('currency-converter.js?v='));
  assert.ok(worker.includes('currency-exchange-3d-1#currency-exchange'));
  assert.match(worker, /CACHE_NAME='minglora-shell-v[0-9]+-currency-converter-1'/);
  assert.ok(icons.includes('<symbol id="currency-exchange"'));
});
