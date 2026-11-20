import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAIExecutionWorkerOnce, refreshAIProviderHealth } from '../../backend/workers/ai-execution/worker.mjs';
import { executeOpenAITask } from '../../backend/modules/ai-network/openai-task-executor.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(resolve(root, 'supabase/migrations/20261120110000_minglora_ai_execution_orchestration.sql'), 'utf8');
const runtime = readFileSync(resolve(root, 'supabase/functions/minglora-runtime-state/index.ts'), 'utf8');
const server = readFileSync(resolve(root, 'src/server.js'), 'utf8');

const enabledEnv = {
  MINGLORA_AI_WORKER_ENABLED: 'true',
  MINGLORA_AI_WORKER_TOKEN: 'worker-token-placeholder-that-is-long-enough-for-tests',
  MINGLORA_AI_MAX_REQUESTS_PER_MINUTE: '30',
  MINGLORA_AI_MAX_TOKENS_PER_MINUTE: '30000',
  MINGLORA_AI_PROVIDER_HEALTH_CHECK_ENABLED: 'false',
  OPENAI_API_KEY: 'test-key-only'
};

const claimedTask = {
  task_id: '11111111-1111-4111-a111-111111111111',
  identity_id: '22222222-2222-4222-a222-222222222222',
  task_type: 'caption_draft',
  task_title: 'Draft a creator caption',
  action_class: 'content',
  task_payload: { prompt: 'Draft a short caption about a new creator tutorial.' },
  token_budget: 1500,
  attempt_count: 1,
  max_attempts: 3,
  lease_token: '33333333-3333-4333-a333-333333333333'
};
const route = {
  provider_name: 'OpenAI API',
  provider_account_id: '44444444-4444-4444-a444-444444444444',
  assignment_id: '55555555-5555-4555-a555-555555555555',
  model_id: '66666666-6666-4666-a666-666666666666',
  model_identifier: 'gpt-test-model'
};

function fakeTimer() {
  return { setIntervalImpl: () => ({ unref() {} }), clearIntervalImpl: () => {} };
}

test('worker stays closed unless explicitly enabled and separately credentialed', async () => {
  let calls = 0;
  const disabled = await runAIExecutionWorkerOnce({
    env: { MINGLORA_AI_WORKER_ENABLED: 'false' },
    gatewayCall: async () => { calls += 1; }
  });
  assert.deepEqual(disabled, { started: false, reason: 'worker_disabled' });
  const noToken = await runAIExecutionWorkerOnce({
    env: { MINGLORA_AI_WORKER_ENABLED: 'true' },
    gatewayCall: async () => { calls += 1; }
  });
  assert.deepEqual(noToken, { started: false, reason: 'worker_credential_missing' });
  assert.equal(calls, 0);
});

test('worker records a rate-limit reservation failure and does not call the model', async () => {
  const actions = [];
  let executorCalls = 0;
  const result = await runAIExecutionWorkerOnce({
    env: enabledEnv,
    gatewayCall: async (action) => {
      actions.push(action);
      if (action === 'claim_next_task') return { claimed: true, task: claimedTask, route, identity: {} };
      if (action === 'reserve_provider_capacity') return { reserved: false, retry_after_seconds: 45 };
      if (action === 'fail_task') return { recorded: true, status: 'queued' };
      throw new Error('Unexpected action: ' + action);
    },
    executeTask: async () => { executorCalls += 1; },
    logger: { warn() {}, info() {}, error() {} },
    ...fakeTimer()
  });
  assert.equal(result.succeeded, false);
  assert.equal(result.failure, 'provider_rate_limited');
  assert.deepEqual(actions, ['claim_next_task','reserve_provider_capacity','fail_task']);
  assert.equal(executorCalls, 0);
});

test('worker persists success only after a non-empty provider result and route', async () => {
  const actions = [];
  let completedPayload;
  const result = await runAIExecutionWorkerOnce({
    env: enabledEnv,
    gatewayCall: async (action, payload) => {
      actions.push(action);
      if (action === 'claim_next_task') return { claimed: true, task: claimedTask, route, identity: { display_name: 'Minglora Guide' } };
      if (action === 'reserve_provider_capacity') return { reserved: true };
      if (action === 'complete_task') {
        completedPayload = payload.task_result;
        return { completed: true, status: 'succeeded' };
      }
      if (action === 'fail_task') throw new Error('A successful task must not fail.');
      throw new Error('Unexpected action: ' + action);
    },
    executeTask: async () => ({
      succeeded: true,
      output: 'A reviewed and moderated creator caption.',
      route: { provider: 'openai', model: 'gpt-test-model' },
      usage: { input_tokens: 50, output_tokens: 25, total_tokens: 75 },
      moderation: { input_flagged: false, output_flagged: false }
    }),
    logger: { warn() {}, info() {}, error() {} },
    ...fakeTimer()
  });
  assert.equal(result.succeeded, true);
  assert.deepEqual(actions, ['claim_next_task','reserve_provider_capacity','complete_task']);
  assert.equal(completedPayload.succeeded, true);
  assert.equal(completedPayload.output, 'A reviewed and moderated creator caption.');
  assert.equal(completedPayload.route.provider, 'openai');
  assert.equal(completedPayload.route.model, 'gpt-test-model');
  assert.ok(Number.isFinite(completedPayload.duration_ms));
});

test('worker records a transient provider error as a retry, never a success', async () => {
  const actions = [];
  let failurePayload;
  const result = await runAIExecutionWorkerOnce({
    env: enabledEnv,
    gatewayCall: async (action, payload) => {
      actions.push(action);
      if (action === 'claim_next_task') return { claimed: true, task: claimedTask, route, identity: {} };
      if (action === 'reserve_provider_capacity') return { reserved: true };
      if (action === 'fail_task') {
        failurePayload = payload;
        return { recorded: true, status: 'queued', retry_after_seconds: 20 };
      }
      if (action === 'complete_task') throw new Error('Failed provider calls must never complete.');
      throw new Error('Unexpected action: ' + action);
    },
    executeTask: async () => {
      throw Object.assign(new Error('The configured AI provider could not be reached.'), {
        code: 'network_error', retryable: true, safeForClient: true
      });
    },
    logger: { warn() {}, info() {}, error() {} },
    ...fakeTimer()
  });
  assert.equal(result.succeeded, false);
  assert.equal(result.status, 'queued');
  assert.equal(failurePayload.failure_code, 'network_error');
  assert.equal(failurePayload.retryable, true);
  assert.deepEqual(actions, ['claim_next_task','reserve_provider_capacity','fail_task']);
});

test('worker rejects an incomplete generation rather than marking it successful', async () => {
  const actions = [];
  const result = await runAIExecutionWorkerOnce({
    env: enabledEnv,
    gatewayCall: async (action) => {
      actions.push(action);
      if (action === 'claim_next_task') return { claimed: true, task: claimedTask, route, identity: {} };
      if (action === 'reserve_provider_capacity') return { reserved: true };
      if (action === 'fail_task') return { recorded: true, status: 'failed' };
      if (action === 'complete_task') throw new Error('Incomplete response must not complete.');
      throw new Error('Unexpected action: ' + action);
    },
    executeTask: async () => ({ succeeded: false, output: '' }),
    logger: { warn() {}, info() {}, error() {} },
    ...fakeTimer()
  });
  assert.equal(result.succeeded, false);
  assert.equal(result.failure, 'invalid_generation');
  assert.equal(actions.at(-1), 'fail_task');
  assert.equal(actions.includes('complete_task'), false);
});

test('worker health probes record healthy and unavailable assigned OpenAI routes', async () => {
  const calls = [];
  const result = await refreshAIProviderHealth({
    env: { ...enabledEnv, MINGLORA_AI_PROVIDER_HEALTH_CHECK_ENABLED: 'true' },
    force: true,
    now: () => 1000000000,
    gatewayCall: async (action, payload) => {
      calls.push({ action, payload });
      if (action === 'list_provider_health_targets') {
        return { targets: [
          { provider_account_id: 'account-1', assignment_id: 'assignment-1', model_identifier: 'gpt-good' },
          { provider_account_id: 'account-2', assignment_id: 'assignment-2', model_identifier: 'gpt-bad' }
        ] };
      }
      return { recorded: true };
    },
    probeProvider: async ({ env }) => env.OPENAI_DEFAULT_MODEL === 'gpt-good'
      ? { connected: true, healthStatus: 'healthy', status: 'healthy' }
      : { connected: false, healthStatus: 'unknown', status: 'unauthorized' },
    logger: { info() {} }
  });
  assert.equal(result.checked, 2);
  assert.deepEqual(calls.map(x => x.action), [
    'list_provider_health_targets','record_provider_health','record_provider_health'
  ]);
  assert.equal(calls[1].payload.health_status, 'healthy');
  assert.equal(calls[2].payload.health_status, 'unavailable');
});

test('OpenAI task executor moderates input and output and sends no tools', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    if (String(url).endsWith('/moderations')) {
      return { ok: true, status: 200, json: async () => ({ results: [{ flagged: false }] }) };
    }
    return {
      ok: true, status: 200,
      json: async () => ({
        id: 'resp-task-test', status: 'completed', model: 'gpt-test-model',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'A useful caption for creators.' }] }],
        usage: { input_tokens: 60, output_tokens: 20, total_tokens: 80 }
      })
    };
  };
  const result = await executeOpenAITask({
    task: claimedTask,
    route,
    identity: { display_name: 'Minglora Guide', purpose: 'Draft helpful creator content.' },
    env: { OPENAI_API_KEY: 'test-key-only', MINGLORA_AI_MAX_RETRIES: '0' },
    fetchImpl
  });
  assert.equal(calls.length, 3);
  assert.ok(calls[0].url.endsWith('/moderations'));
  assert.ok(calls[1].url.endsWith('/responses'));
  assert.ok(calls[2].url.endsWith('/moderations'));
  assert.deepEqual(calls[1].body.tools, []);
  assert.equal(calls[1].body.store, false);
  assert.equal(result.succeeded, true);
  assert.equal(result.route.provider, 'openai');
  assert.equal(result.route.model, 'gpt-test-model');
  assert.equal(result.external_actions_taken, false);
  assert.equal(result.moderation.output_flagged, false);
});

test('OpenAI task executor blocks flagged input before sending a generation request', async () => {
  const paths = [];
  const fetchImpl = async url => {
    paths.push(String(url));
    return { ok: true, status: 200, json: async () => ({ results: [{ flagged: true }] }) };
  };
  await assert.rejects(
    executeOpenAITask({
      task: claimedTask, route, identity: {},
      env: { OPENAI_API_KEY: 'test-key-only' }, fetchImpl
    }),
    error => error.code === 'moderation_blocked'
  );
  assert.equal(paths.length, 1);
  assert.ok(paths[0].endsWith('/moderations'));
});

test('OpenAI task executor rejects unsupported providers and secret-bearing task data', async () => {
  await assert.rejects(
    executeOpenAITask({
      task: claimedTask, route: { ...route, provider_name: 'Google Gemini' },
      identity: {}, env: { OPENAI_API_KEY: 'test-key-only' }, fetchImpl: async () => { throw new Error('should not call'); }
    }),
    error => error.code === 'provider_adapter_unavailable'
  );
  await assert.rejects(
    executeOpenAITask({
      task: { ...claimedTask, task_payload: { prompt: 'Hello', api_key: 'do-not-send' } },
      route, identity: {}, env: { OPENAI_API_KEY: 'test-key-only' },
      fetchImpl: async () => { throw new Error('should not call'); }
    }),
    error => error.code === 'sensitive_task_payload'
  );
});

test('Phase 6 migration enforces worker identity, explicit permissions, leases, capacity and audited terminal states', () => {
  for (const token of [
    'ai_worker_credentials','token_sha256','ai_execution_rate_buckets',
    "current_user <> 'service_role'",
    'minglora_ai_worker_authenticate','list_provider_health_targets','record_provider_health',
    'minglora_ai_activate_provider_assignment', "cap.capability_key='task_execution'",
    "perm.effect='allow'",
    "deny.effect='deny'",
    'for update skip locked',
    'worker_lease_expired',
    'reserve_provider_capacity',
    'task_execution_succeeded',
    'task_execution_failed',
    'task_retry_scheduled',
    "set status='cancelled'",
    'minglora_ai_task_history_command',
    'cost_limit_usd=0'
  ]) assert.ok(migration.includes(token), 'Missing Phase 6 guard: ' + token);
  assert.ok(migration.includes('revoke all on function public.minglora_ai_worker_command'));
  assert.ok(migration.includes('to service_role'));
});

test('runtime accepts worker auth only for the worker action allowlist and supports owner history/cancellation', () => {
  assert.match(runtime, /x-minglora-worker-token/);
  assert.match(runtime, /minglora_ai_worker_authenticate/);
  assert.match(runtime, /ai_provider_activate_assignment/);
  assert.match(runtime, /Worker credentials are restricted to AI worker execution commands/);
  assert.match(runtime, /supportedWorkerCommands/);
  assert.match(runtime, /minglora_ai_cancel_task/);
  assert.match(runtime, /minglora_ai_task_history_command/);
  assert.match(server, /startAIExecutionWorker/);
  assert.match(server, /\/tasks\/\:taskId\/events|parts\[2\] === 'events'/);
});
