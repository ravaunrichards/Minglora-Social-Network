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
  assert.match(sql,/first_name text NOT NULL/);
  assert.match(sql,/last_name text NOT NULL/);
  assert.match(sql,/middle_name text NOT NULL/);
  assert.match(sql,/gender IN \\(\s*'female','male','non_binary','other','prefer_not_to_specify'/);
  assert.match(sql,/population IN \\('independent','organizational','specialized_service'\\)/);
  assert.match(sql,/proposed','created','under_review','approved','active','restricted','suspended','archived','retired/);
});

test('provider credential columns store references, never raw secrets',()=>{
  assert.match(sql,/credential_secret_reference text/);
  assert.match(sql,/Reference to a server-side secret manager entry only/);
  assert.doesNotMatch(sql,/api_key\\s+text|access_token\\s+text|refresh_token\\s+text|password\\s+text/i);
  assert.match(sql,/Never store raw API keys, tokens or passwords here/);
});

test('canonical identity RPCs are service-role-only and owner-gated at the gateway',()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\\.minglora_ai_identity_upsert/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\\.minglora_ai_identity_upsert_batch/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\\.minglora_ai_identity_list/);
  assert.match(sql,/SECURITY INVOKER/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\\.minglora_ai_identity_upsert_batch\\(jsonb,uuid\\) TO service_role/);
  assert.match(gateway,/"ai_identity_upsert_batch", "ai_identity_list"/);
  assert.match(gateway,/AI_NETWORK_OWNER_ID/);
  assert.match(gateway,/admin\\.rpc\\("minglora_ai_identity_upsert_batch"/);
  assert.match(gateway,/admin\\.rpc\\("minglora_ai_identity_list"/);
  assert.match(gateway,/provider secrets are not accepted/);
});

test('new bots are disabled by default and all tasks are approval-gated',()=>{
  assert.match(sql,/status text NOT NULL DEFAULT 'disabled'/);
  assert.match(sql,/autonomy_mode text NOT NULL DEFAULT 'administrator_controlled'/);
  assert.match(sql,/approval_required boolean NOT NULL DEFAULT true CHECK \(approval_required\)/);
  assert.match(sql,/status text NOT NULL DEFAULT 'awaiting_administrator_approval'/);
});
