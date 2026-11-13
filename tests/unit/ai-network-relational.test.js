import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const migration = read('supabase/migrations/20261113100000_minglora_ai_identity_runtime_api.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('AI identity RPC remains private to the service-role runtime', () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path\s*=\s*''/i);
  assert.match(migration, /revoke all on function public\.minglora_ai_identity_command[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.minglora_ai_identity_command[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /grant\s+usage\s+on\s+schema\s+ai_network\s+to\s+(public|anon|authenticated)/i);
});

test('identity creation requires separated names, unique username and retry-safe idempotency', () => {
  assert.match(migration, /v_name->>'first_name'/i);
  assert.match(migration, /v_name->>'last_name'/i);
  assert.match(migration, /first name and last name are both required as separate fields/i);
  assert.match(migration, /username must contain 3 to 30/i);
  assert.match(migration, /stable idempotency key/i);
  assert.match(migration, /on conflict \(owner_user_id, idempotency_key\) where idempotency_key is not null\s+do nothing/i);
});

test('email rows do not claim verification or inbox provisioning', () => {
  assert.match(migration, /'unverified'[\s\S]{0,240}'not_requested'/i);
  assert.doesNotMatch(migration, /auth\.admin\.createUser|insert\s+into\s+auth\.users/i);
  assert.match(ui, /No inbox is created or claimed/i);
});

test('bulk identity creation is bounded and isolates individual failures', () => {
  assert.match(migration, /jsonb_array_length\(v_payload->'items'\) > 100/i);
  assert.match(migration, /exception when others then/i);
  assert.match(migration, /'failed_count'/i);
  assert.match(migration, /'created_count'/i);
});

test('runtime gateway validates actor IDs and allowlists AI identity commands', () => {
  assert.match(runtime, /"ai_identity_command"/);
  assert.match(runtime, /supportedAICommands = \["list_categories", "list", "get", "create", "bulk_create"\]/);
  assert.match(runtime, /validUuid\(actorUserId\)/);
  assert.match(runtime, /admin\.rpc\("minglora_ai_identity_command"/);
});

test('Minglora routes identity APIs through the authenticated Supabase runtime gateway', () => {
  assert.match(server, /requireAuth\(user\)/);
  assert.match(server, /if \(!isSupabasePersistence\(\)\)/);
  assert.match(server, /requestSupabaseState\('ai_identity_command'/);
  assert.match(server, /sub === 'categories'/);
  assert.match(server, /sub === 'identities'/);
  assert.match(server, /sub === 'identities\/bulk'/);
});

test('AI workspace uses real relational identity results and separate name inputs', () => {
  assert.match(ui, /request\('\/identities\?limit=10'\)/);
  assert.match(ui, /request\('\/categories'\)/);
  assert.match(ui, /name="firstName"/);
  assert.match(ui, /name="lastName"/);
  assert.match(ui, /payload\.name\s*=\s*\{[\s\S]*first_name:[\s\S]*last_name:/);
  assert.match(ui, /payload\.idempotency_key\s*=\s*form\.dataset\.idempotencyKey/);
  assert.match(ui, /Registered identities/);
  assert.match(ui, /COUNTRY_CODES = '[A-Z ]+'\.split\(' '\)/);
  assert.match(ui, /name="countryOfOrigin" list="ai-network-countries"/);
  assert.match(ui, /name="currentCountry" list="ai-network-countries"/);
  assert.match(ui, /country_of_origin: countryOfOrigin/);
  assert.match(ui, /current_country: currentCountry/);
  assert.match(ui, /is_primary: index === 0/);
  assert.match(ui, /data-ai-form="identity-bulk"/);
  assert.match(ui, /JSON\.parse\(value\('items'\)\)/);
  assert.match(ui, /between 1 and 100 JSON objects/);
  assert.match(ui, /request\(path, \{ method:/);
});
