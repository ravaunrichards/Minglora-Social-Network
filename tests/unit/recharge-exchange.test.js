import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

const [app, html, css, worker, server, runtime, migration, balanceMigration] = await Promise.all([
  read('public/app.js'),
  read('public/index.html'),
  read('public/styles.css'),
  read('public/sw.js'),
  read('src/server.js'),
  read('supabase/functions/minglora-runtime-state/index.ts'),
  read('supabase/migrations/20261104215934_minglora_money_balance_to_coins.sql'),
  read('supabase/migrations/20261104220917_minglora_creator_money_balance_lifetime_total.sql')
]);

test('the Coins destination is presented as Recharge in navigation', () => {
  assert.match(html, /data-view="coins"[^>]*>[\s\S]*?Recharge<\/button>/);
  assert.match(app, /label:'Recharge',detail:'Buy Coins or exchange available money balance for Minglora Coins',view:'coins'/);
  assert.match(app, /<h1>Wallet &amp; earnings<\/h1>/);
});

test('Recharge still supports packages, custom amounts and PayPal coin checkout', () => {
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

test('Exchange converts available money into Coins and does not pay money to PayPal', () => {
  const exchangeStart = app.indexOf('if(activeTab==="exchange"){');
  const rechargeStart = app.indexOf('let selection=packages.length?', exchangeStart);
  const exchangeUi = app.slice(exchangeStart, rechargeStart);
  assert.ok(exchangeStart >= 0 && rechargeStart > exchangeStart);
  assert.match(exchangeUi, /Exchange money for Coins/);
  assert.match(exchangeUi, /Available money balance/);
  assert.match(exchangeUi, /100 Coins/);
  assert.match(exchangeUi, /Eligible LIVE gift and subscription earnings/);
  assert.match(exchangeUi, /api\("\/coins\/exchange"/);
  assert.doesNotMatch(exchangeUi, /creator\/payout-account|creator\/payouts|PayPal recipient/);
  assert.match(server, /economy_exchange_creator_earnings/);
  assert.match(runtime, /minglora_exchange_creator_earnings_for_coins/);
  assert.match(runtime, /economy_exchange_creator_earnings/);
});

test('the database exchange is atomic, idempotent, ledger-backed and deducted from payout availability', () => {
  assert.match(migration, /creator_coin_exchanges/);
  assert.match(migration, /request_id uuid NOT NULL UNIQUE/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /coin_ledger/);
  assert.match(migration, /'exchange'/);
  assert.match(migration, /exchanged_minor/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.minglora_exchange_creator_earnings_for_coins/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.creator_coin_exchanges FROM PUBLIC, anon, authenticated/);
  assert.match(balanceMigration, /lifetime_creator_earnings_minor/);
  assert.match(balanceMigration, /available_creator_earnings_minor/);
});

test('the member wallet displays real earned and available money separately from Coins', () => {
  assert.match(app, /api\("\/creator\/earnings"\)/);
  assert.match(app, /REAL MONEY EARNINGS/);
  assert.match(app, /LIFETIME EARNED/);
  assert.match(app, /AVAILABLE MONEY/);
  assert.match(app, /Your Minglora money balance/);
  assert.match(app, /Minglora Coins/);
  assert.match(app, /data-recharge-tab='earnings'/);
  assert.match(app, /Money balance unavailable/);
  assert.match(css, /\.wallet-money-overview/);
  assert.match(css, /\.wallet-money-stat/);
  assert.match(css, /@media\(max-width:650px\)[\s\S]*?\.wallet-money-overview/);
});

test('the Earnings tab shows server-backed lifetime, available, pending, paid and exchanged money', () => {
  const earningsStart = app.indexOf('if(activeTab==="earnings"){');
  const exchangeStart = app.indexOf('if(activeTab==="exchange"){', earningsStart);
  assert.ok(earningsStart >= 0 && exchangeStart > earningsStart);
  const earningsUi = app.slice(earningsStart, exchangeStart);
  for (const label of [
    'Lifetime earned',
    'Available money',
    'Payouts in progress',
    'Already paid out',
    'Exchanged for Coins',
    'EARNINGS LEDGER',
    'PAYOUT HISTORY',
    'MONEY CONVERSIONS',
    'No eligible gift earnings yet',
    'No withdrawals yet',
    'No money exchanges yet'
  ]) assert.ok(earningsUi.includes(label), 'missing Earnings UI: ' + label);
  assert.match(earningsUi, /creatorMoney\(earnings\.earnedMinor\|\|0\)/);
  assert.match(earningsUi, /creatorMoney\(earnings\.availableMinor\|\|0\)/);
  assert.match(earningsUi, /payouts\.filter\(item=>String\(item\.status\|\|""\)\.toLowerCase\(\)==="paid"\)/);
  assert.match(earningsUi, /item\.status\|\|"available"/);
});

test('the Recharge app and service worker use matching updated cache versions', () => {
  assert.match(html, /styles\.css\?v=20261105-live-viewer-fanclub-1/);
  assert.match(html, /app\.js\?v=20261105-live-viewer-fanclub-1/);
  assert.match(worker, /minglora-shell-v87-live-viewer-fanclub-1/);
  assert.match(worker, /\/styles\.css\?v=20261105-live-viewer-fanclub-1/);
  assert.match(worker, /\/app\.js\?v=20261105-live-viewer-fanclub-1/);
  assert.match(css, /\.recharge-package-grid/);
  assert.match(css, /\.recharge-exchange-metrics/);
});
