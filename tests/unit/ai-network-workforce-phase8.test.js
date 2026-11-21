import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const foundation = read('supabase/migrations/20261114022045_minglora_ai_corporate_workforce_foundation.sql');
const hr = read('supabase/migrations/20261114022047_minglora_ai_hr_recruitment_and_employment_workflows.sql');
const teams = read('supabase/migrations/20261114142000_minglora_ai_teams_and_delegation.sql');
const migration = read('supabase/migrations/20261120221000_minglora_ai_corporate_workforce_phase8.sql');
const taskSafeguards = read('supabase/migrations/20261121032200_minglora_ai_corporate_workforce_task_queue_safeguards.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('Phase 8 extends the canonical organization, employee, department, role and reporting schema', () => {
  for (const token of [
    'ai_organizations','ai_departments','ai_positions','ai_employment_records',
    'manager_employment_id','workload_percentage','employment_status'
  ]) assert.ok(foundation.includes(token), 'Missing corporate workforce foundation element: ' + token);
  assert.match(hr, /appoint_employee/);
  assert.match(hr, /set_employment_manager/);
  assert.match(hr, /transition_employment/);
  assert.match(teams, /ai_teams/);
  assert.match(teams, /ai_team_memberships/);
  assert.match(teams, /ai_team_events/);
});

test('new Phase 8 records are owner scoped, private and service-role only', () => {
  for (const table of [
    'ai_employee_permission_grants','ai_employee_task_assignments',
    'ai_team_messages','ai_employee_reports','ai_workforce_events'
  ]) {
    assert.match(migration, new RegExp('create table if not exists ai_network\\\\.' + table, 'i'));
    assert.match(migration, new RegExp('alter table ai_network\\\\.' + table + ' enable row level security', 'i'));
    assert.match(migration, new RegExp(table + '[\\\\s\\\\S]*?owner_user_id uuid not null references public\\\\.profiles\\\\(id\\\\)', 'i'));
  }
  assert.match(migration, /revoke all on ai_network\\.ai_employee_permission_grants[\\s\\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /create policy .*ai_employee_(permission_grants|task_assignments|reports)|create policy .*ai_team_messages/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /current_user\\s*<>\\s*'service_role'/i);
  assert.match(migration, /revoke all on function public\\.minglora_ai_workforce_command[\\s\\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\\.minglora_ai_workforce_command[\\s\\S]*to service_role/i);
});

test('employee permissions are explicit, least privilege and revocable', () => {
  for (const permission of [
    'task.assign.read_only','task.assign.content','team.message',
    'report.submit','report.read','workload.read'
  ]) assert.ok(migration.includes(permission), 'Missing permission type: ' + permission);
  assert.match(migration, /grant_employee_permission/);
  assert.match(migration, /revoke_employee_permission/);
  assert.match(migration, /g\\.revoked_at is null/);
  assert.match(migration, /active employee with an active identity and job position/);
  assert.match(migration, /permission idempotency key was reused for a different grant/i);
});

test('task assignment enforces permissions, job status, team membership and workload capacity', () => {
  assert.match(migration, /assign_employee_task/);
  assert.match(migration, /e\\.employment_status='active'/);
  assert.match(migration, /p\\.status='active'/);
  assert.match(migration, /i\\.status='active' and i\\.enabled=true/);
  assert.match(migration, /v_task_type=any\\(g\\.allowed_task_types\\)/);
  assert.match(migration, /Employee workload capacity would be exceeded/);
  assert.match(migration, /v_action_class not in \\('read_only','content'\\)/);
  assert.match(taskSafeguards, /md5\\('minglora_workforce:'\\|\\|v_idempotency_key\\)/);
  assert.match(taskSafeguards, /v_status not in \\('queued','pending_approval'\\)/);
  assert.match(taskSafeguards, /workforce_human_approval_required/);
  assert.match(taskSafeguards, /separate human approval/);
});

test('revoked or inactive workforce authority cancels queued work and blocks worker claims', () => {
  for (const trigger of [
    'ai_workforce_employment_status_cancel',
    'ai_workforce_membership_cancel',
    'ai_workforce_team_status_cancel',
    'ai_workforce_task_authority_guard'
  ]) assert.ok(migration.includes(trigger), 'Missing safety trigger: ' + trigger);
  assert.match(migration, /cancel_workforce_assignments\\(/);
  assert.match(migration, /new\\.employment_status <> 'active'/);
  assert.match(migration, /new\\.membership_status <> 'active'/);
  assert.match(migration, /new\\.status <> 'active'/);
  assert.match(migration, /Workforce task execution is blocked/);
});

test('team communication enforces membership, employee permission and management boundaries', () => {
  assert.match(migration, /send_team_message/);
  assert.match(migration, /team\\.message/);
  assert.match(migration, /AI employees cannot send management announcements or instructions/);
  assert.match(migration, /AI-authored messages require active membership/);
  assert.match(migration, /Credentials and secrets cannot be sent in workforce messages/);
  assert.match(migration, /list_team_messages/);
  assert.match(migration, /list_team_activity/);
});

test('employee reports preserve manager hierarchy and require authorized submission and review', () => {
  assert.match(migration, /manager_employment_id/);
  assert.match(migration, /report\\.submit/);
  assert.match(migration, /submit_employee_report/);
  assert.match(migration, /review_employee_report/);
  assert.match(migration, /reviewed_by_user_id/);
  assert.match(migration, /Employee report stored for the assigned reporting manager/);
  assert.match(migration, /employee_report_reviewed/);
});

test('Edge Function explicitly allowlists and forwards workforce commands', () => {
  assert.match(runtime, /if \\(action === "ai_workforce_command"\\)/);
  assert.match(runtime, /supportedWorkforceCommands/);
  for (const action of [
    'list_workforce','list_employee_permissions','grant_employee_permission',
    'revoke_employee_permission','assign_employee_task','send_team_message',
    'submit_employee_report','review_employee_report','list_team_messages','list_team_activity'
  ]) assert.ok(runtime.includes('"' + action + '"'), 'Missing runtime action: ' + action);
  assert.match(runtime, /admin\\.rpc\\("minglora_ai_workforce_command"/);
  assert.match(runtime, /validUuid\\(actorUserId\\)/);
  assert.match(runtime, /validUuid\\(organizationId\\)/);
});

test('server workforce endpoints are administrator-only and use Supabase runtime', () => {
  const start = server.indexOf("if (p === '/api/ai-network'");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  const route = server.slice(start, end);
  assert.match(route, /const runAIWorkforceCommand = async/);
  assert.match(route, /isModerator\\(user, req\\)/);
  assert.match(route, /requestSupabaseState\\('ai_workforce_command'/);
  for (const path of [
    "'workforce'","'employees'","'permissions'","'tasks'","'teams'","'messages'","'reports'"
  ]) assert.ok(route.includes(path), 'Missing workforce resource route: ' + path);
  for (const action of [
    'list_workforce','grant_employee_permission','revoke_employee_permission',
    'assign_employee_task','send_team_message','submit_employee_report',
    'review_employee_report','list_team_messages','list_team_activity'
  ]) assert.ok(route.includes("'" + action + "'"), 'Missing server action route: ' + action);
  assert.match(route, /No workforce data was changed/);
});

test('admin workspace exposes permission, workload, team, task, communication and reporting controls', () => {
  assert.match(ui, /request\\(base \\+ '\\/workforce'\\)/);
  assert.match(ui, /function renderAIWorkforcePanel\\(/);
  for (const form of [
    'workforce-permission','workforce-permission-revoke','workforce-team',
    'workforce-task','team-message','employee-report','employee-report-review'
  ]) assert.ok(ui.includes('data-ai-form="' + form + '"'), 'Missing workforce form: ' + form);
  for (const label of [
    'Workload and reporting hierarchy','Explicit role-based permissions',
    'Organizational teams','Task allocation and queue','Team communication',
    'Employee reporting and management review','Workforce activity audit'
  ]) assert.ok(ui.includes(label), 'Missing workforce workspace section: ' + label);
  assert.match(ui, /payload\\.memberIdentityIds/);
  assert.match(ui, /payload\\.workload_units/);
  assert.match(ui, /payload\\.permission_key/);
  assert.match(ui, /payload\\.report_body/);
});
