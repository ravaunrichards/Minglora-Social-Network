import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const migration = read('supabase/migrations/20261120120000_minglora_ai_social_integration.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const store = read('src/store.js');
const app = read('public/app.js');
const aiUI = read('public/ai-network.js');

test('AI social state stays in the private ai_network schema and preserves human Auth identities', () => {
  for (const table of [
    'ai_social_runtime_controls',
    'ai_social_permissions',
    'ai_social_member_consents',
    'ai_social_activity'
  ]) {
    assert.match(migration, new RegExp('create table if not exists ai_network\\.' + table));
    assert.match(migration, new RegExp('alter table ai_network\\.' + table + ' enable row level security'));
  }
  assert.match(migration, /from public, anon, authenticated/i);
  assert.match(migration, /to service_role/i);
  assert.match(migration, /current_user <> 'service_role'/i);
  assert.doesNotMatch(migration, /create table[^;]+public\\.profiles/i);
  assert.doesNotMatch(migration, /create table[^;]+auth\\.users/i);
  assert.match(store, /'aiSocialPosts', 'aiSocialProfiles', 'aiSocialConversations', 'aiSocialMessages'/);
});

test('AI social actions default to paused, suspended, least privilege and human approval', () => {
  assert.match(migration, /global_paused boolean not null default true/i);
  assert.match(migration, /is_suspended boolean not null default true/i);
  assert.match(migration, /can_post boolean not null default false/i);
  assert.match(migration, /can_comment boolean not null default false/i);
  assert.match(migration, /can_react boolean not null default false/i);
  assert.match(migration, /can_message boolean not null default false/i);
  assert.match(migration, /can_ai_interact boolean not null default false/i);
  assert.match(migration, /require_human_approval boolean not null default true check \(require_human_approval = true\)/i);
  assert.match(migration, /human_approved[^\n]*is not true/i);
  assert.match(migration, /v_controls\.global_paused is true/i);
  assert.match(migration, /v_identity\.status <> 'active' or v_identity\.enabled is not true/i);
  assert.match(migration, /v_permissions\.is_suspended is true/i);
});

test('AI social permission checks enforce per-action permissions and bounded hourly caps', () => {
  for (const column of [
    'max_posts_per_hour integer not null default 2 check (max_posts_per_hour between 0 and 5)',
    'max_comments_per_hour integer not null default 5 check (max_comments_per_hour between 0 and 10)',
    'max_reactions_per_hour integer not null default 10 check (max_reactions_per_hour between 0 and 20)',
    'max_messages_per_hour integer not null default 2 check (max_messages_per_hour between 0 and 5)',
    'max_ai_interactions_per_hour integer not null default 3 check (max_ai_interactions_per_hour between 0 and 10)'
  ]) assert.ok(migration.includes(column), column);
  assert.match(migration, /v_recent_count >= v_rate_limit/i);
  assert.match(migration, /a\.created_at > now\(\) - interval '1 hour'/i);
  assert.match(migration, /idempotency_key/);
});

test('AI direct messages require a human-started conversation and explicit member consent', () => {
  assert.match(migration, /v_action_name = 'message'/);
  assert.match(migration, /human_initiated[^\n]*is not true/i);
  assert.match(migration, /ai_social_member_consents/);
  assert.match(migration, /allow_ai_messages is true/i);
  assert.match(server, /if\(to\.startsWith\('ai:'\)\)/);
  assert.match(server, /await runAISocialCommand\(user\.id,'set_member_consent',\{allow_ai_messages:true\}\)/);
  assert.match(server, /humanInitiated:true/);
  assert.match(server, /sub==='social\/message'/);
});

test('AI-to-AI interactions require public target permissions and stop at loop depth two', () => {
  assert.match(migration, /v_loop_depth > 2/);
  assert.match(migration, /v_loop_depth >= 2/);
  assert.match(migration, /v_chain_id is null/);
  assert.match(migration, /v_target_identity_id = v_identity_id/);
  assert.match(migration, /tap\.can_ai_interact is true/);
  assert.match(migration, /already visited that target/);
  assert.match(server, /sub==='social\/ai-message'/);
  assert.match(server, /loop_depth:1/);
});

test('AI public profiles and feed posts are disclosed and privacy-gated', () => {
  assert.match(migration, /p\.profile_visibility = 'public'/);
  assert.match(migration, /i\.status = 'active'/);
  assert.match(migration, /i\.enabled = true/i);
  assert.match(server, /async function syncPublicAISocialProfiles/);
  assert.match(server, /function isVisibleAISocialPost/);
  assert.match(server, /profileVisibility!=='public'/);
  assert.match(server, /aiDisclosureRequired:true/);
  assert.match(server, /aiContentMode:'human-reviewed'/);
  assert.match(server, /const humanPosts=/);
  assert.match(server, /const aiPosts=/);
  assert.match(app, /AI BOT · OWNER-REVIEWED/);
  assert.match(app, /data-message-ai/);
});

test('AI post, comment, reaction, moderation and activity endpoints are present', () => {
  for (const route of [
    "sub==='social/posts'",
    "sub==='social/comment'",
    "sub==='social/reaction'",
    "sub==='social/posts/'",
    "social/posts/([^/]+)/manage",
    "record_admin_action",
    "record_member_activity",
    "history"
  ]) assert.ok(server.includes(route), route);
  assert.match(server, /p==='\/api\/posts\/\(\[\^\/\]\+\)\/reactions/);
  assert.match(server, /p==='\/api\/posts\/\(\[\^\/\]\+\)\/comments/);
  assert.match(server, /Only the comment author, post owner or AI identity owner can delete this comment/);
});

test('AI social consent is opt-in, visible in account settings and revocable', () => {
  assert.match(server, /p==='\/api\/ai-social\/consent'/);
  assert.match(server, /allowAIMessages===true/);
  assert.match(app, /AI member messages/);
  assert.match(app, /api\("\/ai-social\/consent",\{method:"PATCH"/);
  assert.match(app, /allowAIMessages:checkbox\("allowAIMessages"\)/);
});

test('the private runtime gateway whitelists AI social commands and calls the RPC', () => {
  assert.match(runtime, /"ai_social_command"/);
  assert.match(runtime, /"record_admin_action"/);
  assert.match(runtime, /"set_member_consent"/);
  assert.match(runtime, /admin\.rpc\("minglora_ai_social_command"/);
  assert.match(runtime, /A dedicated authenticated AI worker credential is required/);
});

test('AI owner workspace requires explicit approval and exposes global suspension controls', () => {
  for (const form of [
    'social-controls',
    'social-permissions',
    'social-post',
    'social-comment',
    'social-reaction',
    'social-message',
    'social-ai-message'
  ]) assert.ok(aiUI.includes('data-ai-form="' + form + '"') || aiUI.includes("kind === '" + form + "'"), form);
  assert.match(aiUI, /humanApproved = true/);
  assert.match(aiUI, /window\.confirm\('Publish this exact text as an AI member/);
  assert.match(aiUI, /Social access enabled/);
  assert.match(aiUI, /Suspend this AI identity/);
  assert.match(aiUI, /Global pause active/);
  assert.match(aiUI, /Interaction history/);
});
