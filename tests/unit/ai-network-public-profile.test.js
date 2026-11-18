import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261117120000_minglora_ai_public_identity_profiles.sql');
const mediaMigration = read('supabase/migrations/20261117124500_minglora_ai_private_follower_media_visibility.sql');
const baseMediaMigration = read('supabase/migrations/20261115010000_minglora_ai_identity_media_visibility.sql');
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
    "coalesce(v_profile.profile_visibility, 'hidden') not in ('public', 'followers')",
    "f.follow_status = 'active'",
    "public.user_blocks b",
    "b.blocker_id = p_actor_user_id",
    "loc.is_public = true",
    "revoke all on function public.minglora_ai_public_identity_profile(uuid,uuid)",
    "grant execute on function public.minglora_ai_public_identity_profile(uuid,uuid)"
  ]) assert.ok(migration.includes(token), 'Missing profile visibility/security control: ' + token);
});

test('AI profile media access keeps private profiles owner-only', () => {
  assert.match(mediaMigration, /v_visibility not in \\(''public'', ''followers''\\)/);
  assert.match(mediaMigration, /v_visibility = ''followers'' and not exists/);
  assert.doesNotMatch(mediaMigration, /v_visibility not in \\(''public'', ''followers'', ''private''\\)/);
  assert.doesNotMatch(mediaMigration, /v_visibility in \\(''followers'', ''private''\\)/);
  assert.match(mediaMigration, /pg_get_functiondef/);
  assert.match(mediaMigration, /refusing an unverified media privacy state/);
  assert.match(baseMediaMigration, /v_visibility not in \\('public', 'followers'\\)/);
  assert.match(baseMediaMigration, /if v_visibility = 'followers' and not exists \\(/);
});

test('public profile JSON fields are allow-listed before leaving the database', () => {
  assert.match(migration, /jsonb_array_elements\([\s\S]*?v_profile\.education[\s\S]*?with ordinality/);
  assert.match(migration, /'institution', case when jsonb_typeof\(item\.value->'institution'\) = 'string'/);
  assert.match(migration, /where jsonb_typeof\(item\.value\) = 'string'[\s\S]*?item\.value->'name'/);
  assert.match(migration, /jsonb_typeof\(v_profile\.personality->'summary'\) = 'string'/);
  assert.match(migration, /jsonb_typeof\(v_profile\.voice_preferences->'language'\) = 'string'/);
  assert.match(migration, /a\.asset_status = 'attached'[\s\S]*?a\.processing_status = 'ready'/);
  assert.match(migration, /a\.attached_to = 'ai_identity:' \|\| p_identity_id::text \|\| ':avatar'/);
  assert.doesNotMatch(migration, /'provider_voice_id'/);
});

test('public profile payload contains profile data but excludes private account and provider fields', () => {
  for (const field of [
    "'first_name'", "'middle_name'", "'last_name'", "'display_name'", "'username'",
    "'bio'", "'introduction'", "'gender'", "'nationality'", "'country_of_origin'",
    "'current_country'", "'profession'", "'interests'", "'hobbies'", "'skills'",
    "'qualifications'", "'education'", "'personality'", "'voice_preferences'",
    "'language_tag'", "'language_name'", "'dialect'", "'proficiency'",
    "'public_locations'", "'capabilities'", "'follower_count'", "'time_zone'", "'created_at'", "'updated_at'"
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
  assert.match(ui, /ai-network-discovery-following/);
  assert.match(ui, /data-source="following"/);
  assert.match(ui, /Waiting for profile-owner approval/);
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


test('profile-level location fields require explicit per-location public sharing consent', () => {
  assert.ok(migration.includes("location_type = 'origin'"));
  assert.ok(migration.includes("location_type = 'current'"));
  assert.ok(migration.includes("loc.is_public is true"));
  assert.ok(migration.includes("'country_of_origin', case when v_origin_location_public then v_profile.country_of_origin else null end"));
  for (const field of ['current_country','time_zone','state_province','parish_county','district','city','town']) {
    assert.ok(migration.includes("'" + field + "', case when v_current_location_public then"), 'Private current-location field was not consent-gated: ' + field);
  }
});

test('private AI profiles are not opened to followers by profile-detail reads', () => {
  assert.ok(migration.includes("v_profile.profile_visibility = 'followers' and not v_is_following"));
  assert.ok(migration.includes("coalesce(v_profile.profile_visibility, 'hidden') not in ('public', 'followers')"));
  assert.doesNotMatch(migration, /profile_visibility in \\('followers', 'private'\\)/);
});
