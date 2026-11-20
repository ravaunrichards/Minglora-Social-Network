import test from 'node:test';
import assert from 'node:assert/strict';
import {
  processClaimedAITask,
  startAITaskWorker
} from '../../backend/modules/ai-network/task-worker.js';

const sampleClaim = () => ({
  claimed: true,
  task: {
    task_id: '11111111-1111-4111-8111-111111111111',
    task_type: 'text.generate',
    action_class: 'content',
    task_payload: { prompt: 'Write a concise welcome message for a new member.' }
  },
  route: {
    route_id: '22222222-2222-4222-8222-222222222222',
    provider: 'openai',
    model: 'gpt-test'
  },
  lease_token: '33333333-3333-4333-8333-333333333333'
});

test('claimed task is successful only after the database confirms complete_task', async () => {
  const calls = [];
  const result = await processClaimedAITask(sampleClaim(), {
    heartbeatMs: 0,
    callWorker: async (action, payload) => {
      calls.push({ action, payload });
      if (action === 'complete_task') return { completed: true, status: 'succeeded' };
      throw new Error('Unexpected worker action: ' + action);
    },
    executeTask: async () => ({
      output: 'Welcome to Minglora.',
      provider: 'openai',
      model: 'gpt-test',
      usage: { input_tokens: 12, output_tokens: 5, total_tokens: 17 },
      moderation: { input_flagged: false, output_flagged: false },
      external_action_taken: false
    })
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.routeId, sampleClaim().route.route_id);
  assert.deepEqual(calls.map(item => item.action), ['complete_task']);
  assert.equal(calls[0].payload.task_result.output, 'Welcome to Minglora.');
  assert.equal(calls[0].payload.task_result.external_action_taken, false);
});

test('provider failures are recorded through fail_task and never complete the task', async () => {
  const calls = [];
  const result = await processClaimedAITask(sampleClaim(), {
    heartbeatMs: 0,
    callWorker: async (action, payload) => {
      calls.push({ action, payload });
      if (action === 'fail_task') return { completed: false, status: 'failed' };
      throw new Error('Unexpected worker action: ' + action);
    },
    executeTask: async () => {
      throw Object.assign(new Error('Provider returned a retryable server error.'), {
        code: 'provider_error',
        safeForClient: true,
        retryable: true
      });
    }
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(calls.map(item => item.action), ['fail_task']);
  assert.equal(calls[0].payload.error_code, 'provider_error');
  assert.equal(calls[0].payload.retryable, true);
});

test('a lost lease aborts provider execution and does not report success', async () => {
  const calls = [];
  const result = await processClaimedAITask(sampleClaim(), {
    heartbeatMs: 5,
    callWorker: async action => {
      calls.push(action);
      if (action === 'heartbeat_task') throw new Error('Lease expired.');
      if (action === 'fail_task') return { completed: false, status: 'failed' };
      throw new Error('Unexpected worker action: ' + action);
    },
    executeTask: async ({ signal }) => new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      signal.addEventListener('abort', () => reject(signal.reason || new Error('aborted')), { once: true });
    })
  });

  assert.notEqual(result.status, 'succeeded');
  assert.ok(calls.includes('heartbeat_task'));
  assert.ok(calls.includes('fail_task'));
  assert.ok(!calls.includes('complete_task'));
});

test('task completion is not reported when the database refuses completion', async () => {
  const calls = [];
  const result = await processClaimedAITask(sampleClaim(), {
    heartbeatMs: 0,
    callWorker: async action => {
      calls.push(action);
      if (action === 'complete_task') return { completed: false, status: 'running' };
      if (action === 'fail_task') return { completed: false, status: 'failed' };
      throw new Error('Unexpected worker action: ' + action);
    },
    executeTask: async () => ({
      output: 'A result that the database did not accept.',
      provider: 'openai',
      model: 'gpt-test',
      moderation: { input_flagged: false, output_flagged: false },
      external_action_taken: false
    })
  });

  assert.notEqual(result.status, 'succeeded');
  assert.deepEqual(calls, ['complete_task', 'fail_task']);
});

test('worker is disabled by default and refuses incomplete credentials', () => {
  const logger = { info() {}, warn() {}, error() {} };
  const disabled = startAITaskWorker({ env: {}, logger });
  assert.equal(disabled.enabled, false);

  const invalid = startAITaskWorker({
    env: { MINGLORA_AI_WORKER_ENABLED: 'true', SUPABASE_URL: 'https://example.supabase.co' },
    logger
  });
  assert.equal(invalid.enabled, false);
  assert.equal(invalid.reason, 'worker_configuration_missing');
});
