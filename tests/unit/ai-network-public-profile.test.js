import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261117120000_minglora_ai_public_identity_profiles.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('individual AI profile RPC enforces active state and visibility rules', () => {
  for (const token of [
    "current_user <> 'service_role'",
    "coalesce(v_identity.owner_user_id = p_actor_user_id, false)",
    "coalesce(v_profile.profile_visibility, 'hidden') not in ('public', 'followers')",
    "v_identity.status <> 'active'",
    "v_identity.enabled is not true",
    "v_profile.profile_visibility = 'followers' and not v_is_following",
    "v_profile.profile_visibility not in ('public', 'followers')",
    "f.follow_status = 'active'",
    "public.user_blocks b",
    "b.blocker_id = p_actor_user_id",
    "loc.is_public = true",
    "revoke all on function public.minglora_ai_public_identity_profile(uuid,uuid)",
    "grant execute on function public.minglora_ai_public_identity_profile(uuid,uuid)"
  ]) assert.ok(migration.includes(token), 'Missing profile visibility/security control: ' + token);
});

test('public profile payload contains profile data but excludes private account and provider fields', () => {
  for (const field of [
    "'first_name'", "'middle_name'", "'last_name'", "'display_name'", "'username'",
    "'bio'", "'introduction'", "'gender'", "'nationality'", "'country_of_origin'",
    "'current_country'", "'profession'", "'interests'", "'hobbies'", "'skills'",
    "'qualifications'", "'education'", "'personality'", "'voice_preferences'",
    "'language_tag'", "'language_name'", "'dialect'", "'proficiency'",
    "'public_locations'", "'capabilities'", "'follower_count'", "'time_zone'"
  ]) assert.ok(migration.includes(field), 'Missing public profile field: ' + field);
  for (const field of ["'email_address'", "'provider_account_id'", "'owner_user_id'", "'avatar_storage_ref'", "'cover_storage_ref'"]) {
    assert.ok(!migration.includes(field), 'Private field leaked into public response: ' + field);
  }
});

test('public profile runtime gateway and authenticated HTTP route are connected', () => {
  assert.match(runtime, /"ai_public_identity_profile"/);
  const start = runtime.indexOf('if (action === "ai_public_identity_profile")');
  const end = runtime.indexOf('if (action === "ai_discovery_command")', start);
  assert.ok(start >= 0 && end > start);
  const handler = runtime.slice(start, end);
  assert.match(handler, /validUuid\(actorUserId\)/);
  assert.match(handler, /validUuid\(identityId\)/);
  assert.match(handler, /admin\.rpc\("minglora_ai_public_identity_profile"/);
  assert.match(server, /parts\[0\] === 'public-profile'/);
  assert.match(server, /requestSupabaseState\('ai_public_identity_profile'/);
});

test('discovery opens a full individual AI profile and supports safe close', () => {
  assert.match(ui, /data-ai-action="view-ai-profile"/);
  assert.match(ui, /request\('\/public-profile\/' \+ encodeURIComponent\(id\)\)/);
  assert.match(ui, /function renderPublicAIIdentityProfile\(\)/);
  assert.match(ui, /data-ai-action="close-ai-profile"/);
  assert.match(ui, /name="sharePublicLocations"/);
  assert.match(ui, /is_public:sharePublicLocations/);
  assert.match(ui, /\/media\/avatar/);
  assert.match(ui, /\/media\/cover/);
  for (const token of [
    'Education records','Languages and dialects','Public locations',
    'Skills and expertise','Voice preferences','Personality'
  ]) assert.ok(ui.includes(token), 'Missing full profile UI section: ' + token);
  assert.match(ui, /not verified human identity or qualifications/i);
});
