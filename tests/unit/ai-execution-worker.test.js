import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTaskInput, extractOutput, createRuntimeClient } from '../../backend/workers/ai-execution/worker.mjs';

test('buildTaskInput identifies the AI identity and treats task payload as data', () => {
  const prompt = buildTaskInput({
    identity_id: 'identity-1', task_type: 'caption_draft', task_title: 'Launch caption',
    task_payload: { brief: 'New product launch' }
  }, { display_name: 'Minglora Studio', purpose: 'Draft social captions', skills: ['writing'] });
  assert.match(prompt, /Minglora Studio/);
  assert.match(prompt, /caption_draft/);
  assert.match(prompt, /New product launch/);
  assert.match(prompt, /untrusted data/);
});

test('extractOutput reads Responses API output_text and structured output', () => {
  assert.equal(extractOutput({ output_text: '  Hello  ' }), 'Hello');
  assert.equal(extractOutput({ output: [{ content: [{ type: 'output_text', text: 'Hello' }] }] }), 'Hello');
  assert.equal(extractOutput({ output: [] }), '');
});

test('runtime client uses worker-only authentication and rejects missing secrets', () => {
  assert.throws(() => createRuntimeClient({}, fetch), /MINGLORA_RUNTIME_URL/);
  let request;
  const client = createRuntimeClient({
    MINGLORA_RUNTIME_URL: 'https://example.supabase.co/functions/v1/minglora-runtime-state',
    MINGLORA_AI_WORKER_TOKEN: 'w'.repeat(48)
  }, async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ result: { claimed: false } }), { status: 200 });
  });
  return client.command('claim_next_task').then(result => {
    assert.deepEqual(result, { claimed: false });
    assert.equal(request.options.headers['x-minglora-worker-token'], 'w'.repeat(48));
    assert.equal(request.options.headers['x-minglora-api-key'], undefined);
    assert.equal(JSON.parse(request.options.body).aiAction, 'claim_next_task');
  });
});
