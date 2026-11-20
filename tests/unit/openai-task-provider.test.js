import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOpenAITaskOutput
} from '../../backend/modules/ai-network/openai-task-provider.js';

const task = (overrides = {}) => ({
  task_id: '11111111-1111-4111-8111-111111111111',
  task_type: 'text.generate',
  action_class: 'content',
  task_payload: { prompt: 'Write a short welcome note for a new community member.' },
  ...overrides
});
const route = { route_id: '22222222-2222-4222-8222-222222222222', provider: 'openai', model: 'gpt-test' };
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'provider-request-test' },
  json: async () => data
});

test('OpenAI task adapter moderates input and output, uses store:false and exposes no tools', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const payload = JSON.parse(options.body);
    requests.push({ url, payload, authorization: options.headers.Authorization });
    if (url.endsWith('/moderations')) return response({ results: [{ flagged: false }] });
    if (url.endsWith('/responses')) return response({
      id: 'resp-test',
      status: 'completed',
      model: 'gpt-test',
      usage: { input_tokens: 21, output_tokens: 13, total_tokens: 34 },
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Welcome to Minglora.' }] }]
    });
    return response({}, 404);
  };

  const result = await generateOpenAITaskOutput({
    task: task(),
    route,
    env: { OPENAI_API_KEY: 'test-api-key', MINGLORA_AI_MAX_RETRIES: '0' },
    fetchImpl
  });

  assert.equal(result.output, 'Welcome to Minglora.');
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'gpt-test');
  assert.equal(result.external_action_taken, false);
  assert.deepEqual(requests.map(item => item.url.split('/').pop()), ['moderations', 'responses', 'moderations']);
  assert.equal(requests[1].payload.store, false);
  assert.deepEqual(requests[1].payload.tools, []);
  assert.ok(requests.every(item => item.authorization === 'Bearer test-api-key'));
  assert.equal(result.usage.total_tokens, 34);
});

test('owner-configured personality context is passed as untrusted descriptive data and moderated with the task', async () => {
  const requests = [];
  const identityContext = {
    category_key: 'community_helper',
    purpose: 'Help members find community resources.',
    profession: 'Community assistant',
    personality: { tone: 'warm', style: 'concise' },
    skills: ['summarization', 'community support']
  };
  const result = await generateOpenAITaskOutput({
    task: task(),
    route,
    identityContext,
    env: { OPENAI_API_KEY: 'test-api-key', MINGLORA_AI_MAX_RETRIES: '0' },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      if (url.endsWith('/moderations')) return response({ results: [{ flagged: false }] });
      return response({
        id: 'resp-personality-test',
        status: 'completed',
        model: 'gpt-test',
        usage: { input_tokens: 31, output_tokens: 12, total_tokens: 43 },
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Here are some community resources.' }] }]
      });
    }
  });

  const moderated = requests.find(item => item.url.endsWith('/moderations'));
  const generation = requests.find(item => item.url.endsWith('/responses'));
  assert.ok(moderated.body.input.includes('IDENTITY_PROFILE_JSON'));
  assert.ok(moderated.body.input.includes('"tone":"warm"'));
  assert.ok(moderated.body.input.includes('TASK_INPUT:'));
  assert.ok(generation.body.input.includes('"style":"concise"'));
  assert.ok(generation.body.instructions.includes('or use tools'));
  assert.equal(result.output, 'Here are some community resources.');
});

test('flagged input is rejected before a generation request is sent', async () => {
  const requested = [];
  await assert.rejects(generateOpenAITaskOutput({
    task: task(),
    route,
    env: { OPENAI_API_KEY: 'test-api-key', MINGLORA_AI_MAX_RETRIES: '0' },
    fetchImpl: async (url, options) => {
      requested.push(url);
      return response({ results: [{ flagged: true }] });
    }
  }), error => error.code === 'moderation_blocked');
  assert.equal(requested.length, 1);
  assert.ok(requested[0].endsWith('/moderations'));
});

test('text adapter refuses unsupported task types, action classes and provider routes', async () => {
  const env = { OPENAI_API_KEY: 'test-api-key' };
  await assert.rejects(generateOpenAITaskOutput({
    task: task({ task_type: 'email.send' }),
    route, env, fetchImpl: async () => { throw new Error('Provider must not be called.'); }
  }), error => error.code === 'unsupported_task');

  await assert.rejects(generateOpenAITaskOutput({
    task: task({ action_class: 'external' }),
    route, env, fetchImpl: async () => { throw new Error('Provider must not be called.'); }
  }), error => error.code === 'unsupported_action_class');

  await assert.rejects(generateOpenAITaskOutput({
    task: task(),
    route: { ...route, provider: 'anthropic' },
    env, fetchImpl: async () => { throw new Error('Provider must not be called.'); }
  }), error => error.code === 'provider_adapter_unavailable');
});

test('credential-like task input is rejected before it reaches the provider', async () => {
  let requests = 0;
  await assert.rejects(generateOpenAITaskOutput({
    task: task({ task_payload: { prompt: 'Prepare a note.', api_key: 'do-not-send' } }),
    route, env: { OPENAI_API_KEY: 'test-api-key' },
    fetchImpl: async () => { requests += 1; return response({ results: [{ flagged: false }] }); }
  }), error => error.code === 'unsafe_payload');
  assert.equal(requests, 0);
});

test('a timed-out or rate-limited provider is marked retryable', async () => {
  await assert.rejects(generateOpenAITaskOutput({
    task: task(),
    route,
    env: { OPENAI_API_KEY: 'test-api-key', MINGLORA_AI_MAX_RETRIES: '0' },
    fetchImpl: async url => url.endsWith('/moderations')
      ? response({ results: [{ flagged: false }] })
      : response({ error: 'rate limited' }, 429)
  }), error => error.code === 'rate_limited' && error.retryable === true);
});
