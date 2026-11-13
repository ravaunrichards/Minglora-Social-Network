import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261113131000_minglora_ai_hr_recruitment_and_employment_workflows.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('recruitment and employment records remain private and service-role only', () => {
  for (const table of ['ai_recruitment_vacancies','ai_recruitment_applications','ai_recruitment_history']) {
    assert.ok(migration.includes('create table if not exists ai_network.' + table));
    assert.ok(migration.includes('alter table ai_network.' + table + ' enable row level security'));
    assert.ok(migration.includes('on ai_network.' + table + ' to service_role'));
  }
  assert.ok(migration.includes('security invoker'));
  assert.ok(migration.includes("current_user <> 'service_role'"));
  assert.ok(migration.includes('revoke all on function public.minglora_ai_hr_command'));
  assert.ok(migration.includes('from public, anon, authenticated'));
  assert.ok(migration.includes('grant execute on function public.minglora_ai_hr_command'));
  assert.ok(migration.includes('to service_role'));
  assert.ok(!migration.includes('grant usage on schema ai_network to public'));
  assert.ok(!migration.includes('grant usage on schema ai_network to anon'));
  assert.ok(!migration.includes('grant usage on schema ai_network to authenticated'));
});

test('vacancies and applications are owner-scoped, bounded and duplicate-safe', () => {
  for (const token of [
    'owner_user_id uuid not null references public.profiles(id)',
    'ai_recruitment_vacancies_owner_idempotency_uq',
    'ai_recruitment_applications_idempotency_uq',
    'unique (vacancy_id, identity_id)',
    'openings between 1 and 1000',
    'jsonb_array_length(v_requirements)>50',
    "o.owner_type='human_user'",
    "i.status not in ('suspended','archived','retired')",
    'o.organization_id=v_organization_id and o.owner_user_id=p_actor_user_id'
  ]) assert.ok(migration.includes(token), 'Missing HR invariant: ' + token);
});

test('appointments require approved applications and preserve employment history', () => {
  for (const token of [
    "a.application_status='approved'",
    'employment_status,employment_type,job_description,workload_percentage',
    "'onboarding'",
    'ai_employment_records_one_current_role_uq',
    'ai_employment_records_application_uq',
    'ai_employment_records_org_idempotency_uq',
    "application_status='appointed'",
    'candidate_appointed',
    'ai_recruitment_history'
  ]) assert.ok(migration.includes(token), 'Missing appointment invariant: ' + token);
});

test('employment lifecycle uses explicit transitions and required reason history', () => {
  for (const token of [
    "v_previous_status='onboarding' and v_status in ('active','suspended','terminated')",
    "v_previous_status='active' and v_status in ('restricted','suspended','terminated','retired')",
    'A reason of at least three characters is required',
    'employment_status=v_status',
    'status_changed'
  ]) assert.ok(migration.includes(token), 'Missing lifecycle rule: ' + token);
});

test('manager assignment enforces hierarchy and rejects reporting cycles', () => {
  for (const token of [
    'v_manager_rank<=v_rank',
    'with recursive chain(employment_id,manager_employment_id,path,cycle)',
    'Reporting changes cannot create a managerial cycle',
    'previous_manager_employment_id'
  ]) assert.ok(migration.includes(token), 'Missing manager invariant: ' + token);
});

test('transfers preserve history, prevent cycles and are retry safe', () => {
  for (const token of [
    'replaces_employment_id uuid',
    'ai_employment_records_single_replacement_uq',
    'ai_employment_records_replaces_fk',
    'e.replaces_employment_id=v_employment_id',
    "employment_status='transferred',end_date=current_date",
    "'transfer_received'",
    'Transfer reporting changes cannot create a managerial cycle'
  ]) assert.ok(migration.includes(token), 'Missing transfer invariant: ' + token);
});

test('Edge Function exposes only the explicit HR command allowlist', () => {
  for (const token of [
    'if (action === "ai_hr_command")',
    'supportedHRCommands',
    '"create_vacancy"',
    '"set_vacancy_status"',
    '"create_application"',
    '"review_application"',
    '"appoint_employee"',
    '"list_employees"',
    '"transition_employment"',
    '"set_employment_manager"',
    '"transfer_employee"',
    'admin.rpc("minglora_ai_hr_command"',
    'validUuid(String(payload.organization_id || ""))'
  ]) assert.ok(runtime.includes(token), 'Missing runtime allowlist item: ' + token);
});

test('HR API routes require authorized platform staff and route through Supabase', () => {
  const start = server.indexOf("if (p === '/api/ai-network'");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  const route = server.slice(start, end);
  for (const token of [
    'const runAIHRCommand = async',
    'isModerator(user, req)',
    "requestSupabaseState('ai_hr_command'",
    "'vacancies'",
    "'applications'",
    "'employees'",
    "'create_vacancy'",
    "'review_application'",
    "'appoint_employee'",
    "'transition_employment'",
    "'set_employment_manager'",
    "'transfer_employee'",
    'The AI recruitment and workforce migration and runtime gateway must be deployed',
    'No HR data was changed'
  ]) assert.ok(route.includes(token), 'Missing secure HR route element: ' + token);
});

test('HR workspace uses database-backed identity, department, position and workforce records', () => {
  for (const token of [
    'async function loadAIOrganizationRegistry',
    "request(base + '/vacancies')",
    "request(base + '/applications')",
    "request(base + '/employees')",
    'request(\'/identities?limit=100\')',
    'identityRecords.map',
    'departmentOptions',
    'positionOptions',
    'identityOptions.length',
    'data-ai-form="vacancy"',
    'data-ai-form="application"',
    'data-ai-form="appointment"',
    'data-ai-form="employment-transfer"',
    'No AI employees have been appointed',
    'No recruitment vacancies have been created'
  ]) assert.ok(ui.includes(token), 'Missing HR workspace behavior: ' + token);
});
