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

const providerSql = await readFile(
  new URL('../../supabase/migrations/20261109213000_minglora_ai_provider_assignment_rpcs.sql', import.meta.url),
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


test('durable worker claim concurrency and owner settings are enforced transactionally',()=>{
  assert.match(queueSql,/FROM public\.minglora_ai_bot_settings\s+WHERE id = true\s+FOR UPDATE/);
  assert.match(queueSql,/WHERE task\.execution_started_at >= pg_catalog\.date_trunc\('day',pg_catalog\.now\(\)\);/);
  assert.ok(queueSql.includes('CREATE OR REPLACE FUNCTION public.minglora_ai_bot_settings_update('));
  assert.ok(queueSql.includes('GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_settings_update(jsonb,uuid) TO service_role'));
  assert.ok(queueSql.includes("'networkEnabled',(SELECT enabled FROM public.minglora_ai_bot_settings WHERE id=true)"));
  assert.match(queueSql,/execution_enabled boolean NOT NULL DEFAULT false/);
  assert.match(queueSql,/provider_ready boolean NOT NULL DEFAULT false/);
  assert.doesNotMatch(queueSql,/SET execution_enabled\s*=/i);
  assert.doesNotMatch(queueSql,/SET provider_ready\s*=/i);
});


test('AI identity location schema includes every region key used by its indexes',()=>{
  assert.match(sql,/parish_county text NOT NULL DEFAULT ''/);
  assert.match(sql,/ON public\.ai_identity_locations \(country_code,state_province,parish_county,city\)/);
});

test('every explicit AI table index references columns declared by that table',()=>{
  const tableColumns=new Map();
  for(const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z0-9_]+)\s*\(([\s\S]*?)\n\);/g)){
    const columns=new Set();
    for(const line of match[2].split('\n')){
      const declaration=line.trim().match(/^([a-z][a-z0-9_]*)\s+/i);
      if(declaration&&!['constraint','primary','unique','check','foreign'].includes(declaration[1].toLowerCase())){
        columns.add(declaration[1].toLowerCase());
      }
    }
    tableColumns.set(match[1],columns);
  }
  const indexes=[...sql.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS\s+([a-z0-9_]+)\s+ON public\.([a-z0-9_]+)\s*\(([^;]+?)\)\s*(?:WHERE [^;]+)?;/g)];
  for(const [,indexName,tableName,expressions] of indexes){
    const columns=tableColumns.get(tableName);
    assert.ok(columns,'index table is not declared: '+tableName);
    for(const expression of expressions.split(',')){
      const column=expression.trim().match(/^(?:lower\()?([a-z][a-z0-9_]*)/i)?.[1]?.toLowerCase();
      if(column)assert.ok(columns.has(column),'index '+indexName+' references missing column '+tableName+'.'+column);
    }
  }
});


test('AI provider assignment migration has owner-scoped provider, model and assignment RPCs',()=>{
  for(const fragment of [
    'public.ai_provider_accounts','public.ai_provider_models','public.ai_provider_assignments',
    'minglora_ai_provider_assignment_upsert(jsonb,uuid)',
    'minglora_ai_provider_assignment_list(uuid,uuid,integer,integer)',
    'GRANT EXECUTE ON FUNCTION public.minglora_ai_provider_assignment_upsert(jsonb,uuid) TO service_role',
    'GRANT EXECUTE ON FUNCTION public.minglora_ai_provider_assignment_list(uuid,uuid,integer,integer) TO service_role'
  ]) assert.ok(providerSql.includes(fragment),'missing provider assignment requirement: '+fragment);
  assert.match(providerSql,/SECURITY INVOKER/);
  assert.match(providerSql,/p_actor_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'/);
  assert.match(providerSql,/credential_secret_reference/);
  assert.match(providerSql,/v_secret_reference !~ '\^env:MINGLORA_AI_PROVIDER_/);
  assert.match(providerSql,/assignment_status,provider_health_status\s*\) VALUES \([\s\S]*?'configured','unknown'/);
  assert.match(providerSql,/credentialConfigured/);
  assert.doesNotMatch(providerSql,/credential_secret_reference'\s*,\s*account\.credential_secret_reference/);
});

test('provider model catalogue is shared and provider account credentials remain references only',()=>{
  const modelInsert=providerSql.slice(providerSql.indexOf('INSERT INTO public.ai_provider_models'),providerSql.indexOf('IF v_primary'));
  assert.match(modelInsert,/\) VALUES \(\s*NULL,v_provider_name/);
  assert.doesNotMatch(modelInsert,/SET provider_account_id = EXCLUDED\.provider_account_id/);
  assert.match(providerSql,/credentialSecretReference/);
  assert.match(providerSql,/env:MINGLORA_AI_PROVIDER_/);
  assert.doesNotMatch(providerSql,/api_key\s+text|apiKey\s+text|secret_value\s+text/i);
});

test('provider runtime gateway validates owner, allowlisted fields and secret references',()=>{
  for(const action of ['ai_provider_assignment_upsert','ai_provider_assignment_list']) {
    assert.ok(gateway.includes(action),'missing provider gateway action: '+action);
  }
  assert.match(gateway,/Only the designated Minglora owner can configure AI providers/);
  assert.match(gateway,/Only the designated Minglora owner can read AI provider assignments/);
  assert.ok(gateway.includes('^env:MINGLORA_AI_PROVIDER_'));
  assert.match(gateway,/admin\.rpc\("minglora_ai_provider_assignment_upsert"/);
  assert.match(gateway,/admin\.rpc\("minglora_ai_provider_assignment_list"/);
  assert.doesNotMatch(gateway,/credential_secret_reference\s*:/);
});


test('durable task claims require a healthy text-capable provider assignment for that AI identity',()=>{
  assert.match(queueSql,/JOIN LATERAL \([\s\S]*?FROM public\.ai_provider_assignments AS assignment/);
  assert.match(queueSql,/assignment\.assignment_status = 'active'/);
  assert.match(queueSql,/assignment\.provider_health_status = 'healthy'/);
  assert.match(queueSql,/account\.account_status = 'active'/);
  assert.match(queueSql,/account\.provider_health_status = 'healthy'/);
  assert.match(queueSql,/account\.credential_secret_reference IS NOT NULL/);
  assert.match(queueSql,/model\.text_capable = true/);
  assert.match(queueSql,/cardinality\(assignment\.tool_permissions\) = 0/);
  assert.match(queueSql,/cardinality\(model\.tool_permissions\) = 0/);
  assert.match(queueSql,/credentialSecretReference',claimed\.credential_secret_reference/);
});

test('provider runtime health is service-role only, audited and recoverable',()=>{
  assert.ok(providerSql.includes('minglora_ai_provider_runtime_list(uuid,integer,integer)'));
  assert.ok(providerSql.includes('minglora_ai_provider_health_update(uuid,text,uuid)'));
  assert.ok(providerSql.includes('GRANT EXECUTE ON FUNCTION public.minglora_ai_provider_runtime_list(uuid,integer,integer) TO service_role'));
  assert.ok(providerSql.includes('GRANT EXECUTE ON FUNCTION public.minglora_ai_provider_health_update(uuid,text,uuid) TO service_role'));
  assert.match(providerSql,/credentialSecretReference/);
  assert.match(providerSql,/INSERT INTO public\.ai_identity_audit_logs/);
  assert.match(providerSql,/provider\.health_checked/);
  assert.match(providerSql,/p_health_status IS NULL/);
  assert.match(providerSql,/assignment\.assignment_status <> 'disabled'/);
});

test('provider health runtime actions remain owner-gated in the existing Edge Function',()=>{
  for(const action of ['ai_provider_runtime_list','ai_provider_health_update']) assert.ok(gateway.includes(action));
  assert.match(gateway,/Only the designated Minglora owner can request provider runtime configuration/);
  assert.match(gateway,/Only the designated Minglora owner can update provider health/);
  assert.match(gateway,/admin\.rpc\("minglora_ai_provider_runtime_list"/);
  assert.match(gateway,/admin\.rpc\("minglora_ai_provider_health_update"/);
});
