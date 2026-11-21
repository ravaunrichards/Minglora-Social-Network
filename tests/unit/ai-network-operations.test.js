import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261121042000_minglora_ai_task_retry_and_event_logs.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');
const routeStart = server.indexOf("if (p === '/api/ai-network'");
const routeEnd = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", routeStart);
const aiRoutes = server.slice(routeStart, routeEnd);

test('retry RPC is owner-scoped, service-role-only and locks the task before retrying', () => {
  for (const token of [
    'create or replace function public.minglora_ai_task_retry',
    "current_user <> 'service_role'",
    'from public, anon, authenticated',
    'to service_role',
    'for update',
    "v_task.status <> 'failed'",
    "i.owner_user_id = p_actor_user_id",
    "i.status = 'active'",
    'i.enabled = true',
    "when v_task.requires_approval then 'pending_approval'",
    "else 'queued'",
    "'task_retry_requested'",
    "'execution_started', false"
  ]) assert.ok(migration.includes(token), 'Missing retry safeguard: ' + token);
  assert.ok(!migration.includes('attempt_count = 0'), 'Retry must preserve attempt history.');
  assert.ok(migration.includes('v_max_attempts <= v_task.attempt_count'));
  assert.ok(migration.includes('v_max_attempts > 10'));
});

test('retry does not bypass human approval or restricted-observation policy', () => {
  assert.ok(migration.includes("when v_task.autonomy_mode = 'restricted_observation' then 'observation_only'"));
  assert.ok(migration.includes("approval_status = 'requested'"));
  assert.ok(migration.includes('reviewed_by_user_id = null'));
  assert.ok(migration.includes('reviewed_at = null'));
  assert.ok(migration.includes('approved_by_user_id = case when v_task.requires_approval then null'));
  assert.ok(migration.includes('lease_token = null'));
  assert.ok(migration.includes('worker_id = null'));
});

test('task event RPC returns only bounded logs for a task owned by the requesting administrator', () => {
  for (const token of [
    'create or replace function public.minglora_ai_task_events',
    "current_user <> 'service_role'",
    'q.owner_user_id = p_actor_user_id and q.task_id = p_task_id',
    'where owner_user_id = p_actor_user_id and task_id = p_task_id',
    'order by occurred_at desc',
    'limit greatest(1, least(coalesce(p_limit, 100), 100))',
    "'[]'::jsonb"
  ]) assert.ok(migration.includes(token), 'Missing audit-log restriction: ' + token);
  assert.ok(migration.includes('revoke all on function public.minglora_ai_task_events'));
});

test('private runtime gateway validates and allowlists only retry and read-log user operations', () => {
  for (const token of [
    '"ai_task_retry"',
    '"ai_task_events"',
    'if (action === "ai_task_retry")',
    'if (action === "ai_task_events")',
    'admin.rpc("minglora_ai_task_retry"',
    'admin.rpc("minglora_ai_task_events"',
    'validUuid(actorUserId)',
    'validUuid(taskId)',
    'p_limit: 100'
  ]) assert.ok(runtime.includes(token), 'Missing private runtime behavior: ' + token);
  for (const workerAction of ['"claim_next_task"', '"heartbeat_task"', '"complete_task"', '"fail_task"']) {
    const taskHandler = runtime.slice(runtime.indexOf('if (action === "ai_task_command")'), runtime.indexOf('if (action === "ai_provider_command")'));
    assert.ok(!taskHandler.includes(workerAction), 'Worker action must remain unavailable to administrator calls.');
  }
});

test('Node task retry and log endpoints require platform authorization and Supabase persistence', () => {
  for (const token of [
    'const runAITaskEventsCommand = async taskId',
    'const runAITaskRetryCommand = async (taskId, input = {})',
    "requestSupabaseState('ai_task_events'",
    "requestSupabaseState('ai_task_retry'",
    "parts[2] === 'events'",
    "parts[2] === 'retry'",
    'requireAITaskAdmin();',
    'isModerator(user, req)',
    'Only an authorized Minglora platform administrator'
  ]) assert.ok(aiRoutes.includes(token), 'Missing secured task API: ' + token);
  assert.ok(aiRoutes.includes('Maximum task attempts must be a whole number between 1 and 10.'));
  assert.ok(aiRoutes.includes('AI task logs are unavailable in local-only persistence mode.'));
});

test('dashboard Stop uses the existing lease-revoking cancellation command for running tasks', () => {
  assert.ok(ui.includes("const canCancel = ['pending_approval','queued','observation_only','running'].includes(status);"));
  assert.ok(ui.includes("status === 'running' ? 'Stop running task' : 'Cancel task'"));
  assert.ok(ui.includes("'/tasks/' + encodeURIComponent(taskId) + '/cancel'"));
  assert.ok(ui.includes('Its worker lease will be revoked'));
});

test('dashboard Retry is visible only for failed tasks and reports re-queue without claiming execution', () => {
  assert.ok(ui.includes("status === 'failed' ? '<form"));
  assert.ok(ui.includes('data-ai-form="task-retry"'));
  assert.ok(ui.includes("'/tasks/' + encodeURIComponent(taskId) + '/retry'"));
  assert.ok(ui.includes('Failed task re-queued.'));
  assert.ok(ui.includes('execution has not started'));
  assert.ok(ui.includes('Start/execute is unavailable'));
});

test('task log viewer reads actual audit events and renders returned event details', () => {
  for (const token of [
    'async function loadAITaskEvents(taskId)',
    "'/tasks/' + encodeURIComponent(taskId) + '/events'",
    'data-ai-action="task-logs"',
    'data-ai-action="task-logs-close"',
    'state.taskEvents.map(event =>',
    'event.event_type',
    'event.occurred_at',
    'event.reason',
    'event.metadata'
  ]) assert.ok(ui.includes(token), 'Missing task log UI behavior: ' + token);
});

test('AI state, provider limitations, restart/delete limitations and analytics navigation are explicit', () => {
  for (const token of [
    'data-ai-action="emergency-pause"',
    'Disable AI / Emergency pause',
    'Enable AI / Resume owner controls',
    'data-ai-action="analytics"',
    'ai-network-analytics',
    'Restart is not an available operation',
    'use Archive to retire a bot safely',
    'Connect/disconnect and provider enable/disable controls are not implemented',
    'Edit an AI through its linked profile in the AI Identity Registry'
  ]) assert.ok(ui.includes(token), 'Missing truthful operational control disclosure: ' + token);
  assert.ok(ui.includes("card('Bot Performance Center'"));
});

test('dashboard loading and operational status use real API refreshes with recoverable errors', () => {
  for (const token of [
    'data-ai-busy-indicator',
    'function syncBusyIndicator()',
    'aria-busy',
    'function startOperationalPolling()',
    'window.setInterval(refreshOperationalStatus, 15000)',
    "Promise.all([request(), request('/tasks')])",
    'state.operationalStatusError',
    'state.operationalLastUpdated'
  ]) assert.ok(ui.includes(token), 'Missing operational feedback: ' + token);
});

test('task restart and worker enablement are not exposed as pretend actions', () => {
  assert.ok(!ui.includes('data-ai-action="task-start"'));
  assert.ok(!ui.includes('data-ai-action="worker-restart"'));
  assert.ok(!aiRoutes.includes("'claim_next_task'"));
  assert.ok(!aiRoutes.includes("'complete_task'"));
});
