import { randomUUID } from 'node:crypto';

const nowIso = (now = new Date()) => new Date(now).toISOString();
const makeId = () => randomUUID();
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const ownerRows = (rows, ownerId) => (Array.isArray(rows) ? rows : []).filter(row => row?.ownerId === ownerId);

export const AI_BOT_CAPABILITIES = Object.freeze([
  'draft_content',
  'summarize_public_content',
  'translate_user_provided_content',
  'suggest_replies',
  'organize_creator_tasks',
  'prepare_event_material'
]);
export const AI_BOT_TASK_TYPES = Object.freeze([
  'content_outline',
  'caption_draft',
  'title_ideas',
  'translation_draft',
  'creator_calendar',
  'public_event_support'
]);
export const AI_HIGH_IMPACT_ACTIONS = Object.freeze([
  'publish_content',
  'schedule_public_post',
  'send_external_message',
  'send_event_invitation'
]);
export const AI_BLOCKED_ACTIONS = Object.freeze([
  'financial_action',
  'issue_or_transfer_coins',
  'refund_or_payout',
  'account_suspension',
  'admin_privilege_change',
  'delete_member_content',
  'change_security_settings'
]);

const BOT_TONES = new Set(['friendly', 'professional', 'educational', 'creative', 'calm', 'energetic', 'concise', 'supportive']);
const BOT_TRAITS = new Set(['helpful', 'curious', 'calm', 'energetic', 'analytical', 'empathetic', 'creative', 'precise', 'playful', 'patient', 'direct']);
const EVENT_VISIBILITIES = new Set(['public', 'followers', 'friends', 'private']);
const SCHEDULE_CADENCES = new Set(['once', 'daily', 'weekly']);

export function ensureAICollections(db) {
  if (!db || typeof db !== 'object' || Array.isArray(db)) throw new TypeError('A Minglora state object is required.');
  for (const key of [
    'aiBotSettings', 'aiBots', 'aiBotTeams', 'aiBotSchedules', 'aiBotRuns',
    'aiBotApprovals', 'aiBotAudit', 'aiBotCreatorJobs', 'aiBotCompanionConsents',
    'aiBotCommunityEvents'
  ]) if (!Array.isArray(db[key])) db[key] = [];
  return db;
}

function audit(db, ownerId, actorId, action, targetType, targetId, at = new Date()) {
  db.aiBotAudit.push({
    id: makeId(), ownerId, actorId, action, targetType, targetId: String(targetId || ''),
    occurredAt: nowIso(at), source: 'minglora_ai_network'
  });
}

export function getAISettings(db, ownerId) {
  ensureAICollections(db);
  if (!ownerId) throw fail(401, 'Sign in to use Minglora AI Network.');
  let settings = db.aiBotSettings.find(row => row.ownerId === ownerId);
  if (!settings) {
    settings = {
      id: makeId(), ownerId, globalPaused: true, dailyTokenBudget: 10000,
      monthlySpendLimitUsd: 10, autoTranslate: false, primaryLanguage: 'en',
      enabledLanguages: ['en'], companionOptIn: false, humanApprovalRequired: true,
      aiIdentityLabelRequired: true, createdAt: nowIso(), updatedAt: nowIso()
    };
    db.aiBotSettings.push(settings);
  }
  // Safety invariants are enforced even when older persisted records are loaded.
  settings.humanApprovalRequired = true;
  settings.aiIdentityLabelRequired = true;
  if (!Number.isFinite(Number(settings.dailyTokenBudget))) settings.dailyTokenBudget = 10000;
  if (!Number.isFinite(Number(settings.monthlySpendLimitUsd))) settings.monthlySpendLimitUsd = 10;
  if (!Array.isArray(settings.enabledLanguages) || !settings.enabledLanguages.length) settings.enabledLanguages = ['en'];
  return settings;
}

export function getAIProviderStatus(env = process.env) {
  const provider = text(env.MINGLORA_AI_PROVIDER, 40).toLowerCase();
  const model = text(env.MINGLORA_AI_MODEL, 120);
  const configured = Boolean(provider && model && text(env.MINGLORA_AI_API_KEY, 4096));
  return {
    configured,
    provider: configured ? provider : 'not_configured',
    model: configured ? model : null,
    credentialsPresent: configured,
    executionEnabled: false,
    note: configured
      ? 'Provider credentials are present. Execution remains disabled until the server-side provider adapter and safety checks are verified.'
      : 'No AI provider is configured. Minglora will not invent AI responses or simulate completed runs.'
  };
}

function canonicalLanguages(values) {
  if (!Array.isArray(values)) throw fail(400, 'Enabled languages must be a list of language tags.');
  const unique = [];
  for (const raw of values.slice(0, 30)) {
    const value = text(raw, 35);
    let canonical;
    try { canonical = Intl.getCanonicalLocales(value)[0]; }
    catch { throw fail(400, 'One or more language tags are invalid. Use standard BCP 47 tags such as en, es or ht.'); }
    if (!unique.includes(canonical)) unique.push(canonical);
  }
  if (!unique.length) throw fail(400, 'Select at least one language.');
  return unique;
}

export function updateAISettings(db, ownerId, input = {}, { providerConfigured = false, now = new Date() } = {}) {
  const settings = getAISettings(db, ownerId);
  if (input.dailyTokenBudget !== undefined) {
    const budget = Number(input.dailyTokenBudget);
    if (!Number.isSafeInteger(budget) || budget < 500 || budget > 500000) throw fail(400, 'Daily AI token budget must be between 500 and 500,000 tokens.');
    settings.dailyTokenBudget = budget;
  }
  if (input.monthlySpendLimitUsd !== undefined) {
    const amount = Number(input.monthlySpendLimitUsd);
    if (!Number.isFinite(amount) || amount < 0.5 || amount > 500) throw fail(400, 'Monthly AI spend limit must be between US$0.50 and US$500.');
    settings.monthlySpendLimitUsd = Math.round(amount * 100) / 100;
  }
  if (input.enabledLanguages !== undefined) settings.enabledLanguages = canonicalLanguages(input.enabledLanguages);
  if (input.primaryLanguage !== undefined) {
    const primary = canonicalLanguages([input.primaryLanguage])[0];
    if (!settings.enabledLanguages.includes(primary)) settings.enabledLanguages = [primary, ...settings.enabledLanguages].slice(0, 30);
    settings.primaryLanguage = primary;
  }
  if (input.autoTranslate !== undefined) {
    if (typeof input.autoTranslate !== 'boolean') throw fail(400, 'Automatic translation must be enabled or disabled.');
    settings.autoTranslate = input.autoTranslate;
  }
  if (input.companionOptIn !== undefined) {
    if (typeof input.companionOptIn !== 'boolean') throw fail(400, 'Companion preference must be enabled or disabled.');
    if (input.companionOptIn && input.companionAcknowledged !== true) throw fail(400, 'Explicitly acknowledge that the companion is AI before enabling it.');
    settings.companionOptIn = input.companionOptIn;
    const current = db.aiBotCompanionConsents.find(row => row.ownerId === ownerId);
    const consent = {
      id: current?.id || makeId(), ownerId, optedIn: input.companionOptIn,
      acknowledgedAIIdentity: input.companionOptIn,
      retentionDays: 30, updatedAt: nowIso(now),
      withdrawnAt: input.companionOptIn ? null : nowIso(now)
    };
    if (current) Object.assign(current, consent);
    else db.aiBotCompanionConsents.push(consent);
  }
  if (input.globalPaused !== undefined) {
    if (typeof input.globalPaused !== 'boolean') throw fail(400, 'AI Network pause state must be a boolean.');
    if (input.globalPaused === false && !providerConfigured) throw fail(409, 'Configure and verify a server-side AI provider before unpausing AI execution.');
    settings.globalPaused = input.globalPaused;
    if (input.globalPaused) {
      for (const bot of ownerRows(db.aiBots, ownerId)) if (bot.status === 'active') bot.status = 'paused';
      for (const schedule of ownerRows(db.aiBotSchedules, ownerId)) if (schedule.status === 'active') schedule.status = 'paused';
    }
  }
  // Approval and disclosure controls are mandatory; requests to weaken them are rejected.
  if (input.humanApprovalRequired === false || input.aiIdentityLabelRequired === false) {
    throw fail(403, 'Human approval for high-impact actions and visible AI identity labels cannot be disabled.');
  }
  settings.humanApprovalRequired = true;
  settings.aiIdentityLabelRequired = true;
  settings.updatedAt = nowIso(now);
  audit(db, ownerId, ownerId, 'settings_updated', 'settings', settings.id, now);
  return settings;
}

function botSignature(bot) {
  const traits = [...(bot.traits || [])].sort();
  return [String(bot.purpose || '').toLowerCase(), bot.tone, traits.join(','), String(bot.expertise || '').toLowerCase()].join('|');
}

export function createAIBot(db, ownerId, input = {}, { now = new Date(), id: requestedId } = {}) {
  ensureAICollections(db);
  const name = text(input.name, 40);
  const purpose = text(input.purpose, 280);
  const tone = text(input.tone, 24).toLowerCase();
  const expertise = text(input.expertise, 180);
  const identityIdempotencyKey = text(input.identityIdempotencyKey, 160);
  if (identityIdempotencyKey) {
    const repeated = ownerRows(db.aiBots, ownerId).find(bot => bot.identityIdempotencyKey === identityIdempotencyKey);
    if (repeated) return repeated;
  }
  if (name.length < 2) throw fail(400, 'Give this AI bot a name with at least two characters.');
  if (purpose.length < 20) throw fail(400, 'Describe this bot’s purpose in at least 20 characters.');
  if (!BOT_TONES.has(tone)) throw fail(400, 'Choose a supported personality tone.');
  if (!Array.isArray(input.traits)) throw fail(400, 'Choose two to five personality traits.');
  const traits = [...new Set(input.traits.map(value => text(value, 24).toLowerCase()))];
  if (traits.length < 2 || traits.length > 5 || traits.some(value => !BOT_TRAITS.has(value))) throw fail(400, 'Choose two to five valid, distinct personality traits.');
  const languages = canonicalLanguages(input.languages || ['en']);
  const primaryLanguage = canonicalLanguages([input.primaryLanguage || languages[0]])[0];
  if (!languages.includes(primaryLanguage)) throw fail(400, 'The primary language must be enabled for this bot.');
  const capabilities = [...new Set(Array.isArray(input.capabilities) ? input.capabilities.map(value => text(value, 50)) : ['draft_content'])];
  if (!capabilities.length || capabilities.some(value => !AI_BOT_CAPABILITIES.includes(value))) throw fail(400, 'One or more requested bot capabilities are not allowed.');
  const existing = ownerRows(db.aiBots, ownerId).filter(bot => bot.status !== 'archived');
  if (existing.some(bot => bot.name.toLowerCase() === name.toLowerCase())) throw fail(409, 'You already have an AI bot with this name.');
  const candidate = { purpose, tone, traits, expertise };
  if (existing.some(bot => bot.personalitySignature === botSignature(candidate))) throw fail(409, 'This bot would duplicate an existing personality. Give it a distinct purpose, tone or trait combination.');
  const bot = {
    id: text(requestedId, 80) || makeId(), ownerId, name, purpose, tone, traits, expertise,
    languages, primaryLanguage, capabilities,
    ...(identityIdempotencyKey ? { identityIdempotencyKey } : {}),
    identityType: 'ai_bot',
    identityLabel: 'AI BOT', aiDisclosureRequired: true,
    humanApprovalRequired: true, status: 'draft',
    createdAt: nowIso(now), updatedAt: nowIso(now)
  };
  bot.personalitySignature = botSignature(bot);
  db.aiBots.push(bot);
  audit(db, ownerId, ownerId, 'bot_created', 'bot', bot.id, now);
  return bot;
}

export function updateAIBotStatus(db, ownerId, botId, status, { providerConfigured = false, now = new Date() } = {}) {
  const bot = ownerRows((ensureAICollections(db), db.aiBots), ownerId).find(row => row.id === botId);
  if (!bot) throw fail(404, 'AI bot not found.');
  if (!['active', 'paused', 'archived'].includes(status)) throw fail(400, 'Invalid AI bot status.');
  if (status === 'active') {
    const settings = getAISettings(db, ownerId);
    if (settings.globalPaused) throw fail(409, 'The AI Network is globally paused.');
    if (!providerConfigured) throw fail(409, 'Configure a server-side AI provider before activating bots.');
  }
  bot.status = status;
  bot.updatedAt = nowIso(now);
  audit(db, ownerId, ownerId, 'bot_status_' + status, 'bot', bot.id, now);
  return bot;
}

export function createAIBotTeam(db, ownerId, input = {}, { now = new Date() } = {}) {
  ensureAICollections(db);
  const name = text(input.name, 60), description = text(input.description, 240);
  if (name.length < 2) throw fail(400, 'Give the team a name.');
  const memberIds = [...new Set(Array.isArray(input.botIds) ? input.botIds.map(value => text(value, 80)).filter(Boolean) : [])];
  if (!memberIds.length || memberIds.length > 20) throw fail(400, 'Choose between one and 20 bots for the team.');
  const owned = new Set(ownerRows(db.aiBots, ownerId).filter(bot => bot.status !== 'archived').map(bot => bot.id));
  if (memberIds.some(id => !owned.has(id))) throw fail(403, 'Teams can contain only your own active or paused AI bots.');
  if (ownerRows(db.aiBotTeams, ownerId).some(team => team.name.toLowerCase() === name.toLowerCase())) throw fail(409, 'A team with this name already exists.');
  const team = {
    id: makeId(), ownerId, name, description, botIds: memberIds,
    coordinationMode: 'human_reviewed', aiDisclosureRequired: true,
    status: 'draft', createdAt: nowIso(now), updatedAt: nowIso(now)
  };
  db.aiBotTeams.push(team);
  audit(db, ownerId, ownerId, 'team_created', 'team', team.id, now);
  return team;
}

export function createAIBotSchedule(db, ownerId, input = {}, { now = new Date() } = {}) {
  ensureAICollections(db);
  const bot = ownerRows(db.aiBots, ownerId).find(row => row.id === input.botId && row.status !== 'archived');
  if (!bot) throw fail(404, 'Choose one of your own AI bots.');
  const taskType = text(input.taskType, 50);
  if (!AI_BOT_TASK_TYPES.includes(taskType)) throw fail(400, 'Choose a supported low-risk scheduled task.');
  const cadence = text(input.cadence, 20);
  if (!SCHEDULE_CADENCES.has(cadence)) throw fail(400, 'Choose once, daily or weekly scheduling.');
  const runAt = new Date(input.runAt);
  if (!Number.isFinite(runAt.getTime()) || runAt.getTime() < new Date(now).getTime() + 5 * 60 * 1000) {
    throw fail(400, 'Schedule time must be at least five minutes in the future.');
  }
  const timezone = text(input.timezone || 'UTC', 80);
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(runAt); }
  catch { throw fail(400, 'Choose a valid IANA time zone.'); }
  const schedule = {
    id: makeId(), ownerId, botId: bot.id, taskType, cadence,
    runAt: runAt.toISOString(), timezone, weekdays: cadence === 'weekly' && Array.isArray(input.weekdays)
      ? [...new Set(input.weekdays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))]
      : [],
    status: 'paused', requiresHumanApproval: true,
    aiDisclosureRequired: true, createdAt: nowIso(now), updatedAt: nowIso(now)
  };
  if (cadence === 'weekly' && !schedule.weekdays.length) throw fail(400, 'Select at least one weekday for a weekly schedule.');
  db.aiBotSchedules.push(schedule);
  audit(db, ownerId, ownerId, 'schedule_created_paused', 'schedule', schedule.id, now);
  return schedule;
}

export function updateAIBotScheduleStatus(db, ownerId, scheduleId, status, { providerConfigured = false, now = new Date() } = {}) {
  const schedule = ownerRows((ensureAICollections(db), db.aiBotSchedules), ownerId).find(row => row.id === scheduleId);
  if (!schedule) throw fail(404, 'AI schedule not found.');
  if (!['active', 'paused', 'cancelled'].includes(status)) throw fail(400, 'Invalid schedule status.');
  if (status === 'active') {
    if (getAISettings(db, ownerId).globalPaused) throw fail(409, 'The AI Network is globally paused.');
    if (!providerConfigured) throw fail(409, 'Configure a server-side AI provider before activating schedules.');
    const bot = ownerRows(db.aiBots, ownerId).find(row => row.id === schedule.botId);
    if (!bot || bot.status !== 'active') throw fail(409, 'Activate the assigned bot before enabling this schedule.');
  }
  schedule.status = status;
  schedule.updatedAt = nowIso(now);
  audit(db, ownerId, ownerId, 'schedule_' + status, 'schedule', schedule.id, now);
  return schedule;
}

export function createAICreatorJob(db, ownerId, input = {}, { now = new Date() } = {}) {
  ensureAICollections(db);
  const taskType = text(input.taskType, 50);
  if (!AI_BOT_TASK_TYPES.filter(type => type !== 'public_event_support').includes(taskType)) throw fail(400, 'Choose a supported Creator Studio task.');
  const bot = input.botId
    ? ownerRows(db.aiBots, ownerId).find(row => row.id === input.botId && row.status !== 'archived')
    : null;
  if (input.botId && !bot) throw fail(404, 'The selected AI bot is not available in this workspace.');
  const brief = text(input.brief, 8000);
  if (brief.length < 10) throw fail(400, 'Add a Creator Studio brief of at least 10 characters.');
  const job = {
    id: makeId(), ownerId, botId: bot?.id || null, taskType, brief,
    status: 'draft', output: null, aiDisclosureRequired: true,
    humanReviewRequired: true, providerExecution: 'not_started',
    createdAt: nowIso(now), updatedAt: nowIso(now)
  };
  db.aiBotCreatorJobs.push(job);
  audit(db, ownerId, ownerId, 'creator_job_drafted', 'creator_job', job.id, now);
  return job;
}

export function createAIApprovalRequest(db, ownerId, input = {}, { now = new Date() } = {}) {
  ensureAICollections(db);
  const actionType = text(input.actionType, 50);
  if (AI_BLOCKED_ACTIONS.includes(actionType)) throw fail(403, 'This action is never delegated to AI bots.');
  if (!AI_HIGH_IMPACT_ACTIONS.includes(actionType)) throw fail(400, 'Choose a supported high-impact action for review.');
  const bot = ownerRows(db.aiBots, ownerId).find(row => row.id === input.botId);
  if (!bot) throw fail(404, 'The requesting AI bot was not found in this workspace.');
  const summary = text(input.summary, 500);
  if (summary.length < 8) throw fail(400, 'Provide a short, reviewable action summary.');
  const approval = {
    id: makeId(), ownerId, botId: bot.id, actionType, summary,
    status: 'pending_human_review', requestedAt: nowIso(now),
    expiresAt: new Date(new Date(now).getTime() + 7 * 86400000).toISOString(),
    decidedAt: null, decidedBy: null, aiDisclosureRequired: true,
    executionStatus: 'not_executed'
  };
  db.aiBotApprovals.push(approval);
  audit(db, ownerId, ownerId, 'high_impact_action_requested', 'approval', approval.id, now);
  return approval;
}

export function decideAIApproval(db, ownerId, approvalId, decision, { now = new Date() } = {}) {
  const approval = ownerRows((ensureAICollections(db), db.aiBotApprovals), ownerId).find(row => row.id === approvalId);
  if (!approval) throw fail(404, 'Approval request not found.');
  if (approval.status !== 'pending_human_review') throw fail(409, 'This approval has already been decided.');
  if (!['approve', 'reject'].includes(decision)) throw fail(400, 'Choose approve or reject.');
  if (new Date(approval.expiresAt).getTime() <= new Date(now).getTime()) {
    approval.status = 'expired';
    approval.decidedAt = nowIso(now);
    approval.decidedBy = ownerId;
    approval.executionStatus = 'not_executed';
    audit(db, ownerId, ownerId, 'approval_expired', 'approval', approval.id, now);
    return approval;
  }
  approval.status = decision === 'approve' ? 'approved_not_executed' : 'rejected';
  approval.decidedAt = nowIso(now);
  approval.decidedBy = ownerId;
  // Approval is a human decision record; it never runs the underlying action.
  approval.executionStatus = 'not_executed';
  audit(db, ownerId, ownerId, 'approval_' + decision, 'approval', approval.id, now);
  return approval;
}

export function setAICompanionConsent(db, ownerId, enabled, acknowledgedAIIdentity, { now = new Date() } = {}) {
  ensureAICollections(db);
  if (typeof enabled !== 'boolean') throw fail(400, 'Companion preference must be enabled or disabled.');
  if (enabled && acknowledgedAIIdentity !== true) throw fail(400, 'Confirm that this companion is an AI, not a human, before opting in.');
  const settings = getAISettings(db, ownerId);
  settings.companionOptIn = enabled;
  settings.updatedAt = nowIso(now);
  let consent = db.aiBotCompanionConsents.find(row => row.ownerId === ownerId);
  if (!consent) {
    consent = { id: makeId(), ownerId };
    db.aiBotCompanionConsents.push(consent);
  }
  Object.assign(consent, {
    optedIn: enabled, acknowledgedAIIdentity: enabled, retentionDays: 30,
    optedInAt: enabled ? consent.optedInAt || nowIso(now) : consent.optedInAt || null,
    withdrawnAt: enabled ? null : nowIso(now), updatedAt: nowIso(now)
  });
  audit(db, ownerId, ownerId, enabled ? 'companion_opted_in' : 'companion_opted_out', 'companion_consent', consent.id, now);
  return consent;
}

export function createAICommunityEvent(db, ownerId, input = {}, { now = new Date() } = {}) {
  ensureAICollections(db);
  const bot = ownerRows(db.aiBots, ownerId).find(row => row.id === input.botId && row.status !== 'archived');
  if (!bot) throw fail(404, 'Choose one of your own AI bots to host the event.');
  const title = text(input.title, 100), description = text(input.description, 1200);
  if (title.length < 3 || description.length < 20) throw fail(400, 'Add an event title and a description of at least 20 characters.');
  const startsAt = new Date(input.startsAt);
  if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() < new Date(now).getTime() + 15 * 60 * 1000) throw fail(400, 'Community events must be scheduled at least 15 minutes ahead.');
  const visibility = text(input.visibility || 'public', 20);
  if (!EVENT_VISIBILITIES.has(visibility)) throw fail(400, 'Choose a supported event audience.');
  const event = {
    id: makeId(), ownerId, botId: bot.id, title, description,
    startsAt: startsAt.toISOString(), visibility, status: 'draft',
    hostIdentityType: 'ai_bot', aiDisclosureRequired: true,
    invitationMode: 'opt_in_only', createdAt: nowIso(now), updatedAt: nowIso(now)
  };
  db.aiBotCommunityEvents.push(event);
  audit(db, ownerId, ownerId, 'community_event_drafted', 'community_event', event.id, now);
  return event;
}

export function emergencyPauseAI(db, ownerId, reason = 'Owner emergency pause', { now = new Date() } = {}) {
  ensureAICollections(db);
  const settings = getAISettings(db, ownerId);
  settings.globalPaused = true;
  settings.updatedAt = nowIso(now);
  for (const bot of ownerRows(db.aiBots, ownerId)) if (bot.status === 'active') bot.status = 'paused';
  for (const schedule of ownerRows(db.aiBotSchedules, ownerId)) if (schedule.status === 'active') schedule.status = 'paused';
  for (const run of ownerRows(db.aiBotRuns, ownerId)) if (['queued', 'running'].includes(run.status)) {
    run.status = 'paused_by_emergency_stop';
    run.updatedAt = nowIso(now);
  }
  audit(db, ownerId, ownerId, 'emergency_pause', 'network', ownerId, now);
  return { paused: true, reason: text(reason, 180) || 'Owner emergency pause', pausedAt: settings.updatedAt };
}

export function getAIPerformanceSummary(db, ownerId) {
  ensureAICollections(db);
  const bots = ownerRows(db.aiBots, ownerId);
  const botIds = new Set(bots.map(bot => bot.id));
  const runs = ownerRows(db.aiBotRuns, ownerId).filter(run => botIds.has(run.botId));
  const tokenUse = runs.reduce((sum, run) => sum + Math.max(0, Number(run.totalTokens) || 0), 0);
  return {
    botCount: bots.length,
    activeBots: bots.filter(bot => bot.status === 'active').length,
    pausedBots: bots.filter(bot => bot.status === 'paused').length,
    teamCount: ownerRows(db.aiBotTeams, ownerId).length,
    scheduleCount: ownerRows(db.aiBotSchedules, ownerId).length,
    pendingApprovals: ownerRows(db.aiBotApprovals, ownerId).filter(item => item.status === 'pending_human_review').length,
    creatorDrafts: ownerRows(db.aiBotCreatorJobs, ownerId).filter(item => item.status === 'draft').length,
    completedRuns: runs.filter(run => run.status === 'completed').length,
    failedRuns: runs.filter(run => run.status === 'failed').length,
    totalTokensUsed: tokenUse,
    measuredRunCount: runs.length,
    source: 'recorded_ai_run_events_only'
  };
}

export function getAICommandCenter(db, ownerId, { providerStatus = getAIProviderStatus() } = {}) {
  const settings = getAISettings(db, ownerId);
  return {
    settings,
    providerStatus,
    performance: getAIPerformanceSummary(db, ownerId),
    bots: ownerRows(db.aiBots, ownerId),
    teams: ownerRows(db.aiBotTeams, ownerId),
    schedules: ownerRows(db.aiBotSchedules, ownerId),
    approvals: ownerRows(db.aiBotApprovals, ownerId).filter(item => item.status === 'pending_human_review'),
    creatorJobs: ownerRows(db.aiBotCreatorJobs, ownerId),
    companionConsent: db.aiBotCompanionConsents.find(row => row.ownerId === ownerId) || null,
    communityEvents: ownerRows(db.aiBotCommunityEvents, ownerId),
    safeguards: {
      globalPaused: settings.globalPaused,
      humanApprovalRequired: true,
      aiIdentityLabelRequired: true,
      highImpactActionsExecutedAutomatically: false,
      companionshipRequiresOptIn: true,
      providerExecutionEnabled: false
    }
  };
}
