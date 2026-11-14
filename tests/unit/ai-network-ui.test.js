import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const html = read('public/index.html');
const sw = read('public/sw.js');
const menu = read('public/minglora-menu.js');
const ui = read('public/ai-network.js');
const css = read('public/ai-network.css');
const server = read('src/server.js');
const store = read('src/store.js');
const moduleSource = read('backend/modules/ai-network/service.js');

test('Minglora AI Network is a restorable first-party destination, separate from external Meta AI', () => {
  assert.match(app, /RESTORABLE_VIEWS=new Set\([^)]*'ai-network'/);
  assert.ok(app.includes("state.view==='ai-network'"));
  assert.ok(app.includes('window.MingloraAINetwork?.render()'));
  assert.ok(html.includes('data-view="ai-network"'));
  assert.ok(html.includes('Minglora AI Network'));
  assert.ok(html.includes('href="https://www.meta.ai/"'));
  assert.ok(html.includes('/ai-network.css?v=20261114-ai-network-integration-2'));
  assert.ok(html.includes('/ai-network.js?v=20261114-ai-network-integration-2'));
});

test('Minglora main menu includes a separate AI Network route', () => {
  assert.ok(menu.includes("label: 'Minglora AI Network'"));
  assert.ok(menu.includes("action: 'ai-network'"));
  assert.ok(menu.includes("'ai-network': 'ai-network'"));
});

test('AI Network script and styles are precached with matching asset versions', () => {
  const appAsset = html.match(/app\.js\?v=[^"']+/)?.[0] || '';
  const menuAsset = html.match(/minglora-menu\.js\?v=[^"']+/)?.[0] || '';
  const cacheName = sw.match(/CACHE_NAME='([^']+)'/)?.[1] || '';
  assert.equal(appAsset, 'app.js?v=20261114-ai-network-integration-2');
  assert.equal(menuAsset, 'minglora-menu.js?v=20261114-ai-network-integration-1');
  assert.ok(sw.includes('/' + appAsset));
  assert.ok(sw.includes('/' + menuAsset));
  assert.ok(sw.includes('/ai-network.js?v=20261114-ai-network-integration-2'));
  assert.ok(sw.includes('/ai-network.css?v=20261114-ai-network-integration-2'));
  assert.equal(cacheName, 'minglora-shell-v306-self-updating-1');
});

test('AI Network workspace exposes all ten recommendations and true measured/empty states', () => {
  for (const label of [
    'Bot Personality Laboratory', 'Bot Teams', 'Smart Activity Scheduling', 'Bot Performance Center',
    'Multilingual Intelligence', 'AI Creator Studio', 'Security & Trust Center',
    'AI Friendship & Companionship', 'AI Community Events', 'Central Bot Command Center'
  ]) assert.ok(ui.includes(label), label);
  assert.ok(ui.includes('No AI bots created yet'));
  assert.ok(ui.includes('recorded runs only'));
  assert.ok(ui.includes('Disabled until provider adapter is verified'));
  assert.ok(ui.includes('AI BOT'));
  assert.ok(ui.includes('Emergency pause all AI work'));
  assert.ok(css.includes('.ai-network-page'));
  assert.ok(css.includes('@media(max-width:560px)'));
  assert.ok(css.includes('prefers-reduced-motion:reduce'));
});

test('AI Network page calls only same-origin authenticated API routes and never accepts client provider secrets', () => {
  assert.ok(ui.includes("const API = '/api/ai-network'"));
  assert.ok(ui.includes("credentials: 'same-origin'"));
  assert.ok(!/name=['"](?:apiKey|providerApiKey|MINGLORA_AI_API_KEY)['"]/.test(ui));
  assert.ok(!ui.includes('localStorage'));
  assert.ok(ui.includes('provider adapter is verified'));
});

test('AI Network APIs are behind the signed-in session and the feature-owned collections persist separately', () => {
  const route = server.slice(server.indexOf("if (p === '/api/ai-network'"));
  assert.ok(route.startsWith("if (p === '/api/ai-network'"));
  assert.ok(route.includes('const user = sessionUser(req);'));
  assert.ok(route.includes('requireAuth(user);'));
  assert.ok(route.includes('getAICommandCenter(db, user.id'));
  assert.ok(route.includes('await saveStore();'));
  for (const collection of [
    'aiBotSettings','aiBots','aiBotTeams','aiBotSchedules','aiBotRuns',
    'aiBotApprovals','aiBotAudit','aiBotCreatorJobs','aiBotCompanionConsents','aiBotCommunityEvents'
  ]) {
    assert.ok(store.includes("'" + collection + "'"), collection);
    assert.ok(moduleSource.includes("'" + collection + "'"), collection);
  }
});

test('no provider execution or hidden high-impact execution is exposed by the current workspace', () => {
  assert.ok(moduleSource.includes('executionEnabled: false'));
  assert.ok(moduleSource.includes('approval.executionStatus = \'not_executed\''));
  assert.ok(moduleSource.includes('highImpactActionsExecutedAutomatically: false'));
  assert.ok(!ui.includes('fetch(' + "'" + 'https://'));
});

test('AI team creation uses the signed-in relational registry instead of JSONB-only team writes', () => {
  const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
  const migration = read('supabase/migrations/20261114142000_minglora_ai_teams_and_delegation.sql');
  assert.ok(ui.includes("kind === 'team'"));
  assert.ok(ui.includes("path = '/teams'"));
  assert.ok(ui.includes("payload.botIds = botIds"));
  assert.ok(server.includes("runAITeamCommand('create_team'"));
  assert.ok(server.includes("method === 'GET' && sub === 'teams'"));
  assert.ok(server.includes("snapshot.teams = [...relationalTeams, ...legacyTeams]"));
  assert.ok(runtime.includes('"ai_team_command"'));
  assert.ok(runtime.includes('admin.rpc("minglora_ai_team_command"'));
  assert.ok(migration.includes('create table if not exists ai_network.ai_teams'));
  assert.ok(migration.includes('create table if not exists ai_network.ai_team_memberships'));
  assert.ok(migration.includes('create table if not exists ai_network.ai_team_events'));
});

test('AI-to-AI delegation is scoped, audited and held for human approval', () => {
  const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
  const migration = read('supabase/migrations/20261114142000_minglora_ai_teams_and_delegation.sql');
  for (const table of ['ai_delegation_grants','ai_delegation_events']) {
    assert.ok(migration.includes('create table if not exists ai_network.' + table));
  }
  assert.ok(migration.includes("requires_human_approval boolean not null default true check (requires_human_approval=true)"));
  assert.ok(migration.includes("v_action_class not in ('read_only','content')"));
  assert.ok(migration.includes("status='pending_approval'"));
  assert.ok(migration.includes('delegation_grant_id=v_grant_id'));
  assert.ok(migration.includes('delegated_from_identity_id=v_from_identity_id'));
  assert.ok(migration.includes("ai_delegation_events"));
  assert.ok(migration.includes('grant execute on function public.minglora_ai_team_command(text,uuid,jsonb) to service_role'));
  assert.ok(runtime.includes('"ai_team_command"'));
  assert.ok(server.includes("runAITeamCommand('delegate_task'"));
  assert.ok(server.includes("runAITeamCommand('create_delegation_grant'"));
  assert.ok(!migration.includes("v_action_class in ('financial','security','moderation','external','social')"));
});

test('delegation controls are loaded only for authorized admins and use bounded scopes', () => {
  assert.ok(ui.includes("async function loadAIDelegations()"));
  assert.ok(ui.includes("error.status !== 403"));
  assert.ok(ui.includes("state.delegationAccess = true"));
  assert.ok(ui.includes("data-ai-form=\"delegation-create\""));
  assert.ok(ui.includes("data-ai-form=\"delegation-task\""));
  assert.ok(ui.includes("allowedActionClasses"));
  assert.ok(ui.includes("maxTokenBudget"));
  assert.ok(ui.includes("maxCostLimitUsd"));
  assert.ok(ui.includes("path = '/delegations'"));
  assert.ok(ui.includes("'/delegations/' + encodeURIComponent(grantId) + '/tasks'"));
  assert.ok(ui.includes("data-ai-action=\"delegation-status\""));
  assert.ok(ui.includes("action === 'delegation-status'"));
  assert.ok(ui.includes("It has not been executed."));
  assert.ok(server.includes("const adminOnly = ["));
  assert.ok(server.includes("'create_delegation_grant'"));
  assert.ok(server.includes("runAITeamCommand('delegate_task'"));
});

test('non-admin users do not receive owner delegation controls', () => {
  assert.ok(ui.includes("if (!state.delegationAccess) return"));
  assert.ok(ui.includes("error.status !== 403"));
  assert.ok(server.includes("isModerator(user, req)"));
  assert.ok(server.includes("Only an authorized Minglora platform administrator"));
});

test('delegated tasks are revalidated when approval or worker status changes', () => {
  const guard = read('supabase/migrations/20261114142500_minglora_ai_delegation_runtime_guard.sql');
  assert.ok(guard.includes('create or replace function ai_network.enforce_delegated_task_authority()'));
  assert.ok(guard.includes("new.status not in ('queued','running')"));
  assert.ok(guard.includes("v_grant_status <> 'active'"));
  assert.ok(guard.includes('v_grant_expiry <= now()'));
  assert.ok(guard.includes("v_team_status <> 'active'"));
  assert.ok(guard.includes('new.approved_by_user_id is null'));
  assert.ok(guard.includes('ai_network.ai_team_memberships'));
  assert.ok(guard.includes('ai_network.ai_identities'));
  assert.ok(guard.includes('ai_network.ai_employment_records'));
  assert.ok(guard.includes('before update of status on ai_network.ai_task_queue'));
  assert.ok(guard.includes('revoke all on function ai_network.enforce_delegated_task_authority() from public,anon,authenticated'));
  assert.ok(guard.includes('grant execute on function ai_network.enforce_delegated_task_authority() to service_role'));
});

test('AI schedules use the owner-scoped relational registry and pause before any execution', () => {
  const migration = read('supabase/migrations/20261114144052_minglora_ai_durable_schedules.sql');
  const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
  assert.ok(migration.includes('create table if not exists ai_network.ai_task_schedules'));
  assert.ok(migration.includes('create table if not exists ai_network.ai_task_schedule_events'));
  assert.ok(migration.includes('first_run_at timestamptz not null'));
  assert.ok(migration.includes('requires_human_approval boolean not null default true check (requires_human_approval=true)'));
  assert.ok(migration.includes('ai_disclosure_required boolean not null default true check (ai_disclosure_required=true)'));
  assert.ok(migration.includes("schedule_status text not null default 'paused'"));
  assert.ok(migration.includes("if not found or coalesce(v_controls.global_paused,true)"));
  assert.ok(migration.includes("status='pending_approval'"));
  assert.ok(migration.includes("values(v_schedule.owner_user_id,v_task_id,'requested')"));
  assert.ok(migration.includes("cron.schedule("));
  assert.ok(migration.includes("'* * * * *'"));
  assert.ok(migration.includes("SET ROLE service_role"));
  assert.ok(migration.includes("grant execute on function ai_network.dispatch_due_task_schedules() to service_role"));
  assert.ok(runtime.includes('"ai_schedule_command"'));
  assert.ok(runtime.includes('admin.rpc("minglora_ai_schedule_command"'));
  assert.ok(!runtime.includes('"dispatch_due_schedules"'));
});

test('AI schedule APIs and UI preserve identity linkage, idempotency and approval-only status controls', () => {
  assert.ok(server.includes("const runAIScheduleCommand = async"));
  assert.ok(server.includes("runAIScheduleCommand('list_schedules')"));
  assert.ok(server.includes("runAIScheduleCommand('create_schedule'"));
  assert.ok(server.includes("runAIScheduleCommand('set_schedule_status'"));
  assert.ok(server.includes("bot?.identityId"));
  assert.ok(server.includes("snapshot.schedules = [...relationalSchedules, ...legacySchedules]"));
  assert.ok(ui.includes("kind === 'schedule'"));
  assert.ok(ui.includes("payload.idempotencyKey = form.dataset.idempotencyKey"));
  assert.ok(ui.includes("data.getAll('scheduleWeekdays').map(value => Number(value))"));
  assert.ok(ui.includes("data-ai-action=\"schedule-status\""));
  assert.ok(ui.includes("action === 'schedule-status'"));
  assert.ok(ui.includes("draft tasks to the owner approval queue"));
});


test('AI identity lifecycle transitions are owner-scoped, validated and audit-backed', () => {
  const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
  assert.ok(server.includes("parts[2] === 'status'"));
  assert.ok(server.includes("sub === 'identities/bulk-status'"));
  assert.ok(server.includes("ai_identity_status_command"));
  assert.ok(runtime.includes('"ai_identity_status_command"'));
  assert.ok(runtime.includes('admin.rpc("minglora_ai_network_set_identity_status"'));
  assert.ok(runtime.includes('"set_status","bulk_set_status"'));
  assert.ok(runtime.includes('identity_ids'));
  assert.ok(runtime.includes('between 1 and 100 unique valid AI identity IDs'));
  assert.ok(ui.includes('identityStatusTransitions'));
  assert.ok(ui.includes('data-ai-action="identity-status"'));
  assert.ok(ui.includes('data-ai-action="identity-bulk-status"'));
  assert.ok(ui.includes('data-ai-identity-select'));
  assert.ok(ui.includes('Every permitted transition is audited'));
});


test('AI administrative controls are capability-gated and member identity creation is independent-only', () => {
  assert.ok(ui.includes('adminAccess: false'));
  assert.ok(ui.includes("request('/categories/admin')"));
  assert.ok(ui.includes('state.adminAccess = true'));
  assert.ok(ui.includes('state.adminAccess = false'));
  assert.ok(ui.includes("state.adminAccess ? renderAIProviderCenter() : ''"));
  assert.ok(ui.includes("state.adminAccess ? renderAITaskQueueCenter() : ''"));
  assert.ok(ui.includes("state.adminAccess ? renderAIOrganizationCenter() : ''"));
  assert.ok(ui.includes("state.adminAccess ? renderAICategoryAdmin() : ''"));
  assert.ok(ui.includes("card('My AI Safety Preferences'"));
  assert.ok(ui.includes('function renderAdminGlobalControls'));
  assert.ok(ui.includes("state.adminAccess ? card('Central Bot Command Center'"));
  assert.ok(ui.includes('value:"independent"') || ui.includes("value:'independent'"));
  const identityRoute = server.slice(server.indexOf("if (method === 'POST' && sub === 'identities')"));
  assert.ok(identityRoute.includes("population !== 'independent' && !isModerator(user, req)"));
  const bulkRoute = server.slice(server.indexOf("if (method === 'POST' && sub === 'identities/bulk')"));
  assert.ok(bulkRoute.includes('requestsElevatedPopulation && !isModerator(user, req)'));
  assert.ok(server.includes('Only an authorized Minglora platform administrator may create organizational'));
});


test('AI profile and provider bulk operations use existing owner-scoped and moderator-only database commands', () => {
  const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
  assert.ok(server.includes("sub === 'identities/bulk-profile'"));
  assert.ok(server.includes("requestSupabaseState('ai_identity_profile_update'"));
  assert.ok(server.includes('Each bulk profile record needs a unique, valid AI identity ID'));
  assert.ok(server.includes('for (let offset = 0; offset < input.items.length; offset += 10)'));
  assert.ok(server.includes("sub === 'provider-assignments/bulk'"));
  assert.ok(server.includes("runAIProviderCommand('assign_provider_model', item)"));
  assert.ok(server.includes("if (!isModerator(user, req))"));
  assert.ok(server.includes('Only an authorized Minglora platform administrator'));
  assert.ok(ui.includes('data-ai-form="identity-profile-bulk"'));
  assert.ok(ui.includes("path = '/identities/bulk-profile'"));
  assert.ok(ui.includes('data-ai-form="provider-assignment-bulk"'));
  assert.ok(ui.includes("path = '/provider-assignments/bulk'"));
  assert.ok(ui.includes('All new assignments remain pending.'));
  assert.ok(runtime.includes('ai_identity_profile_update'));
  assert.ok(runtime.includes('ai_provider_command'));
  assert.ok(!/name=['"](?:apiKey|providerApiKey|MINGLORA_AI_API_KEY)['"]/.test(ui));
});
