import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261114150000_minglora_ai_hr_talent_management.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('HR talent records are additive, private and service-role only', () => {
  for (const table of [
    'ai_performance_reviews',
    'ai_performance_review_history',
    'ai_succession_plans',
    'ai_succession_plan_history',
    'ai_employee_promotions'
  ]) {
    assert.ok(migration.includes('create table if not exists ai_network.' + table), 'Missing table ' + table);
    assert.ok(migration.includes('alter table ai_network.' + table + ' enable row level security'), 'RLS missing for ' + table);
    assert.ok(migration.includes(' on ai_network.' + table + ' to service_role'), 'Service-role grant missing for ' + table);
  }
  assert.ok(migration.includes('security invoker'));
  assert.ok(migration.includes("current_user <> 'service_role'"));
  assert.ok(migration.includes("set search_path = ''"));
  assert.ok(migration.includes('revoke all on function public.minglora_ai_hr_talent_command'));
  assert.ok(migration.includes('from public,anon,authenticated'));
  assert.ok(migration.includes('grant execute on function public.minglora_ai_hr_talent_command'));
  assert.ok(migration.includes('to service_role'));
  assert.ok(!migration.includes('grant usage on schema ai_network to anon'));
  assert.ok(!migration.includes('grant usage on schema ai_network to authenticated'));
  assert.ok(!migration.includes('insert into auth.users'));
  assert.ok(!migration.includes('grant usage on schema ai_network to public'));
});

test('performance reviews are human-authored, bounded, idempotent and audited', () => {
  for (const token of [
    'reviewer_user_id uuid not null references public.profiles(id)',
    'rating numeric(3,2) not null check (rating between 1 and 5)',
    "outcome in ('continue','promotion_consideration','improvement_plan','role_change')",
    "review_status in ('submitted','finalized','withdrawn')",
    'review_period_end >= review_period_start',
    'ai_performance_reviews_idempotency_uq',
    "'Human-authored review submitted.'",
    "'review_finalized'",
    "r.review_status='submitted'",
    "e.employment_status='active'",
    'strengths,improvement_areas,goals'
  ]) assert.ok(migration.includes(token), 'Missing performance review rule: ' + token);
  assert.ok(migration.includes('p_actor_user_id=v_organization_id') === false);
  assert.ok(migration.includes('o.owner_user_id=p_actor_user_id'));
});

test('promotion requires an active employee and a strictly higher-ranked role', () => {
  for (const token of [
    "v_previous_status<>'active'",
    'v_target_rank<=v_current_rank',
    "d.status='active'",
    "r.review_status='finalized'",
    "r.outcome in ('promotion_consideration','role_change')",
    "'transfer_employee'",
    "'promotion:'||v_idempotency_key",
    "'promoted'",
    'ai_employee_promotions'
  ]) assert.ok(migration.includes(token), 'Missing promotion invariant: ' + token);
});

test('succession plans only document readiness and never appoint or promote a successor', () => {
  for (const token of [
    "readiness_level in ('ready_now','within_6_months','within_1_year','development_required')",
    "plan_status in ('draft','active','completed','cancelled')",
    "v_candidate_rank>=v_target_rank",
    "'succession_plan_created'",
    "'succession_plan_activated'",
    "'succession_plan_completed'",
    "'succession_plan_cancelled'",
    "'create_succession_plan'",
    "'update_succession_plan'"
  ]) assert.ok(migration.includes(token), 'Missing succession rule: ' + token);
  assert.ok(!migration.includes("minglora_ai_hr_command(\n      'appoint_employee'"));
  assert.ok(!migration.includes("minglora_ai_hr_command(\n      'promote_employee'"));
});

test('private runtime gateway exposes only the explicit HR talent command allowlist', () => {
  for (const token of [
    '"ai_hr_talent_command"',
    '"list_performance_reviews"',
    '"create_performance_review"',
    '"finalize_performance_review"',
    '"list_succession_plans"',
    '"create_succession_plan"',
    '"update_succession_plan"',
    '"list_promotions"',
    '"promote_employee"',
    'admin.rpc("minglora_ai_hr_talent_command"',
    'validUuid(actorUserId)',
    'validUuid(String(payload.organization_id || ""))'
  ]) assert.ok(runtime.includes(token), 'Missing private runtime gateway element: ' + token);
});

test('HTTP endpoints require authorized platform staff and route to the private runtime', () => {
  for (const token of [
    'const runAIHRTalentCommand = async',
    "isModerator(user, req)",
    "requestSupabaseState('ai_hr_talent_command'",
    "['performance-reviews', 'succession-plans', 'promotions']",
    "'list_performance_reviews'",
    "'create_performance_review'",
    "'finalize_performance_review'",
    "'list_succession_plans'",
    "'create_succession_plan'",
    "'update_succession_plan'",
    "'list_promotions'",
    "action === 'promote'",
    "runAIHRTalentCommand(command, input)"
  ]) assert.ok(server.includes(token), 'Missing HR talent API element: ' + token);
  assert.ok(server.includes('The AI HR talent migration and private runtime gateway must be deployed'));
});

test('HR workspace renders and submits review, promotion and succession operations', () => {
  for (const token of [
    "request(base + '/performance-reviews')",
    "request(base + '/succession-plans')",
    "request(base + '/promotions')",
    'Promise.allSettled',
    'talentUnavailable',
    'data-ai-form="employee-promotion"',
    'data-ai-form="performance-review"',
    'data-ai-form="performance-review-finalize"',
    'data-ai-form="succession-plan"',
    'data-ai-form="succession-status"',
    "kind === 'employee-promotion'",
    "kind === 'performance-review'",
    "kind === 'performance-review-finalize'",
    "kind === 'succession-plan'",
    "kind === 'succession-status'",
    'review_period_start',
    'improvement_areas',
    'role_position_id',
    'successor_employment_id',
    'Succession plan saved as a draft; no employee was appointed or promoted.'
  ]) assert.ok(ui.includes(token), 'Missing HR talent UI element: ' + token);
  assert.ok(ui.includes("split(/\\r?\\n/)"));
  assert.ok(ui.includes("'performance-review-finalize','succession-status'"));
});
