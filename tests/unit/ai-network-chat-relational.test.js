import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20261117070000_minglora_ai_bot_conversations.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const doc = read('docs/AI_BOT_CHAT_RUNTIME.md');

test('bot chat uses six normalized owner-scoped tables with RLS and browser privileges revoked', () => {
  for (const table of [
    'ai_bot_conversations','ai_bot_chat_requests','ai_bot_conversation_messages',
    'ai_bot_usage_events','ai_bot_daily_token_budgets','ai_bot_daily_token_reservations'
  ]) {
    assert.ok(migration.includes('create table if not exists ai_network.' + table), 'missing ' + table);
    assert.ok(migration.includes('alter table ai_network.' + table + ' enable row level security'), 'RLS missing ' + table);
    assert.ok(migration.includes('revoke all on table ai_network.' + table + ' from public,anon,authenticated'), 'browser grants not revoked ' + table);
  }
  assert.match(migration, /unique \(request_id,role\)/i);
  assert.match(migration, /unique \(request_id,attempt_count\)/i);
  assert.match(migration, /lease_expires_at/);
  assert.match(migration, /for update/i);
});

test('chat RPC enforces service role, owner scope, idempotency and daily token reservations', () => {
  assert.match(migration, /create or replace function public\.minglora_ai_bot_chat_command/i);
  assert.match(migration, /security invoker[\s\S]*?set search_path = ''/i);
  assert.match(migration, /current_user <> 'service_role'/i);
  assert.match(migration, /v_identity_owner<>p_actor_user_id/i);
  assert.match(migration, /revoke all on function public\.minglora_ai_bot_chat_command\(text,uuid,jsonb\) from public,anon,authenticated/i);
  assert.match(migration, /grant execute on function public\.minglora_ai_bot_chat_command\(text,uuid,jsonb\) to service_role/i);
  assert.match(migration, /status='reserved'/i);
  assert.match(migration, /status='settled'/i);
  assert.match(migration, /status='released'/i);
});

test('private Edge gateway has a narrow bot-chat command allowlist and rejects secrets', () => {
  assert.match(runtime, /"ai_bot_chat_command"/);
  assert.match(runtime, /const supported = \["get_conversation", "get_usage", "begin_request", "complete_request", "fail_request"\]/);
  assert.match(runtime, /admin\.rpc\("minglora_ai_bot_chat_command"/);
  assert.match(runtime, /Credentials and secrets cannot be stored in AI bot conversations/);
});

test('Supabase-backed server persists relational chat while local JSON mode retains existing path', () => {
  assert.match(server, /requestSupabaseState\('ai_bot_chat_command'/);
  assert.match(server, /runAIBotChatCommand\('begin_request'/);
  assert.match(server, /runAIBotChatCommand\('complete_request'/);
  assert.match(server, /runAIBotChatCommand\('fail_request'/);
  assert.match(server, /runAIBotChatCommand\('get_usage'/);
  assert.match(server, /loadRelationalAIBotChatState/);
  assert.match(server, /await saveStore\(\)/);
});

test('bot chat recalls only owner-consented memory and accounts for bounded memory context in its reservation', () => {
  assert.match(server, /const loadAIBotMemoryContext = async identityId/);
  assert.match(server, /runAIMemoryCommand\('list', \{ identity_id: identityId \}\)/);
  assert.match(server, /settings\.memory_enabled === true && Boolean\(settings\.consented_at\)/);
  assert.match(server, /settings\.long_term_enabled === true/);
  assert.match(server, /history, memoryContext, env: process\.env/);
  assert.match(server, /memoryContextLength/);
  assert.match(doc, /explicit memory opt-in and a recorded consent timestamp/i);
  assert.match(doc, /does not automatically create, update or summarize memory entries/i);
});

test('documentation does not claim the new migration or Edge runtime is deployed', () => {
  assert.match(doc, /have \*\*not\*\* been applied or deployed/i);
  assert.match(doc, /Creator Studio usage is still reported as a baseline/i);
  assert.match(doc, /no 10-billion or multi-region capacity is claimed/i);
});
