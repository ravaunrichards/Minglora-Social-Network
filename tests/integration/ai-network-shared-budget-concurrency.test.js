import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const databaseUrl = process.env.AI_NETWORK_TEST_DATABASE_URL;

let pool;

async function installMinimalMingloraFixture() {
  await pool.query(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT service_role TO postgres;

    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY
    );

    CREATE SCHEMA ai_network;

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

    CREATE TABLE ai_network.ai_identity_audit_logs (
      audit_log_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      identity_id uuid NOT NULL REFERENCES ai_network.ai_identities(identity_id),
      actor_type text NOT NULL,
      actor_user_id uuid,
      action text NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    GRANT USAGE ON SCHEMA public, ai_network TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ai_network.ai_identities, ai_network.ai_identity_audit_logs TO service_role;
  `);

  for (const migrationPath of [
    'supabase/migrations/20261117070000_minglora_ai_bot_conversations.sql',
    'supabase/migrations/20261117102355_minglora_ai_bot_message_order.sql',
    'supabase/migrations/20261117104500_minglora_creator_studio_shared_budget.sql'
  ]) {
    await pool.query(read(migrationPath));
  }
}

async function addOwnerFixture() {
  const ownerId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  await pool.query('INSERT INTO public.profiles(id) VALUES ($1)', [ownerId]);
  await pool.query(
    'INSERT INTO ai_network.ai_identities(identity_id, owner_user_id, created_by_user_id) VALUES ($1, $2, $2)',
    [identityId, ownerId]
  );
  return { ownerId, identityId };
}

async function beginAsService(client) {
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE service_role');
}

async function rpc(client, action, ownerId, payload) {
  const result = await client.query(
    'SELECT public.minglora_ai_bot_chat_command($1, $2, $3::jsonb) AS result',
    [action, ownerId, JSON.stringify(payload)]
  );
  return result.rows[0].result;
}

async function waitForDatabaseLock(pid) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const { rows } = await pool.query(
      'SELECT wait_event_type, wait_event FROM pg_stat_activity WHERE pid = $1',
      [pid]
    );
    if (rows[0]?.wait_event_type === 'Lock') return rows[0];
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('The second database session did not wait on the shared owner/day budget lock.');
}

async function concurrentBudgetAttempt({
  firstAction,
  firstPayload,
  secondAction,
  secondPayload,
  ownerId
}) {
  const first = await pool.connect();
  const second = await pool.connect();
  let firstOpen = false;
  let secondOpen = false;
  let secondPromise;

  try {
    await beginAsService(first);
    firstOpen = true;
    const firstResult = await rpc(first, firstAction, ownerId, firstPayload);
    assert.equal(firstResult.reserved ?? firstResult.attemptCount === 1, true,
      'the first transaction should acquire its reservation');

    await beginAsService(second);
    secondOpen = true;
    const { rows } = await second.query('SELECT pg_backend_pid() AS pid');
    const secondPid = rows[0].pid;
    secondPromise = rpc(second, secondAction, ownerId, secondPayload);

    const wait = await waitForDatabaseLock(secondPid);
    assert.equal(wait.wait_event_type, 'Lock');

    await first.query('COMMIT');
    firstOpen = false;

    await assert.rejects(
      secondPromise,
      error => error.code === '54000',
      'the second transaction must reject an aggregate reservation above the daily limit'
    );
    await second.query('ROLLBACK');
    secondOpen = false;
  } finally {
    if (firstOpen) await first.query('ROLLBACK').catch(() => {});
    if (secondOpen) await second.query('ROLLBACK').catch(() => {});
    first.release();
    second.release();
  }
}

function creatorPayload(requestId, jobId, usageDate, reserveTokens) {
  return {
    request_id: requestId,
    job_id: jobId,
    usage_date: usageDate,
    daily_token_budget: 1000,
    baseline_used_tokens: 0,
    reserve_tokens: reserveTokens
  };
}

function chatPayload(requestId, identityId, botId, reserveTokens) {
  return {
    request_id: requestId,
    identity_id: identityId,
    bot_id: botId,
    message: 'A concurrency acceptance request for the shared daily token budget.',
    message_hash: crypto.createHash('sha256')
      .update(requestId)
      .digest('hex'),
    usage_date: new Date().toISOString().slice(0, 10),
    daily_token_budget: 1000,
    baseline_used_tokens: 0,
    reserve_tokens: reserveTokens
  };
}

before(async () => {
  assert.ok(databaseUrl, 'AI_NETWORK_TEST_DATABASE_URL must point to the disposable CI PostgreSQL service.');
  pool = new Pool({ connectionString: databaseUrl, max: 8 });
  await installMinimalMingloraFixture();
});

after(async () => {
  if (!pool) return;
  await pool.end();
});

test('two Creator Studio sessions serialize reservations on one owner/day budget row', async () => {
  const { ownerId } = await addOwnerFixture();
  const usageDate = new Date().toISOString().slice(0, 10);
  const firstRequestId = crypto.randomUUID();
  const secondRequestId = crypto.randomUUID();

  await concurrentBudgetAttempt({
    firstAction: 'creator_begin_request',
    firstPayload: creatorPayload(firstRequestId, 'creator-concurrent-first', usageDate, 700),
    secondAction: 'creator_begin_request',
    secondPayload: creatorPayload(secondRequestId, 'creator-concurrent-second', usageDate, 700),
    ownerId
  });

  const { rows } = await pool.query(
    `SELECT count(*)::integer AS active_count, coalesce(sum(reserved_tokens), 0)::integer AS reserved_tokens
       FROM ai_network.ai_creator_studio_daily_token_reservations
      WHERE owner_user_id = $1 AND usage_date = $2 AND status = 'reserved'`,
    [ownerId, usageDate]
  );
  assert.equal(rows[0].active_count, 1);
  assert.equal(rows[0].reserved_tokens, 700);
});

test('Creator Studio reservation blocks an over-budget concurrent bot chat request', async () => {
  const { ownerId, identityId } = await addOwnerFixture();
  const usageDate = new Date().toISOString().slice(0, 10);
  const firstRequestId = crypto.randomUUID();
  const secondRequestId = crypto.randomUUID();
  const botId = crypto.randomUUID();

  await concurrentBudgetAttempt({
    firstAction: 'creator_begin_request',
    firstPayload: creatorPayload(firstRequestId, 'creator-holds-budget-for-chat', usageDate, 700),
    secondAction: 'begin_request',
    secondPayload: chatPayload(secondRequestId, identityId, botId, 400),
    ownerId
  });

  const { rows } = await pool.query(
    `SELECT
       (SELECT count(*)::integer FROM ai_network.ai_creator_studio_daily_token_reservations
         WHERE owner_user_id = $1 AND usage_date = $2 AND status = 'reserved') AS creator_reservations,
       (SELECT count(*)::integer FROM ai_network.ai_bot_chat_requests
         WHERE owner_user_id = $1 AND request_id = $3) AS chat_requests`,
    [ownerId, usageDate, secondRequestId]
  );
  assert.equal(rows[0].creator_reservations, 1);
  assert.equal(rows[0].chat_requests, 0);
});

test('bot chat reservation blocks an over-budget concurrent Creator Studio request', async () => {
  const { ownerId, identityId } = await addOwnerFixture();
  const usageDate = new Date().toISOString().slice(0, 10);
  const firstRequestId = crypto.randomUUID();
  const secondRequestId = crypto.randomUUID();
  const botId = crypto.randomUUID();

  await concurrentBudgetAttempt({
    firstAction: 'begin_request',
    firstPayload: chatPayload(firstRequestId, identityId, botId, 700),
    secondAction: 'creator_begin_request',
    secondPayload: creatorPayload(secondRequestId, 'creator-waits-for-chat-budget', usageDate, 400),
    ownerId
  });

  const { rows } = await pool.query(
    `SELECT
       (SELECT count(*)::integer FROM ai_network.ai_bot_daily_token_reservations
         WHERE owner_user_id = $1 AND request_id = $2 AND status = 'reserved') AS chat_reservations,
       (SELECT count(*)::integer FROM ai_network.ai_creator_studio_daily_token_reservations
         WHERE owner_user_id = $1 AND request_id = $3) AS creator_requests`,
    [ownerId, firstRequestId, secondRequestId]
  );
  assert.equal(rows[0].chat_reservations, 1);
  assert.equal(rows[0].creator_requests, 0);
});
