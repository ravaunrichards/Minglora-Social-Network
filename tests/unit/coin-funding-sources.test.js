import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

const [migration, runtime, server, app, admin, adminCss, worker, html] = await Promise.all([
  read('database/migrations/080_minglora_source_backed_coin_earnings_and_marketing_budget.sql'),
  read('supabase/functions/minglora-runtime-state/index.ts'),
  read('src/server.js'),
  read('public/app.js'),
  read('public/admin-centre.js'),
  read('public/admin-centre.css'),
  read('public/sw.js'),
  read('public/index.html')
]);

test('Coin wallets reconcile exactly across cash-backed, marketing-backed and ordinary promotional balances', () => {
  assert.match(migration, /cash_balance_coins bigint NOT NULL DEFAULT 0/);
  assert.match(migration, /marketing_balance_coins bigint NOT NULL DEFAULT 0/);
  assert.match(migration, /promo_balance_coins bigint NOT NULL DEFAULT 0/);
  assert.match(migration, /balance_coins=cash_balance_coins\+marketing_balance_coins\+promo_balance_coins/);
  assert.match(migration, /cash_delta_coins/);
  assert.match(migration, /marketing_delta_coins/);
  assert.match(migration, /promo_delta_coins/);
  assert.match(migration, /'owner_issuance','admin_credit'/);
});

test('ordinary owner/admin Coins remain non-cash and do not create withdrawable creator earnings', () => {
  assert.match(migration, /p_owner_user_id,0,0,p_amount_coins,'owner_issuance'/);
  assert.match(migration, /p_member_user_id,0,0,p_amount_coins,'admin_credit'/);
  assert.match(migration, /eligible_gross := cash_used\+marketing_used/);
  assert.match(migration, /IF eligible_gross>0 THEN/);
  assert.match(migration, /cash_backed_coins,marketing_backed_coins,promo_coins,funding_source/);
});

test('funded marketing promotional Coins require confirmed budget, and grants reserve the USD backing', () => {
  assert.match(migration, /minglora_marketing_budget/);
  assert.match(migration, /minglora_record_marketing_funding/);
  assert.match(migration, /funding_reference text/);
  assert.match(migration, /reserved_minor\+spent_minor<=funded_minor/);
  assert.match(migration, /minglora_grant_marketing_coins/);
  assert.match(migration, /funded_minor-budget\.reserved_minor-budget\.spent_minor < p_amount_coins/);
  assert.match(migration, /reserved_minor=reserved_minor\+p_amount_coins/);
  assert.match(migration, /reserved_minor=reserved_minor-marketing_used/);
  assert.match(migration, /spent_minor=spent_minor\+marketing_used/);
  assert.match(migration, /fundingSource/);
});

test('LIVE and profile gifts calculate the creator 50/50 split only from backed Coins', () => {
  for (const name of ['minglora_send_live_gift','minglora_send_social_gift']) {
    assert.match(migration, new RegExp('CREATE OR REPLACE FUNCTION public\\.' + name));
  }
  assert.match(migration, /eligible_gross := cash_used\+marketing_used/);
  assert.match(migration, /creator_amount := eligible_gross::numeric\/2/);
  assert.match(migration, /platformShareMinor/);
  assert.match(runtime, /economy_send_social_gift/);
  assert.match(runtime, /cash_balance_coins,marketing_balance_coins,promo_balance_coins/);
});

test('Goody Bags and Treasure Boxes preserve the Coin funding source when escrowed, awarded or refunded', () => {
  assert.match(migration, /cash_remaining_coins/);
  assert.match(migration, /marketing_remaining_coins/);
  assert.match(migration, /promo_remaining_coins/);
  assert.match(migration, /minglora_split_reward_coin_sources/);
  assert.match(migration, /cash_coins,marketing_coins,promo_coins/);
  assert.match(migration, /minglora_credit_wallet_sources\(/);
});

test('the marketing budget is private and protected server actions are restricted to the designated MFA admin', () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.minglora_marketing_budget/);
  assert.match(migration, /creatorhubcreatornetwork@gmail\.com/);
  assert.match(migration, /p\.verification_badge='blue'/);
  assert.match(migration, /s\.role='owner' AND s\.active=true/);
  assert.match(server, /\/api\/admin\/marketing\/funding/);
  assert.match(server, /\/api\/admin\/marketing\/grants/);
  assert.match(server, /hasActiveReviewerSession\(user\)/);
  assert.match(runtime, /economy_marketing_funding/);
  assert.match(runtime, /economy_marketing_grant/);
});

test('wallet and private admin settings show source balances and marketing-budget controls', () => {
  assert.match(app, /coin-source-breakdown/);
  assert.match(app, /cashBackedBalance/);
  assert.match(app, /marketingBackedBalance/);
  assert.match(app, /promoBalance/);
  assert.match(admin, /admin-marketing-funding-form/);
  assert.match(admin, /admin-marketing-grant-form/);
  assert.match(admin, /Do not record pending or expected funds/);
  assert.match(adminCss, /\.admin-marketing-budget/);
  assert.match(adminCss, /\.admin-marketing-budget-summary/);
  assert.match(html, /admin-centre\.js\?v=20261105-marketing-budget-1/);
});

test('the PWA shell cache includes the wallet, admin controls and the updated UI versions', () => {
  assert.match(html, /styles\.css\?v=20261105-live-viewer-fanclub-1/);
  assert.match(html, /app\.js\?v=20261105-live-viewer-fanclub-1/);
  assert.match(worker, /minglora-shell-v87-live-viewer-fanclub-1/);
  assert.match(worker, /admin-centre\.css\?v=20261105-marketing-budget-1/);
  assert.match(worker, /admin-centre\.js\?v=20261105-marketing-budget-1/);
});
