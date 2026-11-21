create or replace function public.minglora_ai_workforce_command(
  p_action text,
  p_actor_user_id uuid,
  p_organization_id uuid,
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
  v_owner uuid := p_actor_user_id;
  v_employment_id uuid;
  v_identity_id uuid;
  v_team_id uuid;
  v_permission_id uuid;
  v_task_id uuid;
  v_message_id uuid;
  v_report_id uuid;
  v_manager_id uuid;
  v_permission_key text;
  v_task_type text;
  v_action_class text;
  v_message_type text;
  v_report_type text;
  v_title text;
  v_body text;
  v_reason text;
  v_idempotency_key text;
  v_allowed_types text[];
  v_workload integer;
  v_priority integer;
  v_max_attempts integer;
  v_token_budget integer;
  v_cost_limit numeric(14,6);
  v_scheduled_for timestamptz;
  v_task_result jsonb;
  v_result jsonb;
  v_status text;
  v_employee ai_network.ai_employment_records%rowtype;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501', message='AI workforce commands are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode='42501', message='A valid signed-in Minglora administrator is required.';
  end if;
  if p_organization_id is null or jsonb_typeof(v_payload)<>'object' then
    raise exception using errcode='22023', message='A valid organization and JSON object are required.';
  end if;
  if v_payload::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
    raise exception using errcode='22023', message='Credentials and secrets are not allowed in workforce payloads.';
  end if;
  if not exists (
    select 1
    from ai_network.ai_organizations o
    join public.minglora_platform_staff s on s.user_id=p_actor_user_id
    where o.organization_id=p_organization_id and o.owner_user_id=p_actor_user_id
      and o.status not in ('suspended','archived')
      and s.active=true and s.role in ('owner','admin','moderator')
  ) then
    raise exception using errcode='42501', message='Organization workforce access is not authorized for this Minglora administrator.';
  end if;

  if v_action='list_workforce' then
    return jsonb_build_object(
      'employees',coalesce((
        select jsonb_agg(jsonb_build_object(
          'employment',to_jsonb(e),
          'identity',jsonb_build_object('identity_id',i.identity_id,'status',i.status,'enabled',i.enabled,'supervision_level',i.supervision_level),
          'display_name',coalesce(n.display_name,n.full_name,n.username,'AI employee'),
          'department_name',d.display_name,'position_name',p.display_name,
          'hierarchy_level',p.hierarchy_level,'manager_name',coalesce(mn.display_name,mn.full_name,mn.username,''),
          'workload',jsonb_build_object(
            'capacity_units',e.workload_percentage,
            'assigned_units',coalesce(w.assigned_units,0),
            'utilization_percent',case when e.workload_percentage=0 then 0
              else round(coalesce(w.assigned_units,0)::numeric/e.workload_percentage*100,1) end,
            'open_tasks',coalesce(w.open_tasks,0)
          ),
          'permissions',coalesce((
            select jsonb_agg(to_jsonb(g) order by g.created_at desc)
            from ai_network.ai_employee_permission_grants g
            where g.owner_user_id=v_owner and g.organization_id=p_organization_id
              and g.employment_id=e.employment_id and g.revoked_at is null
          ),'[]'::jsonb)
        ) order by p.hierarchy_level desc, n.display_name)
        from ai_network.ai_employment_records e
        join ai_network.ai_identities i on i.identity_id=e.identity_id
        left join ai_network.ai_names n on n.identity_id=i.identity_id
        join ai_network.ai_departments d on d.organization_id=e.organization_id and d.department_id=e.department_id
        join ai_network.ai_positions p on p.organization_id=e.organization_id and p.position_id=e.position_id
        left join ai_network.ai_employment_records me on me.organization_id=e.organization_id and me.employment_id=e.manager_employment_id
        left join ai_network.ai_names mn on mn.identity_id=me.identity_id
        left join lateral (
          select coalesce(sum(a.workload_units),0)::integer as assigned_units,
            count(*)::integer as open_tasks
          from ai_network.ai_employee_task_assignments a
          join ai_network.ai_task_queue q on q.owner_user_id=a.owner_user_id and q.task_id=a.task_id
          where a.owner_user_id=v_owner and a.employment_id=e.employment_id
            and q.status in ('pending_approval','queued','running','observation_only')
        ) w on true
        where e.organization_id=p_organization_id
      ),'[]'::jsonb),
      'teams',coalesce((
        select jsonb_agg(jsonb_build_object(
          'team',to_jsonb(t),
          'members',coalesce((
            select jsonb_agg(jsonb_build_object(
              'membership',to_jsonb(tm),
              'display_name',coalesce(nn.display_name,nn.full_name,nn.username,'AI identity')
            ) order by tm.member_role,nn.display_name)
            from ai_network.ai_team_memberships tm
            join ai_network.ai_identities ti on ti.identity_id=tm.identity_id
            left join ai_network.ai_names nn on nn.identity_id=ti.identity_id
            where tm.owner_user_id=v_owner and tm.team_id=t.team_id
          ),'[]'::jsonb)
        ) order by t.created_at desc)
        from ai_network.ai_teams t
        where t.owner_user_id=v_owner and t.organization_id=p_organization_id
      ),'[]'::jsonb),
      'tasks',coalesce((
        select jsonb_agg(jsonb_build_object(
          'assignment',to_jsonb(a),
          'task',to_jsonb(q),
          'employee_name',coalesce(n.display_name,n.full_name,n.username,'AI employee')
        ) order by a.created_at desc)
        from ai_network.ai_employee_task_assignments a
        join ai_network.ai_task_queue q on q.owner_user_id=a.owner_user_id and q.task_id=a.task_id
        join ai_network.ai_employment_records e on e.organization_id=a.organization_id and e.employment_id=a.employment_id
        join ai_network.ai_names n on n.identity_id=e.identity_id
        where a.owner_user_id=v_owner and a.organization_id=p_organization_id
      ),'[]'::jsonb),
      'team_messages',coalesce((
        select jsonb_agg(x.entry order by x.created_at desc)
        from (
          select jsonb_build_object(
            'message',to_jsonb(m),'team_name',t.team_name,
            'author_name',case when m.author_type='human_user'
              then coalesce(h.display_name,h.username,'Minglora administrator')
              else coalesce(n.display_name,n.full_name,n.username,'AI employee') end
          ) as entry,m.created_at
          from ai_network.ai_team_messages m
          join ai_network.ai_teams t on t.owner_user_id=m.owner_user_id and t.team_id=m.team_id
          left join public.profiles h on h.id=m.author_user_id
          left join ai_network.ai_names n on n.identity_id=m.author_identity_id
          where m.owner_user_id=v_owner and m.organization_id=p_organization_id and m.message_status='visible'
          order by m.created_at desc limit 100
        ) x
      ),'[]'::jsonb),
      'team_events',coalesce((
        select jsonb_agg(to_jsonb(te) order by te.occurred_at desc)
        from ai_network.ai_team_events te
        join ai_network.ai_teams t on t.owner_user_id=te.owner_user_id and t.team_id=te.team_id
        where te.owner_user_id=v_owner and t.organization_id=p_organization_id
      ),'[]'::jsonb),
      'workforce_events',coalesce((
        select jsonb_agg(to_jsonb(we) order by we.occurred_at desc)
        from ai_network.ai_workforce_events we
        where we.owner_user_id=v_owner and we.organization_id=p_organization_id
      ),'[]'::jsonb),
      'reports',coalesce((
        select jsonb_agg(x.entry order by x.submitted_at desc)
        from (
          select jsonb_build_object(
            'report',to_jsonb(r),
            'employee_name',coalesce(n.display_name,n.full_name,n.username,'AI employee'),
            'manager_name',coalesce(mn.display_name,mn.full_name,mn.username,'')
          ) as entry,r.submitted_at
          from ai_network.ai_employee_reports r
          join ai_network.ai_employment_records e on e.organization_id=r.organization_id and e.employment_id=r.employment_id
          join ai_network.ai_names n on n.identity_id=e.identity_id
          left join ai_network.ai_employment_records me on me.organization_id=r.organization_id and me.employment_id=r.manager_employment_id
          left join ai_network.ai_names mn on mn.identity_id=me.identity_id
          where r.owner_user_id=v_owner and r.organization_id=p_organization_id
          order by r.submitted_at desc limit 100
        ) x
      ),'[]'::jsonb)
    );
  end if;

  if v_action='list_employee_permissions' then
    v_employment_id:=nullif(v_payload->>'employment_id','')::uuid;
    if v_employment_id is null or not exists(
      select 1 from ai_network.ai_employment_records e
      where e.organization_id=p_organization_id and e.employment_id=v_employment_id
    ) then
      raise exception using errcode='P0002', message='Organization employee record was not found.';
    end if;
    return jsonb_build_object('permissions',coalesce((
      select jsonb_agg(to_jsonb(g) order by g.created_at desc)
      from ai_network.ai_employee_permission_grants g
      where g.owner_user_id=v_owner and g.organization_id=p_organization_id
        and g.employment_id=v_employment_id
    ),'[]'::jsonb));
  end if;

  if v_action='grant_employee_permission' then
    if coalesce(v_payload->>'employment_id','') !~* '^[0-9a-f-]{36}$'
       or coalesce(v_payload->>'idempotency_key','') !~ '^.{8,160}$' then
      raise exception using errcode='22023', message='A valid employee and permission idempotency key are required.';
    end if;
    v_employment_id := (v_payload->>'employment_id')::uuid;
    v_permission_key := lower(coalesce(v_payload->>'permission_key',''));
    if v_permission_key not in ('task.assign.read_only','task.assign.content','team.message','report.submit','report.read','workload.read') then
      raise exception using errcode='22023', message='Choose a supported least-privilege employee permission.';
    end if;
    if jsonb_typeof(coalesce(v_payload->'allowed_task_types','[]'::jsonb))<>'array' then
      raise exception using errcode='22023', message='Allowed task types must be a JSON array.';
    end if;
    select coalesce(array_agg(lower(trim(q.task_type))),array[]::text[]) into v_allowed_types
    from jsonb_array_elements_text(coalesce(v_payload->'allowed_task_types','[]'::jsonb)) as q(task_type);
    if v_permission_key in ('task.assign.read_only','task.assign.content') then
      if cardinality(v_allowed_types)<1 or cardinality(v_allowed_types)>50
         or exists(select 1 from unnest(v_allowed_types) x where x !~ '^[a-z][a-z0-9_.-]{1,79}$') then
        raise exception using errcode='22023', message='Task assignment permissions must list 1 to 50 valid task types.';
      end if;
    elsif cardinality(v_allowed_types)>0 then
      raise exception using errcode='22023', message='Only task assignment permissions may include allowed task types.';
    end if;
    select * into v_employee from ai_network.ai_employment_records e
    where e.organization_id=p_organization_id and e.employment_id=v_employment_id
      and e.employment_status='active' for update;
    if not found or not exists(
      select 1 from ai_network.ai_identities i
      join ai_network.ai_positions p on p.organization_id=p_organization_id and p.position_id=v_employee.position_id
      where i.identity_id=v_employee.identity_id and i.owner_user_id=v_owner
        and i.status='active' and i.enabled=true and p.status='active'
    ) then
      raise exception using errcode='42501', message='Only an active employee with an active identity and job position can receive permissions.';
    end if;
    v_idempotency_key:=v_payload->>'idempotency_key';
    select g.permission_grant_id into v_permission_id
    from ai_network.ai_employee_permission_grants g
    where g.owner_user_id=v_owner and g.idempotency_key=v_idempotency_key;
    if v_permission_id is not null then
      if not exists(select 1 from ai_network.ai_employee_permission_grants g
        where g.permission_grant_id=v_permission_id and g.employment_id=v_employment_id
          and g.permission_key=v_permission_key and g.allowed_task_types=v_allowed_types) then
        raise exception using errcode='23505', message='Permission idempotency key was reused for a different grant.';
      end if;
      return jsonb_build_object('permission_grant_id',v_permission_id,'reused',true);
    end if;
    if exists(select 1 from ai_network.ai_employee_permission_grants g
      where g.owner_user_id=v_owner and g.employment_id=v_employment_id
        and g.permission_key=v_permission_key and g.revoked_at is null) then
      raise exception using errcode='23505', message='This employee already has an active grant for that permission; revoke it before replacing its scope.';
    end if;
    insert into ai_network.ai_employee_permission_grants(
      owner_user_id,organization_id,employment_id,permission_key,allowed_task_types,
      idempotency_key,granted_by_user_id
    ) values (
      v_owner,p_organization_id,v_employment_id,v_permission_key,v_allowed_types,
      v_idempotency_key,v_owner
    ) returning permission_grant_id into v_permission_id;
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,actor_type,actor_user_id,employment_id,event_type,reason,metadata
    ) values (
      v_owner,p_organization_id,'human_user',v_owner,v_employment_id,'permission_granted',
      left(trim(coalesce(v_payload->>'reason','Granted by an authorized Minglora administrator.')),1000),
      jsonb_build_object('permission_key',v_permission_key,'allowed_task_types',to_jsonb(v_allowed_types))
    );
    return jsonb_build_object('permission_grant_id',v_permission_id,'reused',false);
  end if;

  if v_action='revoke_employee_permission' then
    v_permission_id:=nullif(v_payload->>'permission_grant_id','')::uuid;
    v_reason:=left(trim(coalesce(v_payload->>'reason','')),1000);
    if v_permission_id is null or length(v_reason)<3 then
      raise exception using errcode='22023', message='A permission grant and reason of at least three characters are required.';
    end if;
    select g.employment_id into v_employment_id
    from ai_network.ai_employee_permission_grants g
    where g.owner_user_id=v_owner and g.organization_id=p_organization_id
      and g.permission_grant_id=v_permission_id and g.revoked_at is null for update;
    if not found then raise exception using errcode='P0002', message='Active employee permission grant was not found.'; end if;
    update ai_network.ai_employee_permission_grants
    set revoked_at=now(),revoked_by_user_id=v_owner
    where owner_user_id=v_owner and permission_grant_id=v_permission_id;
    perform ai_network.cancel_workforce_assignments(
      null,null,v_permission_id,'Employee permission was revoked: '||v_reason
    );
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,actor_type,actor_user_id,employment_id,event_type,reason,metadata
    ) values (
      v_owner,p_organization_id,'human_user',v_owner,v_employment_id,'permission_revoked',
      v_reason,jsonb_build_object('permission_grant_id',v_permission_id)
    );
    return jsonb_build_object('revoked',true,'cancelled_tasks',
      (select count(*) from ai_network.ai_employee_task_assignments a
       join ai_network.ai_task_queue q on q.owner_user_id=a.owner_user_id and q.task_id=a.task_id
       where a.owner_user_id=v_owner and a.permission_grant_id=v_permission_id and q.status='cancelled'));
  end if;

  if v_action='assign_employee_task' then
    v_employment_id:=nullif(v_payload->>'employment_id','')::uuid;
    v_team_id:=nullif(v_payload->>'team_id','')::uuid;
    v_task_type:=lower(trim(coalesce(v_payload->>'task_type','')));
    v_action_class:=lower(trim(coalesce(v_payload->>'action_class','')));
    v_title:=left(trim(coalesce(v_payload->>'task_title','')),180);
    v_body:=coalesce(v_payload->>'task_payload','{}');
    v_workload:=coalesce(nullif(v_payload->>'workload_units','')::integer,10);
    v_priority:=coalesce(nullif(v_payload->>'priority','')::integer,100);
    v_max_attempts:=coalesce(nullif(v_payload->>'max_attempts','')::integer,3);
    v_token_budget:=coalesce(nullif(v_payload->>'token_budget','')::integer,0);
    v_cost_limit:=coalesce(nullif(v_payload->>'cost_limit_usd','')::numeric,0);
    v_scheduled_for:=coalesce(nullif(v_payload->>'scheduled_for','')::timestamptz,now());
    v_idempotency_key:=trim(coalesce(v_payload->>'idempotency_key',''));
    if v_employment_id is null or length(v_title)<3
       or v_task_type !~ '^[a-z][a-z0-9_.-]{1,79}$'
       or v_action_class not in ('read_only','content')
       or v_workload not between 1 and 100
       or v_idempotency_key !~ '^.{8,160}$' then
      raise exception using errcode='22023', message='Task assignment must specify an employee, task, safe action class, workload and idempotency key.';
    end if;
    if jsonb_typeof(coalesce(v_payload->'task_payload','{}'::jsonb))<>'object'
       or octet_length(coalesce(v_payload->'task_payload','{}'::jsonb)::text)>65536 then
      raise exception using errcode='22023', message='Task payload must be a JSON object no larger than 64 KB.';
    end if;
    if v_priority not between 1 and 10000 or v_max_attempts not between 1 and 10
       or v_token_budget not between 0 and 100000000 or v_cost_limit not between 0 and 1000000 then
      raise exception using errcode='22023', message='Task retry, priority or budget values are outside supported limits.';
    end if;
    select * into v_employee from ai_network.ai_employment_records e
    where e.organization_id=p_organization_id and e.employment_id=v_employment_id
      and e.employment_status='active' for update;
    if not found then raise exception using errcode='42501', message='Tasks can only be assigned to active employees.'; end if;
    select i.identity_id into v_identity_id
    from ai_network.ai_identities i
    join ai_network.ai_positions p on p.organization_id=p_organization_id and p.position_id=v_employee.position_id
    where i.identity_id=v_employee.identity_id and i.owner_user_id=v_owner
      and i.status='active' and i.enabled=true and p.status='active'
      and i.supervision_level<>'restricted_observation';
    if v_identity_id is null then raise exception using errcode='42501', message='Employee identity or position is not active, enabled and eligible for work.'; end if;
    v_permission_key:=case v_action_class when 'read_only' then 'task.assign.read_only' else 'task.assign.content' end;
    select g.permission_grant_id into v_permission_id
    from ai_network.ai_employee_permission_grants g
    where g.owner_user_id=v_owner and g.organization_id=p_organization_id
      and g.employment_id=v_employment_id and g.permission_key=v_permission_key
      and g.revoked_at is null and v_task_type=any(g.allowed_task_types);
    if v_permission_id is null then raise exception using errcode='42501', message='Employee does not have an explicit active permission for this task type and action class.'; end if;
    if v_team_id is not null and not exists (
      select 1 from ai_network.ai_teams t
      join ai_network.ai_team_memberships m
        on m.owner_user_id=t.owner_user_id and m.team_id=t.team_id
      where t.owner_user_id=v_owner and t.team_id=v_team_id
        and t.organization_id=p_organization_id and t.status='active'
        and m.identity_id=v_identity_id and m.membership_status='active'
    ) then
      raise exception using errcode='42501', message='The employee must be an active member of the selected organization team.';
    end if;
    if exists(select 1 from ai_network.ai_employee_task_assignments a
      where a.owner_user_id=v_owner and a.idempotency_key=v_idempotency_key) then
      select a.task_id into v_task_id from ai_network.ai_employee_task_assignments a
      where a.owner_user_id=v_owner and a.idempotency_key=v_idempotency_key
        and a.employment_id=v_employment_id and a.team_id is not distinct from v_team_id
        and a.workload_units=v_workload and a.permission_grant_id=v_permission_id;
      if v_task_id is null then raise exception using errcode='23505', message='Task assignment idempotency key was reused for different assignment details.'; end if;
      select jsonb_build_object('task',to_jsonb(q),'assignment',to_jsonb(a),'reused',true)
        into v_result from ai_network.ai_employee_task_assignments a
        join ai_network.ai_task_queue q on q.owner_user_id=a.owner_user_id and q.task_id=a.task_id
        where a.owner_user_id=v_owner and a.task_id=v_task_id;
      return v_result;
    end if;
    select coalesce(sum(a.workload_units),0)::integer into v_workload
    from ai_network.ai_employee_task_assignments a
    join ai_network.ai_task_queue q on q.owner_user_id=a.owner_user_id and q.task_id=a.task_id
    where a.owner_user_id=v_owner and a.employment_id=v_employment_id
      and q.status in ('pending_approval','queued','running','observation_only');
    if v_workload+coalesce(nullif(v_payload->>'workload_units','')::integer,10)>v_employee.workload_percentage then
      raise exception using errcode='22023', message='Employee workload capacity would be exceeded; reduce task workload or reassign work.';
    end if;
    v_task_result:=public.minglora_ai_task_command('create_task',v_owner,jsonb_build_object(
      'identity_id',v_identity_id,'organization_id',p_organization_id,
      'task_title',v_title,'task_type',v_task_type,'action_class',v_action_class,
      'task_payload',coalesce(v_payload->'task_payload','{}'::jsonb),
      'priority',v_priority,'max_attempts',v_max_attempts,'token_budget',v_token_budget,
      'cost_limit_usd',v_cost_limit,'scheduled_for',v_scheduled_for,
      'idempotency_key',md5('minglora_workforce:'||v_idempotency_key)
    ));
    v_task_id:=nullif(v_task_result->'task'->>'task_id','')::uuid;
    if v_task_id is null then raise exception using errcode='22023', message='The durable task queue did not return a task identifier.'; end if;
    -- Never attach a workforce assignment to an already-running or previously
    -- completed task. Workforce task keys are separately namespaced above.
    v_status:=coalesce(v_task_result->'task'->>'status','');
    if v_status not in ('queued','pending_approval') then
      raise exception using errcode='42501',
        message='The durable task is not in a state eligible for a new workforce assignment.';
    end if;
    -- Workforce allocations always require a separate human approval.
    update ai_network.ai_task_queue q
    set requires_approval=true,
        status=case when q.status='queued' then 'pending_approval' else q.status end,
        approved_by_user_id=null,approved_at=null
    where q.owner_user_id=v_owner and q.task_id=v_task_id
      and q.status in ('queued','pending_approval');
    if v_status='queued' then
      insert into ai_network.ai_task_events(
        owner_user_id,task_id,actor_type,actor_user_id,event_type,
        previous_status,new_status,reason,metadata
      ) values (
        v_owner,v_task_id,'human_user',v_owner,'workforce_human_approval_required',
        'queued','pending_approval',
        'Workforce allocation requires separate human approval before any worker can claim the task.',
        jsonb_build_object('workforce_assignment',true,'permission_grant_id',v_permission_id)
      );
    end if;
    insert into ai_network.ai_task_approvals(owner_user_id,task_id,approval_status)
    select v_owner,v_task_id,'requested'
    where exists(select 1 from ai_network.ai_task_queue q
      where q.task_id=v_task_id and q.owner_user_id=v_owner and q.status='pending_approval')
    on conflict(task_id) do nothing;
    v_workload:=coalesce(nullif(v_payload->>'workload_units','')::integer,10);
    insert into ai_network.ai_employee_task_assignments(
      owner_user_id,organization_id,employment_id,task_id,permission_grant_id,team_id,
      workload_units,idempotency_key,assigned_by_user_id
    ) values (
      v_owner,p_organization_id,v_employment_id,v_task_id,v_permission_id,v_team_id,
      v_workload,v_idempotency_key,v_owner
    );
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,actor_type,actor_user_id,employment_id,team_id,task_id,event_type,reason,metadata
    ) values (
      v_owner,p_organization_id,'human_user',v_owner,v_employment_id,v_team_id,v_task_id,'task_assigned',
      'Task assigned by an authorized administrator under an explicit employee permission grant.',
      jsonb_build_object('permission_grant_id',v_permission_id,'task_type',v_task_type,
        'action_class',v_action_class,'workload_units',v_workload,'human_approval_required',true)
    );
    select jsonb_build_object('task',to_jsonb(q),'assignment',to_jsonb(a),'reused',false)
      into v_result from ai_network.ai_employee_task_assignments a
      join ai_network.ai_task_queue q on q.owner_user_id=a.owner_user_id and q.task_id=a.task_id
      where a.owner_user_id=v_owner and a.task_id=v_task_id;
    return v_result;
  end if;

  if v_action='send_team_message' then
    v_team_id:=nullif(v_payload->>'team_id','')::uuid;
    v_identity_id:=nullif(v_payload->>'author_identity_id','')::uuid;
    v_message_type:=lower(coalesce(v_payload->>'message_type','discussion'));
    v_body:=trim(coalesce(v_payload->>'body',''));
    v_idempotency_key:=trim(coalesce(v_payload->>'idempotency_key',''));
    if v_team_id is null or v_message_type not in ('announcement','manager_instruction','discussion','task_update','status_report')
       or length(v_body)<1 or length(v_body)>4000 or v_idempotency_key !~ '^.{8,160}$' then
      raise exception using errcode='22023', message='A team, supported message type, message body and idempotency key are required.';
    end if;
    if v_body ~* '(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)[[:space:]]*[:=]' then
      raise exception using errcode='22023', message='Credentials and secrets cannot be sent in workforce messages.';
    end if;
    if not exists(select 1 from ai_network.ai_teams t
      where t.owner_user_id=v_owner and t.team_id=v_team_id
        and t.organization_id=p_organization_id and t.status='active') then
      raise exception using errcode='42501', message='Team is not active in this organization.';
    end if;
    if v_identity_id is not null then
      if v_message_type not in ('discussion','task_update','status_report') then
        raise exception using errcode='42501', message='AI employees cannot send management announcements or instructions.';
      end if;
      select e.employment_id into v_employment_id
      from ai_network.ai_employment_records e
      join ai_network.ai_identities i on i.identity_id=e.identity_id
      join ai_network.ai_team_memberships m on m.identity_id=i.identity_id
      where e.organization_id=p_organization_id and e.employment_status='active'
        and i.identity_id=v_identity_id and i.owner_user_id=v_owner and i.status='active' and i.enabled=true
        and m.owner_user_id=v_owner and m.team_id=v_team_id and m.membership_status='active'
      order by e.created_at desc limit 1;
      if v_employment_id is null or not exists(
        select 1 from ai_network.ai_employee_permission_grants g
        where g.owner_user_id=v_owner and g.organization_id=p_organization_id
          and g.employment_id=v_employment_id and g.permission_key='team.message' and g.revoked_at is null
      ) then
        raise exception using errcode='42501', message='AI employee must be active, be an active team member and hold an explicit team.message permission.';
      end if;
    end if;
    if nullif(v_payload->>'reply_to_message_id','') is not null and not exists(
      select 1 from ai_network.ai_team_messages m
      where m.owner_user_id=v_owner and m.message_id=(v_payload->>'reply_to_message_id')::uuid
        and m.team_id=v_team_id and m.message_status='visible'
    ) then raise exception using errcode='22023', message='Reply target must be a visible message in the same team.'; end if;
    select m.message_id into v_message_id from ai_network.ai_team_messages m
    where m.owner_user_id=v_owner and m.idempotency_key=v_idempotency_key;
    if v_message_id is not null then
      if not exists(select 1 from ai_network.ai_team_messages m
        where m.message_id=v_message_id and m.team_id=v_team_id and m.body=v_body
          and m.author_identity_id is not distinct from v_identity_id and m.message_type=v_message_type) then
        raise exception using errcode='23505', message='Message idempotency key was reused for different content.';
      end if;
      return jsonb_build_object('message_id',v_message_id,'reused',true);
    end if;
    insert into ai_network.ai_team_messages(
      owner_user_id,organization_id,team_id,author_type,author_user_id,
      author_identity_id,author_employment_id,message_type,body,reply_to_message_id,idempotency_key
    ) values (
      v_owner,p_organization_id,v_team_id,
      case when v_identity_id is null then 'human_user' else 'ai_identity' end,
      case when v_identity_id is null then v_owner else null end,
      v_identity_id,v_employment_id,v_message_type,v_body,
      nullif(v_payload->>'reply_to_message_id','')::uuid,v_idempotency_key
    ) returning message_id into v_message_id;
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,actor_type,actor_user_id,actor_identity_id,
      employment_id,team_id,message_id,event_type,reason,metadata
    ) values (
      v_owner,p_organization_id,
      case when v_identity_id is null then 'human_user' else 'ai_identity' end,
      case when v_identity_id is null then v_owner else null end,
      v_identity_id,v_employment_id,v_team_id,v_message_id,'team_message_sent',
      'Team message recorded under workforce membership and permission rules.',
      jsonb_build_object('message_type',v_message_type)
    );
    return jsonb_build_object('message_id',v_message_id,'reused',false);
  end if;

  if v_action='submit_employee_report' then
    v_employment_id:=nullif(v_payload->>'employment_id','')::uuid;
    v_identity_id:=nullif(v_payload->>'identity_id','')::uuid;
    v_team_id:=nullif(v_payload->>'team_id','')::uuid;
    v_task_id:=nullif(v_payload->>'task_id','')::uuid;
    v_report_type:=lower(coalesce(v_payload->>'report_type','daily'));
    v_title:=left(trim(coalesce(v_payload->>'report_title','')),180);
    v_body:=trim(coalesce(v_payload->>'report_body',''));
    v_idempotency_key:=trim(coalesce(v_payload->>'idempotency_key',''));
    if v_employment_id is null
       or v_report_type not in ('daily','weekly','task','exception','incident')
       or length(v_title)<3 or length(v_body)<1 or length(v_body)>8000
       or v_idempotency_key !~ '^.{8,160}$' then
      raise exception using errcode='22023', message='A valid employee, report type, title, report body and idempotency key are required.';
    end if;
    select * into v_employee from ai_network.ai_employment_records e
    where e.organization_id=p_organization_id and e.employment_id=v_employment_id
      and e.employment_status='active';
    if not found then
      raise exception using errcode='42501', message='Only an active employee may submit a workforce report.';
    end if;
    if v_identity_id is not null and v_identity_id<>v_employee.identity_id then
      raise exception using errcode='42501', message='The report identity does not match the selected employee.';
    end if;
    v_identity_id:=v_employee.identity_id;
    if not exists(
      select 1 from ai_network.ai_identities i
      where i.identity_id=v_identity_id and i.owner_user_id=v_owner
        and i.status='active' and i.enabled=true
    ) or not exists(
      select 1 from ai_network.ai_employee_permission_grants g
      where g.owner_user_id=v_owner and g.organization_id=p_organization_id
        and g.employment_id=v_employment_id and g.permission_key='report.submit'
        and g.revoked_at is null
    ) then
      raise exception using errcode='42501', message='Employee must be active and hold an explicit report.submit permission.';
    end if;
    if v_team_id is not null and not exists(
      select 1 from ai_network.ai_team_memberships m
      join ai_network.ai_teams t on t.owner_user_id=m.owner_user_id and t.team_id=m.team_id
      where m.owner_user_id=v_owner and m.team_id=v_team_id and m.identity_id=v_identity_id
        and m.membership_status='active' and t.organization_id=p_organization_id and t.status='active'
    ) then
      raise exception using errcode='42501', message='Employee report team must be active and include the employee.';
    end if;
    if v_task_id is not null and not exists(
      select 1 from ai_network.ai_employee_task_assignments a
      where a.owner_user_id=v_owner and a.task_id=v_task_id
        and a.employment_id=v_employment_id and a.organization_id=p_organization_id
    ) then
      raise exception using errcode='42501', message='Report task must be assigned to this employee in the same organization.';
    end if;
    select r.report_id into v_report_id from ai_network.ai_employee_reports r
    where r.owner_user_id=v_owner and r.idempotency_key=v_idempotency_key;
    if v_report_id is not null then
      if not exists(select 1 from ai_network.ai_employee_reports r
        where r.owner_user_id=v_owner and r.report_id=v_report_id
          and r.employment_id=v_employment_id and r.report_type=v_report_type
          and r.report_title=v_title and r.report_body=v_body
          and r.team_id is not distinct from v_team_id
          and r.task_id is not distinct from v_task_id) then
        raise exception using errcode='23505', message='Report idempotency key was reused for different report details.';
      end if;
      return jsonb_build_object('report_id',v_report_id,'reused',true);
    end if;
    insert into ai_network.ai_employee_reports(
      owner_user_id,organization_id,employment_id,manager_employment_id,team_id,task_id,
      report_type,report_title,report_body,period_start,period_end,idempotency_key
    ) values (
      v_owner,p_organization_id,v_employment_id,v_employee.manager_employment_id,v_team_id,v_task_id,
      v_report_type,v_title,v_body,nullif(v_payload->>'period_start','')::date,
      nullif(v_payload->>'period_end','')::date,v_idempotency_key
    ) returning report_id into v_report_id;
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,actor_type,actor_identity_id,employment_id,team_id,task_id,report_id,event_type,reason
    ) values (
      v_owner,p_organization_id,'ai_identity',v_identity_id,v_employment_id,v_team_id,v_task_id,
      v_report_id,'employee_report_submitted','Employee report stored for the assigned reporting manager.'
    );
    return jsonb_build_object('report_id',v_report_id,'reused',false);
  end if;

  if v_action='review_employee_report' then
    v_report_id:=nullif(v_payload->>'report_id','')::uuid;
    v_status:=lower(coalesce(v_payload->>'status',''));
    v_reason:=left(trim(coalesce(v_payload->>'reason','')),1000);
    if v_report_id is null or v_status not in ('acknowledged','needs_follow_up') or length(v_reason)<3 then
      raise exception using errcode='22023', message='A report, valid review status and review reason are required.';
    end if;
    update ai_network.ai_employee_reports r
    set report_status=v_status,reviewed_by_user_id=v_owner,reviewed_at=now(),review_reason=v_reason
    where r.owner_user_id=v_owner and r.organization_id=p_organization_id
      and r.report_id=v_report_id and r.report_status='submitted'
    returning r.employment_id into v_employment_id;
    if not found then raise exception using errcode='P0002', message='Submitted employee report was not found.'; end if;
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,actor_type,actor_user_id,employment_id,report_id,event_type,reason
    ) values (
      v_owner,p_organization_id,'human_user',v_owner,v_employment_id,v_report_id,
      'employee_report_reviewed',v_reason
    );
    return jsonb_build_object('report_id',v_report_id,'status',v_status);
  end if;

  if v_action='list_team_messages' then
    v_team_id:=nullif(v_payload->>'team_id','')::uuid;
    if v_team_id is null or not exists(select 1 from ai_network.ai_teams t
      where t.owner_user_id=v_owner and t.team_id=v_team_id and t.organization_id=p_organization_id) then
      raise exception using errcode='P0002', message='Organization team was not found.';
    end if;
    return jsonb_build_object('messages',coalesce((
      select jsonb_agg(jsonb_build_object(
        'message',to_jsonb(m),
        'author_name',case when m.author_type='human_user' then coalesce(h.display_name,h.username,'Minglora administrator')
          else coalesce(n.display_name,n.full_name,n.username,'AI employee') end
      ) order by m.created_at desc)
      from (select * from ai_network.ai_team_messages x
        where x.owner_user_id=v_owner and x.team_id=v_team_id and x.message_status='visible'
        order by x.created_at desc limit 100) m
      left join public.profiles h on h.id=m.author_user_id
      left join ai_network.ai_names n on n.identity_id=m.author_identity_id
    ),'[]'::jsonb));
  end if;

  if v_action='list_team_activity' then
    v_team_id:=nullif(v_payload->>'team_id','')::uuid;
    if v_team_id is null or not exists(select 1 from ai_network.ai_teams t
      where t.owner_user_id=v_owner and t.team_id=v_team_id and t.organization_id=p_organization_id) then
      raise exception using errcode='P0002', message='Organization team was not found.';
    end if;
    return jsonb_build_object(
      'team_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at desc)
        from ai_network.ai_team_events e where e.owner_user_id=v_owner and e.team_id=v_team_id),'[]'::jsonb),
      'workforce_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at desc)
        from ai_network.ai_workforce_events e where e.owner_user_id=v_owner and e.team_id=v_team_id),'[]'::jsonb),
      'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc)
        from ai_network.ai_team_messages m where m.owner_user_id=v_owner and m.team_id=v_team_id),'[]'::jsonb)
    );
  end if;

  raise exception using errcode='22023', message='Unsupported Minglora AI workforce command.';
end;
$function$;
revoke all on function public.minglora_ai_workforce_command(text,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_workforce_command(text,uuid,uuid,jsonb) to service_role;
