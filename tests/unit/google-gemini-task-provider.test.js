import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGeminiTaskOutput } from '../../backend/modules/ai-network/google-gemini-task-provider.js';

const task = (overrides = {}) => ({
  task_id: '11111111-1111-4111-8111-111111111111',
  task_type: 'text.generate',
  action_class: 'content',
  task_payload: { prompt: 'Write a short welcome note for a new community member.' },
  ...overrides
});
const route = { route_id: '22222222-2222-4222-8222-222222222222', provider: 'google_gemini', model: 'gemini-2.5-flash' };
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'gemini-request-test' },
  json: async () => data
});
const safeCandidate = (text = 'Welcome to Minglora.') => ({
  finishReason: 'STOP',
  safetyRatings: [
    { category: 'HARM_CATEGORY_HARASSMENT', probability: 'NEGLIGIBLE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'NEGLIGIBLE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', probability: 'NEGLIGIBLE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'NEGLIGIBLE' }
  ],
  content: { parts: [{ text }] }
});

test('Gemini adapter sends server-only key, assigned model and restrictive safety settings without tools', async () => {
  const requests = [];
  const result = await generateGeminiTaskOutput({
    task: task(),
    route,
    identityContext: { personality: { tone: 'warm', style: 'concise' } },
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, options, body });
      return response({
        responseId: 'gemini-response-id',
        modelVersion: 'gemini-2.5-flash-001',
        candidates: [safeCandidate()],
        usageMetadata: { promptTokenCount: 24, candidatesTokenCount: 12, totalTokenCount: 36 }
      });
    }
  });

  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.endsWith('/models/gemini-2.5-flash:generateContent'));
  assert.equal(requests[0].options.headers['x-goog-api-key'], 'test-gemini-key');
  assert.ok(!requests[0].url.includes('test-gemini-key'));
  assert.equal(requests[0].body.generationConfig.maxOutputTokens, 700);
  assert.equal(requests[0].body.safetySettings.length, 4);
  assert.ok(requests[0].body.safetySettings.every(setting => setting.threshold === 'BLOCK_LOW_AND_ABOVE'));
  assert.ok(!Object.hasOwn(requests[0].body, 'tools'));
  assert.ok(!Object.hasOwn(requests[0].body, 'toolConfig'));
  assert.ok(requests[0].body.contents[0].parts[0].text.includes('"tone":"warm"'));
  assert.ok(requests[0].body.contents[0].parts[0].text.includes('TASK_INPUT:'));
  assert.equal(result.output, 'Welcome to Minglora.');
  assert.equal(result.provider, 'google_gemini');
  assert.equal(result.model, route.model);
  assert.equal(result.provider_request_id, 'gemini-request-test');
  assert.deepEqual(result.usage, { input_tokens: 24, output_tokens: 12, total_tokens: 36 });
  assert.deepEqual(result.moderation, {
    input_flagged: false,
    output_flagged: false,
    provider_safety_settings: 'BLOCK_LOW_AND_ABOVE'
  });
  assert.equal(result.external_action_taken, false);
});

test('Gemini input block is a failure and cannot return generated output', async () => {
  await assert.rejects(generateGeminiTaskOutput({
    task: task(),
    route,
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetchImpl: async () => response({
      promptFeedback: { blockReason: 'SAFETY' },
      candidates: []
    })
  }), error => error.code === 'moderation_blocked' && error.retryable === false);
});

test('Gemini candidate safety rating blocks the output and does not produce success', async () => {
  await assert.rejects(generateGeminiTaskOutput({
    task: task(),
    route,
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetchImpl: async () => response({
      candidates: [{
        ...safeCandidate('unsafe output'),
        safetyRatings: [{ category: 'HARM_CATEGORY_HARASSMENT', probability: 'LOW' }]
      }]
    })
  }), error => error.code === 'moderation_blocked');
});

test('Gemini route, task class, secret-bearing payload and credentials fail closed', async () => {
  const env = { GEMINI_API_KEY: 'test-gemini-key' };
  await assert.rejects(generateGeminiTaskOutput({
    task: task(), route: { ...route, provider: 'openai' }, env,
    fetchImpl: async () => { throw new Error('Provider must not be called.'); }
  }), error => error.code === 'provider_adapter_unavailable');

  await assert.rejects(generateGeminiTaskOutput({
    task: task({ action_class: 'external' }), route, env,
    fetchImpl: async () => { throw new Error('Provider must not be called.'); }
  }), error => error.code === 'unsupported_action_class');

  await assert.rejects(generateGeminiTaskOutput({
    task: task({ task_payload: { prompt: 'Prepare a welcome note.', api_key: 'do-not-send' } }),
    route, env, fetchImpl: async () => { throw new Error('Provider must not be called.'); }
  }), error => error.code === 'unsafe_payload');

  await assert.rejects(generateGeminiTaskOutput({
    task: task(), route, env: {},
    fetchImpl: async () => { throw new Error('Provider must not be called.'); }
  }), error => error.code === 'missing_credentials');
});

test('Gemini quota errors are marked retryable for durable task retry', async () => {
  await assert.rejects(generateGeminiTaskOutput({
    task: task(),
    route,
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetchImpl: async () => response({ error: { message: 'quota' } }, 429)
  }), error => error.code === 'rate_limited' && error.retryable === true);
});
