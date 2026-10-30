import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sql = fs.readFileSync(path.join(root, 'database/migrations/004_supabase_auth_profiles.sql'), 'utf8');

test('Minglora Supabase profile migration has one complete transaction', () => {
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.doesNotMatch(sql, /\^\[a-z0-9_\]\{3,30\}\n/);
});

test('Minglora profile auth trigger is complete and uses private schema', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.handle_new_minglora_user\(\)/);
  assert.match(sql, /EXECUTE FUNCTION private\.handle_new_minglora_user\(\)/);
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS private/);
  assert.match(sql, /AFTER INSERT ON auth\.users/);
  assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
});

test('Minglora profiles are protected by row-level security and user ownership', () => {
  assert.match(sql, /ALTER TABLE public\.profiles ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /TO authenticated\s+USING \(\(select auth\.uid\(\)\) = id\)\s+WITH CHECK \(\(select auth\.uid\(\)\) = id\)/);
  assert.match(sql, /GRANT SELECT ON public\.profiles TO anon, authenticated/);
  assert.doesNotMatch(sql, /GRANT ALL ON public\.profiles/);
});
