import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261117130000_minglora_ai_worker_principals.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('worker principal records store only credential digests and remain private', () => {
  for (const table of ['ai_worker_principals','ai_worker_identity_grants','ai_worker_events']) {
    assert.ok(migration.includes('create table if not exists ai_network.' + table));
    assert.ok(migration.includes('alter table ai_network.' + table + ' enable row level security'));
  }
  assert.ok(migration.includes('credential_sha256 text unique'));
  assert.ok(migration.includes("credential_sha256 is null or credential_sha256 ~ '^[0-9a-f]{64}$'"));
  assert.ok(!/credential\s+text\s+(unique\s+)?not null/i.test(migration));
  assert.ok(migration.includes('credential_expires_at timestamptz not null'));
  assert.ok(migration.includes('credential_version integer not null'));
  assert.ok(migration.includes('revoke all on ai_network.ai_worker_principals'));
  assert.ok(migration.includes('from public, anon, authenticated'));
  assert.ok(migration.includes('grant select, insert, update on ai_network.ai_worker_principals to service_role'));
  assert.ok(migration.includes('grant select, insert on ai_network.ai_worker_events to service_role'));
});

test('worker admin commands are owner scoped, expiring, audited and capability bounded', () => {
  for (const token of [
    "if current_user <> 'service_role'",
    "if v_action='create_worker'",
    "if v_action='list_workers'",
    "'rotate_worker','revoke_worker'",
    "credential_expires_at>now()+interval '24 hours'",
    "cardinality(v_allowed_classes)>2",
    "array['read_only','content']::text[]",
    "i.owner_user_id=p_actor_user_id",
    "i.status='active' and i.enabled=true",
    'ai_worker_identity_grants',
    'ai_worker_events',
    "'worker_credential_rotated'",
    "'worker_revoked'"
  ]) assert.ok(migration.includes(token), 'Missing worker principal safeguard: ' + token);
  assert.ok(migration.includes('credential_sha256=null,status=\'revoked\''));
  assert.ok(migration.includes('credential_sha256=v_credential_sha256'));
});

test('authenticated worker runtime enforces grants, providers, leases and the global pause', () => {
  for (const token of [
    "v_action not in ('claim_next_task','heartbeat_task','complete_task','fail_task')",
    "p.credential_sha256=p_credential_sha256",
    "p.status<>'active'",
    "p.credential_expires_at<=now()",
    "c.global_paused",
    "c.execution_enabled",
    "c.max_concurrent_workers",
    "v_worker.max_concurrent_tasks",
    "q.action_class=any(v_worker.allowed_action_classes)",
    "g.worker_id=v_worker.worker_id",
    "g.identity_id=q.identity_id",
    "i.status='active' and i.enabled=true",
    "a.assignment_status='active'",
    "a.provider_health_status='healthy'",
    "pa.status='configured' and pa.health_status='healthy'",
    "for update skip locked limit 1",
    "q.lease_expires_at>now()",
    "lease_token=v_lease_token",
    "status='succeeded'",
    "worker_lease_expired"
  ]) assert.ok(migration.includes(token), 'Missing authenticated worker runtime safeguard: ' + token);
  assert.ok(migration.includes("raise exception using errcode = '42501', message = 'Worker authentication failed.'"));
  assert.ok(migration.includes("'runtime_paused_or_disabled'"));
  assert.ok(migration.includes("'worker_concurrency_limit_reached'"));
  assert.ok(migration.includes('safe JSON object no larger than 64 KB.'));
});

test('Edge gateway exposes distinct worker actions and keeps worker leases out of human task commands', () => {
  assert.ok(runtime.includes('"ai_worker_admin_command"'));
  assert.ok(runtime.includes('"ai_worker_runtime_command"'));
  const humanStart = runtime.indexOf('if (action === "ai_task_command")');
  const humanEnd = runtime.indexOf('if (action === "ai_provider_command")', humanStart);
  const human = runtime.slice(humanStart, humanEnd);
  assert.ok(human.includes('"create_task"'));
  assert.ok(!human.includes('"claim_next_task"'));
  const workerStart = runtime.indexOf('if (action === "ai_worker_runtime_command")');
  const workerEnd = runtime.indexOf('if (action === "ai_task_command")', workerStart);
  const worker = runtime.slice(workerStart, workerEnd);
  for (const action of ['claim_next_task','heartbeat_task','complete_task','fail_task']) {
    assert.ok(worker.includes('"' + action + '"'));
  }
  assert.ok(worker.includes('credentialSha256'));
  assert.ok(worker.includes('minglora_ai_worker_runtime_command'));
});

test('Node worker route hashes bearer credentials and never forwards the raw token', () => {
  assert.ok(server.includes("p === '/api/internal/ai-worker/runtime'"));
  assert.ok(server.includes("p !== '/api/internal/ai-worker/runtime'"));
  assert.ok(server.includes('/^Bearer (mngw_[A-Za-z0-9_-]{43})$/'));
  assert.ok(server.includes("crypto.createHash('sha256').update(match[1], 'utf8').digest('hex')"));
  assert.ok(server.includes("requestSupabaseState('ai_worker_runtime_command'"));
  assert.ok(server.includes('credentialSha256, aiAction, payload'));
  assert.ok(server.includes("crypto.randomBytes(32).toString('base64url')"));
  assert.ok(server.includes("requestSupabaseState('ai_worker_admin_command'"));
  assert.ok(server.includes("hasActiveReviewerSession(user)"));
  assert.ok(server.includes("credential_delivery: 'shown_once'"));
});

test('worker controls expose one-time credential handoff and no execution-enable control', () => {
  for (const token of [
    'async function loadAIWorkerRegistry()',
    "request('/workers')",
    'data-ai-form="worker-create"',
    'name="identityIds"',
    'name="allowedActionClasses"',
    'worker-rotate',
    'worker-revoke',
    'revealedWorkerCredential',
    'shown once',
    'Workers are limited to read-only/content tasks',
    'Global execution remains paused'
  ]) assert.ok(ui.includes(token), 'Missing worker operations control: ' + token);
  assert.ok(!ui.includes('Enable task execution'));
});
