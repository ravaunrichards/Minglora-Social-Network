import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIProviderAdapterError,
  SUPPORTED_AI_PROVIDER_ADAPTERS,
  getAIProviderAdapter,
  listAIProviderModels,
  probeAIProvider,
  generateAIProviderText
} from '../../backend/modules/ai-network/provider-adapters.js';

const response = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload
});

test('only explicitly implemented first-party adapters are exposed', () => {
  assert.deepEqual(SUPPORTED_AI_PROVIDER_ADAPTERS, ['openai', 'anthropic', 'google_gemini']);
  assert.equal(getAIProviderAdapter('anthropic').providerId, 'anthropic');
  assert.equal(getAIProviderAdapter('google_gemini').providerId, 'google_gemini');
  assert.equal(getAIProviderAdapter('xai'), null);
});

test('model discovery authenticates to OpenAI without exposing its key', async () => {
  const secret = 'openai-secret-not-for-logs';
  let request;
  const result = await listAIProviderModels('openai', {
    env: { OPENAI_API_KEY: secret },
    fetchImpl: async (url, init) => {
      request = { url, init };
      return response({ object: 'list', data: [
        { object: 'model', id: 'gpt-test-1', owned_by: 'openai' },
        { object: 'model', id: 'not-a-model', owned_by: 'openai' }
      ] });
    }
  });
  assert.equal(request.url, 'https://api.openai.com/v1/models');
  assert.equal(request.init.headers.Authorization, 'Bearer ' + secret);
  assert.deepEqual(result.models.map(model => model.id), ['gpt-test-1', 'not-a-model']);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(request.url).includes(secret), false);
  assert.equal(request.init.redirect, 'error');
  assert.ok(request.init.signal);
});

test('model discovery uses Anthropic bearer authentication and current version header', async () => {
  const secret = 'anthropic-secret-not-for-logs';
  let request;
  const result = await listAIProviderModels('anthropic', {
    env: { ANTHROPIC_API_KEY: secret },
    fetchImpl: async (url, init) => {
      request = { url, init };
      return response({ data: [
        { type: 'model', id: 'claude-test', display_name: 'Claude Test' }
      ], has_more: false });
    }
  });
  assert.equal(request.url, 'https://api.anthropic.com/v1/models?limit=1000');
  assert.equal(request.init.headers.Authorization, 'Bearer ' + secret);
  assert.equal(request.init.headers['anthropic-version'], '2026-10-21');
  assert.equal(result.models[0].displayName, 'Claude Test');
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('Gemini discovery sends the API key in a header and filters for generateContent models', async () => {
  const secret = 'gemini-secret-not-for-logs';
  let request;
  const result = await listAIProviderModels('google_gemini', {
    env: { GEMINI_API_KEY: secret },
    fetchImpl: async (url, init) => {
      request = { url, init };
      return response({ models: [
        { name: 'models/gemini-test', baseModelId: 'gemini-test', displayName: 'Gemini Test', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embed-test', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] }
      ] });
    }
  });
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000');
  assert.equal(request.init.headers['x-goog-api-key'], secret);
  assert.deepEqual(result.models.map(model => model.id), ['gemini-test']);
  assert.equal(result.models[0].resourceName, 'models/gemini-test');
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(request.url).includes(secret), false);
});

test('connection probes distinguish authenticated provider model listing from inference execution', async () => {
  const status = await probeAIProvider('anthropic', {
    env: { ANTHROPIC_API_KEY: 'anthropic-secret' },
    model: 'claude-test',
    now: () => new Date('2026-11-20T12:00:00.000Z'),
    fetchImpl: async () => response({ data: [{ id: 'claude-test', display_name: 'Claude Test' }] })
  });
  assert.equal(status.status, 'healthy');
  assert.equal(status.connected, true);
  assert.equal(status.healthStatus, 'healthy');
  assert.equal(status.inferenceAdapterAvailable, true);
  assert.equal(status.executionEnabled, false);
  assert.equal(status.modelCount, 1);
  assert.match(status.note, /does not test text generation/i);
  assert.equal(status.checkedAt, '2026-11-20T12:00:00.000Z');
});

test('connection probe never marks a missing key or inaccessible selected model as connected', async () => {
  let calls = 0;
  const missing = await probeAIProvider('google_gemini', {
    env: {},
    fetchImpl: async () => { calls++; return response({ models: [] }); }
  });
  assert.equal(missing.status, 'missing_credentials');
  assert.equal(missing.connected, false);
  assert.equal(calls, 0);

  const unavailable = await probeAIProvider('google_gemini', {
    env: { GOOGLE_AI_API_KEY: 'gemini-secret' },
    model: 'gemini-not-available',
    fetchImpl: async () => response({ models: [
      { name: 'models/gemini-other', baseModelId: 'gemini-other', supportedGenerationMethods: ['generateContent'] }
    ] })
  });
  assert.equal(unavailable.status, 'model_unavailable');
  assert.equal(unavailable.connected, false);
  assert.equal(unavailable.executionEnabled, false);
});

test('OpenAI generation uses Responses API with storage and tool use disabled', async () => {
  const secret = 'openai-secret-do-not-return';
  let request;
  const result = await generateAIProviderText('openai', {
    model: 'gpt-test',
    prompt: 'Say hello',
    systemPrompt: 'Be concise',
    maxOutputTokens: 64
  }, {
    env: { OPENAI_API_KEY: secret },
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return response({
        id: 'resp-test',
        model: 'gpt-test',
        status: 'completed',
        output_text: 'Hello.',
        usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 }
      });
    }
  });
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.body.store, false);
  assert.deepEqual(request.body.tools, []);
  assert.equal(request.body.instructions, 'Be concise');
  assert.equal(request.body.max_output_tokens, 64);
  assert.equal(result.output, 'Hello.');
  assert.deepEqual(result.usage, { inputTokens: 4, outputTokens: 2, totalTokens: 6 });
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('Anthropic generation uses Messages API with a bounded response and no implicit tools', async () => {
  const secret = 'anthropic-secret-do-not-return';
  let request;
  const result = await generateAIProviderText('anthropic', {
    model: 'claude-test',
    prompt: 'Summarize this sentence.',
    systemPrompt: 'Be accurate',
    maxOutputTokens: 99999
  }, {
    env: { ANTHROPIC_API_KEY: secret },
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return response({
        id: 'msg-test',
        model: 'claude-test',
        content: [{ type: 'text', text: 'A short summary.' }],
        usage: { input_tokens: 8, output_tokens: 5 }
      });
    }
  });
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(request.body.max_tokens, 4096);
  assert.equal(request.body.system, 'Be accurate');
  assert.deepEqual(request.body.messages, [{ role: 'user', content: 'Summarize this sentence.' }]);
  assert.equal(request.init.headers.Authorization, 'Bearer ' + secret);
  assert.equal(result.output, 'A short summary.');
  assert.equal(result.requestId, 'msg-test');
  assert.deepEqual(result.usage, { inputTokens: 8, outputTokens: 5, totalTokens: 13 });
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('Gemini generation calls the native generateContent API using header authentication', async () => {
  const secret = 'gemini-secret-do-not-return';
  let request;
  const result = await generateAIProviderText('google_gemini', {
    model: 'gemini-test',
    prompt: 'Explain a database index.',
    systemPrompt: 'Use plain language',
    maxOutputTokens: 300
  }, {
    env: { GEMINI_API_KEY: secret },
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return response({
        modelVersion: 'gemini-test',
        responseId: 'gemini-response-test',
        candidates: [{ content: { parts: [{ text: 'An index helps find records faster.' }] } }],
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 8, totalTokenCount: 15 }
      });
    }
  });
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
  assert.equal(request.init.headers['x-goog-api-key'], secret);
  assert.deepEqual(request.body.systemInstruction, { parts: [{ text: 'Use plain language' }] });
  assert.equal(request.body.generationConfig.maxOutputTokens, 300);
  assert.equal(result.output, 'An index helps find records faster.');
  assert.deepEqual(result.usage, { inputTokens: 7, outputTokens: 8, totalTokens: 15 });
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('provider failures return sanitized errors and never expose provider response bodies', async () => {
  const secret = 'secret-that-must-never-appear';
  const result = await probeAIProvider('openai', {
    env: { OPENAI_API_KEY: secret },
    fetchImpl: async () => response({ error: { message: secret, details: 'private provider body' } }, 401)
  });
  assert.equal(result.status, 'unauthorized');
  assert.equal(result.connected, false);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes('private provider body'), false);
});

test('network failures and unsafe endpoints fail closed without credential disclosure', async () => {
  const networkResult = await probeAIProvider('openai', {
    env: { OPENAI_API_KEY: 'private-key' },
    fetchImpl: async () => { throw new TypeError('private network detail'); }
  });
  assert.equal(networkResult.status, 'network_error');
  assert.equal(networkResult.connected, false);
  assert.equal(JSON.stringify(networkResult).includes('private network detail'), false);

  let calls = 0;
  await assert.rejects(
    listAIProviderModels('anthropic', {
      env: { ANTHROPIC_API_KEY: 'private-key', ANTHROPIC_BASE_URL: 'http://127.0.0.1:8080' },
      fetchImpl: async () => { calls++; return response({ data: [] }); }
    }),
    error => error instanceof AIProviderAdapterError && error.code === 'invalid_endpoint'
  );
  assert.equal(calls, 0);

  await assert.rejects(
    listAIProviderModels('openai', {
      env: { OPENAI_API_KEY: 'private-key', OPENAI_BASE_URL: 'https://attacker.example/v1' },
      fetchImpl: async () => { calls++; return response({ data: [] }); }
    }),
    error => error instanceof AIProviderAdapterError && error.code === 'invalid_endpoint'
  );
  assert.equal(calls, 0);
});

test('invalid prompts and model identifiers are rejected before contacting a provider', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response({ output_text: 'unexpected' }); };
  await assert.rejects(
    generateAIProviderText('openai', { model: '../unsafe', prompt: 'hello' }, {
      env: { OPENAI_API_KEY: 'private-key' }, fetchImpl
    }),
    error => error instanceof AIProviderAdapterError && error.code === 'invalid_model'
  );
  await assert.rejects(
    generateAIProviderText('anthropic', { model: 'claude-test', prompt: '   ' }, {
      env: { ANTHROPIC_API_KEY: 'private-key' }, fetchImpl
    }),
    error => error instanceof AIProviderAdapterError && error.code === 'invalid_prompt'
  );
  assert.equal(calls, 0);
});

test('unsupported provider requests fail explicitly instead of using a placeholder adapter', async () => {
  await assert.rejects(
    listAIProviderModels('xai', { env: { XAI_API_KEY: 'not-a-real-key' } }),
    error => error instanceof AIProviderAdapterError && error.code === 'adapter_unavailable'
  );
});

test('Anthropic model discovery follows after_id pagination and combines unique results', async () => {
  const urls = [];
  const result = await listAIProviderModels('anthropic', {
    env: { ANTHROPIC_API_KEY: 'anthropic-secret' },
    fetchImpl: async url => {
      urls.push(url);
      if (urls.length === 1) return response({
        data: [{ id: 'claude-one', display_name: 'Claude One' }],
        has_more: true,
        last_id: 'claude-one'
      });
      return response({
        data: [{ id: 'claude-two', display_name: 'Claude Two' }],
        has_more: false,
        last_id: 'claude-two'
      });
    }
  });
  assert.equal(urls.length, 2);
  assert.match(urls[1], /after_id=claude-one/);
  assert.deepEqual(result.models.map(model => model.id), ['claude-one','claude-two']);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.hasMore, false);
  assert.equal(result.truncated, false);
});

test('Gemini model discovery follows nextPageToken pagination and keeps generateContent models only', async () => {
  const urls = [];
  const result = await listAIProviderModels('google_gemini', {
    env: { GEMINI_API_KEY: 'gemini-secret' },
    fetchImpl: async url => {
      urls.push(url);
      if (urls.length === 1) return response({
        models: [{ name:'models/gemini-one', displayName:'Gemini One', supportedGenerationMethods:['generateContent'] }],
        nextPageToken: 'page-token-2'
      });
      return response({
        models: [
          { name:'models/gemini-two', displayName:'Gemini Two', supportedGenerationMethods:['generateContent'] },
          { name:'models/embed-two', displayName:'Embedding Two', supportedGenerationMethods:['embedContent'] }
        ]
      });
    }
  });
  assert.equal(urls.length, 2);
  assert.match(urls[1], /pageToken=page-token-2/);
  assert.deepEqual(result.models.map(model => model.id), ['gemini-one','gemini-two']);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.hasMore, false);
});

test('OpenAI model listing preserves shutdown metadata for conservative catalogue filtering', async () => {
  const result = await listAIProviderModels('openai', {
    env: { OPENAI_API_KEY: 'openai-secret' },
    fetchImpl: async () => response({ data: [
      { object:'model', id:'gpt-active', owned_by:'openai', shutdown_date:null },
      { object:'model', id:'gpt-shutdown', owned_by:'openai', shutdown_date:'2026-10-01' }
    ] })
  });
  assert.equal(result.models[0].shutdownDate, null);
  assert.equal(result.models[1].shutdownDate, '2026-10-01');
});

test('provider probe reports a selected model absent from the provider list as unavailable', async () => {
  const result = await probeAIProvider('anthropic', {
    env: { ANTHROPIC_API_KEY: 'anthropic-secret' },
    model: 'claude-not-listed',
    fetchImpl: async () => response({ data: [{ id:'claude-current', display_name:'Claude Current' }] })
  });
  assert.equal(result.status, 'model_unavailable');
  assert.equal(result.connected, false);
  assert.equal(result.model, 'claude-not-listed');
  assert.equal(result.executionEnabled, false);
});
