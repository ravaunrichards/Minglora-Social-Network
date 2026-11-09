import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(
  new URL('../../supabase/migrations/20261108210000_minglora_ai_bot_network_foundation.sql', import.meta.url),
  'utf8'
);

const gateway = await readFile(
  new URL('../../supabase/functions/minglora-runtime-state/index.ts', import.meta.url),
  'utf8'
);

test('normalized AI bot migration contains all 15 master categories',()=>{
  for(const id of [
    'ai-friends','ai-creators','ai-influencers','ai-news','ai-musicians',
    'ai-entertainers','ai-gamers','ai-community-hosts','ai-live-hosts',
    'ai-moderators','ai-support','ai-educators','ai-sports','ai-travel','ai-business'
  ]) assert.ok(sql.includes("('"+id+"'"),'missing category '+id);
});

test('normalized bot tables remain separate from human Auth and profile tables',()=>{
  for(const table of [
    'minglora_ai_bot_settings','minglora_ai_bot_categories','minglora_ai_bots',
    'minglora_ai_bot_schedules','minglora_ai_bot_teams','minglora_ai_bot_team_members',
    'minglora_ai_bot_tasks','minglora_ai_bot_follow_targets','minglora_ai_bot_follows',
    'minglora_ai_bot_followers','minglora_ai_bot_follow_exclusions','minglora_ai_bot_audit'
  ]) assert.ok(sql.includes('public.'+table),'missing normalized table '+table);
  assert.match(sql,/AI identities remain records, never Auth users or public human profiles/);
  assert.match(sql,/public\.user_follows/);
  assert.doesNotMatch(sql,/CREATE TABLE IF NOT EXISTS public\.(?:profiles|user_follows)\b/i);
});

test('every new bot table is RLS enabled and service-role-only',()=>{
  assert.match(sql,/ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON TABLE public\.%I FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.%I TO service_role/);
  assert.doesNotMatch(sql,/GRANT\s+[^;]*\s+TO\s+(?:anon|authenticated)\b/i);
  assert.match(sql,/exclude_from_human_engagement_metrics boolean NOT NULL DEFAULT true\s+CHECK \(exclude_from_human_engagement_metrics\)/);
  assert.match(sql,/exclude_from_human_follow_counts boolean NOT NULL DEFAULT true/);
});

test('canonical AI identity schema includes all requested relational data areas',()=>{
  for(const table of [
    'ai_identities','ai_profiles','ai_names','ai_emails','ai_provider_accounts',
    'ai_provider_models','ai_provider_assignments','ai_identity_locations',
    'ai_identity_languages','ai_identity_capabilities','ai_identity_permissions',
    'ai_identity_owners','ai_identity_status_history','ai_identity_versions',
    'ai_identity_audit_logs'
  ]) assert.ok(sql.includes('public.'+table),'missing canonical table '+table);
  assert.ok(sql.includes('first_name text NOT NULL'));
  assert.ok(sql.includes('last_name text NOT NULL'));
  assert.ok(sql.includes('middle_name text NOT NULL'));
  assert.ok(sql.includes("CHECK (gender IN ('female','male','non_binary','other','prefer_not_to_specify'))"));
  assert.ok(sql.includes("CHECK (population IN ('independent','organizational','specialized_service'))"));
  assert.ok(sql.includes("'proposed','created','under_review','approved','active','restricted','suspended','archived','retired'"));
});

test('provider credential columns store references, never raw secrets',()=>{
  assert.ok(sql.includes('credential_secret_reference text'));
  assert.ok(sql.includes('Reference to a server-side secret manager entry only'));
  assert.doesNotMatch(sql,/api_key\s+text|access_token\s+text|refresh_token\s+text|password\s+text/i);
  assert.ok(sql.includes('Never store raw API keys, tokens or passwords here'));
});

test('canonical identity RPCs are service-role-only and owner-gated at the gateway',()=>{
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.minglora_ai_identity_upsert('));
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.minglora_ai_identity_upsert_batch('));
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.minglora_ai_identity_list('));
  assert.ok(sql.includes('SECURITY INVOKER'));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.minglora_ai_identity_upsert_batch(jsonb,uuid) TO service_role'));
  assert.ok(gateway.includes('"ai_identity_upsert_batch", "ai_identity_list"'));
  assert.ok(gateway.includes('AI_NETWORK_OWNER_ID'));
  assert.ok(gateway.includes('admin.rpc("minglora_ai_identity_upsert_batch"'));
  assert.ok(gateway.includes('admin.rpc("minglora_ai_identity_list"'));
  assert.ok(gateway.includes('provider secrets are not accepted'));
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.minglora_ai_identity_list(uuid,integer,integer) FROM PUBLIC, anon, authenticated'));
});

test('new bots are disabled by default and all tasks are approval-gated',()=>{
  assert.match(sql,/status text NOT NULL DEFAULT 'disabled'/);
  assert.match(sql,/autonomy_mode text NOT NULL DEFAULT 'administrator_controlled'/);
  assert.match(sql,/approval_required boolean NOT NULL DEFAULT true CHECK \(approval_required\)/);
  assert.match(sql,/status text NOT NULL DEFAULT 'awaiting_administrator_approval'/);
});

const queueSql = await readFile(
  new URL('../../supabase/migrations/20261109200000_minglora_ai_bot_durable_task_queue.sql', import.meta.url),
  'utf8'
);
const worker = await readFile(
  new URL('../../backend/modules/personal-ai-bots/worker.js', import.meta.url),
  'utf8'
);
const workerEntrypoint = await readFile(
  new URL('../../src/personal-ai-bot-worker.js', import.meta.url),
  'utf8'
);

test('identity foundation migration is one complete transaction with RLS after every table declaration',()=>{
  assert.equal((sql.match(/COMMIT;/g)||[]).length,1);
  assert.equal((sql.match(/FOREACH table_name IN ARRAY ARRAY\[/g)||[]).length,1);
  assert.match(sql,/public_profile_slug text NOT NULL UNIQUE CHECK \(public_profile_slug ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'\)/);
  assert.match(sql,/username text NOT NULL UNIQUE CHECK \(username = lower\(username\) AND username ~ '\^ai_\[a-z0-9_\]\{2,40\}\$'\)/);
  assert.match(sql,/country_code text NOT NULL DEFAULT '' CHECK \(country_code = '' OR country_code ~ '\^\[A-Z\]\{2\}\$'\)/);
  assert.ok(sql.includes("'ai_identities','ai_names','ai_profiles','ai_emails','ai_provider_accounts'"));
  assert.ok(sql.includes("'ai_identity_status_history','ai_identity_versions','ai_identity_audit_logs'"));
  assert.ok(sql.includes('DEFAULT 10000000000'));
});

test('durable queue migration adds owner-scoped identities, leases, retries and idempotency',()=>{
  for(const fragment of [
    'minglora_ai_bot_task_upsert_batch',
    'minglora_ai_bot_task_claim',
    'minglora_ai_bot_task_heartbeat',
    'minglora_ai_bot_task_complete',
    'minglora_ai_bot_task_fail',
    'minglora_ai_bot_task_list',
    'minglora_ai_bot_task_stats',
    'lease_token','lease_expires_at','heartbeat_at','attempt_count',
    'max_attempts','next_attempt_at','dead_lettered_at','idempotency_key',
    'FOR UPDATE OF task SKIP LOCKED',
    "'dead_lettered'",
    'GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_claim(text,integer,integer,uuid) TO service_role'
  ]) assert.ok(queueSql.includes(fragment),'missing durable queue requirement: '+fragment);
  assert.match(queueSql,/execution_enabled boolean NOT NULL DEFAULT false/);
  assert.match(queueSql,/provider_ready boolean NOT NULL DEFAULT false/);
  assert.match(queueSql,/task\.high_impact = false/);
  assert.match(queueSql,/task\.task_type IN \('assistant_request','moderation_review','analytics_report','translation'\)/);
  assert.match(queueSql,/approved_by = p_actor_user_id/);
  assert.match(queueSql,/attempt_count >= task\.max_attempts/);
  assert.match(queueSql,/CREATE OR REPLACE FUNCTION public\.minglora_ai_bot_task_upsert/);
  assert.match(queueSql,/REFERENCES public\.ai_identities\(identity_id,owner_admin_id\)/);
});

test('runtime gateway exposes only allowlisted owner-gated durable queue operations',()=>{
  for(const action of [
    'ai_bot_task_upsert_batch','ai_bot_task_list','ai_bot_task_stats',
    'ai_bot_task_claim','ai_bot_task_heartbeat','ai_bot_task_complete','ai_bot_task_fail'
  ]) assert.ok(gateway.includes(action),'missing runtime gateway action: '+action);
  assert.match(gateway,/Only the designated Minglora owner can access the AI task queue/);
  assert.match(gateway,/provider secrets and arbitrary task fields are not accepted/i);
  assert.match(gateway,/admin\.rpc\("minglora_ai_bot_task_claim"/);
  assert.match(gateway,/admin\.rpc\("minglora_ai_bot_task_complete"/);
});

test('worker remains provider-gated and draft-only, with no social action task types',()=>{
  for(const type of ['assistant_request','moderation_review','analytics_report','translation']) assert.ok(worker.includes("'"+type+"'"));
  for(const forbidden of ['draft_post','follow','unfollow','send_message','react','join_group','event_participation','live_show_plan']) {
    assert.ok(!worker.includes("'"+forbidden+"'"),'worker must not execute '+forbidden);
  }
  assert.ok(worker.includes('externalActionsAllowed: false'));
  assert.ok(worker.includes('tools: []'));
  assert.ok(worker.includes("outputType: 'human_review_draft'"));
  assert.ok(workerEntrypoint.includes("MINGLORA_AI_BOT_WORKER_ENABLED"));
  assert.ok(workerEntrypoint.includes('MINGLORA_AI_BOT_PROVIDER_MODULE'));
  assert.ok(workerEntrypoint.includes("'ai_bot_task_claim'"));
});

test('every staged identity/control table declaration closes without a trailing comma',()=>{
  const tableBlocks=[...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z0-9_]+)\s*\(([\s\S]*?)\n\);/g)];
  assert.equal(tableBlocks.length,27);
  for(const match of tableBlocks) {
    assert.doesNotMatch(match[2].trimEnd(),/,$/,'table declaration has a trailing comma: '+match[1]);
  }
});
