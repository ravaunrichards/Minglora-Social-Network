import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261114050000_minglora_ai_category_administration.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('AI category administration is private, audited and preserves categories referenced by identities', () => {
  assert.match(migration, /create table if not exists ai_network\.ai_category_audit_logs/);
  assert.match(migration, /category_key text not null references ai_network\.ai_categories\(category_key\) on update cascade on delete restrict/);
  assert.match(migration, /alter table ai_network\.ai_category_audit_logs enable row level security/);
  assert.match(migration, /revoke all on table ai_network\.ai_category_audit_logs from public, anon, authenticated/);
  assert.match(migration, /grant select, insert on ai_network\.ai_category_audit_logs to service_role/);
  assert.match(migration, /grant select, insert, update on ai_network\.ai_categories to service_role/);
  assert.match(migration, /security invoker[\s\S]*set search_path = ''/);
  assert.match(migration, /current_user <> 'service_role'/);
  assert.match(migration, /valid signed-in Minglora administrator is required/);
  for (const action of ['list_all', 'create', 'update', 'activate', 'deactivate']) {
    assert.ok(migration.includes("'" + action + "'"), action + ' is supported by the database command');
  }
  assert.match(migration, /insert into ai_network\.ai_category_audit_logs/);
  assert.match(migration, /category_key is immutable|Category keys are immutable|category_key = v_category_key/);
  assert.doesNotMatch(migration, /delete from ai_network\.ai_categories/i);
  assert.match(migration, /is_active = v_is_active/);
  assert.match(migration, /lock table ai_network\.ai_categories in share row exclusive mode/);
  assert.match(migration, /At least one AI category must remain active/);
  assert.match(migration, /revoke all on table ai_network\.ai_categories from public, anon, authenticated/);
  assert.match(migration, /on update cascade on delete restrict/);
});

test('AI category command is allowlisted in the private Supabase runtime', () => {
  const start = runtime.indexOf('const supportedActions = [');
  const end = runtime.indexOf('];', start);
  assert.ok(start >= 0 && end > start);
  assert.ok(runtime.slice(start, end).includes('"ai_category_command"'));
  const handler = runtime.indexOf('if (action === "ai_category_command")');
  assert.ok(handler >= 0);
  const source = runtime.slice(handler, runtime.indexOf('if (action === "ai_identity_profile_list")', handler));
  for (const action of ['list_all', 'create', 'update', 'activate', 'deactivate']) {
    assert.ok(source.includes('"' + action + '"'));
  }
  assert.ok(source.includes('admin.rpc("minglora_ai_category_command"'));
  assert.ok(source.includes('validUuid(actorUserId)'));
});

test('AI category management API checks moderator authorization before private RPC calls', () => {
  const start = server.indexOf("if (p === '/api/ai-network'");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  assert.ok(start >= 0 && end > start);
  const api = server.slice(start, end);
  const helper = api.indexOf('const runAICategoryCommand = async');
  const guard = api.indexOf('if (!isModerator(user, req))', helper);
  const rpc = api.indexOf("requestSupabaseState('ai_category_command'", helper);
  assert.ok(helper >= 0 && guard > helper && rpc > guard);
  assert.match(server, /method === 'GET' && sub === 'categories\/manage'/);
  assert.match(server, /method === 'POST' && sub === 'categories\/manage'/);
  assert.match(server, /platform administrator with the required active session/);
});

test('AI category management UI exposes create/edit/deactivate but not destructive deletion', () => {
  assert.match(ui, /function renderAICategoryManagement\(\)/);
  assert.match(ui, /data-ai-form="category-create"/);
  assert.match(ui, /data-ai-form="category-update"/);
  assert.match(ui, /request\('\/categories\/manage'\)/);
  assert.match(ui, /payload\.action = 'create'/);
  assert.match(ui, /payload\.action = 'update'/);
  assert.match(ui, /The permanent category key cannot be renamed/);
  assert.match(ui, /Deactivation keeps historical identities intact/);
  assert.doesNotMatch(ui, /data-ai-action="category-delete"/);
});
