import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(resolve(
  root,
  'supabase/migrations/20261114205000_minglora_ai_network_late_foreign_key_indexes.sql'
), 'utf8');

const expected = [
  ['ai_fk_ai_delegation_events_actor_identity_id_idx','ai_delegation_events','actor_identity_id'],
  ['ai_fk_ai_delegation_events_actor_user_id_idx','ai_delegation_events','actor_user_id'],
  ['ai_fk_ai_delegation_events_delegation_grant_id_idx','ai_delegation_events','delegation_grant_id'],
  ['ai_fk_ai_delegation_grants_created_by_user_id_idx','ai_delegation_grants','created_by_user_id'],
  ['ai_fk_ai_delegation_grants_grantee_identity_id_idx','ai_delegation_grants','grantee_identity_id'],
  ['ai_fk_ai_delegation_grants_grantor_identity_id_idx','ai_delegation_grants','grantor_identity_id'],
  ['ai_fk_ai_identity_locations_identity_id_idx','ai_identity_locations','identity_id'],
  ['ai_fk_ai_identity_owners_identity_id_idx','ai_identity_owners','identity_id'],
  ['ai_fk_ai_memory_entries_identity_id_idx','ai_memory_entries','identity_id'],
  ['ai_fk_ai_recruitment_vacancies_owner_user_id_idx','ai_recruitment_vacancies','owner_user_id'],
  ['ai_fk_ai_task_queue_delegated_from_identity_id_idx','ai_task_queue','delegated_from_identity_id'],
  ['ai_fk_ai_task_queue_delegation_grant_id_idx','ai_task_queue','delegation_grant_id'],
  ['ai_fk_ai_task_schedule_events_actor_user_id_idx','ai_task_schedule_events','actor_user_id'],
  ['ai_fk_ai_task_schedule_events_schedule_id_idx','ai_task_schedule_events','schedule_id'],
  ['ai_fk_ai_task_schedule_events_task_id_idx','ai_task_schedule_events','task_id'],
  ['ai_fk_ai_task_schedules_created_by_user_id_idx','ai_task_schedules','created_by_user_id'],
  ['ai_fk_ai_task_schedules_identity_id_idx','ai_task_schedules','identity_id'],
  ['ai_fk_ai_task_schedules_last_enqueued_task_id_idx','ai_task_schedules','last_enqueued_task_id'],
  ['ai_fk_ai_team_events_actor_user_id_idx','ai_team_events','actor_user_id'],
  ['ai_fk_ai_team_events_identity_id_idx','ai_team_events','identity_id'],
  ['ai_fk_ai_team_events_team_id_idx','ai_team_events','team_id'],
  ['ai_fk_ai_team_memberships_added_by_user_id_idx','ai_team_memberships','added_by_user_id'],
  ['ai_fk_ai_teams_created_by_user_id_idx','ai_teams','created_by_user_id'],
  ['ai_fk_ai_teams_organization_id_idx','ai_teams','organization_id']
];

test('late AI Network migration covers all 24 newly missing foreign-key indexes', () => {
  for (const [name, table, column] of expected) {
    const statement = [
      'CREATE INDEX IF NOT EXISTS ' + name,
      '  ON ai_network.' + table + ' (' + column + ');'
    ].join(String.fromCharCode(10));
    assert.ok(migration.includes(statement), 'Missing or incorrect index: ' + name);
  }
  const statements = migration.match(/CREATE INDEX IF NOT EXISTS /g) || [];
  assert.equal(statements.length, expected.length);
});

test('late AI Network index migration is additive and retry-safe', () => {
  const lower = migration.toLowerCase();
  assert.equal((lower.match(/create index if not exists /g) || []).length, 24);
  for (const forbidden of [
    'drop table', 'drop index', 'drop schema', 'truncate', 'delete from',
    'update ai_network', 'alter table', 'grant ', 'revoke ', 'create policy',
    'global_paused = false', 'execution_enabled = true'
  ]) {
    assert.equal(lower.includes(forbidden), false, 'Unexpected schema, data or runtime change: ' + forbidden);
  }
  assert.ok(migration.includes('24 additional child-side foreign-key indexes'));
});
