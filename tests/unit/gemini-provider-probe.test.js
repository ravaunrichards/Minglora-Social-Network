import test from 'node:test';
import assert from 'node:assert/strict';
import { probeGeminiProvider } from '../../backend/modules/ai-network/gemini-provider-probe.js';

const fixedNow = () => new Date('2026-11-15T12:00:00.000Z');
const baseEnv = {
  GEMINI_API_KEY: 'private-gemini-test-key',
  GEMINI_DEFAULT_MODEL: 'gemini-test-model'
};
const modelResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload
});

test('Gemini probe does not call the network when no private credential is configured', async () => {
  let calls = 0;
  const probe = await probeGeminiProvider({
    env: { GEMINI_DEFAULT_MODEL: 'gemini-test-model' },
    fetchImpl: async () => { calls += 1; },
    now: fixedNow
  });
  assert.equal(calls, 0);
  assert.equal(probe.status, 'missing_credentials');
  assert.equal(probe.connected, false);
  assert.equal(probe.executionEnabled, false);
  assert.equal(probe.providerId, 'google_gemini');
  assert.equal(probe.checkedAt, '2026-11-15T12:00:00.000Z');
});

test('Gemini probe requires a model identifier and never invents one', async () => {
  let calls = 0;
  const probe = await probeGeminiProvider({
    env: { GEMINI_API_KEY: 'private-gemini-test-key' },
    fetchImpl: async () => { calls += 1; },
    now: fixedNow
  });
  assert.equal(calls, 0);
  assert.equal(probe.status, 'missing_model');
});

test('Gemini probe uses a read-only GET and keeps the API key out of the URL and result', async () => {
  let request;
  const probe = await probeGeminiProvider({
    env: baseEnv,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return modelResponse(200, {
        name: 'models/gemini-test-model',
        supportedGenerationMethods: ['generateContent', 'countTokens']
      });
    },
    now: fixedNow,
    timeoutMs: 5000
  });
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers['x-goog-api-key'], baseEnv.GEMINI_API_KEY);
  assert.equal(request.options.redirect, 'error');
  assert.equal(probe.status, 'healthy');
  assert.equal(probe.connected, true);
  assert.equal(probe.healthStatus, 'healthy');
  assert.equal(probe.inferenceAdapterAvailable, true);
  assert.equal(probe.executionEnabled, false);
  assert.equal(JSON.stringify(probe).includes(baseEnv.GEMINI_API_KEY), false);
  assert.equal(request.url.includes(baseEnv.GEMINI_API_KEY), false);
});

test('Gemini probe recognizes the alternate Google AI Studio key name', async () => {
  let calls = 0;
  const probe = await probeGeminiProvider({
    env: {
      GOOGLE_AI_API_KEY: 'private-google-ai-test-key',
      GEMINI_DEFAULT_MODEL: 'gemini-test-model'
    },
    fetchImpl: async (_url, options) => {
      calls += 1;
      assert.equal(options.headers['x-goog-api-key'], 'private-google-ai-test-key');
      return modelResponse(200, {
        name: 'models/gemini-test-model',
        supportedGenerationMethods: ['generateContent']
      });
    },
    now: fixedNow
  });
  assert.equal(calls, 1);
  assert.equal(probe.connected, true);
});

test('Gemini probe distinguishes unauthorized, forbidden, missing model and unsupported generation models', async () => {
  const unauthorized = await probeGeminiProvider({
    env: baseEnv, fetchImpl: async () => modelResponse(401, { error: { message: 'secret must not leak' } }), now: fixedNow
  });
  assert.equal(unauthorized.status, 'unauthorized');
  assert.equal(unauthorized.httpStatus, 401);

  const forbidden = await probeGeminiProvider({
    env: baseEnv, fetchImpl: async () => modelResponse(403, {}), now: fixedNow
  });
  assert.equal(forbidden.status, 'forbidden');

  const missing = await probeGeminiProvider({
    env: baseEnv, fetchImpl: async () => modelResponse(404, {}), now: fixedNow
  });
  assert.equal(missing.status, 'model_unavailable');

  const unsupported = await probeGeminiProvider({
    env: baseEnv,
    fetchImpl: async () => modelResponse(200, {
      name: 'models/gemini-test-model',
      supportedGenerationMethods: ['embedContent']
    }),
    now: fixedNow
  });
  assert.equal(unsupported.status, 'unsupported_model');
  assert.equal(unsupported.connected, false);
});

test('Gemini probe rejects unsafe custom endpoints and reports timeouts without leaking credentials', async () => {
  let calls = 0;
  const invalid = await probeGeminiProvider({
    env: { ...baseEnv, GEMINI_BASE_URL: 'http://untrusted.example/v1beta' },
    fetchImpl: async () => { calls += 1; },
    now: fixedNow
  });
  assert.equal(invalid.status, 'invalid_endpoint');
  assert.equal(calls, 0);

  const timeout = await probeGeminiProvider({
    env: baseEnv,
    fetchImpl: async () => { const error = new Error('timeout'); error.name = 'TimeoutError'; throw error; },
    now: fixedNow
  });
  assert.equal(timeout.status, 'timeout');
  assert.equal(timeout.connected, false);
  assert.equal(JSON.stringify(timeout).includes(baseEnv.GEMINI_API_KEY), false);
});
