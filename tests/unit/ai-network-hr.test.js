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
    assert.match(migration, new RegExp('create table if not exists ai_network\\.' + table, 'i'));
    assert.match(migration, new RegExp('alter table ai_network\\.' + table + ' enable row level security', 'i'));
    assert.match(migration, new RegExp('grant (?:select|select, insert|select, insert, update) on ai_network\\.' + table + ' to service_role', 'i'));
  }
  assert.match(migration, /security invoker/i);
  assert.match(migration, /current_user <> 'service_role'/i);
  assert.match(migration, /revoke all on function public\\.minglora_ai_hr_command[\\s\\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\\.minglora_ai_hr_command[\\s\\S]*to service_role/i);
  assert.doesNotMatch(migration, /grant\\s+usage\\s+on\\s+schema\\s+ai_network\\s+to\\s+(public|anon|authenticated)/i);
});

test('vacancies and applications are owner-scoped, bounded and duplicate-safe', () => {
  assert.match(migration, /owner_user_id uuid not null references public\\.profiles\\(id\\)/i);
  assert.match(migration, /ai_recruitment_vacancies_owner_idempotency_uq/i);
  assert.match(migration, /ai_recruitment_applications_idempotency_uq/i);
  assert.match(migration, /unique \\(vacancy_id, identity_id\\)/i);
  assert.match(migration, /openings between 1 and 1000/i);
  assert.match(migration, /jsonb_array_length\\(v_requirements\\)>50/i);
  assert.match(migration, /o\\.owner_type='human_user'/i);
  assert.match(migration, /i\\.status not in \\('suspended','archived','retired'\\)/i);
  assert.match(migration, /where o\\.organization_id=v_organization_id and o\\.owner_user_id=p_actor_user_id/i);
});

test('appointments require approved applications and preserve employment history', () => {
  assert.match(migration, /a\\.application_status='approved'/i);
  assert.match(migration, /employment_status,employment_type,job_description,workload_percentage/i);
  assert.match(migration, /'onboarding'/i);
  assert.match(migration, /ai_employment_records_one_current_role_uq/i);
  assert.match(migration, /ai_employment_records_application_uq/i);
  assert.match(migration, /ai_employment_records_org_idempotency_uq/i);
  assert.match(migration, /application_status='appointed'/i);
  assert.match(migration, /candidate_appointed/i);
  assert.match(migration, /ai_recruitment_history/i);
});

test('employment lifecycle uses explicit transitions and required reason history', () => {
  for (const status of ['restricted','suspended','terminated','retired']) {
    assert.ok(migration.includes("'" + status + "'"));
  }
  assert.match(migration, /onboarding' and v_status in \\('active','suspended','terminated'\\)/i);
  assert.match(migration, /active' and v_status in \\('restricted','suspended','terminated','retired'\\)/i);
  assert.match(migration, /A reason of at least three characters is required/i);
  assert.match(migration, /employment_status=v_status/i);
  assert.match(migration, /status_changed/i);
});

test('manager assignment enforces higher hierarchy and rejects reporting cycles', () => {
  assert.match(migration, /v_manager_rank<=v_rank/i);
  assert.match(migration, /with recursive chain\\(employment_id,manager_employment_id,path,cycle\\)/i);
  assert.match(migration, /Reporting changes cannot create a managerial cycle/i);
  assert.match(migration, /previous_manager_employment_id/i);
});

test('transfers preserve old and new employment history and are retry safe', () => {
  assert.match(migration, /replaces_employment_id uuid/i);
  assert.match(migration, /ai_employment_records_single_replacement_uq/i);
  assert.match(migration, /ai_employment_records_replaces_fk/i);
  assert.match(migration, /e\\.replaces_employment_id=v_employment_id/i);
  assert.match(migration, /employment_status='transferred',end_date=current_date/i);
  assert.match(migration, /'transfer_received'/i);
  assert.match(migration, /Transfer reporting changes cannot create a managerial cycle/i);
});

test('Edge Function exposes only the declared HR command allowlist', () => {
  assert.match(runtime, /if \\(action === "ai_hr_command"\\)/);
  assert.match(runtime, /supportedHRCommands\\s*=\\s*\\[[\\s\\S]*"create_vacancy"[\\s\\S]*"review_application"[\\s\\S]*"appoint_employee"[\\s\\S]*"transfer_employee"/i);
  assert.match(runtime, /admin\\.rpc\\("minglora_ai_hr_command"/);
  assert.match(runtime, /validUuid\\(String\\(payload\\.organization_id \\|\\| ""\\)\\)/);
});

test('HR API routes require authorized platform staff and never write local demo state', () => {
  const route = server.slice(server.indexOf("if (p === '/api/ai-network'"), server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')"));
  assert.match(route, /const runAIHRCommand = async/);
  assert.match(route, /isModerator\\(user, req\\)/);
  assert.match(route, /requestSupabaseState\\('ai_hr_command'/);
  for (const path of ['vacancies','applications','employees']) {
    assert.ok(route.includes("'" + path + "'"), 'Missing HR resource: ' + path);
  }
  for (const action of ['create_vacancy','review_application','appoint_employee','transition_employment','set_employment_manager','transfer_employee']) {
    assert.ok(route.includes("'" + action + "'"), 'Missing HR action: ' + action);
  }
  assert.match(route, /The AI recruitment and workforce migration and runtime gateway must be deployed/i);
  assert.match(route, /No HR data was changed/i);
});

test('HR workspace uses database-backed options and exposes lifecycle controls', () => {
  assert.match(ui, /async function loadAIOrganizationRegistry/);
  assert.match(ui, /request\(base \+ '\/vacancies'\)/);
  assert.match(ui, /request\(base \+ '\/applications'\)/);
  assert.match(ui, /request\(base \+ '\/employees'\)/);
  for (const kind of ['vacancy','vacancy-status','application','application-review','appointment','employment-status','employment-manager','employment-transfer']) {
    assert.ok(ui.includes("data-ai-form=\"" + kind + "\"") || ui.includes("kind === '" + kind + "'"),
      'Missing HR form or submit action: ' + kind);
  }
  assert.match(ui, /identityRecords\.map/);
  assert.match(ui, /departmentOptions/);
  assert.match(ui, /positionOptions/);
  assert.match(ui, /identityOptions\.length/);
  assert.match(ui, /No AI employees have been appointed/);
  assert.match(ui, /No recruitment vacancies have been created/);
});
