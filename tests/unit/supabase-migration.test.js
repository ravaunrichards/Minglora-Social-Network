import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readMigration = name => fs.readFileSync(path.join(root, 'database/migrations', name), 'utf8');

const authProfileSql = readMigration('004_supabase_auth_profiles.sql');

test('historical Supabase profile migration remains a complete transaction', () => {
  assert.equal((authProfileSql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((authProfileSql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.match(authProfileSql, /CREATE OR REPLACE FUNCTION private\.handle_new_minglora_user\(\)/);
  assert.match(authProfileSql, /AFTER INSERT ON auth\.users/);
  assert.match(authProfileSql, /ALTER TABLE public\.profiles ENABLE ROW LEVEL SECURITY/);
});

test('the production relational migration uses Supabase Auth as the only identity source', () => {
  const sql = readMigration('005_minglora_supabase_relational_platform.sql');
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.match(sql, /id uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.handle_new_minglora_user\(\)/);
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS users\s*\(/i);
  assert.doesNotMatch(sql, /password_hash/i);
  assert.match(sql, /ALTER TABLE public\.minglora_runtime_state ENABLE ROW LEVEL SECURITY/);
});

test('Minglora database hardening migrations are complete and ordered', () => {
  const migrations = [
    '006_minglora_database_hardening.sql',
    '007_minglora_authorization_and_live_integrity.sql',
    '008_minglora_live_policy_consolidation.sql',
    '009_minglora_runtime_database_role.sql',
    '010_minglora_rls_and_write_privilege_hardening.sql',
    '011_minglora_private_rls_authorization_helpers.sql',
    '012_minglora_group_rls_cycle_break.sql',
    '013_minglora_runtime_role_login_lock.sql'
  ];
  for (const filename of migrations) {
    const sql = readMigration(filename);
    assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1, filename);
    assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1, filename);
  }
});

test('runtime role is least privilege and cannot log in before its credential is provisioned', () => {
  const role = readMigration('009_minglora_runtime_database_role.sql');
  const lock = readMigration('013_minglora_runtime_role_login_lock.sql');
  assert.match(role, /CREATE ROLE minglora_runtime LOGIN/);
  assert.match(role, /NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT/);
  assert.match(role, /GRANT SELECT, INSERT, UPDATE\s+ON TABLE public\.minglora_runtime_state TO minglora_runtime/);
  assert.match(lock, /ALTER ROLE minglora_runtime NOLOGIN/);
});

test('RLS helper functions stay private and do not expose table data', () => {
  const sql = readMigration('011_minglora_private_rls_authorization_helpers.sql')
    + readMigration('012_minglora_group_rls_cycle_break.sql');
  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.is_minglora_group_owner/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.is_minglora_group_member/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.is_minglora_conversation_creator/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.is_minglora_call_creator/);
  assert.match(sql, /SET search_path = ''/);
});

test('client write hardening reserves provider and moderation state', () => {
  const sql = readMigration('010_minglora_rls_and_write_privilege_hardening.sql');
  assert.match(sql, /REVOKE INSERT, UPDATE ON public\.media_assets FROM authenticated/);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.reports FROM authenticated/);
  assert.match(sql, /minglora_conversation_members_add/);
  assert.match(sql, /minglora_live_participants_insert/);
});
