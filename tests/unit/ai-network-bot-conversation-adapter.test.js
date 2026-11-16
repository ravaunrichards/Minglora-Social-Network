import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOpenAIBotConversation } from '../../backend/modules/ai-network/openai-creator-drafts.js';

const env = {
  OPENAI_API_KEY: 'private-openai-test-key',
  OPENAI_DEFAULT_MODEL: 'test-model',
  MINGLORA_AI_REQUEST_TIMEOUT_MS: '5000'
};
const bot = {
  id: '00000000-0000-4000-8000-000000000001',
  identityId: '00000000-0000-4000-8000-000000000002',
  name: 'Community Guide',
  purpose: 'Help the account owner understand community creation and creator tools.',
  tone: 'friendly',
  traits: ['helpful','patient'],
  expertise: 'Community education',
  primaryLanguage: 'en'
};
const response = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload
});
const clearModeration = () => response(200, {
  id: 'mod_test_123', model: 'omni-moderation-latest',
  results: [{ flagged: false, categories: {} }]
});
const generation = () => response(200, {
  id: 'resp_bot_123', status: 'completed', model: 'test-model',
  output: [{ type: 'message', role: 'assistant', content: [
    { type: 'output_text', text: 'Here is a helpful, private answer.' }
  ] }],
  usage: { input_tokens: 80, output_tokens: 45, total_tokens: 125 }
});

test('bot conversation moderates input and output and disables storage and all tools', async () => {
  const calls = [];
  const result = await generateOpenAIBotConversation({
    bot,
    message: 'How do I organize a community workshop?',
    history: [{ user_message: 'I run a creator community.', assistant_message: 'I can help with planning.' }],
    memories: [{ summary: 'Owner prefers practical checklists.', memory_content: { note: 'Keep replies clear.' } }],
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, payload: JSON.parse(options.body), headers: options.headers });
      return url.endsWith('/responses') ? generation() : clearModeration();
    }
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/moderations');
  assert.equal(calls[0].payload.input, 'How do I organize a community workshop?');
  assert.equal(calls[1].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[1].payload.model, 'test-model');
  assert.equal(calls[1].payload.store, false);
  assert.deepEqual(calls[1].payload.tools, []);
  assert.equal(calls[1].payload.input.at(-1).content, 'How do I organize a community workshop?');
  assert.equal(calls[1].payload.input[0].role, 'user');
  assert.match(calls[1].payload.instructions, /clearly disclosed Minglora AI BOT/);
  assert.match(calls[1].payload.instructions, /no tools/i);
  assert.match(calls[1].payload.instructions, /Owner-enabled memory context/);
  assert.equal(calls[2].url, 'https://api.openai.com/v1/moderations');
  assert.equal(calls[2].payload.input, result.output);
  assert.equal(result.output, 'Here is a helpful, private answer.');
  assert.equal(result.provider, 'openai');
  assert.equal(result.usage.total_tokens, 125);
  assert.equal(result.humanInitiated, true);
  assert.equal(result.aiDisclosureRequired, true);
  assert.equal(result.externalActionTaken, false);
  assert.equal(result.autonomousActionTaken, false);
  assert.equal(JSON.stringify(result).includes('private-openai-test-key'), false);
});

test('flagged member input is rejected before the Responses API is called', async () => {
  const calls = [];
  await assert.rejects(generateOpenAIBotConversation({
    bot, message: 'A sufficiently long test message.',
    env,
    fetchImpl: async url => {
      calls.push(url);
      return response(200, { results: [{ flagged: true }] });
    }
  }), error => error.code === 'moderation_blocked');
  assert.deepEqual(calls, ['https://api.openai.com/v1/moderations']);
});

test('flagged model output is never returned or marked as a completed turn', async () => {
  let moderationCalls = 0;
  let caught;
  await assert.rejects(generateOpenAIBotConversation({
    bot, message: 'A sufficiently long test message.', env,
    fetchImpl: async url => {
      if (url.endsWith('/responses')) return generation();
      moderationCalls += 1;
      return response(200, { results: [{ flagged: moderationCalls === 2 }] });
    }
  }), error => {
    caught = error;
    return error.code === 'moderation_blocked';
  });
  assert.equal(moderationCalls, 2);
  assert.equal(caught.usage.total_tokens, 125);
  assert.equal(caught.provider, 'openai');
  assert.equal(caught.responseId, 'resp_bot_123');
});

test('missing provider credentials and model prevent any provider request', async () => {
  let calls = 0;
  await assert.rejects(generateOpenAIBotConversation({
    bot, message: 'A sufficiently long test message.',
    env: { OPENAI_DEFAULT_MODEL: 'test-model' },
    fetchImpl: async () => { calls++; }
  }), error => error.code === 'missing_credentials');
  await assert.rejects(generateOpenAIBotConversation({
    bot, message: 'A sufficiently long test message.',
    env: { OPENAI_API_KEY: 'private-test' },
    fetchImpl: async () => { calls++; }
  }), error => error.code === 'missing_model');
  assert.equal(calls, 0);
});

test('invalid bot identity, oversized message and insecure provider endpoints are rejected', async () => {
  let calls = 0;
  await assert.rejects(generateOpenAIBotConversation({
    bot: { ...bot, identityId: '' }, message: 'A sufficiently long test message.', env,
    fetchImpl: async () => { calls++; }
  }), error => error.code === 'invalid_bot');
  await assert.rejects(generateOpenAIBotConversation({
    bot, message: 'x'.repeat(4001), env, fetchImpl: async () => { calls++; }
  }), error => error.code === 'invalid_message');
  await assert.rejects(generateOpenAIBotConversation({
    bot, message: 'A sufficiently long test message.',
    env: { ...env, OPENAI_BASE_URL: 'http://unsafe.example/v1' },
    fetchImpl: async () => { calls++; }
  }), error => error.code === 'invalid_endpoint');
  assert.equal(calls, 0);
});
