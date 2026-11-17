import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261115110000_minglora_ai_finance_governance.sql'),
  'utf8'
);
const databaseUrl = process.env.AI_NETWORK_TEST_DATABASE_URL;
let pool;

async function installFixture() {
  await pool.query(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT service_role TO postgres;

    CREATE TABLE public.profiles (id uuid PRIMARY KEY);
    CREATE SCHEMA ai_network;

    CREATE TABLE ai_network.ai_organizations (
      organization_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id uuid NOT NULL REFERENCES public.profiles(id)
    );
    CREATE TABLE ai_network.ai_departments (
      department_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES ai_network.ai_organizations(organization_id)
    );
    CREATE TABLE ai_network.ai_identities (
      identity_id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES public.profiles(id),
      created_by_user_id uuid,
      population text,
      category_key text,
      purpose text,
      status text,
      enabled boolean NOT NULL DEFAULT true,
      supervision_level text
    );
    CREATE TABLE ai_network.ai_employment_records (
      employment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES ai_network.ai_organizations(organization_id),
      identity_id uuid NOT NULL REFERENCES ai_network.ai_identities(identity_id),
      department_id uuid REFERENCES ai_network.ai_departments(department_id),
      employment_status text NOT NULL DEFAULT 'active',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE ai_network.ai_provider_models (
      model_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_name text NOT NULL,
      model_identifier text NOT NULL
    );
    CREATE TABLE ai_network.ai_provider_assignments (
      assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      identity_id uuid NOT NULL REFERENCES ai_network.ai_identities(identity_id),
      model_id uuid NOT NULL REFERENCES ai_network.ai_provider_models(model_id)
    );
    CREATE TABLE ai_network.ai_task_queue (
      task_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id uuid NOT NULL REFERENCES public.profiles(id),
      organization_id uuid REFERENCES ai_network.ai_organizations(organization_id),
      identity_id uuid NOT NULL REFERENCES ai_network.ai_identities(identity_id),
      task_title text NOT NULL,
      task_type text NOT NULL,
      action_class text NOT NULL,
      autonomy_mode text NOT NULL,
      requires_approval boolean NOT NULL DEFAULT true,
      status text NOT NULL,
      token_budget bigint NOT NULL DEFAULT 0,
      cost_limit_usd numeric(18,8) NOT NULL DEFAULT 0,
      idempotency_key text NOT NULL,
      created_by_user_id uuid NOT NULL REFERENCES public.profiles(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    GRANT USAGE ON SCHEMA public, ai_network TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai_network TO service_role;
  `);
  await pool.query(migration);
}

async function serviceTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE service_role');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function finance(client, action, actorId, payload = {}) {
  const result = await client.query(
    'SELECT public.minglora_ai_finance_command($1,$2,$3::jsonb) AS result',
    [action, actorId, JSON.stringify(payload)]
  );
  return result.rows[0].result;
}

async function addOwnerFixture() {
  const ownerId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const otherOwnerId = crypto.randomUUID();
  const otherIdentityId = crypto.randomUUID();
  await pool.query('INSERT INTO public.profiles(id) VALUES ($1),($2)', [ownerId, otherOwnerId]);
  await pool.query(
    'INSERT INTO ai_network.ai_identities(identity_id,owner_user_id,created_by_user_id) VALUES ($1,$2,$2),($3,$4,$4)',
    [identityId, ownerId, otherIdentityId, otherOwnerId]
  );
  return { ownerId, identityId, otherOwnerId, otherIdentityId };
}

function ownerBudget(overrides = {}) {
  return {
    scope_type: 'owner',
    daily_token_limit: 1000,
    monthly_spend_limit_usd: 25.5,
    max_concurrent_tasks: 2,
    policy_status: 'active',
    reason: 'Integration test owner budget policy.',
    ...overrides
  };
}

async function insertTask(client, ownerId, identityId, key, { tokens = 10, cost = 0.1, status = 'queued' } = {}) {
  const result = await client.query(
    `INSERT INTO ai_network.ai_task_queue(
       owner_user_id,identity_id,task_title,task_type,action_class,autonomy_mode,
       requires_approval,status,token_budget,cost_limit_usd,idempotency_key,created_by_user_id
     ) VALUES($1,$2,$3,'read_only_analysis','read_only','fully_supervised',true,$4,$5,$6,$7,$1)
     RETURNING task_id`,
    [ownerId, identityId, 'Finance policy integration fixture', status, tokens, cost, key]
  );
  return result.rows[0].task_id;
}

before(async () => {
  assert.ok(databaseUrl, 'AI_NETWORK_TEST_DATABASE_URL must point to the disposable CI PostgreSQL service.');
  pool = new Pool({ connectionString: databaseUrl, max: 8 });
  await installFixture();
});

after(async () => {
  if (pool) await pool.end();
});

test('finance RPC writes owner-scoped budget history and immutable measured usage', async () => {
  const { ownerId, identityId, otherOwnerId } = await addOwnerFixture();
  await serviceTransaction(async client => {
    const created = await finance(client, 'set_budget', ownerId, ownerBudget());
    assert.equal(created.reused, false);
    assert.equal(created.budget.daily_token_limit, 1000);

    const budgets = await finance(client, 'list_budgets', ownerId);
    assert.equal(budgets.policy_count, 1);
    assert.equal(budgets.history.length, 1);
    assert.equal(budgets.history[0].reason, 'Integration test owner budget policy.');

    const payload = {
      identity_id: identityId,
      event_type: 'compute_usage',
      source_event_id: 'finance-ci-source-0001',
      actual_cost_usd: 0.125,
      cpu_milliseconds: 1200,
      memory_mb_minutes: 16,
      storage_byte_hours: 256,
      occurred_at: '2026-11-17T12:00:00Z',
      metadata: { test: 'disposable-postgres' }
    };
    const first = await finance(client, 'record_usage', ownerId, payload);
    assert.equal(first.reused, false);
    const duplicate = await finance(client, 'record_usage', ownerId, payload);
    assert.equal(duplicate.reused, true);
    await assert.rejects(
      finance(client, 'record_usage', ownerId, { ...payload, actual_cost_usd: 0.126 }),
      error => error.code === '23505'
    );

    const report = await finance(client, 'list_usage', ownerId, {
      from: '2026-11-17T00:00:00Z',
      to: '2026-11-18T00:00:00Z',
      limit: 20
    });
    assert.equal(Number(report.summary.event_count), 1);
    assert.equal(Number(report.summary.actual_cost_usd), 0.125);
    assert.equal(Number(report.summary.cpu_milliseconds), 1200);

    const otherBudgets = await finance(client, 'list_budgets', otherOwnerId);
    assert.equal(otherBudgets.policy_count, 0);
    await assert.rejects(
      finance(client, 'record_usage', otherOwnerId, {
        ...payload,
        source_event_id: 'finance-ci-source-0002'
      }),
      error => error.code === '42501'
    );

    await assert.rejects(
      client.query(
        `UPDATE ai_network.ai_finance_usage_ledger
            SET actual_cost_usd = 0.25
          WHERE owner_user_id = $1 AND source_event_id = $2`,
        [ownerId, payload.source_event_id]
      ),
      error => error.code === '42501'
    );
  });
  const { rows } = await pool.query(
    'SELECT count(*)::integer AS events FROM ai_network.ai_finance_usage_ledger WHERE source_event_id = $1',
    ['finance-ci-source-0001']
  );
  assert.equal(rows[0].events, 1);
});

test('finance task trigger enforces daily tokens, monthly spend, concurrency and paused policies', async () => {
  const { ownerId, identityId } = await addOwnerFixture();
  await serviceTransaction(async client => {
    await finance(client, 'set_budget', ownerId, ownerBudget({ max_concurrent_tasks: 2 }));

    await assert.rejects(
      insertTask(client, ownerId, identityId, 'finance-ci-over-token-budget', { tokens: 1001 }),
      error => error.code === '22023'
    );
    await assert.rejects(
      insertTask(client, ownerId, identityId, 'finance-ci-over-spend-budget', { tokens: 1, cost: 30 }),
      error => error.code === '22023'
    );

    await insertTask(client, ownerId, identityId, 'finance-ci-within-cap-1');
    await insertTask(client, ownerId, identityId, 'finance-ci-within-cap-2');
    await assert.rejects(
      insertTask(client, ownerId, identityId, 'finance-ci-concurrency-cap', { tokens: 1, cost: 0.01 }),
      error => error.code === '22023'
    );

    await finance(client, 'set_budget', ownerId, ownerBudget({ policy_status: 'paused' }));
    await assert.rejects(
      insertTask(client, ownerId, identityId, 'finance-ci-paused-policy', { tokens: 1, cost: 0.01 }),
      error => error.code === '42501'
    );
  });

  const { rows } = await pool.query(
    `SELECT count(*)::integer AS rows
       FROM ai_network.ai_task_queue
      WHERE owner_user_id = $1
        AND idempotency_key IN ('finance-ci-within-cap-1','finance-ci-within-cap-2',
          'finance-ci-concurrency-cap','finance-ci-paused-policy')`,
    [ownerId]
  );
  assert.equal(rows[0].rows, 2);
});
