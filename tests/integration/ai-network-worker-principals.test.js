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

async function installFixture() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT service_role TO postgres;

    CREATE TABLE public.profiles (id uuid PRIMARY KEY);
    CREATE SCHEMA ai_network;

    CREATE TABLE ai_network.ai_identities (
      identity_id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES public.profiles(id),
      created_by_user_id uuid REFERENCES public.profiles(id),
      status text NOT NULL,
      enabled boolean NOT NULL DEFAULT true,
      supervision_level text NOT NULL
    );

    CREATE TABLE ai_network.ai_organizations (
      organization_id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES public.profiles(id),
      status text NOT NULL
    );

    CREATE TABLE ai_network.ai_provider_accounts (
      provider_account_id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES public.profiles(id),
      status text NOT NULL,
      health_status text NOT NULL
    );

    CREATE TABLE ai_network.ai_provider_assignments (
      identity_id uuid NOT NULL REFERENCES ai_network.ai_identities(identity_id),
      provider_account_id uuid NOT NULL REFERENCES ai_network.ai_provider_accounts(provider_account_id),
      assignment_status text NOT NULL,
      provider_health_status text NOT NULL,
      PRIMARY KEY(identity_id,provider_account_id)
    );

    GRANT USAGE ON SCHEMA public, ai_network TO service_role;
    GRANT SELECT ON public.profiles TO service_role;
    GRANT SELECT, INSERT, UPDATE ON ai_network.ai_identities, ai_network.ai_organizations,
      ai_network.ai_provider_accounts, ai_network.ai_provider_assignments TO service_role;
  `);

  await pool.query(read('supabase/migrations/20261114022051_minglora_ai_durable_task_queue_and_approvals.sql'));
  await pool.query(read('supabase/migrations/20261118190000_minglora_ai_worker_principals.sql'));
}

async function asService(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE service_role');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function admin(action, actorId, payload = {}) {
  return asService(async client => {
    const { rows } = await client.query(
      'SELECT public.minglora_ai_worker_admin_command($1,$2,$3::jsonb) AS result',
      [action,actorId,JSON.stringify(payload)]
    );
    return rows[0].result;
  });
}

async function worker(action, credentialHash, payload = {}) {
  return asService(async client => {
    const { rows } = await client.query(
      'SELECT public.minglora_ai_worker_runtime_command($1,$2,$3::jsonb) AS result',
      [action,credentialHash,JSON.stringify(payload)]
    );
    return rows[0].result;
  });
}


async function workerOnClient(client, action, credentialHash, payload = {}) {
  const { rows } = await client.query(
    'SELECT public.minglora_ai_worker_runtime_command($1,$2,$3::jsonb) AS result',
    [action,credentialHash,JSON.stringify(payload)]
  );
  return rows[0].result;
}

async function waitForDatabaseLock(pid, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await pool.query(
      'SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',
      [pid]
    );
    if (rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('The competing worker did not wait on the global admission lock.');
}

async function addIdentity(ownerId, providerOwnerId = ownerId) {
  const identityId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  await asService(async client => {
    await client.query(
      'INSERT INTO ai_network.ai_identities(identity_id,owner_user_id,created_by_user_id,status,enabled,supervision_level) VALUES ($1,$2,$2,$3,true,$4)',
      [identityId,ownerId,'active','hybrid_autonomy']
    );
    await client.query(
      'INSERT INTO ai_network.ai_provider_accounts(provider_account_id,owner_user_id,status,health_status) VALUES ($1,$2,$3,$4)',
      [accountId,providerOwnerId,'configured','healthy']
    );
    await client.query(
      'INSERT INTO ai_network.ai_provider_assignments(identity_id,provider_account_id,assignment_status,provider_health_status) VALUES ($1,$2,$3,$4)',
      [identityId,accountId,'active','healthy']
    );
  });
  return identityId;
}

async function addTask(ownerId, identityId, title, priority) {
  const taskId = crypto.randomUUID();
  await asService(client => client.query(
    `INSERT INTO ai_network.ai_task_queue(
      task_id,owner_user_id,identity_id,task_title,task_type,action_class,task_payload,
      autonomy_mode,requires_approval,status,priority,scheduled_for,max_attempts,
      token_budget,cost_limit_usd,idempotency_key,created_by_user_id
    ) VALUES ($1,$2,$3,$4,'content.prepare','content','{}'::jsonb,
      'hybrid_autonomy',false,'queued',$5,now(),3,0,0,$6,$2)`,
    [taskId,ownerId,identityId,title,priority,'worker-test-' + taskId]
  ));
  return taskId;
}

function credential() {
  const raw = 'mngw_' + crypto.randomBytes(32).toString('base64url');
  return { raw, sha256: crypto.createHash('sha256').update(raw,'utf8').digest('hex') };
}

function expiry(hours = 8) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

before(async () => {
  assert.ok(databaseUrl, 'AI_NETWORK_TEST_DATABASE_URL must point to the disposable CI PostgreSQL service.');
  pool = new Pool({ connectionString: databaseUrl, max: 8 });
  await installFixture();
});

after(async () => {
  if (pool) await pool.end();
});

test('worker credentials are one-way digests, scoped to granted identities and blocked by the global pause', async () => {
  const ownerId = crypto.randomUUID();
  const otherOwnerId = crypto.randomUUID();
  await pool.query('INSERT INTO public.profiles(id) VALUES ($1),($2)',[ownerId,otherOwnerId]);
  const grantedIdentity = await addIdentity(ownerId);
  const ungrantedIdentity = await addIdentity(ownerId);
  const otherOwnerIdentity = await addIdentity(otherOwnerId);
  const crossOwnerProviderIdentity = await addIdentity(ownerId,otherOwnerId);
  const ungrantedTaskId = await addTask(ownerId,ungrantedIdentity,'Unassigned task',2);
  const crossOwnerProviderTaskId = await addTask(ownerId,crossOwnerProviderIdentity,'Cross-owner provider task',1);
  const firstTaskId = await addTask(ownerId,grantedIdentity,'Granted task one',10);
  const secondTaskId = await addTask(ownerId,grantedIdentity,'Granted task two',20);
  const firstCredential = credential();

  const created = await admin('create_worker',ownerId,{
    worker_name:'CI isolated worker',
    credential_sha256:firstCredential.sha256,
    credential_expires_at:expiry(),
    identity_ids:[grantedIdentity,crossOwnerProviderIdentity],
    allowed_action_classes:['read_only','content'],
    max_concurrent_tasks:1
  });
  await assert.rejects(
    admin('create_worker',ownerId,{
      worker_name:'Cross-tenant grant must fail',
      credential_sha256:credential().sha256,
      credential_expires_at:expiry(),
      identity_ids:[otherOwnerIdentity],
      allowed_action_classes:['content'],
      max_concurrent_tasks:1
    }),
    error => error.code === '42501'
  );
  const workerId = created.worker.worker_id;
  assert.ok(workerId);
  assert.equal(created.worker.status,'active');
  assert.deepEqual(created.worker.identity_ids,[grantedIdentity,crossOwnerProviderIdentity]);
  const stored = await pool.query(
    'SELECT credential_sha256,status FROM ai_network.ai_worker_principals WHERE worker_id=$1',
    [workerId]
  );
  assert.equal(stored.rows[0].credential_sha256,firstCredential.sha256);
  assert.notEqual(stored.rows[0].credential_sha256,firstCredential.raw);

  const paused = await worker('claim_next_task',firstCredential.sha256);
  assert.equal(paused.claimed,false);
  assert.equal(paused.reason,'runtime_paused_or_disabled');

  await asService(client => client.query(
    `UPDATE ai_network.ai_task_runtime_controls
        SET global_paused=false,execution_enabled=true,max_concurrent_workers=4,lease_seconds=120
      WHERE control_key='primary'`
  ));

  const claimed = await worker('claim_next_task',firstCredential.sha256);
  assert.equal(claimed.claimed,true);
  assert.equal(claimed.task_id,firstTaskId);
  assert.equal(claimed.identity_id,grantedIdentity);
  assert.notEqual(claimed.task_id,ungrantedTaskId);
  assert.notEqual(claimed.task_id,crossOwnerProviderTaskId);

  const concurrent = await worker('claim_next_task',firstCredential.sha256);
  assert.equal(concurrent.claimed,false);
  assert.equal(concurrent.reason,'worker_concurrency_limit_reached');

  const heartbeat = await worker('heartbeat_task',firstCredential.sha256,{
    task_id:claimed.task_id,lease_token:claimed.lease_token
  });
  assert.equal(heartbeat.renewed,true);

  const completed = await worker('complete_task',firstCredential.sha256,{
    task_id:claimed.task_id,lease_token:claimed.lease_token,
    task_result:{outcome:'completed',source:'isolated-postgres-test'}
  });
  assert.equal(completed.task.status,'succeeded');

  const next = await worker('claim_next_task',firstCredential.sha256);
  assert.equal(next.claimed,true);
  assert.equal(next.task_id,secondTaskId);
  const failed = await worker('fail_task',firstCredential.sha256,{
    task_id:next.task_id,lease_token:next.lease_token,failure_reason:'Retryable test failure'
  });
  assert.equal(failed.task.status,'queued');

  const noGrantedTask = await worker('claim_next_task',firstCredential.sha256);
  assert.equal(noGrantedTask.claimed,false);
  assert.equal(noGrantedTask.reason,'no_due_task_with_granted_identity_and_healthy_provider');

  const rotatedCredential = credential();
  const rotated = await admin('rotate_worker',ownerId,{
    worker_id:workerId,credential_sha256:rotatedCredential.sha256,credential_expires_at:expiry(4)
  });
  assert.equal(rotated.worker.credential_version,2);
  await assert.rejects(
    worker('claim_next_task',firstCredential.sha256),
    error => error.code === '42501'
  );

  const thirdTaskId = await addTask(ownerId,grantedIdentity,'Task after rotation',30);
  const afterRotation = await worker('claim_next_task',rotatedCredential.sha256);
  assert.equal(afterRotation.claimed,true);
  assert.equal(afterRotation.task_id,thirdTaskId);

  const revoked = await admin('revoke_worker',ownerId,{
    worker_id:workerId,reason:'CI revoke assertion'
  });
  assert.equal(revoked.worker.status,'revoked');
  const released = await pool.query(
    'SELECT status,worker_id,lease_token FROM ai_network.ai_task_queue WHERE task_id=$1',
    [thirdTaskId]
  );
  assert.equal(released.rows[0].status,'queued');
  assert.equal(released.rows[0].worker_id,null);
  assert.equal(released.rows[0].lease_token,null);
  await assert.rejects(
    worker('claim_next_task',rotatedCredential.sha256),
    error => error.code === '42501'
  );

  const eventTypes = await pool.query(
    'SELECT event_type FROM ai_network.ai_worker_events WHERE worker_id=$1 ORDER BY occurred_at',
    [workerId]
  );
  assert.ok(eventTypes.rows.some(row => row.event_type === 'worker_created'));
  assert.ok(eventTypes.rows.some(row => row.event_type === 'worker_credential_rotated'));
  assert.ok(eventTypes.rows.some(row => row.event_type === 'worker_revoked'));
});


test('two worker principals cannot exceed the global concurrency cap under concurrent claims', async () => {
  const ownerId = crypto.randomUUID();
  await pool.query('INSERT INTO public.profiles(id) VALUES ($1)',[ownerId]);
  const firstIdentity = await addIdentity(ownerId);
  const secondIdentity = await addIdentity(ownerId);
  const firstTaskId = await addTask(ownerId,firstIdentity,'Global slot one',1);
  await addTask(ownerId,secondIdentity,'Global slot two',2);

  const firstCredential = credential();
  const secondCredential = credential();
  await admin('create_worker',ownerId,{
    worker_name:'Global concurrency worker one',
    credential_sha256:firstCredential.sha256,
    credential_expires_at:expiry(),
    identity_ids:[firstIdentity],
    allowed_action_classes:['content'],
    max_concurrent_tasks:1
  });
  await admin('create_worker',ownerId,{
    worker_name:'Global concurrency worker two',
    credential_sha256:secondCredential.sha256,
    credential_expires_at:expiry(),
    identity_ids:[secondIdentity],
    allowed_action_classes:['content'],
    max_concurrent_tasks:1
  });
  await asService(client => client.query(
    `UPDATE ai_network.ai_task_runtime_controls
        SET global_paused=false,execution_enabled=true,max_concurrent_workers=1,lease_seconds=120
      WHERE control_key='primary'`
  ));

  const firstClient = await pool.connect();
  const secondClient = await pool.connect();
  try {
    await firstClient.query('BEGIN');
    await firstClient.query('SET LOCAL ROLE service_role');
    const firstClaim = await workerOnClient(firstClient,'claim_next_task',firstCredential.sha256);
    assert.equal(firstClaim.claimed,true);
    assert.equal(firstClaim.task_id,firstTaskId);

    await secondClient.query('BEGIN');
    await secondClient.query('SET LOCAL ROLE service_role');
    const { rows: pidRows } = await secondClient.query('SELECT pg_backend_pid() AS pid');
    const secondPid = pidRows[0].pid;
    const secondClaimPromise = workerOnClient(secondClient,'claim_next_task',secondCredential.sha256);

    await waitForDatabaseLock(secondPid);
    await firstClient.query('COMMIT');

    const secondClaim = await secondClaimPromise;
    assert.equal(secondClaim.claimed,false);
    assert.equal(secondClaim.reason,'global_worker_limit_reached');
    await secondClient.query('COMMIT');

    const running = await pool.query(
      "SELECT count(*)::integer AS count FROM ai_network.ai_task_queue WHERE status='running' AND lease_expires_at>now()"
    );
    assert.equal(running.rows[0].count,1);
  } finally {
    await firstClient.query('ROLLBACK').catch(()=>{});
    await secondClient.query('ROLLBACK').catch(()=>{});
    firstClient.release();
    secondClient.release();
  }
});

test('expired worker credentials are invalidated and audited without rolling back the unauthorized response', async () => {
  const ownerId = crypto.randomUUID();
  await pool.query('INSERT INTO public.profiles(id) VALUES ($1)',[ownerId]);
  const identityId = await addIdentity(ownerId);
  const workerCredential = credential();
  const created = await admin('create_worker',ownerId,{
    worker_name:'Expiry lifecycle worker',
    credential_sha256:workerCredential.sha256,
    credential_expires_at:expiry(),
    identity_ids:[identityId],
    allowed_action_classes:['read_only'],
    max_concurrent_tasks:1
  });
  const workerId = created.worker.worker_id;

  await asService(client => client.query(
    "UPDATE ai_network.ai_worker_principals SET credential_expires_at=now()-interval '1 second' WHERE worker_id=$1",
    [workerId]
  ));

  const rejected = await worker('claim_next_task',workerCredential.sha256);
  assert.equal(rejected.authenticated,false);
  assert.equal(rejected.error,'Worker credential is expired or revoked.');

  const persisted = await pool.query(
    'SELECT status,credential_sha256 FROM ai_network.ai_worker_principals WHERE worker_id=$1',
    [workerId]
  );
  assert.equal(persisted.rows[0].status,'expired');
  assert.equal(persisted.rows[0].credential_sha256,null);

  const expiryEvents = await pool.query(
    "SELECT count(*)::integer AS count FROM ai_network.ai_worker_events WHERE worker_id=$1 AND event_type='worker_credential_expired'",
    [workerId]
  );
  assert.equal(expiryEvents.rows[0].count,1);
  await assert.rejects(
    worker('claim_next_task',workerCredential.sha256),
    error => error.code === '42501'
  );
});
