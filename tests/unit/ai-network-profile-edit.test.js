import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261114030000_minglora_ai_identity_profile_edit.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('AI profile registry and update RPCs are private service-role-only functions', () => {
  assert.equal((migration.match(/security invoker/gi) || []).length, 2);
  assert.equal((migration.match(/set search_path = ''/gi) || []).length, 2);
  assert.match(migration, /revoke all on function public\.minglora_ai_identity_profile_registry[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.minglora_ai_identity_profile_update[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.minglora_ai_identity_profile_registry[\s\S]*to service_role/i);
  assert.match(migration, /grant execute on function public\.minglora_ai_identity_profile_update[\s\S]*to service_role/i);
  assert.match(migration, /current_user <> 'service_role'/i);
  assert.match(migration, /i\.owner_user_id = p_actor_user_id/i);
});

test('registry returns edit data for names, profile, languages, locations and email status', () => {
  assert.match(migration, /'languages', coalesce\([\s\S]*ai_network\.ai_identity_languages/i);
  assert.match(migration, /'locations', coalesce\([\s\S]*ai_network\.ai_identity_locations/i);
  assert.match(migration, /'primary_email', \([\s\S]*verification_status[\s\S]*provisioning_status/i);
  assert.match(migration, /limit v_limit offset v_offset/i);
});

test('profile edits validate names, username, gender, visibility, country and time zone', () => {
  for (const token of [
    'First name and last name are both required as separate fields',
    'username must contain 3 to 30',
    "v_gender not in ('female', 'male', 'non_binary', 'other', 'prefer_not_to_say')",
    "v_visibility not in ('public', 'followers', 'private', 'hidden')",
    "v_country_origin !~ '^[A-Z]{2}$'",
    "v_current_country !~ '^[A-Z]{2}$'",
    'pg_catalog.pg_timezone_names'
  ]) assert.ok(migration.toLowerCase().includes(token.toLowerCase()), 'Missing validation: ' + token);
});

test('profile edit writes atomically and records a new version and audit event', () => {
  assert.match(migration, /for update/i);
  assert.match(migration, /delete from ai_network\.ai_identity_languages[\s\S]*insert into ai_network\.ai_identity_languages/i);
  assert.match(migration, /delete from ai_network\.ai_identity_locations[\s\S]*insert into ai_network\.ai_identity_locations/i);
  assert.match(migration, /insert into ai_network\.ai_identity_versions/i);
  assert.match(migration, /insert into ai_network\.ai_identity_audit_logs/i);
  assert.match(migration, /identity_profile_updated/i);
});

test('runtime gateway validates actors and identity IDs and rejects credential-like profile payloads', () => {
  assert.match(runtime, /"ai_identity_profile_list"/);
  assert.match(runtime, /"ai_identity_profile_update"/);
  const listStart = runtime.indexOf('if (action === "ai_identity_profile_list")');
  const editStart = runtime.indexOf('if (action === "ai_identity_profile_update")');
  const next = runtime.indexOf('if (action === "ai_discovery_command")', editStart);
  assert.ok(listStart >= 0 && editStart > listStart && next > editStart);
  const handler = runtime.slice(editStart, next);
  assert.match(handler, /validUuid\(actorUserId\)/);
  assert.match(handler, /validUuid\(identityId\)/);
  assert.match(handler, /admin\.rpc\("minglora_ai_identity_profile_update"/);
  assert.match(handler, /Credentials and secrets are not allowed/);
});

test('authenticated Minglora APIs use the complete owner-scoped registry and PATCH update path', () => {
  assert.match(server, /requireAuth\(user\)/);
  assert.match(server, /requestSupabaseState\('ai_identity_profile_list'/);
  assert.match(server, /method === 'PATCH' && parts\[0\] === 'identities'/);
  assert.match(server, /requestSupabaseState\('ai_identity_profile_update'/);
  assert.match(server, /identity_id: parts\[1\]/);
});

test('AI workspace exposes profile editing without changing emails, provider assignments or execution controls', () => {
  assert.match(ui, /data-ai-form="identity-edit"/);
  assert.match(ui, /data-identity-id=/);
  assert.match(ui, /name="firstName"/);
  assert.match(ui, /name="lastName"/);
  assert.match(ui, /name="profileVisibility"/);
  assert.match(ui, /name="countryOfOrigin"/);
  assert.match(ui, /name="currentCountry"/);
  assert.match(ui, /name="languages"/);
  assert.match(ui, /name="existingLocations"/);
  assert.match(ui, /payload\.languages = languages/);
  assert.match(ui, /'identity-edit'\]/);
  assert.match(ui, /AI identity profile and name details updated/);
  assert.match(ui, /Email identity records, provider assignments, AI status and permissions are not changed/);
});
