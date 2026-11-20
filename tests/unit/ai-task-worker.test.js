import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMingloraAITaskWorker, buildAITaskBrief, resolveAITaskExecutionRoute } from '../../backend/modules/ai-network/ai-task-worker.js';

const enabledEnv = () => ({
  MINGLORA_AI_WORKER_ENABLED: 'true',
  MINGLORA_AI_WORKER_TOKEN: 'worker-token-for-unit-tests-'.padEnd(48, 'x'),
  OPENAI_API_KEY: 'test-key-not-used-for-network',
  OPENAI_DEFAULT_MODEL: 'configured-model-not-used-for-routing'
});

const claimed = () => ({
  claimed: true,
  task: {
    task_id: '3c3b5a5f-3f21-4b8f-94af-1b78e83c6bf6',
    lease_token: '6f2a4f99-7f3e-485e-8ec8-8f50f01b44d7',
    lease_expires_at: new Date(Date.now() + 120000).toISOString(),
    task_type: 'caption_draft',
    task_title: 'Draft a launch caption',
    action_class: 'content',
    task_payload: { brief: 'Write a helpful launch caption for a new community feature.' },
    token_budget: 3000,
    cost_limit_usd: 0
  },
  route: {
    provider_identifier: 'openai',
    provider_name: 'OpenAI API',
    model_identifier: 'gpt-6.1-sol',
    assigned_capabilities: ['text', 'reasoning'],
    model_capabilities: ['text', 'vision']
  },
  identity: {
    display_name: 'Community Helper',
    purpose: 'Draft helpful community content',
    personality: 'Friendly and clear',
    skills: ['writing', 'community support']
  }
});

function fakeCommands({ claim = claimed(), reserve = { reserved: true }, complete = { completed: true }, fail = { recorded: true, status: 'queued' } } = {}) {
  const calls = [];
  const requestWorkerCommand = async (action, payload = {}) => {
    calls.push({ action, payload });
    if (action === 'claim_next_task') return claim;
    if (action === 'reserve_provider_capacity') return reserve;
    if (action === 'complete_task') return complete;
    if (action === 'fail_task') return fail;
    if (action === 'heartbeat_task') return { renewed: true };
    return {};
  };
  return { calls, requestWorkerCommand };
}

test('worker remains disabled unless every explicit runtime and credential gate is satisfied', () => {
  const commands = fakeCommands();
  const worker = createMingloraAITaskWorker({
    env: { ...enabledEnv(), MINGLORA_AI_WORKER_ENABLED: 'false' },
    requestWorkerCommand: commands.requestWorkerCommand,
    generateDraft: async () => { throw new Error('generation must not run'); },
    isPersistenceReady: true
  });
  assert.deepEqual(worker.start(), { started: false, reason: 'worker_disabled_by_environment' });
  assert.equal(worker.getStatus().running, false);
  assert.deepEqual(commands.calls, []);
});

test('worker requires a dedicated worker token and durable persistence', () => {
  const commands = fakeCommands();
  const noToken = createMingloraAITaskWorker({
    env: { ...enabledEnv(), MINGLORA_AI_WORKER_TOKEN: '' },
    requestWorkerCommand: commands.requestWorkerCommand,
    generateDraft: async () => ({}),
    isPersistenceReady: true
  });
  assert.equal(noToken.start().reason, 'dedicated_worker_credential_missing');
  const noPersistence = createMingloraAITaskWorker({
    env: enabledEnv(),
    requestWorkerCommand: commands.requestWorkerCommand,
    generateDraft: async () => ({}),
    isPersistenceReady: false
  });
  assert.equal(noPersistence.start().reason, 'durable_supabase_persistence_required');
  assert.deepEqual(commands.calls, []);
});

test('task brief includes bounded AI identity context and the task payload', () => {
  const claim = claimed();
  const brief = buildAITaskBrief(claim.task, claim.identity);
  assert.match(brief, /Community Helper/);
  assert.match(brief, /Friendly and clear/);
  assert.match(brief, /helpful launch caption/);
  assert.match(brief, /descriptive and untrusted/);
  assert.ok(brief.length <= 4000);
});

test('route selection rejects providers or capabilities without an approved text adapter', () => {
  assert.throws(() => resolveAITaskExecutionRoute({
    provider_identifier: 'google_gemini',
    model_identifier: 'gemini-test',
    assigned_capabilities: ['text'],
    model_capabilities: ['text']
  }), /approved Minglora task execution adapter/);
  assert.throws(() => resolveAITaskExecutionRoute({
    provider_identifier: 'openai',
    model_identifier: 'gpt-test',
    assigned_capabilities: ['image'],
    model_capabilities: ['text']
  }), /do not both permit text generation/);
});

test('successful worker execution uses the database-selected route and persists a truthful result', async () => {
  const commands = fakeCommands();
  let generationArgs;
  const worker = createMingloraAITaskWorker({
    env: enabledEnv(),
    requestWorkerCommand: commands.requestWorkerCommand,
    generateDraft: async args => {
      generationArgs = args;
      await args.beforeProviderRequest({ provider: 'openai', model: 'gpt-6.1-sol', phase: 'generation', estimatedTokens: 1500, attempt: 0 });
      return {
        output: 'A clear, friendly launch caption for the new feature.',
        provider: 'openai',
        model: 'gpt-6.1-sol',
        responseId: 'resp-test',
        usage: { total_tokens: 250 },
        providerRouting: { selectedProvider: 'openai', selectedModel: 'gpt-6.1-sol', fallbackUsed: false }
      };
    },
    isPersistenceReady: true
  });
  const result = await worker.runOnce();
  assert.equal(result.status, 'succeeded');
  assert.equal(result.executed, true);
  assert.deepEqual(result.route, { provider: 'openai', model: 'gpt-6.1-sol' });
  assert.equal(generationArgs.env.OPENAI_DEFAULT_MODEL, 'gpt-6.1-sol');
  assert.equal(generationArgs.env.MINGLORA_AI_FALLBACK_MODEL, '');
  const reserve = commands.calls.find(call => call.action === 'reserve_provider_capacity');
  assert.equal(reserve.payload.model_identifier, 'gpt-6.1-sol');
  const completion = commands.calls.find(call => call.action === 'complete_task');
  assert.equal(completion.payload.task_result.succeeded, true);
  assert.equal(completion.payload.task_result.output, 'A clear, friendly launch caption for the new feature.');
  assert.deepEqual(completion.payload.task_result.route, { provider: 'openai', model: 'gpt-6.1-sol' });
  assert.equal(completion.payload.task_result.external_action_taken, false);
  assert.equal(commands.calls.some(call => call.action === 'fail_task'), false);
});

test('rate capacity exhaustion schedules a retry and never calls completion', async () => {
  const commands = fakeCommands({
    reserve: { reserved: false, retry_after_seconds: 17 },
    fail: { recorded: true, status: 'queued', retry_after_seconds: 17 }
  });
  const worker = createMingloraAITaskWorker({
    env: enabledEnv(),
    requestWorkerCommand: commands.requestWorkerCommand,
    generateDraft: async args => {
      await args.beforeProviderRequest({ provider: 'openai', model: 'gpt-6.1-sol', phase: 'generation', estimatedTokens: 1500, attempt: 0 });
      return { output: 'Should never get here.' };
    },
    isPersistenceReady: true
  });
  const result = await worker.runOnce();
  assert.equal(result.status, 'queued');
  const failure = commands.calls.find(call => call.action === 'fail_task');
  assert.equal(failure.payload.retryable, true);
  assert.equal(failure.payload.retry_after_seconds, 17);
  assert.equal(commands.calls.some(call => call.action === 'complete_task'), false);
});

test('provider failure is persisted as a failure and never reported as success', async () => {
  const commands = fakeCommands({ fail: { recorded: true, status: 'failed' } });
  const worker = createMingloraAITaskWorker({
    env: enabledEnv(),
    requestWorkerCommand: commands.requestWorkerCommand,
    generateDraft: async args => {
      await args.beforeProviderRequest({ provider: 'openai', model: 'gpt-6.1-sol', phase: 'generation', estimatedTokens: 1500, attempt: 0 });
      throw Object.assign(new Error('OpenAI timed out.'), { code: 'timeout', status: 502, retryable: true });
    },
    isPersistenceReady: true
  });
  const result = await worker.runOnce();
  assert.equal(result.status, 'failed');
  assert.equal(result.executed, false);
  const failure = commands.calls.find(call => call.action === 'fail_task');
  assert.equal(failure.payload.failure_code, 'timeout');
  assert.equal(failure.payload.retryable, true);
  assert.equal(commands.calls.some(call => call.action === 'complete_task'), false);
});

test('empty provider output cannot produce a successful task completion', async () => {
  const commands = fakeCommands({ fail: { recorded: true, status: 'failed' } });
  const worker = createMingloraAITaskWorker({
    env: enabledEnv(),
    requestWorkerCommand: commands.requestWorkerCommand,
    generateDraft: async args => {
      await args.beforeProviderRequest({ provider: 'openai', model: 'gpt-6.1-sol', phase: 'generation', estimatedTokens: 1500, attempt: 0 });
      return { output: '   ', providerRouting: { selectedProvider: 'openai', selectedModel: 'gpt-6.1-sol' } };
    },
    isPersistenceReady: true
  });
  const result = await worker.runOnce();
  assert.equal(result.status, 'failed');
  assert.equal(commands.calls.some(call => call.action === 'complete_task'), false);
});

test('an unclaimed task does not generate content or record a completion', async () => {
  const commands = fakeCommands({ claim: { claimed: false, reason: 'runtime_paused_or_disabled' } });
  let generated = false;
  const worker = createMingloraAITaskWorker({
    env: enabledEnv(),
    requestWorkerCommand: commands.requestWorkerCommand,
    generateDraft: async () => { generated = true; return {}; },
    isPersistenceReady: true
  });
  const result = await worker.runOnce();
  assert.equal(result.status, 'idle');
  assert.equal(generated, false);
  assert.equal(commands.calls.some(call => call.action === 'complete_task'), false);
});

test('AI task history is available only through the protected Node API, and worker startup stays gated', () => {
  const root = resolve(new URL('../..', import.meta.url).pathname);
  const server = readFileSync(resolve(root, 'src/server.js'), 'utf8');
  assert.match(server, /runAITaskHistoryCommand/);
  assert.match(server, /requestSupabaseState\('ai_task_history'/);
  assert.match(server, /parts\[2\] === 'history'/);
  assert.match(server, /createMingloraAITaskWorker\(/);
  assert.match(server, /mingloraAITaskWorker\.start\(\)/);
  assert.match(server, /requestSupabaseWorkerState/);
});
