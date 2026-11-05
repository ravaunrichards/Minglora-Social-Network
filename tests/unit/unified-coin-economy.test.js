import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

const [migration, server, runtime, admin, index, worker, coinDocs, apiDocs] = await Promise.all([
  read('database/migrations/085_equal_spending_and_creator_earnings_for_all_coin_sources.sql'),
  read('src/server.js'),
  read('supabase/functions/minglora-runtime-state/index.ts'),
  read('public/admin-centre.js'),
  read('public/index.html'),
  read('public/sw.js'),
  read('docs/MINGLORA_COIN_FUNDING_SOURCES.md'),
  read('docs/API.md')
]);

test('admin and owner bonus credits enter the Main Coin wallet as promotional-source Coins', () => {
  assert.match(migration, /p_member_user_id,0,0,p_amount_coins,'admin_credit'/);
  assert.match(migration, /p_owner_user_id,0,0,p_amount_coins,'owner_issuance'/);
  assert.match(migration, /balance_coins/);
  assert.match(migration, /minglora_credit_wallet_sources/);
  assert.match(migration, /current_balance>9223372036854775807-p_amount_coins/);
  assert.match(migration, /alreadyCredited/);
  assert.match(migration, /alreadyIssued/);
  assert.doesNotMatch(migration, /bonus Coins require confirmed cash backing/);
});

test('all Coin source balances are spendable and contribute to the same full gift gross', () => {
  assert.match(migration, /eligible_gross := cash_used\+marketing_used\+promo_used/);
  assert.match(migration, /creator_amount := eligible_gross::numeric\/2/);
  assert.match(migration, /platform_share_minor/);
  assert.match(migration, /funding_source/);
  assert.doesNotMatch(migration, /bonus_budget/);
  assert.doesNotMatch(migration, /Promotional bonus gifts require available verified USD backing/);
});

test('marketing-funded Coins still consume their own reserved USD budget only once', () => {
  assert.match(migration, /IF marketing_used > 0 AND p_entry_type IN/);
  assert.match(migration, /reserved_minor=reserved_minor-marketing_used/);
  assert.match(migration, /spent_minor=spent_minor\+marketing_used/);
  assert.match(migration, /WHERE id=true AND reserved_minor >= marketing_used/);
});

test('owner/admin credit and member search actions remain server-only and MFA protected', () => {
  assert.match(runtime, /if \(action === "economy_admin_member_credit"\)/);
  assert.match(runtime, /minglora_admin_credit_member_coins/);
  assert.match(server, /\/api\/admin\/coins\/member-credit/);
  assert.match(server, /hasActiveReviewerSession\(user\)/);
  assert.match(server, /economy_admin_member_credit/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.minglora_admin_credit_member_coins/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.minglora_admin_credit_member_coins[\s\S]*TO service_role/);
});

test('the private Admin Centre exposes a separate Main Coin member bonus control', () => {
  assert.match(admin, /admin-main-coin-credit-form/);
  assert.match(admin, /\/api\/admin\/coins\/member-credit/);
  assert.match(admin, /Main Coin bonus/);
  assert.match(admin, /does not debit your Main Coin balance/);
  assert.match(admin, /Admin Promotional Gift Wallet remains isolated/);
  assert.match(index, /admin-centre\.js\?v=20261105-unified-coin-economy-1/);
  assert.match(worker, /minglora-shell-v94-unified-coin-economy-1/);
  assert.match(worker, /admin-centre\.js\?v=20261105-unified-coin-economy-1/);
});

test('creator earnings, USD exchange and PayPal cash payouts use the same ledger services', () => {
  assert.match(server, /\/api\/creator\/earnings/);
  assert.match(server, /\/api\/coins\/exchange/);
  assert.match(server, /economy_exchange_creator_earnings/);
  assert.match(server, /\/api\/creator\/payouts/);
  assert.match(server, /economy_request_payout/);
  assert.match(server, /\/v1\/payments\/payouts/);
  assert.match(server, /economy_update_payout/);
  assert.match(runtime, /economy_creator_earnings/);
});

test('documentation explains equal Coin purchasing power and separates the campaign wallet', () => {
  assert.match(coinDocs, /same face value/);
  assert.match(coinDocs, /same 50% creator \/ 50% Minglora split/);
  assert.match(coinDocs, /Admin Promotional Gift Wallet remains an independent campaign wallet/);
  assert.match(coinDocs, /payout remains pending\/processing until PayPal confirms/);
  assert.match(apiDocs, /\/api\/admin\/coins\/member-credit/);
  assert.match(apiDocs, /\/api\/creator\/payouts/);
});
