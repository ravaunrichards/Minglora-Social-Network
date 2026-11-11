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

const emailSql = await readFile(
  new URL('../../supabase/migrations/20261109220000_minglora_ai_email_identity_rpcs.sql', import.meta.url),
  'utf8'
);

const discoverySql = await readFile(
  new URL('../../supabase/migrations/20261109230000_minglora_ai_identity_discovery.sql', import.meta.url),
  'utf8'
);
const safetySql = await readFile(
  new URL('../../supabase/migrations/20261109250000_minglora_ai_public_profile_safety.sql', import.meta.url),
  'utf8'
);
const reportReviewSql = await readFile(
  new URL('../../supabase/migrations/20261109251000_minglora_ai_report_review_rpcs.sql', import.meta.url),
  'utf8'
);
const autonomyModesSql = await readFile(
  new URL('../../supabase/migrations/20261109252000_minglora_ai_bot_autonomy_modes.sql', import.meta.url),
  'utf8'
);
const profileHtml = await readFile(
  new URL('../../public/ai-profile.html', import.meta.url),
  'utf8'
);
const profileUi = await readFile(
  new URL('../../public/ai-profile.js', import.meta.url),
  'utf8'
);
const adminBotUi = await readFile(
  new URL('../../public/personal-ai-bots.js', import.meta.url),
  'utf8'
);

const socialSql = await readFile(
  new URL('../../supabase/migrations/20261109240000_minglora_ai_social_follow_and_saved_searches.sql', import.meta.url),
  'utf8'
);
const serverSource = await readFile(
  new URL('../../src/server.js', import.meta.url),
  'utf8'
);
const adminApiSource = await readFile(
  new URL('../../backend/modules/personal-ai-bots/admin-api.js', import.meta.url),
  'utf8'
);
const storeSource = await readFile(
  new URL('../../src/store.js', import.meta.url),
  'utf8'
);
const serviceSource = await readFile(
  new URL('../../backend/modules/personal-ai-bots/personal-ai-bots-service.js', import.meta.url),
  'utf8'
);
const discoveryUi = await readFile(
  new URL('../../public/ai-discover.js', import.meta.url),
  'utf8'
);
const discoveryHtml = await readFile(
  new URL('../../public/ai-discover.html', import.meta.url),
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
  for(const mode of ['administrator_controlled','human_approval','supervisor_controlled','hybrid','autonomous_within_limits','restricted_observation']) assert.ok(sql.includes("'"+mode+"'"),mode);
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

test('worker heartbeat, completion and failure RPCs require the active owner-scoped lease',()=>{
  for(const name of ['minglora_ai_bot_task_heartbeat','minglora_ai_bot_task_complete','minglora_ai_bot_task_fail']){
    const start=queueSql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
    assert.ok(start>=0,'missing '+name);
    const end=queueSql.indexOf('$function$;',start);
    assert.ok(end>start,'missing function terminator for '+name);
    const body=queueSql.slice(start,end);
    assert.match(body,/p_actor_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid/);
    assert.match(body,/owner_admin_id = p_actor_user_id/);
    assert.match(body,/worker_id = p_worker_id/);
    assert.match(body,/lease_token = p_lease_token/);
    assert.match(body,/lease_expires_at > pg_catalog\.now\(\)/);
  }
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


test('worker provider preflight resolves env secret references, health-checks and caches exact assignments',()=>{
  assert.ok(workerEntrypoint.includes('MINGLORA_AI_BOT_PROVIDER_MODULE'));
  assert.ok(workerEntrypoint.includes("'ai_provider_runtime_list'"));
  assert.ok(workerEntrypoint.includes("'ai_provider_health_update'"));
  assert.ok(workerEntrypoint.includes('process.env[credentialName]'));
  assert.ok(workerEntrypoint.includes('adapter.healthCheck'));
  assert.ok(workerEntrypoint.includes('providerAdapters.set(String(assignment.assignmentId),adapter)'));
  assert.ok(workerEntrypoint.includes('nextProviderHealthCheck=Date.now()+5*60*1000'));
  assert.doesNotMatch(workerEntrypoint,/console\.(?:log|info|warn)\([^\n]*credential\b/i);
  assert.match(worker,/resolveProviderAdapter/);
  assert.match(worker,/task\.providerAssignmentId/);
  assert.match(worker,/adapter\.providerIdentifier/);
  assert.match(worker,/adapter\.modelIdentifier/);
});


test('AI email identity RPC stores only address records and defaults to not verified/not provisioned',()=>{
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.ai_emails'));
  assert.match(sql,/provisioning_status text NOT NULL DEFAULT 'not_provisioned'/);
  assert.match(sql,/verification_status text NOT NULL DEFAULT 'not_verified'/);
  assert.match(emailSql,/minglora_ai_email_identity_upsert/);
  assert.match(emailSql,/minglora_ai_email_identity_list/);
  assert.match(emailSql,/ON CONFLICT \(lower\(email_address\)\)/);
  assert.match(emailSql,/Only the designated Minglora owner may manage AI email identities/);
  assert.match(emailSql,/Verification and provisioning states cannot be self-declared/);
  assert.match(emailSql,/No mailbox has been provisioned or verified/);
  assert.match(emailSql,/GRANT EXECUTE ON FUNCTION public\.minglora_ai_email_identity_upsert\(jsonb,uuid\) TO service_role/);
  assert.match(emailSql,/GRANT EXECUTE ON FUNCTION public\.minglora_ai_email_identity_list\(uuid,uuid,integer,integer\) TO service_role/);
});

test('email identity gateway is owner-only and excludes client-declared mailbox state and raw secrets',()=>{
  assert.ok(gateway.includes('ai_email_identity_upsert'));
  assert.ok(gateway.includes('ai_email_identity_list'));
  assert.match(gateway,/Only the designated Minglora owner can manage AI email identities/);
  assert.match(gateway,/Only the designated Minglora owner can read AI email identities/);
  assert.match(gateway,/admin\.rpc\("minglora_ai_email_identity_upsert"/);
  assert.match(gateway,/admin\.rpc\("minglora_ai_email_identity_list"/);
  const handler=gateway.slice(gateway.indexOf('if (action === "ai_email_identity_upsert")'),gateway.indexOf('if (action === "ai_provider_runtime_list")'));
  assert.doesNotMatch(handler,/verificationStatus|provisioningStatus|password|apiKey|secretValue/i);
});


test('worker marks all provider assignments unavailable when adapter configuration is missing',()=>{
  const missingBranch=workerEntrypoint.slice(
    workerEntrypoint.indexOf('if(!createAdapter){'),
    workerEntrypoint.indexOf('for(const assignment of assignments)',workerEntrypoint.indexOf('if(!createAdapter){')+1)
  );
  assert.ok(workerEntrypoint.includes("if(!createAdapter){"));
  assert.match(workerEntrypoint,/No provider adapter module configured; all assignments are marked unavailable/);
  assert.ok((workerEntrypoint.match(/healthStatus:'unavailable'/g)||[]).length>=2);
  assert.ok(workerEntrypoint.includes("'ai_provider_health_update'"));
});


test('canonical AI profile upsert persists education, presentation, voice/avatar and communication fields',()=>{
  for(const column of [
    'gender_presentation','communication_style','education','voice_preferences',
    'avatar_preferences','avatar_storage_reference','cover_storage_reference'
  ]) {
    assert.ok(sql.includes(column),'missing profile column mapping: '+column);
    assert.ok(sql.includes(column+'=EXCLUDED.'+column),'missing profile update mapping: '+column);
  }
  assert.match(sql,/CASE WHEN pg_catalog\.jsonb_typeof\(p_identity->'education'\)='array' THEN p_identity->'education'/);
  assert.match(sql,/CASE WHEN pg_catalog\.jsonb_typeof\(p_identity->'voice_preferences'\)='object'/);
  assert.match(sql,/CASE WHEN pg_catalog\.jsonb_typeof\(p_identity->'avatar_preferences'\)='object'/);
});

test('canonical AI profile upsert persists structured worldwide locations and regional fields',()=>{
  assert.match(sql,/INSERT INTO public\.ai_identity_locations/);
  for(const field of ['country_code','country_name','state_province','district','parish_county','city','town','time_zone']) {
    assert.ok(sql.includes(field),'missing structured location field '+field);
  }
  assert.match(sql,/ON CONFLICT \(identity_id,location_type\) DO UPDATE/);
  assert.match(sql,/pg_catalog\.jsonb_array_length\(p_identity->'locations'\) > 10/);
  assert.match(sql,/DELETE FROM public\.ai_identity_locations WHERE identity_id=v_id/);
});

test('canonical AI capability assignments are persisted as unverified until real checks occur',()=>{
  assert.match(sql,/INSERT INTO public\.ai_identity_capabilities/);
  assert.match(sql,/capability_configuration,verification_status\s*\) VALUES[\s\S]*?'unverified'/);
  assert.match(sql,/verification_status='unverified'/);
  assert.match(sql,/last_checked_at=NULL/);
  assert.match(sql,/pg_catalog\.jsonb_array_length\(p_identity->'capabilities'\) > 100/);
});

test('canonical identity gateway accepts the complete profile schema without accepting raw secrets',()=>{
  for(const field of [
    'gender_presentation','communication_style','education','avatar_storage_reference',
    'cover_storage_reference','voice_preferences','avatar_preferences','locations','capabilities'
  ]) assert.ok(gateway.includes('"'+field+'"'),'missing gateway allowlist field '+field);
  assert.doesNotMatch(gateway,/api_key\s*:/i);
  assert.doesNotMatch(gateway,/password\s*:/i);
});


test('public AI discovery exposes only explicitly public enabled identities',()=>{
  assert.ok(discoverySql.includes('CREATE OR REPLACE FUNCTION public.minglora_ai_identity_discover'));
  assert.match(discoverySql,/identity\.status = 'active'/);
  assert.match(discoverySql,/identity\.public_profile_enabled = true/);
  assert.match(discoverySql,/profile\.visibility = 'public'/);
  assert.match(discoverySql,/NOT EXISTS \([\s\S]*?FROM public\.ai_identity_blocks AS block[\s\S]*?block\.identity_id=identity\.identity_id[\s\S]*?block\.user_id=p_viewer_user_id/,'AI block filtering is enforced in the indexed SQL discovery query');
  assert.match(discoverySql,/GRANT EXECUTE ON FUNCTION public\.minglora_ai_identity_discover\(text,jsonb,text,integer,integer\) TO service_role/);
  assert.match(discoverySql,/WHERE enabled = true AND verification_status = 'verified'/);
  for(const filter of [
    'gender','nationality','countryOfOrigin','currentCountry','countryCode',
    'stateProvince','parishCounty','city','language','category','profession',
    'personality','interest','capability'
  ]) assert.ok(discoverySql.includes("'"+filter+"'"),'missing discovery filter '+filter);
  for(const privateField of ['email_address','credential_secret_reference','api_key','provider_configuration']) {
    assert.ok(!discoverySql.includes(privateField),'public discovery must not expose '+privateField);
  }
});

test('AI discovery Edge gateway and server endpoint require a signed-in member',()=>{
  assert.ok(gateway.includes('"ai_identity_discover"'));
  const handler=gateway.slice(gateway.indexOf('if (action === "ai_identity_discover")'),gateway.indexOf('if (action === "ai_identity_upsert_batch")'));
  assert.match(handler,/validUuid\(actorUserId\)/);
  assert.match(handler,/Sign in to discover public Minglora AI identities/);
  assert.match(handler,/admin\.rpc\("minglora_ai_identity_discover"/);
  const discoveryStart=serverSource.indexOf("if(method==='GET'&&p==='/api/ai/discover')");
  const route=serverSource.slice(discoveryStart,serverSource.indexOf("if(method==='POST'&&p==='/api/ai/follows')",discoveryStart));
  assert.ok(route.length>0);
  assert.match(serverSource,/requireAuth\(user\);\s*if\(method==='GET'&&p==='\/api\/ai\/discover'/);
  assert.match(route,/requestSupabaseState\('ai_identity_discover'/);
  assert.match(route,/AI discovery requires Minglora Supabase PostgreSQL persistence/);
  assert.match(route,/nextOffset/);
  assert.match(route,/hasMore/);
  assert.match(route,/result\.total/);
  assert.doesNotMatch(route,/ai_identity_block_list|blockedIdentityIds/,'AI blocks are not filtered through an incomplete 500-item list');
});

test('worldwide AI discovery country selector covers the 249 ISO 3166-1 entries',()=>{
  const match=discoveryUi.match(/const COUNTRY_CODES='([^']+)'\.split\(' '\)/);
  assert.ok(match,'country code catalogue missing');
  const codes=match[1].split(' ');
  assert.equal(codes.length,249);
  assert.equal(new Set(codes).size,249);
  for(const code of codes)assert.match(code,/^[A-Z]{2}$/);
  assert.match(discoveryUi,/new Intl\.DisplayNames\(\['en'\],\{type:'region'\}\)/);
  assert.match(discoveryUi,/countrySelect\.appendChild\(fragment\)/);
});

test('AI discovery filters combine multiple dimensions and paginate without false activity metrics',()=>{
  assert.match(discoverySql,/LIMIT p_limit OFFSET p_offset/);
  assert.match(discoverySql,/ORDER BY[\s\S]*created_at DESC/);
  assert.match(discoveryUi,/filters:JSON\.stringify\(filtersFromForm\(\)\)/);
  assert.match(discoveryUi,/sort:document\.querySelector\('#aid-sort'\)\.value/);
  assert.match(discoveryUi,/offset=Number\.isInteger\(nextOffset\)[\s\S]*?nextOffset:offset\+items\.length/);
  assert.match(discoveryUi,/const hasMore=payload\.hasMore===true/);
  assert.match(discoveryUi,/loadMore\.hidden=!hasMore/);
  assert.doesNotMatch(discoverySql,/likes|views|popularity_score/i);
});


test('AI follow relationships use a separate follower table and exclude human counts',()=>{
  assert.match(discoverySql,/CREATE TABLE IF NOT EXISTS public\.ai_identity_followers/);
  assert.match(discoverySql,/exclude_from_human_follow_counts boolean NOT NULL DEFAULT true CHECK/);
  assert.match(discoverySql,/ALTER TABLE public\.ai_identity_followers ENABLE ROW LEVEL SECURITY/);
  assert.match(discoverySql,/REVOKE ALL ON TABLE public\.ai_identity_followers FROM PUBLIC, anon, authenticated/);
  assert.match(discoverySql,/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.ai_identity_followers TO service_role/);
  assert.doesNotMatch(discoverySql,/INSERT INTO public\.user_follows|UPDATE public\.user_follows/i);
  assert.match(socialSql,/CREATE OR REPLACE FUNCTION public\.minglora_ai_identity_follow_set/);
  assert.match(socialSql,/identity\.public_profile_enabled = true/);
  assert.match(socialSql,/profile\.visibility = 'public'/);
  assert.match(socialSql,/The owner cannot follow their own AI identity/);
  assert.match(socialSql,/relationshipType','human_follows_ai'/);
  assert.match(socialSql,/excludeFromHumanFollowCounts',true/);
});

test('saved AI discovery searches are private to each authenticated member and bounded',()=>{
  assert.match(socialSql,/CREATE TABLE IF NOT EXISTS public\.ai_discovery_saved_searches/);
  assert.match(socialSql,/user_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(socialSql,/UNIQUE \(user_id,name\)/);
  assert.match(socialSql,/ALTER TABLE public\.ai_discovery_saved_searches ENABLE ROW LEVEL SECURITY/);
  assert.match(socialSql,/REVOKE ALL ON TABLE public\.ai_discovery_saved_searches FROM PUBLIC, anon, authenticated/);
  assert.match(socialSql,/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.ai_discovery_saved_searches TO service_role/);
  assert.match(socialSql,/50 AI discovery searches/);
  assert.match(socialSql,/WHERE user_id=p_user_id/);
  assert.match(socialSql,/minglora_ai_discovery_saved_search_upsert/);
  assert.match(socialSql,/minglora_ai_discovery_saved_search_list/);
  assert.match(socialSql,/minglora_ai_discovery_saved_search_delete/);
});

test('AI follow and saved-search gateway actions are user scoped through the existing runtime secret',()=>{
  for(const action of [
    'ai_identity_public_owner_lookup','ai_identity_follow_set','ai_identity_follow_list',
    'ai_discovery_saved_search_upsert','ai_discovery_saved_search_list','ai_discovery_saved_search_delete'
  ])assert.ok(gateway.includes(action),'missing action '+action);
  assert.match(gateway,/admin\.rpc\("minglora_ai_identity_public_owner_lookup"/);
  assert.match(gateway,/admin\.rpc\("minglora_ai_identity_follow_set"/);
  assert.match(gateway,/admin\.rpc\("minglora_ai_identity_follow_list"/);
  assert.match(gateway,/admin\.rpc\("minglora_ai_discovery_saved_search_upsert"/);
  assert.match(gateway,/admin\.rpc\("minglora_ai_discovery_saved_search_list"/);
  assert.match(gateway,/admin\.rpc\("minglora_ai_discovery_saved_search_delete"/);
});

test('member AI social endpoints enforce authentication, privacy blocks and hide internal owner IDs',()=>{
  const discoveryRoute=serverSource.slice(serverSource.indexOf("if(method==='GET'&&p==='/api/ai/discover')"),serverSource.indexOf("if(method==='POST'&&p==='/api/ai/follows')"));
  assert.match(serverSource,/requireAuth\(user\);\s*if\(method==='GET'&&p==='\/api\/ai\/discover'/);
  assert.match(discoveryRoute,/blockedBetween\(user\.id,ownerId\)/);
  assert.match(discoveryRoute,/\.map\(\(\{ownerAdminId,\.\.\.item\}\)=>item\)/);
  const followRoutes=serverSource.slice(serverSource.indexOf("if(method==='POST'&&p==='/api/ai/follows')"),serverSource.indexOf('handlePersonalAiBotsAdminApi',serverSource.indexOf("if(method==='POST'&&p==='/api/ai/follows')")));
  assert.match(followRoutes,/ai_identity_public_owner_lookup/);
  assert.match(followRoutes,/blockedBetween\(user\.id,ownerAdminId\)/);
  assert.match(followRoutes,/ai_identity_follow_set/);
  assert.match(followRoutes,/ai_identity_follow_list/);
  assert.match(followRoutes,/ai_discovery_saved_search_upsert/);
  assert.match(followRoutes,/ai_discovery_saved_search_delete/);
  assert.match(followRoutes,/actorUserId:user\.id/);
  assert.match(followRoutes,/\.map\(\(\{ownerAdminId,\.\.\.item\}\)=>item\)/);
});

test('AI discovery controller offers explicit follow controls and private saved searches',()=>{
  assert.match(discoveryUi,/aid-follow-button/);
  assert.match(discoveryUi,/fetch\('\/api\/ai\/follows'/);
  assert.match(discoveryUi,/fetch\('\/api\/ai\/discovery\/saved-searches'/);
  assert.ok(discoveryUi.includes('encodeURIComponent(id)'));
  assert.match(discoveryUi,/aid-apply-saved/);
  assert.match(discoveryUi,/aid-delete-saved/);
  assert.match(discoveryUi,/loadMyFollows/);
  assert.match(discoveryUi,/members follow this AI/);
});


test('AI user follows persist separately from human follows and respect public profile consent',()=>{
  assert.match(discoverySql,/CREATE TABLE IF NOT EXISTS public\.ai_identity_followers/);
  assert.match(discoverySql,/exclude_from_human_follow_counts boolean NOT NULL DEFAULT true CHECK/);
  assert.match(discoverySql,/ALTER TABLE public\.ai_identity_followers ENABLE ROW LEVEL SECURITY/);
  assert.match(discoverySql,/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.ai_identity_followers TO service_role/);
  assert.doesNotMatch(discoverySql,/INSERT INTO public\.user_follows|UPDATE public\.user_follows/i);
  assert.match(socialSql,/CREATE OR REPLACE FUNCTION public\.minglora_ai_identity_public_owner_lookup/);
  assert.match(socialSql,/CREATE OR REPLACE FUNCTION public\.minglora_ai_identity_follow_set/);
  assert.match(socialSql,/identity\.public_profile_enabled = true/);
  assert.match(socialSql,/profile\.visibility = 'public'/);
  assert.match(socialSql,/The owner cannot follow their own AI identity/);
  assert.match(socialSql,/relationshipType','human_follows_ai'/);
  assert.match(socialSql,/excludeFromHumanFollowCounts',true/);
  assert.match(socialSql,/CREATE OR REPLACE FUNCTION public\.minglora_ai_identity_follow_list/);
});

test('saved AI discovery groups are stored privately per Minglora member',()=>{
  assert.match(socialSql,/CREATE TABLE IF NOT EXISTS public\.ai_discovery_saved_searches/);
  assert.match(socialSql,/user_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(socialSql,/UNIQUE \(user_id,name\)/);
  assert.match(socialSql,/ALTER TABLE public\.ai_discovery_saved_searches ENABLE ROW LEVEL SECURITY/);
  assert.match(socialSql,/REVOKE ALL ON TABLE public\.ai_discovery_saved_searches FROM PUBLIC, anon, authenticated/);
  assert.match(socialSql,/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.ai_discovery_saved_searches TO service_role/);
  assert.match(socialSql,/up to 50 AI discovery searches/);
  assert.match(socialSql,/WHERE user_id=p_user_id/);
  assert.match(socialSql,/minglora_ai_discovery_saved_search_upsert/);
  assert.match(socialSql,/minglora_ai_discovery_saved_search_list/);
  assert.match(socialSql,/minglora_ai_discovery_saved_search_delete/);
});

test('runtime gateway exposes all signed-in member follow and saved-search operations',()=>{
  for(const action of [
    'ai_identity_public_owner_lookup','ai_identity_follow_set','ai_identity_follow_list',
    'ai_discovery_saved_search_upsert','ai_discovery_saved_search_list','ai_discovery_saved_search_delete'
  ])assert.ok(gateway.includes(action),'missing gateway action '+action);
  for(const functionName of [
    'minglora_ai_identity_public_owner_lookup','minglora_ai_identity_follow_set',
    'minglora_ai_identity_follow_list','minglora_ai_discovery_saved_search_upsert',
    'minglora_ai_discovery_saved_search_list','minglora_ai_discovery_saved_search_delete'
  ])assert.ok(gateway.includes(functionName),'missing RPC '+functionName);
});

test('AI social API endpoints use the authenticated member ID, enforce blocks and do not leak owner IDs',()=>{
  const discoveryRoute=serverSource.slice(serverSource.indexOf("if(method==='GET'&&p==='/api/ai/discover')"),serverSource.indexOf("if(method==='POST'&&p==='/api/ai/follows')"));
  assert.match(discoveryRoute,/blockedBetween\(user\.id,ownerId\)/);
  assert.match(discoveryRoute,/\.map\(\(\{ownerAdminId,\.\.\.item\}\)=>item\)/);
  const socialRoutes=serverSource.slice(serverSource.indexOf("if(method==='POST'&&p==='/api/ai/follows')"),serverSource.indexOf('handlePersonalAiBotsAdminApi',serverSource.indexOf("if(method==='POST'&&p==='/api/ai/follows')")));
  assert.match(socialRoutes,/ai_identity_public_owner_lookup/);
  assert.match(socialRoutes,/blockedBetween\(user\.id,ownerAdminId\)/);
  assert.match(socialRoutes,/ai_identity_follow_set/);
  assert.match(socialRoutes,/ai_identity_follow_list/);
  assert.match(socialRoutes,/ai_discovery_saved_search_upsert/);
  assert.match(socialRoutes,/ai_discovery_saved_search_list/);
  assert.match(socialRoutes,/ai_discovery_saved_search_delete/);
  assert.match(socialRoutes,/actorUserId:user\.id/);
  assert.match(socialRoutes,/\.map\(\(\{ownerAdminId,\.\.\.item\}\)=>item\)/);
  assert.match(serverSource,/requireAuth\(user\);\s*if\(method==='GET'&&p==='\/api\/ai\/discover'/);
});

test('discovery UI supports explicit AI follows and private saved searches',()=>{
  for(const item of [
    'aid-follow-button','aid-save-search-form','aid-saved-searches','aid-my-follows',
    'aid-apply-saved','aid-delete-saved','loadMyFollows'
  ])assert.ok(discoveryUi.includes(item),'missing AI social UI control '+item);
  assert.ok(discoveryUi.includes("fetch('/api/ai/follows'"));
  assert.ok(discoveryUi.includes("fetch('/api/ai/discovery/saved-searches'"));
  assert.ok(discoveryUi.includes("fetch('/api/ai/discovery/saved-searches/'+encodeURIComponent(id)"));
});


test('AI profile safety tables are isolated, RLS protected and audited',()=>{
  assert.match(safetySql,/CREATE TABLE IF NOT EXISTS public\.ai_identity_blocks/);
  assert.match(safetySql,/CREATE TABLE IF NOT EXISTS public\.ai_identity_reports/);
  assert.match(safetySql,/ALTER TABLE public\.ai_identity_blocks ENABLE ROW LEVEL SECURITY/);
  assert.match(safetySql,/ALTER TABLE public\.ai_identity_reports ENABLE ROW LEVEL SECURITY/);
  assert.match(safetySql,/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.ai_identity_blocks TO service_role/);
  assert.match(safetySql,/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.ai_identity_reports TO service_role/);
  assert.match(safetySql,/ai_identity_follow_block_guard_trigger/);
  assert.match(safetySql,/This AI identity is blocked by this member/);
  assert.match(safetySql,/SET status='removed'/);
  assert.match(safetySql,/safety\.profile_blocked/);
  assert.match(safetySql,/safety\.profile_reported/);
  assert.doesNotMatch(safetySql,/CREATE TABLE IF NOT EXISTS public\.(?:user_blocks|user_follows)/i);
});

test('public AI profile getter and report RPC only expose active public opted-in profiles',()=>{
  assert.match(safetySql,/CREATE OR REPLACE FUNCTION public\.minglora_ai_identity_public_profile_get/);
  assert.match(safetySql,/identity\.status='active'/);
  assert.match(safetySql,/identity\.public_profile_enabled=true/);
  assert.match(safetySql,/profile\.visibility='public'/);
  assert.match(safetySql,/ai_identity_blocks AS block/);
  assert.match(safetySql,/CREATE OR REPLACE FUNCTION public\.minglora_ai_identity_report_create/);
  assert.match(safetySql,/status text NOT NULL DEFAULT 'pending'/);
  assert.match(safetySql,/reviewed_by uuid REFERENCES auth\.users/);
  assert.match(safetySql,/GRANT EXECUTE ON FUNCTION public\.minglora_ai_identity_public_profile_get\(text,uuid\) TO service_role/);
});

test('public AI profile and safety endpoints enforce signed-in sessions and server block policy',()=>{
  const routes=serverSource.slice(serverSource.indexOf("const publicAiProfileMatch"),serverSource.indexOf("if (await handlePersonalAiBotsAdminApi",serverSource.indexOf("const publicAiProfileMatch")));
  const publicProfileRoutes=routes.slice(0,routes.indexOf("if(method==='GET'&&p==='/api/ai/blocks')"));
  assert.match(publicProfileRoutes,/ai_identity_public_profile_get/);
  assert.match(publicProfileRoutes,/blockedBetween\(user\.id,ownerId\)/);
  assert.doesNotMatch(publicProfileRoutes,/ai_identity_block_list|limit:500/,'public profile access uses the indexed canonical block predicate instead of fetching a capped list');
  assert.match(routes,/ai_identity_block_set/);
  assert.match(routes,/ai_identity_block_list/);
  assert.match(routes,/ai_identity_report_create/);
  assert.match(serverSource,/const publicAiPageMatch=p\.match/);
  assert.match(serverSource,/path\.join\(publicDir,'ai-profile\.html'\)/);
  assert.match(serverSource,/requireAuth\(user\);\s*if\(method==='GET'&&p==='\/api\/ai\/discover'/);
});

test('public AI profile page offers follow, block and report actions with AI disclosure',()=>{
  assert.match(profileHtml,/AI MEMBER · NOT A HUMAN ACCOUNT/);
  assert.match(profileHtml,/id="aip-block"/);
  assert.match(profileHtml,/id="aip-report-form"/);
  assert.ok(profileUi.includes("fetch('/api/ai/profiles/'+encodeURIComponent(slug)"));
  assert.match(profileUi,/fetch\('\/api\/ai\/follows'/);
  assert.match(profileUi,/fetch\('\/api\/ai\/reports'/);
  assert.match(profileUi,/method:'POST'/);
  assert.match(profileHtml,/impersonation/);
  assert.match(profileHtml,/inappropriate_content/);
});

test('AI discovery links profile slugs and includes blocked identity management',()=>{
  assert.match(discoveryUi,/href="\/ai\/'\+encodeURIComponent\(item\.publicProfileSlug/);
  assert.match(discoveryUi,/loadBlockedIdentities/);
  assert.match(discoveryUi,/aid-unblock-item/);
  assert.match(discoveryUi,/method:'DELETE'/);
});


test('Personal AI Bots editor creates and saves the complete editable demographic and location profile',()=>{
  for(const control of [
    'pab-bot-gender','pab-bot-nationality','pab-bot-country-origin',
    'pab-bot-current-country','pab-bot-timezone','pab-bot-introduction',
    'pab-bot-communication','pab-bot-profession','pab-bot-education','pab-bot-skills',
    'pab-bot-gender-presentation','pab-origin-country-code','pab-origin-state',
    'pab-origin-district','pab-origin-parish','pab-origin-city','pab-origin-town',
    'pab-current-country-code','pab-current-state','pab-current-district',
    'pab-current-parish','pab-current-city','pab-current-town',
    'pab-bot-voice-preferences','pab-bot-avatar-preferences',
    'pab-bot-memory-enabled','pab-bot-memory-configuration'
  ])assert.ok(adminBotUi.includes(control),'missing AI profile editor control '+control);
  assert.match(adminBotUi,/locations:\[/);
  assert.match(adminBotUi,/voicePreferences:JSON\.parse/);
  assert.match(adminBotUi,/memoryConfiguration:JSON\.parse/);
  assert.match(adminBotUi,/education:csv/);
  assert.match(adminBotUi,/skills:csv/);
});


test('AI bot editor and discovery use the same complete 249-entry ISO country and territory catalogue',()=>{
  const adminCodes=adminBotUi.match(/const AI_COUNTRY_CODES='([^']+)'\.split\(' '\)/)?.[1].split(' ')||[];
  const discoveryCodes=discoveryUi.match(/const COUNTRY_CODES='([^']+)'\.split\(' '\)/)?.[1].split(' ')||[];
  assert.equal(adminCodes.length,249);
  assert.equal(new Set(adminCodes).size,249);
  assert.deepEqual(adminCodes,discoveryCodes);
  assert.ok(adminBotUi.includes('list="pab-country-options" id="pab-bot-country-origin"'));
  assert.ok(adminBotUi.includes('list="pab-country-options" id="pab-bot-current-country"'));
  assert.match(adminBotUi,/originCountryCode:countryCodeForName/);
  assert.match(adminBotUi,/countryCode:read\('country-code'\)\.toUpperCase\(\)\|\|countryCodeForName\(read\('country-name'\)\)/);

  assert.match(adminBotUi,/currentCountryCode:countryCodeForName/);
});


test('five operating levels have an additive upgrade migration and remain separately dispatch-gated',()=>{
  assert.match(autonomyModesSql,/BEGIN;[\s\S]*ALTER TABLE public\.minglora_ai_bots/);
  assert.match(autonomyModesSql,/DROP CONSTRAINT IF EXISTS minglora_ai_bots_autonomy_mode_check/);
  assert.match(autonomyModesSql,/ADD CONSTRAINT minglora_ai_bots_autonomy_mode_check/);
  for(const mode of ['administrator_controlled','human_approval','supervisor_controlled','hybrid','autonomous_within_limits','restricted_observation']) assert.ok(autonomyModesSql.includes("'"+mode+"'"),mode);
  assert.match(autonomyModesSql,/Worker dispatch remains separately gated/);
  assert.match(autonomyModesSql,/COMMIT;/);
});

test('AI report moderation queue is private, owner scoped, bounded and fully audited',()=>{
  assert.match(reportReviewSql,/CREATE OR REPLACE FUNCTION public\.minglora_ai_identity_report_list/);
  assert.match(reportReviewSql,/p_owner_admin_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'/);
  assert.match(reportReviewSql,/p_status NOT IN \('all','open','pending','in_review','actioned','dismissed'\)/);
  assert.match(reportReviewSql,/LIMIT p_limit OFFSET p_offset/);
  assert.match(reportReviewSql,/CREATE OR REPLACE FUNCTION public\.minglora_ai_identity_report_review/);
  assert.match(reportReviewSql,/p_status NOT IN \('in_review','actioned','dismissed'\)/);
  assert.match(reportReviewSql,/status IN \('pending','in_review'\)/);
  assert.match(reportReviewSql,/reviewed_by=p_actor_user_id/);
  assert.match(reportReviewSql,/safety\.report_reviewed/);
  assert.match(reportReviewSql,/GRANT EXECUTE ON FUNCTION public\.minglora_ai_identity_report_list\(uuid,text,integer,integer\) TO service_role/);
  assert.match(reportReviewSql,/GRANT EXECUTE ON FUNCTION public\.minglora_ai_identity_report_review\(uuid,text,text,uuid\) TO service_role/);
});

test('AI report review gateway and owner API only permit the designated owner',()=>{
  assert.ok(gateway.includes('ai_identity_report_list'));
  assert.ok(gateway.includes('ai_identity_report_review'));
  assert.match(gateway,/Only the designated Minglora owner can review AI identity reports/);
  assert.match(gateway,/admin\.rpc\("minglora_ai_identity_report_list"/);
  assert.match(gateway,/admin\.rpc\("minglora_ai_identity_report_review"/);
  assert.match(serverSource,/listAiIdentityReports/);
  assert.match(serverSource,/reviewAiIdentityReport/);
  assert.match(adminApiSource,/method==='GET'&&path===root\+'\/safety\/reports'/);
  assert.match(adminApiSource,/safetyReportMatch&&method==='PATCH'/);
});

test('member AI block management paginates beyond the first database page',()=>{
  const start=serverSource.indexOf("if(method==='GET'&&p==='/api/ai/blocks')");
  const end=serverSource.indexOf("const aiProfileSafetyMatch",start);
  const route=serverSource.slice(start,end);
  assert.match(route,/url\.searchParams\.get\('limit'\)/);
  assert.match(route,/url\.searchParams\.get\('offset'\)/);
  assert.match(route,/limit>500/);
  assert.match(route,/nextOffset:offset\+blockedIdentities\.length/);
  assert.match(route,/hasMore:blockedIdentities\.length===limit/);
  const gatewayHandler=gateway.slice(gateway.indexOf('if (action === "ai_identity_block_list")'),gateway.indexOf('if (action === "ai_identity_report_create")'));
  assert.match(gatewayHandler,/p_limit: limit,p_offset: offset/);
  assert.ok(discoveryHtml.includes('id="aid-blocked-load-more"'));
  assert.match(discoveryUi,/let blockedOffset=0,blockedLoading=false/);
  assert.match(discoveryUi,/limit:'100',offset:String\(blockedOffset\)/);
  assert.match(discoveryUi,/blockedOffset=Number\.isInteger\(nextOffset\)/);
  assert.match(discoveryUi,/loadBlockedIdentities\(\{append:true\}\)/);
});


test('versioned AI persona records are included in the existing persistent runtime-state store',()=>{
  assert.match(storeSource,/'personalAiBotPersonaVersions'/);
  assert.match(adminApiSource,/listPersonalAiBotPersonaVersions/);
  assert.match(adminApiSource,/createPersonalAiBotPersonaDraft/);
  assert.match(adminApiSource,/evaluatePersonalAiBotPersonaDraft/);
  assert.match(adminApiSource,/approvePersonalAiBotPersonaVersion/);
  assert.match(adminApiSource,/activatePersonalAiBotPersonaVersion/);
  assert.match(adminApiSource,/rollbackPersonalAiBotPersonaVersion/);
});


test('team handoff records use existing runtime-state persistence and owner-only reviewed routes',()=>{
  assert.match(storeSource,/'personalAiBotTeamHandoffs'/);
  assert.match(adminApiSource,/getPersonalAiBotTeamHandoffs/);
  assert.match(adminApiSource,/createPersonalAiBotTeamHandoff/);
  assert.match(adminApiSource,/reviewPersonalAiBotTeamHandoff/);
  assert.match(adminApiSource,/teamHandoffsMatch&&method==='GET'/);
  assert.match(adminApiSource,/teamHandoffsMatch&&method==='POST'/);
  assert.match(adminApiSource,/teamHandoffActionMatch&&method==='POST'/);
  assert.match(serviceSource,/input\.privacyAttested!==true/);
  assert.match(serviceSource,/privacyAttestedBy:actorId,privacyAttestedAt:timestamp/);
  assert.match(serviceSource,/cancelOpenPersonalAiBotTeamHandoffs/);
  assert.match(serviceSource,/team_paused/);
  assert.match(serviceSource,/network_emergency_shutdown/);
});
