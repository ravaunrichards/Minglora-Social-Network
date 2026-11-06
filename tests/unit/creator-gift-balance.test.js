import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

const [migration, runtime, app, gifts, html, worker, server] = await Promise.all([
  read('supabase/migrations/20261105205451_minglora_creator_gift_balance_summary.sql'),
  read('supabase/functions/minglora-runtime-state/index.ts'),
  read('public/app.js'),
  read('public/gifts.js'),
  read('public/index.html'),
  read('public/sw.js'),
  read('src/server.js')
]);

test('creator gift summary includes all received gifts and separates Coin funding sources', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.minglora_get_creator_gift_balance/);
  assert.match(migration, /'receivedCoins'/);
  assert.match(migration, /'cashBackedCoins'/);
  assert.match(migration, /'marketingBackedCoins'/);
  assert.match(migration, /'promotionalCoins'/);
  assert.match(migration, /'adminPromotionalCoins'/);
  assert.match(migration, /'creatorShareMinor'/);
  assert.match(migration, /'recent'/);
  assert.match(migration, /auth\.jwt\(\)->>'role'.*service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.minglora_get_creator_gift_balance\(uuid\) TO service_role/);
});

test('creator earnings API includes the received-gift summary without altering the cash ledger', () => {
  assert.match(runtime, /admin\.rpc\("minglora_get_creator_gift_balance", \{ p_creator_id: creatorId \}\)/);
  assert.match(runtime, /giftBalance: giftBalanceResult\.data \|\| \{\}/);
  assert.match(runtime, /admin\.from\("creator_earnings_ledger"\)/);
});

test('Wallet and Earnings display received gifts independently from spendable Coins and cash earnings', () => {
  assert.match(app, /GIFT COINS RECEIVED/);
  assert.match(app, /GIFT RECEIPTS/);
  assert.match(app, /Gifts received/);
  assert.match(app, /Activity total · not spendable wallet Coins/);
  assert.match(app, /Ordinary promotional Coins remain visible in gift history but do not create withdrawable earnings/);
  assert.match(app, /Cash-reserved Admin Promotional/);
  assert.match(app, /creatorMetric\("Gift Coins received"/);
  assert.match(app, /Latest 50 · all funding sources/);
});

test('gift send confirmation explains why ordinary promotional Coins do not create creator cash earnings', () => {
  assert.match(gifts, /ordinary promotional Coins/);
  assert.match(gifts, /Gifts Received history/);
  assert.match(app, /ordinary promotional Coins \(no cash earnings\)/);
});

test('the app bundle and service-worker cache are refreshed for the gift balance interface', () => {
  assert.match(html, /app\.js\?v=20261105-roomwide-live-gifts-1/);
  assert.match(worker, /minglora-shell-v93-flow-layout-safety-1-single-username-verification-1-creator-gift-balance-1/);
});

test('creator earnings are private to the signed-in creator and do not disclose Minglora share fields', () => {
  const start = runtime.indexOf('if (action === "economy_creator_earnings")');
  const end = runtime.indexOf('if (action === "economy_exchange_creator_earnings")', start);
  assert.ok(start >= 0 && end > start, 'creator earnings action must exist');
  const creatorEarningsAction = runtime.slice(start, end);
  assert.match(creatorEarningsAction, /\.eq\("creator_id", creatorId\)/);
  assert.match(creatorEarningsAction, /creator_share_minor/);
  assert.doesNotMatch(creatorEarningsAction, /platform_share_minor|platformSharePercent/);

  const routeStart = server.indexOf("if(method==='GET'&&p==='/api/creator/earnings')");
  const routeEnd = server.indexOf("if(method==='GET'&&p==='/api/creator/payout-account')", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, 'creator earnings route must exist');
  const earningsRoute = server.slice(routeStart, routeEnd);
  assert.match(earningsRoute, /creatorId:user\.id/);
  assert.match(earningsRoute, /const pick=\(row,fields\)/);
  assert.match(earningsRoute, /creator_share_minor/);
  assert.doesNotMatch(earningsRoute, /platform_share_minor|platformSharePercent|paypal_batch_id/);

  const apiStart = server.indexOf("if (p.startsWith('/api/'))");
  const authGuard = server.indexOf('requireAuth(user);', apiStart);
  assert.ok(apiStart >= 0 && authGuard > apiStart && authGuard < routeStart,
    'creator earnings must remain behind the signed-in API guard');
  assert.match(migration, /WHERE t\.receiver_id=p_creator_id/);
});
