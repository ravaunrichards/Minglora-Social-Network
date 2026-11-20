-- Allow an authorized owner to cancel an in-flight AI task.
-- The row lock and lease revocation ensure a late provider response cannot be marked succeeded.
CREATE OR REPLACE FUNCTION public.minglora_ai_task_command(p_action text, p_actor_user_id uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
      raise exception using errcode = '22023', message = 'A safe JSON object no larger than 64 KB.';
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
    -- Lock and capture the previous state so queued and running tasks are cancelled atomically.
    select q.status into v_previous_status
    from ai_network.ai_task_queue q
    where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id
      and q.status in ('pending_approval','queued','observation_only','running')
    for update;
    if v_previous_status is null then
      raise exception using errcode = 'P0002', message = 'Only a waiting, observation-only or running task can be cancelled.';
    end if;
    -- Revoking the lease makes every later heartbeat/completion from the worker fail closed.
    update ai_network.ai_task_queue q
    set status='cancelled',worker_id=null,lease_token=null,lease_expires_at=null,updated_at=now(),finished_at=now()
    where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id and q.status=v_previous_status
    returning q.status into v_status;
    if v_status is null then raise exception using errcode = 'P0002', message = 'The task changed state before it could be cancelled.'; end if;
    update ai_network.ai_task_approvals a set approval_status='cancelled'
    where a.task_id=v_task_id and a.owner_user_id=p_actor_user_id and a.approval_status='requested';
    insert into ai_network.ai_task_events(owner_user_id,task_id,actor_type,actor_user_id,event_type,previous_status,new_status,reason)
    values (p_actor_user_id,v_task_id,'human_user',p_actor_user_id,'task_cancelled',v_previous_status,v_status,v_reason);
    select to_jsonb(q) into v_result from ai_network.ai_task_queue q where q.task_id=v_task_id and q.owner_user_id=p_actor_user_id;
    return jsonb_build_object('task',v_result);
  end if;

  -- Worker claims and lease callbacks stay unavailable until an independent worker identity,
  -- short-lived worker credential and per-worker authorization path are deployed.
  if v_action in ('claim_next_task','heartbeat_task','complete_task','fail_task') then
    raise exception using errcode = '42501', message = 'AI worker authentication is not deployed; task execution is disabled.';
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
