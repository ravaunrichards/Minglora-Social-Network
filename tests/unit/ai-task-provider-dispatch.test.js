import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAITaskOutput } from '../../backend/modules/ai-network/task-provider.js';

test('task dispatcher selects the adapter matching the reserved provider route', async () => {
  const task = {
    task_id: '11111111-1111-4111-8111-111111111111',
    task_type: 'text.generate',
    action_class: 'content',
    task_payload: { prompt: 'Generate a useful draft for this test.' }
  };
  const openai = await generateAITaskOutput({
    task,
    route: { provider: 'openai', model: 'gpt-test' },
    env: { OPENAI_API_KEY: 'test-openai-key' },
    fetchImpl: async url => url.endsWith('/moderations')
      ? { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ results: [{ flagged: false }] }) }
      : { ok: true, status: 200, headers: { get: () => null }, json: async () => ({
          status: 'completed',
          model: 'gpt-test',
          usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
          output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OpenAI result.' }] }]
        }) }
  });
  assert.equal(openai.provider, 'openai');

  const gemini = await generateAITaskOutput({
    task,
    route: { provider: 'google_gemini', model: 'gemini-2.5-flash' },
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        candidates: [{
          finishReason: 'STOP',
          safetyRatings: [{ category: 'HARM_CATEGORY_HARASSMENT', probability: 'NEGLIGIBLE' }],
          content: { parts: [{ text: 'Gemini result.' }] }
        }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 }
      })
    })
  });
  assert.equal(gemini.provider, 'google_gemini');

  await assert.rejects(generateAITaskOutput({
    task,
    route: { provider: 'anthropic', model: 'claude-test' }
  }), error => error.code === 'provider_adapter_unavailable');
});
