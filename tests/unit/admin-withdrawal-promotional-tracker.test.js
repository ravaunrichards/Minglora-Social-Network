import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtime, server, admin, adminCss, adminHtml] = await Promise.all([
  readFile(new URL("../../supabase/functions/minglora-runtime-state/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/server.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.css", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.html", import.meta.url), "utf8")
]);

test("owner earnings report includes every creator withdrawal with account and PayPal references", () => {
  assert.match(runtime, /creatorPayouts/);
  assert.match(runtime, /paypal_batch_id/);
  assert.match(runtime, /creator_payout_accounts/);
  assert.match(runtime, /payouts\.map/);
  assert.match(server, /\/api\/admin\/creator-earnings/);
  assert.match(server, /hasActiveReviewerSession/);
});

test("admin withdrawal tracker renders status totals, filtering and auto-refresh", () => {
  assert.match(admin, /All creator\/member withdrawal requests/);
  assert.match(admin, /admin-withdrawal-tracker-status/);
  assert.match(admin, /renderAdminWithdrawalTracker/);
  assert.match(admin, /15000/);
  assert.match(adminCss, /admin-withdrawal-tracker-row/);
  assert.match(adminHtml, /admin-withdrawal-promotional-tracker-1/);
});

test("promotional wallet, cash reserve and cash-backed gift activity stay separately visible", () => {
  for (const marker of [
    "admin_promotional_gift_wallets",
    "admin_promotional_gift_wallet_ledger",
    "minglora_promotional_gift_fund",
    "minglora_promotional_gift_fund_ledger",
    "minglora_promotional_gift_cash_backings"
  ]) assert.ok(runtime.includes(marker), `runtime missing ${marker}`);
  assert.match(runtime, /promotionalWalletTotals/);
  assert.match(runtime, /promotionalCashReserve/);
  assert.match(runtime, /promotionalCashBackings/);
  assert.match(admin, /Promotional Gift Wallet/);
  assert.match(admin, /main Coin wallet/);
  assert.match(admin, /cash-backed promotional gifts/i);
});

test("verified PayPal events remain the source of payout completion status", () => {
  assert.match(server, /verify-webhook-signature/);
  assert.match(server, /economy_payout_webhook/);
  assert.match(runtime, /PAYMENT\.PAYOUTS/);
});
