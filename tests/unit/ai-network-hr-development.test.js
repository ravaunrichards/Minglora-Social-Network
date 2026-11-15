import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261115030000_minglora_ai_hr_training_attendance.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('HR training and attendance tables are additive, RLS-enabled and server-role only', () => {
  for (const table of ['ai_training_courses','ai_training_course_history','ai_training_enrollments','ai_training_enrollment_history','ai_employee_attendance','ai_employee_attendance_history']) {
    assert.ok(migration.includes('create table if not exists ai_network.' + table));
    assert.ok(migration.includes('alter table ai_network.' + table + ' enable row level security'));
  }
  assert.match(migration,/revoke all on table[\s\S]*from public,anon,authenticated/);
  assert.match(migration,/grant select,insert on ai_network\.ai_training_course_history to service_role/);
  assert.match(migration,/grant select,insert on ai_network\.ai_training_enrollment_history to service_role/);
  assert.match(migration,/grant select,insert on ai_network\.ai_employee_attendance_history to service_role/);
  assert.match(migration,/security invoker/i);
  assert.match(migration,/current_user <> 'service_role'/);
  assert.match(migration,/set search_path = ''/);
  assert.match(migration,/revoke all on function public\.minglora_ai_hr_development_command[\s\S]*from public,anon,authenticated/);
  assert.match(migration,/grant execute on function public\.minglora_ai_hr_development_command[\s\S]*to service_role/);
  assert.doesNotMatch(migration,/insert into auth\.users/i);
});

test('training courses start as drafts and require publication before assignment', () => {
  assert.match(migration,/course_status text not null default 'draft'/);
  assert.match(migration,/course_status='published'/);
  assert.match(migration,/Only published courses can be assigned/);
  assert.match(migration,/learning_objectives jsonb/);
  assert.match(migration,/required_training boolean/);
});

test('training assignment and lifecycle use idempotency, bounded transitions and history', () => {
  for (const token of ['unique (organization_id,course_id,employment_id)','ai_training_enrollments_org_idempotency_uq',
    "'training_assigned'","'training_started'","'training_completed'","'training_waived'","'training_cancelled'",
    "v_previous='assigned' and v_status in ('in_progress','completed','waived','cancelled')",
    "v_previous='in_progress' and v_status in ('completed','waived','cancelled')",
    'A reason of at least ten characters is required to waive or cancel training',
    'Record a completion note or score before completing training']) {
    assert.ok(migration.includes(token),'Missing training invariant: '+token);
  }
});

test('attendance is human-recorded, date constrained, idempotent and corrected with reasoned history', () => {
  for (const token of ["attendance_status in ('present','late','absent','excused','on_leave')",
    'unique (organization_id,employment_id,attendance_date)','ai_employee_attendance_org_idempotency_uq',
    "'attendance_recorded'","'attendance_corrected'",'Attendance cannot be recorded for a future date',
    'Attendance can only be recorded for current onboarding, active or restricted employees',
    'A correction reason of at least ten characters is required','attendance_date=v_att_date']) {
    assert.ok(migration.includes(token),'Missing attendance invariant: '+token);
  }
  assert.match(migration,/recorded_by_user_id uuid not null references public\.profiles\(id\)/);
  assert.doesNotMatch(migration,/update ai_network\.ai_task_runtime_controls/i);
});

test('private Edge Function exposes an explicit HR development command allowlist', () => {
  for (const token of ['"ai_hr_development_command"','"list_training_courses"','"create_training_course"',
    '"set_training_course_status"','"list_training_enrollments"','"assign_training"',
    '"set_training_enrollment_status"','"list_attendance"','"record_attendance"',
    'admin.rpc("minglora_ai_hr_development_command"','validUuid(String(payload.organization_id || ""))']) {
    assert.ok(runtime.includes(token),'Missing private runtime action: '+token);
  }
});

test('HR development endpoints and admin workspace are connected to persistence', () => {
  for (const token of ['const runAIHRDevelopmentCommand = async',"requestSupabaseState('ai_hr_development_command'",
    "['training-courses', 'training-enrollments', 'attendance']",'isModerator(user, req)']) {
    assert.ok(server.includes(token),'Missing authenticated server route: '+token);
  }
  for (const token of ["request(base + '/training-courses')","request(base + '/training-enrollments')","request(base + '/attendance')",
    'data-ai-form="training-course"','data-ai-form="training-enrollment"','data-ai-form="training-enrollment-status"',
    'data-ai-form="attendance"',"kind === 'training-course'","kind === 'training-enrollment'","kind === 'attendance'",
    'No employee training assignments have been made','No attendance records have been entered']) {
    assert.ok(ui.includes(token),'Missing HR training/attendance UI: '+token);
  }
});
