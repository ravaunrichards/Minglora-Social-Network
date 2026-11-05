import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const adminUi = readFileSync(path.join(root, "public/admin-centre.js"), "utf8");
const server = readFileSync(path.join(root, "src/server.js"), "utf8");
const runtime = readFileSync(path.join(root, "supabase/functions/minglora-runtime-state/index.ts"), "utf8");
const migration = readFileSync(path.join(root, "database/migrations/081_admin_campaign_coins.sql"), "utf8");
const css = readFileSync(path.join(root, "public/admin-centre.css"), "utf8");

test("Admin Centre exposes a separate Admin Campaign Coins wallet and manual promotion controls", () => {
  assert.match(adminUi, /Admin Campaign Coins/);
  assert.match(adminUi, /admin-campaign-coins-summary/);
  assert.match(adminUi, /admin-campaign-coins-fund-form/);
  assert.match(adminUi, /admin-campaign-coins-allocation-form/);
  assert.match(adminUi, /admin-campaign-coins-history-list/);
  assert.match(adminUi, /Optional AI promotion assistance/);
  assert.match(adminUi, /Copy campaign brief for ChatGPT/);
  assert.match(adminUi, /Main Coins or Main Promotional Coins/);
  assert.match(css, /\.admin-campaign-coins-grid/);
  assert.match(css, /@media\(max-width:720px\)/);
});

test("manual wallet funding and member allocations require explicit confirmation and secure request IDs", () => {
  assert.match(adminUi, /window\.crypto\?\.randomUUID/);
  assert.match(adminUi, /Add \+?'.*Admin Campaign Coins only/);
  assert.match(adminUi, /Only the Admin Campaign Coins wallet and the member’s separate Admin Promotional Gift Wallet will change/);
  assert.match(adminUi, /window\.confirm\(/);
  assert.match(adminUi, /\/api\/admin\/campaign-coins\/fund/);
  assert.match(adminUi, /\/api\/admin\/campaign-coins\/allocate/);
});

test("Render routes require the MFA-verified CreatorHub owner for all Admin Campaign Coins operations", () => {
  for (const route of [
    "if(method==='GET'&&p==='/api/admin/campaign-coins')",
    "if(method==='POST'&&p==='/api/admin/campaign-coins/fund')",
    "if(method==='POST'&&p==='/api/admin/campaign-coins/allocate')"
  ]) {
    const start = server.indexOf(route);
    assert.notEqual(start, -1, route + " route must exist");
    const next = server.indexOf("if(method===", start + route.length);
    const handler = server.slice(start, next === -1 ? server.length : next);
    assert.match(handler, /creatorhubcreatornetwork@gmail\.com/);
    assert.match(handler, /platform_owner/);
    assert.match(handler, /isModerator\(user,req\)/);
    assert.match(handler, /hasActiveReviewerSession\(user\)/);
    assert.match(handler, /requestSupabaseState\('economy_admin_campaign_/);
  }
});

test("Supabase runtime independently validates the designated owner and active platform-admin grant", () => {
  for (const action of [
    "economy_admin_campaign_wallet",
    "economy_admin_campaign_fund",
    "economy_admin_campaign_allocate"
  ]) assert.match(runtime, new RegExp('"' + action + '"'));
  const start = runtime.indexOf('if (["economy_admin_campaign_wallet"');
  const end = runtime.indexOf('if (action === "economy_marketing_budget")', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const handler = runtime.slice(start, end);
  assert.match(handler, /minglora_platform_staff/);
  assert.match(handler, /verification_status/);
  assert.match(handler, /verification_badge/);
  assert.match(handler, /admin_campaign_coins_get_wallet/);
  assert.match(handler, /admin_campaign_coins_fund/);
  assert.match(handler, /admin_campaign_coins_allocate/);
});

test("campaign allocations debit the new admin wallet and credit only the separate member promotional gift wallet", () => {
  const start = migration.indexOf("create or replace function public.admin_campaign_coins_allocate(");
  const end = migration.indexOf("revoke all on function public.admin_campaign_coins_authorized", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const handler = migration.slice(start, end);
  assert.match(handler, /admin_campaign_coins_wallets/);
  assert.match(handler, /admin_promotional_gift_wallets/);
  assert.match(handler, /for update/);
  assert.match(handler, /request_id/);
  assert.match(handler, /lifetime_allocated_coins/);
  assert.match(handler, /main_coin_wallet_touched', false/);
  assert.match(handler, /main_promotional_coins_touched', false/);
  assert.doesNotMatch(handler, /coin_wallets|minglora_credit_wallet_sources|minglora_admin_credit_member_coins/);
});

test("the campaign wallet has a hard one-trillion balance ceiling and private service-role-only access", () => {
  assert.match(migration, /max_balance_coins bigint not null default 1000000000000/);
  assert.match(migration, /available_coins <= max_balance_coins/);
  assert.match(migration, /alter table public\.admin_campaign_coins_wallets enable row level security/);
  assert.match(migration, /alter table public\.admin_campaign_coins_ledger enable row level security/);
  assert.match(migration, /grant execute on function public\.admin_campaign_coins_allocate[\s\S]*to service_role/);
  assert.match(migration, /revoke all on function public\.admin_campaign_coins_allocate[\s\S]*from public,anon,authenticated/);
});
