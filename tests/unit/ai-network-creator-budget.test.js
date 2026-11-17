import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAICreatorJob,
  ensureAICollections,
  getAICreatorDailyUsage,
  startAICreatorJobGeneration
} from '../../backend/modules/ai-network/service.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20261117104500_minglora_creator_studio_shared_budget.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const chatMigration = read('supabase/migrations/20261117102355_minglora_ai_bot_message_order.sql');

test('Creator Studio has separate service-only reservations and measured usage without synthetic bot identities', () => {
  for (const table of [
    'ai_creator_studio_daily_token_reservations',
    'ai_creator_studio_usage_events'
  ]) {
    assert.ok(migration.includes('create table if not exists ai_network.' + table), 'missing ' + table);
    assert.ok(migration.includes('alter table ai_network.' + table + ' enable row level security'), 'RLS missing ' + table);
    assert.ok(migration.includes('revoke all on table ai_network.' + table + ' from public,anon,authenticated'), 'browser grants not revoked ' + table);
  }
  assert.match(migration, /references ai_network\.ai_bot_daily_token_budgets\(owner_user_id,usage_date\)/i);
  assert.match(migration, /unique index if not exists ai_creator_studio_reservations_active_job_uidx/i);
  assert.doesNotMatch(migration, /insert into ai_network\.ai_identities/i);
  assert.doesNotMatch(migration, /auth\.users/i);
});

test('chat and Creator Studio share the same locked owner/day budget accounting', () => {
  assert.match(migration, /if v_action='creator_begin_request' then/i);
  assert.match(migration, /if v_action='creator_complete_request' then/i);
  assert.match(migration, /if v_action='creator_fail_request' then/i);
  assert.match(migration, /ai_creator_studio_usage_events/i);
  assert.match(migration, /ai_creator_studio_daily_token_reservations/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /shared daily AI token budget/i);
  assert.match(migration, /reservationOverrun/i);
  assert.equal((migration.match(/join ai_network\\.ai_bot_chat_requests q/g) || []).length, 3,
    'get_usage, Creator Studio reserve and chat reserve must ignore expired chat leases');
  assert.equal((migration.match(/from ai_network\\.ai_bot_daily_token_budgets b[\\s\\S]{0,180}?for update/gi) || []).length, 6,
    'both workloads must serialize reserve and settlement on the same owner/day budget row');
  assert.match(migration, /lease_expires_at>v_now/i);
  assert.match(chatMigration, /ai_bot_daily_token_budgets[\s\S]*?for update/i);
});

test('private Edge gateway accepts only the Creator Studio budget actions and validates IDs', () => {
  assert.match(runtime, /"creator_begin_request", "creator_complete_request", "creator_fail_request"/);
  assert.match(runtime, /creatorBudgetActions/);
  assert.match(runtime, /payload\.job_id/);
  assert.match(runtime, /admin\.rpc\("minglora_ai_bot_chat_command"/);
});

test('Supabase-backed Creator Studio reserves, settles and releases shared budget usage', () => {
  for (const action of ['creator_begin_request', 'creator_complete_request', 'creator_fail_request']) {
    assert.ok(server.includes("runAIBotChatCommand('" + action + "'"), 'missing server call: ' + action);
  }
  assert.match(server, /relationalCreatorBudget/);
  assert.match(server, /creatorDailyUsage\.tokensUsed/);
  assert.match(server, /providerBudgetLedgeredAt/);
  assert.match(server, /crypto\.randomUUID\(\)/);
});

test('legacy Creator Studio usage excludes generations already recorded in the relational ledger', () => {
  const now = new Date('2026-11-17T10:00:00.000Z');
  const db = ensureAICollections({});
  const legacy = createAICreatorJob(db, 'owner-1', {
    taskType: 'caption_draft',
    brief: 'Write a useful caption for a new creator post.'
  }, { now });
  legacy.providerCompletedAt = now.toISOString();
  legacy.providerUsage = { input_tokens: 25, output_tokens: 35, total_tokens: 60 };

  const linked = createAICreatorJob(db, 'owner-1', {
    taskType: 'content_outline',
    brief: 'Create an outline for an educational creator video.'
  }, { now });
  linked.providerCompletedAt = now.toISOString();
  linked.providerUsage = { input_tokens: 40, output_tokens: 20, total_tokens: 60 };
  linked.providerBudgetLedgeredAt = true;

  const usage = getAICreatorDailyUsage(db, 'owner-1', { now });
  assert.equal(usage.tokensUsed, 60);
  assert.equal(usage.draftsWithTokenUsage, 1);

  const requestId = '6f3f9c40-85fb-4a0b-a1e0-8e4e4e230f51';
  const started = startAICreatorJobGeneration(db, 'owner-1', legacy.id, { now, budgetRequestId: requestId });
  assert.equal(started.providerBudgetRequestId, requestId);
  assert.equal(started.providerBudgetLedgeredAt, false);
  // Keep this fixture independent of the active-generation lease guard so the
  // malformed budget request ID is the failure being asserted.
  started.providerExecution = 'failed';
  assert.throws(() => startAICreatorJobGeneration(db, 'owner-1', linked.id, {
    now, budgetRequestId: 'not-a-uuid'
  }), { status: 400 });
});
