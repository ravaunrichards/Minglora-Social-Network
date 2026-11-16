import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOpenAICreatorDraft } from '../../backend/modules/ai-network/openai-creator-drafts.js';

const env = {
  OPENAI_API_KEY: 'private-openai-test-key',
  OPENAI_DEFAULT_MODEL: 'test-model',
  MINGLORA_AI_REQUEST_TIMEOUT_MS: '5000'
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
const goodGeneration = () => response(200, {
  id: 'resp_test_123', status: 'completed', model: 'test-model',
  output: [{ type: 'message', role: 'assistant', content: [
    { type: 'output_text', text: 'Caption one.\\n\\nCaption two.\\n\\nCaption three.' }
  ] }],
  usage: { input_tokens: 40, output_tokens: 60, total_tokens: 100 }
});

test('Creator draft generation screens the brief, calls Responses API, screens output and keeps it unpublished', async () => {
  const calls = [];
  const result = await generateOpenAICreatorDraft({
    taskType: 'caption_draft',
    brief: 'Write three captions for a Minglora community technology learning event.',
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, options, payload: JSON.parse(options.body) });
      if (url.endsWith('/responses')) return goodGeneration();
      return clearModeration();
    }
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/moderations');
  assert.equal(calls[0].payload.input, 'Write three captions for a Minglora community technology learning event.');
  assert.equal(calls[1].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[1].payload.model, 'test-model');
  assert.equal(calls[1].payload.store, false);
  assert.deepEqual(calls[1].payload.tools, []);
  assert.ok(calls[1].payload.max_output_tokens <= 1200);
  assert.equal(calls[2].url, 'https://api.openai.com/v1/moderations');
  assert.equal(calls[2].payload.input, result.output);
  assert.equal(result.output, 'Caption one.\\n\\nCaption two.\\n\\nCaption three.');
  assert.equal(result.moderation.flagged, false);
  assert.equal(result.published, false);
  assert.equal(result.externalActionTaken, false);
  assert.equal(result.humanReviewRequired, true);
  assert.equal(result.aiDisclosureRequired, true);
  assert.equal(result.usage.total_tokens, 100);
  assert.equal(JSON.stringify(result).includes('private-openai-test-key'), false);
});

test('missing key or model makes no provider request', async () => {
  let calls = 0;
  await assert.rejects(
    generateOpenAICreatorDraft({
      taskType: 'caption_draft', brief: 'A sufficiently long creator brief.',
      env: { OPENAI_DEFAULT_MODEL: 'test' }, fetchImpl: async () => { calls++; }
    }),
    error => error.code === 'missing_credentials'
  );
  await assert.rejects(
    generateOpenAICreatorDraft({
      taskType: 'caption_draft', brief: 'A sufficiently long creator brief.',
      env: { OPENAI_API_KEY: 'test' }, fetchImpl: async () => { calls++; }
    }),
    error => error.code === 'missing_model'
  );
  assert.equal(calls, 0);
});

test('provider selection prevents an OpenAI credential being used when another provider is selected', async () => {
  let calls = 0;
  await assert.rejects(
    generateOpenAICreatorDraft({
      taskType: 'caption_draft', brief: 'A sufficiently long creator brief.',
      env: { ...env, MINGLORA_AI_PROVIDER: 'anthropic' },
      fetchImpl: async () => { calls++; }
    }),
    error => error.code === 'provider_not_selected'
  );
  assert.equal(calls, 0);
});

test('a flagged brief is rejected before content generation', async () => {
  const calls = [];
  await assert.rejects(generateOpenAICreatorDraft({
    taskType: 'caption_draft',
    brief: 'A sufficiently long creator brief.',
    env,
    fetchImpl: async url => {
      calls.push(url);
      return response(200, { id: 'mod', results: [{ flagged: true }] });
    }
  }), error => error.code === 'moderation_blocked');
  assert.deepEqual(calls, ['https://api.openai.com/v1/moderations']);
});

test('incomplete generation, flagged output and moderation-provider failure never return draft output', async () => {
  await assert.rejects(generateOpenAICreatorDraft({
    taskType: 'caption_draft', brief: 'A sufficiently long creator brief.', env,
    fetchImpl: async url => url.endsWith('/moderations')
      ? clearModeration()
      : response(200, { id: 'resp', status: 'incomplete', output: [] })
  }), error => error.code === 'incomplete_generation');

  let moderationCount = 0;
  await assert.rejects(generateOpenAICreatorDraft({
    taskType: 'caption_draft', brief: 'A sufficiently long creator brief.', env,
    fetchImpl: async url => {
      if (url.endsWith('/responses')) return goodGeneration();
      moderationCount++;
      return response(200, { id: 'mod', results: [{ flagged: moderationCount === 2 }] });
    }
  }), error => error.code === 'moderation_blocked');
  assert.equal(moderationCount, 2);

  let outputModerationCount = 0;
  let outputModerationError;
  await assert.rejects(generateOpenAICreatorDraft({
    taskType: 'caption_draft', brief: 'A sufficiently long creator brief.', env,
    fetchImpl: async url => {
      if (url.endsWith('/responses')) return goodGeneration();
      outputModerationCount++;
      return outputModerationCount === 1
        ? clearModeration()
        : response(503, {});
    }
  }), error => {
    outputModerationError = error;
    return error.code === 'provider_error';
  });
  assert.equal(outputModerationCount, 2);
  assert.equal(outputModerationError.provider, 'openai');
  assert.equal(outputModerationError.usage.total_tokens, 100);
  assert.equal(outputModerationError.responseId, 'resp_test_123');
  assert.equal(JSON.stringify(outputModerationError).includes('private-openai-test-key'), false);
});

test('invalid briefs, unsupported draft types and insecure endpoints are rejected before a request', async () => {
  let calls = 0;
  await assert.rejects(generateOpenAICreatorDraft({
    taskType: 'publish_content', brief: 'A sufficiently long creator brief.', env,
    fetchImpl: async () => { calls++; }
  }), error => error.code === 'unsupported_task');
  await assert.rejects(generateOpenAICreatorDraft({
    taskType: 'caption_draft', brief: 'too short', env,
    fetchImpl: async () => { calls++; }
  }), error => error.code === 'invalid_brief');
  await assert.rejects(generateOpenAICreatorDraft({
    taskType: 'caption_draft', brief: 'A sufficiently long creator brief.',
    env: { ...env, OPENAI_BASE_URL: 'http://untrusted.example/v1' },
    fetchImpl: async () => { calls++; }
  }), error => error.code === 'invalid_endpoint');
  assert.equal(calls, 0);
});
