-- Minglora AI Network: independently authenticated worker principals.
-- Credentials are high-entropy bearer tokens; only SHA-256 digests are persisted.
-- Worker execution remains subject to the existing global pause and zero-worker default.
-- Workers are restricted to read_only/content tasks until separately approved adapters exist.

create table if not exists ai_network.ai_worker_principals (
  worker_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  worker_name text not null check (length(trim(worker_name)) between 2 and 120),
  credential_sha256 text unique check (credential_sha256 is null or credential_sha256 ~ '^[0-9a-f]{64}
  credential_expires_at timestamptz not null,
  credential_version integer not null default 1 check (credential_version between 1 and 1000000),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  allowed_action_classes text[] not null default array['read_only','content']::text[],
  max_concurrent_tasks integer not null default 1 check (max_concurrent_tasks between 1 and 32),
  last_authenticated_at timestamptz,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  revoked_at timestamptz,
  revocation_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id, owner_user_id),
  check (
    cardinality(allowed_action_classes) between 1 and 2
    and allowed_action_classes <@ array['read_only','content']::text[]
  ),
  check ((status='revoked' and credential_sha256 is null and revoked_at is not null)
      or (status='expired' and credential_sha256 is null)
      or (status='active' and credential_sha256 is not null and revoked_at is null))
);

create index if not exists ai_worker_principals_owner_status_idx
  on ai_network.ai_worker_principals(owner_user_id,status,created_at desc);

create table if not exists ai_network.ai_worker_identity_grants (
  worker_id uuid not null,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(worker_id,identity_id),
  foreign key(worker_id,owner_user_id)
    references ai_network.ai_worker_principals(worker_id,owner_user_id) on delete restrict
);

create index if not exists ai_worker_identity_grants_owner_identity_idx
  on ai_network.ai_worker_identity_grants(owner_user_id,identity_id,worker_id);

create table if not exists ai_network.ai_worker_events (
  event_id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references ai_network.ai_worker_principals(worker_id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_type text not null check (actor_type in ('human_user','worker','system')),
  actor_user_id uuid references public.profiles(id) on delete restrict,
  event_type text not null check (length(trim(event_type)) between 3 and 80),
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now()
);

create index if not exists ai_worker_events_owner_worker_time_idx
  on ai_network.ai_worker_events(owner_user_id,worker_id,occurred_at desc);

alter table ai_network.ai_worker_principals enable row level security;
alter table ai_network.ai_worker_identity_grants enable row level security;
alter table ai_network.ai_worker_events enable row level security;

revoke all on ai_network.ai_worker_principals, ai_network.ai_worker_identity_grants, ai_network.ai_worker_events
  from public, anon, authenticated;
grant select, insert, update on ai_network.ai_worker_principals to service_role;
grant select, insert, delete on ai_network.ai_worker_identity_grants to service_role;
grant select, insert on ai_network.ai_worker_events to service_role;

create or replace function public.minglora_ai_worker_admin_command(
  p_action text,
  p_actor_user_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_action text := lower(coalesce(p_action,''));
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_worker_id uuid;
  v_worker ai_network.ai_worker_principals%rowtype;
  v_worker_name text;
  v_credential_sha256 text;
  v_expires_at timestamptz;
  v_identity_ids uuid[];
  v_allowed_classes text[];
  v_max_concurrent integer;
  v_reason text;
  v_count integer;
  v_result jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI worker administration is restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora administrator is required.';
  end if;
  if jsonb_typeof(v_payload)<>'object'
     or v_payload::text ~* '"(token|api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
    raise exception using errcode = '22023', message = 'Worker administration accepts metadata and credential digests only.';
  end if;

  if v_action='create_worker' then
    v_worker_name := left(trim(coalesce(v_payload->>'worker_name','')),120);
    v_credential_sha256 := lower(trim(coalesce(v_payload->>'credential_sha256','')));
    v_expires_at := nullif(v_payload->>'credential_expires_at','')::timestamptz;
    v_max_concurrent := coalesce(nullif(v_payload->>'max_concurrent_tasks','')::integer,1);

    if length(v_worker_name)<2 then
      raise exception using errcode = '22023', message = 'A worker name between 2 and 120 characters is required.';
    end if;
    if v_credential_sha256 !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023', message = 'A SHA-256 worker credential digest is required.';
    end if;
    if v_expires_at is null or v_expires_at<=now() or v_expires_at>now()+interval '24 hours' then
      raise exception using errcode = '22023', message = 'Worker credentials must expire within the next 24 hours.';
    end if;
    if v_max_concurrent<1 or v_max_concurrent>32 then
      raise exception using errcode = '22023', message = 'Worker concurrency must be between 1 and 32.';
    end if;
    if jsonb_typeof(v_payload->'identity_ids')<>'array'
       or jsonb_array_length(v_payload->'identity_ids')<1
       or jsonb_array_length(v_payload->'identity_ids')>100 then
      raise exception using errcode = '22023', message = 'Select between 1 and 100 AI identities for this worker.';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(v_payload->'identity_ids') x(value)
      where x.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
      raise exception using errcode = '22023', message = 'Every worker identity grant must be a valid AI identity ID.';
    end if;
    select array_agg(x.value::uuid order by x.ordinality)
      into v_identity_ids
    from jsonb_array_elements_text(v_payload->'identity_ids') with ordinality x(value,ordinality);
    select count(distinct x.value::uuid)::integer
      into v_count
    from jsonb_array_elements_text(v_payload->'identity_ids') x(value);
    if v_count<>cardinality(v_identity_ids) then
      raise exception using errcode = '22023', message = 'Duplicate AI identity grants are not allowed.';
    end if;
    select count(*)::integer into v_count
    from ai_network.ai_identities i
    where i.identity_id=any(v_identity_ids)
      and i.owner_user_id=p_actor_user_id
      and i.status='active' and i.enabled=true;
    if v_count<>cardinality(v_identity_ids) then
      raise exception using errcode = '42501', message = 'Every granted AI identity must be active, enabled and owned by this administrator.';
    end if;

    if v_payload ? 'allowed_action_classes' then
      if jsonb_typeof(v_payload->'allowed_action_classes')<>'array'
         or jsonb_array_length(v_payload->'allowed_action_classes')<1
         or jsonb_array_length(v_payload->'allowed_action_classes')>2 then
        raise exception using errcode = '22023', message = 'Worker action classes must be read_only and/or content.';
      end if;
      select array_agg(distinct x.value order by x.value)
        into v_allowed_classes
      from jsonb_array_elements_text(v_payload->'allowed_action_classes') x(value);
    else
      v_allowed_classes := array['read_only','content']::text[];
    end if;
    if cardinality(v_allowed_classes)<1 or cardinality(v_allowed_classes)>2
       or not (v_allowed_classes <@ array['read_only','content']::text[]) then
      raise exception using errcode = '22023', message = 'Workers may only receive read_only and/or content task permissions.';
    end if;

    insert into ai_network.ai_worker_principals(
      owner_user_id,worker_name,credential_sha256,credential_expires_at,
      allowed_action_classes,max_concurrent_tasks,created_by_user_id
    ) values (
      p_actor_user_id,v_worker_name,v_credential_sha256,v_expires_at,
      v_allowed_classes,v_max_concurrent,p_actor_user_id
    ) returning * into v_worker;

    insert into ai_network.ai_worker_identity_grants(worker_id,owner_user_id,identity_id)
    select v_worker.worker_id,p_actor_user_id,x.identity_id
    from unnest(v_identity_ids) x(identity_id);

    insert into ai_network.ai_worker_events(
      worker_id,owner_user_id,actor_type,actor_user_id,event_type,reason,metadata
    ) values (
      v_worker.worker_id,p_actor_user_id,'human_user',p_actor_user_id,'worker_created','Worker principal created with bounded capabilities.',
      jsonb_build_object('allowed_action_classes',v_allowed_classes,'max_concurrent_tasks',v_max_concurrent,'identity_count',cardinality(v_identity_ids),'credential_expires_at',v_expires_at)
    );
    return jsonb_build_object(
      'worker',jsonb_build_object(
        'worker_id',v_worker.worker_id,'worker_name',v_worker.worker_name,'status',v_worker.status,
        'credential_expires_at',v_worker.credential_expires_at,'credential_version',v_worker.credential_version,
        'allowed_action_classes',v_worker.allowed_action_classes,'max_concurrent_tasks',v_worker.max_concurrent_tasks,
        'created_at',v_worker.created_at,'identity_ids',to_jsonb(v_identity_ids)
      ),
      'credential_digest_stored',true
    );
  end if;

  if v_action='list_workers' then
    select coalesce(jsonb_agg(row_data.worker order by row_data.created_at desc),'[]'::jsonb)
      into v_result
    from (
      select p.created_at,jsonb_build_object(
        'worker_id',p.worker_id,'worker_name',p.worker_name,'status',
        case when p.status='active' and p.credential_expires_at<=now() then 'expired' else p.status end,
        'credential_expires_at',p.credential_expires_at,'credential_version',p.credential_version,
        'allowed_action_classes',p.allowed_action_classes,'max_concurrent_tasks',p.max_concurrent_tasks,
        'last_authenticated_at',p.last_authenticated_at,'created_at',p.created_at,
        'revoked_at',p.revoked_at,'revocation_reason',p.revocation_reason,
        'identity_ids',coalesce((
          select jsonb_agg(g.identity_id order by g.created_at)
          from ai_network.ai_worker_identity_grants g
          where g.worker_id=p.worker_id and g.owner_user_id=p_actor_user_id
        ),'[]'::jsonb)
      ) as worker
      from ai_network.ai_worker_principals p
      where p.owner_user_id=p_actor_user_id
    ) row_data;
    return jsonb_build_object('workers',coalesce(v_result,'[]'::jsonb));
  end if;

  if v_action in ('rotate_worker','revoke_worker') then
    if coalesce(v_payload->>'worker_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid worker ID is required.';
    end if;
    v_worker_id := (v_payload->>'worker_id')::uuid;
    select * into v_worker
    from ai_network.ai_worker_principals p
    where p.worker_id=v_worker_id and p.owner_user_id=p_actor_user_id
    for update;
    if v_worker.worker_id is null then
      raise exception using errcode = 'P0002', message = 'Worker principal was not found.';
    end if;

    if v_action='rotate_worker' then
      v_credential_sha256 := lower(trim(coalesce(v_payload->>'credential_sha256','')));
      v_expires_at := nullif(v_payload->>'credential_expires_at','')::timestamptz;
      if v_credential_sha256 !~ '^[0-9a-f]{64}$' then
        raise exception using errcode = '22023', message = 'A SHA-256 worker credential digest is required.';
      end if;
      if v_expires_at is null or v_expires_at<=now() or v_expires_at>now()+interval '24 hours' then
        raise exception using errcode = '22023', message = 'Worker credentials must expire within the next 24 hours.';
      end if;
      update ai_network.ai_worker_principals p
      set credential_sha256=v_credential_sha256,credential_expires_at=v_expires_at,
          credential_version=p.credential_version+1,status='active',revoked_at=null,
          revocation_reason='',updated_at=now()
      where p.worker_id=v_worker_id and p.owner_user_id=p_actor_user_id;
    else
      v_reason := left(trim(coalesce(v_payload->>'reason','Revoked by administrator.')),500);
      update ai_network.ai_worker_principals p
      set credential_sha256=null,status='revoked',revoked_at=now(),
          revocation_reason=v_reason,updated_at=now()
      where p.worker_id=v_worker_id and p.owner_user_id=p_actor_user_id;
    end if;

    with released as (
      update ai_network.ai_task_queue q
      set status=case when q.attempt_count<q.max_attempts then 'queued' else 'failed' end,
          worker_id=null,lease_token=null,lease_expires_at=null,
          finished_at=case when q.attempt_count<q.max_attempts then null else now() end,
          failure_reason=case when v_action='revoke_worker' then 'Worker credential revoked while task was leased.' else 'Worker credential rotated while task was leased.' end,
          scheduled_for=case when q.attempt_count<q.max_attempts then now() else q.scheduled_for end,
          updated_at=now()
      where q.owner_user_id=p_actor_user_id and q.worker_id=v_worker_id::text and q.status='running'
      returning q.task_id,q.status
    )
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason)
    select p_actor_user_id,r.task_id,'system',v_worker_id::text,
      case when v_action='revoke_worker' then 'worker_revoked_lease_released' else 'worker_rotated_lease_released' end,
      'running',r.status,'Leased task released after worker credential lifecycle change.'
    from released r;

    insert into ai_network.ai_worker_events(
      worker_id,owner_user_id,actor_type,actor_user_id,event_type,reason,metadata
    ) values (
      v_worker_id,p_actor_user_id,'human_user',p_actor_user_id,
      case when v_action='revoke_worker' then 'worker_revoked' else 'worker_credential_rotated' end,
      case when v_action='revoke_worker' then v_reason else 'Credential rotated; prior bearer credential invalidated.' end,
      jsonb_build_object('credential_version',v_worker.credential_version + case when v_action='rotate_worker' then 1 else 0 end)
    );
    select p.* into v_worker
    from ai_network.ai_worker_principals p
    where p.worker_id=v_worker_id and p.owner_user_id=p_actor_user_id;
    return jsonb_build_object('worker',jsonb_build_object(
      'worker_id',v_worker.worker_id,'worker_name',v_worker.worker_name,'status',v_worker.status,
      'credential_expires_at',v_worker.credential_expires_at,'credential_version',v_worker.credential_version,
      'allowed_action_classes',v_worker.allowed_action_classes,'max_concurrent_tasks',v_worker.max_concurrent_tasks
    ));
  end if;

  raise exception using errcode = '22023', message = 'Unsupported AI worker administration command.';
end;
$function$;

create or replace function public.minglora_ai_worker_runtime_command(
  p_action text,
  p_credential_sha256 text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_action text := lower(coalesce(p_action,''));
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_worker ai_network.ai_worker_principals%rowtype;
  v_task ai_network.ai_task_queue%rowtype;
  v_task_id uuid;
  v_lease_token uuid;
  v_lease_seconds integer;
  v_global_max integer;
  v_global_paused boolean;
  v_execution_enabled boolean;
  v_running_count integer;
  v_attempt_count integer;
  v_status text;
  v_reason text;
  v_task_result jsonb;
  v_result jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI worker runtime is restricted to the Minglora server runtime.';
  end if;
  if p_credential_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '42501', message = 'Worker authentication failed.';
  end if;
  if jsonb_typeof(v_payload)<>'object'
     or v_payload::text ~* '"(token|api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
    raise exception using errcode = '22023', message = 'Worker task payloads cannot contain credentials or secret fields.';
  end if;
  if v_action not in ('claim_next_task','heartbeat_task','complete_task','fail_task') then
    raise exception using errcode = '22023', message = 'Unsupported AI worker runtime command.';
  end if;

  select p.* into v_worker
  from ai_network.ai_worker_principals p
  where p.credential_sha256=p_credential_sha256
  for update;
  if v_worker.worker_id is null then
    raise exception using errcode = '42501', message = 'Worker authentication failed.';
  end if;
  if v_worker.status<>'active' or v_worker.credential_expires_at<=now() then
    if v_worker.status='active' and v_worker.credential_expires_at<=now() then
      update ai_network.ai_worker_principals p
      set status='expired',credential_sha256=null,updated_at=now()
      where p.worker_id=v_worker.worker_id;
      insert into ai_network.ai_worker_events(worker_id,owner_user_id,actor_type,event_type,reason)
      values (v_worker.worker_id,v_worker.owner_user_id,'system','worker_credential_expired','Worker credential expired and was invalidated.');
    end if;
    raise exception using errcode = '42501', message = 'Worker credential is expired or revoked.';
  end if;
  if not exists(select 1 from public.profiles p where p.id=v_worker.owner_user_id) then
    raise exception using errcode = '42501', message = 'Worker owner is no longer available.';
  end if;

  update ai_network.ai_worker_principals p
  set last_authenticated_at=now(),updated_at=now()
  where p.worker_id=v_worker.worker_id;

  if v_action='claim_next_task' then
    select c.global_paused,c.execution_enabled,c.max_concurrent_workers,c.lease_seconds
      into v_global_paused,v_execution_enabled,v_global_max,v_lease_seconds
    from ai_network.ai_task_runtime_controls c
    where c.control_key='primary'
    for share;
    if not found or coalesce(v_global_paused,true) or not coalesce(v_execution_enabled,false) or coalesce(v_global_max,0)=0 then
      return jsonb_build_object('claimed',false,'reason','runtime_paused_or_disabled');
    end if;

    with expired as (
      update ai_network.ai_task_queue q
      set status=case when q.attempt_count>=q.max_attempts then 'failed' else 'queued' end,
          worker_id=null,lease_token=null,lease_expires_at=null,
          finished_at=case when q.attempt_count>=q.max_attempts then now() else null end,
          updated_at=now()
      where q.owner_user_id=v_worker.owner_user_id and q.worker_id=v_worker.worker_id::text
        and q.status='running' and q.lease_expires_at<now()
      returning q.task_id,q.status
    )
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason)
    select v_worker.owner_user_id,e.task_id,'system',v_worker.worker_id::text,'worker_lease_expired','running',e.status,
      'Expired worker lease was recovered by the authenticated worker.'
    from expired e;

    select count(*)::integer into v_running_count
    from ai_network.ai_task_queue q
    where q.status='running' and q.lease_expires_at>now();
    if v_running_count>=v_global_max then
      return jsonb_build_object('claimed',false,'reason','global_worker_limit_reached');
    end if;

    select count(*)::integer into v_running_count
    from ai_network.ai_task_queue q
    where q.owner_user_id=v_worker.owner_user_id and q.worker_id=v_worker.worker_id::text
      and q.status='running' and q.lease_expires_at>now();
    if v_running_count>=v_worker.max_concurrent_tasks then
      return jsonb_build_object('claimed',false,'reason','worker_concurrency_limit_reached');
    end if;

    select q.* into v_task
    from ai_network.ai_task_queue q
    where q.owner_user_id=v_worker.owner_user_id
      and q.status='queued' and q.scheduled_for<=now() and q.attempt_count<q.max_attempts
      and q.action_class=any(v_worker.allowed_action_classes)
      and exists (
        select 1 from ai_network.ai_worker_identity_grants g
        where g.worker_id=v_worker.worker_id and g.owner_user_id=v_worker.owner_user_id
          and g.identity_id=q.identity_id
      )
      and exists (
        select 1 from ai_network.ai_identities i
        where i.identity_id=q.identity_id and i.owner_user_id=v_worker.owner_user_id
          and i.status='active' and i.enabled=true
      )
      and exists (
        select 1 from ai_network.ai_provider_assignments a
        join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
        where a.identity_id=q.identity_id and a.assignment_status='active'
          and a.provider_health_status='healthy' and pa.status='configured' and pa.health_status='healthy'
      )
    order by q.priority asc,q.scheduled_for asc,q.created_at asc
    for update skip locked limit 1;
    if v_task.task_id is null then
      return jsonb_build_object('claimed',false,'reason','no_due_task_with_granted_identity_and_healthy_provider');
    end if;

    v_lease_token := gen_random_uuid();
    update ai_network.ai_task_queue q
    set status='running',worker_id=v_worker.worker_id::text,lease_token=v_lease_token,
        lease_expires_at=now()+make_interval(secs=>v_lease_seconds),
        attempt_count=q.attempt_count+1,started_at=coalesce(q.started_at,now()),updated_at=now()
    where q.task_id=v_task.task_id and q.owner_user_id=v_worker.owner_user_id
    returning q.* into v_task;
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason)
    values (v_worker.owner_user_id,v_task.task_id,'worker',v_worker.worker_id::text,'worker_claimed','queued','running',
      'Authenticated worker acquired a bounded task lease.');
    return jsonb_build_object(
      'claimed',true,'task_id',v_task.task_id,'identity_id',v_task.identity_id,
      'task_type',v_task.task_type,'task_title',v_task.task_title,'action_class',v_task.action_class,
      'task_payload',v_task.task_payload,'token_budget',v_task.token_budget,'cost_limit_usd',v_task.cost_limit_usd,
      'attempt_count',v_task.attempt_count,'max_attempts',v_task.max_attempts,
      'worker_id',v_worker.worker_id,'lease_token',v_lease_token,'lease_expires_at',v_task.lease_expires_at
    );
  end if;

  if coalesce(v_payload->>'task_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(v_payload->>'lease_token','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'A valid task and lease token are required.';
  end if;
  v_task_id := (v_payload->>'task_id')::uuid;
  v_lease_token := (v_payload->>'lease_token')::uuid;

  select q.* into v_task
  from ai_network.ai_task_queue q
  where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id
    and q.worker_id=v_worker.worker_id::text and q.lease_token=v_lease_token
    and q.status='running' and q.lease_expires_at>now()
    and q.action_class=any(v_worker.allowed_action_classes)
    and exists (
      select 1 from ai_network.ai_worker_identity_grants g
      where g.worker_id=v_worker.worker_id and g.owner_user_id=v_worker.owner_user_id
        and g.identity_id=q.identity_id
    )
    and exists (
      select 1 from ai_network.ai_identities i
      where i.identity_id=q.identity_id and i.owner_user_id=v_worker.owner_user_id
        and i.status='active' and i.enabled=true
    )
  for update;
  if v_task.task_id is null then
    raise exception using errcode = '42501', message = 'Worker task lease is invalid, expired or no longer authorized.';
  end if;

  if v_action='heartbeat_task' then
    select c.lease_seconds into v_lease_seconds
    from ai_network.ai_task_runtime_controls c where c.control_key='primary';
    if not found then
      raise exception using errcode = '55000', message = 'AI worker runtime controls are unavailable.';
    end if;
    update ai_network.ai_task_queue q
    set lease_expires_at=now()+make_interval(secs=>v_lease_seconds),updated_at=now()
    where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id;
    return jsonb_build_object('renewed',true,'lease_seconds',v_lease_seconds);
  elsif v_action='complete_task' then
    v_task_result := coalesce(v_payload->'task_result','{}'::jsonb);
    if jsonb_typeof(v_task_result)<>'object' or octet_length(v_task_result::text)>65536
       or v_task_result::text ~* '"(token|api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
      raise exception using errcode = '22023', message = 'Task result must be a safe JSON object no larger than 64 KB.';
    end if;
    update ai_network.ai_task_queue q
    set status='succeeded',task_result=v_task_result,worker_id=null,lease_token=null,
        lease_expires_at=null,finished_at=now(),updated_at=now()
    where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id;
    v_status := 'succeeded';
    v_reason := 'Authenticated worker reported successful completion.';
  elsif v_action='fail_task' then
    v_reason := left(trim(coalesce(v_payload->>'failure_reason','Worker task failed.')),1000);
    if v_reason ~* '(api[_ -]?key|access[_ -]?token|password|secret|authorization|cookie|credential)[[:space:]:=]' then
      v_reason := 'Worker reported a failure; sensitive details were suppressed.';
    end if;
    v_status := case when v_task.attempt_count<v_task.max_attempts then 'queued' else 'failed' end;
    update ai_network.ai_task_queue q
    set status=v_status,failure_reason=v_reason,
        scheduled_for=case when v_status='queued' then now()+make_interval(secs=>least(3600,15*(2^greatest(v_task.attempt_count-1,0))::integer)) else q.scheduled_for end,
        worker_id=null,lease_token=null,lease_expires_at=null,
        finished_at=case when v_status='failed' then now() else null end,updated_at=now()
    where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id;
  end if;

  insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason)
  values (v_worker.owner_user_id,v_task_id,'worker',v_worker.worker_id::text,v_action,'running',v_status,v_reason);
  select to_jsonb(q) into v_result
  from ai_network.ai_task_queue q
  where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id;
  return jsonb_build_object('task',v_result);
end;
$function$;

comment on function public.minglora_ai_worker_admin_command(text,uuid,jsonb)
  is 'Owner-authorized worker principal lifecycle; stores only credential digests and bounded identity grants.';
comment on function public.minglora_ai_worker_runtime_command(text,text,jsonb)
  is 'Bearer-authenticated worker task leases; enforces identity grants, capability classes, expiry and runtime controls.';

revoke all on function public.minglora_ai_worker_admin_command(text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.minglora_ai_worker_runtime_command(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_worker_admin_command(text,uuid,jsonb) to service_role;
grant execute on function public.minglora_ai_worker_runtime_command(text,text,jsonb) to service_role;
),
  credential_expires_at timestamptz not null,
  credential_version integer not null default 1 check (credential_version between 1 and 1000000),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  allowed_action_classes text[] not null default array['read_only','content']::text[],
  max_concurrent_tasks integer not null default 1 check (max_concurrent_tasks between 1 and 32),
  last_authenticated_at timestamptz,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  revoked_at timestamptz,
  revocation_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id, owner_user_id),
  check (
    cardinality(allowed_action_classes) between 1 and 2
    and allowed_action_classes <@ array['read_only','content']::text[]
  ),
  check ((status='revoked' and credential_sha256 is null and revoked_at is not null)
      or (status='expired' and credential_sha256 is null)
      or (status='active' and credential_sha256 is not null and revoked_at is null))
);

create index if not exists ai_worker_principals_owner_status_idx
  on ai_network.ai_worker_principals(owner_user_id,status,created_at desc);

create table if not exists ai_network.ai_worker_identity_grants (
  worker_id uuid not null,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(worker_id,identity_id),
  foreign key(worker_id,owner_user_id)
    references ai_network.ai_worker_principals(worker_id,owner_user_id) on delete restrict
);

create index if not exists ai_worker_identity_grants_owner_identity_idx
  on ai_network.ai_worker_identity_grants(owner_user_id,identity_id,worker_id);

create table if not exists ai_network.ai_worker_events (
  event_id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references ai_network.ai_worker_principals(worker_id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_type text not null check (actor_type in ('human_user','worker','system')),
  actor_user_id uuid references public.profiles(id) on delete restrict,
  event_type text not null check (length(trim(event_type)) between 3 and 80),
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now()
);

create index if not exists ai_worker_events_owner_worker_time_idx
  on ai_network.ai_worker_events(owner_user_id,worker_id,occurred_at desc);

alter table ai_network.ai_worker_principals enable row level security;
alter table ai_network.ai_worker_identity_grants enable row level security;
alter table ai_network.ai_worker_events enable row level security;

revoke all on ai_network.ai_worker_principals, ai_network.ai_worker_identity_grants, ai_network.ai_worker_events
  from public, anon, authenticated;
grant select, insert, update on ai_network.ai_worker_principals to service_role;
grant select, insert, delete on ai_network.ai_worker_identity_grants to service_role;
grant select, insert on ai_network.ai_worker_events to service_role;

create or replace function public.minglora_ai_worker_admin_command(
  p_action text,
  p_actor_user_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_action text := lower(coalesce(p_action,''));
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_worker_id uuid;
  v_worker ai_network.ai_worker_principals%rowtype;
  v_worker_name text;
  v_credential_sha256 text;
  v_expires_at timestamptz;
  v_identity_ids uuid[];
  v_allowed_classes text[];
  v_max_concurrent integer;
  v_reason text;
  v_count integer;
  v_result jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI worker administration is restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora administrator is required.';
  end if;
  if jsonb_typeof(v_payload)<>'object'
     or v_payload::text ~* '"(token|api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
    raise exception using errcode = '22023', message = 'Worker administration accepts metadata and credential digests only.';
  end if;

  if v_action='create_worker' then
    v_worker_name := left(trim(coalesce(v_payload->>'worker_name','')),120);
    v_credential_sha256 := lower(trim(coalesce(v_payload->>'credential_sha256','')));
    v_expires_at := nullif(v_payload->>'credential_expires_at','')::timestamptz;
    v_max_concurrent := coalesce(nullif(v_payload->>'max_concurrent_tasks','')::integer,1);

    if length(v_worker_name)<2 then
      raise exception using errcode = '22023', message = 'A worker name between 2 and 120 characters is required.';
    end if;
    if v_credential_sha256 !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023', message = 'A SHA-256 worker credential digest is required.';
    end if;
    if v_expires_at is null or v_expires_at<=now() or v_expires_at>now()+interval '24 hours' then
      raise exception using errcode = '22023', message = 'Worker credentials must expire within the next 24 hours.';
    end if;
    if v_max_concurrent<1 or v_max_concurrent>32 then
      raise exception using errcode = '22023', message = 'Worker concurrency must be between 1 and 32.';
    end if;
    if jsonb_typeof(v_payload->'identity_ids')<>'array'
       or jsonb_array_length(v_payload->'identity_ids')<1
       or jsonb_array_length(v_payload->'identity_ids')>100 then
      raise exception using errcode = '22023', message = 'Select between 1 and 100 AI identities for this worker.';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(v_payload->'identity_ids') x(value)
      where x.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
      raise exception using errcode = '22023', message = 'Every worker identity grant must be a valid AI identity ID.';
    end if;
    select array_agg(x.value::uuid order by x.ordinality)
      into v_identity_ids
    from jsonb_array_elements_text(v_payload->'identity_ids') with ordinality x(value,ordinality);
    select count(distinct x.value::uuid)::integer
      into v_count
    from jsonb_array_elements_text(v_payload->'identity_ids') x(value);
    if v_count<>cardinality(v_identity_ids) then
      raise exception using errcode = '22023', message = 'Duplicate AI identity grants are not allowed.';
    end if;
    select count(*)::integer into v_count
    from ai_network.ai_identities i
    where i.identity_id=any(v_identity_ids)
      and i.owner_user_id=p_actor_user_id
      and i.status='active' and i.enabled=true;
    if v_count<>cardinality(v_identity_ids) then
      raise exception using errcode = '42501', message = 'Every granted AI identity must be active, enabled and owned by this administrator.';
    end if;

    if v_payload ? 'allowed_action_classes' then
      if jsonb_typeof(v_payload->'allowed_action_classes')<>'array'
         or jsonb_array_length(v_payload->'allowed_action_classes')<1
         or jsonb_array_length(v_payload->'allowed_action_classes')>2 then
        raise exception using errcode = '22023', message = 'Worker action classes must be read_only and/or content.';
      end if;
      select array_agg(distinct x.value order by x.value)
        into v_allowed_classes
      from jsonb_array_elements_text(v_payload->'allowed_action_classes') x(value);
    else
      v_allowed_classes := array['read_only','content']::text[];
    end if;
    if cardinality(v_allowed_classes)<1 or cardinality(v_allowed_classes)>2
       or not (v_allowed_classes <@ array['read_only','content']::text[]) then
      raise exception using errcode = '22023', message = 'Workers may only receive read_only and/or content task permissions.';
    end if;

    insert into ai_network.ai_worker_principals(
      owner_user_id,worker_name,credential_sha256,credential_expires_at,
      allowed_action_classes,max_concurrent_tasks,created_by_user_id
    ) values (
      p_actor_user_id,v_worker_name,v_credential_sha256,v_expires_at,
      v_allowed_classes,v_max_concurrent,p_actor_user_id
    ) returning * into v_worker;

    insert into ai_network.ai_worker_identity_grants(worker_id,owner_user_id,identity_id)
    select v_worker.worker_id,p_actor_user_id,x.identity_id
    from unnest(v_identity_ids) x(identity_id);

    insert into ai_network.ai_worker_events(
      worker_id,owner_user_id,actor_type,actor_user_id,event_type,reason,metadata
    ) values (
      v_worker.worker_id,p_actor_user_id,'human_user',p_actor_user_id,'worker_created','Worker principal created with bounded capabilities.',
      jsonb_build_object('allowed_action_classes',v_allowed_classes,'max_concurrent_tasks',v_max_concurrent,'identity_count',cardinality(v_identity_ids),'credential_expires_at',v_expires_at)
    );
    return jsonb_build_object(
      'worker',jsonb_build_object(
        'worker_id',v_worker.worker_id,'worker_name',v_worker.worker_name,'status',v_worker.status,
        'credential_expires_at',v_worker.credential_expires_at,'credential_version',v_worker.credential_version,
        'allowed_action_classes',v_worker.allowed_action_classes,'max_concurrent_tasks',v_worker.max_concurrent_tasks,
        'created_at',v_worker.created_at,'identity_ids',to_jsonb(v_identity_ids)
      ),
      'credential_digest_stored',true
    );
  end if;

  if v_action='list_workers' then
    select coalesce(jsonb_agg(row_data.worker order by row_data.created_at desc),'[]'::jsonb)
      into v_result
    from (
      select p.created_at,jsonb_build_object(
        'worker_id',p.worker_id,'worker_name',p.worker_name,'status',
        case when p.status='active' and p.credential_expires_at<=now() then 'expired' else p.status end,
        'credential_expires_at',p.credential_expires_at,'credential_version',p.credential_version,
        'allowed_action_classes',p.allowed_action_classes,'max_concurrent_tasks',p.max_concurrent_tasks,
        'last_authenticated_at',p.last_authenticated_at,'created_at',p.created_at,
        'revoked_at',p.revoked_at,'revocation_reason',p.revocation_reason,
        'identity_ids',coalesce((
          select jsonb_agg(g.identity_id order by g.created_at)
          from ai_network.ai_worker_identity_grants g
          where g.worker_id=p.worker_id and g.owner_user_id=p_actor_user_id
        ),'[]'::jsonb)
      ) as worker
      from ai_network.ai_worker_principals p
      where p.owner_user_id=p_actor_user_id
    ) row_data;
    return jsonb_build_object('workers',coalesce(v_result,'[]'::jsonb));
  end if;

  if v_action in ('rotate_worker','revoke_worker') then
    if coalesce(v_payload->>'worker_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid worker ID is required.';
    end if;
    v_worker_id := (v_payload->>'worker_id')::uuid;
    select * into v_worker
    from ai_network.ai_worker_principals p
    where p.worker_id=v_worker_id and p.owner_user_id=p_actor_user_id
    for update;
    if v_worker.worker_id is null then
      raise exception using errcode = 'P0002', message = 'Worker principal was not found.';
    end if;

    if v_action='rotate_worker' then
      v_credential_sha256 := lower(trim(coalesce(v_payload->>'credential_sha256','')));
      v_expires_at := nullif(v_payload->>'credential_expires_at','')::timestamptz;
      if v_credential_sha256 !~ '^[0-9a-f]{64}$' then
        raise exception using errcode = '22023', message = 'A SHA-256 worker credential digest is required.';
      end if;
      if v_expires_at is null or v_expires_at<=now() or v_expires_at>now()+interval '24 hours' then
        raise exception using errcode = '22023', message = 'Worker credentials must expire within the next 24 hours.';
      end if;
      update ai_network.ai_worker_principals p
      set credential_sha256=v_credential_sha256,credential_expires_at=v_expires_at,
          credential_version=p.credential_version+1,status='active',revoked_at=null,
          revocation_reason='',updated_at=now()
      where p.worker_id=v_worker_id and p.owner_user_id=p_actor_user_id;
    else
      v_reason := left(trim(coalesce(v_payload->>'reason','Revoked by administrator.')),500);
      update ai_network.ai_worker_principals p
      set credential_sha256=null,status='revoked',revoked_at=now(),
          revocation_reason=v_reason,updated_at=now()
      where p.worker_id=v_worker_id and p.owner_user_id=p_actor_user_id;
    end if;

    with released as (
      update ai_network.ai_task_queue q
      set status=case when q.attempt_count<q.max_attempts then 'queued' else 'failed' end,
          worker_id=null,lease_token=null,lease_expires_at=null,
          finished_at=case when q.attempt_count<q.max_attempts then null else now() end,
          failure_reason=case when v_action='revoke_worker' then 'Worker credential revoked while task was leased.' else 'Worker credential rotated while task was leased.' end,
          scheduled_for=case when q.attempt_count<q.max_attempts then now() else q.scheduled_for end,
          updated_at=now()
      where q.owner_user_id=p_actor_user_id and q.worker_id=v_worker_id::text and q.status='running'
      returning q.task_id,q.status
    )
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason)
    select p_actor_user_id,r.task_id,'system',v_worker_id::text,
      case when v_action='revoke_worker' then 'worker_revoked_lease_released' else 'worker_rotated_lease_released' end,
      'running',r.status,'Leased task released after worker credential lifecycle change.'
    from released r;

    insert into ai_network.ai_worker_events(
      worker_id,owner_user_id,actor_type,actor_user_id,event_type,reason,metadata
    ) values (
      v_worker_id,p_actor_user_id,'human_user',p_actor_user_id,
      case when v_action='revoke_worker' then 'worker_revoked' else 'worker_credential_rotated' end,
      case when v_action='revoke_worker' then v_reason else 'Credential rotated; prior bearer credential invalidated.' end,
      jsonb_build_object('credential_version',v_worker.credential_version + case when v_action='rotate_worker' then 1 else 0 end)
    );
    select p.* into v_worker
    from ai_network.ai_worker_principals p
    where p.worker_id=v_worker_id and p.owner_user_id=p_actor_user_id;
    return jsonb_build_object('worker',jsonb_build_object(
      'worker_id',v_worker.worker_id,'worker_name',v_worker.worker_name,'status',v_worker.status,
      'credential_expires_at',v_worker.credential_expires_at,'credential_version',v_worker.credential_version,
      'allowed_action_classes',v_worker.allowed_action_classes,'max_concurrent_tasks',v_worker.max_concurrent_tasks
    ));
  end if;

  raise exception using errcode = '22023', message = 'Unsupported AI worker administration command.';
end;
$function$;

create or replace function public.minglora_ai_worker_runtime_command(
  p_action text,
  p_credential_sha256 text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_action text := lower(coalesce(p_action,''));
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_worker ai_network.ai_worker_principals%rowtype;
  v_task ai_network.ai_task_queue%rowtype;
  v_task_id uuid;
  v_lease_token uuid;
  v_lease_seconds integer;
  v_global_max integer;
  v_global_paused boolean;
  v_execution_enabled boolean;
  v_running_count integer;
  v_attempt_count integer;
  v_status text;
  v_reason text;
  v_task_result jsonb;
  v_result jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI worker runtime is restricted to the Minglora server runtime.';
  end if;
  if p_credential_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '42501', message = 'Worker authentication failed.';
  end if;
  if jsonb_typeof(v_payload)<>'object'
     or v_payload::text ~* '"(token|api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
    raise exception using errcode = '22023', message = 'Worker task payloads cannot contain credentials or secret fields.';
  end if;
  if v_action not in ('claim_next_task','heartbeat_task','complete_task','fail_task') then
    raise exception using errcode = '22023', message = 'Unsupported AI worker runtime command.';
  end if;

  select p.* into v_worker
  from ai_network.ai_worker_principals p
  where p.credential_sha256=p_credential_sha256
  for update;
  if v_worker.worker_id is null then
    raise exception using errcode = '42501', message = 'Worker authentication failed.';
  end if;
  if v_worker.status<>'active' or v_worker.credential_expires_at<=now() then
    if v_worker.status='active' and v_worker.credential_expires_at<=now() then
      update ai_network.ai_worker_principals p
      set status='expired',credential_sha256=null,updated_at=now()
      where p.worker_id=v_worker.worker_id;
      insert into ai_network.ai_worker_events(worker_id,owner_user_id,actor_type,event_type,reason)
      values (v_worker.worker_id,v_worker.owner_user_id,'system','worker_credential_expired','Worker credential expired and was invalidated.');
    end if;
    raise exception using errcode = '42501', message = 'Worker credential is expired or revoked.';
  end if;
  if not exists(select 1 from public.profiles p where p.id=v_worker.owner_user_id) then
    raise exception using errcode = '42501', message = 'Worker owner is no longer available.';
  end if;

  update ai_network.ai_worker_principals p
  set last_authenticated_at=now(),updated_at=now()
  where p.worker_id=v_worker.worker_id;

  if v_action='claim_next_task' then
    select c.global_paused,c.execution_enabled,c.max_concurrent_workers,c.lease_seconds
      into v_global_paused,v_execution_enabled,v_global_max,v_lease_seconds
    from ai_network.ai_task_runtime_controls c
    where c.control_key='primary'
    for share;
    if not found or coalesce(v_global_paused,true) or not coalesce(v_execution_enabled,false) or coalesce(v_global_max,0)=0 then
      return jsonb_build_object('claimed',false,'reason','runtime_paused_or_disabled');
    end if;

    with expired as (
      update ai_network.ai_task_queue q
      set status=case when q.attempt_count>=q.max_attempts then 'failed' else 'queued' end,
          worker_id=null,lease_token=null,lease_expires_at=null,
          finished_at=case when q.attempt_count>=q.max_attempts then now() else null end,
          updated_at=now()
      where q.owner_user_id=v_worker.owner_user_id and q.worker_id=v_worker.worker_id::text
        and q.status='running' and q.lease_expires_at<now()
      returning q.task_id,q.status
    )
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason)
    select v_worker.owner_user_id,e.task_id,'system',v_worker.worker_id::text,'worker_lease_expired','running',e.status,
      'Expired worker lease was recovered by the authenticated worker.'
    from expired e;

    select count(*)::integer into v_running_count
    from ai_network.ai_task_queue q
    where q.status='running' and q.lease_expires_at>now();
    if v_running_count>=v_global_max then
      return jsonb_build_object('claimed',false,'reason','global_worker_limit_reached');
    end if;

    select count(*)::integer into v_running_count
    from ai_network.ai_task_queue q
    where q.owner_user_id=v_worker.owner_user_id and q.worker_id=v_worker.worker_id::text
      and q.status='running' and q.lease_expires_at>now();
    if v_running_count>=v_worker.max_concurrent_tasks then
      return jsonb_build_object('claimed',false,'reason','worker_concurrency_limit_reached');
    end if;

    select q.* into v_task
    from ai_network.ai_task_queue q
    where q.owner_user_id=v_worker.owner_user_id
      and q.status='queued' and q.scheduled_for<=now() and q.attempt_count<q.max_attempts
      and q.action_class=any(v_worker.allowed_action_classes)
      and exists (
        select 1 from ai_network.ai_worker_identity_grants g
        where g.worker_id=v_worker.worker_id and g.owner_user_id=v_worker.owner_user_id
          and g.identity_id=q.identity_id
      )
      and exists (
        select 1 from ai_network.ai_identities i
        where i.identity_id=q.identity_id and i.owner_user_id=v_worker.owner_user_id
          and i.status='active' and i.enabled=true
      )
      and exists (
        select 1 from ai_network.ai_provider_assignments a
        join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
        where a.identity_id=q.identity_id and a.assignment_status='active'
          and a.provider_health_status='healthy' and pa.status='configured' and pa.health_status='healthy'
      )
    order by q.priority asc,q.scheduled_for asc,q.created_at asc
    for update skip locked limit 1;
    if v_task.task_id is null then
      return jsonb_build_object('claimed',false,'reason','no_due_task_with_granted_identity_and_healthy_provider');
    end if;

    v_lease_token := gen_random_uuid();
    update ai_network.ai_task_queue q
    set status='running',worker_id=v_worker.worker_id::text,lease_token=v_lease_token,
        lease_expires_at=now()+make_interval(secs=>v_lease_seconds),
        attempt_count=q.attempt_count+1,started_at=coalesce(q.started_at,now()),updated_at=now()
    where q.task_id=v_task.task_id and q.owner_user_id=v_worker.owner_user_id
    returning q.* into v_task;
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason)
    values (v_worker.owner_user_id,v_task.task_id,'worker',v_worker.worker_id::text,'worker_claimed','queued','running',
      'Authenticated worker acquired a bounded task lease.');
    return jsonb_build_object(
      'claimed',true,'task_id',v_task.task_id,'identity_id',v_task.identity_id,
      'task_type',v_task.task_type,'task_title',v_task.task_title,'action_class',v_task.action_class,
      'task_payload',v_task.task_payload,'token_budget',v_task.token_budget,'cost_limit_usd',v_task.cost_limit_usd,
      'attempt_count',v_task.attempt_count,'max_attempts',v_task.max_attempts,
      'worker_id',v_worker.worker_id,'lease_token',v_lease_token,'lease_expires_at',v_task.lease_expires_at
    );
  end if;

  if coalesce(v_payload->>'task_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(v_payload->>'lease_token','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'A valid task and lease token are required.';
  end if;
  v_task_id := (v_payload->>'task_id')::uuid;
  v_lease_token := (v_payload->>'lease_token')::uuid;

  select q.* into v_task
  from ai_network.ai_task_queue q
  where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id
    and q.worker_id=v_worker.worker_id::text and q.lease_token=v_lease_token
    and q.status='running' and q.lease_expires_at>now()
    and q.action_class=any(v_worker.allowed_action_classes)
    and exists (
      select 1 from ai_network.ai_worker_identity_grants g
      where g.worker_id=v_worker.worker_id and g.owner_user_id=v_worker.owner_user_id
        and g.identity_id=q.identity_id
    )
  for update;
  if v_task.task_id is null then
    raise exception using errcode = '42501', message = 'Worker task lease is invalid, expired or no longer authorized.';
  end if;

  if v_action='heartbeat_task' then
    select c.lease_seconds into v_lease_seconds
    from ai_network.ai_task_runtime_controls c where c.control_key='primary';
    if not found then
      raise exception using errcode = '55000', message = 'AI worker runtime controls are unavailable.';
    end if;
    update ai_network.ai_task_queue q
    set lease_expires_at=now()+make_interval(secs=>v_lease_seconds),updated_at=now()
    where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id;
    return jsonb_build_object('renewed',true,'lease_seconds',v_lease_seconds);
  elsif v_action='complete_task' then
    v_task_result := coalesce(v_payload->'task_result','{}'::jsonb);
    if jsonb_typeof(v_task_result)<>'object' or octet_length(v_task_result::text)>65536
       or v_task_result::text ~* '"(token|api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
      raise exception using errcode = '22023', message = 'Task result must be a safe JSON object no larger than 64 KB.';
    end if;
    update ai_network.ai_task_queue q
    set status='succeeded',task_result=v_task_result,worker_id=null,lease_token=null,
        lease_expires_at=null,finished_at=now(),updated_at=now()
    where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id;
    v_status := 'succeeded';
    v_reason := 'Authenticated worker reported successful completion.';
  elsif v_action='fail_task' then
    v_reason := left(trim(coalesce(v_payload->>'failure_reason','Worker task failed.')),1000);
    if v_reason ~* '(api[_ -]?key|access[_ -]?token|password|secret|authorization|cookie|credential)[[:space:]:=]' then
      v_reason := 'Worker reported a failure; sensitive details were suppressed.';
    end if;
    v_status := case when v_task.attempt_count<v_task.max_attempts then 'queued' else 'failed' end;
    update ai_network.ai_task_queue q
    set status=v_status,failure_reason=v_reason,
        scheduled_for=case when v_status='queued' then now()+make_interval(secs=>least(3600,15*(2^greatest(v_task.attempt_count-1,0))::integer)) else q.scheduled_for end,
        worker_id=null,lease_token=null,lease_expires_at=null,
        finished_at=case when v_status='failed' then now() else null end,updated_at=now()
    where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id;
  end if;

  insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason)
  values (v_worker.owner_user_id,v_task_id,'worker',v_worker.worker_id::text,v_action,'running',v_status,v_reason);
  select to_jsonb(q) into v_result
  from ai_network.ai_task_queue q
  where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id;
  return jsonb_build_object('task',v_result);
end;
$function$;

comment on function public.minglora_ai_worker_admin_command(text,uuid,jsonb)
  is 'Owner-authorized worker principal lifecycle; stores only credential digests and bounded identity grants.';
comment on function public.minglora_ai_worker_runtime_command(text,text,jsonb)
  is 'Bearer-authenticated worker task leases; enforces identity grants, capability classes, expiry and runtime controls.';

revoke all on function public.minglora_ai_worker_admin_command(text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.minglora_ai_worker_runtime_command(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_worker_admin_command(text,uuid,jsonb) to service_role;
grant execute on function public.minglora_ai_worker_runtime_command(text,text,jsonb) to service_role;
