import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const migration=read('supabase/migrations/20261117130000_minglora_ai_provider_execution_verification.sql');
const gateway=read('supabase/functions/minglora-runtime-state/index.ts');
const server=read('src/server.js');
const ui=read('public/ai-network.js');
const chat=read('backend/modules/ai-network/openai-bot-chat.js');

test('provider execution health ledger is private, append-only from the server and indexed',()=>{
  assert.ok(migration.includes('ai_provider_health_events'));
  assert.ok(migration.includes('enable row level security'));
  assert.ok(migration.includes('revoke all on ai_network.ai_provider_health_events from public, anon, authenticated'));
  assert.ok(migration.includes('grant select, insert on ai_network.ai_provider_health_events to service_role'));
  assert.ok(migration.includes('ai_provider_health_events_owner_checked_idx'));
  assert.ok(migration.includes('ai_provider_health_events_assignment_checked_idx'));
  assert.ok(migration.includes('current_user <> \'service_role\''));
  assert.ok(migration.includes('revoke all on function public.minglora_ai_provider_execution_command'));
  assert.ok(migration.includes('grant execute on function public.minglora_ai_provider_execution_command(text,uuid,jsonb) to service_role'));
});

test('only a successful moderated inference smoke test can activate an assignment',()=>{
  for(const token of [
    "v_health_status='healthy' and (not v_connected or v_probe_status<>'inference_verified')",
    "when v_health_status='healthy' then 'configured'",
    "when v_health_status='healthy' then 'active'",
    "m.is_active=true and m.text_capability=true",
    "'text'=any(a.assigned_capabilities)",
    "i.status='active' and i.enabled=true",
    "health_status,probe_status,http_status,input_tokens,output_tokens,total_tokens"
  ]) assert.ok(migration.includes(token),'Missing activation gate: '+token);
  assert.ok(!migration.includes('api_key text'));
  assert.ok(!migration.includes('credential text'));
});

test('runtime gateway exposes a narrowly allowlisted private execution verification action',()=>{
  for(const token of [
    '"ai_provider_execution_command"',
    'if (action === "ai_provider_execution_command")',
    'aiAction !== "verify_assignment"',
    'allowedFields',
    'admin.rpc("minglora_ai_provider_execution_command"'
  ]) assert.ok(gateway.includes(token),'Missing provider execution gateway rule: '+token);
  assert.ok(gateway.includes('custom API key') || gateway.includes('render_runtime') || gateway.includes('x-minglora-api-key'));
});

test('administrator execution verification uses persisted model metadata, a fresh probe and a moderated smoke test',()=>{
  const start=server.indexOf("if (p === '/api/ai-network'");
  const end=server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')",start);
  const route=server.slice(start,end);
  for(const token of [
    "parts[2] === 'verify'",
    "runAIProviderCommand('list_provider_assignments')",
    "runAIProviderCommand('list_provider_models')",
    "probeOpenAIProvider({ model: model.model_identifier })",
    "verifyOpenAIModelExecution({ model: model.model_identifier",
    "runAIProviderExecutionCommand('verify_assignment'",
    "health_status: 'healthy'",
    "probe_status: verified.probeStatus"
  ]) assert.ok(route.includes(token),'Missing assignment verification route behavior: '+token);
  assert.ok(route.includes('isModerator(user, req)'));
  assert.ok(!route.includes('input.model'));
  assert.ok(!route.includes('input.api_key'));
});

test('chat selects a persisted per-identity model and will not fall back on moderation failures',()=>{
  assert.ok(server.includes('resolveAssignedProviderRoute('));
  assert.ok(server.includes('providerExecutionRoute.primary'));
  assert.ok(server.includes('providerExecutionRoute.fallback'));
  assert.ok(server.includes('canUseProviderFallback(error)'));
  assert.ok(chat.includes('store: false'));
  assert.ok(chat.includes('tools: []'));
  assert.ok(chat.includes('verifyOpenAIModelExecution'));
});

test('provider UI requires confirmation before its billable execution check',()=>{
  assert.ok(ui.includes('data-ai-form="provider-assignment-verify"'));
  assert.ok(ui.includes('Run a real, billable model test for this AI assignment?'));
  assert.ok(ui.includes('Run billable model execution test'));
  assert.ok(ui.includes('model.execution test'));
  assert.ok(!ui.includes('name="apiKey"'));
  assert.ok(!ui.includes('name="secret"'));
});
