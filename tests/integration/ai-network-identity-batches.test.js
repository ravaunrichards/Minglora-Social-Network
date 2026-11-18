import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const migrationSql = readFileSync(
  new URL('../../supabase/migrations/20261118063000_minglora_ai_durable_identity_batches.sql', import.meta.url),
  'utf8'
);
const databaseUrl = process.env.AI_NETWORK_TEST_DATABASE_URL;

test('PostgreSQL 17: durable identity batches isolate failures, replay safely and retry only failed rows', {
  skip: !databaseUrl ? 'Requires an isolated AI_NETWORK_TEST_DATABASE_URL.' : false
}, async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      do $$
      begin
        create role service_role nologin bypassrls;
      exception when duplicate_object then null;
      end $$;
      do $$
      begin
        create role anon nologin;
      exception when duplicate_object then null;
      end $$;
      do $$
      begin
        create role authenticated nologin;
      exception when duplicate_object then null;
      end $$;
      create schema if not exists ai_network;
      create table if not exists public.profiles (
        id uuid primary key
      );
      insert into public.profiles(id) values
        ('11111111-1111-4111-8111-111111111111'),
        ('22222222-2222-4222-8222-222222222222')
      on conflict do nothing;
      create table if not exists ai_network.ai_identities (
        identity_id uuid primary key default gen_random_uuid(),
        owner_user_id uuid not null references public.profiles(id),
        idempotency_key text not null,
        unique(owner_user_id,idempotency_key)
      );
      create table if not exists public.ai_identity_batch_test_failures (
        idempotency_key text primary key
      );
      insert into public.ai_identity_batch_test_failures(idempotency_key)
      values ('batch-row-fail-0001') on conflict do nothing;
      grant usage on schema public,ai_network to service_role;
      grant select,insert,update on public.profiles,public.ai_identity_batch_test_failures,ai_network.ai_identities to service_role;
      grant delete on public.ai_identity_batch_test_failures to service_role;
      create or replace function public.minglora_ai_identity_command(
        p_action text,p_actor_user_id uuid,p_payload jsonb
      ) returns jsonb language plpgsql security invoker set search_path='' as $$
      declare
        v_identity_id uuid;
        v_key text := trim(coalesce(p_payload->>'idempotency_key',''));
      begin
        if p_action<>'create' or v_key='' then
          raise exception using errcode='22023',message='Invalid test identity command.';
        end if;
        if exists(select 1 from public.ai_identity_batch_test_failures f where f.idempotency_key=v_key) then
          raise exception using errcode='P0001',message='Deliberate retryable fixture failure.';
        end if;
        select i.identity_id into v_identity_id from ai_network.ai_identities i
        where i.owner_user_id=p_actor_user_id and i.idempotency_key=v_key;
        if v_identity_id is not null then
          return jsonb_build_object('identity',jsonb_build_object('identity_id',v_identity_id),'reused',true);
        end if;
        insert into ai_network.ai_identities(owner_user_id,idempotency_key)
        values(p_actor_user_id,v_key) returning identity_id into v_identity_id;
        return jsonb_build_object('identity',jsonb_build_object('identity_id',v_identity_id),'reused',false);
      end $$;
      grant execute on function public.minglora_ai_identity_command(text,uuid,jsonb) to service_role;
    `);

    await client.query(migrationSql);

    const owner = '11111111-1111-4111-8111-111111111111';
    const otherOwner = '22222222-2222-4222-8222-222222222222';
    const items = [
      { idempotency_key:'batch-row-success-0001',name:{first_name:'Maya',last_name:'Reid'} },
      { idempotency_key:'batch-row-fail-0001',name:{first_name:'Retry',last_name:'Nia'} },
      { idempotency_key:'batch-row-success-0002',name:{first_name:'Ava',last_name:'Campbell'} }
    ];
    const payload = {
      batch_idempotency_key:'identity-batch-test-key-0001',
      source:'postgres_acceptance',
      items
    };

    await client.query('set role service_role');
    const created = await client.query(
      'select public.minglora_ai_identity_batch_command($1,$2::uuid,$3::jsonb) as result',
      ['create_batch',owner,JSON.stringify(payload)]
    );
    const first = created.rows[0].result;
    assert.equal(first.requested_count,3);
    assert.equal(first.created_count,2);
    assert.equal(first.reused_count,0);
    assert.equal(first.failed_count,1);
    assert.equal(first.status,'partial');
    assert.equal(first.failed_rows.length,1);
    assert.equal(first.failed_rows[0].idempotency_key,'batch-row-fail-0001');

    const rowState = await client.query(`
      select status,request_payload is not null as payload_retained
      from ai_network.ai_identity_batch_rows
      where batch_id=$1 order by row_index
    `,[first.batch_id]);
    assert.deepEqual(rowState.rows,[
      {status:'created',payload_retained:false},
      {status:'failed',payload_retained:true},
      {status:'created',payload_retained:false}
    ]);
    const identityCount = await client.query('select count(*)::int as count from ai_network.ai_identities where owner_user_id=$1',[owner]);
    assert.equal(identityCount.rows[0].count,2);

    const replay = await client.query(
      'select public.minglora_ai_identity_batch_command($1,$2::uuid,$3::jsonb) as result',
      ['create_batch',owner,JSON.stringify(payload)]
    );
    assert.equal(replay.rows[0].result.replayed,true);
    const afterReplay = await client.query('select count(*)::int as count from ai_network.ai_identities where owner_user_id=$1',[owner]);
    assert.equal(afterReplay.rows[0].count,2,'Replaying the same batch must not create duplicate identities.');

    const alteredPayload = { ...payload, items:[...items,{idempotency_key:'batch-row-extra-0001'}] };
    await assert.rejects(
      client.query('select public.minglora_ai_identity_batch_command($1,$2::uuid,$3::jsonb)',[
        'create_batch',owner,JSON.stringify(alteredPayload)
      ]),
      error => error.code==='23505'
    );

    const privateList = await client.query(
      'select public.minglora_ai_identity_batch_command($1,$2::uuid,$3::jsonb) as result',
      ['list_batches',otherOwner,JSON.stringify({limit:10})]
    );
    assert.equal(privateList.rows[0].result.count,0,'Batch history must be owner-scoped.');
    await assert.rejects(
      client.query('select public.minglora_ai_identity_batch_command($1,$2::uuid,$3::jsonb)',[
        'retry_failed',otherOwner,JSON.stringify({batch_id:first.batch_id})
      ]),
      error => error.code==='P0002'
    );

    const firstRetry = await client.query(
      'select public.minglora_ai_identity_batch_command($1,$2::uuid,$3::jsonb) as result',
      ['retry_failed',owner,JSON.stringify({batch_id:first.batch_id})]
    );
    assert.equal(firstRetry.rows[0].result.failed_count,1);
    const stillFailed = await client.query(`
      select attempt_count,request_payload is not null as payload_retained
      from ai_network.ai_identity_batch_rows where batch_id=$1 and status='failed'
    `,[first.batch_id]);
    assert.equal(stillFailed.rows[0].attempt_count,2);
    assert.equal(stillFailed.rows[0].payload_retained,true);

    await client.query('delete from public.ai_identity_batch_test_failures where idempotency_key=$1',['batch-row-fail-0001']);
    const secondRetry = await client.query(
      'select public.minglora_ai_identity_batch_command($1,$2::uuid,$3::jsonb) as result',
      ['retry_failed',owner,JSON.stringify({batch_id:first.batch_id})]
    );
    assert.equal(secondRetry.rows[0].result.failed_count,0);
    assert.equal(secondRetry.rows[0].result.created_count,3);
    assert.equal(secondRetry.rows[0].result.status,'completed');

    const finalRows = await client.query(`
      select status,request_payload is not null as payload_retained
      from ai_network.ai_identity_batch_rows where batch_id=$1 order by row_index
    `,[first.batch_id]);
    assert.deepEqual(finalRows.rows,[
      {status:'created',payload_retained:false},
      {status:'created',payload_retained:false},
      {status:'created',payload_retained:false}
    ]);
    const finalCount = await client.query('select count(*)::int as count from ai_network.ai_identities where owner_user_id=$1',[owner]);
    assert.equal(finalCount.rows[0].count,3,'Retry must create exactly one identity for the previously failed row.');

    const noOpRetry = await client.query(
      'select public.minglora_ai_identity_batch_command($1,$2::uuid,$3::jsonb) as result',
      ['retry_failed',owner,JSON.stringify({batch_id:first.batch_id})]
    );
    assert.equal(noOpRetry.rows[0].result.created_count,3);
    assert.equal(noOpRetry.rows[0].result.failed_count,0);
    const events = await client.query('select count(*)::int as count from ai_network.ai_identity_batch_events where batch_id=$1',[first.batch_id]);
    assert.equal(events.rows[0].count,4,'Creation, both retries and the no-op retry must be auditable.');
  } finally {
    await client.query('reset role').catch(() => {});
    await client.end();
  }
});
