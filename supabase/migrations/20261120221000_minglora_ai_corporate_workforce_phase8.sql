-- Minglora AI Corporate Workforce — Phase 8.
-- Adds explicit employee permission grants, workload-aware task assignments,
-- auditable team communication and structured employee reporting.
-- Existing HR, team, identity and durable-task foundations remain canonical.
-- All new records are private and accessible only through the server runtime.

create table if not exists ai_network.ai_employee_permission_grants (
  permission_grant_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete restrict,
  employment_id uuid not null,
  permission_key text not null check (permission_key in (
    'task.assign.read_only','task.assign.content','team.message',
    'report.submit','report.read','workload.read'
  )),
  allowed_task_types text[] not null default array[]::text[],
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  granted_by_user_id uuid not null references public.profiles(id) on delete restrict,
  revoked_by_user_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  foreign key (organization_id, employment_id)
    references ai_network.ai_employment_records(organization_id, employment_id) on delete restrict,
  unique (owner_user_id, permission_grant_id),
  unique (owner_user_id, idempotency_key),
  check (
    (permission_key in ('task.assign.read_only','task.assign.content')
      and cardinality(allowed_task_types) between 1 and 50
      and array_position(allowed_task_types, null) is null)
    or
    (permission_key not in ('task.assign.read_only','task.assign.content')
      and cardinality(allowed_task_types)=0)
  )
);
create unique index if not exists ai_employee_permission_active_key_uq
  on ai_network.ai_employee_permission_grants(owner_user_id, employment_id, permission_key)
  where revoked_at is null;
create index if not exists ai_employee_permission_org_employment_idx
  on ai_network.ai_employee_permission_grants(organization_id, employment_id, revoked_at);

create table if not exists ai_network.ai_employee_task_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete restrict,
  employment_id uuid not null,
  task_id uuid not null,
  permission_grant_id uuid not null,
  team_id uuid,
  workload_units integer not null default 10 check (workload_units between 1 and 100),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  assigned_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (organization_id, employment_id)
    references ai_network.ai_employment_records(organization_id, employment_id) on delete restrict,
  foreign key (owner_user_id, task_id)
    references ai_network.ai_task_queue(owner_user_id, task_id) on delete restrict,
  foreign key (owner_user_id, permission_grant_id)
    references ai_network.ai_employee_permission_grants(owner_user_id, permission_grant_id) on delete restrict,
  foreign key (owner_user_id, team_id)
    references ai_network.ai_teams(owner_user_id, team_id) on delete restrict,
  unique (owner_user_id, task_id),
  unique (owner_user_id, idempotency_key)
);
create index if not exists ai_employee_task_assignments_workload_idx
  on ai_network.ai_employee_task_assignments(owner_user_id, employment_id, created_at desc);
create index if not exists ai_employee_task_assignments_team_idx
  on ai_network.ai_employee_task_assignments(owner_user_id, team_id, created_at desc)
  where team_id is not null;

create table if not exists ai_network.ai_team_messages (
  message_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete restrict,
  team_id uuid not null,
  author_type text not null check (author_type in ('human_user','ai_identity')),
  author_user_id uuid references public.profiles(id) on delete restrict,
  author_identity_id uuid references ai_network.ai_identities(identity_id) on delete restrict,
  author_employment_id uuid,
  message_type text not null check (message_type in (
    'announcement','manager_instruction','discussion','task_update','status_report'
  )),
  body text not null check (length(trim(body)) between 1 and 4000),
  reply_to_message_id uuid,
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  message_status text not null default 'visible' check (message_status in ('visible','hidden')),
  created_at timestamptz not null default now(),
  foreign key (owner_user_id, team_id)
    references ai_network.ai_teams(owner_user_id, team_id) on delete restrict,
  foreign key (organization_id, author_employment_id)
    references ai_network.ai_employment_records(organization_id, employment_id) on delete restrict,
  foreign key (reply_to_message_id) references ai_network.ai_team_messages(message_id) on delete restrict,
  unique (owner_user_id, message_id),
  unique (owner_user_id, idempotency_key),
  check (
    (author_type='human_user' and author_user_id is not null
      and author_identity_id is null and author_employment_id is null)
    or
    (author_type='ai_identity' and author_user_id is null
      and author_identity_id is not null and author_employment_id is not null)
  )
);
create index if not exists ai_team_messages_team_recent_idx
  on ai_network.ai_team_messages(owner_user_id, team_id, created_at desc);

create table if not exists ai_network.ai_employee_reports (
  report_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete restrict,
  employment_id uuid not null,
  manager_employment_id uuid,
  team_id uuid,
  task_id uuid,
  report_type text not null check (report_type in ('daily','weekly','task','exception','incident')),
  report_title text not null check (length(trim(report_title)) between 3 and 180),
  report_body text not null check (length(trim(report_body)) between 1 and 8000),
  period_start date,
  period_end date,
  report_status text not null default 'submitted'
    check (report_status in ('submitted','acknowledged','needs_follow_up')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  submitted_at timestamptz not null default now(),
  reviewed_by_user_id uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text not null default '' check (length(review_reason)<=1000),
  foreign key (organization_id, employment_id)
    references ai_network.ai_employment_records(organization_id, employment_id) on delete restrict,
  foreign key (organization_id, manager_employment_id)
    references ai_network.ai_employment_records(organization_id, employment_id) on delete restrict,
  foreign key (owner_user_id, team_id)
    references ai_network.ai_teams(owner_user_id, team_id) on delete restrict,
  foreign key (owner_user_id, task_id)
    references ai_network.ai_task_queue(owner_user_id, task_id) on delete restrict,
  unique (owner_user_id, report_id),
  unique (owner_user_id, idempotency_key),
  check (period_end is null or period_start is null or period_end>=period_start)
);
create index if not exists ai_employee_reports_manager_recent_idx
  on ai_network.ai_employee_reports(owner_user_id, organization_id, manager_employment_id, submitted_at desc);
create index if not exists ai_employee_reports_org_status_recent_idx
  on ai_network.ai_employee_reports(owner_user_id, organization_id, report_status, submitted_at desc);

create table if not exists ai_network.ai_workforce_events (
  workforce_event_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete restrict,
  actor_type text not null check (actor_type in ('human_user','ai_identity','system')),
  actor_user_id uuid references public.profiles(id) on delete restrict,
  actor_identity_id uuid references ai_network.ai_identities(identity_id) on delete restrict,
  employment_id uuid,
  team_id uuid,
  task_id uuid,
  message_id uuid,
  report_id uuid,
  event_type text not null check (event_type in (
    'permission_granted','permission_revoked','task_assigned','task_cancelled',
    'team_message_sent','employee_report_submitted','employee_report_reviewed'
  )),
  reason text not null default '' check (length(reason)<=1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now(),
  foreign key (organization_id, employment_id)
    references ai_network.ai_employment_records(organization_id, employment_id) on delete restrict,
  foreign key (owner_user_id, team_id)
    references ai_network.ai_teams(owner_user_id, team_id) on delete restrict,
  foreign key (owner_user_id, task_id)
    references ai_network.ai_task_queue(owner_user_id, task_id) on delete restrict,
  foreign key (owner_user_id, message_id)
    references ai_network.ai_team_messages(owner_user_id, message_id) on delete restrict,
  foreign key (owner_user_id, report_id)
    references ai_network.ai_employee_reports(owner_user_id, report_id) on delete restrict,
  check (
    (actor_type='human_user' and actor_user_id is not null and actor_identity_id is null)
    or (actor_type='ai_identity' and actor_identity_id is not null and actor_user_id is null)
    or (actor_type='system' and actor_user_id is null and actor_identity_id is null)
  )
);
create index if not exists ai_workforce_events_org_recent_idx
  on ai_network.ai_workforce_events(owner_user_id, organization_id, occurred_at desc);
create index if not exists ai_workforce_events_team_recent_idx
  on ai_network.ai_workforce_events(owner_user_id, team_id, occurred_at desc)
  where team_id is not null;

alter table ai_network.ai_employee_permission_grants enable row level security;
alter table ai_network.ai_employee_task_assignments enable row level security;
alter table ai_network.ai_team_messages enable row level security;
alter table ai_network.ai_employee_reports enable row level security;
alter table ai_network.ai_workforce_events enable row level security;

revoke all on ai_network.ai_employee_permission_grants,
  ai_network.ai_employee_task_assignments, ai_network.ai_team_messages,
  ai_network.ai_employee_reports, ai_network.ai_workforce_events
  from public, anon, authenticated;
grant select, insert, update on ai_network.ai_employee_permission_grants,
  ai_network.ai_employee_reports to service_role;
grant select, insert on ai_network.ai_employee_task_assignments,
  ai_network.ai_team_messages, ai_network.ai_workforce_events to service_role;
grant usage on schema ai_network to service_role;

-- Invalidating an employee, team membership, team, or permission grant also
-- cancels all uncompleted workforce assignments and clears active worker leases.
create or replace function ai_network.cancel_workforce_assignments(
  p_employment_id uuid default null,
  p_team_id uuid default null,
  p_permission_grant_id uuid default null,
  p_reason text default 'Workforce authority is no longer active.'
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_count integer := 0;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501', message='Workforce task invalidation is restricted to the Minglora server runtime.';
  end if;
  if p_employment_id is null and p_team_id is null and p_permission_grant_id is null then
    raise exception using errcode='22023', message='A workforce assignment scope is required.';
  end if;

  with changed as (
    update ai_network.ai_task_queue q
    set status='cancelled', worker_id=null, lease_token=null, lease_expires_at=null,
        finished_at=now(), updated_at=now(),
        failure_reason=left(coalesce(nullif(trim(p_reason),''),'Workforce authority is no longer active.'),1000)
    from ai_network.ai_employee_task_assignments a
    where a.owner_user_id=q.owner_user_id and a.task_id=q.task_id
      and (p_employment_id is null or a.employment_id=p_employment_id)
      and (p_team_id is null or a.team_id=p_team_id)
      and (p_permission_grant_id is null or a.permission_grant_id=p_permission_grant_id)
      and q.status in ('pending_approval','queued','running')
    returning q.owner_user_id,q.task_id,a.organization_id,a.employment_id,a.team_id
  )
  insert into ai_network.ai_task_events(
    owner_user_id,task_id,actor_type,event_type,previous_status,new_status,reason
  )
  select c.owner_user_id,c.task_id,'system','workforce_authority_revoked','running','cancelled',
    left(coalesce(nullif(trim(p_reason),''),'Workforce authority is no longer active.'),1000)
  from changed c;

  get diagnostics v_count = row_count;

  update ai_network.ai_task_approvals ap
  set approval_status='cancelled', reviewed_at=now(),
      review_reason=left(coalesce(nullif(trim(p_reason),''),'Workforce authority is no longer active.'),1000)
  where ap.approval_status='requested'
    and exists (
      select 1 from ai_network.ai_employee_task_assignments a
      join ai_network.ai_task_queue q on q.owner_user_id=a.owner_user_id and q.task_id=a.task_id
      where a.owner_user_id=ap.owner_user_id and a.task_id=ap.task_id
        and q.status='cancelled'
        and (p_employment_id is null or a.employment_id=p_employment_id)
        and (p_team_id is null or a.team_id=p_team_id)
        and (p_permission_grant_id is null or a.permission_grant_id=p_permission_grant_id)
    );
  return v_count;
end;
$function$;

create or replace function ai_network.cancel_workforce_assignments_on_employment_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.employment_status is distinct from old.employment_status
     and new.employment_status <> 'active' then
    perform ai_network.cancel_workforce_assignments(
      new.employment_id,null,null,
      'Employee status changed to '||new.employment_status||'; outstanding workforce tasks were cancelled.'
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists ai_workforce_employment_status_cancel on ai_network.ai_employment_records;
create trigger ai_workforce_employment_status_cancel
after update of employment_status on ai_network.ai_employment_records
for each row execute function ai_network.cancel_workforce_assignments_on_employment_change();

create or replace function ai_network.cancel_workforce_assignments_on_membership_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_employment_id uuid;
  v_org_id uuid;
begin
  if new.membership_status is distinct from old.membership_status
     and new.membership_status <> 'active' then
    select t.organization_id into v_org_id
    from ai_network.ai_teams t
    where t.team_id=new.team_id and t.owner_user_id=new.owner_user_id;
    if v_org_id is not null then
      select e.employment_id into v_employment_id
      from ai_network.ai_employment_records e
      where e.organization_id=v_org_id and e.identity_id=new.identity_id
        and e.employment_status='active'
      order by e.created_at desc limit 1;
      if v_employment_id is not null then
        perform ai_network.cancel_workforce_assignments(
          v_employment_id,new.team_id,null,
          'Employee team membership is no longer active; outstanding team assignments were cancelled.'
        );
      end if;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists ai_workforce_membership_cancel on ai_network.ai_team_memberships;
create trigger ai_workforce_membership_cancel
after update of membership_status on ai_network.ai_team_memberships
for each row execute function ai_network.cancel_workforce_assignments_on_membership_change();

create or replace function ai_network.cancel_workforce_assignments_on_team_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.status is distinct from old.status and new.status <> 'active' then
    perform ai_network.cancel_workforce_assignments(
      null,new.team_id,null,
      'Team status changed to '||new.status||'; outstanding team assignments were cancelled.'
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists ai_workforce_team_status_cancel on ai_network.ai_teams;
create trigger ai_workforce_team_status_cancel
after update of status on ai_network.ai_teams
for each row execute function ai_network.cancel_workforce_assignments_on_team_change();

create or replace function ai_network.enforce_workforce_task_authority()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.status='running' and old.status is distinct from new.status
     and exists (
       select 1 from ai_network.ai_employee_task_assignments a
       where a.owner_user_id=new.owner_user_id and a.task_id=new.task_id
     ) then
    if not exists (
      select 1
      from ai_network.ai_employee_task_assignments a
      join ai_network.ai_employment_records e
        on e.organization_id=a.organization_id and e.employment_id=a.employment_id
      join ai_network.ai_identities i on i.identity_id=e.identity_id
      join ai_network.ai_employee_permission_grants g
        on g.owner_user_id=a.owner_user_id and g.permission_grant_id=a.permission_grant_id
      join ai_network.ai_positions p
        on p.organization_id=e.organization_id and p.position_id=e.position_id
      where a.owner_user_id=new.owner_user_id and a.task_id=new.task_id
        and e.employment_status='active'
        and i.owner_user_id=new.owner_user_id and i.status='active' and i.enabled=true
        and p.status='active'
        and g.revoked_at is null
        and g.permission_key=case new.action_class
          when 'read_only' then 'task.assign.read_only'
          when 'content' then 'task.assign.content'
          else 'not_granted'
        end
        and new.task_type=any(g.allowed_task_types)
        and (
          a.team_id is null or exists (
            select 1 from ai_network.ai_teams t
            join ai_network.ai_team_memberships m
              on m.owner_user_id=t.owner_user_id and m.team_id=t.team_id
            where t.owner_user_id=a.owner_user_id and t.team_id=a.team_id
              and t.status='active' and m.identity_id=i.identity_id
              and m.membership_status='active'
          )
        )
    ) then
      raise exception using errcode='42501',
        message='Workforce task execution is blocked because employee status, team membership, identity state or explicit task permission is no longer valid.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists ai_workforce_task_authority_guard on ai_network.ai_task_queue;
create trigger ai_workforce_task_authority_guard
before update of status on ai_network.ai_task_queue
for each row execute function ai_network.enforce_workforce_task_authority();

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
      'idempotency_key',v_idempotency_key
    ));
    v_task_id:=nullif(v_task_result->'task'->>'task_id','')::uuid;
    if v_task_id is null then raise exception using errcode='22023', message='The durable task queue did not return a task identifier.'; end if;
    -- Workforce allocations always receive a separate human approval, even if
    -- the identity's general supervision mode would otherwise enqueue directly.
    update ai_network.ai_task_queue q
    set requires_approval=true,status=case when q.status='queued' then 'pending_approval' else q.status end
    where q.owner_user_id=v_owner and q.task_id=v_task_id
      and q.status in ('queued','pending_approval');
    insert into ai_network.ai_task_approvals(owner_user_id,task_id,approval_status)
    select v_owner,v_task_id,'requested'
    where exists(select 1 from ai_network.ai_task_queue q where q.task_id=v_task_id and q.status='pending_approval')
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
    if v_employment_id is null or v_identity_id is null
       or v_report_type not in ('daily','weekly','task','exception','incident')
       or length(v_title)<3 or length(v_body)<1 or length(v_body)>8000
       or v_idempotency_key !~ '^.{8,160}$' then
      raise exception using errcode='22023', message='A valid employee, report type, title, report body and idempotency key are required.';
    end if;
    select * into v_employee from ai_network.ai_employment_records e
    where e.organization_id=p_organization_id and e.employment_id=v_employment_id
      and e.identity_id=v_identity_id and e.employment_status='active';
    if not found or not exists(
      select 1 from ai_network.ai_identities i
      where i.identity_id=v_identity_id and i.owner_user_id=v_owner and i.status='active' and i.enabled=true
    ) or not exists(
      select 1 from ai_network.ai_employee_permission_grants g
      where g.owner_user_id=v_owner and g.organization_id=p_organization_id
        and g.employment_id=v_employment_id and g.permission_key='report.submit' and g.revoked_at is null
    ) then
      raise exception using errcode='42501', message='Employee must be active and hold an explicit report.submit permission.';
    end if;
    if v_team_id is not null and not exists(
      select 1 from ai_network.ai_team_memberships m
      join ai_network.ai_teams t on t.owner_user_id=m.owner_user_id and t.team_id=m.team_id
      where m.owner_user_id=v_owner and m.team_id=v_team_id and m.identity_id=v_identity_id
        and m.membership_status='active' and t.organization_id=p_organization_id and t.status='active'
    ) then raise exception using errcode='42501', message='Employee report team must be active and include the employee.'; end if;
    if v_task_id is not null and not exists(
      select 1 from ai_network.ai_employee_task_assignments a
      join ai_network.ai_task_queue q on q.owner_user_id=a.owner_user_id and q.task_id=a.task_id
      where a.owner_user_id=v_owner and a.task_id=v_task_id and a.employment_id=v_employment_id
        and a.organization_id=p_organization_id
    ) then raise exception using errcode='42501', message='Report task must be assigned to this employee in the same organization.'; end if;
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
revoke all on function ai_network.cancel_workforce_assignments(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function ai_network.cancel_workforce_assignments(uuid,uuid,uuid,text) to service_role;
revoke all on function ai_network.cancel_workforce_assignments_on_employment_change() from public, anon, authenticated;
revoke all on function ai_network.cancel_workforce_assignments_on_membership_change() from public, anon, authenticated;
revoke all on function ai_network.cancel_workforce_assignments_on_team_change() from public, anon, authenticated;
revoke all on function ai_network.enforce_workforce_task_authority() from public, anon, authenticated;
grant execute on function ai_network.cancel_workforce_assignments_on_employment_change() to service_role;
grant execute on function ai_network.cancel_workforce_assignments_on_membership_change() to service_role;
grant execute on function ai_network.cancel_workforce_assignments_on_team_change() to service_role;
grant execute on function ai_network.enforce_workforce_task_authority() to service_role;

comment on table ai_network.ai_employee_permission_grants is
  'Explicit, owner-scoped least-privilege grants for AI employees; absence of a grant means denied.';
comment on table ai_network.ai_employee_task_assignments is
  'Links durable approved tasks to an active employment record and reserves a bounded workload allocation.';
comment on table ai_network.ai_team_messages is
  'Private, auditable workforce communication; AI-authored messages require active membership and an explicit grant.';
comment on table ai_network.ai_employee_reports is
  'Employee-authored structured reports routed to the assigned reporting manager.';
comment on table ai_network.ai_workforce_events is
  'Append-only audit ledger for employee permissions, assignments, communication and reports.';
comment on function public.minglora_ai_workforce_command(text,uuid,uuid,jsonb) is
  'Owner-scoped corporate workforce commands. Called only by the authenticated Minglora server runtime; all AI work remains human approval gated.';
