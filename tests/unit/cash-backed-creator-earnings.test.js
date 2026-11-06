import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

const [migration, runtime, server, app, adminCentre] = await Promise.all([
  read('supabase/migrations/20261106143000_minglora_cash_backed_creator_earnings.sql'),
  read('supabase/functions/minglora-runtime-state/index.ts'),
  read('src/server.js'),
  read('public/app.js'),
  read('public/admin-centre.js')
]);

test('gift debit only creates cash earnings from cash-backed and funded-marketing Coins', () => {
  assert.match(migration, /'eligibleGrossMinor',cash_used\+marketing_used/);
  assert.doesNotMatch(migration, /'eligibleGrossMinor',cash_used\+marketing_used\+CASE WHEN p_entry_type/);
});

test('creator balance and payout RPCs exclude unbacked promotional earnings', () => {
  assert.match(migration, /funding_source IN \('cash','marketing','mixed','admin_promotional'\)/);
  assert.match(migration, /payout exceeds available cash-backed creator earnings/);
  assert.match(migration, /promotionalGiftEarningsExcludedMinor/);
  assert.match(migration, /eligibleGiftEarningsMinor/);
});

test('gift receipt totals calculate eligible value from backed Coin sources, not legacy gross values', () => {
  assert.match(migration, /\(t\.cash_backed_coins\+t\.marketing_backed_coins\+t\.admin_promotional_coins\)::bigint AS eligible_gross_minor/);
  assert.match(migration, /'creatorShareMinor',round\(r\.eligible_gross_minor::numeric\/2,2\)\+r\.backing_creator_share_minor/);
  assert.match(migration, /'fundingSource',CASE WHEN r\.backing_minor>0 THEN 'admin_promotional' ELSE r\.funding_source END/);
});

test('creator-facing earnings API only returns cash-backed ledger entries', () => {
  assert.match(runtime, /\.in\("funding_source", \["cash", "marketing", "mixed", "admin_promotional"\]\)/);
  assert.match(server, /promotionalGiftEarningsExcludedMinor:Number\(result\?\.promotionalGiftEarningsExcludedMinor\|\|0\)/);
});

test('admin earnings report only totals eligible funding and identifies excluded promo history', () => {
  assert.match(runtime, /eligibleFundingSources = new Set\(\["cash", "marketing", "mixed", "admin_promotional"\]\)/);
  assert.match(runtime, /excludedPromotionalLedger/);
  assert.match(runtime, /payoutScope: "cash_backed_creator_earnings_only"/);
  assert.match(runtime, /minglora_get_platform_gift_earnings/);
});

test('creator and admin screens distinguish non-cash promotional activity from withdrawable money', () => {
  assert.match(app, /NON-CASH PROMOTIONAL SHARE/);
  assert.match(app, /Historical promotional activity · not withdrawable/);
  assert.match(adminCentre, /Non-cash promotional creator share · excluded/);
  assert.match(adminCentre, /Non-cash promotional platform share · excluded/);
  assert.match(adminCentre, /not a live PayPal balance confirmation/);
});
