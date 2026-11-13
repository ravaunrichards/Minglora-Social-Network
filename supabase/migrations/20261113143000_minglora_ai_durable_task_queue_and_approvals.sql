-- Minglora AI Network: durable, auditable task queue with human approvals and worker leases.
-- Runtime execution is fail-closed: default pause=true, execution_enabled=false, worker_limit=0.
-- This migration stores approved work; it does not execute model calls or external side effects.

create table if not exists ai_network.ai_task_runtime_controls (
  control_key text primary key default 'primary' check (control_key='primary'),
  global_paused boolean not null default true,
  execution_enabled boolean not null default false,
  max_concurrent_workers integer not null default 0 check (max_concurrent_workers between 0 and 10000),
  lease_seconds integer not null default 120 check (lease_seconds between 30 and 900),
  updated_at timestamptz not null default now()
);
insert into ai_network.ai_task_runtime_controls(control_key,global_paused,execution_enabled,max_concurrent_workers)
values ('primary',true,false,0)
on conflict (control_key) do nothing;

create table if not exists ai_network.ai_task_queue (
  task_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  organization_id uuid references ai_network.ai_organizations(organization_id) on delete restrict,
  task_title text not null check (length(trim(task_title)) between 3 and 180),
  task_type text not null check (task_type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  action_class text not null check (action_class in ('read_only','content','social','external','financial','security','moderation','other')),
  task_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(task_payload)='object' and octet_length(task_payload::text)<=65536),
  autonomy_mode text not null check (autonomy_mode in ('fully_supervised','supervisor_controlled','hybrid_autonomy','autonomous_within_limits','restricted_observation')),
  requires_approval boolean not null default true,
  status text not null default 'pending_approval'
    check (status in ('pending_approval','queued','running','succeeded','failed','cancelled','rejected','observation_only')),
  priority integer not null default 100 check (priority between 1 and 10000),
  scheduled_for timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  token_budget integer not null default 0 check (token_budget between 0 and 100000000),
  cost_limit_usd numeric(14,6) not null default 0 check (cost_limit_usd between 0 and 1000000),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  approved_by_user_id uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  worker_id text,
  lease_token uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  task_result jsonb check (task_result is null or (jsonb_typeof(task_result)='object' and octet_length(task_result::text)<=65536)),
  failure_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id,task_id),
  unique (owner_user_id,idempotency_key),
  check ((status='running' and worker_id is not null and lease_token is not null and lease_expires_at is not null) or (status<>'running' and worker_id is null and lease_token is null and lease_expires_at is null))
);
create index if not exists ai_task_queue_owner_status_schedule_idx
  on ai_network.ai_task_queue(owner_user_id,status,scheduled_for,priority desc,created_at);
create index if not exists ai_task_queue_identity_recent_idx
  on ai_network.ai_task_queue(identity_id,created_at desc);
create index if not exists ai_task_queue_lease_recovery_idx
  on ai_network.ai_task_queue(lease_expires_at)
  where status='running';

create table if not exists ai_network.ai_task_approvals (
  approval_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  task_id uuid not null unique,
  approval_status text not null default 'requested'
    check (approval_status in ('requested','approved','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_by_user_id uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text not null default '',
  foreign key (owner_user_id,task_id)
    references ai_network.ai_task_queue(owner_user_id,task_id) on delete restrict
);
create index if not exists ai_task_approvals_owner_status_time_idx
  on ai_network.ai_task_approvals(owner_user_id,approval_status,requested_at desc);

create table if not exists ai_network.ai_task_events (
  event_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  task_id uuid not null,
  actor_type text not null check (actor_type in ('human_user','worker','system')),
  actor_user_id uuid references public.profiles(id) on delete restrict,
  worker_id text,
  event_type text not null,
  previous_status text,
  new_status text not null,
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now(),
  foreign key (owner_user_id,task_id)
    references ai_network.ai_task_queue(owner_user_id,task_id) on delete restrict
);
create index if not exists ai_task_events_owner_task_time_idx
  on ai_network.ai_task_events(owner_user_id,task_id,occurred_at desc);

alter table ai_network.ai_task_runtime_controls enable row level security;
alter table ai_network.ai_task_queue enable row level security;
alter table ai_network.ai_task_approvals enable row level security;
alter table ai_network.ai_task_events enable row level security;
grant select, insert, update on ai_network.ai_task_runtime_controls to service_role;
grant select, insert, update on ai_network.ai_task_queue to service_role;
grant select, insert, update on ai_network.ai_task_approvals to service_role;
grant select, insert on ai_network.ai_task_events to service_role;

create or replace function public.minglora_ai_task_command(
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
  v_task_id uuid;
  v_identity_id uuid;
  v_organization_id uuid;
  v_worker_id text;
  v_lease_token uuid;
  v_task_title text;
  v_task_type text;
  v_action_class text;
  v_autonomy_mode text;
  v_status text;
  v_previous_status text;
  v_reason text;
  v_requires_approval boolean;
  v_priority integer;
  v_max_attempts integer;
  v_token_budget integer;
  v_cost_limit numeric(14,6);
  v_scheduled_for timestamptz;
  v_lease_seconds integer;
  v_max_workers integer;
  v_execution_enabled boolean;
  v_global_paused boolean;
  v_attempt_count integer;
  v_task_payload jsonb;
  v_result jsonb;
  v_row ai_network.ai_task_queue%rowtype;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI task commands are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora administrator is required.';
  end if;
  if jsonb_typeof(v_payload)<>'object' then
    raise exception using errcode = '22023', message = 'AI task command payload must be an object.';
  end if;
  if v_payload::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
    raise exception using errcode = '22023', message = 'Credentials and secrets are not allowed in AI task payloads.';
  end if;

  if v_action = 'create_task' then
    if coalesce(v_payload->>'identity_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid AI identity ID is required.';
    end if;
    v_identity_id := (v_payload->>'identity_id')::uuid;
    v_task_title := left(trim(coalesce(v_payload->>'task_title','')),180);
    v_task_type := lower(trim(coalesce(v_payload->>'task_type','')));
    v_action_class := lower(coalesce(v_payload->>'action_class','other'));
    v_task_payload := coalesce(v_payload->'task_payload','{}'::jsonb);
    v_priority := coalesce(nullif(v_payload->>'priority','')::integer,100);
    v_max_attempts := coalesce(nullif(v_payload->>'max_attempts','')::integer,3);
    v_token_budget := coalesce(nullif(v_payload->>'token_budget','')::integer,0);
    v_cost_limit := coalesce(nullif(v_payload->>'cost_limit_usd','')::numeric,0);
    v_scheduled_for := coalesce(nullif(v_payload->>'scheduled_for','')::timestamptz,now());
    if length(v_task_title)<3 or v_task_type !~ '^[a-z][a-z0-9_.-]{1,79}$' then
      raise exception using errcode = '22023', message = 'Task title and a valid task type are required.';
    end if;
    if v_action_class not in ('read_only','content','social','external','financial','security','moderation','other') then
      raise exception using errcode = '22023', message = 'Choose a supported task action class.';
    end if;
    if jsonb_typeof(v_task_payload)<>'object' or octet_length(v_task_payload::text)>65536 then
      raise exception using errcode = '22023', message = 'Task payload must be an object no larger than 64 KB.';
    end if;
    if v_priority<1 or v_priority>10000 or v_max_attempts<1 or v_max_attempts>10
       or v_token_budget<0 or v_token_budget>100000000
       or v_cost_limit<0 or v_cost_limit>1000000 then
      raise exception using errcode = '22023', message = 'Task priority, retry or budget limits are outside the supported range.';
    end if;
    if coalesce(v_payload->>'idempotency_key','') !~ '^.{8,160}$' then
      raise exception using errcode = '22023', message = 'A stable task idempotency key is required.';
    end if;
    if not exists(
      select 1 from ai_network.ai_identities i
      where i.identity_id=v_identity_id and i.owner_user_id=p_actor_user_id
        and i.status='active' and i.enabled=true
    ) then raise exception using errcode = '42501', message = 'AI identity must be active, enabled and owned by this Minglora administrator.'; end if;
    select i.supervision_level into v_autonomy_mode
    from ai_network.ai_identities i where i.identity_id=v_identity_id;
    v_requires_approval :=
      v_autonomy_mode='fully_supervised'
      or (v_autonomy_mode='supervisor_controlled' and v_action_class<>'read_only')
      or (v_autonomy_mode in ('hybrid_autonomy','autonomous_within_limits')
          and v_action_class in ('external','financial','security','moderation','other'))
      or v_action_class in ('financial','security');
    if v_autonomy_mode='restricted_observation' then
      v_status := 'observation_only';
      v_requires_approval := false;
    elsif v_requires_approval then
      v_status := 'pending_approval';
    else
      v_status := 'queued';
    end if;
    v_organization_id := nullif(v_payload->>'organization_id','')::uuid;
    if v_organization_id is not null and not exists(
      select 1 from ai_network.ai_organizations o
      where o.organization_id=v_organization_id and o.owner_user_id=p_actor_user_id
        and o.status not in ('suspended','archived')
    ) then raise exception using errcode = '42501', message = 'Organization is not owned or available to this administrator.'; end if;
    insert into ai_network.ai_task_queue(
      owner_user_id,identity_id,organization_id,task_title,task_type,action_class,task_payload,
      autonomy_mode,requires_approval,status,priority,scheduled_for,max_attempts,token_budget,cost_limit_usd,
      idempotency_key,created_by_user_id
    ) values (
      p_actor_user_id,v_identity_id,v_organization_id,v_task_title,v_task_type,v_action_class,v_task_payload,
      v_autonomy_mode,v_requires_approval,v_status,v_priority,v_scheduled_for,v_max_attempts,v_token_budget,v_cost_limit,
      v_payload->>'idempotency_key',p_actor_user_id
    )
    on conflict (owner_user_id,idempotency_key) do nothing
    returning task_id into v_task_id;
    if v_task_id is null then
      select q.* into v_row from ai_network.ai_task_queue q
      where q.owner_user_id=p_actor_user_id and q.idempotency_key=v_payload->>'idempotency_key';
      if v_row.task_id is null or v_row.identity_id<>v_identity_id
         or v_row.task_type<>v_task_type or v_row.task_title<>v_task_title
         or v_row.action_class<>v_action_class or v_row.task_payload<>v_task_payload then
        raise exception using errcode = '23505', message = 'Task idempotency key was already used for a different task request.';
      end if;
      select to_jsonb(q) into v_result from ai_network.ai_task_queue q where q.task_id=v_row.task_id and q.owner_user_id=p_actor_user_id;
      return jsonb_build_object('task',v_result,'reused',true);
    end if;
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,actor_user_id,event_type,new_status,reason,metadata)
    values (p_actor_user_id,v_task_id,'human_user',p_actor_user_id,'task_created',v_status,'AI task entered the durable queue under its identity supervision policy.',
      jsonb_build_object('requires_approval',v_requires_approval,'autonomy_mode',v_autonomy_mode,'action_class',v_action_class));
    if v_requires_approval then
      insert into ai_network.ai_task_approvals(owner_user_id,task_id,approval_status)
      values (p_actor_user_id,v_task_id,'requested');
    end if;
    select to_jsonb(q) into v_result from ai_network.ai_task_queue q
    where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id;
    return jsonb_build_object('task',v_result,'reused',false);
  end if;

  if v_action = 'list_tasks' then
    select jsonb_build_object(
      'tasks',coalesce((
        select jsonb_agg(to_jsonb(q) order by q.created_at desc)
        from (select * from ai_network.ai_task_queue
          where owner_user_id=p_actor_user_id order by created_at desc limit 100) q
      ),'[]'::jsonb),
      'runtime', (select to_jsonb(c) from ai_network.ai_task_runtime_controls c where c.control_key='primary')
    ) into v_result;
    return v_result;
  end if;

  if v_action in ('approve_task','reject_task') then
    if coalesce(v_payload->>'task_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid AI task ID is required.';
    end if;
    v_task_id := (v_payload->>'task_id')::uuid;
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    if length(v_reason)<3 then raise exception using errcode = '22023', message = 'A review reason of at least three characters is required.'; end if;
    select q.status into v_previous_status from ai_network.ai_task_queue q
    where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id for update;
    if v_previous_status is distinct from 'pending_approval' then
      raise exception using errcode = 'P0002', message = 'Task is not awaiting approval.';
    end if;
    v_status := case when v_action='approve_task' then 'queued' else 'rejected' end;
    update ai_network.ai_task_queue q
    set status=v_status,approved_by_user_id=case when v_action='approve_task' then p_actor_user_id else null end,
        approved_at=case when v_action='approve_task' then now() else null end,
        finished_at=case when v_action='reject_task' then now() else null end,updated_at=now()
    where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id;
    update ai_network.ai_task_approvals a
    set approval_status=case when v_action='approve_task' then 'approved' else 'rejected' end,
        reviewed_by_user_id=p_actor_user_id,reviewed_at=now(),review_reason=v_reason
    where a.task_id=v_task_id and a.owner_user_id=p_actor_user_id and a.approval_status='requested';
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,actor_user_id,event_type,previous_status,new_status,reason)
    values (p_actor_user_id,v_task_id,'human_user',p_actor_user_id,v_action,v_previous_status,v_status,v_reason);
    select to_jsonb(q) into v_result from ai_network.ai_task_queue q where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id;
    return jsonb_build_object('task',v_result);
  end if;

  if v_action = 'cancel_task' then
    v_task_id := nullif(v_payload->>'task_id','')::uuid;
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    if length(v_reason)<3 then raise exception using errcode = '22023', message = 'A cancellation reason of at least three characters is required.'; end if;
    update ai_network.ai_task_queue q
    set status='cancelled',worker_id=null,lease_token=null,lease_expires_at=null,updated_at=now(),finished_at=now()
    where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id and q.status in ('pending_approval','queued','observation_only')
    returning q.status into v_status;
    if v_status is null then raise exception using errcode = 'P0002', message = 'Only a waiting or observation-only task can be cancelled.'; end if;
    update ai_network.ai_task_approvals a set approval_status='cancelled'
    where a.task_id=v_task_id and a.owner_user_id=p_actor_user_id and a.approval_status='requested';
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,actor_user_id,event_type,previous_status,new_status,reason)
    values (p_actor_user_id,v_task_id,'human_user',p_actor_user_id,'task_cancelled',null,v_status,v_reason);
    select to_jsonb(q) into v_result from ai_network.ai_task_queue q where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id;
    return jsonb_build_object('task',v_result);
  end if;

  if v_action = 'claim_next_task' then
    v_worker_id := trim(coalesce(v_payload->>'worker_id',''));
    if length(v_worker_id)<2 or length(v_worker_id)>120 then
      raise exception using errcode = '22023', message = 'A valid worker identifier is required.';
    end if;
    select c.execution_enabled,c.global_paused,c.max_concurrent_workers,c.lease_seconds
      into v_execution_enabled,v_global_paused,v_max_workers,v_lease_seconds
    from ai_network.ai_task_runtime_controls c where c.control_key='primary';
    if not coalesce(v_execution_enabled,false) or coalesce(v_global_paused,true) or coalesce(v_max_workers,0)=0 then
      return jsonb_build_object('claimed',false,'reason','runtime_paused_or_disabled');
    end if;
    with expired as (
      update ai_network.ai_task_queue q
      set status=case when q.attempt_count>=q.max_attempts then 'failed' else 'queued' end,
          worker_id=null,lease_token=null,lease_expires_at=null,
          finished_at=case when q.attempt_count>=q.max_attempts then now() else null end,
          updated_at=now()
      where q.owner_user_id=p_actor_user_id and q.status='running' and q.lease_expires_at<now()
      returning q.task_id,q.status
    )
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,event_type,previous_status,new_status,reason)
    select p_actor_user_id,e.task_id,'system','worker_lease_expired','running',e.status,'Expired worker lease was recovered by the queue.'
    from expired e;
    if (select count(*) from ai_network.ai_task_queue q where q.owner_user_id=p_actor_user_id and q.status='running' and q.lease_expires_at>now())>=v_max_workers then
      return jsonb_build_object('claimed',false,'reason','worker_limit_reached');
    end if;
    select q.* into v_row
    from ai_network.ai_task_queue q
    where q.owner_user_id=p_actor_user_id and q.status='queued' and q.scheduled_for<=now()
      and q.attempt_count<q.max_attempts
      and exists (
        select 1 from ai_network.ai_identities i
        where i.identity_id=q.identity_id and i.owner_user_id=p_actor_user_id
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
    if v_row.task_id is null then return jsonb_build_object('claimed',false,'reason','no_due_task_with_verified_provider'); end if;
    v_lease_token := gen_random_uuid();
    update ai_network.ai_task_queue q
    set status='running',worker_id=v_worker_id,lease_token=v_lease_token,
        lease_expires_at=now()+make_interval(secs=>v_lease_seconds),
        attempt_count=q.attempt_count+1,started_at=coalesce(q.started_at,now()),updated_at=now()
    where q.task_id=v_row.task_id and q.owner_user_id=p_actor_user_id
    returning q.* into v_row;
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason)
    values (p_actor_user_id,v_row.task_id,'worker',v_worker_id,'worker_claimed','queued','running','Worker acquired a bounded task lease.');
    return jsonb_build_object(
      'claimed',true,'task_id',v_row.task_id,'identity_id',v_row.identity_id,
      'task_type',v_row.task_type,'task_title',v_row.task_title,'action_class',v_row.action_class,
      'task_payload',v_row.task_payload,'token_budget',v_row.token_budget,'cost_limit_usd',v_row.cost_limit_usd,
      'worker_id',v_worker_id,'lease_token',v_lease_token,'lease_expires_at',v_row.lease_expires_at
    );
  end if;

  if v_action in ('heartbeat_task','complete_task','fail_task') then
    if coalesce(v_payload->>'task_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_payload->>'lease_token','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid task and lease token are required.';
    end if;
    v_task_id := (v_payload->>'task_id')::uuid;
    v_lease_token := (v_payload->>'lease_token')::uuid;
    v_worker_id := trim(coalesce(v_payload->>'worker_id',''));
    select q.status,q.attempt_count into v_previous_status,v_attempt_count
    from ai_network.ai_task_queue q
    where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id
      and q.worker_id=v_worker_id and q.lease_token=v_lease_token
      and q.status='running' and q.lease_expires_at>now()
    for update;
    if v_previous_status is null then raise exception using errcode = '42501', message = 'Task worker lease is invalid or expired.'; end if;
    if v_action='heartbeat_task' then
      select c.lease_seconds into v_lease_seconds from ai_network.ai_task_runtime_controls c where c.control_key='primary';
      update ai_network.ai_task_queue q set lease_expires_at=now()+make_interval(secs=>v_lease_seconds),updated_at=now()
      where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id;
      return jsonb_build_object('renewed',true,'lease_seconds',v_lease_seconds);
    elsif v_action='complete_task' then
      v_task_payload := coalesce(v_payload->'task_result','{}'::jsonb);
      if jsonb_typeof(v_task_payload)<>'object' or octet_length(v_task_payload::text)>65536
         or v_task_payload::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
        raise exception using errcode = '22023', message = 'Task result must be a safe JSON object no larger than 64 KB.';
      end if;
      update ai_network.ai_task_queue q set status='succeeded',task_result=v_task_payload,
        worker_id=null,lease_token=null,lease_expires_at=null,finished_at=now(),updated_at=now()
      where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id;
      v_status := 'succeeded';
      v_reason := 'Worker reported successful completion.';
    else
      v_reason := left(trim(coalesce(v_payload->>'failure_reason','Task worker failed.')),1000);
      v_status := case when v_attempt_count< (select q.max_attempts from ai_network.ai_task_queue q where q.task_id=v_task_id) then 'queued' else 'failed' end;
      update ai_network.ai_task_queue q set status=v_status,failure_reason=v_reason,
        scheduled_for=case when v_status='queued' then now()+make_interval(secs=>least(3600,10*v_attempt_count)) else q.scheduled_for end,
        worker_id=null,lease_token=null,lease_expires_at=null,
        finished_at=case when v_status='failed' then now() else null end,updated_at=now()
      where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id;
    end if;
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason)
    values (p_actor_user_id,v_task_id,'worker',v_worker_id,v_action,'running',v_status,v_reason);
    select to_jsonb(q) into v_result from ai_network.ai_task_queue q where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id;
    return jsonb_build_object('task',v_result);
  end if;

  raise exception using errcode = '22023', message = 'Unsupported AI task command.';
end;
$function$;

comment on function public.minglora_ai_task_command(text,uuid,jsonb)
  is 'Private durable AI task queue with supervision-driven approval, retry, SKIP LOCKED worker leases and fail-closed runtime controls.';

revoke all on function public.minglora_ai_task_command(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_task_command(text,uuid,jsonb) to service_role;
