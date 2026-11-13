import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261113150000_minglora_ai_discovery_and_following.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');

test('AI follows and saved discovery groups are private server-role records', () => {
  for (const table of ['ai_identity_follows','ai_saved_discovery_groups']) {
    assert.ok(migration.includes('create table if not exists ai_network.' + table));
    assert.ok(migration.includes('alter table ai_network.' + table + ' enable row level security'));
  }
  assert.match(migration,/current_user <> 'service_role'/);
  assert.ok(migration.includes('revoke all on function public.minglora_ai_discovery_command'));
  assert.ok(migration.includes('from public, anon, authenticated'));
  assert.ok(migration.includes('grant execute on function public.minglora_ai_discovery_command'));
});

test('worldwide discovery supports combinable multi-select filters and real profile data only', () => {
  for (const token of [
    "v_action='discover'",
    "i.status='active' and i.enabled=true",
    "p.profile_visibility='public'",
    "cardinality(v_categories)=0 or i.category_key=any(v_categories)",
    "cardinality(v_populations)=0 or i.population=any(v_populations)",
    "cardinality(v_genders)=0 or p.gender=any(v_genders)",
    "cardinality(v_countries)=0",
    "cardinality(v_languages)=0",
    "cardinality(v_interests)=0",
    "cardinality(v_skills)=0",
    "cardinality(v_capabilities)=0",
    "p.profession ilike",
    "v_recent_days",
    "'follower_count',page.follower_count",
    "'is_following',page.is_following"
  ]) assert.ok(migration.includes(token),'Missing discovery behavior: '+token);
  assert.ok(!migration.includes('fake') && !migration.includes('demo'));
  assert.ok(!migration.includes('primary_email'), 'Public discovery does not expose email identities');
});

test('private profiles create approval requests while public profiles follow immediately', () => {
  assert.ok(migration.includes("v_follow_status := case when v_profile_visibility='public' then 'active' else 'requested' end;"));
  assert.ok(migration.includes("f.follow_status='requested'"));
  assert.ok(migration.includes("i.owner_user_id=p_actor_user_id"));
  assert.ok(migration.includes("case when v_decision='approve' then 'active' else 'declined' end"));
  assert.ok(migration.includes("unique (identity_id,follower_user_id)"));
});

test('bulk following is bounded, duplicate safe, and saved groups are owner scoped', () => {
  assert.ok(migration.includes('jsonb_array_length(v_payload->\'identity_ids\')>100'));
  assert.ok(migration.includes('on conflict(identity_id,follower_user_id) do nothing'));
  assert.ok(migration.includes('where g.owner_user_id=p_actor_user_id'));
  assert.ok(migration.includes('octet_length(filters::text)<=16384'));
});

test('runtime gateway exposes discovery only through the authenticated AI command handler', () => {
  const allowStart=runtime.indexOf('const supportedActions = [');
  const allowEnd=runtime.indexOf('];',allowStart);
  assert.ok(runtime.slice(allowStart,allowEnd).includes('"ai_discovery_command"'));
  const handlerStart=runtime.indexOf('if (action === "ai_discovery_command")');
  assert.ok(handlerStart>=0);
  const handler=runtime.slice(handlerStart,runtime.indexOf('if (action === "ai_organization_command")',handlerStart));
  for(const action of ['discover','follow','bulk_follow','unfollow','list_following','list_follow_requests','review_follow_request','list_saved_groups','save_discovery_group','delete_saved_group']) {
    assert.ok(handler.includes('"'+action+'"'),'Missing gateway command '+action);
  }
  assert.ok(handler.includes('validUuid(actorUserId)'));
  assert.ok(handler.includes('credential)"' + String.raw`\s*:/i`), 'discovery requests reject credential-like field names');
  assert.ok(handler.includes('admin.rpc("minglora_ai_discovery_command"'));
});

test('AI discovery Node endpoints require a signed-in user without the platform-moderator gate', () => {
  const start=server.indexOf("if (p === '/api/ai-network'");
  const end=server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')",start);
  const route=server.slice(start,end);
  assert.ok(route.includes('const runAIDiscoveryCommand = async'));
  assert.ok(route.includes("sub === 'discover'"));
  assert.ok(route.includes("sub === 'following'"));
  assert.ok(route.includes("requestSupabaseState('ai_discovery_command'"));
  assert.ok(route.includes('requireAuth(user)'));
  const discoveryStart=route.indexOf('const runAIDiscoveryCommand');
  const identityStart=route.indexOf('const runAIIdentityCommand',discoveryStart);
  const discoveryHelper=route.slice(discoveryStart,identityStart);
  assert.ok(!discoveryHelper.includes('isModerator(user, req)'));
});
