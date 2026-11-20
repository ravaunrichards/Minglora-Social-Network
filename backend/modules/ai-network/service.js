import { createHash, randomUUID } from 'node:crypto';
import { getAIProviderCredentialStatus, listAIProviderCredentialStatuses } from './provider-config.js';

const nowIso = (now = new Date()) => new Date(now).toISOString();
const makeId = () => randomUUID();
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const ownerRows = (rows, ownerId) => (Array.isArray(rows) ? rows : []).filter(row => row?.ownerId === ownerId);

export const AI_BOT_ROLES = Object.freeze([
  'general_ai_member',
  'social_ai_personality',
  'business_ai_employee',
  'corporate_ai_department',
  'management_ai',
  'specialized_professional_ai',
  'customer_service_ai',
  'creative_ai',
  'research_ai',
  'administrative_ai'
]);
export const AI_BOT_SPECIALIZED_CAPABILITIES = Object.freeze([
  'community_engagement',
  'business_analysis',
  'department_coordination',
  'management_planning',
  'professional_explanations',
  'customer_support_guidance',
  'creative_ideation',
  'research_synthesis',
  'administrative_organization',
  'knowledge_explanations'
]);
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
    'aiBotCommunityEvents', 'aiBotConversations', 'aiBotConversationMessages',
    'aiBotUsageEvents', 'aiBotChatRequests'
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
  const configuredProvider = text(env.MINGLORA_AI_PROVIDER, 40).toLowerCase();
  const legacyModel = text(env.MINGLORA_AI_MODEL, 120);
  const openAIKeyPresent = Boolean(text(env.OPENAI_API_KEY, 4096) ||
    (configuredProvider === 'openai' && text(env.MINGLORA_AI_API_KEY, 4096)));
  const openAIModel = text(env.OPENAI_DEFAULT_MODEL, 120) ||
    (configuredProvider === 'openai' ? legacyModel : '');
  const provider = configuredProvider || (openAIKeyPresent ? 'openai' : '');
  const model = provider === 'openai' ? openAIModel : legacyModel;
  const legacyConfigured = Boolean(configuredProvider && legacyModel && text(env.MINGLORA_AI_API_KEY, 4096));
  const openAIConfigured = provider === 'openai' && openAIKeyPresent && Boolean(openAIModel);
  const configured = legacyConfigured || openAIConfigured;
  const providerCredentialStatus = provider
    ? getAIProviderCredentialStatus(provider, env)
    : null;
  const credentialsPresent = configured || Boolean(providerCredentialStatus?.credentialsPresent);
  const adapterAvailable = Boolean(providerCredentialStatus?.adapterAvailable);
  const manualDraftsAvailable = provider === 'openai' && openAIKeyPresent && Boolean(openAIModel) && adapterAvailable;
  const botChatAvailable = provider === 'openai' && openAIKeyPresent && Boolean(openAIModel) && adapterAvailable;
  return {
    configured,
    provider: configured ? provider : 'not_configured',
    model: configured ? model : null,
    credentialsPresent,
    providerCredentialStatus,
    providerCatalogue: listAIProviderCredentialStatuses(env),
    adapterAvailable,
    manualDraftsAvailable,
    botChatAvailable,
    connected: false,
    executionEnabled: false,
    note: manualDraftsAvailable
      ? 'OpenAI moderated, owner-initiated bot conversations and Creator Studio draft generation are available for explicit human requests. They use private server credentials, moderation and token budgets; autonomous workers, schedules and publishing remain disabled.'
      : configured
        ? 'Provider credentials are present, but the selected provider does not have an accepted human-initiated Minglora generation adapter.'
        : providerCredentialStatus?.credentialsPresent
          ? 'Selected provider credentials are present, but a usable model and approved generation adapter are not both configured.'
          : providerCredentialStatus?.note
            || 'No AI provider is configured. Minglora will not invent AI responses or simulate completed runs.'
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
  const specializations = [...(bot.specializedCapabilities || [])].sort();
  return [
    String(bot.purpose || '').toLowerCase(),
    bot.tone,
    traits.join(','),
    String(bot.expertise || '').toLowerCase(),
    String(bot.role || 'general_ai_member'),
    specializations.join(',')
  ].join('|');
}

function normalizedBotTraits(value) {
  if (!Array.isArray(value)) throw fail(400, 'Choose two to five personality traits.');
  const traits = [...new Set(value.map(item => text(item, 24).toLowerCase()))];
  if (traits.length < 2 || traits.length > 5 || traits.some(item => !BOT_TRAITS.has(item))) {
    throw fail(400, 'Choose two to five valid, distinct personality traits.');
  }
  return traits;
}

function normalizedBotCapabilities(value) {
  const capabilities = [...new Set(Array.isArray(value) ? value.map(item => text(item, 50)) : [])];
  if (!capabilities.length || capabilities.some(item => !AI_BOT_CAPABILITIES.includes(item))) {
    throw fail(400, 'One or more requested bot capabilities are not allowed.');
  }
  return capabilities;
}

function normalizedBotSpecializations(value) {
  const capabilities = [...new Set(Array.isArray(value) ? value.map(item => text(item, 50)) : [])];
  if (capabilities.length > AI_BOT_SPECIALIZED_CAPABILITIES.length ||
      capabilities.some(item => !AI_BOT_SPECIALIZED_CAPABILITIES.includes(item))) {
    throw fail(400, 'One or more specialized AI capabilities are not supported.');
  }
  return capabilities;
}

function botConfigurationSnapshot(bot, version, now) {
  return {
    schemaVersion: 1,
    version,
    role: bot.role,
    behaviorInstructions: bot.behaviorInstructions,
    specializedCapabilities: [...bot.specializedCapabilities],
    capabilities: [...bot.capabilities],
    personality: {
      name: bot.name,
      purpose: bot.purpose,
      tone: bot.tone,
      traits: [...bot.traits],
      expertise: bot.expertise,
      languages: [...bot.languages],
      primaryLanguage: bot.primaryLanguage
    },
    updatedAt: nowIso(now)
  };
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
  const traits = normalizedBotTraits(input.traits);
  const languages = canonicalLanguages(input.languages || ['en']);
  const primaryLanguage = canonicalLanguages([input.primaryLanguage || languages[0]])[0];
  if (!languages.includes(primaryLanguage)) throw fail(400, 'The primary language must be enabled for this bot.');
  const capabilities = normalizedBotCapabilities(input.capabilities || ['draft_content']);
  const role = text(input.role || 'general_ai_member', 50).toLowerCase();
  if (!AI_BOT_ROLES.includes(role)) throw fail(400, 'Choose a supported AI role.');
  const behaviorInstructions = text(input.behaviorInstructions, 4000);
  const specializedCapabilities = normalizedBotSpecializations(input.specializedCapabilities || []);
  const existing = ownerRows(db.aiBots, ownerId).filter(bot => bot.status !== 'archived');
  if (existing.some(bot => bot.name.toLowerCase() === name.toLowerCase())) throw fail(409, 'You already have an AI bot with this name.');
  const candidate = { purpose, tone, traits, expertise, role, specializedCapabilities };
  if (existing.some(bot => bot.personalitySignature === botSignature(bot))) throw fail(409, 'This bot would duplicate an existing personality. Give it a distinct purpose, tone, trait or specialization combination.');
  const bot = {
    id: text(requestedId, 80) || makeId(), ownerId, name, purpose, tone, traits, expertise,
    languages, primaryLanguage, capabilities, role, behaviorInstructions, specializedCapabilities,
    configurationVersion: 1,
    ...(identityIdempotencyKey ? { identityIdempotencyKey } : {}),
    identityType: 'ai_bot',
    identityLabel: 'AI BOT', aiDisclosureRequired: true,
    humanApprovalRequired: true, status: 'draft',
    createdAt: nowIso(now), updatedAt: nowIso(now)
  };
  bot.personalitySignature = botSignature(bot);
  bot.configuration = botConfigurationSnapshot(bot, 1, now);
  bot.configurationHistory = [structuredClone(bot.configuration)];
  db.aiBots.push(bot);
  audit(db, ownerId, ownerId, 'bot_created', 'bot', bot.id, now);
  return bot;
}

export function updateAIBotConfiguration(db, ownerId, botId, input = {}, { now = new Date() } = {}) {
  ensureAICollections(db);
  const bot = ownerRows(db.aiBots, ownerId).find(row => row.id === botId);
  if (!bot || bot.status === 'retired') throw fail(404, 'AI bot not found or permanently retired.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail(400, 'AI personality configuration must be a JSON object.');

  const next = {
    name: input.name === undefined ? bot.name : text(input.name, 40),
    purpose: input.purpose === undefined ? bot.purpose : text(input.purpose, 280),
    tone: input.tone === undefined ? bot.tone : text(input.tone, 24).toLowerCase(),
    expertise: input.expertise === undefined ? bot.expertise : text(input.expertise, 180),
    traits: input.traits === undefined ? [...(bot.traits || [])] : normalizedBotTraits(input.traits),
    languages: input.languages === undefined ? [...(bot.languages || ['en'])] : canonicalLanguages(input.languages),
    primaryLanguage: input.primaryLanguage === undefined ? (bot.primaryLanguage || 'en') : canonicalLanguages([input.primaryLanguage])[0],
    capabilities: input.capabilities === undefined ? [...(bot.capabilities || ['draft_content'])] : normalizedBotCapabilities(input.capabilities),
    role: input.role === undefined ? (bot.role || 'general_ai_member') : text(input.role, 50).toLowerCase(),
    behaviorInstructions: input.behaviorInstructions === undefined
      ? text(bot.behaviorInstructions || '', 4000) : text(input.behaviorInstructions, 4000),
    specializedCapabilities: input.specializedCapabilities === undefined
      ? [...(bot.specializedCapabilities || [])] : normalizedBotSpecializations(input.specializedCapabilities)
  };

  if (next.name.length < 2) throw fail(400, 'Give this AI bot a name with at least two characters.');
  if (next.purpose.length < 20) throw fail(400, 'Describe this bot’s purpose in at least 20 characters.');
  if (!BOT_TONES.has(next.tone)) throw fail(400, 'Choose a supported personality tone.');
  if (next.traits.length < 2 || next.traits.length > 5 || next.traits.some(item => !BOT_TRAITS.has(item))) {
    throw fail(400, 'Choose two to five valid, distinct personality traits.');
  }
  if (!next.languages.includes(next.primaryLanguage)) throw fail(400, 'The primary language must be enabled for this bot.');
  if (!AI_BOT_ROLES.includes(next.role)) throw fail(400, 'Choose a supported AI role.');
  if (!next.capabilities.length || next.capabilities.some(item => !AI_BOT_CAPABILITIES.includes(item))) {
    throw fail(400, 'One or more requested bot capabilities are not allowed.');
  }
  if (next.specializedCapabilities.some(item => !AI_BOT_SPECIALIZED_CAPABILITIES.includes(item))) {
    throw fail(400, 'One or more specialized AI capabilities are not supported.');
  }

  const existing = ownerRows(db.aiBots, ownerId).filter(row => row.id !== bot.id && !['archived','retired'].includes(row.status));
  if (existing.some(row => row.name.toLowerCase() === next.name.toLowerCase())) {
    throw fail(409, 'You already have an AI bot with this name.');
  }
  const candidate = { ...next };
  const nextSignature = botSignature(candidate);
  if (existing.some(row => row.personalitySignature === nextSignature)) {
    throw fail(409, 'This bot would duplicate another personality owned by this account.');
  }

  const version = Math.max(1, Number(bot.configurationVersion) || 1) + 1;
  Object.assign(bot, next);
  bot.personalitySignature = nextSignature;
  bot.configurationVersion = version;
  bot.configuration = botConfigurationSnapshot(bot, version, now);
  const history = Array.isArray(bot.configurationHistory) ? bot.configurationHistory : [];
  bot.configurationHistory = [...history, structuredClone(bot.configuration)].slice(-20);
  bot.updatedAt = nowIso(now);
  audit(db, ownerId, ownerId, 'bot_configuration_updated', 'bot', bot.id, now);
  return bot;
}

export function updateAIBotStatus(db, ownerId, botId, status, { providerConfigured = false, now = new Date() } = {}) {
  const bot = ownerRows((ensureAICollections(db), db.aiBots), ownerId).find(row => row.id === botId);
  if (!bot) throw fail(404, 'AI bot not found.');
  if (!['active', 'paused', 'archived', 'retired'].includes(status)) throw fail(400, 'Invalid AI bot status.');
  if (bot.status === 'retired' && status !== 'retired') throw fail(409, 'A retired AI identity cannot be resumed or edited.');
  if (bot.status === 'archived' && status !== 'retired') throw fail(409, 'An archived AI identity can only be retired.');
  if (status === 'retired' && bot.status !== 'archived') throw fail(409, 'Archive this AI identity before permanently retiring it.');
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

export function startAICreatorJobGeneration(db, ownerId, jobId, { now = new Date(), budgetRequestId = null } = {}) {
  const ownerJobs = ownerRows((ensureAICollections(db), db.aiBotCreatorJobs), ownerId);
  const job = ownerJobs.find(row => row.id === jobId);
  if (!job) throw fail(404, 'Creator Studio draft not found.');
  if (job.status !== 'draft' || job.output) throw fail(409, 'Only an unfinished Creator Studio draft can be generated.');
  const currentTime = new Date(now).getTime();
  const generationLeaseMs = 5 * 60 * 1000;
  for (const otherJob of ownerJobs) {
    if (otherJob.id === jobId || otherJob.providerExecution !== 'running') continue;
    const otherStartedAt = Date.parse(otherJob.providerStartedAt || '');
    const otherLeaseActive = Number.isFinite(otherStartedAt) && Number.isFinite(currentTime) && currentTime - otherStartedAt < generationLeaseMs;
    if (otherLeaseActive) throw fail(409, 'Another Creator Studio draft is currently being generated. Wait for it to finish before starting another.');
    otherJob.providerExecution = 'failed';
    otherJob.providerError = 'The previous generation attempt expired before completing. You can safely retry this draft.';
    otherJob.providerCompletedAt = nowIso(now);
    otherJob.updatedAt = nowIso(now);
    audit(db, ownerId, ownerId, 'creator_job_generation_lease_expired', 'creator_job', otherJob.id, now);
  }
  if (job.providerExecution === 'running') {
    const startedAt = Date.parse(job.providerStartedAt || '');
    const leaseExpired = !Number.isFinite(startedAt) || !Number.isFinite(currentTime) || currentTime - startedAt >= generationLeaseMs;
    if (!leaseExpired) throw fail(409, 'This Creator Studio draft is already being generated.');
    job.providerExecution = 'failed';
    job.providerError = 'The previous generation attempt expired before completing. You can safely retry this draft.';
    job.providerCompletedAt = nowIso(now);
    audit(db, ownerId, ownerId, 'creator_job_generation_lease_expired', 'creator_job', job.id, now);
  }
  if (job.providerExecution === 'completed') throw fail(409, 'This Creator Studio draft already has generated output.');
  if (budgetRequestId != null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(budgetRequestId))) {
    throw fail(400, 'A valid Creator Studio budget request ID is required.');
  }
  if (Number(job.providerUsage?.total_tokens) > 0) {
    const history = Array.isArray(job.providerUsageHistory) ? job.providerUsageHistory : [];
    history.push({
      provider: job.provider || 'openai',
      model: job.providerModel || null,
      responseId: job.providerResponseId || null,
      requestId: job.providerRequestId || null,
      usage: { ...job.providerUsage },
      completedAt: job.providerCompletedAt || null,
      budgetLedgeredAt: job.providerBudgetLedgeredAt === true
    });
    job.providerUsageHistory = history.slice(-50);
    job.providerUsage = null;
    job.provider = null;
    job.providerModel = null;
    job.providerResponseId = null;
    job.providerRequestId = null;
  }
  job.providerBudgetRequestId = budgetRequestId == null ? null : String(budgetRequestId).toLowerCase();
  job.providerBudgetLedgeredAt = false;
  job.providerExecution = 'running';
  job.providerStartedAt = nowIso(now);
  job.providerCompletedAt = null;
  job.providerError = null;
  job.updatedAt = nowIso(now);
  audit(db, ownerId, ownerId, 'creator_job_generation_started', 'creator_job', job.id, now);
  return job;
}

export function completeAICreatorJobGeneration(db, ownerId, jobId, generated, { now = new Date() } = {}) {
  const job = ownerRows((ensureAICollections(db), db.aiBotCreatorJobs), ownerId).find(row => row.id === jobId);
  if (!job) throw fail(404, 'Creator Studio draft not found.');
  if (job.providerExecution !== 'running') throw fail(409, 'The Creator Studio generation is not in a running state.');
  const output = text(generated?.output, 12000);
  if (output.length < 1) throw fail(502, 'The provider did not return draft content.');
  if (generated?.provider !== 'openai' || generated?.moderation?.flagged !== false) {
    throw fail(502, 'The provider result did not pass the required AI provider and moderation checks.');
  }
  job.output = output;
  job.provider = 'openai';
  job.providerModel = text(generated.model, 180);
  job.providerResponseId = text(generated.responseId, 180) || null;
  job.providerRequestId = text(generated.requestId, 180) || null;
  job.providerUsage = {
    input_tokens: Number.isFinite(Number(generated.usage?.input_tokens)) ? Number(generated.usage.input_tokens) : null,
    output_tokens: Number.isFinite(Number(generated.usage?.output_tokens)) ? Number(generated.usage.output_tokens) : null,
    total_tokens: Number.isFinite(Number(generated.usage?.total_tokens)) ? Number(generated.usage.total_tokens) : null
  };
  job.moderation = { model: text(generated.moderation.model, 80), flagged: false };
  job.aiDisclosureRequired = true;
  job.humanReviewRequired = true;
  job.published = false;
  job.externalActionTaken = false;
  job.providerExecution = 'completed';
  job.providerCompletedAt = nowIso(now);
  job.providerError = null;
  job.updatedAt = nowIso(now);
  audit(db, ownerId, ownerId, 'creator_job_generated_for_human_review', 'creator_job', job.id, now);
  return job;
}

export function failAICreatorJobGeneration(db, ownerId, jobId, reason, { now = new Date(), providerFailure = null } = {}) {
  const job = ownerRows((ensureAICollections(db), db.aiBotCreatorJobs), ownerId).find(row => row.id === jobId);
  if (!job) throw fail(404, 'Creator Studio draft not found.');
  if (job.providerExecution !== 'running') return job;
  job.providerExecution = 'failed';
  job.providerError = text(reason, 360) || 'Provider generation failed; no draft output was saved.';
  if (providerFailure?.provider === 'openai') {
    job.provider = 'openai';
    job.providerModel = text(providerFailure.model, 180);
    job.providerResponseId = text(providerFailure.responseId, 180) || null;
    job.providerRequestId = text(providerFailure.requestId, 180) || null;
    const usage = providerFailure.usage && typeof providerFailure.usage === 'object' ? providerFailure.usage : {};
    job.providerUsage = {
      input_tokens: Number.isFinite(Number(usage.input_tokens)) ? Math.max(0, Number(usage.input_tokens)) : null,
      output_tokens: Number.isFinite(Number(usage.output_tokens)) ? Math.max(0, Number(usage.output_tokens)) : null,
      total_tokens: Number.isFinite(Number(usage.total_tokens)) ? Math.max(0, Number(usage.total_tokens)) : null
    };
  }
  job.published = false;
  job.externalActionTaken = false;
  job.humanReviewRequired = true;
  job.aiDisclosureRequired = true;
  job.providerCompletedAt = nowIso(now);
  job.updatedAt = nowIso(now);
  audit(db, ownerId, ownerId, 'creator_job_generation_failed', 'creator_job', job.id, now);
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

const CHAT_MESSAGE_MAX_CHARACTERS = 4000;
const CHAT_HISTORY_LIMIT = 10;
const CHAT_REQUEST_LEASE_MS = 5 * 60 * 1000;
const CHAT_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getAIBotConversation(db, ownerId, botId, conversationId = null) {
  ensureAICollections(db);
  const bot = ownerRows(db.aiBots, ownerId).find(row => row.id === botId && row.status !== 'archived');
  if (!bot) throw fail(404, 'AI bot not found for this owner.');
  if (!bot.identityId || bot.identityLinkStatus !== 'linked') throw fail(409, 'This bot is not linked to a verified relational AI identity.');
  let conversation = null;
  if (conversationId) {
    conversation = ownerRows(db.aiBotConversations, ownerId)
      .find(row => row.id === conversationId && row.botId === botId && row.identityId === bot.identityId);
    if (!conversation) throw fail(404, 'The requested bot conversation was not found.');
  } else {
    conversation = ownerRows(db.aiBotConversations, ownerId)
      .filter(row => row.botId === botId && row.identityId === bot.identityId && row.status === 'open')
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt))[0] || null;
  }
  const messages = conversation
    ? ownerRows(db.aiBotConversationMessages, ownerId)
      .filter(row => row.conversationId === conversation.id && row.botId === botId && row.identityId === bot.identityId)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(-CHAT_HISTORY_LIMIT * 2)
    : [];
  return {
    bot: {
      id: bot.id, identityId: bot.identityId, name: bot.name,
      firstName: bot.firstName || '', lastName: bot.lastName || '',
      status: bot.status, purpose: bot.purpose, tone: bot.tone,
      traits: bot.traits, expertise: bot.expertise, languages: bot.languages
    },
    conversation,
    messages
  };
}

export function beginAIBotChatRequest(db, ownerId, {
  botId, identityId, conversationId = null, requestId, message
}, { now = new Date() } = {}) {
  ensureAICollections(db);
  const bot = ownerRows(db.aiBots, ownerId).find(row => row.id === botId && row.status !== 'archived');
  if (!bot) throw fail(404, 'AI bot not found for this owner.');
  if (!bot.identityId || bot.identityLinkStatus !== 'linked' || bot.identityId !== identityId) {
    throw fail(409, 'The AI bot is not linked to the selected relational identity.');
  }
  if (!CHAT_REQUEST_ID_PATTERN.test(String(requestId || ''))) throw fail(400, 'A valid chat request ID is required for safe retries.');
  const normalizedMessage = String(message ?? '').trim();
  if (!normalizedMessage || normalizedMessage.length > CHAT_MESSAGE_MAX_CHARACTERS) {
    throw fail(400, 'Bot chat messages must contain between 1 and 4,000 characters.');
  }
  if (conversationId) {
    const existingConversation = ownerRows(db.aiBotConversations, ownerId)
      .find(row => row.id === conversationId && row.botId === botId && row.identityId === identityId && row.status === 'open');
    if (!existingConversation) throw fail(404, 'The selected conversation is unavailable.');
  }
  const messageHash = createHash('sha256').update(normalizedMessage).digest('hex');
  const existing = ownerRows(db.aiBotChatRequests, ownerId).find(row => row.requestId === requestId);
  if (existing) {
    const suppliedConversationId = String(conversationId || '');
    const originalConversationId = String(existing.requestedConversationId || '');
    const completedConversationId = String(existing.conversationId || '');
    if (existing.botId !== botId || existing.identityId !== identityId || existing.messageHash !== messageHash ||
        (suppliedConversationId !== originalConversationId && suppliedConversationId !== completedConversationId)) {
      throw fail(409, 'This chat request ID was already used for a different request.');
    }
    if (existing.status === 'completed') {
      return { reused: true, request: existing, conversationId: existing.conversationId };
    }
    if (existing.status === 'running') {
      const startedAt = Date.parse(existing.startedAt || '');
      const currentTime = new Date(now).getTime();
      if (Number.isFinite(startedAt) && Number.isFinite(currentTime) && currentTime - startedAt < CHAT_REQUEST_LEASE_MS) {
        throw fail(409, 'This chat request is already being processed. Wait for it to finish before retrying.');
      }
      existing.status = 'failed';
      existing.errorCode = 'expired_lease';
      existing.completedAt = nowIso(now);
    }
    existing.status = 'running';
    existing.startedAt = nowIso(now);
    existing.completedAt = null;
    existing.errorCode = null;
    existing.updatedAt = nowIso(now);
    audit(db, ownerId, ownerId, 'bot_chat_request_retried', 'bot_chat_request', existing.id, now);
    return { reused: false, request: existing };
  }
  const request = {
    id: makeId(), ownerId, botId, identityId, conversationId: conversationId || null,
    requestId, messageHash, requestedConversationId: conversationId || null, status: 'running',
    startedAt: nowIso(now), completedAt: null, createdAt: nowIso(now), updatedAt: nowIso(now)
  };
  db.aiBotChatRequests.push(request);
  audit(db, ownerId, ownerId, 'bot_chat_request_started', 'bot_chat_request', request.id, now);
  return { reused: false, request };
}

export function completeAIBotChatRequest(db, ownerId, requestId, exchange, { now = new Date() } = {}) {
  ensureAICollections(db);
  const request = ownerRows(db.aiBotChatRequests, ownerId).find(row => row.requestId === requestId);
  if (!request) throw fail(404, 'AI bot chat request not found.');
  if (request.status === 'completed') {
    return getAIBotConversation(db, ownerId, request.botId, request.conversationId);
  }
  if (request.status !== 'running') throw fail(409, 'The AI bot chat request is not in a running state.');
  const bot = ownerRows(db.aiBots, ownerId).find(row => row.id === request.botId && row.identityId === request.identityId);
  if (!bot || bot.status === 'archived') throw fail(404, 'The AI bot is no longer available.');
  const userMessage = text(exchange?.userMessage, CHAT_MESSAGE_MAX_CHARACTERS);
  const assistantMessage = text(exchange?.assistantMessage, 8000);
  if (!userMessage || !assistantMessage) throw fail(502, 'The moderated conversation exchange is incomplete.');
  if (exchange?.provider !== 'openai' || exchange?.moderation?.flagged !== false) {
    throw fail(502, 'The chat response did not pass provider and moderation validation.');
  }
  let conversation = request.conversationId
    ? ownerRows(db.aiBotConversations, ownerId).find(row => row.id === request.conversationId && row.botId === request.botId && row.identityId === request.identityId)
    : null;
  if (!conversation) {
    conversation = {
      id: makeId(), ownerId, botId: request.botId, identityId: request.identityId,
      status: 'open', messageCount: 0, createdAt: nowIso(now), updatedAt: nowIso(now)
    };
    db.aiBotConversations.push(conversation);
  }
  const tokens = {
    input_tokens: Number.isFinite(Number(exchange.usage?.input_tokens)) ? Math.max(0, Number(exchange.usage.input_tokens)) : null,
    output_tokens: Number.isFinite(Number(exchange.usage?.output_tokens)) ? Math.max(0, Number(exchange.usage.output_tokens)) : null,
    total_tokens: Number.isFinite(Number(exchange.usage?.total_tokens)) ? Math.max(0, Number(exchange.usage.total_tokens)) : null
  };
  const userRow = {
    id: makeId(), ownerId, botId: request.botId, identityId: request.identityId,
    conversationId: conversation.id, requestId, role: 'user', content: userMessage,
    aiDisclosureRequired: false, createdAt: nowIso(now)
  };
  const assistantRow = {
    id: makeId(), ownerId, botId: request.botId, identityId: request.identityId,
    conversationId: conversation.id, requestId, role: 'assistant', content: assistantMessage,
    provider: 'openai', providerModel: text(exchange.model, 180),
    providerResponseId: text(exchange.responseId, 180) || null,
    providerRequestId: text(exchange.providerRequestId, 180) || null,
    providerUsage: tokens, moderation: { model: text(exchange.moderation.model, 80), flagged: false },
    aiDisclosureRequired: true, humanReviewRequired: true, externalActionsTaken: false,
    createdAt: nowIso(now)
  };
  db.aiBotConversationMessages.push(userRow, assistantRow);
  conversation.messageCount = Math.max(0, Number(conversation.messageCount) || 0) + 2;
  conversation.lastMessageAt = nowIso(now);
  conversation.updatedAt = nowIso(now);
  request.status = 'completed';
  request.conversationId = conversation.id;
  request.completedAt = nowIso(now);
  request.updatedAt = nowIso(now);
  db.aiBotUsageEvents.push({
    id: makeId(), ownerId, botId: request.botId, identityId: request.identityId,
    conversationId: conversation.id, requestId, operation: 'bot_chat', provider: 'openai',
    model: text(exchange.model, 180), usage: tokens, createdAt: nowIso(now)
  });
  audit(db, ownerId, ownerId, 'bot_chat_exchange_completed', 'bot_conversation', conversation.id, now);
  return getAIBotConversation(db, ownerId, request.botId, conversation.id);
}

export function failAIBotChatRequest(db, ownerId, requestId, reason, {
  providerFailure = null, now = new Date()
} = {}) {
  ensureAICollections(db);
  const request = ownerRows(db.aiBotChatRequests, ownerId).find(row => row.requestId === requestId);
  if (!request) throw fail(404, 'AI bot chat request not found.');
  if (request.status === 'completed') return request;
  request.status = 'failed';
  request.errorCode = text(providerFailure?.code, 80) || 'chat_failed';
  request.errorMessage = text(reason, 360) || 'The AI bot could not complete this reply.';
  request.completedAt = nowIso(now);
  request.updatedAt = nowIso(now);
  const usage = providerFailure?.usage && typeof providerFailure.usage === 'object' ? {
    input_tokens: Number.isFinite(Number(providerFailure.usage.input_tokens)) ? Math.max(0, Number(providerFailure.usage.input_tokens)) : null,
    output_tokens: Number.isFinite(Number(providerFailure.usage.output_tokens)) ? Math.max(0, Number(providerFailure.usage.output_tokens)) : null,
    total_tokens: Number.isFinite(Number(providerFailure.usage.total_tokens)) ? Math.max(0, Number(providerFailure.usage.total_tokens)) : null
  } : null;
  if (providerFailure?.provider === 'openai' && usage?.total_tokens > 0 &&
      !ownerRows(db.aiBotUsageEvents, ownerId).some(event => event.requestId === requestId)) {
    db.aiBotUsageEvents.push({
      id: makeId(), ownerId, botId: request.botId, identityId: request.identityId,
      conversationId: request.conversationId || null, requestId, operation: 'bot_chat',
      provider: 'openai', model: text(providerFailure.model, 180), usage,
      rejectedOrFailed: true, createdAt: nowIso(now)
    });
  }
  audit(db, ownerId, ownerId, 'bot_chat_request_failed', 'bot_chat_request', request.id, now);
  return request;
}

function getCreatorJobUsageEntries(job) {
  const entries = (Array.isArray(job.providerUsageHistory) ? job.providerUsageHistory : [])
    .filter(attempt => attempt && typeof attempt === 'object')
    .map(attempt => ({
      usage: attempt.usage,
      completedAt: attempt.completedAt || null,
      budgetLedgeredAt: attempt.budgetLedgeredAt === true
    }));
  if (job.providerUsage && typeof job.providerUsage === 'object') {
    entries.push({
      usage: job.providerUsage,
      completedAt: job.providerCompletedAt || null,
      budgetLedgeredAt: job.providerBudgetLedgeredAt === true
    });
  }
  return entries;
}

export function getAICreatorDailyUsage(db, ownerId, { now = new Date() } = {}) {
  ensureAICollections(db);
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const cutoff = dayStart.getTime();
  const jobUsageEntries = ownerRows(db.aiBotCreatorJobs, ownerId).flatMap(job =>
    getCreatorJobUsageEntries(job)
      .filter(entry => entry.budgetLedgeredAt !== true)
      .map(entry => ({ ...entry, jobId: job.id }))
  ).filter(entry => {
    const completedAt = Date.parse(entry.completedAt || '');
    const totalTokens = Number(entry.usage?.total_tokens) || 0;
    return Number.isFinite(completedAt) && completedAt >= cutoff && totalTokens > 0;
  });
  const chatEvents = ownerRows(db.aiBotUsageEvents, ownerId).filter(event =>
    event.operation === 'bot_chat' &&
    Number.isFinite(Date.parse(event.createdAt || '')) &&
    Date.parse(event.createdAt) >= cutoff &&
    (Number(event.usage?.total_tokens) || 0) > 0
  );
  const jobTokens = jobUsageEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.usage?.total_tokens) || 0), 0);
  const chatTokens = chatEvents.reduce((sum, event) => sum + Math.max(0, Number(event.usage?.total_tokens) || 0), 0);
  return {
    tokensUsed: jobTokens + chatTokens,
    draftsWithTokenUsage: new Set(jobUsageEntries.map(entry => entry.jobId)).size,
    chatRequestsWithTokenUsage: chatEvents.length,
    date: dayStart.toISOString().slice(0, 10)
  };
}

export function getAIPerformanceSummary(db, ownerId) {
  ensureAICollections(db);
  const bots = ownerRows(db.aiBots, ownerId);
  const botIds = new Set(bots.map(bot => bot.id));
  const runs = ownerRows(db.aiBotRuns, ownerId).filter(run => botIds.has(run.botId));
  const tokenUse = runs.reduce((sum, run) => sum + Math.max(0, Number(run.totalTokens) || 0), 0);
  const creatorDraftTokenUse = ownerRows(db.aiBotCreatorJobs, ownerId)
    .reduce((sum, job) => sum +
      (Array.isArray(job.providerUsageHistory) ? job.providerUsageHistory : [])
        .reduce((historyTotal, attempt) => historyTotal + Math.max(0, Number(attempt.usage?.total_tokens) || 0), 0) +
      Math.max(0, Number(job.providerUsage?.total_tokens) || 0), 0);
  const botChatTokenUse = ownerRows(db.aiBotUsageEvents, ownerId)
    .filter(event => event.operation === 'bot_chat')
    .reduce((sum, event) => sum + Math.max(0, Number(event.usage?.total_tokens) || 0), 0);
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
    totalTokensUsed: tokenUse + creatorDraftTokenUse + botChatTokenUse,
    creatorDraftTokensUsed: creatorDraftTokenUse,
    botChatTokensUsed: botChatTokenUse,
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
