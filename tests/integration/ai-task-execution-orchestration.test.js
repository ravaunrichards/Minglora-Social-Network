import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const migrationSql = readFileSync(
  new URL('../../supabase/migrations/20261120090000_minglora_ai_task_execution_orchestration.sql', import.meta.url),
  'utf8'
);
const databaseUrl = process.env.AI_NETWORK_TEST_DATABASE_URL;
const OWNER = '11111111-1111-4111-8111-111111111111';
const IDENTITY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const IDENTITY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACCOUNT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MODEL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MODEL_NAME = 'gpt-4.1-mini';
const PROMPT = 'Prepare a concise welcome note for a new Minglora community member.';

async function createFixture(client) {
  await client.query(`
    do $$ begin create role service_role nologin bypassrls;
    exception when duplicate_object then null; end $$;
    do $$ begin create role anon nologin;
    exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin;
    exception when duplicate_object then null; end $$;
    create schema if not exists ai_network;
    create table public.profiles (id uuid primary key);
    create table public.minglora_platform_staff (
      user_id uuid primary key references public.profiles(id),
      active boolean not null, role text not null
    );
    insert into public.profiles(id) values ('${OWNER}') on conflict do nothing;
    insert into public.minglora_platform_staff(user_id,active,role)
      values ('${OWNER}',true,'owner') on conflict do nothing;

    create table ai_network.ai_identities (
      identity_id uuid primary key,
      owner_user_id uuid not null references public.profiles(id),
      population text not null, category_key text not null, subcategory text not null,
      purpose text not null, status text not null, enabled boolean not null,
      supervision_level text not null
    );
    create table ai_network.ai_profiles (
      identity_id uuid primary key references ai_network.ai_identities(identity_id),
      bio text not null default '', introduction text not null default '',
      personality jsonb not null default '{}'::jsonb, profession text not null default '',
      skills text[] not null default '{}'::text[], interests text[] not null default '{}'::text[],
      hobbies text[] not null default '{}'::text[]
    );
    create table ai_network.ai_identity_capabilities (
      identity_id uuid not null references ai_network.ai_identities(identity_id),
      capability_key text not null, is_enabled boolean not null default false,
      primary key(identity_id,capability_key)
    );
    create table ai_network.ai_identity_permissions (
      permission_id uuid primary key default gen_random_uuid(),
      identity_id uuid not null references ai_network.ai_identities(identity_id),
      permission_key text not null, resource_scope text not null default '*',
      effect text not null, expires_at timestamptz
    );
    create table ai_network.ai_provider_accounts (
      provider_account_id uuid primary key,
      owner_user_id uuid not null references public.profiles(id),
      provider_name text not null, status text not null, health_status text not null
    );
    create table ai_network.ai_provider_models (
      model_id uuid primary key, provider_name text not null,
      model_identifier text not null, is_active boolean not null, text_capability boolean not null
    );
    create table ai_network.ai_provider_assignments (
      assignment_id uuid primary key default gen_random_uuid(),
      identity_id uuid not null references ai_network.ai_identities(identity_id),
      provider_account_id uuid not null references ai_network.ai_provider_accounts(provider_account_id),
      model_id uuid not null references ai_network.ai_provider_models(model_id),
      assignment_status text not null, provider_health_status text not null,
      assigned_capabilities text[] not null default '{}'::text[],
      routing_priority integer not null default 100, assigned_at timestamptz not null default now()
    );
    create table ai_network.ai_delegation_grants (
      delegation_grant_id uuid primary key,
      owner_user_id uuid not null references public.profiles(id),
      grantor_identity_id uuid not null references ai_network.ai_identities(identity_id),
      grantee_identity_id uuid not null references ai_network.ai_identities(identity_id),
      grant_status text not null, expires_at timestamptz not null,
      allowed_task_types text[] not null, allowed_action_classes text[] not null,
      max_token_budget integer not null, max_cost_limit_usd numeric not null
    );
    create table ai_network.ai_task_runtime_controls (
      control_key text primary key, global_paused boolean not null default true,
      execution_enabled boolean not null default false,
      max_concurrent_workers integer not null default 0,
      lease_seconds integer not null default 120, updated_at timestamptz not null default now()
    );
    insert into ai_network.ai_task_runtime_controls(control_key,global_paused,execution_enabled,max_concurrent_workers,lease_seconds)
      values ('primary',true,false,0,120) on conflict do nothing;

    create table ai_network.ai_task_queue (
      task_id uuid primary key, owner_user_id uuid not null references public.profiles(id),
      identity_id uuid not null references ai_network.ai_identities(identity_id),
      task_title text not null, task_type text not null, action_class text not null,
      task_payload jsonb not null default '{}'::jsonb, status text not null default 'queued',
      priority integer not null default 100, scheduled_for timestamptz not null default now(),
      attempt_count integer not null default 0, max_attempts integer not null default 3,
      token_budget integer not null default 0, cost_limit_usd numeric not null default 0,
      idempotency_key text, created_by_user_id uuid not null references public.profiles(id),
      delegation_grant_id uuid references ai_network.ai_delegation_grants(delegation_grant_id),
      delegated_from_identity_id uuid references ai_network.ai_identities(identity_id),
      worker_id text, lease_token uuid, lease_expires_at timestamptz,
      task_result jsonb, failure_reason text not null default '',
      started_at timestamptz, finished_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(owner_user_id,task_id),
      check ((delegation_grant_id is null)=(delegated_from_identity_id is null)),
      check ((status='running' and worker_id is not null and lease_token is not null and lease_expires_at is not null)
        or (status<>'running' and worker_id is null and lease_token is null and lease_expires_at is null))
    );
    create table ai_network.ai_task_events (
      event_id uuid primary key default gen_random_uuid(),
      owner_user_id uuid not null references public.profiles(id), task_id uuid not null,
      actor_type text not null, actor_user_id uuid references public.profiles(id), worker_id text,
      event_type text not null, previous_status text, new_status text not null,
      reason text not null default '', metadata jsonb not null default '{}'::jsonb,
      occurred_at timestamptz not null default now(),
      foreign key(owner_user_id,task_id) references ai_network.ai_task_queue(owner_user_id,task_id)
    );
    create table ai_network.ai_task_approvals (
      approval_id uuid primary key default gen_random_uuid(),
      owner_user_id uuid not null references public.profiles(id), task_id uuid not null,
      approval_status text not null default 'requested'
    );

    insert into ai_network.ai_identities(
      identity_id,owner_user_id,population,category_key,subcategory,purpose,status,enabled,supervision_level
    ) values
      ('${IDENTITY_A}','${OWNER}','test','community_helper','welcome','Support community members with concise, useful drafts.','active',true,'autonomous_within_limits'),
      ('${IDENTITY_B}','${OWNER}','test','community_helper','delegate','Summarize approved delegated work for the lead identity.','active',true,'autonomous_within_limits');
    insert into ai_network.ai_profiles(identity_id,bio,introduction,personality,profession,skills,interests,hobbies)
    values
      ('${IDENTITY_A}','A community welcome assistant.','I help new members get oriented.',
        '{"tone":"warm","style":"concise"}','Community assistant',array['summarization','welcome writing'],array['community support'],array['reading']),
      ('${IDENTITY_B}','A delegated community assistant.','I summarize approved assignments.',
        '{"tone":"clear","style":"structured"}','Research assistant',array['summarization'],array['research'],array['reading']);
    insert into ai_network.ai_identity_capabilities(identity_id,capability_key,is_enabled)
      values ('${IDENTITY_A}','text_generation',true),('${IDENTITY_B}','text_generation',true);
    insert into ai_network.ai_identity_permissions(identity_id,permission_key,resource_scope,effect,expires_at)
      values ('${IDENTITY_A}','task.execute','*','allow',now()+interval '1 day'),
             ('${IDENTITY_B}','task.execute','*','allow',now()+interval '1 day');
    insert into ai_network.ai_provider_accounts(provider_account_id,owner_user_id,provider_name,status,health_status)
      values ('${ACCOUNT}','${OWNER}','openai','configured','healthy');
    insert into ai_network.ai_provider_models(model_id,provider_name,model_identifier,is_active,text_capability)
      values ('${MODEL}','openai','${MODEL_NAME}',true,true);
    insert into ai_network.ai_provider_assignments(
      identity_id,provider_account_id,model_id,assignment_status,provider_health_status,assigned_capabilities
    ) values
      ('${IDENTITY_A}','${ACCOUNT}','${MODEL}','active','healthy',array['text_generation']),
      ('${IDENTITY_B}','${ACCOUNT}','${MODEL}','active','healthy',array['text_generation']);

    grant usage on schema public,ai_network to service_role;
    grant all on all tables in schema public,ai_network to service_role;
  `);
}

test('PostgreSQL 17: authenticated worker claims, routes, completes, retries, times out, cancels and records history', {
  skip: !databaseUrl ? 'Requires an isolated AI_NETWORK_TEST_DATABASE_URL.' : false
}, async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await createFixture(client);
    await client.query(migrationSql);
    await client.query('set role service_role');

    const workerTokenHash = createHash('sha256').update('phase6-postgres-worker-test-token').digest('hex');
    const register = await client.query(
      'select public.minglora_ai_worker_admin_command($1,$2::uuid,$3::jsonb) as result',
      ['register_worker',OWNER,JSON.stringify({
        worker_label:'PostgreSQL acceptance worker',
        credential_sha256:workerTokenHash,
        max_concurrent_tasks:1,max_tasks_per_minute:60
      })]
    );
    const worker = register.rows[0].result.worker;
    assert.ok(worker.worker_id);
    assert.equal(worker.worker_status,'active');
    assert.equal(worker.allowed_providers[0],'openai');
    const storedHash = await client.query(
      'select credential_sha256 from ai_network.ai_task_workers where worker_id=$1::uuid',[worker.worker_id]
    );
    assert.equal(storedHash.rows[0].credential_sha256,workerTokenHash);

    const workerCommand = async (action,payload={}) => {
      const result = await client.query(
        'select public.minglora_ai_worker_command($1,$2,$3::jsonb) as result',
        [action,workerTokenHash,JSON.stringify(payload)]
      );
      return result.rows[0].result;
    };
    const adminCommand = async (action,payload={}) => {
      const result = await client.query(
        'select public.minglora_ai_worker_admin_command($1,$2::uuid,$3::jsonb) as result',
        [action,OWNER,JSON.stringify(payload)]
      );
      return result.rows[0].result;
    };

    const paused = await workerCommand('claim_next_task');
    assert.equal(paused.claimed,false);
    assert.equal(paused.reason,'runtime_paused_or_disabled');
    const enabled = await adminCommand('set_runtime_controls',{
      global_paused:false,execution_enabled:true,max_concurrent_workers:1
    });
    assert.equal(enabled.execution_enabled,true);

    const insertTask = async ({
      identityId=IDENTITY_A,title='Approved text generation task',
      taskType='text.generate',actionClass='content',
      taskPayload={prompt:PROMPT,max_output_tokens:200},maxAttempts=3,
      tokenBudget=0,costLimit=0,scheduledFor='now()',grantId=null,delegatedFrom=null
    }={}) => {
      const taskId=randomUUID();
      await client.query(`
        insert into ai_network.ai_task_queue(
          task_id,owner_user_id,identity_id,task_title,task_type,action_class,task_payload,
          status,priority,scheduled_for,max_attempts,token_budget,cost_limit_usd,
          created_by_user_id,delegation_grant_id,delegated_from_identity_id
        ) values (
          $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::jsonb,
          'queued',50,${scheduledFor},$8,$9,$10,$2::uuid,$11::uuid,$12::uuid
        )
      `,[
        taskId,OWNER,identityId,title,taskType,actionClass,JSON.stringify(taskPayload),
        maxAttempts,tokenBudget,costLimit,grantId,delegatedFrom
      ]);
      return taskId;
    };

    const deniedTaskId=await insertTask({title:'Permission-denied task'});
    await client.query(
      "insert into ai_network.ai_identity_permissions(identity_id,permission_key,resource_scope,effect) values ($1::uuid,'task.execute','*','deny')",
      [IDENTITY_A]
    );
    const denied=await workerCommand('claim_next_task');
    assert.equal(denied.claimed,false);
    const deniedState=await client.query('select status from ai_network.ai_task_queue where task_id=$1::uuid',[deniedTaskId]);
    assert.equal(deniedState.rows[0].status,'queued');
    await client.query(
      "delete from ai_network.ai_identity_permissions where identity_id=$1::uuid and effect='deny'",
      [IDENTITY_A]
    );
    await adminCommand('cancel_task',{
      task_id:deniedTaskId,reason:'Permission-denial acceptance test completed.'
    });

    const successTaskId=await insertTask({title:'Successful text generation task'});
    const successClaim=await workerCommand('claim_next_task');
    assert.equal(successClaim.claimed,true);
    assert.equal(successClaim.task.task_id,successTaskId);
    assert.equal(successClaim.route.provider,'openai');
    assert.equal(successClaim.route.model,MODEL_NAME);
    assert.match(successClaim.route.route_id,/^[0-9a-f-]{36}$/i);
    assert.equal(successClaim.identity_context.personality.tone,'warm');

    const blockedByConcurrency=await workerCommand('claim_next_task');
    assert.equal(blockedByConcurrency.claimed,false);
    assert.equal(blockedByConcurrency.reason,'global_concurrency_limit');
    const heartbeat=await workerCommand('heartbeat_task',{
      task_id:successTaskId,lease_token:successClaim.lease_token
    });
    assert.equal(heartbeat.renewed,true);

    const completion=await workerCommand('complete_task',{
      task_id:successTaskId,lease_token:successClaim.lease_token,
      task_result:{
        output:'Welcome to Minglora.',provider:'openai',model:MODEL_NAME,
        moderation:{input_flagged:false,output_flagged:false},external_action_taken:false
      },
      usage:{input_tokens:20,output_tokens:10,total_tokens:30},
      provider_request_id:'postgres-provider-request-1'
    });
    assert.equal(completion.completed,true);
    assert.equal(completion.status,'succeeded');
    const successHistory=await adminCommand('list_task_history',{task_id:successTaskId});
    assert.equal(successHistory.task.status,'succeeded');
    assert.equal(successHistory.task.task_result.output,'Welcome to Minglora.');
    assert.equal(successHistory.executions.length,1);
    assert.equal(successHistory.executions[0].execution_status,'succeeded');
    assert.equal(successHistory.executions[0].route_id,successClaim.route.route_id);

    const rateLimitedTaskId=await insertTask({title:'Provider rate limited task'});
    const rateLimited=await workerCommand('claim_next_task');
    assert.equal(rateLimited.claimed,false);
    assert.equal(rateLimited.reason,'provider_rate_limit');
    await client.query(
      "update ai_network.ai_task_provider_limits set max_tasks_per_minute=60 where provider_name='openai' and model_identifier='*'"
    );
    await adminCommand('cancel_task',{
      task_id:rateLimitedTaskId,reason:'Provider quota acceptance test completed.'
    });

    const grantId=randomUUID();
    await client.query(`
      insert into ai_network.ai_delegation_grants(
        delegation_grant_id,owner_user_id,grantor_identity_id,grantee_identity_id,grant_status,
        expires_at,allowed_task_types,allowed_action_classes,max_token_budget,max_cost_limit_usd
      ) values ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'active',now()+interval '1 hour',
        array['text.generate'],array['content'],10000,0.25)
    `,[grantId,OWNER,IDENTITY_A,IDENTITY_B]);
    const delegatedTaskId=await insertTask({
      identityId:IDENTITY_B,title:'Delegated task for the member identity',
      tokenBudget:1000,costLimit:0.05,grantId,delegatedFrom:IDENTITY_A
    });
    const delegatedClaim=await workerCommand('claim_next_task');
    assert.equal(delegatedClaim.claimed,true);
    assert.equal(delegatedClaim.task.task_id,delegatedTaskId);
    assert.equal(delegatedClaim.identity_context.personality.tone,'clear');
    const delegatedDone=await workerCommand('complete_task',{
      task_id:delegatedTaskId,lease_token:delegatedClaim.lease_token,
      task_result:{
        output:'Delegated summary complete.',provider:'openai',model:MODEL_NAME,
        moderation:{input_flagged:false,output_flagged:false},external_action_taken:false
      },
      usage:{input_tokens:30,output_tokens:20,total_tokens:50}
    });
    assert.equal(delegatedDone.status,'succeeded');

    const failureTaskId=await insertTask({title:'Retry and terminal failure task',maxAttempts:2});
    const failureClaim1=await workerCommand('claim_next_task');
    assert.equal(failureClaim1.task.task_id,failureTaskId);
    const retry=await workerCommand('fail_task',{
      task_id:failureTaskId,lease_token:failureClaim1.lease_token,
      error_code:'provider_503',failure_reason:'Temporary provider outage.',
      retryable:true,retry_after_seconds:5
    });
    assert.equal(retry.status,'queued');
    await client.query('update ai_network.ai_task_queue set scheduled_for=now() where task_id=$1::uuid',[failureTaskId]);
    const failureClaim2=await workerCommand('claim_next_task');
    assert.equal(failureClaim2.task.task_id,failureTaskId);
    const terminal=await workerCommand('fail_task',{
      task_id:failureTaskId,lease_token:failureClaim2.lease_token,
      error_code:'provider_503',failure_reason:'Provider remains unavailable.',
      retryable:true,retry_after_seconds:5
    });
    assert.equal(terminal.status,'failed');
    const failureHistory=await adminCommand('list_task_history',{task_id:failureTaskId});
    assert.deepEqual(failureHistory.executions.map(row=>row.execution_status),['retry_scheduled','failed']);
    assert.equal(failureHistory.task.status,'failed');

    const cancelledTaskId=await insertTask({title:'Running task cancelled by administrator'});
    const cancelClaim=await workerCommand('claim_next_task');
    assert.equal(cancelClaim.task.task_id,cancelledTaskId);
    const cancelled=await adminCommand('cancel_task',{
      task_id:cancelledTaskId,reason:'Administrator requested cancellation.'
    });
    assert.equal(cancelled.task.status,'cancelled');
    const cancelHistory=await adminCommand('list_task_history',{task_id:cancelledTaskId});
    assert.equal(cancelHistory.executions[0].execution_status,'cancelled');

    const timeoutTaskId=await insertTask({title:'Expired lease recovery task',maxAttempts:2});
    const timeoutClaim=await workerCommand('claim_next_task');
    assert.equal(timeoutClaim.task.task_id,timeoutTaskId);
    await client.query(
      "update ai_network.ai_task_queue set lease_expires_at=now()-interval '1 second' where task_id=$1::uuid",
      [timeoutTaskId]
    );
    const afterExpiry=await workerCommand('claim_next_task');
    assert.equal(afterExpiry.claimed,false);
    const timeoutState=await client.query(
      'select status,scheduled_for>now() as backed_off from ai_network.ai_task_queue where task_id=$1::uuid',
      [timeoutTaskId]
    );
    assert.equal(timeoutState.rows[0].status,'queued');
    assert.equal(timeoutState.rows[0].backed_off,true);
    const timeoutHistory=await adminCommand('list_task_history',{task_id:timeoutTaskId});
    assert.equal(timeoutHistory.executions[0].execution_status,'timed_out');

    const scheduledTaskId=await insertTask({
      title:'Future scheduled task',
      scheduledFor:"(now()+interval '1 hour')"
    });
    const beforeSchedule=await workerCommand('claim_next_task');
    assert.equal(beforeSchedule.claimed,false);
    await client.query('update ai_network.ai_task_queue set scheduled_for=now() where task_id=$1::uuid',[scheduledTaskId]);
    const afterSchedule=await workerCommand('claim_next_task');
    assert.equal(afterSchedule.claimed,true);
    assert.equal(afterSchedule.task.task_id,scheduledTaskId);
    await adminCommand('cancel_task',{
      task_id:scheduledTaskId,reason:'Acceptance test cleanup cancellation.'
    });

    await adminCommand('revoke_worker',{
      worker_id:worker.worker_id,reason:'PostgreSQL acceptance test cleanup.'
    });
    await assert.rejects(workerCommand('claim_next_task'),error=>error.code==='42501');

    const finalCounts=await client.query(
      'select status,count(*)::int as count from ai_network.ai_task_queue group by status'
    );
    const counts=Object.fromEntries(finalCounts.rows.map(row=>[row.status,row.count]));
    assert.equal(counts.succeeded,2);
    assert.equal(counts.failed,1);
    assert.equal(counts.cancelled,4);
    assert.equal(counts.queued,1); // the expired-lease task is delayed for safe recovery
    assert.equal(counts.running || 0,0);
  } finally {
    await client.query('reset role').catch(() => {});
    await client.end();
  }
});
