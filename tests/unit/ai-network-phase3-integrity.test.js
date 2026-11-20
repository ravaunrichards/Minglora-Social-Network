import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20261120052603_minglora_ai_identity_phase3_integrity.sql'),
  'utf8'
);
const rollback = readFileSync(
  resolve(root, 'database/rollbacks/20261120052603_minglora_ai_identity_phase3_integrity.rollback.sql'),
  'utf8'
);
const fkIndexMigration = readFileSync(
  resolve(root, 'supabase/migrations/20261120052647_minglora_ai_email_messages_email_fk_index.sql'),
  'utf8'
);
const fkIndexRollback = readFileSync(
  resolve(root, 'database/rollbacks/20261120052647_minglora_ai_email_messages_email_fk_index.rollback.sql'),
  'utf8'
);

test('Phase 3 identity migration is additive and refuses unknown ownership', () => {
  assert.match(migration, /if exists\s*\([\s\S]*owner_user_id is null[\s\S]*\)[\s\S]*raise exception/i);
  assert.match(migration, /alter column owner_user_id set not null/i);
  assert.doesNotMatch(migration, /\bdrop table\b|\bdelete\s+from\b|\btruncate\s+table\b/i);
  assert.doesNotMatch(migration, /insert\s+into\s+ai_network\.ai_identities/i);
});

test('identity cannot be physically deleted by the runtime and history is append-only', () => {
  assert.match(migration, /revoke delete, truncate[\s\S]*ai_network\.ai_identities[\s\S]*from service_role/i);
  assert.match(migration, /revoke update, delete, truncate[\s\S]*ai_identity_status_history[\s\S]*ai_identity_versions[\s\S]*ai_identity_audit_logs[\s\S]*from service_role/i);
  for (const table of ['ai_identity_status_history', 'ai_identity_versions', 'ai_identity_audit_logs']) {
    assert.ok(migration.includes(`alter table ai_network.${table}`));
  }
  assert.equal((migration.match(/on delete restrict/gi) || []).length, 3);
});

test('manual rollback documents and restores the previous constraints/privileges', () => {
  assert.match(rollback, /operator-reviewed only/i);
  assert.equal((rollback.match(/on delete cascade/gi) || []).length, 3);
  assert.match(rollback, /alter column owner_user_id drop not null/i);
  assert.match(rollback, /grant all privileges[\s\S]*to service_role/i);
});

test('Phase 3 closes the outstanding AI email-message foreign-key index gap', () => {
  assert.match(fkIndexMigration, /create index if not exists ai_email_messages_email_id_idx/i);
  assert.match(fkIndexMigration, /on ai_network\.ai_email_messages\s*\(email_id\)/i);
  assert.match(fkIndexRollback, /drop index if exists ai_network\.ai_email_messages_email_id_idx/i);
});
