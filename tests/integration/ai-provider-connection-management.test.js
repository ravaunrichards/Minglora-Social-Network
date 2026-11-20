import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const migrationSql = readFileSync(
  new URL('../../supabase/migrations/20261120070700_minglora_ai_provider_connection_management.sql', import.meta.url),
  'utf8'
);
const databaseUrl = process.env.AI_NETWORK_TEST_DATABASE_URL;

test('PostgreSQL 17: provider health history, account gates and owner isolation', {
  skip: !databaseUrl ? 'Requires an isolated AI_NETWORK_TEST_DATABASE_URL.' : false
}, async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      do $$
      begin
        create role service_role nologin bypassrls;
      exception when duplicate_object then
        alter role service_role bypassrls;
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
        idempotency_key text not null unique,
        status text not null default 'active'
      );
      alter table ai_network.ai_identities
        add column if not exists status text not null default 'active';

      create table if not exists ai_network.ai_provider_accounts (
        provider_account_id uuid primary key default gen_random_uuid(),
        owner_user_id uuid references public.profiles(id),
        provider_name text not null,
        provider_identifier text not null check (length(trim(provider_identifier)) between 1 and 160),
        account_type text not null default 'platform'
          check (account_type in ('platform','organization','user','managed')),
        credential_secret_ref text,
        provider_configuration jsonb not null default '{}'::jsonb,
        status text not null default 'unconfigured'
          constraint ai_provider_accounts_status_check
          check (status in ('unconfigured','configured','restricted','revoked','disabled')),
        health_status text not null default 'unknown'
          check (health_status in ('unknown','healthy','degraded','unavailable')),
        assigned_at timestamptz not null default now(),
        last_checked_at timestamptz,
        updated_at timestamptz not null default now(),
        unique(owner_user_id,provider_name,provider_identifier)
      );

      create table if not exists ai_network.ai_provider_models (
        model_id uuid primary key default gen_random_uuid(),
        provider_name text not null,
        model_name text not null,
        model_identifier text not null,
        model_version text not null default '',
        model_capabilities text[] not null default '{}',
        supported_languages text[] not null default '{}',
        text_capability boolean not null default false,
        image_capability boolean not null default false,
        audio_capability boolean not null default false,
        video_capability boolean not null default false,
        voice_capability boolean not null default false,
        tool_capability boolean not null default false,
        is_active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique(provider_name,model_identifier,model_version)
      );

      create table if not exists ai_network.ai_provider_assignments (
        assignment_id uuid primary key default gen_random_uuid(),
        identity_id uuid not null references ai_network.ai_identities(identity_id),
        provider_account_id uuid references ai_network.ai_provider_accounts(provider_account_id),
        model_id uuid not null references ai_network.ai_provider_models(model_id),
        fallback_model_id uuid references ai_network.ai_provider_models(model_id),
        routing_priority integer not null default 100 check (routing_priority between 1 and 10000),
        assigned_capabilities text[] not null default '{}',
        supported_languages text[] not null default '{}',
        assignment_status text not null default 'pending'
          check (assignment_status in ('pending','active','restricted','disabled','revoked')),
        provider_health_status text not null default 'unknown'
          check (provider_health_status in ('unknown','healthy','degraded','unavailable')),
        assigned_at timestamptz not null default now(),
        last_checked_at timestamptz,
        updated_at timestamptz not null default now()
      );

      grant usage on schema public,ai_network to service_role;
      grant select,insert,update on public.profiles,ai_network.ai_identities,
        ai_network.ai_provider_accounts,ai_network.ai_provider_models,
        ai_network.ai_provider_assignments to service_role;
    `);

    // Preserve pre-existing account states while the migration replaces the status constraint.
    await client.query(`
      insert into ai_network.ai_provider_accounts(
        owner_user_id,provider_name,provider_identifier,account_type,status,health_status
      ) values
        ('11111111-1111-4111-8111-111111111111','openai','existing-configured','managed','configured','unknown'),
        ('11111111-1111-4111-8111-111111111111','anthropic','existing-restricted','managed','restricted','degraded')
      on conflict(owner_user_id,provider_name,provider_identifier) do nothing
    `);

    await client.query(migrationSql);

    const owner = '11111111-1111-4111-8111-111111111111';
    const otherOwner = '22222222-2222-4222-8222-222222222222';
    await client.query('set role service_role');
    const command = async (action, actor, payload = {}) => {
      const response = await client.query(
        'select public.minglora_ai_provider_command($1,$2::uuid,$3::jsonb) as result',
        [action, actor, JSON.stringify(payload)]
      );
      return response.rows[0].result;
    };

    const accountsBefore = await client.query(`
      select status from ai_network.ai_provider_accounts
      where provider_identifier in ('existing-configured','existing-restricted')
      order by provider_identifier
    `);
    assert.deepEqual(accountsBefore.rows.map(row => row.status), ['configured','restricted']);

    const created = await command('create_provider_account', owner, {
      provider_name:'openai',
      provider_identifier:'managed-integration-test',
      account_type:'managed'
    });
    const account = created.provider_account;
    assert.ok(account.provider_account_id);
    assert.equal(account.status,'unconfigured');
    assert.equal(account.health_status,'unknown');
    assert.equal(created.reused,false);

    const identity = await client.query(`
      insert into ai_network.ai_identities(owner_user_id,idempotency_key,status)
      values($1,'provider-health-integration-identity','active')
      returning identity_id
    `,[owner]);
    const model = await command('create_provider_model',owner,{
      provider_name:'openai',
      model_name:'Integration model',
      model_identifier:'gpt-provider-health-test',
      model_version:'integration',
      model_capabilities:['text'],
      supported_languages:[],
      text_capability:true
    });
    const modelId = model.model.model_id;
    await client.query(`
      insert into ai_network.ai_provider_assignments(
        identity_id,provider_account_id,model_id,assignment_status
      ) values($1,$2,$3,'pending')
    `,[identity.rows[0].identity_id,account.provider_account_id,modelId]);

    const health = await command('record_provider_health',owner,{
      provider_account_id:account.provider_account_id,
      provider_name:'openai',
      health_status:'healthy',
      model_identifier:'gpt-provider-health-test',
      response_time_ms:18,
      error_code:'',
      reason:'Authenticated provider model-list check completed.',
      metadata:{discovery_only:true,model_count:1}
    });
    assert.equal(health.health_event.health_status,'healthy');
    assert.ok(health.health_event.event_id);

    const accountHealth = await client.query(`
      select health_status,status,last_checked_at
      from ai_network.ai_provider_accounts where provider_account_id=$1
    `,[account.provider_account_id]);
    assert.equal(accountHealth.rows[0].health_status,'healthy');
    assert.equal(accountHealth.rows[0].status,'unconfigured');
    assert.ok(accountHealth.rows[0].last_checked_at);

    const assignmentHealth = await client.query(`
      select provider_health_status,last_checked_at
      from ai_network.ai_provider_assignments where provider_account_id=$1
    `,[account.provider_account_id]);
    assert.equal(assignmentHealth.rows[0].provider_health_status,'healthy');
    assert.ok(assignmentHealth.rows[0].last_checked_at);

    const history = await command('list_provider_health',owner,{
      provider_account_id:account.provider_account_id
    });
    assert.equal(history.length,1);
    assert.equal(history[0].event_id,health.health_event.event_id);
    const otherOwnerHistory = await command('list_provider_health',otherOwner,{
      provider_account_id:account.provider_account_id
    });
    assert.deepEqual(otherOwnerHistory,[],'Provider health history must remain owner-scoped.');

    await assert.rejects(
      command('set_provider_account_status',owner,{
        provider_account_id:account.provider_account_id,
        status:'enabled',
        reason:'A model-list check alone must not enable the provider.'
      }),
      error => error.code==='22023'
    );

    const inferenceEvent = await command('record_provider_health',owner,{
      provider_account_id:account.provider_account_id,
      provider_name:'openai',
      health_status:'healthy',
      model_identifier:'gpt-provider-health-test',
      response_time_ms:36,
      reason:'Bounded static inference verification succeeded. Output was withheld.',
      metadata:{inference_verification_attempt:true,inference_verified:true,verification_type:'fixed_prompt'}
    });
    assert.equal(inferenceEvent.health_event.metadata.inference_verified,true);

    const enabled = await command('set_provider_account_status',owner,{
      provider_account_id:account.provider_account_id,
      status:'enabled',
      reason:'Fresh provider inference verification passed.'
    });
    assert.equal(enabled.provider_account.status,'enabled');

    await command('set_provider_account_status',owner,{
      provider_account_id:account.provider_account_id,
      status:'disabled',
      reason:'Disable during integration test.'
    });

    await command('record_provider_health',owner,{
      provider_account_id:account.provider_account_id,
      provider_name:'openai',
      health_status:'degraded',
      response_time_ms:1200,
      reason:'Provider returned a degraded test state.',
      metadata:{discovery_only:true}
    });
    const degraded = await client.query(`
      select health_status,status from ai_network.ai_provider_accounts
      where provider_account_id=$1
    `,[account.provider_account_id]);
    assert.equal(degraded.rows[0].health_status,'degraded');
    assert.equal(degraded.rows[0].status,'disabled');

    await assert.rejects(
      command('set_provider_account_status',owner,{
        provider_account_id:account.provider_account_id,
        status:'enabled',
        reason:'Must fail while provider health is degraded.'
      }),
      error => error.code==='22023'
    );

    await command('record_provider_health',owner,{
      provider_account_id:account.provider_account_id,
      provider_name:'openai',
      health_status:'healthy',
      response_time_ms:12,
      reason:'Healthy state restored.',
      metadata:{discovery_only:true}
    });
    await command('set_provider_account_status',owner,{
      provider_account_id:account.provider_account_id,
      status:'revoked',
      reason:'Revoke integration account.'
    });
    await assert.rejects(
      command('set_provider_account_status',owner,{
        provider_account_id:account.provider_account_id,
        status:'enabled',
        reason:'Revoked accounts cannot reactivate.'
      }),
      error => error.code==='22023'
    );

    await assert.rejects(
      command('record_provider_health',owner,{
        provider_account_id:account.provider_account_id,
        provider_name:'openai',
        health_status:'healthy',
        reason:'Revoked accounts cannot accept health writes.'
      }),
      error => error.code==='22023'
    );

    const userManaged = await command('create_provider_account',owner,{
      provider_name:'anthropic',
      provider_identifier:'user-managed-integration-test',
      account_type:'user'
    });
    await assert.rejects(
      command('record_provider_health',owner,{
        provider_account_id:userManaged.provider_account.provider_account_id,
        provider_name:'anthropic',
        health_status:'healthy',
        reason:'User-managed account must not inherit platform credentials.'
      }),
      error => error.code==='42501'
    );

    await assert.rejects(
      command('create_provider_account',owner,{
        provider_name:'openai',
        provider_identifier:'secret-payload-test',
        account_type:'managed',
        api_key:'must-not-be-accepted'
      }),
      error => error.code==='22023'
    );

    const preserved = await client.query(`
      select status from ai_network.ai_provider_accounts
      where provider_identifier in ('existing-configured','existing-restricted')
      order by provider_identifier
    `);
    assert.deepEqual(preserved.rows.map(row => row.status), ['configured','restricted']);

    await client.query('reset role');
  } finally {
    try { await client.query('reset role'); } catch {}
    await client.end();
  }
});
