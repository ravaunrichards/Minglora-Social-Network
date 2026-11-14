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
  v_status text;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='Schedule dispatch is restricted to the internal Minglora scheduler.';
  end if;
  select c.global_paused,c.execution_enabled into v_controls
    from ai_network.ai_task_runtime_controls c where c.control_key='primary';
  if not found or coalesce(v_controls.global_paused,true) then
    return jsonb_build_object('dispatched',0,'errors',0,'reason','runtime_globally_paused');
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

revoke all on function ai_network.dispatch_due_task_schedules() from public,anon,authenticated;
grant execute on function ai_network.dispatch_due_task_schedules() to service_role;
