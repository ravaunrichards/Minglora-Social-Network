import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

const [app, html, css, worker, server] = await Promise.all([
  read('public/app.js'),
  read('public/index.html'),
  read('public/styles.css'),
  read('public/sw.js'),
  read('src/server.js')
]);

test('the Coins destination is presented as Recharge in desktop and mobile navigation', () => {
  assert.match(html, /data-view="coins"[^>]*>[\s\S]*?Recharge<\/button>/);
  assert.match(app, /label:'Recharge',detail:'Buy Minglora Coins and exchange creator earnings',view:'coins'/);
  assert.match(app, /<h1>Recharge<\/h1>/);
});

test('Recharge shows server-priced packages, selectable order summary and a custom amount', () => {
  assert.match(app, /api\("\/coins\/catalog"\)/);
  assert.match(app, /data-coin-package=/);
  assert.match(app, /recharge-package-card/);
  assert.match(app, /recharge-order-summary/);
  assert.match(app, /id='recharge-confirm'/);
  assert.match(app, /id='recharge-custom-amount'/);
  assert.match(app, /min='100' max='100000' step='2'/);
  assert.match(app, /startCoinPurchase\(\{\.\.\.selection,button:confirmButton\}\)/);
  assert.match(app, /api\("\/coins\/purchase"/);
  assert.match(server, /paypalRequest\('\/v2\/checkout\/orders'/);
});

test('Exchange uses eligible creator earnings and the existing PayPal payout flow, never a purchased-Coin cash-out', () => {
  assert.match(app, /data-recharge-tab='exchange'/);
  assert.match(app, /api\("\/creator\/earnings"\)/);
  assert.match(app, /api\("\/creator\/payout-account"/);
  assert.match(app, /api\("\/creator\/payouts"/);
  assert.match(app, /availableMinor/);
  assert.match(app, /Minimum exchange: USD \$1\.00/);
  assert.match(app, /Coins purchased for gifting stay in your Minglora Coin balance and cannot be converted to cash/);
  assert.match(server, /paypalRequest\('\/v1\/payments\/payouts'/);
  assert.match(app, /50% of eligible LIVE gift value/);
});

test('Recharge styles and current shell assets are cached under one matching release version', () => {
  assert.match(html, /styles\.css\?v=20261104-recharge-exchange-1/);
  assert.match(html, /app\.js\?v=20261104-recharge-exchange-1/);
  assert.match(worker, /minglora-shell-v78-recharge-exchange-1/);
  assert.match(worker, /\/styles\.css\?v=20261104-recharge-exchange-1/);
  assert.match(worker, /\/app\.js\?v=20261104-recharge-exchange-1/);
  assert.match(css, /\.recharge-package-grid/);
  assert.match(css, /\.recharge-exchange-metrics/);
});
