import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const adminUi = readFileSync(path.join(root, "public/admin-centre.js"), "utf8");
const server = readFileSync(path.join(root, "src/server.js"), "utf8");
const runtime = readFileSync(path.join(root, "supabase/functions/minglora-runtime-state/index.ts"), "utf8");

test("Admin Control Centre loads recipient options from the protected member-search endpoint", () => {
  assert.match(adminUi, /admin-member-promotion-recipient/);
  assert.match(adminUi, /\/api\/admin\/coins\/member-promotions\/members\?search=/);
  assert.match(adminUi, /result\.members/);
  assert.match(adminUi, /member\.username/);
  assert.match(adminUi, /member\.displayName/);
  assert.match(adminUi, /No matching members found/);
});

test("the protected member-search route forwards the signed-in administrator and search term", () => {
  const start = server.indexOf("if(method==='GET'&&p==='/api/admin/coins/member-promotions/members')");
  assert.notEqual(start, -1, "member-search route must exist");
  const end = server.indexOf("if(method==='GET'&&p==='/api/admin/marketing/budget')", start);
  assert.notEqual(end, -1, "member-search route must end before the marketing budget route");
  const handler = server.slice(start, end);
  assert.match(handler, /hasActiveReviewerSession\(user\)/);
  assert.match(handler, /economy_admin_member_search/);
  assert.match(handler, /adminUserId:user\.id/);
  assert.match(handler, /adminEmail/);
  assert.match(handler, /search/);
});

test("Supabase runtime authorizes and returns real profiles for promotional recipients", () => {
  assert.match(runtime, /"economy_admin_member_search"/, "member-search action must be allow-listed");
  const start = runtime.indexOf('if (action === "economy_admin_member_search")');
  assert.notEqual(start, -1, "Supabase member-search handler must exist");
  const end = runtime.indexOf('if (action === "economy_owner_issuance")', start);
  assert.notEqual(end, -1, "member-search handler must end before owner issuance");
  const handler = runtime.slice(start, end);
  assert.match(handler, /minglora_platform_staff/);
  assert.match(handler, /verification_status/);
  assert.match(handler, /verification_badge/);
  assert.match(handler, /from\("profiles"\)/);
  assert.match(handler, /ilike\("username"/);
  assert.match(handler, /ilike\("display_name"/);
  assert.match(handler, /joinedAt/);
  assert.doesNotMatch(handler, /from\("coin_wallets"\)|minglora_admin_credit_member_coins|minglora_credit_wallet_sources/);
});
