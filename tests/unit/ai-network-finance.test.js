import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261115110000_minglora_ai_finance_governance.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');
const readme = read('backend/modules/ai-network/README.md');

test('finance policies, audit history and usage ledger are relational, private and RLS protected', () => {
  for (const table of ['ai_finance_budget_policies','ai_finance_budget_history','ai_finance_usage_ledger']) {
    assert.ok(migration.includes('create table if not exists ai_network.' + table));
    assert.ok(migration.includes('alter table ai_network.' + table + ' enable row level security'));
    assert.ok(migration.includes('revoke all on table ai_network.' + table + ' from public,anon,authenticated'));
  }
  assert.ok(migration.includes('grant select,insert,update on ai_network.ai_finance_budget_policies to service_role'));
  assert.ok(migration.includes('grant select,insert on ai_network.ai_finance_budget_history to service_role'));
  assert.ok(migration.includes('grant select,insert on ai_network.ai_finance_usage_ledger to service_role'));
  assert.ok(migration.includes('revoke all on function public.minglora_ai_finance_command(text,uuid,jsonb)'));
  assert.ok(migration.includes('grant execute on function public.minglora_ai_finance_command(text,uuid,jsonb) to service_role'));
});

test('budget policies support owner, organization, department and identity scopes with unique scoped rows', () => {
  for (const scope of ['owner','organization','department','identity']) {
    assert.ok(migration.includes("scope_type='" + scope + "'"));
  }
  for (const index of [
    'ai_finance_budget_owner_uq','ai_finance_budget_org_uq',
    'ai_finance_budget_department_uq','ai_finance_budget_identity_uq'
  ]) assert.ok(migration.includes('create unique index if not exists ' + index));
  assert.ok(migration.includes('daily_token_limit bigint'));
  assert.ok(migration.includes('monthly_spend_limit_usd numeric'));
  assert.ok(migration.includes('monthly_cpu_milliseconds_limit bigint'));
  assert.ok(migration.includes('monthly_gpu_milliseconds_limit bigint'));
  assert.ok(migration.includes('monthly_memory_mb_minutes_limit bigint'));
  assert.ok(migration.includes('monthly_storage_byte_hours_limit bigint'));
  assert.ok(migration.includes('max_concurrent_tasks integer'));
});

test('budget changes are owner-scoped, serialized and audited with immutable history', () => {
  assert.ok(migration.includes("if v_org is not null and not exists(select 1 from ai_network.ai_organizations o where o.organization_id=v_org and o.owner_user_id=p_actor_user_id)"));
  assert.ok(migration.includes("AI identity is not owned by this Minglora administrator."));
  assert.ok(migration.includes('pg_advisory_xact_lock'));
  assert.ok(migration.includes('ai_finance_budget_history'));
  assert.ok(migration.includes('length(v_reason)<10'));
  assert.ok(migration.includes("v_policy->>'policy_status'"));
  assert.ok(migration.includes('before update or delete on ai_network.ai_finance_budget_history'));
});

test('task creation and approval queue transitions enforce active token, spend and concurrency policies', () => {
  assert.ok(migration.includes('create or replace function ai_network.enforce_ai_finance_task_budget()'));
  assert.ok(migration.includes('before insert or update on ai_network.ai_task_queue'));
  assert.ok(migration.includes("new.status not in ('queued','running')"));
  assert.ok(migration.includes('The AI task would exceed an applicable daily token budget.'));
  assert.ok(migration.includes('The AI task would exceed an applicable monthly spend budget.'));
  assert.ok(migration.includes('The AI task would exceed an applicable concurrent-task limit.'));
  assert.ok(migration.includes('An applicable AI finance budget is paused; no new task was accepted.'));
  assert.ok(migration.includes("q.status in ('pending_approval','queued','running')"));
});

test('usage ledger is measured, idempotent, owner-linked and append-only', () => {
  assert.ok(migration.includes('unique(owner_user_id,source_event_id)'));
  assert.ok(migration.includes('generated always as (input_tokens + output_tokens) stored'));
  assert.ok(migration.includes('actual_cost_usd numeric'));
  assert.ok(migration.includes('source_event_id text not null'));
  assert.ok(migration.includes('provider_assignment_id is not null'));
  assert.ok(migration.includes('Provider assignment does not belong to the selected AI identity.'));
  assert.ok(migration.includes('Task does not belong to this owner and AI identity.'));
  assert.ok(migration.includes('Usage source event ID was reused with different measured values.'));
  assert.ok(migration.includes('v_existing.provider_assignment_id is distinct from v_assignment'));
  assert.ok(migration.includes('v_existing.metadata is distinct from v_metadata'));
  assert.ok(migration.includes('before update or delete on ai_network.ai_finance_usage_ledger'));
  assert.ok(migration.includes("if v_to<=v_from or v_to-v_from>interval '90 days' or v_limit<1 or v_limit>200"));
  assert.ok(migration.includes('Credentials and secrets are not allowed in AI finance data.'));
});

test('private runtime gateway allowlists only the four supported finance commands', () => {
  const globalStart = runtime.indexOf('const supportedActions = [');
  const globalEnd = runtime.indexOf('];', globalStart);
  const globalAllowlist = runtime.slice(globalStart, globalEnd);
  assert.ok(globalAllowlist.includes('"ai_finance_command"'));
  const handlerStart = runtime.indexOf('if (action === "ai_finance_command")');
  const handlerEnd = runtime.indexOf('if (action === "ai_task_command")', handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  const handler = runtime.slice(handlerStart, handlerEnd);
  for (const action of ['list_budgets','set_budget','list_usage','record_usage']) {
    assert.ok(handler.includes('"' + action + '"'));
  }
  assert.ok(handler.includes('admin.rpc("minglora_ai_finance_command"'));
  assert.ok(handler.includes('Credentials and secrets are not allowed in AI usage records.'));
});

test('Node API finance management is limited to the signed-in designated administrator', () => {
  const start = server.indexOf("if (p === '/api/ai-network'");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  const helperStart = route.indexOf('const runAIFinanceCommand = async');
  const helperEnd = route.indexOf('const runAIHRCommand = async', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helper = route.slice(helperStart, helperEnd);
  assert.ok(helper.includes('isModerator(user, req)'));
  assert.ok(helper.includes("requestSupabaseState('ai_finance_command'"));
  assert.ok(helper.includes("['list_budgets','set_budget','list_usage']"));
  assert.ok(!helper.includes("'record_usage'"));
  assert.ok(route.includes("parts[1] === 'budgets'"));
  assert.ok(route.includes("parts[1] === 'usage'"));
});

test('Finance & Resource Center displays only ledger data and submits scoped audited policy changes', () => {
  for (const token of [
    'async function loadAIFinanceRegistry',
    "request('/finance/budgets')",
    "request('/finance/usage')",
    'function renderAIFinanceCenter()',
    "data-ai-form=\"finance-budget\"",
    "path = '/finance/budgets'",
    'payload.scope_type = value(\\'scopeType\\')',
    'payload.reason = value(\\'reason\\')',
    'state.financeUsage',
    'No provider or resource usage events have been recorded',
    "renderAIFinanceCenter()"
  ]) assert.ok(ui.includes(token), 'Missing finance UI behavior: ' + token);
  assert.ok(readme.includes('GET /api/ai-network/finance/budgets'));
  assert.ok(readme.includes('GET /api/ai-network/finance/usage'));
  assert.ok(readme.includes('Usage events'));
  assert.ok(readme.includes('Workers remain globally paused'));
});
