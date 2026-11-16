import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = fs.readFileSync(
  path.join(root, 'database/migrations/064_minglora_foreign_key_advisor_indexes.sql'),
  'utf8'
);

test('Supabase advisor foreign-key indexes are added without changing data or access policies', () => {
  const expected = [
    ['marketplace_application_review_alerts_application_user_id_idx', 'marketplace_application_review_alerts', 'application_user_id'],
    ['marketplace_business_identity_submissions_reviewed_by_idx', 'marketplace_business_identity_submissions', 'reviewed_by'],
    ['profile_verification_applications_reviewed_by_idx', 'profile_verification_applications', 'reviewed_by'],
    ['profile_verification_review_alerts_application_id_idx', 'profile_verification_review_alerts', 'application_id'],
    ['profile_verification_review_events_actor_id_idx', 'profile_verification_review_events', 'actor_id']
  ];
  for (const [index, table, column] of expected) {
    assert.match(migration, new RegExp('create index if not exists ' + index + '\\s+on public\\.' + table + '\\s*\\(' + column + '\\)', 'i'));
  }
  assert.equal((migration.match(/create index if not exists/gi) || []).length, 5);
  assert.doesNotMatch(migration, /drop index|drop table|delete from|truncate|alter policy|grant |revoke /i);
});
