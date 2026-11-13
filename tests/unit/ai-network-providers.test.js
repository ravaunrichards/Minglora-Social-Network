import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261113140000_minglora_ai_provider_catalog_and_assignments.sql');
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
