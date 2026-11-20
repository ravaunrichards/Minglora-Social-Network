-- Minglora AI Phase 6: worker authentication and bounded execution orchestration.
-- Additive and fail-closed. Runtime execution remains paused until an owner enables it
-- after a live provider probe, worker registration and operational acceptance.

create table if not exists ai_network.ai_task_workers (
  worker_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  worker_label text not null check (length(trim(worker_label)) between 2 and 80),
  credential_sha256 text not null unique check (credential_sha256 ~ '^[a-f0-9]{64}$'),
  worker_status text not null default 'active' check (worker_status in ('active','revoked')),
  max_concurrent_tasks integer not null default 1 check (max_concurrent_tasks between 1 and 8),
  max_tasks_per_minute integer not null default 10 check (max_tasks_per_minute between 1 and 60),
  allowed_providers text[] not null default array['openai']::text[]
    check (cardinality(allowed_providers) between 1 and 1 and allowed_providers <@ array['openai']::text[]),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_task_workers_owner_status_idx
  on ai_network.ai_task_workers(owner_user_id,worker_status,created_at desc);

alter table ai_network.ai_task_queue
  add column if not exists selected_assignment_id uuid references ai_network.ai_provider_assignments(assignment_id) on delete restrict,
  add column if not exists selected_provider text,
  add column if not exists selected_model text,
  add column if not exists execution_route_id uuid,
  add column if not exists active_execution_id uuid;

create table if not exists ai_network.ai_task_execution_attempts (
  execution_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  task_id uuid not null,
  attempt_number integer not null check (attempt_number between 1 and 100),
  route_id uuid not null unique,
  worker_id uuid not null references ai_network.ai_task_workers(worker_id) on delete restrict,
  provider_name text not null,
  model_identifier text not null,
  assignment_id uuid not null references ai_network.ai_provider_assignments(assignment_id) on delete restrict,
  execution_status text not null default 'running'
    check (execution_status in ('running','succeeded','failed','retry_scheduled','timed_out','cancelled')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 3600000),
  input_tokens integer check (input_tokens is null or input_tokens between 0 and 100000000),
  output_tokens integer check (output_tokens is null or output_tokens between 0 and 100000000),
  provider_request_id text check (provider_request_id is null or length(provider_request_id) <= 180),
  error_code text check (error_code is null or length(error_code) <= 100),
  failure_reason text not null default '' check (length(failure_reason) <= 1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  unique (task_id,attempt_number),
  foreign key (owner_user_id,task_id)
    references ai_network.ai_task_queue(owner_user_id,task_id) on delete restrict
);
create index if not exists ai_task_attempts_owner_task_idx
  on ai_network.ai_task_execution_attempts(owner_user_id,task_id,attempt_number desc);
create index if not exists ai_task_attempts_provider_time_idx
  on ai_network.ai_task_execution_attempts(provider_name,model_identifier,started_at desc);
create index if not exists ai_task_attempts_worker_time_idx
  on ai_network.ai_task_execution_attempts(worker_id,started_at desc);
create index if not exists ai_task_attempts_running_idx
  on ai_network.ai_task_execution_attempts(started_at)
  where execution_status='running';

alter table ai_network.ai_task_queue
  add constraint ai_task_queue_active_execution_fk
  foreign key (active_execution_id)
  references ai_network.ai_task_execution_attempts(execution_id)
  on delete restrict;

create table if not exists ai_network.ai_task_provider_limits (
  provider_name text not null,
  model_identifier text not null default '*',
  max_concurrent_tasks integer not null default 1 check (max_concurrent_tasks between 1 and 1000),
  max_tasks_per_minute integer not null default 10 check (max_tasks_per_minute between 1 and 10000),
  max_tokens_per_minute integer not null default 30000 check (max_tokens_per_minute between 0 and 100000000),
  updated_at timestamptz not null default now(),
  primary key (provider_name,model_identifier)
);
insert into ai_network.ai_task_provider_limits(provider_name,model_identifier,max_concurrent_tasks,max_tasks_per_minute,max_tokens_per_minute)
values ('openai','*',1,1,30000)
on conflict (provider_name,model_identifier) do nothing;

alter table ai_network.ai_task_workers enable row level security;
alter table ai_network.ai_task_execution_attempts enable row level security;
alter table ai_network.ai_task_provider_limits enable row level security;
revoke all on ai_network.ai_task_workers,ai_network.ai_task_execution_attempts,ai_network.ai_task_provider_limits
  from public,anon,authenticated;
grant select,insert,update on ai_network.ai_task_workers to service_role;
grant select,insert,update on ai_network.ai_task_execution_attempts to service_role;
grant select,insert,update on ai_network.ai_task_provider_limits to service_role;

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
  v_task_id uuid;
  v_hash text;
  v_label text;
  v_reason text;
  v_concurrency integer;
  v_rate integer;
  v_expiry timestamptz;
  v_status text;
  v_result jsonb;
  v_runtime ai_network.ai_task_runtime_controls%rowtype;
  v_global_paused boolean;
  v_execution_enabled boolean;
  v_max_workers integer;
  v_lease_seconds integer;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='AI worker administration is restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode='42501',message='A valid signed-in Minglora administrator is required.';
  end if;
  if jsonb_typeof(v_payload)<>'object' then
    raise exception using errcode='22023',message='AI worker command payload must be an object.';
  end if;

  if v_action in ('register_worker','revoke_worker','set_runtime_controls')
     and not exists (
       select 1 from public.minglora_platform_staff s
       where s.user_id=p_actor_user_id and s.active=true and s.role in ('owner','admin')
     ) then
    raise exception using errcode='42501',message='Only an active platform owner or administrator can manage worker credentials or runtime activation.';
  end if;

  if v_action='set_runtime_controls' then
    select * into v_runtime from ai_network.ai_task_runtime_controls c
      where c.control_key='primary' for update;
    if not found then raise exception using errcode='P0002',message='AI task runtime controls are not initialized.'; end if;
    v_global_paused := coalesce(nullif(v_payload->>'global_paused','')::boolean,v_runtime.global_paused);
    v_execution_enabled := coalesce(nullif(v_payload->>'execution_enabled','')::boolean,v_runtime.execution_enabled);
    v_max_workers := coalesce(nullif(v_payload->>'max_concurrent_workers','')::integer,v_runtime.max_concurrent_workers);
    -- A global pause is an emergency stop and must never be blocked by stale enablement.
    if v_global_paused then
      v_execution_enabled := false;
      v_max_workers := 0;
    end if;
    v_lease_seconds := coalesce(nullif(v_payload->>'lease_seconds','')::integer,v_runtime.lease_seconds);
    if v_max_workers<0 or v_max_workers>8 or v_lease_seconds<30 or v_lease_seconds>900 then
      raise exception using errcode='22023',message='Global worker concurrency must be 0–8 and lease duration must be 30–900 seconds.';
    end if;
    if v_execution_enabled and (v_global_paused or v_max_workers<1) then
      raise exception using errcode='42501',message='Execution cannot be enabled while paused or with a zero concurrency limit.';
    end if;
    if v_execution_enabled then
      if not exists (
        select 1 from ai_network.ai_task_workers w
        where w.owner_user_id=p_actor_user_id and w.worker_status='active'
          and w.expires_at>now() and w.last_seen_at>=now()-interval '2 minutes'
      ) then
        raise exception using errcode='42501',message='A registered worker must heartbeat successfully within the last two minutes before execution can be enabled.';
      end if;
      if not exists (
        select 1
        from ai_network.ai_provider_assignments a
        join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
        join ai_network.ai_provider_models m on m.model_id=a.model_id
        join ai_network.ai_identities i on i.identity_id=a.identity_id and i.owner_user_id=pa.owner_user_id
        where pa.owner_user_id=p_actor_user_id
          and pa.status='configured' and pa.health_status='healthy'
          and a.assignment_status='active' and a.provider_health_status='healthy'
          and m.is_active=true and m.text_capability=true
          and (lower(pa.provider_name) like '%openai%' or lower(m.provider_name) like '%openai%')
          and i.status='active' and i.enabled=true
          and exists (
            select 1 from ai_network.ai_identity_capabilities cap
            where cap.identity_id=i.identity_id and cap.capability_key='text_generation'
              and cap.is_enabled=true
          )
          and exists (
            select 1 from ai_network.ai_identity_permissions perm
            where perm.identity_id=i.identity_id and perm.effect='allow'
              and perm.permission_key in ('task.execute','ai.task.execute','text.generate','text.summarize')
              and perm.resource_scope in ('*','text.generate','text.summarize')
              and (perm.expires_at is null or perm.expires_at>now())
          )
      ) then
        raise exception using errcode='42501',message='At least one active identity needs a healthy OpenAI assignment, text_generation capability and an unexpired text task execute permission.';
      end if;
    end if;
    update ai_network.ai_task_runtime_controls c
      set global_paused=v_global_paused,
          execution_enabled=v_execution_enabled,
          max_concurrent_workers=v_max_workers,
          lease_seconds=v_lease_seconds,
          updated_at=now()
      where c.control_key='primary'
      returning to_jsonb(c) into v_result;
    return jsonb_build_object('runtime',v_result,'execution_enabled',v_execution_enabled);
  end if;

  if v_action='register_worker' then
    v_hash := lower(trim(coalesce(v_payload->>'credential_sha256','')));
    v_label := left(trim(coalesce(v_payload->>'worker_label','')),80);
    v_concurrency := coalesce(nullif(v_payload->>'max_concurrent_tasks','')::integer,1);
    v_rate := coalesce(nullif(v_payload->>'max_tasks_per_minute','')::integer,10);
    v_expiry := coalesce(nullif(v_payload->>'expires_at','')::timestamptz,now()+interval '90 days');
    if v_hash !~ '^[a-f0-9]{64}$' or length(v_label)<2 then
      raise exception using errcode='22023',message='A worker label and 64-character SHA-256 credential hash are required.';
    end if;
    if v_concurrency<1 or v_concurrency>8 or v_rate<1 or v_rate>60 then
      raise exception using errcode='22023',message='Worker concurrency or requests-per-minute limits are outside the supported range.';
    end if;
    if v_expiry<=now() or v_expiry>now()+interval '365 days' then
      raise exception using errcode='22023',message='Worker credential expiry must be within the next 365 days.';
    end if;
    insert into ai_network.ai_task_workers(
      owner_user_id,worker_label,credential_sha256,max_concurrent_tasks,max_tasks_per_minute,
      allowed_providers,created_by_user_id,expires_at
    ) values (
      p_actor_user_id,v_label,v_hash,v_concurrency,v_rate,array['openai']::text[],p_actor_user_id,v_expiry
    ) returning worker_id into v_worker_id;
    select jsonb_build_object(
      'worker_id',w.worker_id,'worker_label',w.worker_label,'worker_status',w.worker_status,
      'max_concurrent_tasks',w.max_concurrent_tasks,'max_tasks_per_minute',w.max_tasks_per_minute,
      'allowed_providers',w.allowed_providers,'expires_at',w.expires_at,'created_at',w.created_at
    ) into v_result from ai_network.ai_task_workers w where w.worker_id=v_worker_id;
    return jsonb_build_object('worker',v_result,'credential_returned_once',true);
  end if;

  if v_action='list_workers' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'worker_id',w.worker_id,'worker_label',w.worker_label,'worker_status',w.worker_status,
      'max_concurrent_tasks',w.max_concurrent_tasks,'max_tasks_per_minute',w.max_tasks_per_minute,
      'allowed_providers',w.allowed_providers,'expires_at',w.expires_at,'last_seen_at',w.last_seen_at,
      'revoked_at',w.revoked_at,'created_at',w.created_at
    ) order by w.created_at desc),'[]'::jsonb)
    into v_result from ai_network.ai_task_workers w where w.owner_user_id=p_actor_user_id;
    return jsonb_build_object('workers',v_result);
  end if;

  if v_action='revoke_worker' then
    if coalesce(v_payload->>'worker_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid worker ID is required.';
    end if;
    v_worker_id := (v_payload->>'worker_id')::uuid;
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    if length(v_reason)<3 then raise exception using errcode='22023',message='A worker revocation reason of at least three characters is required.'; end if;
    update ai_network.ai_task_workers w
      set worker_status='revoked',revoked_at=now(),updated_at=now()
      where w.worker_id=v_worker_id and w.owner_user_id=p_actor_user_id and w.worker_status='active';
    if not found then raise exception using errcode='P0002',message='Active worker was not found for this administrator.'; end if;
    update ai_network.ai_task_execution_attempts a
      set execution_status='cancelled',finished_at=now(),error_code='worker_revoked',
          failure_reason='Worker credential was revoked while the task was running.'
      from ai_network.ai_task_queue q
      where q.active_execution_id=a.execution_id and q.worker_id=v_worker_id::text
        and q.owner_user_id=p_actor_user_id and q.status='running';
    with cancelled as (
      update ai_network.ai_task_queue q
      set status='cancelled',worker_id=null,lease_token=null,lease_expires_at=null,
          active_execution_id=null,finished_at=now(),updated_at=now(),
          failure_reason='Worker credential was revoked while the task was running.'
      where q.owner_user_id=p_actor_user_id and q.worker_id=v_worker_id::text and q.status='running'
      returning q.owner_user_id,q.task_id
    )
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,actor_user_id,event_type,previous_status,new_status,reason,metadata)
    select c.owner_user_id,c.task_id,'human_user',p_actor_user_id,'worker_revoked_task_cancelled',
      'running','cancelled',v_reason,jsonb_build_object('worker_id',v_worker_id)
    from cancelled c;
    return jsonb_build_object('revoked',true,'worker_id',v_worker_id);
  end if;

  if v_action='cancel_task' then
    if coalesce(v_payload->>'task_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid task ID is required.';
    end if;
    v_task_id := (v_payload->>'task_id')::uuid;
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    if length(v_reason)<3 then raise exception using errcode='22023',message='A cancellation reason of at least three characters is required.'; end if;
    select q.status into v_status from ai_network.ai_task_queue q
      where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id for update;
    if v_status is null or v_status not in ('pending_approval','queued','running','observation_only') then
      raise exception using errcode='P0002',message='Task is not in a cancellable state.';
    end if;
    update ai_network.ai_task_execution_attempts a
      set execution_status='cancelled',finished_at=now(),error_code='task_cancelled',
          failure_reason=v_reason
      from ai_network.ai_task_queue q
      where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id
        and q.active_execution_id=a.execution_id and q.status='running';
    update ai_network.ai_task_queue q
      set status='cancelled',worker_id=null,lease_token=null,lease_expires_at=null,
          active_execution_id=null,finished_at=now(),updated_at=now(),failure_reason=v_reason
      where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id;
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,actor_user_id,event_type,previous_status,new_status,reason)
      values (p_actor_user_id,v_task_id,'human_user',p_actor_user_id,'task_cancelled',v_status,'cancelled',v_reason);
    update ai_network.ai_task_approvals a set approval_status='cancelled'
      where a.task_id=v_task_id and a.owner_user_id=p_actor_user_id and a.approval_status='requested';
    select to_jsonb(q) into v_result from ai_network.ai_task_queue q where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id;
    return jsonb_build_object('task',v_result);
  end if;

  if v_action='list_task_history' then
    if coalesce(v_payload->>'task_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid task ID is required.';
    end if;
    v_task_id := (v_payload->>'task_id')::uuid;
    if not exists(select 1 from ai_network.ai_task_queue q where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id) then
      raise exception using errcode='P0002',message='Task was not found for this administrator.';
    end if;
    select jsonb_build_object(
      'task',(select jsonb_build_object(
        'task_id',q.task_id,
        'status',q.status,
        'task_type',q.task_type,
        'action_class',q.action_class,
        'task_result',q.task_result,
        'failure_reason',q.failure_reason,
        'attempt_count',q.attempt_count,
        'max_attempts',q.max_attempts,
        'selected_provider',q.selected_provider,
        'selected_model',q.selected_model,
        'selected_assignment_id',q.selected_assignment_id,
        'execution_route_id',q.execution_route_id,
        'scheduled_for',q.scheduled_for,
        'started_at',q.started_at,
        'finished_at',q.finished_at,
        'updated_at',q.updated_at
      ) from ai_network.ai_task_queue q where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id),
      'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at asc)
        from ai_network.ai_task_events e where e.task_id=v_task_id and e.owner_user_id=p_actor_user_id),'[]'::jsonb),
      'executions',coalesce((select jsonb_agg(to_jsonb(a) order by a.attempt_number asc)
        from ai_network.ai_task_execution_attempts a where a.task_id=v_task_id and a.owner_user_id=p_actor_user_id),'[]'::jsonb)
    ) into v_result;
    return v_result;
  end if;

  raise exception using errcode='22023',message='Unsupported AI worker administration command.';
end;
$function$;

revoke all on function public.minglora_ai_worker_admin_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_worker_admin_command(text,uuid,jsonb) to service_role;

create or replace function public.minglora_ai_worker_command(
  p_action text,
  p_token_sha256 text,
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
  v_worker ai_network.ai_task_workers%rowtype;
  v_controls ai_network.ai_task_runtime_controls%rowtype;
  v_limit ai_network.ai_task_provider_limits%rowtype;
  v_task ai_network.ai_task_queue%rowtype;
  v_assignment_id uuid;
  v_provider text;
  v_model text;
  v_route_id uuid;
  v_execution_id uuid;
  v_lease_token uuid;
  v_required_capability text;
  v_running integer;
  v_recent integer;
  v_recent_tokens bigint;
  v_token_reservation integer;
  v_retryable boolean;
  v_next_status text;
  v_reason text;
  v_error_code text;
  v_retry_seconds integer;
  v_task_result jsonb;
  v_identity_context jsonb;
  v_usage jsonb;
  v_input_tokens integer;
  v_output_tokens integer;
  v_total_tokens integer;
  v_provider_request_id text;
  v_latency integer;
  v_started_at timestamptz;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='AI worker commands are restricted to the authenticated worker gateway.';
  end if;
  if coalesce(p_token_sha256,'') !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='42501',message='Worker authentication failed.';
  end if;
  if jsonb_typeof(v_payload)<>'object' then
    raise exception using errcode='22023',message='AI worker payload must be a JSON object.';
  end if;
  select * into v_worker from ai_network.ai_task_workers w
    where w.credential_sha256=p_token_sha256 and w.worker_status='active' and w.expires_at>now()
    for update;
  if v_worker.worker_id is null then
    raise exception using errcode='42501',message='Worker credential is invalid, expired or revoked.';
  end if;
  update ai_network.ai_task_workers set last_seen_at=now(),updated_at=now()
    where worker_id=v_worker.worker_id;

  if v_action='claim_next_task' then
    select * into v_controls from ai_network.ai_task_runtime_controls c
      where c.control_key='primary' for update;
    if not found or v_controls.global_paused or not v_controls.execution_enabled or v_controls.max_concurrent_workers<1 then
      return jsonb_build_object('claimed',false,'reason','runtime_paused_or_disabled');
    end if;

    with stale as (
      select q.task_id,q.owner_user_id,q.active_execution_id
      from ai_network.ai_task_queue q
      where q.owner_user_id=v_worker.owner_user_id and q.status='running' and q.lease_expires_at<=now()
      for update skip locked
    ), marked as (
      update ai_network.ai_task_execution_attempts a
      set execution_status='timed_out',finished_at=now(),error_code='worker_lease_expired',
          failure_reason='Worker lease expired before completion.'
      from stale s
      where a.execution_id=s.active_execution_id
      returning a.execution_id
    ), expired as (
      update ai_network.ai_task_queue q
      set status=case when q.attempt_count>=q.max_attempts then 'failed' else 'queued' end,
          worker_id=null,lease_token=null,lease_expires_at=null,active_execution_id=null,
          finished_at=case when q.attempt_count>=q.max_attempts then now() else null end,
          failure_reason='Worker lease expired before completion.',updated_at=now()
      from stale s
      where q.task_id=s.task_id
        and (s.active_execution_id is null or exists(select 1 from marked m where m.execution_id=s.active_execution_id))
      returning q.task_id,q.owner_user_id,q.status
    )
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,event_type,previous_status,new_status,reason)
    select e.owner_user_id,e.task_id,'system','task_execution_timed_out','running',e.status,
      'Worker lease expired; task was retried or failed according to its attempt limit.'
    from expired e;

    select count(*)::integer into v_running from ai_network.ai_task_queue q
      where q.owner_user_id=v_worker.owner_user_id and q.status='running' and q.lease_expires_at>now();
    if v_running>=v_controls.max_concurrent_workers then
      return jsonb_build_object('claimed',false,'reason','global_concurrency_limit');
    end if;
    select count(*)::integer into v_running from ai_network.ai_task_queue q
      where q.owner_user_id=v_worker.owner_user_id and q.status='running'
        and q.worker_id=v_worker.worker_id::text and q.lease_expires_at>now();
    if v_running>=v_worker.max_concurrent_tasks then
      return jsonb_build_object('claimed',false,'reason','worker_concurrency_limit');
    end if;
    select count(*)::integer into v_recent from ai_network.ai_task_execution_attempts a
      where a.worker_id=v_worker.worker_id and a.started_at>=now()-interval '1 minute';
    if v_recent>=v_worker.max_tasks_per_minute then
      return jsonb_build_object('claimed',false,'reason','worker_rate_limit');
    end if;

    v_required_capability := 'text_generation';
    select q.* into v_task
    from ai_network.ai_task_queue q
    join lateral (
      select a.assignment_id,
        case when lower(pa.provider_name) like '%openai%' or lower(m.provider_name) like '%openai%' then 'openai'
          else lower(m.provider_name) end as provider_name,
        m.model_identifier,
        a.routing_priority
      from ai_network.ai_provider_assignments a
      join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
      join ai_network.ai_provider_models m on m.model_id=a.model_id
      where a.identity_id=q.identity_id
        and a.assignment_status='active' and a.provider_health_status='healthy'
        and pa.owner_user_id=q.owner_user_id and pa.status='configured' and pa.health_status='healthy'
        and m.is_active=true and m.text_capability=true
        and (cardinality(a.assigned_capabilities)=0 or a.assigned_capabilities && array['text','text_generation']::text[])
        and ('openai'=any(v_worker.allowed_providers))
        and (lower(pa.provider_name) like '%openai%' or lower(m.provider_name) like '%openai%')
      order by a.routing_priority asc,a.assigned_at asc
      limit 1
    ) route on true
    where q.owner_user_id=v_worker.owner_user_id and q.status='queued' and q.scheduled_for<=now()
      and q.attempt_count<q.max_attempts
      and q.action_class in ('read_only','content')
      and q.task_type in ('text.generate','text.summarize')
      and exists (
        select 1 from ai_network.ai_identities i
        where i.identity_id=q.identity_id and i.owner_user_id=q.owner_user_id
          and i.status='active' and i.enabled=true
      )
      and exists (
        select 1 from ai_network.ai_identity_capabilities c
        where c.identity_id=q.identity_id and c.is_enabled=true
          and c.capability_key=v_required_capability
      )
      and exists (
        select 1 from ai_network.ai_identity_permissions p
        where p.identity_id=q.identity_id and p.effect='allow'
          and p.permission_key in ('task.execute','ai.task.execute',q.task_type)
          and p.resource_scope in ('*',q.task_type)
          and (p.expires_at is null or p.expires_at>now())
      )
      and not exists (
        select 1 from ai_network.ai_identity_permissions p
        where p.identity_id=q.identity_id and p.effect='deny'
          and p.permission_key in ('task.execute','ai.task.execute',q.task_type)
          and p.resource_scope in ('*',q.task_type)
          and (p.expires_at is null or p.expires_at>now())
      )
      and (
        q.delegation_grant_id is null
        or exists (
          select 1 from ai_network.ai_delegation_grants g
          where g.delegation_grant_id=q.delegation_grant_id
            and g.owner_user_id=q.owner_user_id and g.grantor_identity_id=q.delegated_from_identity_id
            and g.grantee_identity_id=q.identity_id and g.grant_status='active' and g.expires_at>now()
            and q.task_type=any(g.allowed_task_types) and q.action_class=any(g.allowed_action_classes)
            and greatest(q.token_budget,
              least(100000,
                ceil(length(coalesce(q.task_payload->>'prompt',q.task_payload->>'input_text',q.task_payload->>'text','')) / 3.0)::integer
                + least(1200,greatest(128,case when coalesce(q.task_payload->>'max_output_tokens','') ~ '^[0-9]{1,6}$'
                    then (q.task_payload->>'max_output_tokens')::integer else 700 end))
                + 512
              )
            )<=g.max_token_budget
            and q.cost_limit_usd>0 and g.max_cost_limit_usd>0 and q.cost_limit_usd<=g.max_cost_limit_usd
        )
      )
    order by q.priority asc,q.scheduled_for asc,q.created_at asc
    for update of q skip locked limit 1;
    if v_task.task_id is null then
      return jsonb_build_object('claimed',false,'reason','no_due_authorized_task_with_healthy_route');
    end if;

    select a.assignment_id,
      case when lower(pa.provider_name) like '%openai%' or lower(m.provider_name) like '%openai%' then 'openai'
        else lower(m.provider_name) end,
      m.model_identifier
    into v_assignment_id,v_provider,v_model
    from ai_network.ai_provider_assignments a
    join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
    join ai_network.ai_provider_models m on m.model_id=a.model_id
    where a.identity_id=v_task.identity_id and a.assignment_status='active'
      and a.provider_health_status='healthy' and pa.owner_user_id=v_task.owner_user_id
      and pa.status='configured' and pa.health_status='healthy'
      and m.is_active=true and m.text_capability=true
      and (cardinality(a.assigned_capabilities)=0 or a.assigned_capabilities && array['text','text_generation']::text[])
      and (lower(pa.provider_name) like '%openai%' or lower(m.provider_name) like '%openai%')
    order by a.routing_priority asc,a.assigned_at asc limit 1;
    if v_assignment_id is null or v_provider<>'openai' then
      return jsonb_build_object('claimed',false,'reason','provider_route_unavailable');
    end if;

    select * into v_limit from ai_network.ai_task_provider_limits l
      where l.provider_name=v_provider and l.model_identifier in (v_model,'*')
      order by case when l.model_identifier=v_model then 0 else 1 end
      limit 1 for update;
    if not found then return jsonb_build_object('claimed',false,'reason','provider_limit_not_configured'); end if;
    select count(*)::integer into v_running from ai_network.ai_task_queue q
      where q.status='running' and q.selected_provider=v_provider and q.selected_model=v_model
        and q.lease_expires_at>now();
    if v_running>=v_limit.max_concurrent_tasks then
      return jsonb_build_object('claimed',false,'reason','provider_concurrency_limit');
    end if;
    select count(*)::integer into v_recent from ai_network.ai_task_execution_attempts a
      where a.provider_name=v_provider and a.model_identifier=v_model and a.started_at>=now()-interval '1 minute';
    if v_recent>=v_limit.max_tasks_per_minute then
      return jsonb_build_object('claimed',false,'reason','provider_rate_limit');
    end if;
    v_token_reservation := greatest(
      v_task.token_budget,
      least(100000,
        ceil(length(coalesce(v_task.task_payload->>'prompt',v_task.task_payload->>'input_text',v_task.task_payload->>'text','')) / 3.0)::integer
        + least(1200,greatest(128,case when coalesce(v_task.task_payload->>'max_output_tokens','') ~ '^[0-9]{1,6}$' then (v_task.task_payload->>'max_output_tokens')::integer else 700 end))
        + 512
      )
    );
    select coalesce(sum(
      case when a.execution_status='running' then
        greatest(coalesce(q.token_budget,0),
          least(100000,
            ceil(length(coalesce(q.task_payload->>'prompt',q.task_payload->>'input_text',q.task_payload->>'text','')) / 3.0)::integer
            + least(1200,greatest(128,case when coalesce(q.task_payload->>'max_output_tokens','') ~ '^[0-9]{1,6}$' then (q.task_payload->>'max_output_tokens')::integer else 700 end))
            + 512
          )
        )
      else coalesce(a.input_tokens,0)+coalesce(a.output_tokens,0) end
    ),0)::bigint
      into v_recent_tokens
      from ai_network.ai_task_execution_attempts a
      left join ai_network.ai_task_queue q on q.task_id=a.task_id
      where a.provider_name=v_provider and a.model_identifier=v_model and a.started_at>=now()-interval '1 minute';
    if v_recent_tokens+v_token_reservation>v_limit.max_tokens_per_minute then
      return jsonb_build_object('claimed',false,'reason','provider_token_rate_limit');
    end if;

    v_route_id := gen_random_uuid();
    v_execution_id := gen_random_uuid();
    v_lease_token := gen_random_uuid();
    -- Insert the attempt before setting the queue's active_execution_id FK.
    insert into ai_network.ai_task_execution_attempts(
      execution_id,owner_user_id,task_id,attempt_number,route_id,worker_id,provider_name,
      model_identifier,assignment_id,execution_status,metadata
    ) values (
      v_execution_id,v_worker.owner_user_id,v_task.task_id,v_task.attempt_count+1,v_route_id,
      v_worker.worker_id,v_provider,v_model,v_assignment_id,'running',
      jsonb_build_object(
        'task_type',v_task.task_type,
        'action_class',v_task.action_class,
        'token_reservation',v_token_reservation
      )
    );
    update ai_network.ai_task_queue q
      set status='running',worker_id=v_worker.worker_id::text,lease_token=v_lease_token,
          lease_expires_at=now()+make_interval(secs=>v_controls.lease_seconds),
          attempt_count=q.attempt_count+1,started_at=coalesce(q.started_at,now()),
          selected_assignment_id=v_assignment_id,selected_provider=v_provider,selected_model=v_model,
          execution_route_id=v_route_id,active_execution_id=v_execution_id,updated_at=now()
      where q.task_id=v_task.task_id and q.owner_user_id=v_worker.owner_user_id
      returning q.* into v_task;
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata)
      values (v_worker.owner_user_id,v_task.task_id,'worker',v_worker.worker_id::text,
        'worker_claimed','queued','running','Worker acquired an authenticated, bounded task lease.',
        jsonb_build_object('route_id',v_route_id,'provider',v_provider,'model',v_model,'attempt',v_task.attempt_count));
    select jsonb_build_object(
      'identity_id',i.identity_id,
      'population',i.population,
      'category_key',i.category_key,
      'subcategory',i.subcategory,
      'purpose',left(i.purpose,1000),
      'bio',left(coalesce(p.bio,''),1000),
      'introduction',left(coalesce(p.introduction,''),700),
      'personality',case when octet_length(coalesce(p.personality,'{}'::jsonb)::text)<=3000
        then coalesce(p.personality,'{}'::jsonb) else '{}'::jsonb end,
      'profession',left(coalesce(p.profession,''),120),
      'skills',to_jsonb(p.skills[1:12]),
      'interests',to_jsonb(p.interests[1:12]),
      'hobbies',to_jsonb(p.hobbies[1:12])
    ) into v_identity_context
    from ai_network.ai_identities i
    left join ai_network.ai_profiles p on p.identity_id=i.identity_id
    where i.identity_id=v_task.identity_id and i.owner_user_id=v_task.owner_user_id;
    return jsonb_build_object(
      'claimed',true,'task',to_jsonb(v_task),'identity_context',coalesce(v_identity_context,'{}'::jsonb),
      'route',jsonb_build_object('route_id',v_route_id,'provider',v_provider,'model',v_model,'assignment_id',v_assignment_id),
      'worker',jsonb_build_object('worker_id',v_worker.worker_id,'lease_seconds',v_controls.lease_seconds),
      'lease_token',v_lease_token
    );
  end if;

  if v_action in ('heartbeat_task','complete_task','fail_task') then
    if coalesce(v_payload->>'task_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_payload->>'lease_token','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid task and lease token are required.';
    end if;
    v_task_id := (v_payload->>'task_id')::uuid;
    v_lease_token := (v_payload->>'lease_token')::uuid;
    select q.* into v_task from ai_network.ai_task_queue q
      where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id
        and q.worker_id=v_worker.worker_id::text and q.lease_token=v_lease_token
        and q.status='running' and q.lease_expires_at>now()
      for update;
    if v_task.task_id is null then
      raise exception using errcode='42501',message='Task lease is invalid, expired, cancelled or owned by another worker.';
    end if;
    if v_action='heartbeat_task' then
      select c.lease_seconds into v_controls.lease_seconds from ai_network.ai_task_runtime_controls c where c.control_key='primary';
      update ai_network.ai_task_queue q
        set lease_expires_at=now()+make_interval(secs=>coalesce(v_controls.lease_seconds,120)),updated_at=now()
        where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id;
      return jsonb_build_object('renewed',true,'lease_seconds',coalesce(v_controls.lease_seconds,120));
    end if;

    select a.started_at into v_started_at
      from ai_network.ai_task_execution_attempts a
      where a.execution_id=v_task.active_execution_id;
    v_started_at := coalesce(v_started_at,now());
    v_latency := greatest(0,least(3600000,(extract(epoch from (now()-v_started_at))*1000)::integer));
    if v_action='complete_task' then
      v_task_result := coalesce(v_payload->'task_result','{}'::jsonb);
      v_usage := coalesce(v_payload->'usage','{}'::jsonb);
      if jsonb_typeof(v_task_result)<>'object' or octet_length(v_task_result::text)>65536
         or v_task_result::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
        raise exception using errcode='22023',message='Task result must be a safe JSON object no larger than 64 KB.';
      end if;
      if v_task_result->>'provider' is distinct from v_task.selected_provider
         or v_task_result->>'model' is distinct from v_task.selected_model then
        raise exception using errcode='22023',message='Task result provider and model must match the assigned execution route.';
      end if;
      if v_task_result #>> '{moderation,input_flagged}' is distinct from 'false'
         or v_task_result #>> '{moderation,output_flagged}' is distinct from 'false'
         or v_task_result->>'external_action_taken' is distinct from 'false' then
        raise exception using errcode='42501',message='The task result must pass input/output moderation and confirm no external action.';
      end if;
      if jsonb_typeof(v_usage)<>'object'
         or v_usage::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
        raise exception using errcode='22023',message='Provider usage must be a safe JSON object.';
      end if;
      v_input_tokens := nullif(v_usage->>'input_tokens','')::integer;
      v_output_tokens := nullif(v_usage->>'output_tokens','')::integer;
      v_total_tokens := nullif(v_usage->>'total_tokens','')::integer;
      if coalesce(v_input_tokens,0)<0 or coalesce(v_output_tokens,0)<0 or coalesce(v_total_tokens,0)<0
         or coalesce(v_input_tokens,0)>100000000 or coalesce(v_output_tokens,0)>100000000
         or coalesce(v_total_tokens,0)>100000000 then
        raise exception using errcode='22023',message='Provider usage values are outside the supported range.';
      end if;
      v_usage := jsonb_build_object(
        'input_tokens',v_input_tokens,
        'output_tokens',v_output_tokens,
        'total_tokens',coalesce(v_total_tokens,coalesce(v_input_tokens,0)+coalesce(v_output_tokens,0))
      );
      v_provider_request_id := left(trim(coalesce(v_payload->>'provider_request_id','')),180);
      update ai_network.ai_task_queue q
        set status='succeeded',task_result=v_task_result,failure_reason='',
            worker_id=null,lease_token=null,lease_expires_at=null,active_execution_id=null,
            finished_at=now(),updated_at=now()
        where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id;
      update ai_network.ai_task_execution_attempts a
        set execution_status='succeeded',finished_at=now(),latency_ms=v_latency,
            input_tokens=v_input_tokens,output_tokens=v_output_tokens,
            provider_request_id=nullif(v_provider_request_id,''),
            metadata=a.metadata||jsonb_build_object('usage',v_usage,'provider_routing',v_task_result->'provider_routing')
        where a.execution_id=v_task.active_execution_id;
      insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata)
        values (v_worker.owner_user_id,v_task_id,'worker',v_worker.worker_id::text,
          'task_execution_succeeded','running','succeeded','Provider execution returned a validated result.',
          jsonb_build_object('route_id',v_task.execution_route_id,'provider',v_task.selected_provider,'model',v_task.selected_model));
      return jsonb_build_object('completed',true,'task_id',v_task_id,'status','succeeded');
    end if;

    v_error_code := left(trim(coalesce(v_payload->>'error_code','provider_error')),100);
    v_reason := left(trim(coalesce(v_payload->>'failure_reason','AI task execution failed.')),1000);
    if length(v_reason)<3 then v_reason := 'AI task execution failed.'; end if;
    v_retryable := coalesce((v_payload->>'retryable')::boolean,false);
    v_retry_seconds := greatest(5,least(3600,coalesce(nullif(v_payload->>'retry_after_seconds','')::integer,10*power(2,greatest(0,v_task.attempt_count-1))::integer)));
    v_next_status := case when v_retryable and v_task.attempt_count<v_task.max_attempts then 'queued' else 'failed' end;
    update ai_network.ai_task_queue q
      set status=v_next_status,failure_reason=v_reason,
          scheduled_for=case when v_next_status='queued' then now()+make_interval(secs=>v_retry_seconds) else q.scheduled_for end,
          worker_id=null,lease_token=null,lease_expires_at=null,active_execution_id=null,
          finished_at=case when v_next_status='failed' then now() else null end,updated_at=now()
      where q.task_id=v_task_id and q.owner_user_id=v_worker.owner_user_id;
    update ai_network.ai_task_execution_attempts a
      set execution_status=case when v_next_status='queued' then 'retry_scheduled' else 'failed' end,
          finished_at=now(),latency_ms=v_latency,error_code=v_error_code,failure_reason=v_reason
      where a.execution_id=v_task.active_execution_id;
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata)
      values (v_worker.owner_user_id,v_task_id,'worker',v_worker.worker_id::text,
        case when v_next_status='queued' then 'task_retry_scheduled' else 'task_execution_failed' end,
        'running',v_next_status,v_reason,
        jsonb_build_object('route_id',v_task.execution_route_id,'provider',v_task.selected_provider,
          'model',v_task.selected_model,'error_code',v_error_code,'retryable',v_retryable,'retry_after_seconds',v_retry_seconds));
    return jsonb_build_object('completed',false,'task_id',v_task_id,'status',v_next_status,'retry_after_seconds',v_retry_seconds);
  end if;

  raise exception using errcode='22023',message='Unsupported AI worker command.';
end;
$function$;

revoke all on function public.minglora_ai_worker_command(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_worker_command(text,text,jsonb) to service_role;

comment on table ai_network.ai_task_workers is
  'Server-managed AI task worker principals. Only SHA-256 credential hashes are stored; tokens are returned once at registration.';
comment on table ai_network.ai_task_execution_attempts is
  'Append-only per-attempt execution history including route, model, provider usage, failure and retry outcomes.';
comment on function public.minglora_ai_worker_command(text,text,jsonb) is
  'Authenticated worker lease API with owner scope, identity capability/permission checks, delegation validation, provider health/capability routing, rate/concurrency limits, retry, timeout and result recording.';
