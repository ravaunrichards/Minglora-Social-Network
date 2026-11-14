import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(resolve(root, 'supabase/migrations/20261114070000_minglora_ai_network_foreign_key_indexes.sql'), 'utf8');

const expected = [
  {
    "name": "ai_departments_created_by_user_id_idx",
    "table": "ai_departments",
    "columns": "created_by_user_id"
  },
  {
    "name": "ai_departments_department_key_idx",
    "table": "ai_departments",
    "columns": "department_key"
  },
  {
    "name": "ai_departments_parent_department_idx",
    "table": "ai_departments",
    "columns": "organization_id, parent_department_id"
  },
  {
    "name": "ai_employment_history_actor_identity_id_idx",
    "table": "ai_employment_history",
    "columns": "actor_identity_id"
  },
  {
    "name": "ai_employment_history_actor_user_id_idx",
    "table": "ai_employment_history",
    "columns": "actor_user_id"
  },
  {
    "name": "ai_employment_history_org_employment_idx",
    "table": "ai_employment_history",
    "columns": "organization_id, employment_id"
  },
  {
    "name": "ai_employment_records_application_idx",
    "table": "ai_employment_records",
    "columns": "organization_id, application_id"
  },
  {
    "name": "ai_employment_records_assigned_by_user_id_idx",
    "table": "ai_employment_records",
    "columns": "assigned_by_user_id"
  },
  {
    "name": "ai_employment_records_manager_idx",
    "table": "ai_employment_records",
    "columns": "organization_id, manager_employment_id"
  },
  {
    "name": "ai_employment_records_position_idx",
    "table": "ai_employment_records",
    "columns": "organization_id, position_id"
  },
  {
    "name": "ai_employment_records_replaces_idx",
    "table": "ai_employment_records",
    "columns": "organization_id, replaces_employment_id"
  },
  {
    "name": "ai_identity_follows_reviewed_by_user_id_idx",
    "table": "ai_identity_follows",
    "columns": "reviewed_by_user_id"
  },
  {
    "name": "ai_organizations_created_by_user_id_idx",
    "table": "ai_organizations",
    "columns": "created_by_user_id"
  },
  {
    "name": "ai_positions_created_by_user_id_idx",
    "table": "ai_positions",
    "columns": "created_by_user_id"
  },
  {
    "name": "ai_positions_position_key_idx",
    "table": "ai_positions",
    "columns": "position_key"
  },
  {
    "name": "ai_provider_assignment_history_actor_user_id_idx",
    "table": "ai_provider_assignment_history",
    "columns": "actor_user_id"
  },
  {
    "name": "ai_recruitment_applications_vacancy_idx",
    "table": "ai_recruitment_applications",
    "columns": "organization_id, vacancy_id"
  },
  {
    "name": "ai_recruitment_applications_reviewed_by_user_id_idx",
    "table": "ai_recruitment_applications",
    "columns": "reviewed_by_user_id"
  },
  {
    "name": "ai_recruitment_applications_submitted_by_user_id_idx",
    "table": "ai_recruitment_applications",
    "columns": "submitted_by_user_id"
  },
  {
    "name": "ai_recruitment_history_actor_user_id_idx",
    "table": "ai_recruitment_history",
    "columns": "actor_user_id"
  },
  {
    "name": "ai_recruitment_history_application_idx",
    "table": "ai_recruitment_history",
    "columns": "organization_id, application_id"
  },
  {
    "name": "ai_recruitment_history_vacancy_idx",
    "table": "ai_recruitment_history",
    "columns": "organization_id, vacancy_id"
  },
  {
    "name": "ai_recruitment_vacancies_created_by_user_id_idx",
    "table": "ai_recruitment_vacancies",
    "columns": "created_by_user_id"
  },
  {
    "name": "ai_recruitment_vacancies_department_idx",
    "table": "ai_recruitment_vacancies",
    "columns": "organization_id, department_id"
  },
  {
    "name": "ai_recruitment_vacancies_position_idx",
    "table": "ai_recruitment_vacancies",
    "columns": "organization_id, position_id"
  },
  {
    "name": "ai_task_approvals_owner_task_idx",
    "table": "ai_task_approvals",
    "columns": "owner_user_id, task_id"
  },
  {
    "name": "ai_task_approvals_reviewed_by_user_id_idx",
    "table": "ai_task_approvals",
    "columns": "reviewed_by_user_id"
  },
  {
    "name": "ai_task_events_actor_user_id_idx",
    "table": "ai_task_events",
    "columns": "actor_user_id"
  },
  {
    "name": "ai_task_queue_approved_by_user_id_idx",
    "table": "ai_task_queue",
    "columns": "approved_by_user_id"
  },
  {
    "name": "ai_task_queue_created_by_user_id_idx",
    "table": "ai_task_queue",
    "columns": "created_by_user_id"
  },
  {
    "name": "ai_task_queue_organization_id_idx",
    "table": "ai_task_queue",
    "columns": "organization_id"
  }
];

test('AI Network migration covers all 31 audited missing foreign-key indexes', () => {
  for (const index of expected) {
    const statement = 'create index if not exists ' + index.name + '\\n' +
      '  on ai_network.' + index.table + ' (' + index.columns + ');';
    assert.ok(migration.includes(statement), 'Missing or incorrectly ordered index: ' + index.name);
  }
  const statements = migration.split('\\n').filter(line => line.trim().toLowerCase().startsWith('create index if not exists '));
  assert.equal(statements.length, expected.length);
});

test('AI Network index migration is additive, retry-safe and does not alter permissions or data', () => {
  const lower = migration.toLowerCase();
  assert.equal((lower.match(/create index if not exists /g) || []).length, 31);
  for (const forbidden of ['drop table','drop index','drop schema','truncate','delete from','update ai_network','alter table','grant ','revoke ','create policy']) {
    assert.equal(lower.includes(forbidden), false, 'Unexpected destructive or security-changing SQL: ' + forbidden);
  }
});

test('all composite foreign-key indexes lead with every FK column in declared order', () => {
  const composite = expected.filter(index => index.columns.includes(', '));
  assert.equal(composite.length, 12);
  for (const index of composite) {
    const statement = 'on ai_network.' + index.table + ' (' + index.columns + ')';
    assert.ok(migration.includes(statement), 'Composite FK index is incomplete or out of order: ' + index.name);
  }
});
