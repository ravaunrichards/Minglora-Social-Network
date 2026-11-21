-- Minglora AI Network: corporate workforce permissions, task allocation and collaboration.
-- Additive only. Uses existing AI identities, employment, departments, positions, teams and task queue.
-- Every AI-originated operation is permission-grant, membership and workload checked.
-- Task execution remains gated by the existing global pause and worker-authentication boundary.

alter table ai_network.ai_teams
  add column if not exists department_id uuid,
  add column if not exists team_kind text not null default 'operational';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='ai_teams_department_scope_fk'
      and conrelid='ai_network.ai_teams'::regclass
  ) then
    alter table ai_network.ai_teams
      add constraint ai_teams_department_scope_fk
      foreign key (organization_id,department_id)
      references ai_network.ai_departments(organization_id,department_id)
      on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='ai_teams_department_requires_organization_ck'
      and conrelid='ai_network.ai_teams'::regclass
  ) then
    alter table ai_network.ai_teams
      add constraint ai_teams_department_requires_organization_ck
      check (department_id is null or organization_id is not null);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='ai_teams_team_kind_ck'
      and conrelid='ai_network.ai_teams'::regclass
  ) then
    alter table ai_network.ai_teams
      add constraint ai_teams_team_kind_ck
      check (team_kind in ('operational','management','specialized','project'));
  end if;
end
$$;

create index if not exists ai_teams_org_department_kind_idx
  on ai_network.ai_teams(organization_id,department_id,team_kind,status);

create table if not exists ai_network.ai_employee_permission_grants (
  permission_grant_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete cascade,
  employment_id uuid not null,
  permission_key text not null check (permission_key in (
    'task.assign.read_only','task.assign.content','team.message',
    'report.submit','report.read','workload.read'
  )),
  allowed_task_types text[] not null default '{}'::text[] check (
    cardinality(allowed_task_types) <= 50
    and array_position(allowed_task_types,null) is null
    and (
      permission_key in ('task.assign.read_only','task.assign.content')
      or cardinality(allowed_task_types)=0
    )
  ),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  granted_by_user_id uuid not null references public.profiles(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.profiles(id) on delete restrict,
  revocation_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id,permission_grant_id),
  unique (owner_user_id,idempotency_key),
  foreign key (organization_id,employment_id)
    references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  check (
    (revoked_at is null and revoked_by_user_id is null and revocation_reason='')
    or
    (revoked_at is not null and revoked_by_user_id is not null and length(trim(revocation_reason))>=3)
  )
);
create unique index if not exists ai_employee_permission_one_active_key_idx
  on ai_network.ai_employee_permission_grants(employment_id,permission_key)
  where revoked_at is null;
create index if not exists ai_employee_permission_owner_org_idx
  on ai_network.ai_employee_permission_grants(owner_user_id,organization_id,created_at desc);
create index if not exists ai_employee_permission_employment_idx
  on ai_network.ai_employee_permission_grants(organization_id,employment_id,revoked_at,permission_key);
create index if not exists ai_employee_permission_granted_by_idx
  on ai_network.ai_employee_permission_grants(granted_by_user_id);
create index if not exists ai_employee_permission_revoked_by_idx
  on ai_network.ai_employee_permission_grants(revoked_by_user_id)
  where revoked_by_user_id is not null;

create table if not exists ai_network.ai_workforce_task_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete cascade,
  task_id uuid not null,
  employment_id uuid not null,
  team_id uuid,
  workload_units integer not null check (workload_units between 1 and 100),
  assignment_status text not null default 'active' check (assignment_status in ('active','released')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  assigned_by_user_id uuid not null references public.profiles(id) on delete restrict,
  released_at timestamptz,
  release_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id,assignment_id),
  unique (owner_user_id,task_id),
  unique (owner_user_id,idempotency_key),
  foreign key (owner_user_id,task_id)
    references ai_network.ai_task_queue(owner_user_id,task_id) on delete restrict,
  foreign key (organization_id,employment_id)
    references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  foreign key (owner_user_id,team_id)
    references ai_network.ai_teams(owner_user_id,team_id) on delete restrict,
  check (
    (assignment_status='active' and released_at is null and release_reason='')
    or
    (assignment_status='released' and released_at is not null and length(trim(release_reason))>=3)
  )
);
create index if not exists ai_workforce_assignments_org_employment_idx
  on ai_network.ai_workforce_task_assignments(organization_id,employment_id,assignment_status,created_at desc);
create index if not exists ai_workforce_assignments_owner_team_idx
  on ai_network.ai_workforce_task_assignments(owner_user_id,team_id,assignment_status)
  where team_id is not null;
create index if not exists ai_workforce_assignments_owner_created_idx
  on ai_network.ai_workforce_task_assignments(owner_user_id,created_at desc);

create table if not exists ai_network.ai_team_messages (
  message_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete cascade,
  team_id uuid not null,
  sender_user_id uuid references public.profiles(id) on delete restrict,
  sender_employment_id uuid,
  sender_identity_id uuid references ai_network.ai_identities(identity_id) on delete restrict,
  message_type text not null check (message_type in (
    'announcement','manager_instruction','discussion','task_update','status_report'
  )),
  body text not null check (length(trim(body)) between 1 and 4000 and octet_length(body)<=16000),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  created_at timestamptz not null default now(),
  unique (owner_user_id,message_id),
  unique (owner_user_id,team_id,idempotency_key),
  foreign key (owner_user_id,team_id)
    references ai_network.ai_teams(owner_user_id,team_id) on delete restrict,
  foreign key (organization_id,sender_employment_id)
    references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  check (
    (sender_user_id is not null and sender_employment_id is null and sender_identity_id is null)
    or
    (sender_user_id is null and sender_employment_id is not null and sender_identity_id is not null)
  )
);
create index if not exists ai_team_messages_org_team_time_idx
  on ai_network.ai_team_messages(organization_id,team_id,created_at desc);
create index if not exists ai_team_messages_owner_team_time_idx
  on ai_network.ai_team_messages(owner_user_id,team_id,created_at desc);
create index if not exists ai_team_messages_sender_user_idx
  on ai_network.ai_team_messages(sender_user_id)
  where sender_user_id is not null;
create index if not exists ai_team_messages_sender_identity_idx
  on ai_network.ai_team_messages(sender_identity_id)
  where sender_identity_id is not null;
create index if not exists ai_team_messages_sender_employment_idx
  on ai_network.ai_team_messages(organization_id,sender_employment_id,created_at desc);

create table if not exists ai_network.ai_employee_reports (
  report_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete cascade,
  employment_id uuid not null,
  team_id uuid,
  task_id uuid,
  report_type text not null check (report_type in ('daily','weekly','task','exception','incident')),
  report_title text not null check (length(trim(report_title)) between 3 and 180),
  report_body text not null check (length(trim(report_body)) between 1 and 8000 and octet_length(report_body)<=32000),
  period_start date,
  period_end date,
  report_status text not null default 'submitted'
    check (report_status in ('submitted','acknowledged','needs_follow_up')),
  submitted_at timestamptz not null default now(),
  reviewed_by_user_id uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text not null default '',
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id,report_id),
  unique (owner_user_id,idempotency_key),
  foreign key (organization_id,employment_id)
    references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  foreign key (owner_user_id,team_id)
    references ai_network.ai_teams(owner_user_id,team_id) on delete restrict,
  foreign key (owner_user_id,task_id)
    references ai_network.ai_task_queue(owner_user_id,task_id) on delete restrict,
  check (period_end is null or period_start is null or period_end>=period_start),
  check (
    (report_status='submitted' and reviewed_by_user_id is null and reviewed_at is null and review_reason='')
    or
    (report_status in ('acknowledged','needs_follow_up')
      and reviewed_by_user_id is not null and reviewed_at is not null
      and length(trim(review_reason))>=3)
  )
);
create index if not exists ai_employee_reports_org_status_idx
  on ai_network.ai_employee_reports(organization_id,report_status,submitted_at desc);
create index if not exists ai_employee_reports_employment_time_idx
  on ai_network.ai_employee_reports(organization_id,employment_id,submitted_at desc);
create index if not exists ai_employee_reports_team_time_idx
  on ai_network.ai_employee_reports(owner_user_id,team_id,submitted_at desc)
  where team_id is not null;
create index if not exists ai_employee_reports_owner_task_idx
  on ai_network.ai_employee_reports(owner_user_id,task_id)
  where task_id is not null;
create index if not exists ai_employee_reports_reviewer_idx
  on ai_network.ai_employee_reports(reviewed_by_user_id)
  where reviewed_by_user_id is not null;

create table if not exists ai_network.ai_workforce_events (
  workforce_event_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete cascade,
  event_type text not null check (event_type in (
    'employee_permission_granted','employee_permission_revoked','position_status_changed',
    'team_scope_changed','employee_task_assigned','team_message_sent',
    'employee_report_submitted','employee_report_reviewed'
  )),
  actor_type text not null check (actor_type in ('human_user','ai_employee','system')),
  actor_user_id uuid references public.profiles(id) on delete restrict,
  actor_employment_id uuid,
  actor_identity_id uuid references ai_network.ai_identities(identity_id) on delete restrict,
  employment_id uuid,
  team_id uuid,
  task_id uuid,
  report_id uuid,
  reason text not null default '' check (length(reason)<=1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=8000),
  occurred_at timestamptz not null default now(),
  foreign key (organization_id,actor_employment_id)
    references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  foreign key (organization_id,employment_id)
    references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  foreign key (owner_user_id,team_id)
    references ai_network.ai_teams(owner_user_id,team_id) on delete restrict,
  foreign key (owner_user_id,task_id)
    references ai_network.ai_task_queue(owner_user_id,task_id) on delete restrict,
  foreign key (owner_user_id,report_id)
    references ai_network.ai_employee_reports(owner_user_id,report_id) on delete restrict,
  check (
    (actor_type='human_user' and actor_user_id is not null and actor_employment_id is null and actor_identity_id is null)
    or
    (actor_type='ai_employee' and actor_user_id is null and actor_employment_id is not null and actor_identity_id is not null)
    or
    (actor_type='system' and actor_user_id is null and actor_employment_id is null)
  )
);
create index if not exists ai_workforce_events_org_time_idx
  on ai_network.ai_workforce_events(organization_id,occurred_at desc);
create index if not exists ai_workforce_events_owner_time_idx
  on ai_network.ai_workforce_events(owner_user_id,occurred_at desc);
create index if not exists ai_workforce_events_actor_user_idx
  on ai_network.ai_workforce_events(actor_user_id)
  where actor_user_id is not null;
create index if not exists ai_workforce_events_actor_identity_idx
  on ai_network.ai_workforce_events(actor_identity_id)
  where actor_identity_id is not null;
create index if not exists ai_workforce_events_employment_time_idx
  on ai_network.ai_workforce_events(organization_id,employment_id,occurred_at desc);
create index if not exists ai_workforce_events_team_time_idx
  on ai_network.ai_workforce_events(owner_user_id,team_id,occurred_at desc)
  where team_id is not null;
create index if not exists ai_workforce_events_task_fk_idx
  on ai_network.ai_workforce_events(owner_user_id,task_id)
  where task_id is not null;
create index if not exists ai_workforce_events_report_fk_idx
  on ai_network.ai_workforce_events(owner_user_id,report_id)
  where report_id is not null;
create index if not exists ai_workforce_events_actor_employment_fk_idx
  on ai_network.ai_workforce_events(organization_id,actor_employment_id)
  where actor_employment_id is not null;

alter table ai_network.ai_employee_permission_grants enable row level security;
alter table ai_network.ai_workforce_task_assignments enable row level security;
alter table ai_network.ai_team_messages enable row level security;
alter table ai_network.ai_employee_reports enable row level security;
alter table ai_network.ai_workforce_events enable row level security;

revoke all on ai_network.ai_employee_permission_grants,ai_network.ai_workforce_task_assignments,
  ai_network.ai_team_messages,ai_network.ai_employee_reports,ai_network.ai_workforce_events
  from public,anon,authenticated;
grant select,insert,update on ai_network.ai_employee_permission_grants to service_role;
grant select,insert,update on ai_network.ai_workforce_task_assignments to service_role;
grant select,insert on ai_network.ai_team_messages to service_role;
grant select,insert,update on ai_network.ai_employee_reports to service_role;
grant select,insert on ai_network.ai_workforce_events to service_role;

create or replace function ai_network.reject_workforce_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path=''
as $function$
begin
  raise exception using errcode='42501',message='Workforce activity events are append-only.';
end;
$function$;
revoke all on function ai_network.reject_workforce_event_mutation() from public,anon,authenticated;
grant execute on function ai_network.reject_workforce_event_mutation() to service_role;
drop trigger if exists ai_workforce_events_append_only on ai_network.ai_workforce_events;
create trigger ai_workforce_events_append_only
before update or delete on ai_network.ai_workforce_events
for each row execute function ai_network.reject_workforce_event_mutation();

create or replace function public.minglora_ai_workforce_command(
  p_action text,
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_action text := lower(coalesce(p_action,''));
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_employment_id uuid;
  v_position_id uuid;
  v_team_id uuid;
  v_department_id uuid;
  v_task_id uuid;
  v_report_id uuid;
  v_permission_grant_id uuid;
  v_identity_id uuid;
  v_sender_identity_id uuid;
  v_actor_type text := 'human_user';
  v_permission_key text;
  v_status text;
  v_reason text;
  v_team_kind text;
  v_task_title text;
  v_task_type text;
  v_action_class text;
  v_idempotency_key text;
  v_task_payload jsonb;
  v_allowed_task_types text[];
  v_scheduled_for timestamptz;
  v_workload_units integer;
  v_capacity_units integer;
  v_assigned_units integer;
  v_open_tasks integer;
  v_priority integer;
  v_max_attempts integer;
  v_token_budget integer;
  v_cost_limit numeric(14,6);
  v_message_type text;
  v_message_body text;
  v_report_type text;
  v_report_title text;
  v_report_body text;
  v_period_start date;
  v_period_end date;
  v_team ai_network.ai_teams%rowtype;
  v_employee ai_network.ai_employment_records%rowtype;
  v_position ai_network.ai_positions%rowtype;
  v_identity ai_network.ai_identities%rowtype;
  v_task ai_network.ai_task_queue%rowtype;
  v_assignment ai_network.ai_workforce_task_assignments%rowtype;
  v_grant ai_network.ai_employee_permission_grants%rowtype;
  v_message ai_network.ai_team_messages%rowtype;
  v_report ai_network.ai_employee_reports%rowtype;
  v_result jsonb;
  v_rows jsonb;
begin
  if current_user<>'service_role' then
    raise exception using errcode='42501',message='AI workforce commands are restricted to the Minglora private server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode='42501',message='A valid signed-in Minglora administrator is required.';
  end if;
  if p_organization_id is null or not exists(
    select 1 from ai_network.ai_organizations o
    where o.organization_id=p_organization_id and o.owner_user_id=p_actor_user_id
      and o.status not in ('suspended','archived')
  ) then
    raise exception using errcode='42501',message='Organization is not owned or available to this Minglora administrator.';
  end if;
  if not exists(
    select 1 from public.minglora_platform_staff s
    where s.user_id=p_actor_user_id and s.active=true and s.role in ('owner','admin','moderator')
  ) then
    raise exception using errcode='42501',message='An active Minglora platform administrator is required for workforce supervision.';
  end if;
  if jsonb_typeof(v_payload)<>'object' then
    raise exception using errcode='22023',message='AI workforce command payload must be a JSON object.';
  end if;

  if v_action='list_workforce' then
    select coalesce(jsonb_agg(q.row_data order by q.created_at desc),'[]'::jsonb)
    into v_rows
    from (
      select jsonb_build_object(
        'employment',to_jsonb(e),
        'identity',jsonb_build_object('identity_id',i.identity_id,'display_name',n.display_name,'username',n.username,'status',i.status),
        'display_name',coalesce(nullif(n.display_name,''),nullif(n.username,''),'AI employee'),
        'department_name',d.display_name,
        'position_name',p.display_name,
        'manager_name',coalesce(nullif(mn.display_name,''),nullif(mn.username,''),''),
        'workload',jsonb_build_object(
          'capacity_units',e.workload_percentage,
          'assigned_units',coalesce((
            select sum(a.workload_units)::integer
            from ai_network.ai_workforce_task_assignments a
            join ai_network.ai_task_queue tq on tq.task_id=a.task_id and tq.owner_user_id=a.owner_user_id
            where a.organization_id=e.organization_id and a.employment_id=e.employment_id
              and a.assignment_status='active' and tq.status in ('pending_approval','queued','running')
          ),0),
          'open_tasks',(
            select count(*)::integer
            from ai_network.ai_workforce_task_assignments a
            join ai_network.ai_task_queue tq on tq.task_id=a.task_id and tq.owner_user_id=a.owner_user_id
            where a.organization_id=e.organization_id and a.employment_id=e.employment_id
              and a.assignment_status='active' and tq.status in ('pending_approval','queued','running')
          ),
          'utilization_percent',case when e.workload_percentage>0 then
            least(999,round(100.0*coalesce((
              select sum(a.workload_units)
              from ai_network.ai_workforce_task_assignments a
              join ai_network.ai_task_queue tq on tq.task_id=a.task_id and tq.owner_user_id=a.owner_user_id
              where a.organization_id=e.organization_id and a.employment_id=e.employment_id
                and a.assignment_status='active' and tq.status in ('pending_approval','queued','running')
            ),0)/e.workload_percentage)::integer) else 0 end
        ),
        'permissions',coalesce((
          select jsonb_agg(to_jsonb(g) order by g.created_at desc)
          from ai_network.ai_employee_permission_grants g
          where g.organization_id=e.organization_id and g.employment_id=e.employment_id
        ),'[]'::jsonb)
      ) as row_data,e.created_at
      from ai_network.ai_employment_records e
      join ai_network.ai_identities i on i.identity_id=e.identity_id
      left join ai_network.ai_names n on n.identity_id=i.identity_id
      join ai_network.ai_departments d on d.organization_id=e.organization_id and d.department_id=e.department_id
      join ai_network.ai_positions p on p.organization_id=e.organization_id and p.position_id=e.position_id
      left join ai_network.ai_employment_records me on me.organization_id=e.organization_id and me.employment_id=e.manager_employment_id
      left join ai_network.ai_names mn on mn.identity_id=me.identity_id
      where e.organization_id=p_organization_id
      order by e.created_at desc
      limit 200
    ) q;

    select coalesce(jsonb_agg(q.row_data order by q.created_at desc),'[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'team',to_jsonb(t),
        'members',coalesce((
          select jsonb_agg(jsonb_build_object(
            'identity_id',m.identity_id,'member_role',m.member_role,
            'membership_status',m.membership_status,
            'display_name',coalesce(nullif(n.display_name,''),nullif(n.username,''),'AI employee')
          ) order by case m.member_role when 'lead' then 0 when 'member' then 1 else 2 end,m.created_at)
          from ai_network.ai_team_memberships m
          left join ai_network.ai_names n on n.identity_id=m.identity_id
          where m.owner_user_id=t.owner_user_id and m.team_id=t.team_id and m.membership_status<>'removed'
        ),'[]'::jsonb)
      ) as row_data,t.created_at
      from ai_network.ai_teams t
      where t.owner_user_id=p_actor_user_id and t.organization_id=p_organization_id and t.status<>'archived'
      order by t.created_at desc limit 100
    ) q;
    v_payload:=jsonb_set(v_payload,'{_teams}',v_result,true);

    select coalesce(jsonb_agg(jsonb_build_object(
      'task',to_jsonb(tq),'assignment',to_jsonb(a),
      'employee_name',coalesce(nullif(n.display_name,''),nullif(n.username,''),'AI employee'),
      'team_name',coalesce(t.team_name,'')
    ) order by tq.created_at desc),'[]'::jsonb)
    into v_result
    from ai_network.ai_workforce_task_assignments a
    join ai_network.ai_task_queue tq on tq.task_id=a.task_id and tq.owner_user_id=a.owner_user_id
    join ai_network.ai_employment_records e on e.organization_id=a.organization_id and e.employment_id=a.employment_id
    join ai_network.ai_names n on n.identity_id=e.identity_id
    left join ai_network.ai_teams t on t.owner_user_id=a.owner_user_id and t.team_id=a.team_id
    where a.owner_user_id=p_actor_user_id and a.organization_id=p_organization_id;
    v_payload:=jsonb_set(v_payload,'{_tasks}',v_result,true);

    select coalesce(jsonb_agg(jsonb_build_object(
      'message',to_jsonb(m),
      'team_name',t.team_name,
      'author_name',coalesce(nullif(n.display_name,''),nullif(n.username,''),'Minglora administrator')
    ) order by m.created_at desc),'[]'::jsonb)
    into v_result
    from (
      select * from ai_network.ai_team_messages
      where owner_user_id=p_actor_user_id and organization_id=p_organization_id
      order by created_at desc limit 100
    ) m
    join ai_network.ai_teams t on t.owner_user_id=m.owner_user_id and t.team_id=m.team_id
    left join ai_network.ai_employment_records e on e.organization_id=m.organization_id and e.employment_id=m.sender_employment_id
    left join ai_network.ai_names n on n.identity_id=e.identity_id;
    v_payload:=jsonb_set(v_payload,'{_messages}',v_result,true);

    select coalesce(jsonb_agg(jsonb_build_object(
      'report',to_jsonb(r),
      'employee_name',coalesce(nullif(n.display_name,''),nullif(n.username,''),'AI employee'),
      'manager_name',coalesce(nullif(mn.display_name,''),nullif(mn.username,''),'')
    ) order by r.submitted_at desc),'[]'::jsonb)
    into v_result
    from ai_network.ai_employee_reports r
    join ai_network.ai_employment_records e on e.organization_id=r.organization_id and e.employment_id=r.employment_id
    join ai_network.ai_names n on n.identity_id=e.identity_id
    left join ai_network.ai_employment_records me on me.organization_id=e.organization_id and me.employment_id=e.manager_employment_id
    left join ai_network.ai_names mn on mn.identity_id=me.identity_id
    where r.organization_id=p_organization_id;
    v_payload:=jsonb_set(v_payload,'{_reports}',v_result,true);

    select coalesce(jsonb_agg(to_jsonb(p) order by p.hierarchy_level desc,p.display_name),'[]'::jsonb)
    into v_result from ai_network.ai_positions p where p.organization_id=p_organization_id;
    v_payload:=jsonb_set(v_payload,'{_job_roles}',v_result,true);

    select coalesce(jsonb_agg(to_jsonb(ev) order by ev.occurred_at desc),'[]'::jsonb)
    into v_result from (
      select * from ai_network.ai_workforce_events
      where owner_user_id=p_actor_user_id and organization_id=p_organization_id
      order by occurred_at desc limit 100
    ) ev;
    v_payload:=jsonb_set(v_payload,'{_workforce_events}',v_result,true);

    select coalesce(jsonb_agg(to_jsonb(ev) order by ev.occurred_at desc),'[]'::jsonb)
    into v_result from (
      select * from ai_network.ai_team_events
      where owner_user_id=p_actor_user_id
        and team_id in (select t.team_id from ai_network.ai_teams t
          where t.owner_user_id=p_actor_user_id and t.organization_id=p_organization_id)
      order by occurred_at desc limit 100
    ) ev;
    return jsonb_build_object(
      'employees',v_rows,
      'teams',v_payload->'_teams',
      'tasks',v_payload->'_tasks',
      'team_messages',v_payload->'_messages',
      'reports',v_payload->'_reports',
      'job_roles',v_payload->'_job_roles',
      'workforce_events',v_payload->'_workforce_events',
      'team_events',v_result
    );
  end if;

  if v_action='list_employee_permissions' then
    if coalesce(v_payload->>'employment_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid employment ID is required.';
    end if;
    v_employment_id:=(v_payload->>'employment_id')::uuid;
    if not exists(select 1 from ai_network.ai_employment_records e
      where e.organization_id=p_organization_id and e.employment_id=v_employment_id) then
      raise exception using errcode='P0002',message='Employee record not found in this organization.';
    end if;
    select coalesce(jsonb_agg(to_jsonb(g) order by g.created_at desc),'[]'::jsonb)
    into v_result from ai_network.ai_employee_permission_grants g
    where g.organization_id=p_organization_id and g.employment_id=v_employment_id;
    return jsonb_build_object('permissions',v_result);
  end if;

  if v_action='set_position_status' then
    if coalesce(v_payload->>'position_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid job role ID is required.';
    end if;
    v_position_id:=(v_payload->>'position_id')::uuid;
    v_status:=lower(coalesce(v_payload->>'status',''));
    v_reason:=left(trim(coalesce(v_payload->>'reason','')),1000);
    if v_status not in ('proposed','active','restricted','archived') or length(v_reason)<3 then
      raise exception using errcode='22023',message='Choose a supported job role status and provide a reason.';
    end if;
    select p.* into v_position from ai_network.ai_positions p
    where p.organization_id=p_organization_id and p.position_id=v_position_id for update;
    if not found then raise exception using errcode='P0002',message='Job role not found in this organization.'; end if;
    if v_status='archived' and exists(select 1 from ai_network.ai_employment_records e
      where e.organization_id=p_organization_id and e.position_id=v_position_id
        and e.employment_status in ('onboarding','active','restricted','suspended')) then
      raise exception using errcode='23514',message='A job role with current employees cannot be archived; restrict it instead.';
    end if;
    update ai_network.ai_positions p set status=v_status,updated_at=now()
    where p.organization_id=p_organization_id and p.position_id=v_position_id;
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,event_type,actor_type,actor_user_id,reason,metadata
    ) values (
      p_actor_user_id,p_organization_id,'position_status_changed','human_user',p_actor_user_id,v_reason,
      jsonb_build_object('position_id',v_position_id,'status',v_status)
    );
    select to_jsonb(p) into v_result from ai_network.ai_positions p
    where p.organization_id=p_organization_id and p.position_id=v_position_id;
    return jsonb_build_object('position',v_result);
  end if;

  if v_action='set_team_scope' then
    if coalesce(v_payload->>'team_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid AI team ID is required.';
    end if;
    v_team_id:=(v_payload->>'team_id')::uuid;
    v_department_id:=nullif(v_payload->>'department_id','')::uuid;
    v_team_kind:=lower(coalesce(nullif(v_payload->>'team_kind',''),'operational'));
    if v_team_kind not in ('operational','management','specialized','project') then
      raise exception using errcode='22023',message='Choose a supported organizational team type.';
    end if;
    select t.* into v_team from ai_network.ai_teams t
    where t.owner_user_id=p_actor_user_id and t.team_id=v_team_id
      and t.organization_id=p_organization_id and t.status<>'archived' for update;
    if not found then raise exception using errcode='P0002',message='Organizational team not found.';
    end if;
    if v_department_id is not null and not exists(select 1 from ai_network.ai_departments d
      where d.organization_id=p_organization_id and d.department_id=v_department_id and d.status='active') then
      raise exception using errcode='22023',message='Choose an active department in this organization.';
    end if;
    if v_department_id is not null and exists(
      select 1 from ai_network.ai_team_memberships m
      join ai_network.ai_employment_records e on e.organization_id=p_organization_id and e.identity_id=m.identity_id
      where m.owner_user_id=p_actor_user_id and m.team_id=v_team_id and m.membership_status='active'
        and e.employment_status in ('onboarding','active','restricted')
        and e.department_id<>v_department_id
    ) then
      raise exception using errcode='42501',message='Every active organizational team member must belong to the selected department.';
    end if;
    if v_team_kind='management' and (
      not exists(
        select 1 from ai_network.ai_team_memberships m
        join ai_network.ai_employment_records e on e.organization_id=p_organization_id and e.identity_id=m.identity_id
        join ai_network.ai_positions p on p.organization_id=e.organization_id and p.position_id=e.position_id
        where m.owner_user_id=p_actor_user_id and m.team_id=v_team_id
          and m.membership_status='active' and e.employment_status='active'
          and p.job_family in ('board','executive','director','manager','team_lead','supervisor')
      )
      or exists(
        select 1 from ai_network.ai_team_memberships m
        join ai_network.ai_employment_records e on e.organization_id=p_organization_id and e.identity_id=m.identity_id
        join ai_network.ai_positions p on p.organization_id=e.organization_id and p.position_id=e.position_id
        where m.owner_user_id=p_actor_user_id and m.team_id=v_team_id
          and m.membership_status='active' and e.employment_status='active'
          and p.job_family not in ('board','executive','director','manager','team_lead','supervisor')
      )
    ) then
      raise exception using errcode='42501',message='Management teams may include only active employees in management or supervisory job families.';
    end if;
    update ai_network.ai_teams t set department_id=v_department_id,team_kind=v_team_kind,updated_at=now()
    where t.owner_user_id=p_actor_user_id and t.team_id=v_team_id;
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,event_type,actor_type,actor_user_id,team_id,reason,metadata
    ) values (
      p_actor_user_id,p_organization_id,'team_scope_changed','human_user',p_actor_user_id,v_team_id,
      'Administrative team scope and unit type updated.',
      jsonb_build_object('department_id',v_department_id,'team_kind',v_team_kind)
    );
    select to_jsonb(t) into v_result from ai_network.ai_teams t
    where t.owner_user_id=p_actor_user_id and t.team_id=v_team_id;
    return jsonb_build_object('team',v_result);
  end if;

  if v_action='grant_employee_permission' then
    if coalesce(v_payload->>'employment_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid employment ID is required.';
    end if;
    v_employment_id:=(v_payload->>'employment_id')::uuid;
    v_permission_key:=lower(coalesce(v_payload->>'permission_key',''));
    v_reason:=left(trim(coalesce(v_payload->>'reason','')),1000);
    v_idempotency_key:=nullif(trim(v_payload->>'idempotency_key'),'');
    if v_permission_key not in (
      'task.assign.read_only','task.assign.content','team.message',
      'report.submit','report.read','workload.read'
    ) then raise exception using errcode='22023',message='Choose a supported employee permission.';
    end if;
    if length(v_reason)<3 or v_idempotency_key is null or length(v_idempotency_key)<8 or length(v_idempotency_key)>160 then
      raise exception using errcode='22023',message='A reason and stable permission idempotency key are required.';
    end if;
    if v_payload ? 'allowed_task_types' and jsonb_typeof(v_payload->'allowed_task_types')<>'array' then
      raise exception using errcode='22023',message='Allowed task types must be supplied as an array.';
    end if;
    v_allowed_task_types:=array(
      select distinct lower(trim(value))
      from jsonb_array_elements_text(coalesce(v_payload->'allowed_task_types','[]'::jsonb)) as item(value)
      order by lower(trim(value))
    );
    if cardinality(v_allowed_task_types)>50 or exists(
      select 1 from unnest(v_allowed_task_types) x where x !~ '^[a-z][a-z0-9_.-]{1,79}$'
    ) then raise exception using errcode='22023',message='Allowed task types must be valid identifiers with at most 50 entries.';
    end if;
    if v_permission_key in ('task.assign.read_only','task.assign.content') and cardinality(v_allowed_task_types)=0 then
      raise exception using errcode='22023',message='Task permissions require at least one allowed task type.';
    end if;
    if v_permission_key not in ('task.assign.read_only','task.assign.content') and cardinality(v_allowed_task_types)>0 then
      raise exception using errcode='22023',message='Allowed task types apply only to task-assignment permissions.';
    end if;
    select e.* into v_employee from ai_network.ai_employment_records e
    where e.organization_id=p_organization_id and e.employment_id=v_employment_id for update;
    if not found or v_employee.employment_status<>'active' then
      raise exception using errcode='42501',message='Permissions can be granted only to an active employee.';
    end if;
    select i.* into v_identity from ai_network.ai_identities i
    where i.identity_id=v_employee.identity_id and i.owner_user_id=p_actor_user_id
      and i.status='active' and i.enabled=true;
    if not found then raise exception using errcode='42501',message='Employee AI identity must be active, enabled and owned by this administrator.';
    end if;
    select p.* into v_position from ai_network.ai_positions p
    where p.organization_id=p_organization_id and p.position_id=v_employee.position_id and p.status='active';
    if not found then raise exception using errcode='42501',message='Employee job role must be active before permissions can be granted.';
    end if;
    if v_position.default_permissions ? 'allowed_permissions'
      and jsonb_typeof(v_position.default_permissions->'allowed_permissions')='array'
      and not (v_position.default_permissions->'allowed_permissions' @> jsonb_build_array(v_permission_key)) then
      raise exception using errcode='42501',message='The employee job role does not allow this permission.';
    end if;
    if v_position.default_permissions ? 'denied_permissions'
      and jsonb_typeof(v_position.default_permissions->'denied_permissions')='array'
      and (v_position.default_permissions->'denied_permissions' @> jsonb_build_array(v_permission_key)) then
      raise exception using errcode='42501',message='The employee job role explicitly denies this permission.';
    end if;
    if v_position.default_permissions ? v_permission_key
      and lower(coalesce(v_position.default_permissions->>v_permission_key,'')) in ('false','deny','denied') then
      raise exception using errcode='42501',message='The employee job role explicitly denies this permission.';
    end if;
    if v_permission_key in ('task.assign.read_only','task.assign.content')
      and jsonb_typeof(v_position.default_permissions->'allowed_task_types')='array'
      and exists(select 1 from unnest(v_allowed_task_types) x
        where not (v_position.default_permissions->'allowed_task_types' @> jsonb_build_array(x))) then
      raise exception using errcode='42501',message='The requested task types exceed the employee job role limits.';
    end if;

    select g.* into v_grant from ai_network.ai_employee_permission_grants g
    where g.owner_user_id=p_actor_user_id and g.idempotency_key=v_idempotency_key;
    if found then
      if v_grant.organization_id<>p_organization_id or v_grant.employment_id<>v_employment_id
        or v_grant.permission_key<>v_permission_key or v_grant.allowed_task_types<>v_allowed_task_types then
        raise exception using errcode='23505',message='Permission idempotency key was already used for another grant.';
      end if;
      return jsonb_build_object('permission',to_jsonb(v_grant),'reused',true);
    end if;
    if exists(select 1 from ai_network.ai_employee_permission_grants g
      where g.organization_id=p_organization_id and g.employment_id=v_employment_id
        and g.permission_key=v_permission_key and g.revoked_at is null) then
      raise exception using errcode='23505',message='This employee already has an active grant for that permission.';
    end if;
    insert into ai_network.ai_employee_permission_grants(
      owner_user_id,organization_id,employment_id,permission_key,allowed_task_types,
      reason,idempotency_key,granted_by_user_id
    ) values (
      p_actor_user_id,p_organization_id,v_employment_id,v_permission_key,v_allowed_task_types,
      v_reason,v_idempotency_key,p_actor_user_id
    ) returning * into v_grant;
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,event_type,actor_type,actor_user_id,employment_id,reason,metadata
    ) values (
      p_actor_user_id,p_organization_id,'employee_permission_granted','human_user',p_actor_user_id,v_employment_id,v_reason,
      jsonb_build_object('permission_grant_id',v_grant.permission_grant_id,'permission_key',v_permission_key,
        'allowed_task_types',to_jsonb(v_allowed_task_types))
    );
    return jsonb_build_object('permission',to_jsonb(v_grant),'reused',false);
  end if;

  if v_action='revoke_employee_permission' then
    if coalesce(v_payload->>'employment_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(v_payload->>'permission_grant_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid employment and permission grant ID are required.';
    end if;
    v_employment_id:=(v_payload->>'employment_id')::uuid;
    v_permission_grant_id:=(v_payload->>'permission_grant_id')::uuid;
    v_reason:=left(trim(coalesce(v_payload->>'reason','')),1000);
    if length(v_reason)<3 then raise exception using errcode='22023',message='A revocation reason of at least three characters is required.';
    end if;
    select g.* into v_grant from ai_network.ai_employee_permission_grants g
    where g.owner_user_id=p_actor_user_id and g.organization_id=p_organization_id
      and g.employment_id=v_employment_id and g.permission_grant_id=v_permission_grant_id for update;
    if not found then raise exception using errcode='P0002',message='Employee permission grant not found.';
    end if;
    if v_grant.revoked_at is not null then return jsonb_build_object('permission',to_jsonb(v_grant),'reused',true); end if;
    update ai_network.ai_employee_permission_grants g
    set revoked_at=now(),revoked_by_user_id=p_actor_user_id,revocation_reason=v_reason,updated_at=now()
    where g.permission_grant_id=v_permission_grant_id
    returning * into v_grant;
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,event_type,actor_type,actor_user_id,employment_id,reason,metadata
    ) values (
      p_actor_user_id,p_organization_id,'employee_permission_revoked','human_user',p_actor_user_id,v_employment_id,v_reason,
      jsonb_build_object('permission_grant_id',v_permission_grant_id,'permission_key',v_grant.permission_key)
    );
    return jsonb_build_object('permission',to_jsonb(v_grant),'reused',false);
  end if;

  if v_action='assign_employee_task' then
    if coalesce(v_payload->>'employment_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid employee ID is required.';
    end if;
    v_employment_id:=(v_payload->>'employment_id')::uuid;
    v_team_id:=nullif(v_payload->>'team_id','')::uuid;
    v_task_title:=left(trim(coalesce(v_payload->>'task_title','')),180);
    v_task_type:=lower(trim(coalesce(v_payload->>'task_type','')));
    v_action_class:=lower(coalesce(v_payload->>'action_class',''));
    v_task_payload:=coalesce(v_payload->'task_payload','{}'::jsonb);
    v_idempotency_key:=nullif(trim(v_payload->>'idempotency_key'),'');
    v_workload_units:=coalesce(nullif(v_payload->>'workload_units','')::integer,10);
    v_priority:=coalesce(nullif(v_payload->>'priority','')::integer,100);
    v_max_attempts:=coalesce(nullif(v_payload->>'max_attempts','')::integer,3);
    v_token_budget:=coalesce(nullif(v_payload->>'token_budget','')::integer,0);
    v_cost_limit:=coalesce(nullif(v_payload->>'cost_limit_usd','')::numeric,0);
    v_scheduled_for:=coalesce(nullif(v_payload->>'scheduled_for','')::timestamptz,now());
    if length(v_task_title)<3 or v_task_type !~ '^[a-z][a-z0-9_.-]{1,79}$'
      or v_action_class not in ('read_only','content') then
      raise exception using errcode='22023',message='Task title, task type or action class is invalid. Only read-only and content tasks may be assigned.';
    end if;
    if jsonb_typeof(v_task_payload)<>'object' or octet_length(v_task_payload::text)>65536
      or v_task_payload::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
      raise exception using errcode='22023',message='Task payload must be a safe JSON object no larger than 64 KB.';
    end if;
    if v_idempotency_key is null or length(v_idempotency_key)<8 or length(v_idempotency_key)>160
      or v_workload_units<1 or v_workload_units>100
      or v_priority<1 or v_priority>10000 or v_max_attempts<1 or v_max_attempts>10
      or v_token_budget<0 or v_token_budget>100000000
      or v_cost_limit<0 or v_cost_limit>1000000 then
      raise exception using errcode='22023',message='Task idempotency, workload or execution budget values are invalid.';
    end if;
    select e.* into v_employee from ai_network.ai_employment_records e
    where e.organization_id=p_organization_id and e.employment_id=v_employment_id for update;
    if not found or v_employee.employment_status<>'active' then
      raise exception using errcode='42501',message='Tasks can be assigned only to an active employee.';
    end if;
    select i.* into v_identity from ai_network.ai_identities i
    where i.identity_id=v_employee.identity_id and i.owner_user_id=p_actor_user_id
      and i.status='active' and i.enabled=true and i.supervision_level<>'restricted_observation';
    if not found then raise exception using errcode='42501',message='Employee identity is not active, enabled and task-eligible.';
    end if;
    select p.* into v_position from ai_network.ai_positions p
    where p.organization_id=p_organization_id and p.position_id=v_employee.position_id and p.status='active';
    if not found then raise exception using errcode='42501',message='Employee job role is not active.';
    end if;
    v_permission_key:=case when v_action_class='read_only' then 'task.assign.read_only' else 'task.assign.content' end;
    select g.* into v_grant from ai_network.ai_employee_permission_grants g
    where g.organization_id=p_organization_id and g.employment_id=v_employment_id
      and g.permission_key=v_permission_key and g.revoked_at is null
      and v_task_type=any(g.allowed_task_types);
    if not found then raise exception using errcode='42501',message='Employee lacks an active permission grant for this action class and task type.';
    end if;
    if v_position.default_permissions ? 'allowed_permissions'
      and jsonb_typeof(v_position.default_permissions->'allowed_permissions')='array'
      and not (v_position.default_permissions->'allowed_permissions' @> jsonb_build_array(v_permission_key)) then
      raise exception using errcode='42501',message='Employee job role does not allow this task permission.';
    end if;
    if v_position.default_permissions ? 'denied_permissions'
      and jsonb_typeof(v_position.default_permissions->'denied_permissions')='array'
      and (v_position.default_permissions->'denied_permissions' @> jsonb_build_array(v_permission_key)) then
      raise exception using errcode='42501',message='Employee job role denies this task permission.';
    end if;
    if jsonb_typeof(v_position.default_permissions->'allowed_task_types')='array'
      and not (v_position.default_permissions->'allowed_task_types' @> jsonb_build_array(v_task_type)) then
      raise exception using errcode='42501',message='Task type exceeds the employee job role limits.';
    end if;
    if v_team_id is not null then
      select t.* into v_team from ai_network.ai_teams t
      where t.owner_user_id=p_actor_user_id and t.team_id=v_team_id
        and t.organization_id=p_organization_id and t.status='active';
      if not found then raise exception using errcode='42501',message='Task team must be active in this organization.';
      end if;
      if not exists(select 1 from ai_network.ai_team_memberships m
        where m.owner_user_id=p_actor_user_id and m.team_id=v_team_id
          and m.identity_id=v_employee.identity_id and m.membership_status='active'
          and m.member_role in ('lead','member')) then
        raise exception using errcode='42501',message='Employee must be an active team member to receive a team task.';
      end if;
      if v_team.department_id is not null and v_team.department_id<>v_employee.department_id then
        raise exception using errcode='42501',message='Employee department does not match the selected team scope.';
      end if;
    end if;
    select a.* into v_assignment from ai_network.ai_workforce_task_assignments a
    where a.owner_user_id=p_actor_user_id and a.idempotency_key=v_idempotency_key;
    if found then
      if v_assignment.organization_id<>p_organization_id or v_assignment.employment_id<>v_employment_id
        or v_assignment.team_id is distinct from v_team_id or v_assignment.workload_units<>v_workload_units then
        raise exception using errcode='23505',message='Task idempotency key was already used for a different workforce assignment.';
      end if;
      select tq.* into v_task from ai_network.ai_task_queue tq
      where tq.owner_user_id=p_actor_user_id and tq.task_id=v_assignment.task_id;
      return jsonb_build_object('task',to_jsonb(v_task),'assignment',to_jsonb(v_assignment),'reused',true);
    end if;
    if exists(select 1 from ai_network.ai_task_queue tq
      where tq.owner_user_id=p_actor_user_id and tq.idempotency_key=v_idempotency_key) then
      raise exception using errcode='23505',message='Task idempotency key is already used by another AI task.';
    end if;
    v_capacity_units:=v_employee.workload_percentage;
    select coalesce(sum(a.workload_units),0)::integer,count(*)::integer
      into v_assigned_units,v_open_tasks
    from ai_network.ai_workforce_task_assignments a
    join ai_network.ai_task_queue tq on tq.owner_user_id=a.owner_user_id and tq.task_id=a.task_id
    where a.organization_id=p_organization_id and a.employment_id=v_employment_id
      and a.assignment_status='active' and tq.status in ('pending_approval','queued','running');
    if v_assigned_units+v_workload_units>v_capacity_units then
      raise exception using errcode='54000',message='Task exceeds the employee workload capacity. Reduce workload units or complete/release existing assignments.';
    end if;
    insert into ai_network.ai_task_queue(
      owner_user_id,identity_id,organization_id,task_title,task_type,action_class,task_payload,
      autonomy_mode,requires_approval,status,priority,scheduled_for,max_attempts,token_budget,cost_limit_usd,
      idempotency_key,created_by_user_id
    ) values (
      p_actor_user_id,v_employee.identity_id,p_organization_id,v_task_title,v_task_type,v_action_class,v_task_payload,
      v_identity.supervision_level,true,'pending_approval',v_priority,v_scheduled_for,v_max_attempts,
      v_token_budget,v_cost_limit,v_idempotency_key,p_actor_user_id
    ) returning * into v_task;
    insert into ai_network.ai_task_approvals(owner_user_id,task_id,approval_status)
    values(p_actor_user_id,v_task.task_id,'requested');
    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,actor_user_id,event_type,new_status,reason,metadata
    ) values (
      p_actor_user_id,v_task.task_id,'human_user',p_actor_user_id,'workforce_task_assigned','pending_approval',
      'Task allocated to an active employee under an explicit permission grant.',
      jsonb_build_object('employment_id',v_employment_id,'permission_grant_id',v_grant.permission_grant_id,
        'workload_units',v_workload_units,'team_id',v_team_id,'requires_approval',true)
    );
    insert into ai_network.ai_workforce_task_assignments(
      owner_user_id,organization_id,task_id,employment_id,team_id,workload_units,
      assignment_status,idempotency_key,assigned_by_user_id
    ) values (
      p_actor_user_id,p_organization_id,v_task.task_id,v_employment_id,v_team_id,v_workload_units,
      'active',v_idempotency_key,p_actor_user_id
    ) returning * into v_assignment;
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,event_type,actor_type,actor_user_id,employment_id,team_id,task_id,reason,metadata
    ) values (
      p_actor_user_id,p_organization_id,'employee_task_assigned','human_user',p_actor_user_id,v_employment_id,v_team_id,v_task.task_id,
      'Task assigned for mandatory human review.',
      jsonb_build_object('workload_units',v_workload_units,'task_type',v_task_type,'action_class',v_action_class)
    );
    return jsonb_build_object('task',to_jsonb(v_task),'assignment',to_jsonb(v_assignment),'reused',false);
  end if;

  if v_action='send_team_message' then
    if coalesce(v_payload->>'team_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid team ID is required.';
    end if;
    v_team_id:=(v_payload->>'team_id')::uuid;
    v_sender_identity_id:=nullif(v_payload->>'author_identity_id','')::uuid;
    v_message_type:=lower(coalesce(v_payload->>'message_type','discussion'));
    v_message_body:=trim(coalesce(v_payload->>'body',''));
    v_idempotency_key:=nullif(trim(v_payload->>'idempotency_key'),'');
    if v_message_type not in ('announcement','manager_instruction','discussion','task_update','status_report')
      or length(v_message_body)<1 or length(v_message_body)>4000
      or v_idempotency_key is null or length(v_idempotency_key)<8 or length(v_idempotency_key)>160 then
      raise exception using errcode='22023',message='Team message type, body or idempotency key is invalid.';
    end if;
    select t.* into v_team from ai_network.ai_teams t
    where t.owner_user_id=p_actor_user_id and t.team_id=v_team_id
      and t.organization_id=p_organization_id and t.status='active';
    if not found then raise exception using errcode='P0002',message='Active organizational team not found.';
    end if;
    if v_sender_identity_id is not null then
      select e.* into v_employee from ai_network.ai_employment_records e
      where e.organization_id=p_organization_id and e.identity_id=v_sender_identity_id
        and e.employment_status='active' for update;
      if not found then raise exception using errcode='42501',message='AI message authors must be active employees of this organization.';
      end if;
      select i.* into v_identity from ai_network.ai_identities i
      where i.identity_id=v_sender_identity_id and i.owner_user_id=p_actor_user_id
        and i.status='active' and i.enabled=true;
      if not found then raise exception using errcode='42501',message='AI message author identity must be active and enabled.';
      end if;
      if v_message_type in ('announcement','manager_instruction') then
        raise exception using errcode='42501',message='AI employees cannot issue administrative announcements or manager instructions.';
      end if;
      if not exists(select 1 from ai_network.ai_team_memberships m
        where m.owner_user_id=p_actor_user_id and m.team_id=v_team_id
          and m.identity_id=v_sender_identity_id and m.membership_status='active'
          and m.member_role in ('lead','member')) then
        raise exception using errcode='42501',message='AI message author must be an active member of this team.';
      end if;
      if not exists(select 1 from ai_network.ai_employee_permission_grants g
        where g.organization_id=p_organization_id and g.employment_id=v_employee.employment_id
          and g.permission_key='team.message' and g.revoked_at is null) then
        raise exception using errcode='42501',message='AI message author lacks the team.message permission.';
      end if;
      v_actor_type:='ai_employee';
    else
      v_employee:=null;
      v_actor_type:='human_user';
    end if;
    select m.* into v_message from ai_network.ai_team_messages m
    where m.owner_user_id=p_actor_user_id and m.team_id=v_team_id and m.idempotency_key=v_idempotency_key;
    if found then return jsonb_build_object('message',to_jsonb(v_message),'reused',true); end if;
    if v_sender_identity_id is null then
      insert into ai_network.ai_team_messages(
        owner_user_id,organization_id,team_id,sender_user_id,message_type,body,idempotency_key
      ) values (
        p_actor_user_id,p_organization_id,v_team_id,p_actor_user_id,v_message_type,v_message_body,v_idempotency_key
      ) returning * into v_message;
    else
      insert into ai_network.ai_team_messages(
        owner_user_id,organization_id,team_id,sender_employment_id,sender_identity_id,message_type,body,idempotency_key
      ) values (
        p_actor_user_id,p_organization_id,v_team_id,v_employee.employment_id,v_sender_identity_id,
        v_message_type,v_message_body,v_idempotency_key
      ) returning * into v_message;
    end if;
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,event_type,actor_type,actor_user_id,actor_employment_id,
      actor_identity_id,employment_id,team_id,reason,metadata
    ) values (
      p_actor_user_id,p_organization_id,'team_message_sent',v_actor_type,
      case when v_actor_type='human_user' then p_actor_user_id else null end,
      case when v_actor_type='ai_employee' then v_employee.employment_id else null end,
      v_sender_identity_id,v_employee.employment_id,v_team_id,
      'Internal team communication recorded.',
      jsonb_build_object('message_type',v_message_type,'message_id',v_message.message_id)
    );
    return jsonb_build_object('message',to_jsonb(v_message),'reused',false);
  end if;

  if v_action='submit_employee_report' then
    if coalesce(v_payload->>'employment_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid employment ID is required.';
    end if;
    v_employment_id:=(v_payload->>'employment_id')::uuid;
    v_team_id:=nullif(v_payload->>'team_id','')::uuid;
    v_task_id:=nullif(v_payload->>'task_id','')::uuid;
    v_report_type:=lower(coalesce(v_payload->>'report_type','daily'));
    v_report_title:=left(trim(coalesce(v_payload->>'report_title','')),180);
    v_report_body:=trim(coalesce(v_payload->>'report_body',''));
    v_period_start:=nullif(v_payload->>'period_start','')::date;
    v_period_end:=nullif(v_payload->>'period_end','')::date;
    v_idempotency_key:=nullif(trim(v_payload->>'idempotency_key'),'');
    if v_report_type not in ('daily','weekly','task','exception','incident')
      or length(v_report_title)<3 or length(v_report_body)<1 or length(v_report_body)>8000
      or (v_period_start is not null and v_period_end is not null and v_period_end<v_period_start)
      or v_idempotency_key is null or length(v_idempotency_key)<8 or length(v_idempotency_key)>160 then
      raise exception using errcode='22023',message='Employee report fields or idempotency key are invalid.';
    end if;
    select e.* into v_employee from ai_network.ai_employment_records e
    where e.organization_id=p_organization_id and e.employment_id=v_employment_id
      and e.employment_status='active' for update;
    if not found then raise exception using errcode='42501',message='Only an active employee may submit a workforce report.';
    end if;
    if not exists(select 1 from ai_network.ai_identities i
      where i.identity_id=v_employee.identity_id and i.owner_user_id=p_actor_user_id
        and i.status='active' and i.enabled=true) then
      raise exception using errcode='42501',message='Report author identity must be active and enabled.';
    end if;
    if not exists(select 1 from ai_network.ai_employee_permission_grants g
      where g.organization_id=p_organization_id and g.employment_id=v_employment_id
        and g.permission_key='report.submit' and g.revoked_at is null) then
      raise exception using errcode='42501',message='Employee lacks the report.submit permission.';
    end if;
    if v_team_id is not null and not exists(select 1 from ai_network.ai_teams t
      join ai_network.ai_team_memberships m on m.owner_user_id=t.owner_user_id and m.team_id=t.team_id
      where t.owner_user_id=p_actor_user_id and t.team_id=v_team_id
        and t.organization_id=p_organization_id and t.status='active'
        and m.identity_id=v_employee.identity_id and m.membership_status='active') then
      raise exception using errcode='42501',message='Report team must be active and include the reporting employee.';
    end if;
    if v_task_id is not null and not exists(select 1 from ai_network.ai_workforce_task_assignments a
      where a.owner_user_id=p_actor_user_id and a.organization_id=p_organization_id
        and a.employment_id=v_employment_id and a.task_id=v_task_id) then
      raise exception using errcode='42501',message='Related task must belong to this employee and organization.';
    end if;
    select r.* into v_report from ai_network.ai_employee_reports r
    where r.owner_user_id=p_actor_user_id and r.idempotency_key=v_idempotency_key;
    if found then return jsonb_build_object('report',to_jsonb(v_report),'reused',true); end if;
    insert into ai_network.ai_employee_reports(
      owner_user_id,organization_id,employment_id,team_id,task_id,report_type,report_title,report_body,
      period_start,period_end,report_status,idempotency_key
    ) values (
      p_actor_user_id,p_organization_id,v_employment_id,v_team_id,v_task_id,v_report_type,
      v_report_title,v_report_body,v_period_start,v_period_end,'submitted',v_idempotency_key
    ) returning * into v_report;
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,event_type,actor_type,actor_employment_id,actor_identity_id,
      employment_id,team_id,report_id,reason,metadata
    ) values (
      p_actor_user_id,p_organization_id,'employee_report_submitted','ai_employee',
      v_employment_id,v_employee.identity_id,v_employment_id,v_team_id,v_report.report_id,
      'Employee report submitted to its administrative reporting line.',
      jsonb_build_object('report_type',v_report_type,'report_title',v_report_title)
    );
    return jsonb_build_object('report',to_jsonb(v_report),'reused',false);
  end if;

  if v_action='review_employee_report' then
    if coalesce(v_payload->>'report_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid employee report ID is required.';
    end if;
    v_report_id:=(v_payload->>'report_id')::uuid;
    v_status:=lower(coalesce(v_payload->>'status',''));
    v_reason:=left(trim(coalesce(v_payload->>'reason','')),1000);
    if v_status not in ('acknowledged','needs_follow_up') or length(v_reason)<3 then
      raise exception using errcode='22023',message='Choose a report review decision and provide a reason.';
    end if;
    select r.* into v_report from ai_network.ai_employee_reports r
    where r.owner_user_id=p_actor_user_id and r.organization_id=p_organization_id
      and r.report_id=v_report_id and r.report_status='submitted' for update;
    if not found then raise exception using errcode='P0002',message='Submitted employee report not found.';
    end if;
    update ai_network.ai_employee_reports r
    set report_status=v_status,reviewed_by_user_id=p_actor_user_id,reviewed_at=now(),
      review_reason=v_reason,updated_at=now()
    where r.report_id=v_report_id and r.owner_user_id=p_actor_user_id
    returning * into v_report;
    insert into ai_network.ai_workforce_events(
      owner_user_id,organization_id,event_type,actor_type,actor_user_id,
      employment_id,team_id,report_id,reason,metadata
    ) values (
      p_actor_user_id,p_organization_id,'employee_report_reviewed','human_user',p_actor_user_id,
      v_report.employment_id,v_report.team_id,v_report_id,v_reason,jsonb_build_object('review_status',v_status)
    );
    return jsonb_build_object('report',to_jsonb(v_report));
  end if;

  if v_action='list_team_messages' then
    if coalesce(v_payload->>'team_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid team ID is required.';
    end if;
    v_team_id:=(v_payload->>'team_id')::uuid;
    if not exists(select 1 from ai_network.ai_teams t
      where t.owner_user_id=p_actor_user_id and t.team_id=v_team_id and t.organization_id=p_organization_id) then
      raise exception using errcode='P0002',message='Team not found in this organization.';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'message',to_jsonb(m),'team_name',t.team_name,
      'author_name',coalesce(nullif(n.display_name,''),nullif(n.username,''),'Minglora administrator')
    ) order by m.created_at desc),'[]'::jsonb)
    into v_result
    from (
      select * from ai_network.ai_team_messages
      where owner_user_id=p_actor_user_id and organization_id=p_organization_id and team_id=v_team_id
      order by created_at desc limit 100
    ) m
    join ai_network.ai_teams t on t.owner_user_id=m.owner_user_id and t.team_id=m.team_id
    left join ai_network.ai_employment_records e on e.organization_id=m.organization_id and e.employment_id=m.sender_employment_id
    left join ai_network.ai_names n on n.identity_id=e.identity_id;
    return jsonb_build_object('messages',v_result);
  end if;

  if v_action='list_team_activity' then
    if coalesce(v_payload->>'team_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid team ID is required.';
    end if;
    v_team_id:=(v_payload->>'team_id')::uuid;
    select t.* into v_team from ai_network.ai_teams t
    where t.owner_user_id=p_actor_user_id and t.team_id=v_team_id and t.organization_id=p_organization_id;
    if not found then raise exception using errcode='P0002',message='Team not found in this organization.'; end if;
    select coalesce(jsonb_agg(to_jsonb(ev) order by ev.occurred_at desc),'[]'::jsonb)
    into v_rows from (
      select * from ai_network.ai_team_events
      where owner_user_id=p_actor_user_id and team_id=v_team_id
      order by occurred_at desc limit 100
    ) ev;
    select coalesce(jsonb_agg(to_jsonb(ev) order by ev.occurred_at desc),'[]'::jsonb)
    into v_result from (
      select * from ai_network.ai_workforce_events
      where owner_user_id=p_actor_user_id and organization_id=p_organization_id and team_id=v_team_id
      order by occurred_at desc limit 100
    ) ev;
    return jsonb_build_object(
      'team_events',v_rows,
      'workforce_events',v_result,
      'messages',(select coalesce(jsonb_agg(jsonb_build_object(
        'message',to_jsonb(m),'team_name',v_team.team_name
      ) order by m.created_at desc),'[]'::jsonb)
        from (select * from ai_network.ai_team_messages
          where owner_user_id=p_actor_user_id and team_id=v_team_id order by created_at desc limit 100) m)
    );
  end if;

  raise exception using errcode='22023',message='Unsupported AI workforce command.';
end;
$function$;

comment on function public.minglora_ai_workforce_command(text,uuid,uuid,jsonb)
  is 'Private organization-scoped workforce operations. Requires active Minglora staff, explicit employee permissions, active team membership and bounded workload; all assigned AI tasks require human approval.';

revoke all on function public.minglora_ai_workforce_command(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_workforce_command(text,uuid,uuid,jsonb) to service_role;
