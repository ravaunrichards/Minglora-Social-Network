import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261115210000_minglora_ai_bot_conversations.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('AI conversations use private owner-scoped records and service-role-only database access', () => {
  assert.match(migration, /create table if not exists ai_network\.ai_bot_conversations/i);
  assert.match(migration, /create table if not exists ai_network\.ai_bot_conversation_turns/i);
  assert.match(migration, /owner_user_id uuid not null references public\.profiles\(id\)/i);
  assert.match(migration, /foreign key \(conversation_id, identity_id, owner_user_id\)/i);
  assert.match(migration, /unique \(conversation_id, owner_user_id, idempotency_key\)/i);
  assert.match(migration, /alter table ai_network\.ai_bot_conversations enable row level security/i);
  assert.match(migration, /alter table ai_network\.ai_bot_conversation_turns enable row level security/i);
  assert.match(migration, /revoke all on table ai_network\.ai_bot_conversations[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete[\s\S]*to service_role/i);
  assert.match(migration, /current_user <> 'service_role'/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path\s*=\s*''/i);
  assert.doesNotMatch(migration, /grant\s+usage\s+on\s+schema\s+ai_network\s+to\s+(public|anon|authenticated)/i);
});

test('conversation RPC scopes every command by owner and linked Bot Lab identity', () => {
  for (const command of ['create_conversation','list_conversations','get_conversation','archive_conversation','start_turn','complete_turn','fail_turn','usage_today']) {
    assert.ok(migration.includes("'" + command + "'"), 'RPC command ' + command + ' is present');
  }
  assert.match(migration, /p\.extra_profile_data->>'source' = 'bot_personality_laboratory'/);
  assert.match(migration, /p\.extra_profile_data->>'bot_id' = v_conversation\.bot_id::text/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /failure_code = 'interrupted'[\\s\\S]*started_at < now\\(\\) - interval '2 minutes'/);
  assert.match(migration, /where c\\.conversation_id = v_conversation_id and c\\.owner_user_id = p_actor_user_id\\s+for update/i);
  assert.match(migration, /reserved_tokens/);
  assert.match(migration, /daily AI token budget/i);
  assert.match(migration, /length\(v_user_message\) > 4000/);
  assert.match(migration, /length\(v_assistant_message\) > 12000/);
});

test('private runtime allowlists the conversation RPC without changing its custom authentication guard', () => {
  assert.match(runtime, /"ai_conversation_command"/);
  assert.match(runtime, /supportedConversationCommands[\s\S]*"start_turn"[\s\S]*"complete_turn"[\s\S]*"usage_today"/);
  assert.match(runtime, /admin\.rpc\("minglora_ai_conversation_command"/);
  assert.match(runtime, /Credentials and secrets cannot be stored in AI conversations/);
  assert.match(runtime, /if \(action === "ai_conversation_command"\)/);
});

test('server routes remain behind designated-admin MFA and verify owner bot linkage before generation', () => {
  const start = server.indexOf("if (p === '/api/ai-network' || p.startsWith('/api/ai-network/'))");
  const next = server.indexOf("\n  if (p === '/api/", start + 20);
  assert.ok(start >= 0 && next > start, 'AI Network route exists');
  const route = server.slice(start, next);
  assert.match(route, /isDesignatedCreatorHubAdmin\(user\)/);
  assert.match(route, /hasActiveReviewerSession\(user\)/);
  assert.match(route, /runAIConversationCommand\('create_conversation'/);
  assert.match(route, /runAIConversationCommand\('start_turn'/);
  assert.match(route, /generateOpenAIBotConversation\(/);
  assert.match(route, /probeOpenAIProvider\(/);
  assert.match(route, /bot\.ownerId === user\.id/);
  assert.match(route, /bot\.identityLinkStatus === 'linked'/);
  assert.match(route, /memoryAccess\?\.settings\?\.memory_enabled === true/);
  assert.match(route, /availableTokens = Math\.max\(0, dailyTokenLimit - creatorTokensUsed\)/);
  assert.match(route, /parts\.length === 1/);
  assert.match(route, /turns/);
});

test('admin UI labels bots and displays only owner-scoped manually initiated conversations', () => {
  assert.match(ui, /renderAIConversationCenter\(bots\)/);
  assert.match(ui, /data-ai-form="conversation-create"/);
  assert.match(ui, /data-ai-form="conversation-turn"/);
  assert.match(ui, /AI BOT/);
  assert.match(ui, /Owner-only, human-initiated conversations/);
  assert.match(ui, /manualDraftsAvailable/);
  assert.match(ui, /No posts, messages to other members or external actions are sent/);
  assert.match(ui, /archive-conversation/);
});
