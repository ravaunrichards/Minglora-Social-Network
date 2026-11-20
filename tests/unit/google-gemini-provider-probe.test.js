import test from 'node:test';
import assert from 'node:assert/strict';
import { probeGeminiProvider } from '../../backend/modules/ai-network/google-gemini-provider-probe.js';

test('Gemini probe verifies a model supports generateContent using a server-only API key', async () => {
  const calls = [];
  const result = await probeGeminiProvider({
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      GEMINI_DEFAULT_MODEL: 'gemini-3.1-flash-lite'
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: 'models/gemini-3.1-flash-lite',
          displayName: 'Gemini Flash Lite',
          supportedGenerationMethods: ['generateContent', 'countTokens']
        })
      };
    }
  });

  assert.equal(result.connected, true);
  assert.equal(result.healthStatus, 'healthy');
  assert.equal(result.providerId, 'google_gemini');
  assert.equal(result.model, 'gemini-3.1-flash-lite');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/models/gemini-3.1-flash-lite'));
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'test-gemini-key');
});

test('Gemini probe fails when the credential is rejected or model generation is unavailable', async () => {
  const rejected = await probeGeminiProvider({
    env: { GEMINI_API_KEY: 'bad-key', GEMINI_DEFAULT_MODEL: 'gemini-test' },
    fetchImpl: async () => ({ ok: false, status: 403 })
  });
  assert.equal(rejected.connected, false);
  assert.equal(rejected.status, 'forbidden');

  const unavailable = await probeGeminiProvider({
    env: { GEMINI_API_KEY: 'test-key', GEMINI_DEFAULT_MODEL: 'gemini-test' },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ name: 'models/gemini-test', supportedGenerationMethods: ['countTokens'] })
    })
  });
  assert.equal(unavailable.connected, false);
  assert.equal(unavailable.status, 'model_unavailable');
});

test('Gemini probe does not send requests when credentials or a valid model are missing', async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    throw new Error('No request should be sent.');
  };
  const noKey = await probeGeminiProvider({
    env: { GEMINI_DEFAULT_MODEL: 'gemini-test' }, fetchImpl
  });
  const noModel = await probeGeminiProvider({
    env: { GEMINI_API_KEY: 'test-key' }, fetchImpl
  });
  assert.equal(noKey.status, 'missing_credentials');
  assert.equal(noModel.status, 'missing_model');
  assert.equal(requests, 0);
});
