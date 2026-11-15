-- Minglora AI HR workforce development and attendance.
-- Additive, owner-scoped and private. No sample programs, enrollments or attendance are seeded.
-- Attendance remains human-recorded/reviewed; no employee presence or time is fabricated.

create table if not exists ai_network.ai_training_programs (
  program_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete cascade,
  program_title text not null check (length(trim(program_title)) between 3 and 160),
  description text not null default '' check (length(description) <= 4000),
  category text not null default 'general' check (length(trim(category)) between 2 and 80),
  mandatory boolean not null default false,
  program_status text not null default 'draft' check (program_status in ('draft','active','retired')),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, program_id)
);
create unique index if not exists ai_training_programs_org_title_uq
  on ai_network.ai_training_programs (organization_id, lower(program_title));
create unique index if not exists ai_training_programs_idempotency_uq
  on ai_network.ai_training_programs (organization_id,idempotency_key)
  where idempotency_key is not null;
create index if not exists ai_training_programs_owner_idx
  on ai_network.ai_training_programs (owner_user_id);
create index if not exists ai_training_programs_created_by_idx
  on ai_network.ai_training_programs (created_by_user_id);

create table if not exists ai_network.ai_training_enrollments (
  enrollment_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  employment_id uuid not null,
  program_id uuid not null,
  enrollment_status text not null default 'assigned'
    check (enrollment_status in ('assigned','in_progress','completed','waived','cancelled')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  due_on date,
  outcome_summary text not null default '' check (length(outcome_summary) <= 2000),
  assigned_by_user_id uuid not null references public.profiles(id) on delete restrict,
  completed_by_user_id uuid references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,enrollment_id),
  foreign key (organization_id,employment_id)
    references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  foreign key (organization_id,program_id)
    references ai_network.ai_training_programs(organization_id,program_id) on delete restrict,
  check ((enrollment_status='completed') = (completed_at is not null)),
  check (enrollment_status<>'completed' or progress_percent=100)
);
create unique index if not exists ai_training_enrollments_idempotency_uq
  on ai_network.ai_training_enrollments (organization_id,idempotency_key)
  where idempotency_key is not null;
create unique index if not exists ai_training_enrollments_program_employee_uq
  on ai_network.ai_training_enrollments (organization_id,program_id,employment_id)
  where enrollment_status not in ('cancelled','waived');
create index if not exists ai_training_enrollments_employment_idx
  on ai_network.ai_training_enrollments (organization_id,employment_id,enrollment_status);
create index if not exists ai_training_enrollments_program_idx
  on ai_network.ai_training_enrollments (organization_id,program_id,enrollment_status);
create index if not exists ai_training_enrollments_assigned_by_idx
  on ai_network.ai_training_enrollments (assigned_by_user_id);
create index if not exists ai_training_enrollments_completed_by_idx
  on ai_network.ai_training_enrollments (completed_by_user_id);

create table if not exists ai_network.ai_attendance_records (
  attendance_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  employment_id uuid not null,
  record_type text not null check (record_type in ('availability','shift','leave','absence')),
  record_status text not null default 'submitted'
    check (record_status in ('submitted','approved','rejected','recorded','cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'UTC' check (length(trim(timezone)) between 1 and 80),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  review_note text not null default '' check (length(review_note) <= 1000),
  submitted_by_user_id uuid not null references public.profiles(id) on delete restrict,
  reviewed_by_user_id uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,attendance_id),
  foreign key (organization_id,employment_id)
    references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  check (ends_at > starts_at),
  check ((record_status in ('approved','rejected','recorded','cancelled')) = (reviewed_at is not null))
);
create unique index if not exists ai_attendance_records_idempotency_uq
  on ai_network.ai_attendance_records (organization_id,idempotency_key)
  where idempotency_key is not null;
create index if not exists ai_attendance_records_employment_start_idx
  on ai_network.ai_attendance_records (organization_id,employment_id,starts_at desc);
create index if not exists ai_attendance_records_submitted_by_idx
  on ai_network.ai_attendance_records (submitted_by_user_id);
create index if not exists ai_attendance_records_reviewed_by_idx
  on ai_network.ai_attendance_records (reviewed_by_user_id);

create table if not exists ai_network.ai_hr_workforce_events (
  event_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete cascade,
  record_type text not null check (record_type in ('training_program','training_enrollment','attendance')),
  record_id uuid not null,
  action text not null check (length(trim(action)) between 2 and 80),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  occurred_at timestamptz not null default now()
);
create index if not exists ai_hr_workforce_events_org_time_idx
  on ai_network.ai_hr_workforce_events (organization_id,occurred_at desc);
create index if not exists ai_hr_workforce_events_actor_idx
  on ai_network.ai_hr_workforce_events (actor_user_id);
create index if not exists ai_hr_workforce_events_org_record_idx
  on ai_network.ai_hr_workforce_events (organization_id,record_type,record_id,occurred_at desc);

alter table ai_network.ai_training_programs enable row level security;
alter table ai_network.ai_training_enrollments enable row level security;
alter table ai_network.ai_attendance_records enable row level security;
alter table ai_network.ai_hr_workforce_events enable row level security;

revoke all on ai_network.ai_training_programs, ai_network.ai_training_enrollments,
  ai_network.ai_attendance_records, ai_network.ai_hr_workforce_events from public,anon,authenticated;
grant select,insert,update on ai_network.ai_training_programs to service_role;
grant select,insert,update on ai_network.ai_training_enrollments to service_role;
grant select,insert,update on ai_network.ai_attendance_records to service_role;
grant select,insert on ai_network.ai_hr_workforce_events to service_role;

comment on table ai_network.ai_training_programs is
  'Owner-controlled AI workforce training catalog. Program metadata does not claim provider-backed course delivery.';
comment on table ai_network.ai_training_enrollments is
  'Audited AI employee training assignments and human-recorded progress/completion.';
comment on table ai_network.ai_attendance_records is
  'Human-recorded availability, shift, leave and absence entries. No automatic presence inference.';
comment on table ai_network.ai_hr_workforce_events is
  'Append-only human actor audit events for AI workforce development and attendance changes.';

create or replace function public.minglora_ai_hr_workforce_command(
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
  v_org uuid;
  v_employment_id uuid;
  v_program_id uuid;
  v_enrollment_id uuid;
  v_attendance_id uuid;
  v_status text;
  v_previous_status text;
  v_key text;
  v_title text;
  v_description text;
  v_category text;
  v_reason text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_progress integer;
  v_result jsonb;
  v_reused boolean := false;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='AI HR workforce commands are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode='42501',message='A valid signed-in Minglora administrator is required.';
  end if;
  if jsonb_typeof(v_payload)<>'object' then
    raise exception using errcode='22023',message='AI HR workforce payload must be a JSON object.';
  end if;
  if coalesce(v_payload->>'organization_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode='22023',message='A valid organization ID is required.';
  end if;
  v_org := (v_payload->>'organization_id')::uuid;
  if not exists(
    select 1 from ai_network.ai_organizations o
    where o.organization_id=v_org and o.owner_user_id=p_actor_user_id
      and o.status not in ('suspended','archived')
  ) then
    raise exception using errcode='42501',message='Organization not found or unavailable for this Minglora administrator.';
  end if;

  if v_action='list_training_programs' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'program',to_jsonb(p),
      'enrollment_count',(select count(*) from ai_network.ai_training_enrollments e where e.program_id=p.program_id and e.organization_id=v_org)
    ) order by p.created_at desc),'[]'::jsonb)
    into v_result from ai_network.ai_training_programs p
    where p.organization_id=v_org and p.owner_user_id=p_actor_user_id;
    return v_result;
  end if;

  if v_action='create_training_program' then
    v_title := left(trim(coalesce(v_payload->>'program_title','')),160);
    v_description := left(trim(coalesce(v_payload->>'description','')),4000);
    v_category := left(trim(coalesce(v_payload->>'category','general')),80);
    v_key := nullif(trim(v_payload->>'idempotency_key'),'');
    if length(v_title)<3 or length(v_category)<2 then
      raise exception using errcode='22023',message='Training title and category must be at least 3 and 2 characters.';
    end if;
    if v_key is null or length(v_key)<8 or length(v_key)>160 then
      raise exception using errcode='22023',message='A stable training program idempotency key is required.';
    end if;
    insert into ai_network.ai_training_programs(
      organization_id,program_title,description,category,mandatory,owner_user_id,created_by_user_id,idempotency_key
    ) values (
      v_org,v_title,v_description,v_category,coalesce((v_payload->>'mandatory')::boolean,false),
      p_actor_user_id,p_actor_user_id,v_key
    ) on conflict (organization_id,idempotency_key) where idempotency_key is not null do nothing
    returning program_id into v_program_id;
    if v_program_id is null then
      v_reused := true;
      select p.program_id into v_program_id from ai_network.ai_training_programs p
      where p.organization_id=v_org and p.idempotency_key=v_key;
    else
      insert into ai_network.ai_hr_workforce_events(organization_id,record_type,record_id,action,actor_user_id)
      values(v_org,'training_program',v_program_id,'training_program_created',p_actor_user_id);
    end if;
    select to_jsonb(p) into v_result from ai_network.ai_training_programs p
    where p.organization_id=v_org and p.program_id=v_program_id and p.owner_user_id=p_actor_user_id;
    return jsonb_build_object('program',v_result,'reused',v_reused);
  end if;

  if v_action='set_training_program_status' then
    v_program_id := nullif(v_payload->>'program_id','')::uuid;
    v_status := lower(coalesce(v_payload->>'status',''));
    if v_status not in ('active','retired') then
      raise exception using errcode='22023',message='Training programs can only be activated or retired.';
    end if;
    update ai_network.ai_training_programs p
    set program_status=v_status,updated_at=now()
    where p.organization_id=v_org and p.program_id=v_program_id and p.owner_user_id=p_actor_user_id
      and ((p.program_status='draft' and v_status='active') or (p.program_status='active' and v_status='retired'));
    if not found then raise exception using errcode='22023',message='Training program not found or transition is not allowed.'; end if;
    insert into ai_network.ai_hr_workforce_events(organization_id,record_type,record_id,action,actor_user_id,details)
    values(v_org,'training_program',v_program_id,'training_program_'||v_status,p_actor_user_id,jsonb_build_object('status',v_status));
    select to_jsonb(p) into v_result from ai_network.ai_training_programs p where p.program_id=v_program_id;
    return v_result;
  end if;

  if v_action='list_training_enrollments' then
    select coalesce(jsonb_agg(jsonb_build_object('enrollment',to_jsonb(e),'program',to_jsonb(p))
      order by e.created_at desc),'[]'::jsonb)
    into v_result
    from ai_network.ai_training_enrollments e
    join ai_network.ai_training_programs p on p.organization_id=e.organization_id and p.program_id=e.program_id
    where e.organization_id=v_org and p.owner_user_id=p_actor_user_id;
    return v_result;
  end if;

  if v_action='assign_training' then
    v_employment_id := nullif(v_payload->>'employment_id','')::uuid;
    v_program_id := nullif(v_payload->>'program_id','')::uuid;
    v_key := nullif(trim(v_payload->>'idempotency_key'),'');
    if v_key is null or length(v_key)<8 or length(v_key)>160 then
      raise exception using errcode='22023',message='A stable training assignment idempotency key is required.';
    end if;
    if not exists(select 1 from ai_network.ai_employment_records e where e.organization_id=v_org
      and e.employment_id=v_employment_id and e.employment_status in ('onboarding','active')) then
      raise exception using errcode='22023',message='Training can only be assigned to an onboarding or active employee.';
    end if;
    if not exists(select 1 from ai_network.ai_training_programs p where p.organization_id=v_org
      and p.program_id=v_program_id and p.owner_user_id=p_actor_user_id and p.program_status='active') then
      raise exception using errcode='22023',message='Choose an active training program in this organization.';
    end if;
    insert into ai_network.ai_training_enrollments(
      organization_id,employment_id,program_id,due_on,assigned_by_user_id,idempotency_key
    ) values(v_org,v_employment_id,v_program_id,nullif(v_payload->>'due_on','')::date,p_actor_user_id,v_key)
    on conflict (organization_id,idempotency_key) where idempotency_key is not null do nothing
    returning enrollment_id into v_enrollment_id;
    if v_enrollment_id is null then
      v_reused:=true;
      select e.enrollment_id into v_enrollment_id from ai_network.ai_training_enrollments e
      where e.organization_id=v_org and e.idempotency_key=v_key;
    else
      insert into ai_network.ai_hr_workforce_events(organization_id,record_type,record_id,action,actor_user_id)
      values(v_org,'training_enrollment',v_enrollment_id,'training_assigned',p_actor_user_id);
    end if;
    select to_jsonb(e) into v_result from ai_network.ai_training_enrollments e
    where e.organization_id=v_org and e.enrollment_id=v_enrollment_id;
    return jsonb_build_object('enrollment',v_result,'reused',v_reused);
  end if;

  if v_action='update_training_enrollment' then
    v_enrollment_id := nullif(v_payload->>'enrollment_id','')::uuid;
    v_status := lower(coalesce(v_payload->>'status',''));
    v_reason := left(trim(coalesce(v_payload->>'outcome_summary','')),2000);
    v_progress := coalesce(nullif(v_payload->>'progress_percent','')::integer,0);
    select e.enrollment_status into v_previous_status from ai_network.ai_training_enrollments e
    where e.organization_id=v_org and e.enrollment_id=v_enrollment_id;
    if not found then raise exception using errcode='P0002',message='Training enrollment not found.'; end if;
    if not (
      (v_previous_status='assigned' and v_status in ('in_progress','completed','waived','cancelled')) or
      (v_previous_status='in_progress' and v_status in ('completed','waived','cancelled'))
    ) then raise exception using errcode='22023',message='Training enrollment transition is not allowed.'; end if;
    if v_status='completed' then v_progress:=100; end if;
    if v_status='assigned' then v_progress:=0; end if;
    if v_progress<0 or v_progress>100 then raise exception using errcode='22023',message='Training progress must be between 0 and 100.'; end if;
    update ai_network.ai_training_enrollments e set
      enrollment_status=v_status,progress_percent=v_progress,outcome_summary=v_reason,
      completed_by_user_id=case when v_status='completed' then p_actor_user_id else null end,
      completed_at=case when v_status='completed' then now() else null end,updated_at=now()
    where e.organization_id=v_org and e.enrollment_id=v_enrollment_id;
    insert into ai_network.ai_hr_workforce_events(organization_id,record_type,record_id,action,actor_user_id,details)
    values(v_org,'training_enrollment',''||v_enrollment_id,'training_'||v_status,p_actor_user_id,
      jsonb_build_object('previous_status',v_previous_status,'status',v_status,'progress_percent',v_progress,'summary',v_reason));
    select to_jsonb(e) into v_result from ai_network.ai_training_enrollments e
    where e.organization_id=v_org and e.enrollment_id=v_enrollment_id;
    return v_result;
  end if;

  if v_action='list_attendance' then
    select coalesce(jsonb_agg(jsonb_build_object('attendance',to_jsonb(a))
      order by a.starts_at desc),'[]'::jsonb)
    into v_result from ai_network.ai_attendance_records a
    where a.organization_id=v_org;
    return v_result;
  end if;

  if v_action='record_attendance' then
    v_employment_id := nullif(v_payload->>'employment_id','')::uuid;
    v_status := lower(coalesce(v_payload->>'record_type',''));
    v_key := nullif(trim(v_payload->>'idempotency_key'),'');
    if v_status not in ('availability','shift','leave','absence') then
      raise exception using errcode='22023',message='Choose availability, shift, leave or absence.';
    end if;
    if v_key is null or length(v_key)<8 or length(v_key)>160 then
      raise exception using errcode='22023',message='A stable attendance idempotency key is required.';
    end if;
    if not exists(select 1 from ai_network.ai_employment_records e where e.organization_id=v_org
      and e.employment_id=v_employment_id and e.employment_status in ('onboarding','active','restricted')) then
      raise exception using errcode='22023',message='Attendance can only be recorded for an active, onboarding or restricted employee.';
    end if;
    v_starts_at := nullif(v_payload->>'starts_at','')::timestamptz;
    v_ends_at := nullif(v_payload->>'ends_at','')::timestamptz;
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    if v_starts_at is null or v_ends_at is null or v_ends_at<=v_starts_at or length(v_reason)<3 then
      raise exception using errcode='22023',message='Valid start/end times and a reason of at least three characters are required.';
    end if;
    insert into ai_network.ai_attendance_records(
      organization_id,employment_id,record_type,starts_at,ends_at,timezone,reason,submitted_by_user_id,idempotency_key
    ) values(v_org,v_employment_id,v_status,v_starts_at,v_ends_at,
      left(trim(coalesce(v_payload->>'timezone','UTC')),80),v_reason,p_actor_user_id,v_key)
    on conflict (organization_id,idempotency_key) where idempotency_key is not null do nothing
    returning attendance_id into v_attendance_id;
    if v_attendance_id is null then
      v_reused:=true;
      select a.attendance_id into v_attendance_id from ai_network.ai_attendance_records a
      where a.organization_id=v_org and a.idempotency_key=v_key;
    else
      insert into ai_network.ai_hr_workforce_events(organization_id,record_type,record_id,action,actor_user_id)
      values(v_org,'attendance',v_attendance_id,'attendance_submitted',p_actor_user_id);
    end if;
    select to_jsonb(a) into v_result from ai_network.ai_attendance_records a
    where a.organization_id=v_org and a.attendance_id=v_attendance_id;
    return jsonb_build_object('attendance',v_result,'reused',v_reused);
  end if;

  if v_action='review_attendance' then
    v_attendance_id := nullif(v_payload->>'attendance_id','')::uuid;
    v_status := lower(coalesce(v_payload->>'status',''));
    v_reason := left(trim(coalesce(v_payload->>'review_note','')),1000);
    if v_status not in ('approved','rejected','recorded','cancelled') or length(v_reason)<3 then
      raise exception using errcode='22023',message='Choose an attendance decision and provide a review reason of at least three characters.';
    end if;
    update ai_network.ai_attendance_records a set
      record_status=v_status,review_note=v_reason,reviewed_by_user_id=p_actor_user_id,reviewed_at=now(),updated_at=now()
    where a.organization_id=v_org and a.attendance_id=v_attendance_id and a.record_status='submitted';
    if not found then raise exception using errcode='22023',message='Only submitted attendance records can be reviewed.'; end if;
    insert into ai_network.ai_hr_workforce_events(organization_id,record_type,record_id,action,actor_user_id,details)
    values(v_org,'attendance',v_attendance_id,'attendance_'||v_status,p_actor_user_id,jsonb_build_object('review_note',v_reason));
    select to_jsonb(a) into v_result from ai_network.ai_attendance_records a
    where a.organization_id=v_org and a.attendance_id=v_attendance_id;
    return v_result;
  end if;

  raise exception using errcode='22023',message='Unsupported AI HR workforce command.';
end;
$function$;

comment on function public.minglora_ai_hr_workforce_command(text,uuid,jsonb)
  is 'Server-only owner-scoped AI HR workforce development and attendance. No automated presence inference or provider-backed course completion.';

revoke all on function public.minglora_ai_hr_workforce_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_hr_workforce_command(text,uuid,jsonb) to service_role;
