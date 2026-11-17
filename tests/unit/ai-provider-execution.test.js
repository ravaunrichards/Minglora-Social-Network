import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAIProviderReply, listAIProviderExecutionAdapters, probeAssignedProvider } from '../../backend/modules/ai-network/provider-execution.js';

const assignment = {
  assignment_id: 'assignment-1',
  provider_name: 'openai',
  model_identifier: 'assigned-model-v2',
  assignment_status: 'active',
  provider_health_status: 'healthy',
  provider_account_status: 'configured',
  account_type: 'managed',
  provider_account_health_status: 'healthy',
  text_capability: true,
  assigned_capabilities: ['text']
};
const identity = { identity_id: 'identity-1' };
const bot = { id: 'bot-1', identityId: 'identity-1', name: 'Minglora AI', purpose: 'Helpful assistant' };
const response = (status, payload) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const clear = () => response(200, { model: 'omni-moderation-latest', results: [{ flagged: false }] });
const generated = () => response(200, {
  id: 'resp_assigned_model', status: 'completed', model: 'assigned-model-v2',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Reply from the assigned model.' }] }],
  usage: { input_tokens: 21, output_tokens: 9, total_tokens: 30 }
});

test('only adapters with real server-side implementations are advertised', () => {
  assert.deepEqual(listAIProviderExecutionAdapters(), ['openai']);
});

test('assigned provider probe uses the database-selected model rather than a global default', async () => {
  let requestedUrl = '';
  const result = await probeAssignedProvider({
    providerName: 'openai',
    modelIdentifier: 'assigned-model-v2',
    accountType: 'managed',
    env: {
      OPENAI_API_KEY: 'server-only-test-key',
      OPENAI_DEFAULT_MODEL: 'wrong-global-model',
      MINGLORA_AI_PROVIDER: 'anthropic',
      MINGLORA_AI_API_KEY: 'must-not-be-used'
    },
    fetchImpl: async (url, options) => {
      requestedUrl = requestedUrl || url;
      assert.equal(options.headers.Authorization, 'Bearer server-only-test-key');
      if (url.endsWith('/models/assigned-model-v2')) {
        return response(200, { id: 'assigned-model-v2', object: 'model', owned_by: 'openai' });
      }
      if (url.endsWith('/moderations')) return clear();
      if (url.endsWith('/responses')) return generated();
      throw new Error('Unexpected provider endpoint: ' + url);
    },
    now: () => new Date('2026-11-17T22:00:00.000Z')
  });
  assert.equal(requestedUrl, 'https://api.openai.com/v1/models/assigned-model-v2');
  assert.equal(result.connected, true);
  assert.equal(result.model, 'assigned-model-v2');
  assert.equal(result.inferenceAdapterAvailable, true);
  assert.equal(result.inferenceVerified, true);
  assert.equal(result.executionEnabled, false);
  assert.equal(JSON.stringify(result).includes('server-only-test-key'), false);
});

test('user-managed provider accounts cannot be verified using Minglora platform credentials', async () => {
  let calls = 0;
  const result = await probeAssignedProvider({
    providerName: 'openai',
    modelIdentifier: 'assigned-model-v2',
    accountType: 'user',
    env: { OPENAI_API_KEY: 'must-not-be-used' },
    fetchImpl: async () => { calls += 1; }
  });
  assert.equal(calls, 0);
  assert.equal(result.status, 'managed_account_required');
  assert.equal(result.connected, false);
  assert.equal(result.executionEnabled, false);
});

test('model access without a successful text inference check does not mark the provider healthy', async () => {
  const result = await probeAssignedProvider({
    providerName: 'openai',
    modelIdentifier: 'assigned-model-v2',
    accountType: 'managed',
    env: { OPENAI_API_KEY: 'server-only-test-key' },
    fetchImpl: async url => {
      if (url.endsWith('/models/assigned-model-v2')) {
        return response(200, { id: 'assigned-model-v2', object: 'model', owned_by: 'openai' });
      }
      if (url.endsWith('/moderations')) return clear();
      if (url.endsWith('/responses')) return response(403, { error: { message: 'forbidden' } });
      throw new Error('Unexpected provider endpoint: ' + url);
    }
  });
  assert.equal(result.connected, false);
  assert.equal(result.healthStatus, 'unavailable');
  assert.equal(result.inferenceVerified, false);
  assert.equal(result.executionEnabled, false);
});

test('provider without an installed adapter stays inactive and does not make a network request', async () => {
  let calls = 0;
  const result = await probeAssignedProvider({
    providerName: 'anthropic',
    modelIdentifier: 'claude-example',
    fetchImpl: async () => { calls += 1; }
  });
  assert.equal(calls, 0);
  assert.equal(result.status, 'adapter_unavailable');
  assert.equal(result.connected, false);
  assert.equal(result.inferenceAdapterAvailable, false);
});

test('chat dispatch uses exact assigned model and applies both input and output moderation', async () => {
  const calls = [];
  const result = await generateAIProviderReply({
    assignment,
    bot,
    identity,
    message: 'Please introduce yourself.',
    env: {
      OPENAI_API_KEY: 'server-only-test-key',
      OPENAI_DEFAULT_MODEL: 'wrong-global-model',
      MINGLORA_AI_PROVIDER: 'anthropic',
      MINGLORA_AI_API_KEY: 'must-not-be-used'
    },
    fetchImpl: async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer server-only-test-key');
      calls.push({ url, payload: options.body ? JSON.parse(options.body) : {} });
      if (url.endsWith('/responses')) return generated();
      return clear();
    }
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[1].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[1].payload.model, 'assigned-model-v2');
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'assigned-model-v2');
  assert.equal(result.output, 'Reply from the assigned model.');
  assert.equal(result.externalActionsTaken, false);
  assert.equal(JSON.stringify(result).includes('server-only-test-key'), false);
});

test('inactive assignments and mismatched AI identities are rejected before provider calls', async () => {
  let calls = 0;
  await assert.rejects(generateAIProviderReply({
    assignment: { ...assignment, assignment_status: 'pending' },
    bot, identity, message: 'Hello',
    env: { OPENAI_API_KEY: 'test' },
    fetchImpl: async () => { calls += 1; }
  }), error => error.code === 'provider_assignment_inactive');
  await assert.rejects(generateAIProviderReply({
    assignment,
    bot,
    identity: { identity_id: 'another-identity' },
    message: 'Hello',
    env: { OPENAI_API_KEY: 'test' },
    fetchImpl: async () => { calls += 1; }
  }), error => error.code === 'identity_unlinked');
  assert.equal(calls, 0);
});

test('identity execution never falls back to a legacy global provider credential', async () => {
  let calls = 0;
  await assert.rejects(generateAIProviderReply({
    assignment,
    bot,
    identity,
    message: 'Hello',
    env: { MINGLORA_AI_PROVIDER: 'openai', MINGLORA_AI_API_KEY: 'legacy-global-key' },
    fetchImpl: async () => { calls += 1; }
  }), error => error.code === 'missing_credentials');
  assert.equal(calls, 0);
});
