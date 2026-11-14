import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const migration = read('supabase/migrations/20261114022043_minglora_ai_identity_runtime_api.sql');
const memoryMigration = read('supabase/migrations/20261114120000_minglora_ai_identity_memory.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('Bot Personality Laboratory creates and links a private relational AI identity', () => {
  const start = server.indexOf("if (method === 'POST' && sub === 'bots')");
  const end = server.indexOf("if (method === 'POST' && sub === 'teams')", start);
  assert.ok(start >= 0 && end > start, 'Bot Lab creation route exists');
  const route = server.slice(start, end);
  assert.match(route, /firstName/);
  assert.match(route, /lastName/);
  assert.match(route, /runAIIdentityCommand\('create'/);
  assert.match(route, /population:\s*'independent'/);
  assert.match(route, /category_key:\s*categoryKey/);
  assert.match(route, /idempotency_key:\s*identityIdempotencyKey/);
  assert.match(route, /profile_visibility:\s*'private'/);
  assert.match(route, /source:\s*'bot_personality_laboratory'/);
  assert.match(route, /bot_id:\s*bot\.id/);
  assert.match(route, /bot\.identityId\s*=\s*identityId/);
  assert.match(route, /await saveStore\(\)/);
  assert.match(route, /identityIdempotencyKey/);
});

test('Bot Personality Laboratory requires distinct names and a canonical category in its UI', () => {
  assert.match(ui, /data-ai-form="bot"/);
  assert.match(ui, /name="firstName"/);
  assert.match(ui, /name="lastName"/);
  assert.match(ui, /name="middleName"/);
  assert.match(ui, /name="categoryKey"/);
  assert.match(ui, /payload\.identityIdempotencyKey\s*=\s*form\.dataset\.idempotencyKey/);
  assert.match(ui, /payload\.firstName\s*=\s*value\('firstName'\)/);
  assert.match(ui, /payload\.lastName\s*=\s*value\('lastName'\)/);
  assert.match(ui, /Create AI bot and relational identity/);
  assert.match(ui, /linked to relational identity/);
});

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
  assert.match(migration, /'reused_count'/i);
  assert.match(migration, /v_result->>'reused'/i);
  assert.match(ui, /result\.reused_count/);
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
  assert.match(ui, /request\('\/identities\?limit=100'\)/);
  assert.match(ui, /request\('\/categories'\)/);
  assert.match(ui, /name="firstName"/);
  assert.match(ui, /name="lastName"/);
  assert.match(ui, /payload\.name\s*=\s*\{[\s\S]*first_name:[\s\S]*last_name:/);
  assert.match(ui, /payload\.idempotency_key\s*=\s*form\.dataset\.idempotencyKey/);
  assert.match(ui, /Registered identities/);
  const countryCodes = ui.match(/const COUNTRY_CODES = '([A-Z ]+)'/);
  assert.ok(countryCodes, 'ISO country and territory codes must be present.');
  const countryList = countryCodes[1].split(' ');
  assert.equal(countryList.length, 249);
  assert.equal(new Set(countryList).size, 249);
  assert.match(ui, /name="countryOfOrigin" list="ai-network-countries"/);
  assert.match(ui, /name="currentCountry" list="ai-network-countries"/);
  assert.match(ui, /country_of_origin: countryOfOrigin/);
  assert.match(ui, /current_country: currentCountry/);
  assert.match(ui, /Select a valid country of origin/);
  assert.match(ui, /Select a valid current country/);
  assert.match(ui, /is_primary: index === 0/);
  assert.match(ui, /data-ai-form="identity-bulk"/);
  assert.match(ui, /JSON\.parse\(value\('items'\)\)/);
  assert.match(ui, /between 1 and 100 JSON objects/);
  assert.match(ui, /request\(path, \{ method:/);
});


test('AI identity memory is private, owner-scoped, opt-in and time-bounded', () => {
  assert.match(memoryMigration, /create table if not exists ai_network\.ai_memory_settings/i);
  assert.match(memoryMigration, /create table if not exists ai_network\.ai_memory_entries/i);
  assert.match(memoryMigration, /memory_enabled boolean not null default false/i);
  assert.match(memoryMigration, /long_term_enabled boolean not null default false/i);
  assert.match(memoryMigration, /short_term_retention_days integer not null default 7/i);
  assert.match(memoryMigration, /long_term_retention_days integer not null default 365/i);
  assert.match(memoryMigration, /max_entries integer not null default 500/i);
  assert.match(memoryMigration, /alter table ai_network\.ai_memory_settings enable row level security/i);
  assert.match(memoryMigration, /alter table ai_network\.ai_memory_entries enable row level security/i);
  assert.match(memoryMigration, /revoke all on table ai_network\.ai_memory_settings from public, anon, authenticated/i);
  assert.match(memoryMigration, /revoke all on table ai_network\.ai_memory_entries from public, anon, authenticated/i);
  assert.match(memoryMigration, /security invoker/i);
  assert.match(memoryMigration, /set search_path\s*=\s*''/i);
  assert.match(memoryMigration, /current_user <> 'service_role'/i);
  assert.match(memoryMigration, /v_owner <> p_actor_user_id/i);
  assert.match(memoryMigration, /v_memory_enabled := coalesce\(v_settings\.memory_enabled, false\)/i);
  assert.match(memoryMigration, /v_long_term_enabled := coalesce\(v_settings\.long_term_enabled, false\)/i);
  assert.match(memoryMigration, /long-term memory requires separate owner consent/i);
  assert.match(memoryMigration, /between 1 and 90/i);
  assert.match(memoryMigration, /between 30 and 3650/i);
  assert.match(memoryMigration, /between 1 and 5000/i);
  assert.match(memoryMigration, /expires_at <= now\(\)/i);
  assert.match(memoryMigration, /on conflict \(identity_id, idempotency_key\) where idempotency_key is not null\s+do nothing/i);
  assert.match(memoryMigration, /credentials and secrets cannot be stored in AI memory/i);
  assert.match(memoryMigration, /revoke all on function public\.minglora_ai_memory_command[\s\S]*from public, anon, authenticated/i);
  assert.match(memoryMigration, /grant execute on function public\.minglora_ai_memory_command[\s\S]*to service_role/i);
});

test('AI memory API and UI remain owner-authenticated and explain that model recall is not connected', () => {
  assert.match(server, /runAIMemoryCommand\('list'/);
  assert.match(server, /runAIMemoryCommand\('configure'/);
  assert.match(server, /runAIMemoryCommand\('create'/);
  assert.match(server, /runAIMemoryCommand\('delete'/);
  assert.match(server, /requireAuth\(user\)/);
  assert.match(runtime, /"ai_memory_command"/);
  assert.match(runtime, /supportedMemoryCommands = \["get_settings", "configure", "list", "create", "delete"\]/);
  assert.match(runtime, /minglora_ai_memory_command/);
  assert.match(ui, /data-ai-form="memory-settings"/);
  assert.match(ui, /data-ai-form="memory-entry"/);
  assert.match(ui, /data-ai-action="delete-memory"/);
  assert.match(ui, /loadAIMemory/);
  assert.match(ui, /long_term_enabled/);
  assert.match(ui, /does not yet connect to live model recall or automatic conversation capture/i);
});
