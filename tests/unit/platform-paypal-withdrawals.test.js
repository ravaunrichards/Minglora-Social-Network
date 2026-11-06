import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

const [migration, runtime, server, adminCentre, adminCss] = await Promise.all([
  read('database/migrations/081_minglora_manual_platform_paypal_withdrawals.sql'),
  read('supabase/functions/minglora-runtime-state/index.ts'),
  read('src/server.js'),
  read('public/admin-centre.js'),
  read('public/admin-centre.css')
]);

test('platform withdrawal balance is calculated separately from creator payout balances', () => {
  assert.match(migration, /availablePlatformShareMinor/);
  assert.match(migration, /minglora_platform_payouts/);
  assert.match(migration, /funding_source in \('cash','marketing','mixed','admin_promotional'\)/);
  assert.match(migration, /p\.status in \('requested','processing','paid'\)/);
});

test('platform payout account and ledger are private to the server service role', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.minglora_platform_payouts from anon, authenticated/i);
  assert.match(migration, /grant all on public\.minglora_platform_payouts to service_role/i);
  assert.match(runtime, /economy_admin_platform_payout_account_set/);
  assert.match(runtime, /contains\("permissions", \["platform:admin"\]\)/);
});

test('withdrawal reservation is owner-authorized and cannot exceed available platform share', () => {
  assert.match(migration, /admin_campaign_coins_authorized\(p_admin_user_id,p_admin_email\)/);
  assert.match(migration, /Withdrawal exceeds Minglora available platform earnings/);
  assert.match(runtime, /minglora_request_platform_payout/);
  assert.match(runtime, /minglora_update_platform_payout/);
});

test('PayPal submission is manually invoked behind the MFA-verified owner route', () => {
  assert.match(server, /\/api\/admin\/platform-payouts/);
  assert.match(server, /hasActiveReviewerSession\(user\)/);
  assert.match(server, /paypalRequest\('\/v1\/payments\/payouts','POST'/);
  assert.match(adminCentre, /window\.confirm\('Send USD '/);
  assert.match(adminCentre, /Withdraw to PayPal/);
  assert.doesNotMatch(adminCentre, /setInterval\([^)]*platform-payout/);
});

test('definitively rejected PayPal submissions fail and release the reservation', () => {
  assert.match(server, /paypalNoSubmission===true/);
  assert.match(server, /status:'failed'/);
  assert.match(server, /PLATFORM_PAYOUT_RESERVATION_RELEASE_FAILED/);
  assert.match(runtime, /minglora_platform_payouts/);
});

test('admin sees destination, available share, and platform withdrawal history', () => {
  assert.match(adminCentre, /admin-platform-payout-email/);
  assert.match(adminCentre, /availablePlatformShareMinor/);
  assert.match(adminCentre, /platformPayouts/);
  assert.match(adminCentre, /PayPal does not allow a Payout to be sent to the same PayPal account/);
  assert.match(adminCss, /admin-platform-payout-balances/);
});
