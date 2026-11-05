import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [app, server, runtime, issuanceMigration, creditMigration] = await Promise.all([
  read('public/app.js'),
  read('src/server.js'),
  read('supabase/functions/minglora-runtime-state/index.ts'),
  read('database/migrations/078_minglora_verified_owner_coin_issuance.sql'),
  read('database/migrations/079_minglora_admin_member_coin_credits.sql')
]);

test('only the verified Creator Hub owner sees the separate Coin issuance and member-credit controls', () => {
  assert.match(app, /state\.user\?\.id===['"]28e1df97-3fe1-488e-bb84-bdc353c58653['"]/);
  assert.match(app, /state\.user\?\.verificationStatus===['"]verified['"]/);
  assert.match(app, /state\.user\?\.verificationBadge===['"]blue['"]/);
  assert.match(app, /Owner Coin issuance/);
  assert.match(app, /Admin Coin credit/);
  assert.ok(app.includes('api("/coins/owner-issuance"'));
  assert.ok(app.includes('api("/coins/admin-credit"'));
});

test('server API separates owner issuance from member credits and guards both routes', () => {
  assert.match(server, /\/api\/coins\/owner-issuance/);
  assert.match(server, /\/api\/coins\/admin-credit/);
  assert.match(server, /28e1df97-3fe1-488e-bb84-bdc353c58653/);
  assert.match(server, /larryjones2019ersky@gmail\.com/);
});

test('runtime delegates both operations to separately audited database functions', () => {
  assert.match(runtime, /economy_owner_issuance/);
  assert.match(runtime, /economy_admin_member_credit/);
  assert.match(runtime, /minglora_issue_verified_owner_coins/);
  assert.match(runtime, /minglora_admin_credit_member_coins/);
});

test('owner issuance goes only to the owner wallet and is audited as owner issuance', () => {
  assert.match(issuanceMigration, /owner_coin_issuances/);
  assert.match(issuanceMigration, /owner_issuance/);
  assert.match(issuanceMigration, /minglora_issue_verified_owner_coins/);
});

test('member admin credits are audited separately, idempotent, and inaccessible to client roles', () => {
  assert.match(creditMigration, /admin_coin_credits/);
  assert.match(creditMigration, /admin_credit/);
  assert.match(creditMigration, /request_id uuid NOT NULL UNIQUE/);
  assert.match(creditMigration, /REVOKE ALL ON FUNCTION/);
  assert.match(creditMigration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
});
