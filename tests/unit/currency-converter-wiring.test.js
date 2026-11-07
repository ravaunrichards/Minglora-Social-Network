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

  assert.match(html, /currency-converter\.css\?v=/);
  assert.match(html, /currency-converter\.js\?v=/);
  assert.match(html, /data-view="currency-converter"/);
  assert.match(html, /currency-exchange#currency-exchange/);
  assert.match(app, /'currency-converter'/);
  assert.match(app, /view:'currency-converter'/);
  assert.match(app, /state\.view==='currency-converter'\)await window\.MingloraCurrencyConverter\?\.render\(\)/);
  assert.match(app, /Currency Converter/);
});

test('Currency reference endpoints are authenticated and separate from Coin wallet routes', () => {
  const server = read('src/server.js');
  assert.match(server, /createCurrencyConverterService/);
  assert.match(server, /p==='/api/currency/currencies'/);
  assert.match(server, /p==='/api/currency/rate'/);
  const authGuard = server.indexOf('requireAuth(user);');
  const currencyRoute = server.indexOf("p==='/api/currency/currencies'");
  assert.ok(authGuard >= 0 && currencyRoute > authGuard, 'currency endpoints must remain behind the member session guard');
  assert.match(server, /currencyConverterService\.getRate\(base,quote/);
  assert.match(server, /requestSupabaseState\('economy_wallet'/);
});

test('Currency converter client assets and custom 3D icon are included in the offline shell', () => {
  const worker = read('public/sw.js');
  const icons = read('public/assets/icons/navigation-3d.svg');
  assert.match(worker, /currency-converter\.css\?v=/);
  assert.match(worker, /currency-converter\.js\?v=/);
  assert.match(worker, /currency-exchange-3d-1#currency-exchange/);
  assert.match(worker, /CACHE_NAME='minglora-shell-v[0-9]+-currency-converter-1'/);
  assert.match(icons, /<symbol id="currency-exchange"/);
});
