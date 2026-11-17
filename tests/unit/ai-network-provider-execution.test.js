import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20261117140000_minglora_ai_provider_model_execution.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('provider execution health history is private, indexed and excludes credential material', () => {
  for (const token of [
    'ai_provider_health_events',
    'enable row level security',
    'revoke all on table ai_network.ai_provider_health_events from public,anon,authenticated',
    'grant select,insert on table ai_network.ai_provider_health_events to service_role',
    'credential_environment_variable',
    'provider_health_verified',
    'provider_health_failed'
  ]) assert.ok(migration.includes(token), 'Missing health audit control: ' + token);
  assert.match(migration, /current_user <> 'service_role'/);
  assert.match(migration, /revoke all on function public\.minglora_ai_provider_execution_command/);
  assert.match(migration, /grant execute on function public\.minglora_ai_provider_execution_command.*to service_role/);
});

test('identity routing selects only enabled owner-owned identities with active, healthy, recent text assignments', () => {
  for (const token of [
    "i.owner_user_id=p_actor_user_id",
    "i.enabled=true",
    "i.status='active'",
    "a.assignment_status='active'",
    "a.provider_health_status='healthy'",
    "pa.status='configured'",
    "pa.health_status='healthy'",
    "pa.last_checked_at >= now()-interval '15 minutes'",
    "a.last_checked_at >= now()-interval '15 minutes'",
    "m.text_capability=true",
    "'text'=any(a.assigned_capabilities)",
    'order by a.routing_priority asc'
  ]) assert.ok(migration.includes(token), 'Missing routing safeguard: ' + token);
});

test('provider activation requires an exact, recent successful probe for the assigned model', () => {
  for (const token of [
    "v_outcome<>'healthy'",
    "v_probe_method<>'model_retrieval'",
    "v_checked_at < now()-interval '90 seconds'",
    "v_payload->>'provider_name'",
    "v_payload->>'model_identifier'",
    "set assignment_status='active'",
    "set status='configured'",
    "credential_source','server_environment'"
  ]) assert.ok(migration.includes(token), 'Missing activation check: ' + token);
});

test('runtime gateway allows only provider execution commands and rejects submitted credentials', () => {
  assert.ok(runtime.includes('"ai_provider_execution_command"'));
  assert.ok(runtime.includes('"resolve_execution"'));
  assert.ok(runtime.includes('"get_assignment_for_verification"'));
  assert.ok(runtime.includes('"record_probe_result"'));
  assert.ok(runtime.includes('"activate_verified_assignment"'));
  assert.ok(runtime.includes('Provider secrets cannot be submitted'));
});

test('server resolves assignments before token reservation and routes only through the adapter registry', () => {
  const start = server.indexOf("if (p === '/api/ai-network'");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  const route = server.slice(start, end);
  assert.match(route, /runAIProviderExecutionCommand\('resolve_execution'/);
  assert.match(route, /probeAssignedProvider\(/);
  assert.match(route, /generateAIProviderReply\(\{\s*assignment: providerAssignment/);
  assert.ok(route.includes("parts[2] === 'verify'"));
  assert.ok(route.includes("requestSupabaseState('ai_provider_execution_command'"));
  assert.ok(route.indexOf("runAIProviderExecutionCommand('resolve_execution'") < route.indexOf("runAIBotChatCommand('begin_request'"));
});

test('provider assignment UI exposes verify-and-activate without a browser credential field', () => {
  assert.ok(ui.includes('provider-assignment-verify'));
  assert.ok(ui.includes('Verify & activate'));
  assert.ok(ui.includes('Re-check model health'));
  assert.ok(ui.includes("'/provider-assignments/' + encodeURIComponent(id) + '/verify'"));
  assert.ok(!ui.includes('name="openaiApiKey"'));
  assert.ok(!ui.includes('name="OPENAI_API_KEY"'));
});
