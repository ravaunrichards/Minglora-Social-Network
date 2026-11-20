import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Phase 4.3 migration adds sanitized provider health history with RLS and service-only access', () => {
  const migration = read('supabase/migrations/20261120070700_minglora_ai_provider_connection_management.sql');
  assert.match(migration, /create table if not exists ai_network\.ai_provider_health_events/);
  assert.match(migration, /alter table ai_network\.ai_provider_health_events enable row level security/);
  assert.match(migration, /grant select, insert on ai_network\.ai_provider_health_events to service_role/);
  assert.match(migration, /health_status in \(/);
  assert.match(migration, /response_time_ms between 0 and 120000/);
  assert.match(migration, /metadata jsonb not null default '\{\}'::jsonb/);
  assert.match(migration, /v_action = 'record_provider_health'/);
  assert.match(migration, /v_action = 'list_provider_health'/);
  assert.match(migration, /order by h\.checked_at desc[\s\S]*?limit 50/);
  assert.match(migration, /v_action = 'set_provider_account_status'/);
  assert.match(migration, /v_new_status not in \('enabled','disabled','revoked'\)/);
  assert.match(migration, /successful provider health check must complete within the last 15 minutes/);
  assert.match(migration, /Raw credentials and secret references cannot be submitted/);
  assert.match(migration, /revoke all on function public\.minglora_ai_provider_command/);
  assert.match(migration, /check \(status in \('unconfigured','configured','restricted','enabled','disabled','revoked'\)\)/);
  assert.match(migration, /when v_health_status='degraded' then 'degraded'[\s\S]*else 'unavailable'/);
  assert.match(migration, /if v_action = 'record_provider_health' then[\s\S]*insert into ai_network\.ai_provider_health_events/);
  assert.match(migration, /if v_action = 'set_provider_account_status' then[\s\S]*for update[\s\S]*successful provider health check must complete within the last 15 minutes/);

});

test('provider health route supports implemented adapters but accepts no credentials', () => {
  const server = read('src/server.js');
  assert.match(server, /probeAIProvider, SUPPORTED_AI_PROVIDER_ADAPTERS/);
  assert.match(server, /sub === 'provider-health'/);
  assert.match(server, /allowedKeys = new Set\(\['provider','provider_account_id','model'\]\)/);
  assert.match(server, /SUPPORTED_AI_PROVIDER_ADAPTERS\.includes\(provider\)/);
  assert.match(server, /runAIProviderCommand\('record_provider_health'/);
  assert.match(server, /responseTimeMs/);
});

test('provider account management exposes explicit enable/disable and health history routes', () => {
  const server = read('src/server.js');
  assert.match(server, /provider-accounts' && parts\.length === 3 && parts\[2\] === 'status'/);
  assert.match(server, /runAIProviderCommand\('set_provider_account_status'/);
  assert.match(server, /provider-accounts' && parts\.length === 3 && parts\[2\] === 'health'/);
  assert.match(server, /runAIProviderCommand\('list_provider_health'/);
});

test('admin provider UI exposes connection checks and account status controls without secret inputs', () => {
  const ui = read('public/ai-network.js');
  assert.match(ui, /data-ai-form="provider-health-probe"/);
  assert.match(ui, /name="provider"/);
  assert.match(ui, /name="providerAccountId"/);
  assert.match(ui, /data-ai-form="provider-account-status"/);
  assert.match(ui, /path = '\/provider-health'/);
  assert.ok(ui.includes("path = '/provider-accounts/' + encodeURIComponent(accountId) + '/status';"));
  assert.doesNotMatch(ui, /name=['"](?:apiKey|providerApiKey|MINGLORA_AI_API_KEY|secret)['"]/);
});

test('connection status cannot be presented as execution enablement in the admin UI', () => {
  const ui = read('public/ai-network.js');
  assert.match(ui, /does not enable execution automatically/);
  assert.match(ui, /AI inference and workers remain disabled/);
});

test('model synchronization imports provider-listed models and keeps inference disabled', () => {
  const server = read('src/server.js');
  const ui = read('public/ai-network.js');
  assert.match(server, /sub === 'provider-models\/sync'/);
  assert.match(server, /listAIProviderModels\(provider\)/);
  assert.match(server, /runAIProviderCommand\('create_provider_model'/);
  assert.match(server, /inference_verified: false/);
  assert.match(server, /provider_listed_only: true/);
  assert.match(server, /model shutdown|shutdownDate/);
  assert.match(ui, /data-ai-form="provider-model-sync"/);
  assert.match(ui, /Discover and synchronize models/);
  assert.match(ui, /listing access is verified; inference is not/i);
});

test('provider model selection rechecks the live provider list before assignment', () => {
  const server = read('src/server.js');
  assert.match(server, /verifyProviderModelSelection/);
  assert.match(server, /listAIProviderModels\(providerId\)/);
  assert.match(server, /selected\.model_identifier/);
  assert.match(server, /selected model is not currently returned as active by the provider model-list API/);
  assert.match(server, /await verifyProviderModelSelection\(String\(input\.model_id/);
  assert.match(server, /await verifyProviderModelSelection\(String\(item\.model_id/);
});

test('provider account status control uses PATCH and selected fallback models are revalidated', () => {
  const ui = read('public/ai-network.js');
  const server = read('src/server.js');
  assert.match(ui, /provider-account-status','provider-assignment-status/);
  assert.match(server, /if \(input\.fallback_model_id\) await verifyProviderModelSelection/);
  assert.match(server, /const lifecycleInvalid = providerId === 'anthropic'/);
  assert.match(server, /model\.lifecycle && model\.lifecycle !== 'active'/);
});

test('persisted provider checks require a managed account mapped to private platform credentials', () => {
  const server = read('src/server.js');
  const ui = read('public/ai-network.js');
  assert.match(server, /account\.account_type !== 'managed'/);
  assert.match(server, /User-managed account secrets are not connected to Minglora yet/);
  assert.match(server, /account\.status \|\| ''\)\.toLowerCase\(\) === 'revoked'/);
  assert.match(ui, /accounts\.filter\(account => account\.account_type === 'managed'\)/);
});

test('provider health persistence maps adapter-only errors into supported event statuses', () => {
  const server = read('src/server.js');
  assert.match(server, /'model_unavailable','rate_limited','provider_unavailable','network_error'/);
  assert.match(server, /\? String\(health\.status\)\.toLowerCase\(\)/);
  assert.match(server, /: 'provider_error'/);
});

test('provider assignments fail closed for unimplemented providers and require active Anthropic lifecycle', () => {
  const server = read('src/server.js');
  assert.match(server, /no implemented live model-discovery adapter/);
  assert.match(server, /const lifecycleInvalid = providerId === 'anthropic'/);
  assert.match(server, /model\.lifecycle !== 'active'/);
  assert.match(server, /if \(provider === 'anthropic' && model\.lifecycle !== 'active'\) return false/);
});

test('bounded inference verification uses a fixed prompt and withholds generated output', () => {
  const server = read('src/server.js');
  const ui = read('public/ai-network.js');
  assert.match(server, /sub === 'provider-inference-verification'/);
  assert.ok(
    server.indexOf('const verifyProviderModelSelection') < server.indexOf("if (method === 'POST' && sub === 'provider-inference-verification')"),
    'Model selection verification helper must be initialized before the inference route.'
  );
  assert.match(server, /Object\.keys\(input\)\.some\(key => !\['provider_account_id','model_id'\]\.includes\(key\)\)/);
  assert.match(server, /generateAIProviderText\(provider/);
  assert.ok(server.includes("if (!/^READY[.!]?$/i.test(output))"));
  assert.match(server, /maxOutputTokens: 8/);
  assert.match(server, /timeoutMs: 20000/);
  assert.match(server, /output_retained: false/);
  assert.match(server, /inference_verification_attempt: true/);
  assert.match(server, /inference_verified: true/);
  assert.match(server, /30-second safety interval/);
  assert.match(server, /const reservationTimestamp = aiProviderInferenceCooldown\.get\(accountId\) \|\| 0/);
  assert.match(ui, /data-ai-form="provider-inference-verification"/);
  assert.match(ui, /prompt cannot be edited/);
  assert.match(ui, /Generated output retained: no/);
  assert.match(ui, /provider-inference-verification/);
});

test('provider enablement requires a recent successful inference event in addition to health', () => {
  const migration = read('supabase/migrations/20261120070700_minglora_ai_provider_connection_management.sql');
  assert.match(migration, /metadata->>'inference_verification_attempt'='true'/);
  assert.match(migration, /metadata->>'inference_verified'\)='true'/);
  assert.match(migration, /v_inference_verified is distinct from true/);
  assert.match(migration, /successful inference verification must complete within the last 15 minutes/);
});
