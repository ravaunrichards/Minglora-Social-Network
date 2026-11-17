import test from 'node:test';
import assert from 'node:assert/strict';
import { probeOpenAIProvider } from '../../backend/modules/ai-network/openai-provider-probe.js';

const fixedNow = () => new Date('2026-11-15T12:00:00.000Z');

test('OpenAI probe does not call the network when no private credential is configured', async () => {
  let calls = 0;
  const probe = await probeOpenAIProvider({
    env: { OPENAI_DEFAULT_MODEL: 'gpt-example' },
    fetchImpl: async () => { calls += 1; },
    now: fixedNow
  });
  assert.equal(calls, 0);
  assert.equal(probe.status, 'missing_credentials');
  assert.equal(probe.connected, false);
  assert.equal(probe.executionEnabled, false);
  assert.equal(probe.checkedAt, '2026-11-15T12:00:00.000Z');
});

test('OpenAI probe requires a configured model identifier and does not guess one', async () => {
  let calls = 0;
  const probe = await probeOpenAIProvider({
    env: { OPENAI_API_KEY: 'private-test-key' },
    fetchImpl: async () => { calls += 1; },
    now: fixedNow
  });
  assert.equal(calls, 0);
  assert.equal(probe.status, 'missing_model');
});

test('OpenAI probe uses a read-only model retrieval request and does not disclose the credential', async () => {
  let request;
  const probe = await probeOpenAIProvider({
    env: {
      OPENAI_API_KEY: 'private-test-key',
      OPENAI_DEFAULT_MODEL: 'gpt-example'
    },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'gpt-example', object: 'model', owned_by: 'openai' })
      };
    },
    now: fixedNow,
    timeoutMs: 5000
  });
  assert.equal(request.url, 'https://api.openai.com/v1/models/gpt-example');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers.Authorization, 'Bearer private-test-key');
  assert.equal(request.options.redirect, 'error');
  assert.equal(probe.status, 'healthy');
  assert.equal(probe.connected, true);
  assert.equal(probe.healthStatus, 'healthy');
  assert.equal(probe.inferenceAdapterAvailable, false);
  assert.equal(probe.executionEnabled, false);
  assert.equal(JSON.stringify(probe).includes('private-test-key'), false);
});

test('OpenAI probe supports the legacy generic key only when OpenAI is selected', async () => {
  let calls = 0;
  const missing = await probeOpenAIProvider({
    env: {
      MINGLORA_AI_PROVIDER: 'anthropic',
      MINGLORA_AI_API_KEY: 'must-not-be-used',
      MINGLORA_AI_MODEL: 'gpt-example'
    },
    fetchImpl: async () => { calls += 1; },
    now: fixedNow
  });
  assert.equal(missing.status, 'provider_not_selected');
  assert.equal(calls, 0);

  const legacy = await probeOpenAIProvider({
    env: {
      MINGLORA_AI_PROVIDER: 'openai',
      MINGLORA_AI_API_KEY: 'legacy-test-key',
      MINGLORA_AI_MODEL: 'gpt-example'
    },
    fetchImpl: async (_url, options) => {
      calls += 1;
      assert.equal(options.headers.Authorization, 'Bearer legacy-test-key');
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'gpt-example', object: 'model', owned_by: 'openai' })
      };
    },
    now: fixedNow
  });
  assert.equal(legacy.connected, true);
  assert.equal(calls, 1);
});

test('OpenAI unauthorized responses are safely reported without response-body or secret leakage', async () => {
  const probe = await probeOpenAIProvider({
    env: { OPENAI_API_KEY: 'private-test-key', OPENAI_DEFAULT_MODEL: 'gpt-example' },
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'private-test-key must not leak' } })
    }),
    now: fixedNow
  });
  assert.equal(probe.status, 'unauthorized');
  assert.equal(probe.connected, false);
  assert.equal(probe.httpStatus, 401);
  assert.equal(JSON.stringify(probe).includes('private-test-key'), false);
});

test('OpenAI probe distinguishes model access, timeout, network and endpoint failures', async () => {
  const forbidden = await probeOpenAIProvider({
    env: { OPENAI_API_KEY: 'test', OPENAI_DEFAULT_MODEL: 'gpt-example' },
    fetchImpl: async () => ({ ok: false, status: 403 }),
    now: fixedNow
  });
  assert.equal(forbidden.status, 'forbidden');

  const missingModel = await probeOpenAIProvider({
    env: { OPENAI_API_KEY: 'test', OPENAI_DEFAULT_MODEL: 'gpt-example' },
    fetchImpl: async () => ({ ok: false, status: 404 }),
    now: fixedNow
  });
  assert.equal(missingModel.status, 'model_unavailable');

  const timeout = await probeOpenAIProvider({
    env: { OPENAI_API_KEY: 'test', OPENAI_DEFAULT_MODEL: 'gpt-example' },
    fetchImpl: async () => { const error = new Error('timeout'); error.name = 'TimeoutError'; throw error; },
    now: fixedNow
  });
  assert.equal(timeout.status, 'timeout');

  const invalidEndpoint = await probeOpenAIProvider({
    env: { OPENAI_API_KEY: 'test', OPENAI_DEFAULT_MODEL: 'gpt-example', OPENAI_BASE_URL: 'http://untrusted.example/v1' },
    fetchImpl: async () => { throw new Error('must not be called'); },
    now: fixedNow
  });
  assert.equal(invalidEndpoint.status, 'invalid_endpoint');
});
