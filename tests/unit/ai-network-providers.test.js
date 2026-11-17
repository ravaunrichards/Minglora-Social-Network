import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261114022049_minglora_ai_provider_catalog_and_assignments.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('provider catalogue and assignment history remain private to the service runtime', () => {
  for (const table of ['ai_provider_accounts','ai_provider_models','ai_provider_assignments','ai_provider_assignment_history']) {
    assert.ok(migration.includes('alter table ai_network.' + table + ' enable row level security'));
  }
  assert.ok(migration.includes("current_user <> 'service_role'"));
  assert.ok(migration.includes('revoke all on function public.minglora_ai_provider_command'));
  assert.ok(migration.includes('from public, anon, authenticated'));
  assert.ok(migration.includes('grant execute on function public.minglora_ai_provider_command'));
  assert.ok(migration.includes('to service_role'));
});

test('provider account registration cannot accept or persist credentials', () => {
  for (const key of ["'api_key'","'apiKey'","'access_token'","'accessToken'","'password'","'credential'","'secret'","'credential_secret_ref'"]) {
    assert.ok(migration.includes(key), 'Missing forbidden credential field: ' + key);
  }
  assert.ok(migration.includes('credential_secret_ref,provider_configuration,status,health_status') && migration.includes("null,'{}'::jsonb,'unconfigured','unknown'"));
  assert.ok(migration.includes("'unconfigured','unknown'"));
  assert.ok(migration.includes("'status',a.status"));
  assert.ok(!migration.includes("'credential_secret_ref',a.credential_secret_ref"));
});

test('provider model catalogue stores metadata and capability declarations only', () => {
  for (const column of [
    'provider_name','model_name','model_identifier','model_version',
    'model_capabilities','supported_languages','text_capability',
    'image_capability','audio_capability','video_capability','voice_capability','tool_capability'
  ]) assert.ok(migration.includes(column), 'Missing model metadata field: ' + column);
  assert.ok(migration.includes('on conflict (provider_name,model_identifier,model_version) do nothing'));
  assert.ok(migration.includes("where m.is_active=true"));
});

test('assignments are owner-scoped, capability-bounded and start pending with unknown health', () => {
  for (const invariant of [
    "i.owner_user_id=p_actor_user_id",
    "i.status not in ('suspended','archived','retired')",
    'a.owner_user_id=p_actor_user_id',
    'cap=any(v_model_capabilities)',
    'lang=any(v_supported_languages)',
    "'pending','unknown'",
    'ai_provider_assignments_identity_model_account_uq',
    'ai_provider_assignments_identity_model_no_account_uq',
    'on conflict do nothing',
    "return jsonb_build_object('assignment',v_result,'reused',v_reused)"
  ]) assert.ok(migration.includes(invariant), 'Missing assignment safety invariant: ' + invariant);
});

test('assignment status cannot be set active before a provider health verifier exists', () => {
  assert.ok(migration.includes("v_new_status not in ('pending','restricted','disabled','revoked')"));
  assert.ok(migration.includes('Provider assignments cannot be activated until provider health is independently verified.'));
  assert.ok(migration.includes("v_old_status='revoked' and v_new_status<>'revoked'"));
  assert.ok(migration.includes('ai_provider_assignment_history'));
  assert.ok(migration.includes('A reason of at least three characters is required.'));
});

test('runtime gateway allowlists provider commands and rejects secret payload fields', () => {
  for (const token of [
    'if (action === "ai_provider_command")',
    'supportedProviderCommands',
    '"list_provider_accounts"','"list_provider_models"','"list_provider_assignments"',
    '"create_provider_account"','"create_provider_model"','"assign_provider_model"',
    '"set_provider_assignment_status"',
    'secretFields',
    'admin.rpc("minglora_ai_provider_command"'
  ]) assert.ok(runtime.includes(token), 'Missing provider runtime control: ' + token);
});

test('provider API requires authorized platform staff and uses the Supabase runtime', () => {
  const start = server.indexOf("if (p === '/api/ai-network'");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  const route = server.slice(start, end);
  for (const token of [
    'const runAIProviderCommand = async',
    'isModerator(user, req)',
    "requestSupabaseState('ai_provider_command'",
    "sub === 'provider-accounts'",
    "sub === 'provider-models'",
    "sub === 'provider-assignments'",
    "'create_provider_account'","'create_provider_model'",
    "'assign_provider_model'","'set_provider_assignment_status'",
    'No provider data was changed'
  ]) assert.ok(route.includes(token), 'Missing authorized provider API control: ' + token);
});

test('OpenAI provider-health endpoint remains behind owner MFA and never accepts a key in the request', () => {
  const start = server.indexOf("if (p === '/api/ai-network'");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  const route = server.slice(start, end);
  for (const token of [
    'requireAuth(user)',
    '!isDesignatedCreatorHubAdmin(user)',
    '!hasActiveReviewerSession(user)',
    "if (method === 'POST' && sub === 'provider-health')",
    "input.provider !== 'openai'",
    "Object.keys(input).some(key => key !== 'provider')",
    'await probeOpenAIProvider()',
    'Credentials must be configured in the private server environment'
  ]) assert.ok(route.includes(token), 'Missing provider health route safety control: ' + token);
});

test('provider UI offers a secret-free OpenAI connection probe and no browser key input', () => {
  for (const token of [
    'data-ai-form="provider-health-probe"',
    "path = '/provider-health'",
    "payload.provider = 'openai'",
    'OPENAI_API_KEY',
    'Latest OpenAI probe:',
    'read-only probe',
    'AI inference and workers remain disabled'
  ]) assert.ok(ui.includes(token), 'Missing OpenAI probe workspace behavior: ' + token);
  assert.ok(!ui.includes('name="openaiApiKey"'));
  assert.ok(!ui.includes('name="OPENAI_API_KEY"'));
});

test('Creator Studio generation is owner-MFA protected, calls the moderation adapter and only saves a draft', () => {
  const start = server.indexOf("if (p === '/api/ai-network'");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  const route = server.slice(start, end);
  for (const token of [
    "if (method === 'POST' && parts[0] === 'creator-jobs' && parts[2] === 'generate'",
    'currentProviderStatus.manualDraftsAvailable',
    'startAICreatorJobGeneration(db, user.id, parts[1], { budgetRequestId })',
    'generateOpenAICreatorDraft({',
    'completeAICreatorJobGeneration(db, user.id, started.id, generated)',
    'failAICreatorJobGeneration(db, user.id, started.id, safeMessage, { providerFailure: error })',
    'await saveStore()',
    'Provider credentials and prompt overrides are not accepted',
    'No draft was generated'
  ]) assert.ok(route.includes(token), 'Missing Creator Studio provider generation safeguard: ' + token);
  assert.ok(route.indexOf('!isDesignatedCreatorHubAdmin(user)') >= 0);
  assert.ok(route.indexOf('!hasActiveReviewerSession(user)') >= 0);
  assert.ok(!route.includes('publish_content('));
  assert.ok(!route.includes('activate_worker('));
});

test('Creator Studio generation enforces the owner daily token budget before contacting OpenAI', () => {
  const start = server.indexOf("if (p === '/api/ai-network'");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  const route = server.slice(start, end);
  for (const token of [
    'getAISettings(db, user.id)',
    'getAICreatorDailyUsage(db, user.id)',
    'creatorSettings.dailyTokenBudget',
    'creatorDailyUsage.tokensUsed',
    'estimatedInputReserve',
    'allowedOutputTokens < 128',
    'maxOutputTokens: allowedOutputTokens'
  ]) assert.ok(route.includes(token), 'Missing Creator Studio token budget control: ' + token);
});

test('Creator Studio UI lets an owner trigger generation and renders human-review-only output', () => {
  for (const token of [
    'data-ai-action="creator-generate"',
    "request('/creator-jobs/' + encodeURIComponent(id) + '/generate'",
    'Generate with OpenAI',
    'Retry AI generation',
    'AI-generated draft · human review required',
    'Minglora does not publish or schedule it automatically',
    'Configure OPENAI_API_KEY and OPENAI_DEFAULT_MODEL'
  ]) assert.ok(ui.includes(token), 'Missing Creator Studio generation UI: ' + token);
  assert.ok(ui.includes('window.confirm('));
});

test('provider workspace renders the environment provider registry without exposing credential values', () => {
  for (const token of [
    'providerCatalogue = list(state.snapshot?.providerStatus?.providerCatalogue)',
    'Provider environment registry',
    'providersWithCredentials',
    'Required environment keys (complete one set):',
    'Credential values are never shown or accepted',
    'Execution enabled:'
  ]) assert.ok(ui.includes(token), 'Missing provider environment registry UI: ' + token);
});

test('provider workspace uses real rows and does not offer credential or activation controls', () => {
  for (const token of [
    'async function loadAIProviderRegistry',
    "request('/provider-accounts')",
    "request('/provider-models')",
    "request('/provider-assignments')",
    'function renderAIProviderCenter()',
    'data-ai-form="provider-account"',
    'data-ai-form="provider-model"',
    'data-ai-form="provider-assignment"',
    'data-ai-form="provider-assignment-status"',
    'Model assignment saved as pending',
    'credentials not stored here',
    'health unknown',
    'no API key, password, token or secret reference is accepted'
  ]) assert.ok(ui.includes(token), 'Missing provider workspace behavior: ' + token);
  assert.ok(!ui.includes('name="apiKey"'));
  assert.ok(!ui.includes('name="secret"'));
  assert.ok(!ui.includes('Activate provider'));
});
