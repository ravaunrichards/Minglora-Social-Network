import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAIBot,
  ensureAICollections,
  getAIBotConversation,
  beginAIBotChatRequest,
  completeAIBotChatRequest,
  failAIBotChatRequest,
  getAICreatorDailyUsage,
  getAIPerformanceSummary
} from '../../backend/modules/ai-network/service.js';

const now = new Date('2026-11-16T10:00:00.000Z');
const state = () => ensureAICollections({});

function linkedBot(db, ownerId = 'owner-1') {
  const bot = createAIBot(db, ownerId, {
    name: 'Minglora Guide',
    purpose: 'Helps the owner understand topics and draft useful creator material.',
    tone: 'friendly',
    traits: ['helpful', 'curious'],
    expertise: 'Creator education',
    languages: ['en'],
    primaryLanguage: 'en',
    capabilities: ['draft_content']
  }, { now });
  bot.identityId = 'identity-' + ownerId;
  bot.identityLinkStatus = 'linked';
  return bot;
}

function exchange(userMessage, totalTokens = 60) {
  return {
    userMessage,
    assistantMessage: 'I am an AI assistant. Here is a reviewed answer.',
    provider: 'openai',
    model: 'test-model',
    responseId: 'resp-test-1',
    providerRequestId: 'req-test-1',
    usage: { input_tokens: 25, output_tokens: totalTokens - 25, total_tokens: totalTokens },
    moderation: { model: 'omni-moderation-latest', flagged: false }
  };
}

test('owner chat stores a moderated exchange against the linked AI identity', () => {
  const db = state();
  const bot = linkedBot(db);
  const requestId = '11111111-1111-4111-a111-111111111111';
  const message = 'Can you explain how to plan a creator post?';
  const started = beginAIBotChatRequest(db, 'owner-1', {
    botId: bot.id, identityId: bot.identityId, requestId, message
  }, { now });
  assert.equal(started.reused, false);

  const saved = completeAIBotChatRequest(db, 'owner-1', requestId, exchange(message), { now });
  assert.equal(saved.bot.identityId, bot.identityId);
  assert.equal(saved.messages.length, 2);
  assert.equal(saved.messages[0].role, 'user');
  assert.equal(saved.messages[1].role, 'assistant');
  assert.equal(saved.messages[1].aiDisclosureRequired, true);
  assert.equal(saved.messages[1].externalActionsTaken, false);
  assert.equal(db.aiBotUsageEvents[0].usage.total_tokens, 60);
});

test('chat data is owner-isolated and request IDs cannot be reused for different messages', () => {
  const db = state();
  const bot = linkedBot(db);
  const requestId = '22222222-2222-4222-a222-222222222222';
  const message = 'Please explain this topic in plain language.';
  assert.throws(() => getAIBotConversation(db, 'owner-2', bot.id), { status: 404 });
  assert.throws(() => beginAIBotChatRequest(db, 'owner-1', {
    botId: bot.id, identityId: 'another-identity', requestId, message
  }), { status: 409 });

  beginAIBotChatRequest(db, 'owner-1', {
    botId: bot.id, identityId: bot.identityId, requestId, message
  }, { now });
  assert.throws(() => beginAIBotChatRequest(db, 'owner-1', {
    botId: bot.id, identityId: bot.identityId, requestId, message: 'A different message.'
  }, { now }), { status: 409 });

  completeAIBotChatRequest(db, 'owner-1', requestId, exchange(message), { now });
  const replay = beginAIBotChatRequest(db, 'owner-1', {
    botId: bot.id, identityId: bot.identityId, requestId, message
  }, { now });
  assert.equal(replay.reused, true);
  assert.equal(db.aiBotConversationMessages.length, 2);
});

test('failed moderation records billable usage without saving user or assistant content', () => {
  const db = state();
  const bot = linkedBot(db);
  const requestId = '33333333-3333-4333-a333-333333333333';
  beginAIBotChatRequest(db, 'owner-1', {
    botId: bot.id, identityId: bot.identityId, requestId,
    message: 'A message that will not be persisted on a failed moderation check.'
  }, { now });

  const failed = failAIBotChatRequest(db, 'owner-1', requestId, 'Output moderation unavailable.', {
    now,
    providerFailure: {
      provider: 'openai', model: 'test-model',
      usage: { input_tokens: 25, output_tokens: 40, total_tokens: 65 }
    }
  });
  assert.equal(failed.status, 'failed');
  assert.equal(db.aiBotConversationMessages.length, 0);
  assert.equal(db.aiBotUsageEvents.length, 1);
  assert.equal(db.aiBotUsageEvents[0].usage.total_tokens, 65);
  assert.equal(getAICreatorDailyUsage(db, 'owner-1', { now }).tokensUsed, 65);
  assert.equal(getAIPerformanceSummary(db, 'owner-1').botChatTokensUsed, 65);
});

test('stale request leases can be retried without duplicating conversation messages', () => {
  const db = state();
  const bot = linkedBot(db);
  const requestId = '44444444-4444-4444-a444-444444444444';
  const message = 'Please explain a useful creator workflow.';
  beginAIBotChatRequest(db, 'owner-1', {
    botId: bot.id, identityId: bot.identityId, requestId, message
  }, { now });
  const retry = beginAIBotChatRequest(db, 'owner-1', {
    botId: bot.id, identityId: bot.identityId, requestId, message
  }, { now: new Date(now.getTime() + 6 * 60 * 1000) });
  assert.equal(retry.reused, false);
  assert.equal(retry.request.status, 'running');
  assert.equal(db.aiBotConversationMessages.length, 0);
});
