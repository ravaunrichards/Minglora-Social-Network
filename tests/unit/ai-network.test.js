import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_BOT_CAPABILITIES,
  AI_BLOCKED_ACTIONS,
  createAIBot,
  createAIBotSchedule,
  createAIBotTeam,
  createAIApprovalRequest,
  createAICreatorJob,
  createAICommunityEvent,
  decideAIApproval,
  emergencyPauseAI,
  ensureAICollections,
  getAICommandCenter,
  getAIProviderStatus,
  getAIPerformanceSummary,
  getAISettings,
  setAICompanionConsent,
  updateAIBotScheduleStatus,
  updateAIBotStatus,
  updateAISettings
} from '../../backend/modules/ai-network/service.js';

const now = new Date('2026-11-11T22:00:00.000Z');
const future = minutes => new Date(now.getTime() + minutes * 60000).toISOString();
const state = () => ensureAICollections({});

function makeBot(db, ownerId = 'owner-1', overrides = {}) {
  return createAIBot(db, ownerId, {
    name: 'Minglora Guide',
    purpose: 'Helps members plan community content and organize helpful creator workflows.',
    tone: 'friendly',
    traits: ['helpful', 'curious'],
    expertise: 'Community education',
    languages: ['en', 'ht'],
    primaryLanguage: 'en',
    capabilities: ['draft_content', 'summarize_public_content'],
    ...overrides
  }, { now });
}

test('AI workspace defaults to a safe paused state with mandatory disclosure and human approval', () => {
  const db = state();
  const settings = getAISettings(db, 'owner-1');
  assert.equal(settings.globalPaused, true);
  assert.equal(settings.humanApprovalRequired, true);
  assert.equal(settings.aiIdentityLabelRequired, true);
  assert.equal(settings.companionOptIn, false);
  assert.equal(settings.dailyTokenBudget, 10000);
  assert.equal(db.aiBotSettings.length, 1);
});

test('bot creation labels bots as AI and starts them as drafts', () => {
  const db = state();
  const bot = makeBot(db);
  assert.equal(bot.identityType, 'ai_bot');
  assert.equal(bot.identityLabel, 'AI BOT');
  assert.equal(bot.aiDisclosureRequired, true);
  assert.equal(bot.humanApprovalRequired, true);
  assert.equal(bot.status, 'draft');
  assert.deepEqual(bot.capabilities, ['draft_content', 'summarize_public_content']);
  assert.equal(db.aiBots.length, 1);
});

test('bot creation rejects duplicate names and duplicate personality signatures', () => {
  const db = state();
  makeBot(db);
  assert.throws(() => makeBot(db), { status: 409 });
  assert.throws(() => makeBot(db, 'owner-1', { name: 'Different Name' }), { status: 409 });
});

test('bot creation rejects unsupported capabilities and malformed language tags', () => {
  const db = state();
  assert.throws(() => makeBot(db, 'owner-1', { capabilities: ['issue_or_transfer_coins'] }), { status: 400 });
  assert.throws(() => makeBot(db, 'owner-1', { languages: ['not a language'] }), { status: 400 });
  assert.equal(AI_BOT_CAPABILITIES.includes('issue_or_transfer_coins'), false);
});

test('different users cannot put another owner’s bot into their team', () => {
  const db = state();
  const bot = makeBot(db, 'owner-1');
  assert.throws(() => createAIBotTeam(db, 'owner-2', {
    name: 'Cross-account team', botIds: [bot.id]
  }, { now }), { status: 403 });
  const team = createAIBotTeam(db, 'owner-1', {
    name: 'Community Support', botIds: [bot.id], description: 'A human-reviewed support team.'
  }, { now });
  assert.deepEqual(team.botIds, [bot.id]);
  assert.equal(team.coordinationMode, 'human_reviewed');
});

test('schedules are created paused and cannot run before provider, global and bot safeguards pass', () => {
  const db = state();
  const bot = makeBot(db);
  const schedule = createAIBotSchedule(db, 'owner-1', {
    botId: bot.id, taskType: 'content_outline', cadence: 'daily',
    runAt: future(10), timezone: 'America/Jamaica'
  }, { now });
  assert.equal(schedule.status, 'paused');
  assert.equal(schedule.requiresHumanApproval, true);
  assert.throws(() => updateAIBotScheduleStatus(db, 'owner-1', schedule.id, 'active', {
    providerConfigured: true, now
  }), { status: 409 });
  assert.throws(() => updateAIBotStatus(db, 'owner-1', bot.id, 'active', {
    providerConfigured: true, now
  }), { status: 409 });
  updateAISettings(db, 'owner-1', { globalPaused: false }, { providerConfigured: true, now });
  updateAIBotStatus(db, 'owner-1', bot.id, 'active', { providerConfigured: true, now });
  const active = updateAIBotScheduleStatus(db, 'owner-1', schedule.id, 'active', { providerConfigured: true, now });
  assert.equal(active.status, 'active');
});

test('schedule validation rejects invalid time zones, unsafe task types and near-immediate runs', () => {
  const db = state();
  const bot = makeBot(db);
  assert.throws(() => createAIBotSchedule(db, 'owner-1', {
    botId: bot.id, taskType: 'publish_content', cadence: 'once', runAt: future(10), timezone: 'UTC'
  }, { now }), { status: 400 });
  assert.throws(() => createAIBotSchedule(db, 'owner-1', {
    botId: bot.id, taskType: 'content_outline', cadence: 'once', runAt: future(2), timezone: 'UTC'
  }, { now }), { status: 400 });
  assert.throws(() => createAIBotSchedule(db, 'owner-1', {
    botId: bot.id, taskType: 'content_outline', cadence: 'weekly', runAt: future(10), timezone: 'Not/AZone', weekdays: [1]
  }, { now }), { status: 400 });
});

test('Creator Studio jobs remain drafts until a real provider-backed worker exists', () => {
  const db = state();
  const bot = makeBot(db);
  const job = createAICreatorJob(db, 'owner-1', {
    botId: bot.id, taskType: 'caption_draft',
    brief: 'Create three accessible caption options for my uploaded community event video.'
  }, { now });
  assert.equal(job.status, 'draft');
  assert.equal(job.output, null);
  assert.equal(job.providerExecution, 'not_started');
  assert.equal(job.aiDisclosureRequired, true);
  assert.equal(job.humanReviewRequired, true);
});

test('high-impact actions require a pending approval and never execute on approval', () => {
  const db = state();
  const bot = makeBot(db);
  const request = createAIApprovalRequest(db, 'owner-1', {
    botId: bot.id, actionType: 'publish_content',
    summary: 'Publish the selected creator draft after final review.'
  }, { now });
  assert.equal(request.status, 'pending_human_review');
  assert.equal(request.executionStatus, 'not_executed');
  const approved = decideAIApproval(db, 'owner-1', request.id, 'approve', { now });
  assert.equal(approved.status, 'approved_not_executed');
  assert.equal(approved.executionStatus, 'not_executed');
  assert.throws(() => decideAIApproval(db, 'owner-1', request.id, 'reject', { now }), { status: 409 });
});

test('financial, administrative, deletion and security actions are never delegated to bots', () => {
  const db = state();
  const bot = makeBot(db);
  for (const actionType of AI_BLOCKED_ACTIONS) {
    assert.throws(() => createAIApprovalRequest(db, 'owner-1', {
      botId: bot.id, actionType, summary: 'Attempted privileged action.'
    }, { now }), { status: 403 }, actionType);
  }
  assert.equal(db.aiBotApprovals.length, 0);
});

test('expired human approvals are recorded as expired and remain unexecuted', () => {
  const db = state();
  const bot = makeBot(db);
  const request = createAIApprovalRequest(db, 'owner-1', {
    botId: bot.id, actionType: 'send_event_invitation',
    summary: 'Invite the approved opt-in event attendees.'
  }, { now });
  const expired = decideAIApproval(db, 'owner-1', request.id, 'approve', {
    now: new Date('2026-11-20T22:00:00.000Z')
  });
  assert.equal(expired.status, 'expired');
  assert.equal(expired.executionStatus, 'not_executed');
});

test('AI companionship requires an explicit AI identity acknowledgement and can be withdrawn', () => {
  const db = state();
  assert.throws(() => setAICompanionConsent(db, 'owner-1', true, false, { now }), { status: 400 });
  const enabled = setAICompanionConsent(db, 'owner-1', true, true, { now });
  assert.equal(enabled.optedIn, true);
  assert.equal(enabled.acknowledgedAIIdentity, true);
  assert.equal(getAISettings(db, 'owner-1').companionOptIn, true);
  const withdrawn = setAICompanionConsent(db, 'owner-1', false, false, { now });
  assert.equal(withdrawn.optedIn, false);
  assert.ok(withdrawn.withdrawnAt);
  assert.equal(getAISettings(db, 'owner-1').companionOptIn, false);
});

test('AI community events require a bot identity, a future time and opt-in invitation mode', () => {
  const db = state();
  const bot = makeBot(db);
  const event = createAICommunityEvent(db, 'owner-1', {
    botId: bot.id, title: 'Creator Learning Circle',
    description: 'A community session to exchange practical creator skills and safe publishing ideas.',
    startsAt: future(60), visibility: 'public'
  }, { now });
  assert.equal(event.status, 'draft');
  assert.equal(event.hostIdentityType, 'ai_bot');
  assert.equal(event.aiDisclosureRequired, true);
  assert.equal(event.invitationMode, 'opt_in_only');
});

test('emergency pause stops active bots, schedules and queued runs without deleting history', () => {
  const db = state();
  const bot = makeBot(db);
  updateAISettings(db, 'owner-1', { globalPaused: false }, { providerConfigured: true, now });
  updateAIBotStatus(db, 'owner-1', bot.id, 'active', { providerConfigured: true, now });
  const schedule = createAIBotSchedule(db, 'owner-1', {
    botId: bot.id, taskType: 'content_outline', cadence: 'once',
    runAt: future(30), timezone: 'UTC'
  }, { now });
  schedule.status = 'active';
  db.aiBotRuns.push({ id: 'run-1', ownerId: 'owner-1', botId: bot.id, status: 'queued', totalTokens: 0 });
  const paused = emergencyPauseAI(db, 'owner-1', 'Owner requested immediate stop.', { now });
  assert.equal(paused.paused, true);
  assert.equal(getAISettings(db, 'owner-1').globalPaused, true);
  assert.equal(bot.status, 'paused');
  assert.equal(schedule.status, 'paused');
  assert.equal(db.aiBotRuns[0].status, 'paused_by_emergency_stop');
  assert.equal(db.aiBotRuns.length, 1);
});

test('multilingual settings store valid BCP 47 languages and reject disabling safety controls', () => {
  const db = state();
  const settings = updateAISettings(db, 'owner-1', {
    enabledLanguages: ['en', 'es', 'ht', 'fr'], primaryLanguage: 'ht', autoTranslate: true,
    dailyTokenBudget: 20000, monthlySpendLimitUsd: 25
  }, { now });
  assert.deepEqual(settings.enabledLanguages, ['en', 'es', 'ht', 'fr']);
  assert.equal(settings.primaryLanguage, 'ht');
  assert.equal(settings.dailyTokenBudget, 20000);
  assert.equal(settings.monthlySpendLimitUsd, 25);
  assert.throws(() => updateAISettings(db, 'owner-1', { humanApprovalRequired: false }, { now }), { status: 403 });
  assert.throws(() => updateAISettings(db, 'owner-1', { aiIdentityLabelRequired: false }, { now }), { status: 403 });
  assert.throws(() => updateAISettings(db, 'owner-1', { enabledLanguages: ['bad tag'] }, { now }), { status: 400 });
});

test('performance center reports recorded execution data only and never invents usage', () => {
  const db = state();
  makeBot(db);
  const empty = getAIPerformanceSummary(db, 'owner-1');
  assert.equal(empty.completedRuns, 0);
  assert.equal(empty.totalTokensUsed, 0);
  assert.equal(empty.measuredRunCount, 0);
  assert.equal(empty.source, 'recorded_ai_run_events_only');
  db.aiBotRuns.push({ id: 'run-ok', ownerId: 'owner-1', botId: db.aiBots[0].id, status: 'completed', totalTokens: 123 });
  db.aiBotRuns.push({ id: 'run-fail', ownerId: 'owner-1', botId: db.aiBots[0].id, status: 'failed', totalTokens: 17 });
  const summary = getAIPerformanceSummary(db, 'owner-1');
  assert.equal(summary.completedRuns, 1);
  assert.equal(summary.failedRuns, 1);
  assert.equal(summary.totalTokensUsed, 140);
  assert.equal(summary.measuredRunCount, 2);
});

test('provider status exposes readiness only and never returns an API key', () => {
  const unavailable = getAIProviderStatus({});
  assert.equal(unavailable.configured, false);
  assert.equal(unavailable.executionEnabled, false);
  assert.equal('apiKey' in unavailable, false);
  const configured = getAIProviderStatus({
    MINGLORA_AI_PROVIDER: 'openai', MINGLORA_AI_MODEL: 'test-model',
    MINGLORA_AI_API_KEY: 'secret-test-only'
  });
  assert.equal(configured.configured, true);
  assert.equal(configured.model, 'test-model');
  assert.equal(configured.executionEnabled, false);
  assert.equal(JSON.stringify(configured).includes('secret-test-only'), false);
});

test('command center returns only the requesting owner’s bots and retains all emergency safeguards', () => {
  const db = state();
  makeBot(db, 'owner-1');
  makeBot(db, 'owner-2', { name: 'Other Guide', purpose: 'Helps a different member plan and organize their own creator work.' });
  const panel = getAICommandCenter(db, 'owner-1', { providerStatus: getAIProviderStatus({}) });
  assert.equal(panel.bots.length, 1);
  assert.equal(panel.bots[0].ownerId, 'owner-1');
  assert.equal(panel.safeguards.globalPaused, true);
  assert.equal(panel.safeguards.humanApprovalRequired, true);
  assert.equal(panel.safeguards.aiIdentityLabelRequired, true);
  assert.equal(panel.safeguards.highImpactActionsExecutedAutomatically, false);
  assert.equal(panel.safeguards.companionshipRequiresOptIn, true);
});
