import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261114234000_minglora_ai_hr_training_and_attendance.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('AI HR training and attendance records are additive, private and service-role only', () => {
  for (const table of [
    'ai_training_programs',
    'ai_training_enrollments',
    'ai_attendance_records',
    'ai_hr_workforce_events'
  ]) {
    assert.ok(migration.includes('create table if not exists ai_network.' + table), 'Missing table ' + table);
    assert.ok(migration.includes('alter table ai_network.' + table + ' enable row level security'), 'RLS missing for ' + table);
    assert.ok(migration.includes(' to service_role'), 'Service role grant missing');
  }
  assert.ok(migration.includes('security invoker'));
  assert.ok(migration.includes("current_user <> 'service_role'"));
  assert.ok(migration.includes("set search_path = ''"));
  assert.ok(migration.includes('revoke all on function public.minglora_ai_hr_workforce_command'));
  assert.ok(migration.includes('from public,anon,authenticated'));
  assert.ok(migration.includes('grant execute on function public.minglora_ai_hr_workforce_command'));
  assert.ok(migration.includes('to service_role'));
  assert.ok(!migration.includes('grant usage on schema ai_network to anon'));
  assert.ok(!migration.includes('grant usage on schema ai_network to authenticated'));
  assert.ok(!migration.includes('insert into auth.users'));
});

test('training programs and assignments are owner-scoped and retry-safe', () => {
  for (const token of [
    'owner_user_id uuid not null references public.profiles(id)',
    'ai_training_programs_idempotency_uq',
    'ai_training_enrollments_idempotency_uq',
    'ai_training_enrollments_program_employee_uq',
    "v_action='create_training_program'",
    "v_action='assign_training'",
    "v_action='update_training_enrollment'",
    "e.employment_status in ('onboarding','active')",
    "p.program_status='active'",
    "v_previous_status='assigned'",
    "v_previous_status='in_progress'",
    "v_status='completed'",
    "progress_percent=v_progress",
    "completed_by_user_id=case when v_status='completed' then p_actor_user_id"
  ]) assert.ok(migration.includes(token), 'Missing training invariant: ' + token);
});

test('attendance is human-recorded, bounded, reviewed and audited', () => {
  for (const token of [
    "record_type in ('availability','shift','leave','absence')",
    "record_status in ('submitted','approved','rejected','recorded','cancelled')",
    'ends_at timestamptz not null',
    'check (ends_at > starts_at)',
    "v_action='record_attendance'",
    "v_action='review_attendance'",
    "v_status not in ('availability','shift','leave','absence')",
    "a.record_status='submitted'",
    'reviewed_by_user_id=p_actor_user_id',
    "'attendance_submitted'",
    "'attendance_'||v_status"
  ]) assert.ok(migration.includes(token), 'Missing attendance invariant: ' + token);
  assert.ok(migration.includes('No automatic presence inference'));
  assert.ok(!migration.includes('now() into starts_at'));
});

test('private runtime gateway exposes only the AI HR workforce allowlist', () => {
  for (const token of [
    'if (action === "ai_hr_workforce_command")',
    '"list_training_programs"',
    '"create_training_program"',
    '"set_training_program_status"',
    '"list_training_enrollments"',
    '"assign_training"',
    '"update_training_enrollment"',
    '"list_attendance"',
    '"record_attendance"',
    '"review_attendance"',
    'admin.rpc("minglora_ai_hr_workforce_command"'
  ]) assert.ok(runtime.includes(token), 'Missing runtime gateway element: ' + token);
});

test('workforce HTTP endpoints require platform staff and use private Supabase runtime', () => {
  const start = server.indexOf("if (p === '/api/ai-network'");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  const route = server.slice(start, end);
  for (const token of [
    'const runAIHRWorkforceCommand = async',
    "isModerator(user, req)",
    "requestSupabaseState('ai_hr_workforce_command'",
    "'training-programs', 'training-enrollments', 'attendance'",
    "'list_training_programs'",
    "'assign_training'",
    "'record_attendance'",
    "'review_attendance'"
  ]) assert.ok(route.includes(token), 'Missing protected workforce route element: ' + token);
});

test('HR workspace exposes owner-admin training, progress and attendance controls', () => {
  for (const token of [
    "request(base + '/training-programs')",
    "request(base + '/training-enrollments')",
    "request(base + '/attendance')",
    'data-ai-form="training-program"',
    'data-ai-form="training-assignment"',
    'data-ai-form="training-enrollment-status"',
    'data-ai-form="attendance-entry"',
    'data-ai-form="attendance-review"',
    'trainingPrograms: list(trainingProgramResult.training_programs)',
    'attendanceRecords: list(attendanceResult.attendance_records)',
    'localDateTimeInZoneToIso',
    "America/Jamaica",
    "'human-recorded'"
  ]) assert.ok(ui.includes(token), 'Missing HR workforce UI element: ' + token);
});
