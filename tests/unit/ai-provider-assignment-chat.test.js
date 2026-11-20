import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateAssignedAIBotReply } from '../../backend/modules/ai-network/openai-bot-chat.js';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const fakeResponse = payload => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => payload
});

const bot = {
  id: 'bot-123',
  identityId: '11111111-1111-4111-8111-111111111111',
  name: 'Maya',
  purpose: 'Helpful learning companion',
  tone: 'friendly',
  traits: ['patient','curious'],
  expertise: 'Learning'
};
const identity = { identity_id: bot.identityId };

const providerCases = [
  {
    provider: 'openai',
    model: 'gpt-chat',
    env: { OPENAI_API_KEY:'openai-moderation-and-generation-key' },
    generationUrl: '/responses',
    generationPayload: {
      id:'resp-openai-1',model:'gpt-chat',output_text:'Hello from OpenAI.',
      usage:{input_tokens:12,output_tokens:5,total_tokens:17}
    }
  },
  {
    provider: 'anthropic',
    model: 'claude-chat',
    env: {
      OPENAI_API_KEY:'openai-moderation-key',
      OPENAI_BASE_URL:'https://attacker.example/v1',
      ANTHROPIC_API_KEY:'anthropic-generation-key'
    },
    generationUrl: '/messages',
    generationPayload: {
      id:'msg-anthropic-1',model:'claude-chat',
      content:[{type:'text',text:'Hello from Anthropic.'}],
      usage:{input_tokens:12,output_tokens:5}
    }
  },
  {
    provider: 'google_gemini',
    model: 'gemini-chat',
    env: {
      OPENAI_API_KEY:'openai-moderation-key',
      GEMINI_API_KEY:'gemini-generation-key'
    },
    generationUrl: '/gemini-chat:generateContent',
    generationPayload: {
      modelVersion:'gemini-chat',
      candidates:[{content:{parts:[{text:'Hello from Gemini.'}]}}],
      usageMetadata:{promptTokenCount:12,candidatesTokenCount:5,totalTokenCount:17}
    }
  }
];

for (const item of providerCases) {
  test('assignment-aware bot chat uses moderated text generation for ' + item.provider, async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url:String(url), options });
      if (String(url).endsWith('/moderations')) {
        return fakeResponse({ model:'omni-moderation-latest',results:[{flagged:false}] });
      }
      if (String(url).includes(item.generationUrl)) {
        return fakeResponse(item.generationPayload);
      }
      throw new Error('Unexpected provider URL: ' + url);
    };

    const result = await generateAssignedAIBotReply({
      provider:item.provider,
      model:item.model,
      bot,
      identity,
      message:'Can you help me learn?',
      history:[{role:'user',content:'Hello'},{role:'assistant',content:'Hi'}],
      memoryContext:{
        memoryEnabled:true,consented:true,longTermEnabled:false,
        entries:[{memory_type:'short_term',summary:'The owner prefers short explanations.'}]
      },
      env:item.env,
      fetchImpl,
      maxOutputTokens:80,
      timeoutMs:12000
    });

    assert.equal(result.provider,item.provider);
    assert.equal(result.model,item.model);
    assert.equal(result.output,item.generationPayload.output_text ||
      item.generationPayload.content?.[0]?.text ||
      item.generationPayload.candidates?.[0]?.content?.parts?.[0]?.text);
    assert.equal(result.aiDisclosureRequired,true);
    assert.equal(result.externalActionsTaken,false);
    assert.deepEqual(result.moderation,{model:'omni-moderation-latest',flagged:false});
    assert.equal(calls.length,3,'Input moderation, provider generation and output moderation are required.');
    assert.match(calls[0].url,/api\.openai\.com\/v1\/moderations$/);
    assert.match(calls[2].url,/api\.openai\.com\/v1\/moderations$/);

    const generation = calls[1];
    assert.ok(generation.url.includes(item.generationUrl));
    const request = JSON.parse(generation.options.body);
    assert.ok(request.max_output_tokens === 80 || request.max_tokens === 80 ||
      request.generationConfig?.maxOutputTokens === 80);
    assert.equal(generation.options.redirect,'error');
    assert.ok(generation.options.signal);
    assert.equal(String(generation.options.body).includes('The owner prefers short explanations.'),true);
    assert.equal(String(generation.options.body).includes('You have no tools'),true);
    if (item.provider === 'openai') {
      assert.equal(request.store,false);
      assert.deepEqual(request.tools,[]);
    }
  });
}

test('assigned bot generation fails closed when OpenAI moderation credentials are unavailable', async () => {
  let calls = 0;
  await assert.rejects(
    generateAssignedAIBotReply({
      provider:'anthropic',
      model:'claude-chat',
      bot,
      identity,
      message:'Hello',
      env:{ANTHROPIC_API_KEY:'anthropic-key'},
      fetchImpl:async () => { calls++; return fakeResponse({}); }
    }),
    error => error.code === 'moderation_unavailable'
  );
  assert.equal(calls,0,'No provider generation occurs when input moderation is unavailable.');
});

test('assigned bot generation blocks an input flagged by moderation before provider inference', async () => {
  let calls = 0;
  await assert.rejects(
    generateAssignedAIBotReply({
      provider:'google_gemini',
      model:'gemini-chat',
      bot,
      identity,
      message:'Unsafe text',
      env:{OPENAI_API_KEY:'moderation-key',GEMINI_API_KEY:'gemini-key'},
      fetchImpl:async () => {
        calls++;
        return fakeResponse({model:'omni-moderation-latest',results:[{flagged:true}]});
      }
    }),
    error => error.code === 'moderation_blocked'
  );
  assert.equal(calls,1,'Only the input moderation request should be sent.');
});

test('assigned bot chat withholds generated output when output moderation flags it', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(String(url));
    if (String(url).endsWith('/moderations')) {
      const flagged = calls.filter(item => item.endsWith('/moderations')).length === 2;
      return fakeResponse({model:'omni-moderation-latest',results:[{flagged}]});
    }
    if (String(url).includes('/messages')) {
      return fakeResponse({
        id:'msg-anthropic-flagged',
        model:'claude-chat',
        content:[{type:'text',text:'A flagged reply must not be saved.'}],
        usage:{input_tokens:8,output_tokens:12}
      });
    }
    throw new Error('Unexpected provider URL: ' + url);
  };
  await assert.rejects(
    generateAssignedAIBotReply({
      provider:'anthropic',
      model:'claude-chat',
      bot,
      identity,
      message:'Please answer safely.',
      env:{OPENAI_API_KEY:'moderation-key',ANTHROPIC_API_KEY:'generation-key'},
      fetchImpl,
      maxOutputTokens:60
    }),
    error => error.code === 'moderation_blocked'
  );
  assert.equal(calls.length,3,'The provider reply must be checked before it can be returned to the chat route.');
});

test('provider routing requires an active owner-owned assignment and does not bypass disabled or revoked assignments', () => {
  const server = read('../../src/server.js');
  assert.ok(server.includes('const runAIOwnedProviderCommand = async'));
  assert.ok(server.includes("['list_provider_assignments','list_provider_health','list_provider_accounts']"));
  assert.ok(server.includes('const resolveAIBotProviderAssignment = async identityId'));
  assert.ok(server.includes("assignment_status === 'active'"));
  assert.ok(server.includes("account.status !== 'enabled'"));
  assert.ok(server.includes("account.health_status !== 'healthy'"));
  assert.ok(server.includes('const latestModelCheck = modelEvents[0]'));
  assert.ok(server.includes('latestModelCheck?.metadata?.inference_verified !== true'));
  assert.ok(server.includes('generateAssignedAIBotReply('));
  assert.ok(server.includes('if (!generated) {'));
  assert.ok(server.includes('provider assignment, but none is active'));
  assert.ok(server.includes('identity_id: chatBase.bot.identityId'));
});
