-- Minglora AI Network Phase 6: authenticated execution orchestration.
-- Adds an independently authenticated worker boundary, durable provider rate buckets,
-- execution leases, safe completion/failure transitions and running-task cancellation.
-- All controls remain closed until an operator provisions a worker credential,
-- configures a supported provider, activates an identity/assignment and enables runtime.

create table if not exists ai_network.ai_worker_credentials (
  worker_id text primary key check (length(worker_id) between 8 and 120),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  credential_status text not null default 'active' check (credential_status in ('active','revoked')),
  expires_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_network.ai_execution_rate_buckets (
  provider_name text not null,
  model_identifier text not null,
  window_start timestamptz not null,
  requests_used integer not null default 0 check (requests_used >= 0),
  tokens_reserved integer not null default 0 check (tokens_reserved >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider_name, model_identifier, window_start)
);
create index if not exists ai_execution_rate_buckets_window_idx
  on ai_network.ai_execution_rate_buckets(window_start);

alter table ai_network.ai_worker_credentials enable row level security;
alter table ai_network.ai_execution_rate_buckets enable row level security;
grant select, insert, update on ai_network.ai_worker_credentials to service_role;
grant select, insert, update on ai_network.ai_execution_rate_buckets to service_role;


create or replace function public.minglora_ai_worker_authenticate(p_token_sha256 text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_worker record;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='Worker credential authentication is restricted to the Minglora server runtime.';
  end if;
  if coalesce(p_token_sha256,'') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='42501',message='Worker credential is invalid.';
  end if;
  select c.worker_id,c.owner_user_id into v_worker
  from ai_network.ai_worker_credentials c
  where c.token_sha256=p_token_sha256
    and c.credential_status='active'
    and (c.expires_at is null or c.expires_at>now());
  if v_worker.worker_id is null then
    raise exception using errcode='42501',message='Worker credential is inactive, expired or invalid.';
  end if;
  update ai_network.ai_worker_credentials
  set last_seen_at=now(),updated_at=now()
  where worker_id=v_worker.worker_id;
  return jsonb_build_object('worker_id',v_worker.worker_id,'owner_user_id',v_worker.owner_user_id);
end;
$function$;

create or replace function public.minglora_ai_worker_command(
  p_action text,
  p_worker_id text,
  p_owner_user_id uuid,
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
  v_row ai_network.ai_task_queue%rowtype;
  v_route jsonb;
  v_result jsonb;
  v_previous_status text;
  v_next_status text;
  v_reason text;
  v_failure_code text;
  v_attempt_count integer;
  v_retryable boolean;
  v_retry_seconds integer;
  v_estimated_tokens integer;
  v_max_requests integer;
  v_max_tokens integer;
  v_window timestamptz;
  v_bucket record;
  v_lease_seconds integer;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='AI worker commands are restricted to the authenticated Minglora worker gateway.';
  end if;
  if p_worker_id is null or length(trim(p_worker_id)) < 8
     or p_owner_user_id is null
     or not exists (
       select 1 from ai_network.ai_worker_credentials c
       where c.worker_id=p_worker_id and c.owner_user_id=p_owner_user_id
         and c.credential_status='active'
         and (c.expires_at is null or c.expires_at>now())
     ) then
    raise exception using errcode='42501',message='The AI worker credential is inactive, expired or outside its owner scope.';
  end if;
  if jsonb_typeof(v_payload)<>'object' or octet_length(v_payload::text)>100000 then
    raise exception using errcode='22023',message='AI worker payload must be a JSON object no larger than 100 KB.';
  end if;
  if v_payload::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential|private[_-]?key)"[[:space:]]*:' then
    raise exception using errcode='22023',message='Credentials and secret values are not permitted in AI worker payloads.';
  end if;

  update ai_network.ai_worker_credentials
  set last_seen_at=now(),updated_at=now()
  where worker_id=p_worker_id and owner_user_id=p_owner_user_id;

  if v_action='list_provider_health_targets' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'provider_account_id',pa.provider_account_id,
      'assignment_id',a.assignment_id,
      'model_id',m.model_id,
      'model_identifier',m.model_identifier,
      'provider_name',pa.provider_name,
      'assignment_status',a.assignment_status,
      'account_status',pa.status
    ) order by pa.provider_name,a.routing_priority,m.model_identifier),'[]'::jsonb)
    into v_result
    from ai_network.ai_provider_accounts pa
    join ai_network.ai_provider_assignments a on a.provider_account_id=pa.provider_account_id
    join ai_network.ai_provider_models m on m.model_id=a.model_id
    join ai_network.ai_identities i on i.identity_id=a.identity_id
    where pa.owner_user_id=p_owner_user_id
      and i.owner_user_id=p_owner_user_id
      and a.assignment_status in ('pending','active','restricted')
      and pa.status not in ('revoked','disabled')
      and lower(replace(pa.provider_name,' api',''))='openai'
      and lower(replace(m.provider_name,' api',''))='openai'
      and m.is_active=true;
    return jsonb_build_object('targets',v_result);
  end if;

  if v_action='record_provider_health' then
    if coalesce(v_payload->>'provider_account_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
    with expired as (
      update ai_network.ai_task_queue q
      set status=case when q.attempt_count>=q.max_attempts then 'failed' else 'queued' end,
          worker_id=null,lease_token=null,lease_expires_at=null,
          finished_at=case when q.attempt_count>=q.max_attempts then now() else null end,
          failure_reason=case when q.attempt_count>=q.max_attempts then 'Worker lease expired after the final permitted attempt.' else q.failure_reason end,
          updated_at=now()
      where q.owner_user_id=p_owner_user_id and q.status='running' and q.lease_expires_at<=now()
      returning q.task_id,q.status,q.attempt_count
    )
    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata
    )
    select p_owner_user_id,e.task_id,'system',p_worker_id,'worker_lease_expired','running',e.status,
      'Expired worker lease was recovered by the orchestration engine.',
      jsonb_build_object('attempt_count',e.attempt_count)
    from expired e;

    if exists (
      select 1 from ai_network.ai_task_runtime_controls c
      where c.control_key='primary'
        and (c.global_paused or not c.execution_enabled or c.max_concurrent_workers<1)
    ) or not exists(select 1 from ai_network.ai_task_runtime_controls where control_key='primary') then
      return jsonb_build_object('claimed',false,'reason','runtime_paused_or_disabled');
    end if;

    if (
      select count(*) from ai_network.ai_task_queue q
      where q.owner_user_id=p_owner_user_id and q.status='running'
        and q.lease_expires_at>now()
    ) >= (
      select c.max_concurrent_workers from ai_network.ai_task_runtime_controls c where c.control_key='primary'
    ) then
      return jsonb_build_object('claimed',false,'reason','worker_limit_reached');
    end if;

    select q.* into v_row
    from ai_network.ai_task_queue q
    where q.owner_user_id=p_owner_user_id
      and q.status='queued' and q.scheduled_for<=now()
      and q.attempt_count<q.max_attempts
      and q.action_class in ('read_only','content')
      and q.task_type in (
        'content_outline','caption_draft','title_ideas','translation_draft',
        'content_draft','creator_calendar','public_event_support','ai_to_ai_message'
      )
      and q.token_budget between 192 and 1000000
      and q.cost_limit_usd=0
      and exists (
        select 1 from ai_network.ai_identities i
        where i.identity_id=q.identity_id and i.owner_user_id=q.owner_user_id
          and i.status='active' and i.enabled=true
          and i.supervision_level<>'restricted_observation'
      )
      and exists (
        select 1 from ai_network.ai_identity_capabilities cap
        where cap.identity_id=q.identity_id and cap.is_enabled=true
          and cap.capability_key='task_execution'
      )
      and exists (
        select 1 from ai_network.ai_identity_permissions perm
        where perm.identity_id=q.identity_id and perm.effect='allow'
          and perm.permission_key in ('execute_task','task.execute','task:'||q.task_type)
          and perm.resource_scope in ('*',q.task_type,'task:'||q.task_type)
          and (perm.expires_at is null or perm.expires_at>now())
      )
      and not exists (
        select 1 from ai_network.ai_identity_permissions deny
        where deny.identity_id=q.identity_id and deny.effect='deny'
          and deny.permission_key in ('execute_task','task.execute','task:'||q.task_type)
          and deny.resource_scope in ('*',q.task_type,'task:'||q.task_type)
          and (deny.expires_at is null or deny.expires_at>now())
      )
      and (not q.requires_approval or exists (
        select 1 from ai_network.ai_task_approvals ap
        where ap.task_id=q.task_id and ap.owner_user_id=q.owner_user_id
          and ap.approval_status='approved'
      ))
      and (q.delegation_grant_id is null or exists (
        select 1 from ai_network.ai_delegation_grants dg
        where dg.delegation_grant_id=q.delegation_grant_id
          and dg.owner_user_id=q.owner_user_id
          and dg.grantee_identity_id=q.identity_id
          and dg.grantor_identity_id=q.delegated_from_identity_id
          and dg.grant_status='active' and dg.expires_at>now()
          and q.task_type=any(dg.allowed_task_types)
          and q.action_class=any(dg.allowed_action_classes)
          and (dg.max_token_budget=0 or q.token_budget<=dg.max_token_budget)
          and (dg.max_cost_limit_usd=0 or q.cost_limit_usd<=dg.max_cost_limit_usd)
      ))
      and exists (
        select 1
        from ai_network.ai_provider_assignments a
        join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
        join ai_network.ai_provider_models m on m.model_id=a.model_id
        where a.identity_id=q.identity_id and a.assignment_status='active'
          and a.provider_health_status='healthy'
          and pa.owner_user_id=q.owner_user_id
          and pa.status='configured' and pa.health_status='healthy'
          and pa.last_checked_at>now()-interval '15 minutes'
          and lower(replace(pa.provider_name,' api',''))='openai'
          and lower(replace(m.provider_name,' api',''))='openai'
          and m.is_active=true and m.text_capability=true
          and a.assigned_capabilities && array['text','text_generation','reasoning']::text[]
          and m.model_capabilities && array['text','text_generation','reasoning']::text[]
      )
    order by q.priority asc,q.scheduled_for asc,q.created_at asc
    for update skip locked
    limit 1;

    if v_row.task_id is null then
      return jsonb_build_object('claimed',false,'reason','no_due_authorized_task_with_healthy_provider');
    end if;

    select jsonb_build_object(
      'assignment_id',a.assignment_id,
      'provider_account_id',pa.provider_account_id,
      'provider_name',pa.provider_name,
      'provider_identifier',pa.provider_identifier,
      'model_id',m.model_id,
      'model_name',m.model_name,
      'model_identifier',m.model_identifier,
      'model_capabilities',m.model_capabilities,
      'assigned_capabilities',a.assigned_capabilities,
      'fallback_model',case when fm.model_id is null then null else jsonb_build_object(
        'provider_name',fm.provider_name,'model_identifier',fm.model_identifier,'model_id',fm.model_id
      ) end
    ) into v_route
    from ai_network.ai_provider_assignments a
    join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
    join ai_network.ai_provider_models m on m.model_id=a.model_id
    left join ai_network.ai_provider_models fm on fm.model_id=a.fallback_model_id and fm.is_active=true
    where a.identity_id=v_row.identity_id and a.assignment_status='active'
      and a.provider_health_status='healthy'
      and pa.owner_user_id=p_owner_user_id and pa.status='configured'
      and pa.health_status='healthy' and pa.last_checked_at>now()-interval '15 minutes'
      and lower(replace(pa.provider_name,' api',''))='openai'
      and lower(replace(m.provider_name,' api',''))='openai'
      and m.is_active=true and m.text_capability=true
      and a.assigned_capabilities && array['text','text_generation','reasoning']::text[]
      and m.model_capabilities && array['text','text_generation','reasoning']::text[]
    order by a.routing_priority asc,a.assigned_at desc
    limit 1;

    if v_route is null then
      return jsonb_build_object('claimed',false,'reason','provider_route_unavailable');
    end if;

    select c.lease_seconds into v_lease_seconds
    from ai_network.ai_task_runtime_controls c where c.control_key='primary';

    update ai_network.ai_task_queue q
    set status='running',worker_id=p_worker_id,lease_token=gen_random_uuid(),
        lease_expires_at=now()+make_interval(secs=>v_lease_seconds),
        attempt_count=q.attempt_count+1,
        started_at=coalesce(q.started_at,now()),updated_at=now()
    where q.task_id=v_row.task_id and q.owner_user_id=p_owner_user_id
    returning q.* into v_row;

    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata
    ) values (
      p_owner_user_id,v_row.task_id,'worker',p_worker_id,'execution_route_selected','queued','running',
      'Authorized worker acquired a leased task and resolved a healthy OpenAI text route.',
      jsonb_build_object('route',v_route,'attempt_count',v_row.attempt_count)
    );

    return jsonb_build_object(
      'claimed',true,
      'task',jsonb_build_object(
        'task_id',v_row.task_id,'owner_user_id',v_row.owner_user_id,
        'identity_id',v_row.identity_id,'task_type',v_row.task_type,
        'task_title',v_row.task_title,'action_class',v_row.action_class,
        'task_payload',v_row.task_payload,'token_budget',v_row.token_budget,
        'cost_limit_usd',v_row.cost_limit_usd,'attempt_count',v_row.attempt_count,
        'max_attempts',v_row.max_attempts,'worker_id',v_row.worker_id,
        'lease_token',v_row.lease_token,'lease_expires_at',v_row.lease_expires_at,
        'delegation_grant_id',v_row.delegation_grant_id,
        'delegated_from_identity_id',v_row.delegated_from_identity_id
      ),
      'route',v_route,
      'identity',(select jsonb_build_object(
        'display_name',n.display_name,'purpose',i.purpose,'personality',p.personality,
        'bio',p.bio,'introduction',p.introduction,'skills',p.skills
      )
      from ai_network.ai_identities i
      left join ai_network.ai_names n on n.identity_id=i.identity_id
      left join ai_network.ai_profiles p on p.identity_id=i.identity_id
      where i.identity_id=v_row.identity_id and i.owner_user_id=p_owner_user_id)
    );
  end if;

  if v_action='heartbeat_task' then
    update ai_network.ai_task_queue q
    set lease_expires_at=now()+make_interval(secs=>(select c.lease_seconds from ai_network.ai_task_runtime_controls c where c.control_key='primary')),
        updated_at=now()
    where q.task_id=(v_payload->>'task_id')::uuid
      and q.owner_user_id=p_owner_user_id and q.worker_id=p_worker_id
      and q.lease_token=(v_payload->>'lease_token')::uuid
      and q.status='running' and q.lease_expires_at>now()
      and exists (
        select 1 from ai_network.ai_task_runtime_controls c
        where c.control_key='primary' and c.execution_enabled=true and c.global_paused=false
      );
    return jsonb_build_object('renewed',found);
  end if;

  if v_action='reserve_provider_capacity' then
    v_estimated_tokens:=coalesce((v_payload->>'estimated_tokens')::integer,0);
    v_max_requests:=coalesce((v_payload->>'max_requests_per_minute')::integer,30);
    v_max_tokens:=coalesce((v_payload->>'max_tokens_per_minute')::integer,30000);
    if v_estimated_tokens<1 or v_estimated_tokens>1000000
       or v_max_requests<1 or v_max_requests>600
       or v_max_tokens<128 or v_max_tokens>1000000 then
      raise exception using errcode='22023',message='Provider rate-limit reservation is outside the supported range.';
    end if;
    if lower(coalesce(v_payload->>'provider_name',''))<>'openai'
       or length(coalesce(v_payload->>'model_identifier','')) not between 1 and 180 then
      raise exception using errcode='22023',message='A supported provider and model are required for rate-limit reservation.';
    end if;
    v_window:=date_trunc('minute',now());
    insert into ai_network.ai_execution_rate_buckets(
      provider_name,model_identifier,window_start,requests_used,tokens_reserved
    ) values (
      'openai',v_payload->>'model_identifier',v_window,1,v_estimated_tokens
    )
    on conflict (provider_name,model_identifier,window_start) do update
    set requests_used=ai_network.ai_execution_rate_buckets.requests_used+1,
        tokens_reserved=ai_network.ai_execution_rate_buckets.tokens_reserved+v_estimated_tokens,
        updated_at=now()
    where ai_network.ai_execution_rate_buckets.requests_used<v_max_requests
      and ai_network.ai_execution_rate_buckets.tokens_reserved+v_estimated_tokens<=v_max_tokens
    returning requests_used,tokens_reserved into v_bucket;
    if not found then
      return jsonb_build_object(
        'reserved',false,
        'retry_after_seconds',greatest(1,60-extract(second from now())::integer)
      );
    end if;
    return jsonb_build_object(
      'reserved',true,'window_start',v_window,
      'requests_used',v_bucket.requests_used,'tokens_reserved',v_bucket.tokens_reserved
    );
  end if;

  if v_action='complete_task' then
    if jsonb_typeof(v_payload->'task_result')<>'object'
       or length(trim(coalesce(v_payload->'task_result'->>'output','')))=0
       or octet_length((v_payload->'task_result')::text)>65536
       or coalesce(v_payload->'task_result'->>'succeeded','false')<>'true'
       or not (v_payload->'task_result' ? 'route')
       or v_payload->'task_result'->'route'->>'provider' is null
       or v_payload->'task_result'->'route'->>'model' is null then
      raise exception using errcode='22023',message='A successful completion requires non-empty output and identifiable provider/model routing metadata.';
    end if;
    if (v_payload->'task_result')::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential|private[_-]?key)"[[:space:]]*:' then
      raise exception using errcode='22023',message='Task results cannot contain credentials or secrets.';
    end if;
    update ai_network.ai_task_queue q
    set status='succeeded',task_result=v_payload->'task_result',failure_reason='',
        worker_id=null,lease_token=null,lease_expires_at=null,finished_at=now(),updated_at=now()
    where q.task_id=(v_payload->>'task_id')::uuid
      and q.owner_user_id=p_owner_user_id and q.worker_id=p_worker_id
      and q.lease_token=(v_payload->>'lease_token')::uuid
      and q.status='running' and q.lease_expires_at>now();
    if not found then
      return jsonb_build_object('completed',false,'reason','lease_invalid_or_task_cancelled');
    end if;
    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata
    ) values (
      p_owner_user_id,(v_payload->>'task_id')::uuid,'worker',p_worker_id,'task_execution_succeeded','running','succeeded',
      'Provider returned a non-empty moderated result and the active task lease was valid.',
      jsonb_build_object('route',v_payload->'task_result'->'route','usage',v_payload->'task_result'->'usage',
        'duration_ms',v_payload->'task_result'->'duration_ms')
    );
    insert into ai_network.ai_delegation_events(
      owner_user_id,delegation_grant_id,actor_user_id,actor_identity_id,event_type,reason,task_id,metadata
    )
    select q.owner_user_id,q.delegation_grant_id,q.owner_user_id,q.identity_id,
      'delegated_task_completed','Authorized delegated AI task completed with a moderated provider result.',
      q.task_id,jsonb_build_object('route',v_payload->'task_result'->'route')
    from ai_network.ai_task_queue q
    where q.task_id=(v_payload->>'task_id')::uuid and q.owner_user_id=p_owner_user_id
      and q.delegation_grant_id is not null;
    return jsonb_build_object('completed',true,'status','succeeded');
  end if;

  if v_action='fail_task' then
    v_failure_code:=left(coalesce(v_payload->>'failure_code','execution_failed'),80);
    v_reason:=left(trim(coalesce(v_payload->>'failure_reason','Task execution failed.')),1000);
    v_retryable:=coalesce((v_payload->>'retryable')::boolean,false);
    v_retry_seconds:=greatest(5,least(3600,coalesce((v_payload->>'retry_after_seconds')::integer,30)));
    select q.status,q.attempt_count into v_previous_status,v_attempt_count
    from ai_network.ai_task_queue q
    where q.task_id=(v_payload->>'task_id')::uuid
      and q.owner_user_id=p_owner_user_id and q.worker_id=p_worker_id
      and q.lease_token=(v_payload->>'lease_token')::uuid
      and q.status='running' and q.lease_expires_at>now()
    for update;
    if not found then
      return jsonb_build_object('recorded',false,'reason','lease_invalid_or_task_cancelled');
    end if;
    select q.max_attempts into v_row.max_attempts
    from ai_network.ai_task_queue q where q.task_id=(v_payload->>'task_id')::uuid and q.owner_user_id=p_owner_user_id;
    v_next_status:=case when v_retryable and v_attempt_count<v_row.max_attempts then 'queued' else 'failed' end;
    update ai_network.ai_task_queue q
    set status=v_next_status,failure_reason=v_reason,task_result=case
          when jsonb_typeof(v_payload->'failure_result')='object' then v_payload->'failure_result'
          else null end,
        scheduled_for=case when v_next_status='queued' then now()+make_interval(secs=>v_retry_seconds) else q.scheduled_for end,
        worker_id=null,lease_token=null,lease_expires_at=null,
        finished_at=case when v_next_status='failed' then now() else null end,updated_at=now()
    where q.task_id=(v_payload->>'task_id')::uuid and q.owner_user_id=p_owner_user_id;
    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata
    ) values (
      p_owner_user_id,(v_payload->>'task_id')::uuid,'worker',p_worker_id,
      case when v_next_status='queued' then 'task_retry_scheduled' else 'task_execution_failed' end,
      'running',v_next_status,v_reason,
      jsonb_build_object('failure_code',v_failure_code,'retryable',v_retryable,
        'retry_after_seconds',case when v_next_status='queued' then v_retry_seconds else null end,
        'failure_metadata',coalesce(v_payload->'failure_metadata','{}'::jsonb))
    );
    insert into ai_network.ai_delegation_events(
      owner_user_id,delegation_grant_id,actor_user_id,actor_identity_id,event_type,reason,task_id,metadata
    )
    select q.owner_user_id,q.delegation_grant_id,q.owner_user_id,q.identity_id,
      'delegated_task_execution_failed','Delegated AI task failed or was rescheduled for retry.',
      q.task_id,jsonb_build_object('failure_code',v_failure_code,'status',v_next_status)
    from ai_network.ai_task_queue q
    where q.task_id=(v_payload->>'task_id')::uuid and q.owner_user_id=p_owner_user_id
      and q.delegation_grant_id is not null;
    return jsonb_build_object('recorded',true,'status',v_next_status,'retry_after_seconds',
      case when v_next_status='queued' then v_retry_seconds else null end);
  end if;

  raise exception using errcode='22023',message='Unsupported Minglora AI worker command.';
end;
$function$;
       or coalesce(v_payload->>'assignment_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
    with expired as (
      update ai_network.ai_task_queue q
      set status=case when q.attempt_count>=q.max_attempts then 'failed' else 'queued' end,
          worker_id=null,lease_token=null,lease_expires_at=null,
          finished_at=case when q.attempt_count>=q.max_attempts then now() else null end,
          failure_reason=case when q.attempt_count>=q.max_attempts then 'Worker lease expired after the final permitted attempt.' else q.failure_reason end,
          updated_at=now()
      where q.owner_user_id=p_owner_user_id and q.status='running' and q.lease_expires_at<=now()
      returning q.task_id,q.status,q.attempt_count
    )
    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata
    )
    select p_owner_user_id,e.task_id,'system',p_worker_id,'worker_lease_expired','running',e.status,
      'Expired worker lease was recovered by the orchestration engine.',
      jsonb_build_object('attempt_count',e.attempt_count)
    from expired e;

    if exists (
      select 1 from ai_network.ai_task_runtime_controls c
      where c.control_key='primary'
        and (c.global_paused or not c.execution_enabled or c.max_concurrent_workers<1)
    ) or not exists(select 1 from ai_network.ai_task_runtime_controls where control_key='primary') then
      return jsonb_build_object('claimed',false,'reason','runtime_paused_or_disabled');
    end if;

    if (
      select count(*) from ai_network.ai_task_queue q
      where q.owner_user_id=p_owner_user_id and q.status='running'
        and q.lease_expires_at>now()
    ) >= (
      select c.max_concurrent_workers from ai_network.ai_task_runtime_controls c where c.control_key='primary'
    ) then
      return jsonb_build_object('claimed',false,'reason','worker_limit_reached');
    end if;

    select q.* into v_row
    from ai_network.ai_task_queue q
    where q.owner_user_id=p_owner_user_id
      and q.status='queued' and q.scheduled_for<=now()
      and q.attempt_count<q.max_attempts
      and q.action_class in ('read_only','content')
      and q.task_type in (
        'content_outline','caption_draft','title_ideas','translation_draft',
        'content_draft','creator_calendar','public_event_support','ai_to_ai_message'
      )
      and q.token_budget between 192 and 1000000
      and q.cost_limit_usd=0
      and exists (
        select 1 from ai_network.ai_identities i
        where i.identity_id=q.identity_id and i.owner_user_id=q.owner_user_id
          and i.status='active' and i.enabled=true
          and i.supervision_level<>'restricted_observation'
      )
      and exists (
        select 1 from ai_network.ai_identity_capabilities cap
        where cap.identity_id=q.identity_id and cap.is_enabled=true
          and cap.capability_key='task_execution'
      )
      and exists (
        select 1 from ai_network.ai_identity_permissions perm
        where perm.identity_id=q.identity_id and perm.effect='allow'
          and perm.permission_key in ('execute_task','task.execute','task:'||q.task_type)
          and perm.resource_scope in ('*',q.task_type,'task:'||q.task_type)
          and (perm.expires_at is null or perm.expires_at>now())
      )
      and not exists (
        select 1 from ai_network.ai_identity_permissions deny
        where deny.identity_id=q.identity_id and deny.effect='deny'
          and deny.permission_key in ('execute_task','task.execute','task:'||q.task_type)
          and deny.resource_scope in ('*',q.task_type,'task:'||q.task_type)
          and (deny.expires_at is null or deny.expires_at>now())
      )
      and (not q.requires_approval or exists (
        select 1 from ai_network.ai_task_approvals ap
        where ap.task_id=q.task_id and ap.owner_user_id=q.owner_user_id
          and ap.approval_status='approved'
      ))
      and (q.delegation_grant_id is null or exists (
        select 1 from ai_network.ai_delegation_grants dg
        where dg.delegation_grant_id=q.delegation_grant_id
          and dg.owner_user_id=q.owner_user_id
          and dg.grantee_identity_id=q.identity_id
          and dg.grantor_identity_id=q.delegated_from_identity_id
          and dg.grant_status='active' and dg.expires_at>now()
          and q.task_type=any(dg.allowed_task_types)
          and q.action_class=any(dg.allowed_action_classes)
          and (dg.max_token_budget=0 or q.token_budget<=dg.max_token_budget)
          and (dg.max_cost_limit_usd=0 or q.cost_limit_usd<=dg.max_cost_limit_usd)
      ))
      and exists (
        select 1
        from ai_network.ai_provider_assignments a
        join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
        join ai_network.ai_provider_models m on m.model_id=a.model_id
        where a.identity_id=q.identity_id and a.assignment_status='active'
          and a.provider_health_status='healthy'
          and pa.owner_user_id=q.owner_user_id
          and pa.status='configured' and pa.health_status='healthy'
          and pa.last_checked_at>now()-interval '15 minutes'
          and lower(replace(pa.provider_name,' api',''))='openai'
          and lower(replace(m.provider_name,' api',''))='openai'
          and m.is_active=true and m.text_capability=true
          and a.assigned_capabilities && array['text','text_generation','reasoning']::text[]
          and m.model_capabilities && array['text','text_generation','reasoning']::text[]
      )
    order by q.priority asc,q.scheduled_for asc,q.created_at asc
    for update skip locked
    limit 1;

    if v_row.task_id is null then
      return jsonb_build_object('claimed',false,'reason','no_due_authorized_task_with_healthy_provider');
    end if;

    select jsonb_build_object(
      'assignment_id',a.assignment_id,
      'provider_account_id',pa.provider_account_id,
      'provider_name',pa.provider_name,
      'provider_identifier',pa.provider_identifier,
      'model_id',m.model_id,
      'model_name',m.model_name,
      'model_identifier',m.model_identifier,
      'model_capabilities',m.model_capabilities,
      'assigned_capabilities',a.assigned_capabilities,
      'fallback_model',case when fm.model_id is null then null else jsonb_build_object(
        'provider_name',fm.provider_name,'model_identifier',fm.model_identifier,'model_id',fm.model_id
      ) end
    ) into v_route
    from ai_network.ai_provider_assignments a
    join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
    join ai_network.ai_provider_models m on m.model_id=a.model_id
    left join ai_network.ai_provider_models fm on fm.model_id=a.fallback_model_id and fm.is_active=true
    where a.identity_id=v_row.identity_id and a.assignment_status='active'
      and a.provider_health_status='healthy'
      and pa.owner_user_id=p_owner_user_id and pa.status='configured'
      and pa.health_status='healthy' and pa.last_checked_at>now()-interval '15 minutes'
      and lower(replace(pa.provider_name,' api',''))='openai'
      and lower(replace(m.provider_name,' api',''))='openai'
      and m.is_active=true and m.text_capability=true
      and a.assigned_capabilities && array['text','text_generation','reasoning']::text[]
      and m.model_capabilities && array['text','text_generation','reasoning']::text[]
    order by a.routing_priority asc,a.assigned_at desc
    limit 1;

    if v_route is null then
      return jsonb_build_object('claimed',false,'reason','provider_route_unavailable');
    end if;

    select c.lease_seconds into v_lease_seconds
    from ai_network.ai_task_runtime_controls c where c.control_key='primary';

    update ai_network.ai_task_queue q
    set status='running',worker_id=p_worker_id,lease_token=gen_random_uuid(),
        lease_expires_at=now()+make_interval(secs=>v_lease_seconds),
        attempt_count=q.attempt_count+1,
        started_at=coalesce(q.started_at,now()),updated_at=now()
    where q.task_id=v_row.task_id and q.owner_user_id=p_owner_user_id
    returning q.* into v_row;

    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata
    ) values (
      p_owner_user_id,v_row.task_id,'worker',p_worker_id,'execution_route_selected','queued','running',
      'Authorized worker acquired a leased task and resolved a healthy OpenAI text route.',
      jsonb_build_object('route',v_route,'attempt_count',v_row.attempt_count)
    );

    return jsonb_build_object(
      'claimed',true,
      'task',jsonb_build_object(
        'task_id',v_row.task_id,'owner_user_id',v_row.owner_user_id,
        'identity_id',v_row.identity_id,'task_type',v_row.task_type,
        'task_title',v_row.task_title,'action_class',v_row.action_class,
        'task_payload',v_row.task_payload,'token_budget',v_row.token_budget,
        'cost_limit_usd',v_row.cost_limit_usd,'attempt_count',v_row.attempt_count,
        'max_attempts',v_row.max_attempts,'worker_id',v_row.worker_id,
        'lease_token',v_row.lease_token,'lease_expires_at',v_row.lease_expires_at,
        'delegation_grant_id',v_row.delegation_grant_id,
        'delegated_from_identity_id',v_row.delegated_from_identity_id
      ),
      'route',v_route,
      'identity',(select jsonb_build_object(
        'display_name',n.display_name,'purpose',i.purpose,'personality',p.personality,
        'bio',p.bio,'introduction',p.introduction,'skills',p.skills
      )
      from ai_network.ai_identities i
      left join ai_network.ai_names n on n.identity_id=i.identity_id
      left join ai_network.ai_profiles p on p.identity_id=i.identity_id
      where i.identity_id=v_row.identity_id and i.owner_user_id=p_owner_user_id)
    );
  end if;

  if v_action='heartbeat_task' then
    update ai_network.ai_task_queue q
    set lease_expires_at=now()+make_interval(secs=>(select c.lease_seconds from ai_network.ai_task_runtime_controls c where c.control_key='primary')),
        updated_at=now()
    where q.task_id=(v_payload->>'task_id')::uuid
      and q.owner_user_id=p_owner_user_id and q.worker_id=p_worker_id
      and q.lease_token=(v_payload->>'lease_token')::uuid
      and q.status='running' and q.lease_expires_at>now()
      and exists (
        select 1 from ai_network.ai_task_runtime_controls c
        where c.control_key='primary' and c.execution_enabled=true and c.global_paused=false
      );
    return jsonb_build_object('renewed',found);
  end if;

  if v_action='reserve_provider_capacity' then
    v_estimated_tokens:=coalesce((v_payload->>'estimated_tokens')::integer,0);
    v_max_requests:=coalesce((v_payload->>'max_requests_per_minute')::integer,30);
    v_max_tokens:=coalesce((v_payload->>'max_tokens_per_minute')::integer,30000);
    if v_estimated_tokens<1 or v_estimated_tokens>1000000
       or v_max_requests<1 or v_max_requests>600
       or v_max_tokens<128 or v_max_tokens>1000000 then
      raise exception using errcode='22023',message='Provider rate-limit reservation is outside the supported range.';
    end if;
    if lower(coalesce(v_payload->>'provider_name',''))<>'openai'
       or length(coalesce(v_payload->>'model_identifier','')) not between 1 and 180 then
      raise exception using errcode='22023',message='A supported provider and model are required for rate-limit reservation.';
    end if;
    v_window:=date_trunc('minute',now());
    insert into ai_network.ai_execution_rate_buckets(
      provider_name,model_identifier,window_start,requests_used,tokens_reserved
    ) values (
      'openai',v_payload->>'model_identifier',v_window,1,v_estimated_tokens
    )
    on conflict (provider_name,model_identifier,window_start) do update
    set requests_used=ai_network.ai_execution_rate_buckets.requests_used+1,
        tokens_reserved=ai_network.ai_execution_rate_buckets.tokens_reserved+v_estimated_tokens,
        updated_at=now()
    where ai_network.ai_execution_rate_buckets.requests_used<v_max_requests
      and ai_network.ai_execution_rate_buckets.tokens_reserved+v_estimated_tokens<=v_max_tokens
    returning requests_used,tokens_reserved into v_bucket;
    if not found then
      return jsonb_build_object(
        'reserved',false,
        'retry_after_seconds',greatest(1,60-extract(second from now())::integer)
      );
    end if;
    return jsonb_build_object(
      'reserved',true,'window_start',v_window,
      'requests_used',v_bucket.requests_used,'tokens_reserved',v_bucket.tokens_reserved
    );
  end if;

  if v_action='complete_task' then
    if jsonb_typeof(v_payload->'task_result')<>'object'
       or length(trim(coalesce(v_payload->'task_result'->>'output','')))=0
       or octet_length((v_payload->'task_result')::text)>65536
       or coalesce(v_payload->'task_result'->>'succeeded','false')<>'true'
       or not (v_payload->'task_result' ? 'route')
       or v_payload->'task_result'->'route'->>'provider' is null
       or v_payload->'task_result'->'route'->>'model' is null then
      raise exception using errcode='22023',message='A successful completion requires non-empty output and identifiable provider/model routing metadata.';
    end if;
    if (v_payload->'task_result')::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential|private[_-]?key)"[[:space:]]*:' then
      raise exception using errcode='22023',message='Task results cannot contain credentials or secrets.';
    end if;
    update ai_network.ai_task_queue q
    set status='succeeded',task_result=v_payload->'task_result',failure_reason='',
        worker_id=null,lease_token=null,lease_expires_at=null,finished_at=now(),updated_at=now()
    where q.task_id=(v_payload->>'task_id')::uuid
      and q.owner_user_id=p_owner_user_id and q.worker_id=p_worker_id
      and q.lease_token=(v_payload->>'lease_token')::uuid
      and q.status='running' and q.lease_expires_at>now();
    if not found then
      return jsonb_build_object('completed',false,'reason','lease_invalid_or_task_cancelled');
    end if;
    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata
    ) values (
      p_owner_user_id,(v_payload->>'task_id')::uuid,'worker',p_worker_id,'task_execution_succeeded','running','succeeded',
      'Provider returned a non-empty moderated result and the active task lease was valid.',
      jsonb_build_object('route',v_payload->'task_result'->'route','usage',v_payload->'task_result'->'usage',
        'duration_ms',v_payload->'task_result'->'duration_ms')
    );
    insert into ai_network.ai_delegation_events(
      owner_user_id,delegation_grant_id,actor_user_id,actor_identity_id,event_type,reason,task_id,metadata
    )
    select q.owner_user_id,q.delegation_grant_id,q.owner_user_id,q.identity_id,
      'delegated_task_completed','Authorized delegated AI task completed with a moderated provider result.',
      q.task_id,jsonb_build_object('route',v_payload->'task_result'->'route')
    from ai_network.ai_task_queue q
    where q.task_id=(v_payload->>'task_id')::uuid and q.owner_user_id=p_owner_user_id
      and q.delegation_grant_id is not null;
    return jsonb_build_object('completed',true,'status','succeeded');
  end if;

  if v_action='fail_task' then
    v_failure_code:=left(coalesce(v_payload->>'failure_code','execution_failed'),80);
    v_reason:=left(trim(coalesce(v_payload->>'failure_reason','Task execution failed.')),1000);
    v_retryable:=coalesce((v_payload->>'retryable')::boolean,false);
    v_retry_seconds:=greatest(5,least(3600,coalesce((v_payload->>'retry_after_seconds')::integer,30)));
    select q.status,q.attempt_count into v_previous_status,v_attempt_count
    from ai_network.ai_task_queue q
    where q.task_id=(v_payload->>'task_id')::uuid
      and q.owner_user_id=p_owner_user_id and q.worker_id=p_worker_id
      and q.lease_token=(v_payload->>'lease_token')::uuid
      and q.status='running' and q.lease_expires_at>now()
    for update;
    if not found then
      return jsonb_build_object('recorded',false,'reason','lease_invalid_or_task_cancelled');
    end if;
    select q.max_attempts into v_row.max_attempts
    from ai_network.ai_task_queue q where q.task_id=(v_payload->>'task_id')::uuid and q.owner_user_id=p_owner_user_id;
    v_next_status:=case when v_retryable and v_attempt_count<v_row.max_attempts then 'queued' else 'failed' end;
    update ai_network.ai_task_queue q
    set status=v_next_status,failure_reason=v_reason,task_result=case
          when jsonb_typeof(v_payload->'failure_result')='object' then v_payload->'failure_result'
          else null end,
        scheduled_for=case when v_next_status='queued' then now()+make_interval(secs=>v_retry_seconds) else q.scheduled_for end,
        worker_id=null,lease_token=null,lease_expires_at=null,
        finished_at=case when v_next_status='failed' then now() else null end,updated_at=now()
    where q.task_id=(v_payload->>'task_id')::uuid and q.owner_user_id=p_owner_user_id;
    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata
    ) values (
      p_owner_user_id,(v_payload->>'task_id')::uuid,'worker',p_worker_id,
      case when v_next_status='queued' then 'task_retry_scheduled' else 'task_execution_failed' end,
      'running',v_next_status,v_reason,
      jsonb_build_object('failure_code',v_failure_code,'retryable',v_retryable,
        'retry_after_seconds',case when v_next_status='queued' then v_retry_seconds else null end,
        'failure_metadata',coalesce(v_payload->'failure_metadata','{}'::jsonb))
    );
    insert into ai_network.ai_delegation_events(
      owner_user_id,delegation_grant_id,actor_user_id,actor_identity_id,event_type,reason,task_id,metadata
    )
    select q.owner_user_id,q.delegation_grant_id,q.owner_user_id,q.identity_id,
      'delegated_task_execution_failed','Delegated AI task failed or was rescheduled for retry.',
      q.task_id,jsonb_build_object('failure_code',v_failure_code,'status',v_next_status)
    from ai_network.ai_task_queue q
    where q.task_id=(v_payload->>'task_id')::uuid and q.owner_user_id=p_owner_user_id
      and q.delegation_grant_id is not null;
    return jsonb_build_object('recorded',true,'status',v_next_status,'retry_after_seconds',
      case when v_next_status='queued' then v_retry_seconds else null end);
  end if;

  raise exception using errcode='22023',message='Unsupported Minglora AI worker command.';
end;
$function$; then
      raise exception using errcode='22023',message='A valid provider account and assignment are required for health recording.';
    end if;
    if coalesce(v_payload->>'health_status','') not in ('healthy','degraded','unavailable','unknown') then
      raise exception using errcode='22023',message='Choose a supported provider health status.';
    end if;
    update ai_network.ai_provider_accounts pa
    set status=case when v_payload->>'health_status'='healthy' then 'configured' else pa.status end,
        health_status=v_payload->>'health_status',
        last_checked_at=now(),updated_at=now()
    where pa.provider_account_id=(v_payload->>'provider_account_id')::uuid
      and pa.owner_user_id=p_owner_user_id
      and lower(replace(pa.provider_name,' api',''))='openai'
      and pa.status not in ('revoked','disabled');
    if not found then
      raise exception using errcode='P0002',message='The OpenAI provider account was not found for this worker owner.';
    end if;
    update ai_network.ai_provider_assignments a
    set provider_health_status=v_payload->>'health_status',
        last_checked_at=now(),updated_at=now()
    from ai_network.ai_identities i, ai_network.ai_provider_models m
    where a.assignment_id=(v_payload->>'assignment_id')::uuid
      and a.provider_account_id=(v_payload->>'provider_account_id')::uuid
      and a.identity_id=i.identity_id and i.owner_user_id=p_owner_user_id
      and a.model_id=m.model_id
      and m.model_identifier=v_payload->>'model_identifier'
      and lower(replace(m.provider_name,' api',''))='openai';
    if not found then
      raise exception using errcode='P0002',message='The provider assignment or model does not match the health probe target.';
    end if;
    return jsonb_build_object(
      'recorded',true,'health_status',v_payload->>'health_status',
      'provider_account_id',v_payload->>'provider_account_id',
      'assignment_id',v_payload->>'assignment_id'
    );
  end if;

    -- Recover expired leases before selecting new work. Exhausted tasks become failed.
    with expired as (
      update ai_network.ai_task_queue q
      set status=case when q.attempt_count>=q.max_attempts then 'failed' else 'queued' end,
          worker_id=null,lease_token=null,lease_expires_at=null,
          finished_at=case when q.attempt_count>=q.max_attempts then now() else null end,
          failure_reason=case when q.attempt_count>=q.max_attempts then 'Worker lease expired after the final permitted attempt.' else q.failure_reason end,
          updated_at=now()
      where q.owner_user_id=p_owner_user_id and q.status='running' and q.lease_expires_at<=now()
      returning q.task_id,q.status,q.attempt_count
    )
    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata
    )
    select p_owner_user_id,e.task_id,'system',p_worker_id,'worker_lease_expired','running',e.status,
      'Expired worker lease was recovered by the orchestration engine.',
      jsonb_build_object('attempt_count',e.attempt_count)
    from expired e;

    if exists (
      select 1 from ai_network.ai_task_runtime_controls c
      where c.control_key='primary'
        and (c.global_paused or not c.execution_enabled or c.max_concurrent_workers<1)
    ) or not exists(select 1 from ai_network.ai_task_runtime_controls where control_key='primary') then
      return jsonb_build_object('claimed',false,'reason','runtime_paused_or_disabled');
    end if;

    if (
      select count(*) from ai_network.ai_task_queue q
      where q.owner_user_id=p_owner_user_id and q.status='running'
        and q.lease_expires_at>now()
    ) >= (
      select c.max_concurrent_workers from ai_network.ai_task_runtime_controls c where c.control_key='primary'
    ) then
      return jsonb_build_object('claimed',false,'reason','worker_limit_reached');
    end if;

    select q.* into v_row
    from ai_network.ai_task_queue q
    where q.owner_user_id=p_owner_user_id
      and q.status='queued' and q.scheduled_for<=now()
      and q.attempt_count<q.max_attempts
      and q.action_class in ('read_only','content')
      and q.task_type in (
        'content_outline','caption_draft','title_ideas','translation_draft',
        'content_draft','creator_calendar','public_event_support','ai_to_ai_message'
      )
      and q.token_budget between 192 and 1000000
      and q.cost_limit_usd=0
      and exists (
        select 1 from ai_network.ai_identities i
        where i.identity_id=q.identity_id and i.owner_user_id=q.owner_user_id
          and i.status='active' and i.enabled=true
          and i.supervision_level<>'restricted_observation'
      )
      and exists (
        select 1 from ai_network.ai_identity_capabilities cap
        where cap.identity_id=q.identity_id and cap.is_enabled=true
          and cap.capability_key='task_execution'
      )
      and exists (
        select 1 from ai_network.ai_identity_permissions perm
        where perm.identity_id=q.identity_id and perm.effect='allow'
          and perm.permission_key in ('execute_task','task.execute','task:'||q.task_type)
          and perm.resource_scope in ('*',q.task_type,'task:'||q.task_type)
          and (perm.expires_at is null or perm.expires_at>now())
      )
      and not exists (
        select 1 from ai_network.ai_identity_permissions deny
        where deny.identity_id=q.identity_id and deny.effect='deny'
          and deny.permission_key in ('execute_task','task.execute','task:'||q.task_type)
          and deny.resource_scope in ('*',q.task_type,'task:'||q.task_type)
          and (deny.expires_at is null or deny.expires_at>now())
      )
      and (not q.requires_approval or exists (
        select 1 from ai_network.ai_task_approvals ap
        where ap.task_id=q.task_id and ap.owner_user_id=q.owner_user_id
          and ap.approval_status='approved'
      ))
      and (q.delegation_grant_id is null or exists (
        select 1 from ai_network.ai_delegation_grants dg
        where dg.delegation_grant_id=q.delegation_grant_id
          and dg.owner_user_id=q.owner_user_id
          and dg.grantee_identity_id=q.identity_id
          and dg.grantor_identity_id=q.delegated_from_identity_id
          and dg.grant_status='active' and dg.expires_at>now()
          and q.task_type=any(dg.allowed_task_types)
          and q.action_class=any(dg.allowed_action_classes)
          and (dg.max_token_budget=0 or q.token_budget<=dg.max_token_budget)
          and (dg.max_cost_limit_usd=0 or q.cost_limit_usd<=dg.max_cost_limit_usd)
      ))
      and exists (
        select 1
        from ai_network.ai_provider_assignments a
        join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
        join ai_network.ai_provider_models m on m.model_id=a.model_id
        where a.identity_id=q.identity_id and a.assignment_status='active'
          and a.provider_health_status='healthy'
          and pa.owner_user_id=q.owner_user_id
          and pa.status='configured' and pa.health_status='healthy'
          and pa.last_checked_at>now()-interval '15 minutes'
          and lower(replace(pa.provider_name,' api',''))='openai'
          and lower(replace(m.provider_name,' api',''))='openai'
          and m.is_active=true and m.text_capability=true
          and a.assigned_capabilities && array['text','text_generation','reasoning']::text[]
          and m.model_capabilities && array['text','text_generation','reasoning']::text[]
      )
    order by q.priority asc,q.scheduled_for asc,q.created_at asc
    for update skip locked
    limit 1;

    if v_row.task_id is null then
      return jsonb_build_object('claimed',false,'reason','no_due_authorized_task_with_healthy_provider');
    end if;

    select jsonb_build_object(
      'assignment_id',a.assignment_id,
      'provider_account_id',pa.provider_account_id,
      'provider_name',pa.provider_name,
      'provider_identifier',pa.provider_identifier,
      'model_id',m.model_id,
      'model_name',m.model_name,
      'model_identifier',m.model_identifier,
      'model_capabilities',m.model_capabilities,
      'assigned_capabilities',a.assigned_capabilities,
      'fallback_model',case when fm.model_id is null then null else jsonb_build_object(
        'provider_name',fm.provider_name,'model_identifier',fm.model_identifier,'model_id',fm.model_id
      ) end
    ) into v_route
    from ai_network.ai_provider_assignments a
    join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
    join ai_network.ai_provider_models m on m.model_id=a.model_id
    left join ai_network.ai_provider_models fm on fm.model_id=a.fallback_model_id and fm.is_active=true
    where a.identity_id=v_row.identity_id and a.assignment_status='active'
      and a.provider_health_status='healthy'
      and pa.owner_user_id=p_owner_user_id and pa.status='configured'
      and pa.health_status='healthy' and pa.last_checked_at>now()-interval '15 minutes'
      and lower(replace(pa.provider_name,' api',''))='openai'
      and lower(replace(m.provider_name,' api',''))='openai'
      and m.is_active=true and m.text_capability=true
      and a.assigned_capabilities && array['text','text_generation','reasoning']::text[]
      and m.model_capabilities && array['text','text_generation','reasoning']::text[]
    order by a.routing_priority asc,a.assigned_at desc
    limit 1;

    if v_route is null then
      return jsonb_build_object('claimed',false,'reason','provider_route_unavailable');
    end if;

    select c.lease_seconds into v_lease_seconds
    from ai_network.ai_task_runtime_controls c where c.control_key='primary';

    update ai_network.ai_task_queue q
    set status='running',worker_id=p_worker_id,lease_token=gen_random_uuid(),
        lease_expires_at=now()+make_interval(secs=>v_lease_seconds),
        attempt_count=q.attempt_count+1,
        started_at=coalesce(q.started_at,now()),updated_at=now()
    where q.task_id=v_row.task_id and q.owner_user_id=p_owner_user_id
    returning q.* into v_row;

    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata
    ) values (
      p_owner_user_id,v_row.task_id,'worker',p_worker_id,'execution_route_selected','queued','running',
      'Authorized worker acquired a leased task and resolved a healthy OpenAI text route.',
      jsonb_build_object('route',v_route,'attempt_count',v_row.attempt_count)
    );

    return jsonb_build_object(
      'claimed',true,
      'task',jsonb_build_object(
        'task_id',v_row.task_id,'owner_user_id',v_row.owner_user_id,
        'identity_id',v_row.identity_id,'task_type',v_row.task_type,
        'task_title',v_row.task_title,'action_class',v_row.action_class,
        'task_payload',v_row.task_payload,'token_budget',v_row.token_budget,
        'cost_limit_usd',v_row.cost_limit_usd,'attempt_count',v_row.attempt_count,
        'max_attempts',v_row.max_attempts,'worker_id',v_row.worker_id,
        'lease_token',v_row.lease_token,'lease_expires_at',v_row.lease_expires_at,
        'delegation_grant_id',v_row.delegation_grant_id,
        'delegated_from_identity_id',v_row.delegated_from_identity_id
      ),
      'route',v_route,
      'identity',(select jsonb_build_object(
        'display_name',n.display_name,'purpose',i.purpose,'personality',p.personality,
        'bio',p.bio,'introduction',p.introduction,'skills',p.skills
      )
      from ai_network.ai_identities i
      left join ai_network.ai_names n on n.identity_id=i.identity_id
      left join ai_network.ai_profiles p on p.identity_id=i.identity_id
      where i.identity_id=v_row.identity_id and i.owner_user_id=p_owner_user_id)
    );
  end if;

  if v_action='heartbeat_task' then
    update ai_network.ai_task_queue q
    set lease_expires_at=now()+make_interval(secs=>(select c.lease_seconds from ai_network.ai_task_runtime_controls c where c.control_key='primary')),
        updated_at=now()
    where q.task_id=(v_payload->>'task_id')::uuid
      and q.owner_user_id=p_owner_user_id and q.worker_id=p_worker_id
      and q.lease_token=(v_payload->>'lease_token')::uuid
      and q.status='running' and q.lease_expires_at>now()
      and exists (
        select 1 from ai_network.ai_task_runtime_controls c
        where c.control_key='primary' and c.execution_enabled=true and c.global_paused=false
      );
    return jsonb_build_object('renewed',found);
  end if;

  if v_action='reserve_provider_capacity' then
    v_estimated_tokens:=coalesce((v_payload->>'estimated_tokens')::integer,0);
    v_max_requests:=coalesce((v_payload->>'max_requests_per_minute')::integer,30);
    v_max_tokens:=coalesce((v_payload->>'max_tokens_per_minute')::integer,30000);
    if v_estimated_tokens<1 or v_estimated_tokens>1000000
       or v_max_requests<1 or v_max_requests>600
       or v_max_tokens<128 or v_max_tokens>1000000 then
      raise exception using errcode='22023',message='Provider rate-limit reservation is outside the supported range.';
    end if;
    if lower(coalesce(v_payload->>'provider_name',''))<>'openai'
       or length(coalesce(v_payload->>'model_identifier','')) not between 1 and 180 then
      raise exception using errcode='22023',message='A supported provider and model are required for rate-limit reservation.';
    end if;
    v_window:=date_trunc('minute',now());
    insert into ai_network.ai_execution_rate_buckets(
      provider_name,model_identifier,window_start,requests_used,tokens_reserved
    ) values (
      'openai',v_payload->>'model_identifier',v_window,1,v_estimated_tokens
    )
    on conflict (provider_name,model_identifier,window_start) do update
    set requests_used=ai_network.ai_execution_rate_buckets.requests_used+1,
        tokens_reserved=ai_network.ai_execution_rate_buckets.tokens_reserved+v_estimated_tokens,
        updated_at=now()
    where ai_network.ai_execution_rate_buckets.requests_used<v_max_requests
      and ai_network.ai_execution_rate_buckets.tokens_reserved+v_estimated_tokens<=v_max_tokens
    returning requests_used,tokens_reserved into v_bucket;
    if not found then
      return jsonb_build_object(
        'reserved',false,
        'retry_after_seconds',greatest(1,60-extract(second from now())::integer)
      );
    end if;
    return jsonb_build_object(
      'reserved',true,'window_start',v_window,
      'requests_used',v_bucket.requests_used,'tokens_reserved',v_bucket.tokens_reserved
    );
  end if;

  if v_action='complete_task' then
    if jsonb_typeof(v_payload->'task_result')<>'object'
       or length(trim(coalesce(v_payload->'task_result'->>'output','')))=0
       or octet_length((v_payload->'task_result')::text)>65536
       or coalesce(v_payload->'task_result'->>'succeeded','false')<>'true'
       or not (v_payload->'task_result' ? 'route')
       or v_payload->'task_result'->'route'->>'provider' is null
       or v_payload->'task_result'->'route'->>'model' is null then
      raise exception using errcode='22023',message='A successful completion requires non-empty output and identifiable provider/model routing metadata.';
    end if;
    if (v_payload->'task_result')::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential|private[_-]?key)"[[:space:]]*:' then
      raise exception using errcode='22023',message='Task results cannot contain credentials or secrets.';
    end if;
    update ai_network.ai_task_queue q
    set status='succeeded',task_result=v_payload->'task_result',failure_reason='',
        worker_id=null,lease_token=null,lease_expires_at=null,finished_at=now(),updated_at=now()
    where q.task_id=(v_payload->>'task_id')::uuid
      and q.owner_user_id=p_owner_user_id and q.worker_id=p_worker_id
      and q.lease_token=(v_payload->>'lease_token')::uuid
      and q.status='running' and q.lease_expires_at>now();
    if not found then
      return jsonb_build_object('completed',false,'reason','lease_invalid_or_task_cancelled');
    end if;
    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata
    ) values (
      p_owner_user_id,(v_payload->>'task_id')::uuid,'worker',p_worker_id,'task_execution_succeeded','running','succeeded',
      'Provider returned a non-empty moderated result and the active task lease was valid.',
      jsonb_build_object('route',v_payload->'task_result'->'route','usage',v_payload->'task_result'->'usage',
        'duration_ms',v_payload->'task_result'->'duration_ms')
    );
    insert into ai_network.ai_delegation_events(
      owner_user_id,delegation_grant_id,actor_user_id,actor_identity_id,event_type,reason,task_id,metadata
    )
    select q.owner_user_id,q.delegation_grant_id,q.owner_user_id,q.identity_id,
      'delegated_task_completed','Authorized delegated AI task completed with a moderated provider result.',
      q.task_id,jsonb_build_object('route',v_payload->'task_result'->'route')
    from ai_network.ai_task_queue q
    where q.task_id=(v_payload->>'task_id')::uuid and q.owner_user_id=p_owner_user_id
      and q.delegation_grant_id is not null;
    return jsonb_build_object('completed',true,'status','succeeded');
  end if;

  if v_action='fail_task' then
    v_failure_code:=left(coalesce(v_payload->>'failure_code','execution_failed'),80);
    v_reason:=left(trim(coalesce(v_payload->>'failure_reason','Task execution failed.')),1000);
    v_retryable:=coalesce((v_payload->>'retryable')::boolean,false);
    v_retry_seconds:=greatest(5,least(3600,coalesce((v_payload->>'retry_after_seconds')::integer,30)));
    select q.status,q.attempt_count into v_previous_status,v_attempt_count
    from ai_network.ai_task_queue q
    where q.task_id=(v_payload->>'task_id')::uuid
      and q.owner_user_id=p_owner_user_id and q.worker_id=p_worker_id
      and q.lease_token=(v_payload->>'lease_token')::uuid
      and q.status='running' and q.lease_expires_at>now()
    for update;
    if not found then
      return jsonb_build_object('recorded',false,'reason','lease_invalid_or_task_cancelled');
    end if;
    select q.max_attempts into v_row.max_attempts
    from ai_network.ai_task_queue q where q.task_id=(v_payload->>'task_id')::uuid and q.owner_user_id=p_owner_user_id;
    v_next_status:=case when v_retryable and v_attempt_count<v_row.max_attempts then 'queued' else 'failed' end;
    update ai_network.ai_task_queue q
    set status=v_next_status,failure_reason=v_reason,task_result=case
          when jsonb_typeof(v_payload->'failure_result')='object' then v_payload->'failure_result'
          else null end,
        scheduled_for=case when v_next_status='queued' then now()+make_interval(secs=>v_retry_seconds) else q.scheduled_for end,
        worker_id=null,lease_token=null,lease_expires_at=null,
        finished_at=case when v_next_status='failed' then now() else null end,updated_at=now()
    where q.task_id=(v_payload->>'task_id')::uuid and q.owner_user_id=p_owner_user_id;
    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,worker_id,event_type,previous_status,new_status,reason,metadata
    ) values (
      p_owner_user_id,(v_payload->>'task_id')::uuid,'worker',p_worker_id,
      case when v_next_status='queued' then 'task_retry_scheduled' else 'task_execution_failed' end,
      'running',v_next_status,v_reason,
      jsonb_build_object('failure_code',v_failure_code,'retryable',v_retryable,
        'retry_after_seconds',case when v_next_status='queued' then v_retry_seconds else null end,
        'failure_metadata',coalesce(v_payload->'failure_metadata','{}'::jsonb))
    );
    insert into ai_network.ai_delegation_events(
      owner_user_id,delegation_grant_id,actor_user_id,actor_identity_id,event_type,reason,task_id,metadata
    )
    select q.owner_user_id,q.delegation_grant_id,q.owner_user_id,q.identity_id,
      'delegated_task_execution_failed','Delegated AI task failed or was rescheduled for retry.',
      q.task_id,jsonb_build_object('failure_code',v_failure_code,'status',v_next_status)
    from ai_network.ai_task_queue q
    where q.task_id=(v_payload->>'task_id')::uuid and q.owner_user_id=p_owner_user_id
      and q.delegation_grant_id is not null;
    return jsonb_build_object('recorded',true,'status',v_next_status,'retry_after_seconds',
      case when v_next_status='queued' then v_retry_seconds else null end);
  end if;

  raise exception using errcode='22023',message='Unsupported Minglora AI worker command.';
end;
$function$;

create or replace function public.minglora_ai_activate_provider_assignment(
  p_actor_user_id uuid,
  p_assignment_id uuid,
  p_reason text default 'Provider access was verified by a successful model-access probe.'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_assignment ai_network.ai_provider_assignments%rowtype;
  v_identity ai_network.ai_identities%rowtype;
  v_provider ai_network.ai_provider_accounts%rowtype;
  v_model ai_network.ai_provider_models%rowtype;
  v_old_status text;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='Provider assignment activation is restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode='42501',message='A valid signed-in Minglora administrator is required.';
  end if;
  if p_assignment_id is null or length(trim(coalesce(p_reason,'')))<3 then
    raise exception using errcode='22023',message='A provider assignment and activation reason are required.';
  end if;
  select a.* into v_assignment
  from ai_network.ai_provider_assignments a
  join ai_network.ai_identities i on i.identity_id=a.identity_id
  where a.assignment_id=p_assignment_id and i.owner_user_id=p_actor_user_id
  for update of a;
  if not found then
    raise exception using errcode='P0002',message='Provider assignment not found for this owner.';
  end if;
  if v_assignment.assignment_status in ('revoked','disabled','restricted') then
    raise exception using errcode='55000',message='A restricted, disabled or revoked provider assignment cannot be activated.';
  end if;
  select i.* into v_identity from ai_network.ai_identities i
  where i.identity_id=v_assignment.identity_id and i.owner_user_id=p_actor_user_id;
  if v_identity.status<>'active' or v_identity.enabled is not true
     or v_identity.supervision_level='restricted_observation' then
    raise exception using errcode='42501',message='Activate and enable the AI identity before activating its provider assignment.';
  end if;
  select pa.* into v_provider from ai_network.ai_provider_accounts pa
  where pa.provider_account_id=v_assignment.provider_account_id
    and pa.owner_user_id=p_actor_user_id;
  if not found or v_provider.status<>'configured' or v_provider.health_status<>'healthy'
     or v_provider.last_checked_at is null or v_provider.last_checked_at<now()-interval '15 minutes'
     or lower(replace(v_provider.provider_name,' api',''))<>'openai' then
    raise exception using errcode='42501',message='A recently verified healthy OpenAI provider account is required before assignment activation.';
  end if;
  select m.* into v_model from ai_network.ai_provider_models m
  where m.model_id=v_assignment.model_id and m.is_active=true;
  if not found or v_model.text_capability is not true
     or lower(replace(v_model.provider_name,' api',''))<>'openai' then
    raise exception using errcode='42501',message='The selected model is not an active supported OpenAI text model.';
  end if;
  v_old_status:=v_assignment.assignment_status;
  update ai_network.ai_provider_assignments a
  set assignment_status='active',provider_health_status='healthy',
      last_checked_at=now(),updated_at=now()
  where a.assignment_id=p_assignment_id;
  insert into ai_network.ai_provider_assignment_history(
    assignment_id,identity_id,actor_user_id,action,previous_status,new_status,reason,metadata
  ) values (
    p_assignment_id,v_assignment.identity_id,p_actor_user_id,'activated',v_old_status,'active',
    left(trim(p_reason),1000),
    jsonb_build_object('provider_account_id',v_provider.provider_account_id,
      'model_id',v_model.model_id,'health_checked_at',v_provider.last_checked_at)
  );
  select * into v_assignment from ai_network.ai_provider_assignments a
  where a.assignment_id=p_assignment_id;
  return jsonb_build_object(
    'assignment_id',v_assignment.assignment_id,'identity_id',v_assignment.identity_id,
    'provider_account_id',v_assignment.provider_account_id,'model_id',v_assignment.model_id,
    'assignment_status',v_assignment.assignment_status,
    'provider_health_status',v_assignment.provider_health_status,
    'last_checked_at',v_assignment.last_checked_at
  );
end;
$function$;


create or replace function public.minglora_ai_cancel_task(
  p_actor_user_id uuid,
  p_task_id uuid,
  p_reason text default 'Cancelled by the task owner.'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_previous_status text;
  v_result jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='AI task cancellation is restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode='42501',message='A valid signed-in Minglora account is required.';
  end if;
  if p_task_id is null or length(trim(coalesce(p_reason,'')))<3 then
    raise exception using errcode='22023',message='A task ID and cancellation reason are required.';
  end if;
  select q.status into v_previous_status
  from ai_network.ai_task_queue q
  where q.task_id=p_task_id and q.owner_user_id=p_actor_user_id
  for update;
  if v_previous_status is null then
    raise exception using errcode='P0002',message='AI task not found.';
  end if;
  if v_previous_status in ('succeeded','failed','cancelled','rejected') then
    raise exception using errcode='55000',message='A terminal AI task cannot be cancelled.';
  end if;
  update ai_network.ai_task_queue q
  set status='cancelled',worker_id=null,lease_token=null,lease_expires_at=null,
      finished_at=now(),updated_at=now(),failure_reason=left(trim(p_reason),1000)
  where q.task_id=p_task_id and q.owner_user_id=p_actor_user_id;
  update ai_network.ai_task_approvals a set approval_status='cancelled'
  where a.task_id=p_task_id and a.owner_user_id=p_actor_user_id and a.approval_status='requested';
  insert into ai_network.ai_task_events(
    owner_user_id,task_id,actor_type,actor_user_id,event_type,previous_status,new_status,reason
  ) values (
    p_actor_user_id,p_task_id,'human_user',p_actor_user_id,'task_cancelled',v_previous_status,'cancelled',left(trim(p_reason),1000)
  );
  select to_jsonb(q) into v_result from ai_network.ai_task_queue q
  where q.task_id=p_task_id and q.owner_user_id=p_actor_user_id;
  return jsonb_build_object('task',v_result);
end;
$function$;

create or replace function public.minglora_ai_task_history_command(
  p_actor_user_id uuid,
  p_task_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='AI task history is restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode='42501',message='A valid signed-in Minglora account is required.';
  end if;
  if not exists(select 1 from ai_network.ai_task_queue q
    where q.task_id=p_task_id and q.owner_user_id=p_actor_user_id) then
    raise exception using errcode='P0002',message='AI task not found.';
  end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at asc),'[]'::jsonb)
  into v_result
  from ai_network.ai_task_events e
  where e.task_id=p_task_id and e.owner_user_id=p_actor_user_id;
  return jsonb_build_object('task_id',p_task_id,'events',v_result);
end;
$function$;

revoke all on function public.minglora_ai_worker_authenticate(text) from public,anon,authenticated;
grant execute on function public.minglora_ai_worker_authenticate(text) to service_role;
revoke all on function public.minglora_ai_worker_command(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_worker_command(text,text,uuid,jsonb) to service_role;
revoke all on function public.minglora_ai_activate_provider_assignment(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.minglora_ai_activate_provider_assignment(uuid,uuid,text) to service_role;
revoke all on function public.minglora_ai_cancel_task(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.minglora_ai_cancel_task(uuid,uuid,text) to service_role;
revoke all on function public.minglora_ai_task_history_command(uuid,uuid) from public,anon,authenticated;
grant execute on function public.minglora_ai_task_history_command(uuid,uuid) to service_role;

comment on function public.minglora_ai_worker_command(text,text,uuid,jsonb) is
  'Private Phase 6 AI worker gateway. Worker credentials, owner-scoped claims, active identity permissions, explicit capabilities, approved tasks, healthy text route, durable rate buckets, leases and audited outcomes are mandatory.';
