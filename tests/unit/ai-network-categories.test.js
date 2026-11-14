import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261114050000_minglora_ai_category_management.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('category administration uses private service-role-only RPC and audit table', () => {
  assert.match(migration, /create table if not exists ai_network\.ai_category_audit_logs/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table ai_network\.ai_category_audit_logs from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert on table ai_network\.ai_category_audit_logs to service_role/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /current_user <> 'service_role'/i);
  assert.match(migration, /revoke all on function public\.minglora_ai_category_command[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.minglora_ai_category_command[\s\S]*to service_role/i);
});

test('category keys stay stable and categories are deactivated rather than deleted', () => {
  assert.match(migration, /category_key text not null references ai_network\.ai_categories\(category_key\).*on delete restrict/i);
  assert.match(migration, /At least one AI category must remain active/i);
  assert.match(migration, /lock table ai_network\.ai_categories in share row exclusive mode/i);
  assert.equal(migration.toLowerCase().split('commit;').length, 2, 'The migration must contain exactly one transaction commit.');
  assert.ok(migration.startsWith('begin;') && migration.trimEnd().endsWith('commit;'), 'No SQL may be appended after the migration commit.');
  const writeLockIndex = migration.indexOf('lock table ai_network.ai_categories in share row exclusive mode');
  const categoryReadLockIndex = migration.indexOf('select c.*');
  assert.ok(writeLockIndex > 0 && categoryReadLockIndex > writeLockIndex, 'The write lock must be acquired before category state is read.');

  assert.doesNotMatch(migration, /delete\s+from\s+ai_network\.ai_categories/i);
  assert.match(ui, /Category keys remain stable because existing AI identities reference them/i);
});

test('category changes are audited and audit records are append-only for the runtime role', () => {
  assert.match(migration, /before_data jsonb/i);
  assert.match(migration, /after_data jsonb/i);
  assert.match(migration, /'created'[\s\S]*'updated'[\s\S]*'activated'[\s\S]*'deactivated'/i);
  assert.match(migration, /insert into ai_network\.ai_category_audit_logs/i);
  assert.doesNotMatch(migration, /grant\s+.*update.*ai_category_audit_logs/i);
  assert.doesNotMatch(migration, /grant\s+.*delete.*ai_category_audit_logs/i);
});

test('runtime gateway explicitly allowlists category list and save commands', () => {
  assert.match(runtime, /"ai_category_command"/);
  assert.match(runtime, /supportedCategoryCommands = \["list", "save"\]/);
  assert.match(runtime, /admin\.rpc\("minglora_ai_category_command"/);
});

test('authenticated API restricts category management to moderators and uses durable Supabase', () => {
  const start = server.indexOf("if (p === '/api/ai-network'");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  const route = server.slice(start, end);
  assert.match(route, /runAICategoryCommand/);
  assert.match(route, /isModerator\(user, req\)/);
  assert.match(route, /requestSupabaseState\('ai_category_command'/);
  assert.match(route, /sub === 'categories\/admin'/);
});

test('administrator UI can create, rename, order, reactivate and deactivate categories', () => {
  assert.match(ui, /data-ai-form="category"/);
  assert.match(ui, /data-ai-action="edit-category"/);
  assert.match(ui, /payload\.category_key = value\('categoryKey'\)\.toLowerCase\(\)/);
  assert.match(ui, /payload\.is_active = form\.querySelector\('\[name="isActive"\]'\)\.checked/);
  assert.match(ui, /request\('\/categories\/admin'\)/);
});
