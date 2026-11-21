import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGeminiBotReply } from '../../backend/modules/ai-network/gemini-bot-chat.js';
import { createProviderCircuitStore } from '../../backend/modules/ai-network/provider-routing.js';

const env = {
  MINGLORA_AI_PROVIDER: 'google_gemini',
  GEMINI_API_KEY: 'private-gemini-test-key',
  GEMINI_DEFAULT_MODEL: 'gemini-test-model',
  MINGLORA_AI_MAX_RETRIES: '0'
};
const bot = {
  id: 'bot-1',
  identityId: 'identity-1',
  name: 'Minglora Guide',
  purpose: 'Help members understand the platform.',
  tone: 'friendly',
  traits: ['helpful', 'curious'],
  expertise: 'Community education',
  languages: ['en']
};
const identity = { identity_id: 'identity-1' };
const response = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: name => name.toLowerCase() === 'x-request-id' ? 'google-request-42' : null },
  json: async () => payload
});
const successPayload = overrides => ({
  candidates: [{
    content: { role: 'model', parts: [{ text: 'Hello from Gemini.' }] },
    finishReason: 'STOP',
    safetyRatings: [{ category: 'HARM_CATEGORY_HARASSMENT', probability: 'NEGLIGIBLE', blocked: false }]
  }],
  usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5, totalTokenCount: 25 },
  responseId: 'gemini-response-42',
  modelVersion: 'gemini-test-model',
  ...overrides
});

test('Gemini bot chat sends private REST credentials, history and safety settings then records usage', async () => {
  let request;
  const result = await generateGeminiBotReply({
    bot, identity,
    message: 'Can you help me plan a post?',
    history: [
      { role: 'user', content: 'I am a new creator.' },
      { role: 'assistant', content: 'Welcome to Minglora.' }
    ],
    memoryContext: { memoryEnabled: true, consented: true, entries: [
      { memory_type: 'short_term', summary: 'The owner prefers brief responses.' }
    ] },
    env,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(successPayload());
    },
    maxOutputTokens: 256,
    circuitStore: createProviderCircuitStore()
  });

  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['x-goog-api-key'], env.GEMINI_API_KEY);
  assert.equal(request.options.redirect, 'error');
  const body = JSON.parse(request.options.body);
  assert.equal(body.generationConfig.maxOutputTokens, 256);
  assert.equal(body.generationConfig.candidateCount, 1);
  assert.equal(body.contents.length, 3);
  assert.equal(body.contents[0].role, 'user');
  assert.equal(body.contents[1].role, 'model');
  assert.equal(body.contents[2].role, 'user');
  assert.match(body.systemInstruction.parts[0].text, /You are not a human/);
  assert.match(body.systemInstruction.parts[0].text, /no tools/);
  assert.match(body.systemInstruction.parts[0].text, /brief responses/);
  assert.equal(body.safetySettings.length, 4);
  assert.ok(body.safetySettings.every(item => item.threshold === 'BLOCK_MEDIUM_AND_ABOVE'));
  assert.equal('tools' in body, false);

  assert.equal(result.output, 'Hello from Gemini.');
  assert.equal(result.provider, 'google_gemini');
  assert.equal(result.model, 'gemini-test-model');
  assert.equal(result.responseId, 'gemini-response-42');
  assert.equal(result.requestId, 'google-request-42');
  assert.deepEqual(result.usage, { input_tokens: 20, output_tokens: 5, total_tokens: 25 });
  assert.equal(result.moderation.provider, 'google_gemini');
  assert.equal(result.moderation.blocked, false);
  assert.equal(result.aiDisclosureRequired, true);
  assert.equal(result.externalActionsTaken, false);
  assert.equal(JSON.stringify(result).includes(env.GEMINI_API_KEY), false);
});

test('Gemini bot chat fails closed when the prompt is blocked by provider safety filters', async () => {
  await assert.rejects(generateGeminiBotReply({
    bot, identity, message: 'A blocked request',
    env,
    fetchImpl: async () => response({
      promptFeedback: { blockReason: 'SAFETY' },
      candidates: [],
      usageMetadata: { promptTokenCount: 4, totalTokenCount: 4 }
    }),
    circuitStore: createProviderCircuitStore()
  }), error => error.code === 'moderation_blocked' && error.safeForClient === true);
});

test('Gemini bot chat does not return a model reply blocked by candidate safety filters', async () => {
  await assert.rejects(generateGeminiBotReply({
    bot, identity, message: 'A request',
    env,
    fetchImpl: async () => response({
      candidates: [{
        content: { parts: [{ text: 'This must not be saved.' }] },
        finishReason: 'SAFETY',
        safetyRatings: [{ category: 'HARM_CATEGORY_HATE_SPEECH', blocked: true }]
      }],
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 5, totalTokenCount: 9 }
    }),
    circuitStore: createProviderCircuitStore()
  }), error => error.code === 'moderation_blocked' && error.safeForClient === true);
});

test('Gemini bot chat refuses incomplete, unlinked and mismatched-provider requests without exposing secrets', async () => {
  let calls = 0;
  await assert.rejects(generateGeminiBotReply({
    bot, identity: { identity_id: 'other-identity' }, message: 'Hello',
    env, fetchImpl: async () => { calls += 1; },
    circuitStore: createProviderCircuitStore()
  }), error => error.code === 'identity_unlinked');
  await assert.rejects(generateGeminiBotReply({
    bot, identity, message: 'Hello',
    env: { ...env, MINGLORA_AI_PROVIDER: 'openai' },
    fetchImpl: async () => { calls += 1; },
    circuitStore: createProviderCircuitStore()
  }), error => error.code === 'provider_not_selected');
  await assert.rejects(generateGeminiBotReply({
    bot, identity, message: 'Hello',
    env: { MINGLORA_AI_PROVIDER: 'google_gemini' },
    fetchImpl: async () => { calls += 1; },
    circuitStore: createProviderCircuitStore()
  }), error => error.code === 'missing_credentials');
  await assert.rejects(generateGeminiBotReply({
    bot, identity, message: 'Hello',
    env: { ...env, GEMINI_DEFAULT_MODEL: '' },
    fetchImpl: async () => { calls += 1; },
    circuitStore: createProviderCircuitStore()
  }), error => error.code === 'missing_model');
  assert.equal(calls, 0);
});

test('Gemini bot chat rejects truncated replies rather than saving partial output', async () => {
  await assert.rejects(generateGeminiBotReply({
    bot, identity, message: 'Hello',
    env,
    fetchImpl: async () => response({
      candidates: [{
        content: { parts: [{ text: 'Partial reply.' }] },
        finishReason: 'MAX_TOKENS'
      }],
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 20, totalTokenCount: 28 }
    }),
    circuitStore: createProviderCircuitStore()
  }), error => error.code === 'incomplete_generation');
});
