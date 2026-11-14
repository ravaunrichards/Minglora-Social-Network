-- Durable Minglora AI task schedules. Scheduled work is only materialized into the
-- human approval queue; this does not enable provider execution or worker claims.

create table if not exists ai_network.ai_task_schedules (
  schedule_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  bot_id text not null check (length(trim(bot_id)) between 1 and 80),
  task_type text not null check (task_type in (
    'content_outline','caption_draft','title_ideas','translation_draft',
    'creator_calendar','public_event_support'
  )),
  action_class text not null default 'content' check (action_class in ('read_only','content')),
  task_title text not null check (length(trim(task_title)) between 3 and 180),
  task_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(task_payload)='object' and octet_length(task_payload::text)<=65536),
  cadence text not null check (cadence in ('once','daily','weekly')),
  time_zone text not null check (length(time_zone) between 1 and 80),
  weekdays smallint[] not null default '{}'::smallint[]
    check (cardinality(weekdays)<=7 and array_position(weekdays,null) is null
      and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  next_run_at timestamptz,
  schedule_status text not null default 'paused'
    check (schedule_status in ('paused','active','cancelled','completed','error')),
  requires_human_approval boolean not null default true check (requires_human_approval=true),
  ai_disclosure_required boolean not null default true check (ai_disclosure_required=true),
  run_count integer not null default 0 check (run_count between 0 and 1000000),
  max_occurrences integer check (max_occurrences is null or max_occurrences between 1 and 1000000),
  token_budget integer not null default 0 check (token_budget between 0 and 10000000),
  cost_limit_usd numeric(14,6) not null default 0 check (cost_limit_usd between 0 and 1000),
  last_enqueued_task_id uuid references ai_network.ai_task_queue(task_id) on delete restrict,
  last_enqueued_at timestamptz,
  last_error text not null default '' check (length(last_error)<=1000),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id,schedule_id),
  unique (owner_user_id,idempotency_key),
  check (
    (cadence='weekly' and cardinality(weekdays) between 1 and 7)
    or (cadence in ('once','daily') and cardinality(weekdays)=0)
  ),
  check ((schedule_status in ('completed','cancelled') and next_run_at is null)
    or (schedule_status in ('paused','active','error') and next_run_at is not null))
);
create index if not exists ai_task_schedules_owner_status_due_idx
  on ai_network.ai_task_schedules(schedule_status,next_run_at,owner_user_id)
  where schedule_status='active';
create index if not exists ai_task_schedules_identity_recent_idx
  on ai_network.ai_task_schedules(owner_user_id,identity_id,created_at desc);

create table if not exists ai_network.ai_task_schedule_events (
  schedule_event_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  schedule_id uuid not null references ai_network.ai_task_schedules(schedule_id) on delete restrict,
  task_id uuid references ai_network.ai_task_queue(task_id) on delete restrict,
  actor_type text not null check (actor_type in ('human_user','scheduler','system')),
  actor_user_id uuid references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in (
    'schedule_created_paused','schedule_activated','schedule_paused',
    'schedule_cancelled','schedule_occurrence_enqueued','schedule_error',
    'schedule_completed'
  )),
  reason text not null default '' check (length(reason)<=1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now()
);
create index if not exists ai_task_schedule_events_owner_schedule_time_idx
  on ai_network.ai_task_schedule_events(owner_user_id,schedule_id,occurred_at desc);

alter table ai_network.ai_task_schedules enable row level security;
alter table ai_network.ai_task_schedule_events enable row level security;
revoke all on ai_network.ai_task_schedules,ai_network.ai_task_schedule_events from public,anon,authenticated;
grant select,insert,update on ai_network.ai_task_schedules to service_role;
grant select,insert on ai_network.ai_task_schedule_events to service_role;

create or replace function public.minglora_ai_schedule_command(
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
  v_schedule ai_network.ai_task_schedules%rowtype;
  v_schedule_id uuid;
  v_identity_id uuid;
  v_owner uuid := p_actor_user_id;
  v_bot_id text;
  v_task_type text;
  v_cadence text;
  v_timezone text;
  v_run_at timestamptz;
  v_weekdays smallint[];
  v_status text;
  v_key text;
  v_task_title text;
  v_task_payload jsonb;
  v_token_budget integer;
  v_cost_limit numeric(14,6);
  v_reused boolean := false;
  v_result jsonb;
  v_rows jsonb;
  v_controls record;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='AI scheduling commands are restricted to the Minglora server runtime.';
  end if;
  if v_action <> 'dispatch_due_schedules' then
    if v_owner is null or not exists(select 1 from public.profiles p where p.id=v_owner) then
      raise exception using errcode='42501',message='A valid signed-in Minglora account is required.';
    end if;
  end if;
  if jsonb_typeof(v_payload)<>'object' then
    raise exception using errcode='22023',message='AI schedule payload must be a JSON object.';
  end if;

  if v_action='create_schedule' then
    if coalesce(v_payload->>'identity_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid AI identity is required for this schedule.';
    end if;
    v_identity_id:=(v_payload->>'identity_id')::uuid;
    v_bot_id:=left(trim(coalesce(v_payload->>'bot_id','')),80);
    v_task_type:=lower(trim(coalesce(v_payload->>'task_type','')));
    v_cadence:=lower(trim(coalesce(v_payload->>'cadence','')));
    v_timezone:=trim(coalesce(v_payload->>'time_zone','UTC'));
    v_run_at:=nullif(v_payload->>'run_at','')::timestamptz;
    v_key:=nullif(trim(coalesce(v_payload->>'idempotency_key','')),'');
    v_task_title:=left(trim(coalesce(v_payload->>'task_title','Scheduled '||replace(v_task_type,'_',' '))),180);
    v_task_payload:=coalesce(v_payload->'task_payload','{}'::jsonb);
    if length(v_bot_id)<1 or v_task_type not in (
      'content_outline','caption_draft','title_ideas','translation_draft',
      'creator_calendar','public_event_support'
    ) then
      raise exception using errcode='22023',message='Choose a linked AI bot and supported low-risk scheduled task.';
    end if;
    if v_cadence not in ('once','daily','weekly') then
      raise exception using errcode='22023',message='Choose once, daily or weekly scheduling.';
    end if;
    if v_run_at is null or v_run_at < now()+interval '5 minutes' then
      raise exception using errcode='22023',message='Schedule time must be at least five minutes in the future.';
    end if;
    if not exists(select 1 from pg_timezone_names z where z.name=v_timezone) then
      raise exception using errcode='22023',message='Choose a valid IANA time zone.';
    end if;
    if v_key is null or length(v_key)<8 or length(v_key)>160 then
      raise exception using errcode='22023',message='A stable schedule idempotency key is required.';
    end if;
    if jsonb_typeof(v_task_payload)<>'object' or octet_length(v_task_payload::text)>65536 then
      raise exception using errcode='22023',message='Schedule task payload must be a JSON object no larger than 64 KB.';
    end if;
    if coalesce(v_payload->>'action_class','content') not in ('read_only','content') then
      raise exception using errcode='42501',message='Scheduled tasks are limited to read-only and content work.';
    end if;
    if coalesce(v_payload->>'token_budget','0') !~ '^[0-9]{1,8}
    if (v_cadence='weekly' and cardinality(v_weekdays) not between 1 and 7)
       or (v_cadence<>'weekly' and cardinality(v_weekdays)<>0) then
      raise exception using errcode='22023',message='Weekly schedules require one or more weekdays; other cadences do not use weekdays.';
    end if;
    if not exists(select 1 from ai_network.ai_identities i
      where i.identity_id=v_identity_id and i.owner_user_id=v_owner
        and i.status not in ('suspended','archived','retired')
        and i.supervision_level<>'restricted_observation') then
      raise exception using errcode='42501',message='The AI identity is unavailable or not owned by this Minglora account.';
    end if;
    select s.schedule_id into v_schedule_id from ai_network.ai_task_schedules s
      where s.owner_user_id=v_owner and s.idempotency_key=v_key;
    v_reused:=v_schedule_id is not null;
    if v_schedule_id is null then
      insert into ai_network.ai_task_schedules(
        owner_user_id,identity_id,bot_id,task_type,action_class,task_title,task_payload,
        cadence,time_zone,weekdays,next_run_at,schedule_status,requires_human_approval,
        ai_disclosure_required,token_budget,cost_limit_usd,idempotency_key,created_by_user_id
      ) values (
        v_owner,v_identity_id,v_bot_id,v_task_type,coalesce(v_payload->>'action_class','content'),
        v_task_title,v_task_payload,v_cadence,v_timezone,v_weekdays,v_run_at,'paused',true,
        true,v_token_budget,v_cost_limit,
        v_key,v_owner
      ) returning schedule_id into v_schedule_id;
      insert into ai_network.ai_task_schedule_events(
        owner_user_id,schedule_id,actor_type,actor_user_id,event_type,reason,metadata
      ) values (
        v_owner,v_schedule_id,'human_user',v_owner,'schedule_created_paused',
        'Owner created a paused recurring schedule; dispatch requires runtime/provider readiness and later human task approval.',
        jsonb_build_object('cadence',v_cadence,'time_zone',v_timezone,'next_run_at',v_run_at)
      );
    end if;
    select * into v_schedule from ai_network.ai_task_schedules s
      where s.schedule_id=v_schedule_id and s.owner_user_id=v_owner;
    if v_schedule.identity_id is distinct from v_identity_id
      or v_schedule.bot_id is distinct from v_bot_id
      or v_schedule.task_type is distinct from v_task_type
      or v_schedule.cadence is distinct from v_cadence
      or v_schedule.time_zone is distinct from v_timezone
      or v_schedule.next_run_at is distinct from v_run_at
      or v_schedule.weekdays is distinct from v_weekdays then
      raise exception using errcode='23505',message='Schedule idempotency key was already used for a different schedule.';
    end if;
    return jsonb_build_object('schedule',to_jsonb(v_schedule),'reused',v_reused);
  end if;

  if v_action='list_schedules' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.schedule_id,
      'scheduleId',s.schedule_id,
      'identityId',s.identity_id,
      'botId',s.bot_id,
      'taskType',s.task_type,
      'taskTitle',s.task_title,
      'cadence',s.cadence,
      'timezone',s.time_zone,
      'weekdays',to_jsonb(s.weekdays),
      'runAt',s.next_run_at,
      'nextRunAt',s.next_run_at,
      'status',s.schedule_status,
      'requiresHumanApproval',s.requires_human_approval,
      'aiDisclosureRequired',s.ai_disclosure_required,
      'runCount',s.run_count,
      'lastEnqueuedAt',s.last_enqueued_at,
      'lastError',s.last_error,
      'createdAt',s.created_at,
      'updatedAt',s.updated_at
    ) order by s.created_at desc),'[]'::jsonb) into v_rows
    from ai_network.ai_task_schedules s where s.owner_user_id=v_owner;
    return jsonb_build_object('schedules',v_rows);
  end if;

  if v_action='set_schedule_status' then
    if coalesce(v_payload->>'schedule_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid schedule ID is required.';
    end if;
    v_schedule_id:=(v_payload->>'schedule_id')::uuid;
    v_status:=lower(trim(coalesce(v_payload->>'status','')));
    if v_status not in ('active','paused','cancelled') then
      raise exception using errcode='22023',message='Choose active, paused or cancelled for this schedule.';
    end if;
    select * into v_schedule from ai_network.ai_task_schedules s
      where s.schedule_id=v_schedule_id and s.owner_user_id=v_owner for update;
    if not found then raise exception using errcode='P0002',message='AI schedule not found.';
    end if;
    if v_status='active' then
      select c.global_paused,c.execution_enabled into v_controls
        from ai_network.ai_task_runtime_controls c where c.control_key='primary';
      if coalesce(v_controls.global_paused,true) or not coalesce(v_controls.execution_enabled,false) then
        raise exception using errcode='42501',message='Scheduled task dispatch is disabled by Minglora runtime controls.';
      end if;
      if not exists(select 1 from ai_network.ai_identities i
        where i.identity_id=v_schedule.identity_id and i.owner_user_id=v_owner
          and i.status='active' and i.enabled=true)
        or not exists(
          select 1 from ai_network.ai_provider_assignments a
          join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
          where a.identity_id=v_schedule.identity_id and a.assignment_status='active'
            and a.provider_health_status='healthy' and pa.status='configured' and pa.health_status='healthy'
        ) then
        raise exception using errcode='42501',message='Activate the AI identity and verify its provider assignment before enabling this schedule.';
      end if;
      if v_schedule.schedule_status in ('cancelled','completed') then
        raise exception using errcode='40901',message='A cancelled or completed schedule cannot be reactivated; create a new schedule.';
      end if;
    end if;
    update ai_network.ai_task_schedules s
      set schedule_status=v_status,
          next_run_at=case when v_status='cancelled' then null else coalesce(s.next_run_at,now()+interval '5 minutes') end,
          last_error='',
          updated_at=now()
    where s.schedule_id=v_schedule_id and s.owner_user_id=v_owner
    returning * into v_schedule;
    insert into ai_network.ai_task_schedule_events(
      owner_user_id,schedule_id,actor_type,actor_user_id,event_type,reason,metadata
    ) values (
      v_owner,v_schedule_id,'human_user',v_owner,
      case v_status when 'active' then 'schedule_activated' when 'paused' then 'schedule_paused' else 'schedule_cancelled' end,
      left(trim(coalesce(v_payload->>'reason','Owner changed the schedule status.')),1000),
      jsonb_build_object('status',v_status)
    );
    return jsonb_build_object('schedule',to_jsonb(v_schedule));
  end if;

  raise exception using errcode='22023',message='Unsupported AI scheduling command.';
end;
$function$;

create or replace function ai_network.dispatch_due_task_schedules()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_controls record;
  v_schedule ai_network.ai_task_schedules%rowtype;
  v_task_result jsonb;
  v_task_id uuid;
  v_run_key text;
  v_occurrences integer := 0;
  v_errors integer := 0;
  v_local timestamp;
  v_next_local timestamp;
  v_next_at timestamptz;
  v_days integer;
  v_task_payload jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='Schedule dispatch is restricted to the internal Minglora scheduler.';
  end if;
  select c.global_paused,c.execution_enabled into v_controls
    from ai_network.ai_task_runtime_controls c where c.control_key='primary';
  if not found or coalesce(v_controls.global_paused,true) or not coalesce(v_controls.execution_enabled,false) then
    return jsonb_build_object('dispatched',0,'errors',0,'reason','runtime_paused_or_execution_disabled');
  end if;

  for v_schedule in
    select s.* from ai_network.ai_task_schedules s
    where s.schedule_status='active' and s.next_run_at<=now()
    order by s.next_run_at,s.created_at
    for update skip locked
    limit 50
  loop
    begin
      if not exists(select 1 from ai_network.ai_identities i
        where i.identity_id=v_schedule.identity_id and i.owner_user_id=v_schedule.owner_user_id
          and i.status='active' and i.enabled=true
          and i.supervision_level<>'restricted_observation')
        or not exists(
          select 1 from ai_network.ai_provider_assignments a
          join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
          where a.identity_id=v_schedule.identity_id and a.assignment_status='active'
            and a.provider_health_status='healthy' and pa.status='configured' and pa.health_status='healthy'
        ) then
        update ai_network.ai_task_schedules set schedule_status='paused',
          last_error='Assigned AI identity or provider assignment is no longer active and healthy.',updated_at=now()
        where schedule_id=v_schedule.schedule_id and owner_user_id=v_schedule.owner_user_id;
        insert into ai_network.ai_task_schedule_events(
          owner_user_id,schedule_id,actor_type,event_type,reason,metadata
        ) values(
          v_schedule.owner_user_id,v_schedule.schedule_id,'scheduler','schedule_error',
          'Schedule automatically paused because its AI identity or provider assignment is unavailable.',
          jsonb_build_object('previous_status','active')
        );
        v_errors:=v_errors+1;
        continue;
      end if;

      v_run_key:='schedule:'||v_schedule.schedule_id::text||':'||(v_schedule.run_count+1)::text;
      v_task_payload:=v_schedule.task_payload||jsonb_build_object(
        'ai_disclosure_required',true,'scheduled_schedule_id',v_schedule.schedule_id,
        'scheduled_occurrence',v_schedule.run_count+1
      );
      v_task_result:=public.minglora_ai_task_command('create_task',v_schedule.owner_user_id,jsonb_build_object(
        'identity_id',v_schedule.identity_id,
        'task_title',v_schedule.task_title,
        'task_type',v_schedule.task_type,
        'action_class',v_schedule.action_class,
        'task_payload',v_task_payload,
        'priority',100,
        'scheduled_for',v_schedule.next_run_at,
        'max_attempts',3,
        'token_budget',v_schedule.token_budget,
        'cost_limit_usd',v_schedule.cost_limit_usd,
        'idempotency_key',v_run_key
      ));
      v_task_id:=nullif(v_task_result->'task'->>'task_id','')::uuid;
      if v_task_id is null then raise exception 'Durable task queue did not return the scheduled task ID.'; end if;

      update ai_network.ai_task_queue q set
        requires_approval=true,
        status='pending_approval',
        approved_by_user_id=null,
        approved_at=null,
        updated_at=now()
      where q.task_id=v_task_id and q.owner_user_id=v_schedule.owner_user_id;
      insert into ai_network.ai_task_approvals(owner_user_id,task_id,approval_status)
        values(v_schedule.owner_user_id,v_task_id,'requested')
        on conflict(task_id) do nothing;
      insert into ai_network.ai_task_events(
        owner_user_id,task_id,actor_type,event_type,previous_status,new_status,reason,metadata
      ) values(
        v_schedule.owner_user_id,v_task_id,'system','scheduled_task_enqueued','queued','pending_approval',
        'Scheduled task was materialized into the human approval queue; no worker execution was requested.',
        jsonb_build_object('schedule_id',v_schedule.schedule_id,'run_count',v_schedule.run_count+1)
      );

      if v_schedule.cadence='once'
        or (v_schedule.max_occurrences is not null and v_schedule.run_count+1>=v_schedule.max_occurrences) then
        v_next_at:=null;
        v_status:='completed';
      else
        v_local:=v_schedule.next_run_at at time zone v_schedule.time_zone;
        if v_schedule.cadence='daily' then
          v_next_local:=v_local+interval '1 day';
        else
          select min(case when d.day > extract(dow from v_local)::integer
            then d.day-extract(dow from v_local)::integer
            else d.day-extract(dow from v_local)::integer+7 end)
          into v_days
          from unnest(v_schedule.weekdays) as d(day);
          v_next_local:=v_local+make_interval(days=>v_days);
        end if;
        v_next_at:=v_next_local at time zone v_schedule.time_zone;
        v_status:='active';
      end if;

      update ai_network.ai_task_schedules set
        run_count=run_count+1,
        last_enqueued_task_id=v_task_id,
        last_enqueued_at=now(),
        last_error='',
        next_run_at=v_next_at,
        schedule_status=v_status,
        updated_at=now()
      where schedule_id=v_schedule.schedule_id and owner_user_id=v_schedule.owner_user_id;
      insert into ai_network.ai_task_schedule_events(
        owner_user_id,schedule_id,task_id,actor_type,event_type,reason,metadata
      ) values(
        v_schedule.owner_user_id,v_schedule.schedule_id,v_task_id,'scheduler',
        case when v_status='completed' then 'schedule_completed' else 'schedule_occurrence_enqueued' end,
        'Due schedule was enqueued for human approval; worker execution remains separate.',
        jsonb_build_object('task_id',v_task_id,'run_count',v_schedule.run_count+1,'next_run_at',v_next_at)
      );
      v_occurrences:=v_occurrences+1;
    exception when others then
      update ai_network.ai_task_schedules set
        schedule_status='error',
        last_error=left(sqlerrm,1000),
        updated_at=now()
      where schedule_id=v_schedule.schedule_id and owner_user_id=v_schedule.owner_user_id;
      insert into ai_network.ai_task_schedule_events(
        owner_user_id,schedule_id,actor_type,event_type,reason,metadata
      ) values(
        v_schedule.owner_user_id,v_schedule.schedule_id,'scheduler','schedule_error',
        'Schedule occurrence failed safely and was paused for review.',
        jsonb_build_object('error',left(sqlerrm,1000))
      );
      v_errors:=v_errors+1;
    end;
  end loop;
  return jsonb_build_object('dispatched',v_occurrences,'errors',v_errors);
end;
$function$;

revoke all on function public.minglora_ai_schedule_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_schedule_command(text,uuid,jsonb) to service_role;
revoke all on function ai_network.dispatch_due_task_schedules() from public,anon,authenticated;
grant execute on function ai_network.dispatch_due_task_schedules() to service_role;

do $schedule_job$
begin
  if not exists(select 1 from cron.job where jobname='minglora_ai_schedule_dispatch') then
    perform cron.schedule(
      'minglora_ai_schedule_dispatch',
      '* * * * *',
      'SET ROLE service_role; SELECT ai_network.dispatch_due_task_schedules(); RESET ROLE;'
    );
  end if;
end
$schedule_job$;

       or coalesce(v_payload->>'cost_limit_usd','0') !~ '^[0-9]+([.][0-9]{1,6})?
    if (v_cadence='weekly' and cardinality(v_weekdays) not between 1 and 7)
       or (v_cadence<>'weekly' and cardinality(v_weekdays)<>0) then
      raise exception using errcode='22023',message='Weekly schedules require one or more weekdays; other cadences do not use weekdays.';
    end if;
    if not exists(select 1 from ai_network.ai_identities i
      where i.identity_id=v_identity_id and i.owner_user_id=v_owner
        and i.status not in ('suspended','archived','retired')) then
      raise exception using errcode='42501',message='The AI identity is unavailable or not owned by this Minglora account.';
    end if;
    select s.schedule_id into v_schedule_id from ai_network.ai_task_schedules s
      where s.owner_user_id=v_owner and s.idempotency_key=v_key;
    if v_schedule_id is null then
      insert into ai_network.ai_task_schedules(
        owner_user_id,identity_id,bot_id,task_type,action_class,task_title,task_payload,
        cadence,time_zone,weekdays,next_run_at,schedule_status,requires_human_approval,
        ai_disclosure_required,token_budget,cost_limit_usd,idempotency_key,created_by_user_id
      ) values (
        v_owner,v_identity_id,v_bot_id,v_task_type,coalesce(v_payload->>'action_class','content'),
        v_task_title,v_task_payload,v_cadence,v_timezone,v_weekdays,v_run_at,'paused',true,
        true,(v_payload->>'token_budget')::integer,(v_payload->>'cost_limit_usd')::numeric,
        v_key,v_owner
      ) returning schedule_id into v_schedule_id;
      insert into ai_network.ai_task_schedule_events(
        owner_user_id,schedule_id,actor_type,actor_user_id,event_type,reason,metadata
      ) values (
        v_owner,v_schedule_id,'human_user',v_owner,'schedule_created_paused',
        'Owner created a paused recurring schedule; dispatch requires runtime/provider readiness and later human task approval.',
        jsonb_build_object('cadence',v_cadence,'time_zone',v_timezone,'next_run_at',v_run_at)
      );
    end if;
    select * into v_schedule from ai_network.ai_task_schedules s
      where s.schedule_id=v_schedule_id and s.owner_user_id=v_owner;
    if v_schedule.identity_id is distinct from v_identity_id
      or v_schedule.bot_id is distinct from v_bot_id
      or v_schedule.task_type is distinct from v_task_type
      or v_schedule.cadence is distinct from v_cadence
      or v_schedule.time_zone is distinct from v_timezone
      or v_schedule.next_run_at is distinct from v_run_at
      or v_schedule.weekdays is distinct from v_weekdays then
      raise exception using errcode='23505',message='Schedule idempotency key was already used for a different schedule.';
    end if;
    return jsonb_build_object('schedule',to_jsonb(v_schedule),'reused',exists(
      select 1 from ai_network.ai_task_schedule_events e
      where e.schedule_id=v_schedule_id and e.event_type='schedule_created_paused'
        and e.occurred_at<v_schedule.created_at+interval '1 second'
    ));
  end if;

  if v_action='list_schedules' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.schedule_id,
      'scheduleId',s.schedule_id,
      'identityId',s.identity_id,
      'botId',s.bot_id,
      'taskType',s.task_type,
      'taskTitle',s.task_title,
      'cadence',s.cadence,
      'timezone',s.time_zone,
      'weekdays',to_jsonb(s.weekdays),
      'runAt',s.next_run_at,
      'nextRunAt',s.next_run_at,
      'status',s.schedule_status,
      'requiresHumanApproval',s.requires_human_approval,
      'aiDisclosureRequired',s.ai_disclosure_required,
      'runCount',s.run_count,
      'lastEnqueuedAt',s.last_enqueued_at,
      'lastError',s.last_error,
      'createdAt',s.created_at,
      'updatedAt',s.updated_at
    ) order by s.created_at desc),'[]'::jsonb) into v_rows
    from ai_network.ai_task_schedules s where s.owner_user_id=v_owner;
    return jsonb_build_object('schedules',v_rows);
  end if;

  if v_action='set_schedule_status' then
    if coalesce(v_payload->>'schedule_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid schedule ID is required.';
    end if;
    v_schedule_id:=(v_payload->>'schedule_id')::uuid;
    v_status:=lower(trim(coalesce(v_payload->>'status','')));
    if v_status not in ('active','paused','cancelled') then
      raise exception using errcode='22023',message='Choose active, paused or cancelled for this schedule.';
    end if;
    select * into v_schedule from ai_network.ai_task_schedules s
      where s.schedule_id=v_schedule_id and s.owner_user_id=v_owner for update;
    if not found then raise exception using errcode='P0002',message='AI schedule not found.';
    end if;
    if v_status='active' then
      select c.global_paused,c.execution_enabled into v_controls
        from ai_network.ai_task_runtime_controls c where c.control_key='primary';
      if coalesce(v_controls.global_paused,true) or not coalesce(v_controls.execution_enabled,false) then
        raise exception using errcode='42501',message='Scheduled task dispatch is disabled by Minglora runtime controls.';
      end if;
      if not exists(select 1 from ai_network.ai_identities i
        where i.identity_id=v_schedule.identity_id and i.owner_user_id=v_owner
          and i.status='active' and i.enabled=true)
        or not exists(
          select 1 from ai_network.ai_provider_assignments a
          join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
          where a.identity_id=v_schedule.identity_id and a.assignment_status='active'
            and a.provider_health_status='healthy' and pa.status='configured' and pa.health_status='healthy'
        ) then
        raise exception using errcode='42501',message='Activate the AI identity and verify its provider assignment before enabling this schedule.';
      end if;
      if v_schedule.schedule_status in ('cancelled','completed') then
        raise exception using errcode='40901',message='A cancelled or completed schedule cannot be reactivated; create a new schedule.';
      end if;
    end if;
    update ai_network.ai_task_schedules s
      set schedule_status=v_status,
          next_run_at=case when v_status='cancelled' then null else coalesce(s.next_run_at,now()+interval '5 minutes') end,
          last_error='',
          updated_at=now()
    where s.schedule_id=v_schedule_id and s.owner_user_id=v_owner
    returning * into v_schedule;
    insert into ai_network.ai_task_schedule_events(
      owner_user_id,schedule_id,actor_type,actor_user_id,event_type,reason,metadata
    ) values (
      v_owner,v_schedule_id,'human_user',v_owner,
      case v_status when 'active' then 'schedule_activated' when 'paused' then 'schedule_paused' else 'schedule_cancelled' end,
      left(trim(coalesce(v_payload->>'reason','Owner changed the schedule status.')),1000),
      jsonb_build_object('status',v_status)
    );
    return jsonb_build_object('schedule',to_jsonb(v_schedule));
  end if;

  raise exception using errcode='22023',message='Unsupported AI scheduling command.';
end;
$function$;

create or replace function ai_network.dispatch_due_task_schedules()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_controls record;
  v_schedule ai_network.ai_task_schedules%rowtype;
  v_task_result jsonb;
  v_task_id uuid;
  v_run_key text;
  v_occurrences integer := 0;
  v_errors integer := 0;
  v_local timestamp;
  v_next_local timestamp;
  v_next_at timestamptz;
  v_days integer;
  v_task_payload jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='Schedule dispatch is restricted to the internal Minglora scheduler.';
  end if;
  select c.global_paused,c.execution_enabled into v_controls
    from ai_network.ai_task_runtime_controls c where c.control_key='primary';
  if not found or coalesce(v_controls.global_paused,true) or not coalesce(v_controls.execution_enabled,false) then
    return jsonb_build_object('dispatched',0,'errors',0,'reason','runtime_paused_or_execution_disabled');
  end if;

  for v_schedule in
    select s.* from ai_network.ai_task_schedules s
    where s.schedule_status='active' and s.next_run_at<=now()
    order by s.next_run_at,s.created_at
    for update skip locked
    limit 50
  loop
    begin
      if not exists(select 1 from ai_network.ai_identities i
        where i.identity_id=v_schedule.identity_id and i.owner_user_id=v_schedule.owner_user_id
          and i.status='active' and i.enabled=true)
        or not exists(
          select 1 from ai_network.ai_provider_assignments a
          join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
          where a.identity_id=v_schedule.identity_id and a.assignment_status='active'
            and a.provider_health_status='healthy' and pa.status='configured' and pa.health_status='healthy'
        ) then
        update ai_network.ai_task_schedules set schedule_status='paused',
          last_error='Assigned AI identity or provider assignment is no longer active and healthy.',updated_at=now()
        where schedule_id=v_schedule.schedule_id and owner_user_id=v_schedule.owner_user_id;
        insert into ai_network.ai_task_schedule_events(
          owner_user_id,schedule_id,actor_type,event_type,reason,metadata
        ) values(
          v_schedule.owner_user_id,v_schedule.schedule_id,'scheduler','schedule_error',
          'Schedule automatically paused because its AI identity or provider assignment is unavailable.',
          jsonb_build_object('previous_status','active')
        );
        v_errors:=v_errors+1;
        continue;
      end if;

      v_run_key:='schedule:'||v_schedule.schedule_id::text||':'||(v_schedule.run_count+1)::text;
      v_task_payload:=v_schedule.task_payload||jsonb_build_object(
        'ai_disclosure_required',true,'scheduled_schedule_id',v_schedule.schedule_id,
        'scheduled_occurrence',v_schedule.run_count+1
      );
      v_task_result:=public.minglora_ai_task_command('create_task',v_schedule.owner_user_id,jsonb_build_object(
        'identity_id',v_schedule.identity_id,
        'task_title',v_schedule.task_title,
        'task_type',v_schedule.task_type,
        'action_class',v_schedule.action_class,
        'task_payload',v_task_payload,
        'priority',100,
        'scheduled_for',v_schedule.next_run_at,
        'max_attempts',3,
        'token_budget',v_schedule.token_budget,
        'cost_limit_usd',v_schedule.cost_limit_usd,
        'idempotency_key',v_run_key
      ));
      v_task_id:=nullif(v_task_result->'task'->>'task_id','')::uuid;
      if v_task_id is null then raise exception 'Durable task queue did not return the scheduled task ID.'; end if;

      update ai_network.ai_task_queue q set
        requires_approval=true,
        status='pending_approval',
        approved_by_user_id=null,
        approved_at=null,
        updated_at=now()
      where q.task_id=v_task_id and q.owner_user_id=v_schedule.owner_user_id;
      insert into ai_network.ai_task_approvals(owner_user_id,task_id,approval_status)
        values(v_schedule.owner_user_id,v_task_id,'requested')
        on conflict(task_id) do nothing;
      insert into ai_network.ai_task_events(
        owner_user_id,task_id,actor_type,event_type,previous_status,new_status,reason,metadata
      ) values(
        v_schedule.owner_user_id,v_task_id,'system','scheduled_task_enqueued','queued','pending_approval',
        'Scheduled task was materialized into the human approval queue; no worker execution was requested.',
        jsonb_build_object('schedule_id',v_schedule.schedule_id,'run_count',v_schedule.run_count+1)
      );

      if v_schedule.cadence='once'
        or (v_schedule.max_occurrences is not null and v_schedule.run_count+1>=v_schedule.max_occurrences) then
        v_next_at:=null;
        v_status:='completed';
      else
        v_local:=v_schedule.next_run_at at time zone v_schedule.time_zone;
        if v_schedule.cadence='daily' then
          v_next_local:=v_local+interval '1 day';
        else
          select min(case when d.day > extract(dow from v_local)::integer
            then d.day-extract(dow from v_local)::integer
            else d.day-extract(dow from v_local)::integer+7 end)
          into v_days
          from unnest(v_schedule.weekdays) as d(day);
          v_next_local:=v_local+make_interval(days=>v_days);
        end if;
        v_next_at:=v_next_local at time zone v_schedule.time_zone;
        v_status:='active';
      end if;

      update ai_network.ai_task_schedules set
        run_count=run_count+1,
        last_enqueued_task_id=v_task_id,
        last_enqueued_at=now(),
        last_error='',
        next_run_at=v_next_at,
        schedule_status=v_status,
        updated_at=now()
      where schedule_id=v_schedule.schedule_id and owner_user_id=v_schedule.owner_user_id;
      insert into ai_network.ai_task_schedule_events(
        owner_user_id,schedule_id,task_id,actor_type,event_type,reason,metadata
      ) values(
        v_schedule.owner_user_id,v_schedule.schedule_id,v_task_id,'scheduler',
        case when v_status='completed' then 'schedule_completed' else 'schedule_occurrence_enqueued' end,
        'Due schedule was enqueued for human approval; worker execution remains separate.',
        jsonb_build_object('task_id',v_task_id,'run_count',v_schedule.run_count+1,'next_run_at',v_next_at)
      );
      v_occurrences:=v_occurrences+1;
    exception when others then
      update ai_network.ai_task_schedules set
        schedule_status='error',
        last_error=left(sqlerrm,1000),
        updated_at=now()
      where schedule_id=v_schedule.schedule_id and owner_user_id=v_schedule.owner_user_id;
      insert into ai_network.ai_task_schedule_events(
        owner_user_id,schedule_id,actor_type,event_type,reason,metadata
      ) values(
        v_schedule.owner_user_id,v_schedule.schedule_id,'scheduler','schedule_error',
        'Schedule occurrence failed safely and was paused for review.',
        jsonb_build_object('error',left(sqlerrm,1000))
      );
      v_errors:=v_errors+1;
    end;
  end loop;
  return jsonb_build_object('dispatched',v_occurrences,'errors',v_errors);
end;
$function$;

revoke all on function public.minglora_ai_schedule_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_schedule_command(text,uuid,jsonb) to service_role;
revoke all on function ai_network.dispatch_due_task_schedules() from public,anon,authenticated;
grant execute on function ai_network.dispatch_due_task_schedules() to service_role;

do $schedule_job$
begin
  if not exists(select 1 from cron.job where jobname='minglora_ai_schedule_dispatch') then
    perform cron.schedule(
      'minglora_ai_schedule_dispatch',
      '* * * * *',
      'SET ROLE service_role; SELECT ai_network.dispatch_due_task_schedules(); RESET ROLE;'
    );
  end if;
end
$schedule_job$;
 then
      raise exception using errcode='22023',message='Schedule budgets must be valid non-negative numbers.';
    end if;
    v_token_budget:=coalesce(nullif(v_payload->>'token_budget','')::integer,0);
    v_cost_limit:=coalesce(nullif(v_payload->>'cost_limit_usd','')::numeric,0);
    if v_token_budget not between 0 and 10000000
       or v_cost_limit not between 0 and 1000 then
      raise exception using errcode='22023',message='Schedule budgets are outside the allowed range.';
    end if;
    if jsonb_typeof(coalesce(v_payload->'weekdays','[]'::jsonb))<>'array' then
      raise exception using errcode='22023',message='Schedule weekdays must be an array.';
    end if;
    v_weekdays:=array(
      select distinct q.day::smallint
      from jsonb_array_elements_text(coalesce(v_payload->'weekdays','[]'::jsonb)) as q(day)
      where q.day ~ '^[0-6]
    if (v_cadence='weekly' and cardinality(v_weekdays) not between 1 and 7)
       or (v_cadence<>'weekly' and cardinality(v_weekdays)<>0) then
      raise exception using errcode='22023',message='Weekly schedules require one or more weekdays; other cadences do not use weekdays.';
    end if;
    if not exists(select 1 from ai_network.ai_identities i
      where i.identity_id=v_identity_id and i.owner_user_id=v_owner
        and i.status not in ('suspended','archived','retired')) then
      raise exception using errcode='42501',message='The AI identity is unavailable or not owned by this Minglora account.';
    end if;
    select s.schedule_id into v_schedule_id from ai_network.ai_task_schedules s
      where s.owner_user_id=v_owner and s.idempotency_key=v_key;
    if v_schedule_id is null then
      insert into ai_network.ai_task_schedules(
        owner_user_id,identity_id,bot_id,task_type,action_class,task_title,task_payload,
        cadence,time_zone,weekdays,next_run_at,schedule_status,requires_human_approval,
        ai_disclosure_required,token_budget,cost_limit_usd,idempotency_key,created_by_user_id
      ) values (
        v_owner,v_identity_id,v_bot_id,v_task_type,coalesce(v_payload->>'action_class','content'),
        v_task_title,v_task_payload,v_cadence,v_timezone,v_weekdays,v_run_at,'paused',true,
        true,(v_payload->>'token_budget')::integer,(v_payload->>'cost_limit_usd')::numeric,
        v_key,v_owner
      ) returning schedule_id into v_schedule_id;
      insert into ai_network.ai_task_schedule_events(
        owner_user_id,schedule_id,actor_type,actor_user_id,event_type,reason,metadata
      ) values (
        v_owner,v_schedule_id,'human_user',v_owner,'schedule_created_paused',
        'Owner created a paused recurring schedule; dispatch requires runtime/provider readiness and later human task approval.',
        jsonb_build_object('cadence',v_cadence,'time_zone',v_timezone,'next_run_at',v_run_at)
      );
    end if;
    select * into v_schedule from ai_network.ai_task_schedules s
      where s.schedule_id=v_schedule_id and s.owner_user_id=v_owner;
    if v_schedule.identity_id is distinct from v_identity_id
      or v_schedule.bot_id is distinct from v_bot_id
      or v_schedule.task_type is distinct from v_task_type
      or v_schedule.cadence is distinct from v_cadence
      or v_schedule.time_zone is distinct from v_timezone
      or v_schedule.next_run_at is distinct from v_run_at
      or v_schedule.weekdays is distinct from v_weekdays then
      raise exception using errcode='23505',message='Schedule idempotency key was already used for a different schedule.';
    end if;
    return jsonb_build_object('schedule',to_jsonb(v_schedule),'reused',exists(
      select 1 from ai_network.ai_task_schedule_events e
      where e.schedule_id=v_schedule_id and e.event_type='schedule_created_paused'
        and e.occurred_at<v_schedule.created_at+interval '1 second'
    ));
  end if;

  if v_action='list_schedules' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.schedule_id,
      'scheduleId',s.schedule_id,
      'identityId',s.identity_id,
      'botId',s.bot_id,
      'taskType',s.task_type,
      'taskTitle',s.task_title,
      'cadence',s.cadence,
      'timezone',s.time_zone,
      'weekdays',to_jsonb(s.weekdays),
      'runAt',s.next_run_at,
      'nextRunAt',s.next_run_at,
      'status',s.schedule_status,
      'requiresHumanApproval',s.requires_human_approval,
      'aiDisclosureRequired',s.ai_disclosure_required,
      'runCount',s.run_count,
      'lastEnqueuedAt',s.last_enqueued_at,
      'lastError',s.last_error,
      'createdAt',s.created_at,
      'updatedAt',s.updated_at
    ) order by s.created_at desc),'[]'::jsonb) into v_rows
    from ai_network.ai_task_schedules s where s.owner_user_id=v_owner;
    return jsonb_build_object('schedules',v_rows);
  end if;

  if v_action='set_schedule_status' then
    if coalesce(v_payload->>'schedule_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid schedule ID is required.';
    end if;
    v_schedule_id:=(v_payload->>'schedule_id')::uuid;
    v_status:=lower(trim(coalesce(v_payload->>'status','')));
    if v_status not in ('active','paused','cancelled') then
      raise exception using errcode='22023',message='Choose active, paused or cancelled for this schedule.';
    end if;
    select * into v_schedule from ai_network.ai_task_schedules s
      where s.schedule_id=v_schedule_id and s.owner_user_id=v_owner for update;
    if not found then raise exception using errcode='P0002',message='AI schedule not found.';
    end if;
    if v_status='active' then
      select c.global_paused,c.execution_enabled into v_controls
        from ai_network.ai_task_runtime_controls c where c.control_key='primary';
      if coalesce(v_controls.global_paused,true) or not coalesce(v_controls.execution_enabled,false) then
        raise exception using errcode='42501',message='Scheduled task dispatch is disabled by Minglora runtime controls.';
      end if;
      if not exists(select 1 from ai_network.ai_identities i
        where i.identity_id=v_schedule.identity_id and i.owner_user_id=v_owner
          and i.status='active' and i.enabled=true)
        or not exists(
          select 1 from ai_network.ai_provider_assignments a
          join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
          where a.identity_id=v_schedule.identity_id and a.assignment_status='active'
            and a.provider_health_status='healthy' and pa.status='configured' and pa.health_status='healthy'
        ) then
        raise exception using errcode='42501',message='Activate the AI identity and verify its provider assignment before enabling this schedule.';
      end if;
      if v_schedule.schedule_status in ('cancelled','completed') then
        raise exception using errcode='40901',message='A cancelled or completed schedule cannot be reactivated; create a new schedule.';
      end if;
    end if;
    update ai_network.ai_task_schedules s
      set schedule_status=v_status,
          next_run_at=case when v_status='cancelled' then null else coalesce(s.next_run_at,now()+interval '5 minutes') end,
          last_error='',
          updated_at=now()
    where s.schedule_id=v_schedule_id and s.owner_user_id=v_owner
    returning * into v_schedule;
    insert into ai_network.ai_task_schedule_events(
      owner_user_id,schedule_id,actor_type,actor_user_id,event_type,reason,metadata
    ) values (
      v_owner,v_schedule_id,'human_user',v_owner,
      case v_status when 'active' then 'schedule_activated' when 'paused' then 'schedule_paused' else 'schedule_cancelled' end,
      left(trim(coalesce(v_payload->>'reason','Owner changed the schedule status.')),1000),
      jsonb_build_object('status',v_status)
    );
    return jsonb_build_object('schedule',to_jsonb(v_schedule));
  end if;

  raise exception using errcode='22023',message='Unsupported AI scheduling command.';
end;
$function$;

create or replace function ai_network.dispatch_due_task_schedules()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_controls record;
  v_schedule ai_network.ai_task_schedules%rowtype;
  v_task_result jsonb;
  v_task_id uuid;
  v_run_key text;
  v_occurrences integer := 0;
  v_errors integer := 0;
  v_local timestamp;
  v_next_local timestamp;
  v_next_at timestamptz;
  v_days integer;
  v_task_payload jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='Schedule dispatch is restricted to the internal Minglora scheduler.';
  end if;
  select c.global_paused,c.execution_enabled into v_controls
    from ai_network.ai_task_runtime_controls c where c.control_key='primary';
  if not found or coalesce(v_controls.global_paused,true) or not coalesce(v_controls.execution_enabled,false) then
    return jsonb_build_object('dispatched',0,'errors',0,'reason','runtime_paused_or_execution_disabled');
  end if;

  for v_schedule in
    select s.* from ai_network.ai_task_schedules s
    where s.schedule_status='active' and s.next_run_at<=now()
    order by s.next_run_at,s.created_at
    for update skip locked
    limit 50
  loop
    begin
      if not exists(select 1 from ai_network.ai_identities i
        where i.identity_id=v_schedule.identity_id and i.owner_user_id=v_schedule.owner_user_id
          and i.status='active' and i.enabled=true)
        or not exists(
          select 1 from ai_network.ai_provider_assignments a
          join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
          where a.identity_id=v_schedule.identity_id and a.assignment_status='active'
            and a.provider_health_status='healthy' and pa.status='configured' and pa.health_status='healthy'
        ) then
        update ai_network.ai_task_schedules set schedule_status='paused',
          last_error='Assigned AI identity or provider assignment is no longer active and healthy.',updated_at=now()
        where schedule_id=v_schedule.schedule_id and owner_user_id=v_schedule.owner_user_id;
        insert into ai_network.ai_task_schedule_events(
          owner_user_id,schedule_id,actor_type,event_type,reason,metadata
        ) values(
          v_schedule.owner_user_id,v_schedule.schedule_id,'scheduler','schedule_error',
          'Schedule automatically paused because its AI identity or provider assignment is unavailable.',
          jsonb_build_object('previous_status','active')
        );
        v_errors:=v_errors+1;
        continue;
      end if;

      v_run_key:='schedule:'||v_schedule.schedule_id::text||':'||(v_schedule.run_count+1)::text;
      v_task_payload:=v_schedule.task_payload||jsonb_build_object(
        'ai_disclosure_required',true,'scheduled_schedule_id',v_schedule.schedule_id,
        'scheduled_occurrence',v_schedule.run_count+1
      );
      v_task_result:=public.minglora_ai_task_command('create_task',v_schedule.owner_user_id,jsonb_build_object(
        'identity_id',v_schedule.identity_id,
        'task_title',v_schedule.task_title,
        'task_type',v_schedule.task_type,
        'action_class',v_schedule.action_class,
        'task_payload',v_task_payload,
        'priority',100,
        'scheduled_for',v_schedule.next_run_at,
        'max_attempts',3,
        'token_budget',v_schedule.token_budget,
        'cost_limit_usd',v_schedule.cost_limit_usd,
        'idempotency_key',v_run_key
      ));
      v_task_id:=nullif(v_task_result->'task'->>'task_id','')::uuid;
      if v_task_id is null then raise exception 'Durable task queue did not return the scheduled task ID.'; end if;

      update ai_network.ai_task_queue q set
        requires_approval=true,
        status='pending_approval',
        approved_by_user_id=null,
        approved_at=null,
        updated_at=now()
      where q.task_id=v_task_id and q.owner_user_id=v_schedule.owner_user_id;
      insert into ai_network.ai_task_approvals(owner_user_id,task_id,approval_status)
        values(v_schedule.owner_user_id,v_task_id,'requested')
        on conflict(task_id) do nothing;
      insert into ai_network.ai_task_events(
        owner_user_id,task_id,actor_type,event_type,previous_status,new_status,reason,metadata
      ) values(
        v_schedule.owner_user_id,v_task_id,'system','scheduled_task_enqueued','queued','pending_approval',
        'Scheduled task was materialized into the human approval queue; no worker execution was requested.',
        jsonb_build_object('schedule_id',v_schedule.schedule_id,'run_count',v_schedule.run_count+1)
      );

      if v_schedule.cadence='once'
        or (v_schedule.max_occurrences is not null and v_schedule.run_count+1>=v_schedule.max_occurrences) then
        v_next_at:=null;
        v_status:='completed';
      else
        v_local:=v_schedule.next_run_at at time zone v_schedule.time_zone;
        if v_schedule.cadence='daily' then
          v_next_local:=v_local+interval '1 day';
        else
          select min(case when d.day > extract(dow from v_local)::integer
            then d.day-extract(dow from v_local)::integer
            else d.day-extract(dow from v_local)::integer+7 end)
          into v_days
          from unnest(v_schedule.weekdays) as d(day);
          v_next_local:=v_local+make_interval(days=>v_days);
        end if;
        v_next_at:=v_next_local at time zone v_schedule.time_zone;
        v_status:='active';
      end if;

      update ai_network.ai_task_schedules set
        run_count=run_count+1,
        last_enqueued_task_id=v_task_id,
        last_enqueued_at=now(),
        last_error='',
        next_run_at=v_next_at,
        schedule_status=v_status,
        updated_at=now()
      where schedule_id=v_schedule.schedule_id and owner_user_id=v_schedule.owner_user_id;
      insert into ai_network.ai_task_schedule_events(
        owner_user_id,schedule_id,task_id,actor_type,event_type,reason,metadata
      ) values(
        v_schedule.owner_user_id,v_schedule.schedule_id,v_task_id,'scheduler',
        case when v_status='completed' then 'schedule_completed' else 'schedule_occurrence_enqueued' end,
        'Due schedule was enqueued for human approval; worker execution remains separate.',
        jsonb_build_object('task_id',v_task_id,'run_count',v_schedule.run_count+1,'next_run_at',v_next_at)
      );
      v_occurrences:=v_occurrences+1;
    exception when others then
      update ai_network.ai_task_schedules set
        schedule_status='error',
        last_error=left(sqlerrm,1000),
        updated_at=now()
      where schedule_id=v_schedule.schedule_id and owner_user_id=v_schedule.owner_user_id;
      insert into ai_network.ai_task_schedule_events(
        owner_user_id,schedule_id,actor_type,event_type,reason,metadata
      ) values(
        v_schedule.owner_user_id,v_schedule.schedule_id,'scheduler','schedule_error',
        'Schedule occurrence failed safely and was paused for review.',
        jsonb_build_object('error',left(sqlerrm,1000))
      );
      v_errors:=v_errors+1;
    end;
  end loop;
  return jsonb_build_object('dispatched',v_occurrences,'errors',v_errors);
end;
$function$;

revoke all on function public.minglora_ai_schedule_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_schedule_command(text,uuid,jsonb) to service_role;
revoke all on function ai_network.dispatch_due_task_schedules() from public,anon,authenticated;
grant execute on function ai_network.dispatch_due_task_schedules() to service_role;

do $schedule_job$
begin
  if not exists(select 1 from cron.job where jobname='minglora_ai_schedule_dispatch') then
    perform cron.schedule(
      'minglora_ai_schedule_dispatch',
      '* * * * *',
      'SET ROLE service_role; SELECT ai_network.dispatch_due_task_schedules(); RESET ROLE;'
    );
  end if;
end
$schedule_job$;

      order by q.day::smallint
    );
    if (v_cadence='weekly' and cardinality(v_weekdays) not between 1 and 7)
       or (v_cadence<>'weekly' and cardinality(v_weekdays)<>0) then
      raise exception using errcode='22023',message='Weekly schedules require one or more weekdays; other cadences do not use weekdays.';
    end if;
    if not exists(select 1 from ai_network.ai_identities i
      where i.identity_id=v_identity_id and i.owner_user_id=v_owner
        and i.status not in ('suspended','archived','retired')) then
      raise exception using errcode='42501',message='The AI identity is unavailable or not owned by this Minglora account.';
    end if;
    select s.schedule_id into v_schedule_id from ai_network.ai_task_schedules s
      where s.owner_user_id=v_owner and s.idempotency_key=v_key;
    if v_schedule_id is null then
      insert into ai_network.ai_task_schedules(
        owner_user_id,identity_id,bot_id,task_type,action_class,task_title,task_payload,
        cadence,time_zone,weekdays,next_run_at,schedule_status,requires_human_approval,
        ai_disclosure_required,token_budget,cost_limit_usd,idempotency_key,created_by_user_id
      ) values (
        v_owner,v_identity_id,v_bot_id,v_task_type,coalesce(v_payload->>'action_class','content'),
        v_task_title,v_task_payload,v_cadence,v_timezone,v_weekdays,v_run_at,'paused',true,
        true,(v_payload->>'token_budget')::integer,(v_payload->>'cost_limit_usd')::numeric,
        v_key,v_owner
      ) returning schedule_id into v_schedule_id;
      insert into ai_network.ai_task_schedule_events(
        owner_user_id,schedule_id,actor_type,actor_user_id,event_type,reason,metadata
      ) values (
        v_owner,v_schedule_id,'human_user',v_owner,'schedule_created_paused',
        'Owner created a paused recurring schedule; dispatch requires runtime/provider readiness and later human task approval.',
        jsonb_build_object('cadence',v_cadence,'time_zone',v_timezone,'next_run_at',v_run_at)
      );
    end if;
    select * into v_schedule from ai_network.ai_task_schedules s
      where s.schedule_id=v_schedule_id and s.owner_user_id=v_owner;
    if v_schedule.identity_id is distinct from v_identity_id
      or v_schedule.bot_id is distinct from v_bot_id
      or v_schedule.task_type is distinct from v_task_type
      or v_schedule.cadence is distinct from v_cadence
      or v_schedule.time_zone is distinct from v_timezone
      or v_schedule.next_run_at is distinct from v_run_at
      or v_schedule.weekdays is distinct from v_weekdays then
      raise exception using errcode='23505',message='Schedule idempotency key was already used for a different schedule.';
    end if;
    return jsonb_build_object('schedule',to_jsonb(v_schedule),'reused',exists(
      select 1 from ai_network.ai_task_schedule_events e
      where e.schedule_id=v_schedule_id and e.event_type='schedule_created_paused'
        and e.occurred_at<v_schedule.created_at+interval '1 second'
    ));
  end if;

  if v_action='list_schedules' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.schedule_id,
      'scheduleId',s.schedule_id,
      'identityId',s.identity_id,
      'botId',s.bot_id,
      'taskType',s.task_type,
      'taskTitle',s.task_title,
      'cadence',s.cadence,
      'timezone',s.time_zone,
      'weekdays',to_jsonb(s.weekdays),
      'runAt',s.next_run_at,
      'nextRunAt',s.next_run_at,
      'status',s.schedule_status,
      'requiresHumanApproval',s.requires_human_approval,
      'aiDisclosureRequired',s.ai_disclosure_required,
      'runCount',s.run_count,
      'lastEnqueuedAt',s.last_enqueued_at,
      'lastError',s.last_error,
      'createdAt',s.created_at,
      'updatedAt',s.updated_at
    ) order by s.created_at desc),'[]'::jsonb) into v_rows
    from ai_network.ai_task_schedules s where s.owner_user_id=v_owner;
    return jsonb_build_object('schedules',v_rows);
  end if;

  if v_action='set_schedule_status' then
    if coalesce(v_payload->>'schedule_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid schedule ID is required.';
    end if;
    v_schedule_id:=(v_payload->>'schedule_id')::uuid;
    v_status:=lower(trim(coalesce(v_payload->>'status','')));
    if v_status not in ('active','paused','cancelled') then
      raise exception using errcode='22023',message='Choose active, paused or cancelled for this schedule.';
    end if;
    select * into v_schedule from ai_network.ai_task_schedules s
      where s.schedule_id=v_schedule_id and s.owner_user_id=v_owner for update;
    if not found then raise exception using errcode='P0002',message='AI schedule not found.';
    end if;
    if v_status='active' then
      select c.global_paused,c.execution_enabled into v_controls
        from ai_network.ai_task_runtime_controls c where c.control_key='primary';
      if coalesce(v_controls.global_paused,true) or not coalesce(v_controls.execution_enabled,false) then
        raise exception using errcode='42501',message='Scheduled task dispatch is disabled by Minglora runtime controls.';
      end if;
      if not exists(select 1 from ai_network.ai_identities i
        where i.identity_id=v_schedule.identity_id and i.owner_user_id=v_owner
          and i.status='active' and i.enabled=true)
        or not exists(
          select 1 from ai_network.ai_provider_assignments a
          join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
          where a.identity_id=v_schedule.identity_id and a.assignment_status='active'
            and a.provider_health_status='healthy' and pa.status='configured' and pa.health_status='healthy'
        ) then
        raise exception using errcode='42501',message='Activate the AI identity and verify its provider assignment before enabling this schedule.';
      end if;
      if v_schedule.schedule_status in ('cancelled','completed') then
        raise exception using errcode='40901',message='A cancelled or completed schedule cannot be reactivated; create a new schedule.';
      end if;
    end if;
    update ai_network.ai_task_schedules s
      set schedule_status=v_status,
          next_run_at=case when v_status='cancelled' then null else coalesce(s.next_run_at,now()+interval '5 minutes') end,
          last_error='',
          updated_at=now()
    where s.schedule_id=v_schedule_id and s.owner_user_id=v_owner
    returning * into v_schedule;
    insert into ai_network.ai_task_schedule_events(
      owner_user_id,schedule_id,actor_type,actor_user_id,event_type,reason,metadata
    ) values (
      v_owner,v_schedule_id,'human_user',v_owner,
      case v_status when 'active' then 'schedule_activated' when 'paused' then 'schedule_paused' else 'schedule_cancelled' end,
      left(trim(coalesce(v_payload->>'reason','Owner changed the schedule status.')),1000),
      jsonb_build_object('status',v_status)
    );
    return jsonb_build_object('schedule',to_jsonb(v_schedule));
  end if;

  raise exception using errcode='22023',message='Unsupported AI scheduling command.';
end;
$function$;

create or replace function ai_network.dispatch_due_task_schedules()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_controls record;
  v_schedule ai_network.ai_task_schedules%rowtype;
  v_task_result jsonb;
  v_task_id uuid;
  v_run_key text;
  v_occurrences integer := 0;
  v_errors integer := 0;
  v_local timestamp;
  v_next_local timestamp;
  v_next_at timestamptz;
  v_days integer;
  v_task_payload jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='Schedule dispatch is restricted to the internal Minglora scheduler.';
  end if;
  select c.global_paused,c.execution_enabled into v_controls
    from ai_network.ai_task_runtime_controls c where c.control_key='primary';
  if not found or coalesce(v_controls.global_paused,true) or not coalesce(v_controls.execution_enabled,false) then
    return jsonb_build_object('dispatched',0,'errors',0,'reason','runtime_paused_or_execution_disabled');
  end if;

  for v_schedule in
    select s.* from ai_network.ai_task_schedules s
    where s.schedule_status='active' and s.next_run_at<=now()
    order by s.next_run_at,s.created_at
    for update skip locked
    limit 50
  loop
    begin
      if not exists(select 1 from ai_network.ai_identities i
        where i.identity_id=v_schedule.identity_id and i.owner_user_id=v_schedule.owner_user_id
          and i.status='active' and i.enabled=true)
        or not exists(
          select 1 from ai_network.ai_provider_assignments a
          join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
          where a.identity_id=v_schedule.identity_id and a.assignment_status='active'
            and a.provider_health_status='healthy' and pa.status='configured' and pa.health_status='healthy'
        ) then
        update ai_network.ai_task_schedules set schedule_status='paused',
          last_error='Assigned AI identity or provider assignment is no longer active and healthy.',updated_at=now()
        where schedule_id=v_schedule.schedule_id and owner_user_id=v_schedule.owner_user_id;
        insert into ai_network.ai_task_schedule_events(
          owner_user_id,schedule_id,actor_type,event_type,reason,metadata
        ) values(
          v_schedule.owner_user_id,v_schedule.schedule_id,'scheduler','schedule_error',
          'Schedule automatically paused because its AI identity or provider assignment is unavailable.',
          jsonb_build_object('previous_status','active')
        );
        v_errors:=v_errors+1;
        continue;
      end if;

      v_run_key:='schedule:'||v_schedule.schedule_id::text||':'||(v_schedule.run_count+1)::text;
      v_task_payload:=v_schedule.task_payload||jsonb_build_object(
        'ai_disclosure_required',true,'scheduled_schedule_id',v_schedule.schedule_id,
        'scheduled_occurrence',v_schedule.run_count+1
      );
      v_task_result:=public.minglora_ai_task_command('create_task',v_schedule.owner_user_id,jsonb_build_object(
        'identity_id',v_schedule.identity_id,
        'task_title',v_schedule.task_title,
        'task_type',v_schedule.task_type,
        'action_class',v_schedule.action_class,
        'task_payload',v_task_payload,
        'priority',100,
        'scheduled_for',v_schedule.next_run_at,
        'max_attempts',3,
        'token_budget',v_schedule.token_budget,
        'cost_limit_usd',v_schedule.cost_limit_usd,
        'idempotency_key',v_run_key
      ));
      v_task_id:=nullif(v_task_result->'task'->>'task_id','')::uuid;
      if v_task_id is null then raise exception 'Durable task queue did not return the scheduled task ID.'; end if;

      update ai_network.ai_task_queue q set
        requires_approval=true,
        status='pending_approval',
        approved_by_user_id=null,
        approved_at=null,
        updated_at=now()
      where q.task_id=v_task_id and q.owner_user_id=v_schedule.owner_user_id;
      insert into ai_network.ai_task_approvals(owner_user_id,task_id,approval_status)
        values(v_schedule.owner_user_id,v_task_id,'requested')
        on conflict(task_id) do nothing;
      insert into ai_network.ai_task_events(
        owner_user_id,task_id,actor_type,event_type,previous_status,new_status,reason,metadata
      ) values(
        v_schedule.owner_user_id,v_task_id,'system','scheduled_task_enqueued','queued','pending_approval',
        'Scheduled task was materialized into the human approval queue; no worker execution was requested.',
        jsonb_build_object('schedule_id',v_schedule.schedule_id,'run_count',v_schedule.run_count+1)
      );

      if v_schedule.cadence='once'
        or (v_schedule.max_occurrences is not null and v_schedule.run_count+1>=v_schedule.max_occurrences) then
        v_next_at:=null;
        v_status:='completed';
      else
        v_local:=v_schedule.next_run_at at time zone v_schedule.time_zone;
        if v_schedule.cadence='daily' then
          v_next_local:=v_local+interval '1 day';
        else
          select min(case when d.day > extract(dow from v_local)::integer
            then d.day-extract(dow from v_local)::integer
            else d.day-extract(dow from v_local)::integer+7 end)
          into v_days
          from unnest(v_schedule.weekdays) as d(day);
          v_next_local:=v_local+make_interval(days=>v_days);
        end if;
        v_next_at:=v_next_local at time zone v_schedule.time_zone;
        v_status:='active';
      end if;

      update ai_network.ai_task_schedules set
        run_count=run_count+1,
        last_enqueued_task_id=v_task_id,
        last_enqueued_at=now(),
        last_error='',
        next_run_at=v_next_at,
        schedule_status=v_status,
        updated_at=now()
      where schedule_id=v_schedule.schedule_id and owner_user_id=v_schedule.owner_user_id;
      insert into ai_network.ai_task_schedule_events(
        owner_user_id,schedule_id,task_id,actor_type,event_type,reason,metadata
      ) values(
        v_schedule.owner_user_id,v_schedule.schedule_id,v_task_id,'scheduler',
        case when v_status='completed' then 'schedule_completed' else 'schedule_occurrence_enqueued' end,
        'Due schedule was enqueued for human approval; worker execution remains separate.',
        jsonb_build_object('task_id',v_task_id,'run_count',v_schedule.run_count+1,'next_run_at',v_next_at)
      );
      v_occurrences:=v_occurrences+1;
    exception when others then
      update ai_network.ai_task_schedules set
        schedule_status='error',
        last_error=left(sqlerrm,1000),
        updated_at=now()
      where schedule_id=v_schedule.schedule_id and owner_user_id=v_schedule.owner_user_id;
      insert into ai_network.ai_task_schedule_events(
        owner_user_id,schedule_id,actor_type,event_type,reason,metadata
      ) values(
        v_schedule.owner_user_id,v_schedule.schedule_id,'scheduler','schedule_error',
        'Schedule occurrence failed safely and was paused for review.',
        jsonb_build_object('error',left(sqlerrm,1000))
      );
      v_errors:=v_errors+1;
    end;
  end loop;
  return jsonb_build_object('dispatched',v_occurrences,'errors',v_errors);
end;
$function$;

revoke all on function public.minglora_ai_schedule_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_schedule_command(text,uuid,jsonb) to service_role;
revoke all on function ai_network.dispatch_due_task_schedules() from public,anon,authenticated;
grant execute on function ai_network.dispatch_due_task_schedules() to service_role;

do $schedule_job$
begin
  if not exists(select 1 from cron.job where jobname='minglora_ai_schedule_dispatch') then
    perform cron.schedule(
      'minglora_ai_schedule_dispatch',
      '* * * * *',
      'SET ROLE service_role; SELECT ai_network.dispatch_due_task_schedules(); RESET ROLE;'
    );
  end if;
end
$schedule_job$;
