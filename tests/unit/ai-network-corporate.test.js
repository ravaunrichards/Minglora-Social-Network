import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const migration = read('supabase/migrations/20261113112000_minglora_ai_corporate_workforce_foundation.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('corporate schema stays private and server-only', () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /current_user\s*<>\s*'service_role'/i);
  assert.match(migration, /revoke all on function public\.minglora_ai_organization_command[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.minglora_ai_organization_command[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /grant\s+usage\s+on\s+schema\s+ai_network\s+to\s+(public|anon|authenticated)/i);
  for (const table of ['ai_organizations','ai_department_templates','ai_departments','ai_position_templates','ai_positions','ai_employment_records','ai_employment_history']) {
    assert.match(migration, new RegExp('create table if not exists ai_network\\.' + table, 'i'));
    assert.match(migration, new RegExp('alter table ai_network\\.' + table + ' enable row level security', 'i'));
  }
});

test('all twenty required department templates are present without creating an organization', () => {
  const start = migration.indexOf('insert into ai_network.ai_department_templates');
  const end = migration.indexOf('on conflict (template_key) do nothing', start);
  assert.ok(start >= 0 && end > start, 'Department template seed section is required.');
  const section = migration.slice(start, end);
  const keys = [...section.matchAll(/\('([a-z_]+)'\s*,/g)].map(match => match[1]);
  assert.equal(keys.length, 20);
  for (const key of [
    'executive_management','finance_accounting','human_resources','resource_management',
    'operations','technology_engineering','ai_research','cybersecurity_it','legal_compliance',
    'marketing_advertising','sales_business_development','customer_support','community_management',
    'content_creator_management','product_management','quality_assurance','logistics_procurement',
    'training_development','public_relations','risk_management'
  ]) assert.ok(keys.includes(key), 'Missing department template: ' + key);
  assert.match(migration, /insert into ai_network\.ai_department_templates[\s\S]*on conflict \(template_key\) do nothing/i);
});

test('organization creation is owner-scoped and retry-safe', () => {
  assert.match(migration, /owner_user_id uuid not null references public\.profiles\(id\)/i);
  assert.match(migration, /unique index if not exists ai_organizations_owner_slug_uq/i);
  assert.match(migration, /ai_organizations_owner_idempotency_uq/i);
  assert.match(migration, /on conflict \(owner_user_id,idempotency_key\)[\s\S]*do nothing/i);
  assert.match(migration, /where o\.owner_user_id=p_actor_user_id/i);
  assert.match(migration, /v_action\s*=\s*'create_departments'/i);
  assert.match(migration, /v_action\s*=\s*'create_positions'/i);
  assert.match(migration, /ai_employment_records/i);
  assert.match(migration, /ai_employment_history/i);
});

test('runtime gateway allowlists and validates corporate organization commands', () => {
  assert.match(runtime, /"ai_organization_command"/);
  assert.match(runtime, /supportedOrganizationCommands\s*=\s*\[[\s\S]*"create_organization"[\s\S]*"create_departments"[\s\S]*"create_positions"/i);
  assert.match(runtime, /validUuid\(actorUserId\)/);
  assert.match(runtime, /admin\.rpc\("minglora_ai_organization_command"/);
});

test('Node API requires a signed-in member and routes through the trusted runtime', () => {
  const route = server.slice(server.indexOf("if (p === '/api/ai-network'"), server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')"));
  assert.match(route, /requireAuth\(user\)/);
  assert.match(route, /requestSupabaseState\('ai_organization_command'/);
  for (const path of ['department-templates','position-templates','organizations']) {
    assert.ok(route.includes("sub === '" + path + "'"), 'Missing organization route: ' + path);
  }
  assert.match(route, /'create_organization'/);
  assert.match(route, /'create_departments'/);
  assert.match(route, /'create_positions'/);
  assert.match(route, /organizationId/);
  assert.match(route, /isSupabasePersistence\(\)/);
  assert.match(route, /No corporate data was changed/);
});

test('AI workspace displays actual organization records and provisions template sets', () => {
  assert.match(ui, /request\('\/organizations'\)/);
  assert.match(ui, /request\('\/department-templates'\)/);
  assert.match(ui, /request\('\/position-templates'\)/);
  assert.match(ui, /data-ai-form="organization"/);
  assert.match(ui, /data-ai-form="organization-departments"/);
  assert.match(ui, /data-ai-form="organization-positions"/);
  assert.match(ui, /payload\.organization_name/);
  assert.match(ui, /payload\.idempotency_key/);
  assert.match(ui, /state\.departmentTemplates\.map/);
  assert.match(ui, /state\.positionTemplates\.map/);
  assert.match(ui, /record\.department_count/);
  assert.match(ui, /record\.position_count/);
  assert.match(ui, /Recruitment, employee appointments, reporting-chain changes/);
});
