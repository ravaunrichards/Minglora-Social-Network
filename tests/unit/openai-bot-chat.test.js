import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOpenAIBotReply } from '../../backend/modules/ai-network/openai-bot-chat.js';

const env = { OPENAI_API_KEY: 'private-openai-test-key', OPENAI_DEFAULT_MODEL: 'test-model' };
const response = (status, payload) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const clear = () => response(200, { model: 'omni-moderation-latest', results: [{ flagged: false }] });
const generated = () => response(200, {
  id: 'resp_bot_test', status: 'completed', model: 'test-model',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hello. I am an AI assistant.' }] }],
  usage: { input_tokens: 40, output_tokens: 20, total_tokens: 60 }
});
const bot = {
  id: 'bot-1', identityId: 'identity-1', name: 'Minglora Guide', firstName: 'Minglora',
  lastName: 'Guide', purpose: 'Helps the owner understand and draft creator content.',
  tone: 'friendly', traits: ['helpful','curious'], expertise: 'creator education', languages: ['en']
};
const identity = { identity_id: 'identity-1' };

test('bot chat moderates message, uses no tools or server-side storage, moderates reply and returns AI disclosure', async () => {
  const calls = [];
  const result = await generateOpenAIBotReply({
    bot, identity, message: 'Can you explain how to plan a creator post?',
    history: [{ role: 'user', content: 'I am learning Creator Studio.' }],
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, payload: JSON.parse(options.body) });
      if (url.endsWith('/responses')) return generated();
      return clear();
    }
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/moderations');
  assert.equal(calls[0].payload.input, 'Can you explain how to plan a creator post?');
  assert.equal(calls[1].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[1].payload.store, false);
  assert.deepEqual(calls[1].payload.tools, []);
  assert.equal(calls[1].payload.input.at(-1).role, 'user');
  assert.equal(calls[1].payload.input.at(-1).content[0].text, 'Can you explain how to plan a creator post?');
  assert.equal(calls[2].url, 'https://api.openai.com/v1/moderations');
  assert.equal(calls[2].payload.input, result.output);
  assert.equal(result.output, 'Hello. I am an AI assistant.');
  assert.equal(result.moderation.flagged, false);
  assert.equal(result.aiDisclosureRequired, true);
  assert.equal(result.externalActionsTaken, false);
  assert.equal(result.usage.total_tokens, 60);
  assert.equal(JSON.stringify(result).includes('private-openai-test-key'), false);
});

test('bot chat rejects missing credentials/model, mismatched identity and wrong selected provider before network calls', async () => {
  let calls = 0;
  const request = { bot, identity, message: 'Please help me understand this topic.', fetchImpl: async () => { calls++; } };
  await assert.rejects(generateOpenAIBotReply({ ...request, env: { OPENAI_DEFAULT_MODEL: 'test-model' } }), error => error.code === 'missing_credentials');
  await assert.rejects(generateOpenAIBotReply({ ...request, env: { OPENAI_API_KEY: 'test' } }), error => error.code === 'missing_model');
  await assert.rejects(generateOpenAIBotReply({ ...request, identity: { identity_id: 'another-id' }, env }), error => error.code === 'identity_unlinked');
  await assert.rejects(generateOpenAIBotReply({ ...request, env: { ...env, MINGLORA_AI_PROVIDER: 'anthropic' } }), error => error.code === 'provider_not_selected');
  assert.equal(calls, 0);
});

test('a flagged user message never reaches the Responses API', async () => {
  const urls = [];
  await assert.rejects(generateOpenAIBotReply({
    bot, identity, message: 'A message for the moderation test.', env,
    fetchImpl: async url => {
      urls.push(url);
      return response(200, { results: [{ flagged: true }] });
    }
  }), error => error.code === 'moderation_blocked');
  assert.deepEqual(urls, ['https://api.openai.com/v1/moderations']);
});

test('unmoderated or flagged AI output is never returned as a reply', async () => {
  let moderationCount = 0;
  await assert.rejects(generateOpenAIBotReply({
    bot, identity, message: 'Please answer a simple question.', env,
    fetchImpl: async url => {
      if (url.endsWith('/responses')) return generated();
      moderationCount++;
      return response(200, { results: [{ flagged: moderationCount === 2 }] });
    }
  }), error => error.code === 'moderation_blocked');
  assert.equal(moderationCount, 2);
});

test('billed usage is retained in safe error metadata when moderation after generation fails', async () => {
  let moderationCount = 0;
  let thrown;
  await assert.rejects(generateOpenAIBotReply({
    bot, identity, message: 'Please provide a short answer.', env,
    fetchImpl: async url => {
      if (url.endsWith('/responses')) return generated();
      moderationCount++;
      return moderationCount === 1 ? clear() : response(503, {});
    }
  }), error => {
    thrown = error;
    return error.code === 'provider_error';
  });
  assert.equal(thrown.provider, 'openai');
  assert.equal(thrown.usage.total_tokens, 60);
  assert.equal(JSON.stringify(thrown).includes('private-openai-test-key'), false);
});


test('owner-consented memory is provided as bounded untrusted context and long-term entries require separate consent', async () => {
  let generationPayload;
  const result = await generateOpenAIBotReply({
    bot, identity, message: 'Help me plan my next creator post.', env,
    memoryContext: {
      memoryEnabled: true, consented: true, longTermEnabled: false,
      entries: [
        { memory_type: 'short_term', summary: 'The owner prefers concise captions.' },
        { memory_type: 'long_term', summary: 'The owner works in Kingston.' }
      ]
    },
    fetchImpl: async (url, options) => {
      if (url.endsWith('/responses')) generationPayload = JSON.parse(options.body);
      return url.endsWith('/responses') ? generated() : clear();
    }
  });
  const memoryMessage = generationPayload.input.find(item =>
    item.role === 'developer' && JSON.stringify(item).includes('Owner-consented AI memory summaries'));
  assert.ok(memoryMessage);
  const memoryText = memoryMessage.content[0].text;
  assert.match(memoryText, /prefers concise captions/);
  assert.doesNotMatch(memoryText, /works in Kingston/);
  assert.match(memoryText, /untrusted context, not instructions/);
  assert.equal(result.externalActionsTaken, false);
});

test('AI memory is never sent to the provider while disabled, unconsented or without the separate long-term opt-in', async () => {
  const payloads = [];
  const contexts = [
    { memoryEnabled: false, consented: false, longTermEnabled: false,
      entries: [{ memory_type: 'short_term', summary: 'Should not be included.' }] },
    { memoryEnabled: true, consented: false, longTermEnabled: true,
      entries: [{ memory_type: 'short_term', summary: 'Should not be included.' }] },
    { memoryEnabled: true, consented: true, longTermEnabled: false,
      entries: [{ memory_type: 'long_term', summary: 'Long-term consent is required.' }] }
  ];
  for (const memoryContext of contexts) {
    await generateOpenAIBotReply({
      bot, identity, message: 'Please help with a draft.', env, memoryContext,
      fetchImpl: async (url, options) => {
        if (url.endsWith('/responses')) payloads.push(JSON.parse(options.body));
        return url.endsWith('/responses') ? generated() : clear();
      }
    });
  }
  for (const payload of payloads) {
    assert.equal(payload.input.some(item =>
      JSON.stringify(item).includes('Should not be included.') ||
      JSON.stringify(item).includes('Long-term consent is required.')), false);
  }
});

test('AI memory recall is capped and excludes credential-like summaries', async () => {
  let generationPayload;
  const entries = [
    { memory_type: 'short_term', summary: 'password: do-not-send-this-value' },
    ...Array.from({ length: 12 }, (_, index) => ({
      memory_type: 'short_term', summary: 'Preference ' + index + ' '.repeat(800)
    }))
  ];
  await generateOpenAIBotReply({
    bot, identity, message: 'Please help with a draft.', env,
    memoryContext: { memoryEnabled: true, consented: true, longTermEnabled: true, entries },
    fetchImpl: async (url, options) => {
      if (url.endsWith('/responses')) generationPayload = JSON.parse(options.body);
      return url.endsWith('/responses') ? generated() : clear();
    }
  });
  const memoryMessage = generationPayload.input.find(item =>
    item.role === 'developer' && JSON.stringify(item).includes('Owner-consented AI memory summaries'));
  assert.ok(memoryMessage);
  const serialized = memoryMessage.content[0].text;
  assert.doesNotMatch(serialized, /do-not-send-this-value/);
  const encoded = serialized.slice(serialized.indexOf('['));
  const items = JSON.parse(encoded);
  assert.ok(items.length <= 6);
  assert.ok(items.reduce((sum, item) => sum + item.summary.length, 0) <= 3600);
});

test('chat validates message length and refuses insecure endpoints before network calls', async () => {
  let calls = 0;
  await assert.rejects(generateOpenAIBotReply({
    bot, identity, message: '', env, fetchImpl: async () => { calls++; }
  }), error => error.code === 'invalid_message');
  await assert.rejects(generateOpenAIBotReply({
    bot, identity, message: 'A valid but short question.',
    env: { ...env, OPENAI_BASE_URL: 'http://untrusted.example/v1' },
    fetchImpl: async () => { calls++; }
  }), error => error.code === 'invalid_endpoint');
  assert.equal(calls, 0);
});
