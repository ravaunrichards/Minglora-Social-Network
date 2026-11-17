import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20261117070000_minglora_ai_bot_conversations.sql');
const messageOrderMigration = read('supabase/migrations/20261117102355_minglora_ai_bot_message_order.sql');
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
  assert.match(runtime, /const creatorBudgetActions = \["creator_begin_request", "creator_complete_request", "creator_fail_request"\]/);
  assert.match(runtime, /const supported = \["get_conversation", "get_usage", "begin_request", "complete_request", "fail_request", \.\.\.creatorBudgetActions\]/);
  assert.match(runtime, /admin\.rpc\("minglora_ai_bot_chat_command"/);
  assert.match(runtime, /Credentials and secrets cannot be stored in AI bot conversations/);
});

test('Supabase-backed server persists relational chat while local JSON mode retains existing path', () => {
  assert.match(server, /requestSupabaseState\('ai_bot_chat_command'/);
  assert.match(server, /runAIBotChatCommand\('begin_request'/);
  assert.match(server, /runAIBotChatCommand\('complete_request'/);
  assert.match(server, /runAIBotChatCommand\('fail_request'/);
  assert.match(server, /runAIBotChatCommand\('get_usage'/);
  assert.match(server, /runAIProviderExecutionCommand\(\s*'resolve_execution'/);
  assert.ok(server.indexOf("runAIProviderExecutionCommand(") < server.indexOf("runAIBotChatCommand('begin_request'"));
  assert.match(server, /loadRelationalAIBotChatState/);
  assert.match(server, /await saveStore\(\)/);
});

test('bot chat recalls only owner-consented memory and accounts for bounded memory context in its reservation', () => {
  assert.match(server, /const loadAIBotMemoryContext = async identityId/);
  assert.match(server, /runAIMemoryCommand\('list', \{ identity_id: identityId \}\)/);
  assert.match(server, /settings\.memory_enabled === true && Boolean\(settings\.consented_at\)/);
  assert.match(server, /settings\.long_term_enabled === true/);
  assert.match(server, /history,/);
  assert.match(server, /memoryContext,/);
  assert.match(server, /generateAIProviderReply\(\{\s*assignment: providerAssignment/);
  assert.match(server, /memoryContextLength/);
  assert.match(doc, /explicit memory opt-in and a recorded consent timestamp/i);
  assert.match(doc, /does not automatically create, update or summarize memory entries/i);
});

test('AI bot chat migration indexes every child-side foreign key lookup', () => {
  const indexes = [
    'ai_bot_conversations_identity_idx',
    'ai_bot_conversations_owner_user_idx',
    'ai_bot_chat_requests_identity_idx',
    'ai_bot_chat_requests_conversation_owner_bot_identity_idx',
    'ai_bot_chat_requests_requested_conversation_owner_bot_identity_idx',
    'ai_bot_conversation_messages_identity_idx',
    'ai_bot_conversation_messages_conversation_owner_bot_identity_idx',
    'ai_bot_conversation_messages_request_owner_bot_identity_idx',
    'ai_bot_usage_events_conversation_owner_bot_identity_idx',
    'ai_bot_usage_events_request_owner_bot_identity_idx',
    'ai_bot_daily_token_reservations_identity_idx',
    'ai_bot_daily_token_reservations_request_owner_bot_identity_idx'
  ];
  for (const name of indexes) {
    assert.ok(migration.includes('create index if not exists ' + name), 'missing covering index ' + name);
  }
  assert.ok(migration.includes('create index if not exists ai_bot_conversations_owner_user_idx\n on ai_network.ai_bot_conversations(owner_user_id);'));
});

test('chat messages use stable per-conversation sequence numbers instead of timestamp or UUID ordering', () => {
  for (const fragment of [
    'add column if not exists sequence_no bigint',
    'row_number() over',
    'unique (conversation_id,sequence_no)',
    "v_conversation.message_count::bigint+1,'user'",
    "v_conversation.message_count::bigint+2,'assistant'",
    'order by m.sequence_no desc limit 20',
    'jsonb_agg(q.item order by q.sequence_no)',
    "'sequenceNo',m.sequence_no"
  ]) {
    assert.ok(messageOrderMigration.includes(fragment), 'missing sequence-order migration fragment: ' + fragment);
  }
});

test('chat RPC now aggregates Creator Studio reservations and measured usage through the shared owner/day ledger', () => {
  const sharedMigration = read('supabase/migrations/20261117104500_minglora_creator_studio_shared_budget.sql');
  assert.match(sharedMigration, /ai_creator_studio_usage_events/i);
  assert.match(sharedMigration, /ai_creator_studio_daily_token_reservations/i);
  assert.match(sharedMigration, /creator_begin_request/i);
  assert.match(sharedMigration, /creator_complete_request/i);
  assert.match(sharedMigration, /creator_fail_request/i);
  assert.match(sharedMigration, /for update/i);
});

test('documentation records the applied production foundation and outstanding acceptance gates', () => {
  assert.match(doc, /migration is applied in production/i);
  assert.match(doc, /ACTIVE version 132/i);
  assert.match(doc, /service-role-only EXECUTE/i);
  assert.match(doc, /Creator Studio usage is still reported as a baseline/i);
  assert.match(doc, /no 10-billion or multi-region capacity is claimed/i);
});
