import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261118075901_minglora_ai_durable_identity_batches.sql');
const capacityMigration = read('supabase/migrations/20261121154746_minglora_ai_identity_capacity_100k.sql');
const capacityCounterMigration = read('supabase/migrations/20261121160039_minglora_ai_identity_capacity_counter_100k.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const ui = read('public/ai-network.js');

test('durable AI batch ledger is additive and does not duplicate canonical identity tables', () => {
  for (const table of ['ai_identity_batches','ai_identity_batch_rows','ai_identity_batch_events']) {
    assert.match(migration, new RegExp('create table if not exists ai_network\\.' + table, 'i'));
  }
  for (const table of ['ai_identities','ai_names','ai_profiles','ai_emails','ai_provider_accounts','ai_provider_models','ai_provider_assignments']) {
    assert.doesNotMatch(migration, new RegExp('create table(?: if not exists)? ai_network\\.' + table + '\\b', 'i'));
  }
  assert.match(migration, /references ai_network\.ai_identities\(identity_id\)/i);
});

test('batch rows are private, owner-bound, RLS protected and service-role only', () => {
  assert.match(migration, /alter table ai_network\.ai_identity_batches enable row level security/i);
  assert.match(migration, /alter table ai_network\.ai_identity_batch_rows enable row level security/i);
  assert.match(migration, /alter table ai_network\.ai_identity_batch_events enable row level security/i);
  assert.match(migration, /revoke all on ai_network\.ai_identity_batches[\s\S]*from public,anon,authenticated,service_role/i);
  assert.match(migration, /current_user <> 'service_role'/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /from ai_network\.ai_identity_batches b[\s\S]*where b\.owner_user_id=p_actor_user_id/i);
});

test('identity batch creation uses the existing canonical identity writer with idempotent retries', () => {
  assert.match(migration, /public\.minglora_ai_identity_command\('create',p_actor_user_id,v_item\.value\)/i);
  assert.match(migration, /public\.minglora_ai_identity_command\('create',p_actor_user_id,v_row\.request_payload\)/i);
  assert.match(migration, /unique \(owner_user_id,idempotency_key\)/i);
  assert.match(migration, /request_fingerprint/);
  assert.match(migration, /row_idempotency_key/);
  assert.match(migration, /on conflict \(owner_user_id,idempotency_key\) do nothing/i);
  assert.match(migration, /request_payload=null/);
  assert.match(migration, /attempt_count<25/);
  assert.match(migration, /get stacked diagnostics v_error_code=returned_sqlstate,v_error_message=message_text/i);
  assert.match(migration, /exception when others then/i);
});

test('runtime gateway validates and forwards durable batch commands', () => {
  assert.match(runtime, /"ai_identity_batch_command"/);
  assert.match(runtime, /supportedBatchCommands = \["create_batch", "retry_failed", "list_batches"\]/);
  assert.match(runtime, /admin\.rpc\("minglora_ai_identity_batch_command"/);
  assert.match(runtime, /validUuid\(actorUserId\)/);
});

test('Node routes enforce admin authorization and persistence for batch operations', () => {
  assert.match(server, /const runAIIdentityBatchCommand = async/);
  assert.match(server, /requestSupabaseState\('ai_identity_batch_command'/);
  assert.match(server, /sub === 'identities\/batches'/);
  const batchListStart = server.indexOf("if (method === 'GET' && sub === 'identities/batches')");
  const batchRetryStart = server.indexOf("if (method === 'POST' && parts[0] === 'identities' && parts[1] === 'batches'");
  const batchIdentityGetStart = server.indexOf("if (method === 'GET' && parts[0] === 'identities' && parts.length === 2)", batchRetryStart);
  assert.ok(batchListStart >= 0 && batchRetryStart > batchListStart && batchIdentityGetStart > batchRetryStart);
  assert.doesNotMatch(server.slice(batchListStart, batchRetryStart), /isModerator/);
  assert.doesNotMatch(server.slice(batchRetryStart, batchIdentityGetStart), /isModerator/);
  assert.match(server, /actorUserId: user\.id,[\s\S]*aiAction: batchAction/);
  assert.match(server, /Only an authorized Minglora platform administrator may bulk-create organizational or specialized-service AI identities/);
  assert.match(server, /runAIIdentityBatchCommand\('create_batch'/);
  assert.match(server, /runAIIdentityBatchCommand\('retry_failed'/);
});

test('identity bulk UI requires unique row keys and exposes persisted failed-row retry', () => {
  assert.match(ui, /identityBatches/);
  assert.match(ui, /batch_idempotency_key/);
  assert.match(ui, /Every identity row needs a unique idempotency_key/);
  assert.match(ui, /request\('\/identities\/batches\?limit=12'\)/);
  assert.match(ui, /data-ai-action="identity-batch-retry"/);
  assert.ok(ui.includes("/identities/batches/' + encodeURIComponent(batchId) + '/retry"));
  assert.match(ui, /saves failed row data privately in Supabase/);
  assert.match(ui, /Successful row payloads are cleared from the retry store/);
});


test('global AI identity ceiling is database-enforced, private and visible in the Bot Centre', () => {
  const sql = capacityMigration.toLowerCase();
  assert.ok(sql.includes('create table if not exists ai_network.ai_identity_capacity_limits'));
  assert.ok(sql.includes('maximum_identities between 1 and 100000'));
  assert.ok(sql.includes("values ('global', 100000)"));
  assert.ok(sql.includes('for update'));
  assert.ok(sql.includes('before insert on ai_network.ai_identities'));
  assert.ok(sql.includes('new.idempotency_key'));
  assert.ok(sql.includes("errcode = '54000'"));
  assert.ok(sql.includes('security invoker'));
  assert.ok(sql.includes("set search_path = ''"));
  assert.ok(sql.includes('alter table ai_network.ai_identity_capacity_limits enable row level security'));
  assert.ok(sql.includes('revoke all on table ai_network.ai_identity_capacity_limits from public, anon, authenticated, service_role'));
  assert.ok(sql.includes('grant select, update on table ai_network.ai_identity_capacity_limits to service_role'));
  assert.ok(sql.includes('minglora_ai_identity_capacity_status(uuid)'));
  assert.ok(runtime.includes('"ai_identity_capacity_status"'));
  assert.ok(runtime.includes('admin.rpc("minglora_ai_identity_capacity_status"'));
  assert.ok(server.includes('runAIIdentityCapacityStatus'));
  assert.ok(server.includes("sub === 'identity-capacity'"));
  assert.ok(ui.includes('identityCapacity'));
  assert.ok(ui.includes('global ceiling of 100,000'));
  assert.ok(ui.includes('Global AI identity capacity'));
  assert.ok(ui.includes('state.identityCapacity?.capacity_reached'));
  assert.ok(ui.includes('up to 100 per batch'));

  const counterSql = capacityCounterMigration.toLowerCase();
  assert.ok(counterSql.includes('add column if not exists registered_count bigint not null default 0'));
  assert.ok(counterSql.includes('registered_count=registered_count+1'));
  assert.ok(counterSql.includes('registered_count=greatest(registered_count-1,0)'));
  assert.ok(counterSql.includes('after insert on ai_network.ai_identities'));
  assert.ok(counterSql.includes('before delete on ai_network.ai_identities'));
  assert.ok(counterSql.includes('after delete on ai_network.ai_identities'));
  assert.ok(counterSql.includes('select c.maximum_identities, c.registered_count'));
  assert.ok(counterSql.includes('security invoker'));
  assert.ok(counterSql.includes("set search_path = ''"));
});
