import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261113143000_minglora_ai_durable_task_queue_and_approvals.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('task queue, approvals and event history are private service-role records', () => {
  for (const table of ['ai_task_runtime_controls','ai_task_queue','ai_task_approvals','ai_task_events']) {
    assert.ok(migration.includes('create table if not exists ai_network.' + table));
    assert.ok(migration.includes('alter table ai_network.' + table + ' enable row level security'));
  }
  assert.ok(migration.includes("current_user <> 'service_role'"));
  assert.ok(migration.includes('revoke all on function public.minglora_ai_task_command'));
  assert.ok(migration.includes('from public, anon, authenticated'));
  assert.ok(migration.includes('grant execute on function public.minglora_ai_task_command'));
  assert.ok(migration.includes('to service_role'));
});

test('runtime defaults to paused, disabled and zero workers', () => {
  for (const token of [
    'global_paused boolean not null default true',
    'execution_enabled boolean not null default false',
    'max_concurrent_workers integer not null default 0',
    "values ('primary',true,false,0)",
    'lease_seconds integer not null default 120'
  ]) assert.ok(migration.includes(token), 'Missing fail-closed runtime default: ' + token);
  assert.ok(!server.includes("'runtime-controls'"));
  assert.ok(!ui.includes('Enable task execution'));
});

test('task creation derives supervision from the owned active identity', () => {
  for (const token of [
    "i.owner_user_id=p_actor_user_id",
    "i.status='active' and i.enabled=true",
    'select i.supervision_level into v_autonomy_mode',
    "v_autonomy_mode='fully_supervised'",
    "v_autonomy_mode='supervisor_controlled'",
    "v_autonomy_mode='restricted_observation'",
    "v_status := 'observation_only'",
    "v_status := 'pending_approval'",
    "v_status := 'queued'"
  ]) assert.ok(migration.includes(token), 'Missing identity supervision rule: ' + token);
  assert.ok(migration.includes('unique (owner_user_id,idempotency_key)'));
  assert.ok(migration.includes('Task idempotency key was already used for a different task request.'));
});

test('high-impact tasks require a recorded human decision before queueing', () => {
  for (const token of [
    "v_action_class in ('external','financial','security','moderation','other')",
    "'financial','security'",
    'insert into ai_network.ai_task_approvals',
    "approval_status='requested'",
    'if v_previous_status is distinct from \'pending_approval\' then',
    "case when v_action='approve_task' then 'queued' else 'rejected' end",
    'reviewed_by_user_id=p_actor_user_id',
    'task_created',
    'task_cancelled'
  ]) assert.ok(migration.includes(token), 'Missing task approval rule: ' + token);
});

test('task queue validates budgets, payload size and rejects credential-like fields', () => {
  for (const token of [
    'octet_length(task_payload::text)<=65536',
    'token_budget integer not null default 0',
    'cost_limit_usd numeric(14,6)',
    'max_attempts integer not null default 3',
    'Credentials and secrets are not allowed in AI task payloads.',
    'A safe JSON object no larger than 64 KB.'
  ]) assert.ok(migration.includes(token), 'Missing task budget or payload guard: ' + token);
});

test('leases use recovery, concurrency limits and require verified provider health', () => {
  for (const token of [
    'for update skip locked limit 1',
    'ai_task_queue_lease_recovery_idx',
    'worker_lease_expired',
    'worker_limit_reached',
    'v_max_workers',
    "i.status='active' and i.enabled=true",
    "a.assignment_status='active'",
    "a.provider_health_status='healthy'",
    "pa.status='configured' and pa.health_status='healthy'",
    'lease_token=v_lease_token',
    'q.lease_expires_at>now()'
  ]) assert.ok(migration.includes(token), 'Missing worker lease guard: ' + token);
  assert.ok(migration.includes('check ((status=\'running\' and worker_id is not null'));
});

test('worker execution remains inaccessible without an independent worker credential', () => {
  assert.ok(migration.includes('AI worker authentication is not deployed; task execution is disabled.'));
  assert.ok(migration.includes("if v_action in ('claim_next_task','heartbeat_task','complete_task','fail_task')"));
  const handlerStart = runtime.indexOf('if (action === "ai_task_command")');
  const handlerEnd = runtime.indexOf('if (action === "ai_provider_command")', handlerStart);
  const handler = runtime.slice(handlerStart, handlerEnd);
  for (const action of ['create_task','list_tasks','approve_task','reject_task','cancel_task']) {
    assert.ok(handler.includes('"' + action + '"'), 'Missing user task command: ' + action);
  }
  for (const action of ['claim_next_task','heartbeat_task','complete_task','fail_task']) {
    assert.ok(!handler.includes('"' + action + '"'), 'Worker command must not be gateway-allowlisted: ' + action);
  }
});

test('Node task API requires authorized platform staff and exposes no worker execution route', () => {
  const start = server.indexOf("if (p === '/api/ai-network'");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  const route = server.slice(start, end);
  for (const token of [
    'const runAITaskCommand = async',
    'isModerator(user, req)',
    "requestSupabaseState('ai_task_command'",
    "sub === 'tasks'",
    "'create_task'",
    "'list_tasks'",
    "'approve_task'",
    "'reject_task'",
    "'cancel_task'",
    'The AI task queue migration and runtime gateway must be deployed'
  ]) assert.ok(route.includes(token), 'Missing secure task API behavior: ' + token);
  assert.ok(!route.includes("'claim_next_task'"));
  assert.ok(!route.includes("'complete_task'"));
});

test('task workspace shows actual queue state and only offers authorized human controls', () => {
  for (const token of [
    'async function loadAITaskQueue',
    "request('/tasks')",
    'function renderAITaskQueueCenter()',
    'data-ai-form="task-create"',
    'data-ai-form="task-approval"',
    'data-ai-form="task-cancel"',
    "path = '/tasks'",
    "path = '/tasks/' + encodeURIComponent(taskId) + '/approval'",
    "path = '/tasks/' + encodeURIComponent(taskId) + '/cancel'",
    'state.taskRuntime',
    'global_paused',
    'execution_enabled',
    'max_concurrent_workers',
    'approval policy comes from the selected AI identity'
  ]) assert.ok(ui.includes(token), 'Missing durable task workspace behavior: ' + token);
});
