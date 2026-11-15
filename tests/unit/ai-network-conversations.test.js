import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ensureAICollections,
  createAIBot,
  startAIBotConversationTurn,
  completeAIBotConversationTurn,
  failAIBotConversationTurn,
  getAICreatorDailyUsage,
  getAICommandCenter
} from '../../backend/modules/ai-network/service.js';
import { generateOpenAIBotConversationReply } from '../../backend/modules/ai-network/openai-bot-conversations.js';

const now = new Date('2026-11-15T16:00:00.000Z');
const env = {
  OPENAI_API_KEY:'private-openai-test-key',
  OPENAI_DEFAULT_MODEL:'test-model',
  MINGLORA_AI_REQUEST_TIMEOUT_MS:'5000'
};
const state = () => ensureAICollections({});
const makeBot = (db, ownerId='owner-1') => {
  const bot = createAIBot(db, ownerId, {
    name:'Minglora Guide',
    purpose:'Helps members understand community learning and creator workflows.',
    tone:'friendly',
    traits:['helpful','curious'],
    expertise:'Community education',
    languages:['en'],
    primaryLanguage:'en',
    capabilities:['draft_content']
  }, { now });
  bot.identityId='11111111-1111-4111-8111-111111111111';
  return bot;
};
const http = (status,payload) => ({ok:status>=200&&status<300,status,json:async()=>payload});
const moderation = flagged => http(200,{
  id:'mod-test',model:'omni-moderation-latest',results:[{flagged,categories:{}}]
});
const generation = () => http(200,{
  id:'resp-test-123',status:'completed',model:'test-model',
  output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Hello from your Minglora AI assistant.'}]}],
  usage:{input_tokens:55,output_tokens:20,total_tokens:75}
});
const good = {
  provider:'openai',model:'test-model',responseId:'resp-test-123',requestId:'req-test-123',
  output:'Hello from your Minglora AI assistant.',
  usage:{input_tokens:55,output_tokens:20,total_tokens:75},
  inputModeration:{flagged:false,model:'omni-moderation-latest'},
  moderation:{flagged:false,model:'omni-moderation-latest'},
  externalActionTaken:false,toolsUsed:false
};

test('conversation sessions are owner-scoped and tied to the linked AI identity',()=>{
  const db=state(),bot=makeBot(db);
  const started=startAIBotConversationTurn(db,'owner-1',bot.id,{idempotencyKey:'first-turn-key-001'},{now});
  assert.equal(started.session.identityId,bot.identityId);
  assert.equal(started.session.ownerId,'owner-1');
  assert.equal(started.run.status,'running');
  assert.deepEqual(started.history,[]);
  assert.equal(db.aiBotConversationSessions.length,1);
  assert.equal(db.aiBotRuns.length,1);
  assert.throws(()=>startAIBotConversationTurn(db,'owner-2',bot.id,{idempotencyKey:'other-owner-key'},{now}),/linked AI bot/i);
});

test('unlinked or archived bots and invalid idempotency keys fail closed',()=>{
  const db=state(),bot=makeBot(db);
  const unlinked=createAIBot(db,'owner-1',{
    name:'Unlinked Guide',
    purpose:'Helps members understand community learning and creator workflows.',
    tone:'professional',traits:['patient','precise'],expertise:'Community education',
    languages:['en'],primaryLanguage:'en',capabilities:['draft_content']
  },{now});
  assert.throws(()=>startAIBotConversationTurn(db,'owner-1',unlinked.id,{idempotencyKey:'unlinked-key-123'},{now}),/linked AI bot/i);
  bot.status='archived';
  assert.throws(()=>startAIBotConversationTurn(db,'owner-1',bot.id,{idempotencyKey:'archived-key-123'},{now}),/not archived/i);
  bot.status='draft';
  assert.throws(()=>startAIBotConversationTurn(db,'owner-1',bot.id,{idempotencyKey:'bad'},{now}),/retry-safe/i);
});

test('completed turns save disclosed assistant messages, measured usage and idempotent results',()=>{
  const db=state(),bot=makeBot(db);
  const started=startAIBotConversationTurn(db,'owner-1',bot.id,{idempotencyKey:'turn-idempotency-001'},{now});
  const completed=completeAIBotConversationTurn(db,'owner-1',started.run.id,'What can you help me with?',good,{now});
  assert.equal(completed.run.status,'completed');
  assert.equal(completed.run.totalTokens,75);
  assert.equal(completed.session.messages.length,2);
  assert.equal(completed.session.messages[0].role,'user');
  assert.equal(completed.session.messages[1].role,'assistant');
  assert.equal(completed.session.messages[1].aiDisclosureRequired,true);
  assert.equal(completed.run.externalActionTaken,false);
  assert.equal(completed.run.toolsUsed,false);
  const retry=startAIBotConversationTurn(db,'owner-1',bot.id,{idempotencyKey:'turn-idempotency-001'},{now});
  assert.equal(retry.reused,true);
  assert.equal(retry.session.messages.length,2);
});

test('invalid or unmoderated model results cannot be stored',()=>{
  const db=state(),bot=makeBot(db);
  const started=startAIBotConversationTurn(db,'owner-1',bot.id,{idempotencyKey:'unmoderated-turn-001'},{now});
  assert.throws(()=>completeAIBotConversationTurn(db,'owner-1',started.run.id,'Hello',{
    ...good,moderation:{flagged:true}
  },{now}),/moderation and no-tools checks/i);
  assert.equal(started.session.messages.length,0);
});

test('failed provider calls preserve measured usage but never save an unmoderated prompt or reply',()=>{
  const db=state(),bot=makeBot(db);
  const started=startAIBotConversationTurn(db,'owner-1',bot.id,{idempotencyKey:'failed-turn-key-001'},{now});
  failAIBotConversationTurn(db,'owner-1',started.run.id,'Assistant output was flagged.',{
    now,providerFailure:{provider:'openai',model:'test-model',responseId:'resp-failed',usage:{input_tokens:10,output_tokens:5,total_tokens:15}}
  });
  assert.equal(db.aiBotConversationSessions[0].messages.length,0);
  assert.equal(db.aiBotRuns[0].status,'failed');
  assert.equal(db.aiBotRuns[0].totalTokens,15);
});

test('conversation token usage counts against the daily AI budget and appears in the command center',()=>{
  const db=state(),bot=makeBot(db);
  const started=startAIBotConversationTurn(db,'owner-1',bot.id,{idempotencyKey:'usage-turn-key-001'},{now});
  completeAIBotConversationTurn(db,'owner-1',started.run.id,'Explain a Minglora feature.',good,{now});
  const usage=getAICreatorDailyUsage(db,'owner-1',{now});
  assert.equal(usage.tokensUsed,75);
  assert.equal(usage.conversationTurnsWithTokenUsage,1);
  const snapshot=getAICommandCenter(db,'owner-1');
  assert.equal(snapshot.conversations.length,1);
  assert.equal(snapshot.conversations[0].messages.length,2);
});

test('OpenAI reply moderates input, uses Responses API with storage and tools disabled, then moderates output',async()=>{
  const calls=[];
  const bot={identityId:'11111111-1111-4111-8111-111111111111',name:'Minglora Guide',purpose:'Helpful community education.',tone:'friendly',traits:['helpful','curious'],expertise:'Education',capabilities:['draft_content']};
  const identity={identity_id:bot.identityId,name:{display_name:'Minglora Guide'}};
  const result=await generateOpenAIBotConversationReply({
    bot,identity,messages:[{role:'user',content:'Hello, who are you?'}],env,
    fetchImpl:async(url,options)=>{
      calls.push({url,payload:JSON.parse(options.body),options});
      return url.endsWith('/responses')?generation():moderation(false);
    }
  });
  assert.equal(calls.length,3);
  assert.ok(calls[0].url.endsWith('/moderations'));
  assert.equal(calls[0].payload.input,'Hello, who are you?');
  assert.ok(calls[1].url.endsWith('/responses'));
  assert.equal(calls[1].payload.store,false);
  assert.deepEqual(calls[1].payload.tools,[]);
  assert.deepEqual(calls[1].payload.input,[{role:'user',content:'Hello, who are you?'}]);
  assert.match(calls[1].payload.instructions,/clearly disclosed AI assistant/);
  assert.match(calls[1].payload.instructions,/Do not publish/);
  assert.ok(calls[1].payload.max_output_tokens<=900);
  assert.ok(calls[2].url.endsWith('/moderations'));
  assert.equal(calls[2].payload.input,result.output);
  assert.equal(result.externalActionTaken,false);
  assert.equal(result.toolsUsed,false);
  assert.equal(result.usage.total_tokens,75);
  assert.equal(JSON.stringify(result).includes('private-openai-test-key'),false);
});

test('flagged user prompts are rejected before generation',async()=>{
  const calls=[];
  const bot={identityId:'11111111-1111-4111-8111-111111111111',purpose:'Helpful assistant.'};
  const identity={identity_id:bot.identityId,name:{display_name:'AI Guide'}};
  await assert.rejects(generateOpenAIBotConversationReply({
    bot,identity,messages:[{role:'user',content:'A sufficiently long test message.'}],env,
    fetchImpl:async url=>{calls.push(url);return moderation(true);}
  }),error=>error.code==='moderation_blocked');
  assert.equal(calls.length,1);
  assert.ok(calls[0].endsWith('/moderations'));
});

test('flagged assistant output is never returned for display',async()=>{
  const bot={identityId:'11111111-1111-4111-8111-111111111111',purpose:'Helpful assistant.'};
  const identity={identity_id:bot.identityId,name:{display_name:'AI Guide'}};
  let moderationCalls=0;
  await assert.rejects(generateOpenAIBotConversationReply({
    bot,identity,messages:[{role:'user',content:'A sufficiently long test message.'}],env,
    fetchImpl:async url=>{
      if(url.endsWith('/responses'))return generation();
      moderationCalls+=1;return moderation(moderationCalls===2);
    }
  }),error=>error.code==='moderation_blocked');
  assert.equal(moderationCalls,2);
});

test('identity mismatch, invalid history, oversized memory and missing credentials fail closed',async()=>{
  const bot={identityId:'11111111-1111-4111-8111-111111111111',purpose:'Helpful assistant.'};
  const identity={identity_id:'22222222-2222-4222-8222-222222222222',name:{display_name:'AI'}};
  await assert.rejects(generateOpenAIBotConversationReply({bot,identity,messages:[{role:'user',content:'A sufficiently long test message.'}],env}),error=>error.code==='identity_mismatch');
  const validIdentity={...identity,identity_id:bot.identityId};
  await assert.rejects(generateOpenAIBotConversationReply({bot,identity:validIdentity,messages:[{role:'assistant',content:'Invalid opening.'}],env}),error=>error.code==='invalid_history');
  await assert.rejects(generateOpenAIBotConversationReply({bot,identity:validIdentity,messages:[{role:'user',content:'A sufficiently long test message.'}],memoryContext:'x'.repeat(4001),env}),error=>error.code==='memory_context_too_large');
  await assert.rejects(generateOpenAIBotConversationReply({
    bot,identity:validIdentity,messages:[{role:'user',content:'A sufficiently long test message.'}],
    env:{OPENAI_DEFAULT_MODEL:'test-model'},fetchImpl:async()=>{throw new Error('must not call');}
  }),error=>error.code==='missing_credentials');
});

test('API and admin UI enforce owner verification, emergency pause, memory opt-in and text-only response boundaries',()=>{
  const server=readFileSync(new URL('../../src/server.js',import.meta.url),'utf8');
  const store=readFileSync(new URL('../../src/store.js',import.meta.url),'utf8');
  const runtime=readFileSync(new URL('../../supabase/functions/minglora-runtime-state/index.ts',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../../public/ai-network.js',import.meta.url),'utf8');
  for(const token of [
    "parts[2] === 'conversation'","runAIIdentityCommand('get'","runAIMemoryCommand('get_settings'",
    "runAIMemoryCommand('list'","probeOpenAIProvider()","getAICreatorDailyUsage(db, user.id)",
    "startAIBotConversationTurn","completeAIBotConversationTurn","failAIBotConversationTurn",
    "aiBotConversationOwnerLocks","generateOpenAIBotConversationReply","settings.globalPaused"
  ])assert.ok(server.includes(token),'Missing API safeguard: '+token);
  assert.ok(store.includes("'aiBotConversationSessions'"));
  assert.ok(runtime.includes('"aiBotConversationSessions"'));
  assert.ok(ui.includes('data-ai-form="conversation"'));
  assert.ok(ui.includes('data-ai-action="conversation-select"'));
  assert.ok(ui.includes('includeSavedMemory'));
  assert.ok(ui.includes('networkPaused'));
});
