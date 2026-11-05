import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

const [migration, runtime, server, admin, app, html, worker, docs, css] = await Promise.all([
  read('supabase/migrations/20261105221400_minglora_retroactive_promotional_gift_cash_backing.sql'),
  read('supabase/functions/minglora-runtime-state/index.ts'),
  read('src/server.js'),
  read('public/admin-centre.js'),
  read('public/app.js'),
  read('public/index.html'),
  read('public/sw.js'),
  read('docs/promotional-gift-cashout.md'),
  read('public/admin-centre.css')
]);

test('historical promotional cash backing has a unique audit row and isolated reserve accounting', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.minglora_promotional_gift_cash_backings/);
  assert.match(migration, /request_id uuid NOT NULL UNIQUE/);
  assert.match(migration, /gift_transaction_id uuid NOT NULL UNIQUE/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.minglora_promotional_gift_cash_backings TO service_role/);
  assert.match(migration, /fund\.funded_minor-fund\.spent_minor < gift\.coin_amount/);
  assert.match(migration, /SET spent_minor=spent_minor\+gift\.coin_amount/);
  assert.match(migration, /creator_share:=round\(gift\.coin_amount::numeric\/2,2\)/);
  assert.match(migration, /'admin_promotional'\s*\)/);
  assert.doesNotMatch(migration, /UPDATE public\.coin_wallets/i);
  assert.doesNotMatch(migration, /INSERT INTO public\.coin_wallets/i);
});

test('only fully ordinary, non-earning promo gifts are eligible and cannot be backed twice', () => {
  assert.match(migration, /t\.funding_source='promo'/);
  assert.match(migration, /t\.promo_coins=t\.coin_amount/);
  assert.match(migration, /t\.cash_backed_coins=0/);
  assert.match(migration, /t\.marketing_backed_coins=0/);
  assert.match(migration, /t\.admin_promotional_coins=0/);
  assert.match(migration, /NOT EXISTS \([\s\S]*creator_earnings_ledger/);
  assert.match(migration, /WHERE gift_transaction_id=p_gift_transaction_id/);
  assert.match(migration, /alreadyBacked/);
});

test('a backed historical gift creates one eligible 50/50 creator ledger entry', () => {
  assert.match(migration, /INSERT INTO public\.creator_earnings_ledger/);
  assert.match(migration, /gift\.receiver_id,gift\.id,gift\.coin_amount,creator_share,platform_share,'admin_promotional'/);
  assert.match(migration, /minglora_promotional_gift_fund_ledger/);
  assert.match(migration, /fund_ledger_id/);
  assert.match(migration, /LEFT JOIN public\.minglora_promotional_gift_cash_backings/);
  assert.match(migration, /cashBackedPromotionalCoins/);
  assert.match(migration, /cashBackingCreatorShareMinor/);
});

test('the runtime exposes only server-side owner-authorized cash-backing actions', () => {
  assert.match(runtime, /"economy_admin_promotional_gift_backings_list"/);
  assert.match(runtime, /"economy_admin_promotional_gift_backing_create"/);
  assert.match(runtime, /admin\.rpc\("minglora_list_promotional_gifts_for_cash_backing"/);
  assert.match(runtime, /admin\.rpc\("minglora_backfill_promotional_gift_cash"/);
  assert.match(runtime, /creatorhubcreatornetwork@gmail\.com/);
});

test('Render routes require the MFA-verified Creator Hub administrator', () => {
  assert.match(server, /\/api\/admin\/promotional-gift-cash-backings/);
  assert.match(server, /user\.role!=='platform_owner'\|\|!isModerator\(user,req\)\|\|!hasActiveReviewerSession\(user\)/);
  assert.match(server, /economy_admin_promotional_gift_backings_list/);
  assert.match(server, /economy_admin_promotional_gift_backing_create/);
});

test('private admin UI requires enough already-captured reserve and confirms the irreversible allocation', () => {
  assert.match(admin, /Back a past promotional gift with real cash/);
  assert.match(admin, /promotionalGiftReserveAvailableMinor >= requiredMinor/);
  assert.match(admin, /Fund reserve first/);
  assert.match(admin, /cannot be reversed after backing/);
  assert.match(admin, /\/api\/admin\/promotional-gift-cash-backings/);
  assert.match(css, /\.admin-promotional-gift-cash-backing-row/);
});

test('Wallet and Creator Studio show the cash backing separately from the original Coin source', () => {
  assert.match(app, /cashBackingMinor/);
  assert.match(app, /later backed by USD reserve/);
  assert.match(app, /cashBackedPromotionalCoins/);
  assert.match(app, /reserve-backed/);
});

test('cache versions and operational documentation are refreshed', () => {
  assert.match(html, /cash-backing-1/);
  assert.match(worker, /cash-backing-1/);
  assert.match(worker, /admin-centre\.js\?v=.*cash-backing-1/);
  assert.match(docs, /Historical cash backing is limited/);
  assert.match(docs, /50% creator share/);
});
