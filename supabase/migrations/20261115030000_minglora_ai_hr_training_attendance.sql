-- Minglora AI HR: owner-scoped training and daily attendance.
-- Attendance and completion are entered by authorized human administrators; no inference or automatic attendance is performed.

create table if not exists ai_network.ai_training_courses (
  course_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete cascade,
  course_key text not null check (course_key ~ '^[a-z0-9][a-z0-9_-]{1,78}[a-z0-9]$'),
  course_title text not null check (length(trim(course_title)) between 3 and 160),
  description text not null default '' check (length(description)<=4000),
  learning_objectives jsonb not null default '[]'::jsonb
    check (jsonb_typeof(learning_objectives)='array' and jsonb_array_length(learning_objectives)<=30),
  required_training boolean not null default false,
  course_status text not null default 'draft' check (course_status in ('draft','published','archived')),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,course_id)
);
create unique index if not exists ai_training_courses_org_key_uq on ai_network.ai_training_courses(organization_id,course_key);
create unique index if not exists ai_training_courses_org_idempotency_uq on ai_network.ai_training_courses(organization_id,idempotency_key) where idempotency_key is not null;
create index if not exists ai_training_courses_org_status_idx on ai_network.ai_training_courses(organization_id,course_status,created_at desc);
create index if not exists ai_training_courses_created_by_idx on ai_network.ai_training_courses(created_by_user_id);

create table if not exists ai_network.ai_training_course_history (
  event_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  course_id uuid not null,
  action text not null check (action in ('course_created','course_published','course_archived')),
  previous_status text,
  new_status text not null,
  reason text not null default '' check (length(reason)<=1000),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  foreign key (organization_id,course_id) references ai_network.ai_training_courses(organization_id,course_id) on delete restrict
);
create index if not exists ai_training_course_history_course_idx on ai_network.ai_training_course_history(organization_id,course_id,occurred_at desc);
create index if not exists ai_training_course_history_actor_idx on ai_network.ai_training_course_history(actor_user_id);

create table if not exists ai_network.ai_training_enrollments (
  enrollment_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  course_id uuid not null,
  employment_id uuid not null,
  enrollment_status text not null default 'assigned' check (enrollment_status in ('assigned','in_progress','completed','waived','cancelled')),
  assigned_by_user_id uuid not null references public.profiles(id) on delete restrict,
  due_on date,
  started_at timestamptz,
  completed_at timestamptz,
  score numeric(5,2) check (score is null or score between 0 and 100),
  completion_note text not null default '' check (length(completion_note)<=2000),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,course_id) references ai_network.ai_training_courses(organization_id,course_id) on delete restrict,
  foreign key (organization_id,employment_id) references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  unique (organization_id,enrollment_id),
  unique (organization_id,course_id,employment_id)
);
create unique index if not exists ai_training_enrollments_org_idempotency_uq on ai_network.ai_training_enrollments(organization_id,idempotency_key);
create index if not exists ai_training_enrollments_course_status_idx on ai_network.ai_training_enrollments(organization_id,course_id,enrollment_status,created_at desc);
create index if not exists ai_training_enrollments_employment_status_idx on ai_network.ai_training_enrollments(organization_id,employment_id,enrollment_status);
create index if not exists ai_training_enrollments_assigned_by_idx on ai_network.ai_training_enrollments(assigned_by_user_id);

create table if not exists ai_network.ai_training_enrollment_history (
  event_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  enrollment_id uuid not null,
  action text not null check (action in ('training_assigned','training_started','training_completed','training_waived','training_cancelled')),
  previous_status text,
  new_status text not null,
  reason text not null default '' check (length(reason)<=1000),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  foreign key (organization_id,enrollment_id) references ai_network.ai_training_enrollments(organization_id,enrollment_id) on delete restrict
);
create index if not exists ai_training_enrollment_history_enrollment_idx on ai_network.ai_training_enrollment_history(organization_id,enrollment_id,occurred_at desc);
create index if not exists ai_training_enrollment_history_actor_idx on ai_network.ai_training_enrollment_history(actor_user_id);

create table if not exists ai_network.ai_employee_attendance (
  attendance_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  employment_id uuid not null,
  attendance_date date not null,
  attendance_status text not null check (attendance_status in ('present','late','absent','excused','on_leave')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  reason text not null default '' check (length(reason)<=2000),
  recorded_by_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,employment_id) references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  unique (organization_id,attendance_id),
  unique (organization_id,employment_id,attendance_date),
  check (check_in_at is null or check_out_at is null or check_out_at>=check_in_at),
  check (attendance_status not in ('present','late') or check_in_at is not null),
  check (attendance_status not in ('absent','excused','on_leave') or length(trim(reason))>=3)
);
create unique index if not exists ai_employee_attendance_org_idempotency_uq on ai_network.ai_employee_attendance(organization_id,idempotency_key);
create index if not exists ai_employee_attendance_employment_date_idx on ai_network.ai_employee_attendance(organization_id,employment_id,attendance_date desc);
create index if not exists ai_employee_attendance_org_date_status_idx on ai_network.ai_employee_attendance(organization_id,attendance_date desc,attendance_status);
create index if not exists ai_employee_attendance_recorded_by_idx on ai_network.ai_employee_attendance(recorded_by_user_id);

create table if not exists ai_network.ai_employee_attendance_history (
  event_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  attendance_id uuid not null,
  action text not null check (action in ('attendance_recorded','attendance_corrected')),
  previous_status text,
  new_status text not null,
  reason text not null default '' check (length(reason)<=1000),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now(),
  foreign key (organization_id,attendance_id) references ai_network.ai_employee_attendance(organization_id,attendance_id) on delete restrict
);
create index if not exists ai_employee_attendance_history_attendance_idx on ai_network.ai_employee_attendance_history(organization_id,attendance_id,occurred_at desc);
create index if not exists ai_employee_attendance_history_actor_idx on ai_network.ai_employee_attendance_history(actor_user_id);

alter table ai_network.ai_training_courses enable row level security;
alter table ai_network.ai_training_course_history enable row level security;
alter table ai_network.ai_training_enrollments enable row level security;
alter table ai_network.ai_training_enrollment_history enable row level security;
alter table ai_network.ai_employee_attendance enable row level security;
alter table ai_network.ai_employee_attendance_history enable row level security;
revoke all on table ai_network.ai_training_courses,ai_network.ai_training_course_history,ai_network.ai_training_enrollments,
  ai_network.ai_training_enrollment_history,ai_network.ai_employee_attendance,ai_network.ai_employee_attendance_history
  from public,anon,authenticated;
grant select,insert,update on ai_network.ai_training_courses to service_role;
grant select,insert on ai_network.ai_training_course_history to service_role;
grant select,insert,update on ai_network.ai_training_enrollments to service_role;
grant select,insert on ai_network.ai_training_enrollment_history to service_role;
grant select,insert,update on ai_network.ai_employee_attendance to service_role;
grant select,insert on ai_network.ai_employee_attendance_history to service_role;

create or replace function public.minglora_ai_hr_development_command(p_action text,p_actor_user_id uuid,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_action text := lower(coalesce(p_action,''));
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_org uuid; v_course uuid; v_enrollment uuid; v_employment uuid; v_attendance uuid;
  v_key text; v_title text; v_description text; v_objectives jsonb; v_required boolean;
  v_status text; v_previous text; v_reason text; v_idempotency text;
  v_due date; v_att_date date; v_in timestamptz; v_out timestamptz;
  v_score numeric(5,2); v_note text; v_result jsonb; v_existing jsonb; v_reused boolean := false;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='AI HR development commands are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode='42501',message='A valid signed-in Minglora administrator is required.';
  end if;
  if jsonb_typeof(v_payload)<>'object' then
    raise exception using errcode='22023',message='AI HR development payload must be an object.';
  end if;
  if coalesce(v_payload->>'organization_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode='22023',message='A valid organization ID is required.';
  end if;
  v_org := (v_payload->>'organization_id')::uuid;
  if not exists(select 1 from ai_network.ai_organizations o where o.organization_id=v_org
    and o.owner_user_id=p_actor_user_id and o.status not in ('suspended','archived')) then
    raise exception using errcode='42501',message='Organization not found or unavailable for this Minglora administrator.';
  end if;

  if v_action='list_training_courses' then
    select coalesce(jsonb_agg(q.item order by q.created_at desc),'[]'::jsonb) into v_result
    from (
      select jsonb_build_object('course',to_jsonb(c),
        'enrollment_count',(select count(*) from ai_network.ai_training_enrollments e where e.organization_id=c.organization_id and e.course_id=c.course_id),
        'completed_count',(select count(*) from ai_network.ai_training_enrollments e where e.organization_id=c.organization_id and e.course_id=c.course_id and e.enrollment_status='completed')
      ) item,c.created_at from ai_network.ai_training_courses c
      where c.organization_id=v_org order by c.created_at desc limit 500
    ) q;
    return v_result;
  end if;

  if v_action='create_training_course' then
    v_key:=lower(trim(coalesce(v_payload->>'course_key','')));
    v_title:=left(trim(coalesce(v_payload->>'course_title','')),160);
    v_description:=left(coalesce(v_payload->>'description',''),4000);
    v_objectives:=coalesce(v_payload->'learning_objectives','[]'::jsonb);
    v_required:=coalesce((v_payload->>'required_training')::boolean,false);
    v_idempotency:=nullif(trim(v_payload->>'idempotency_key'),'');
    if v_key !~ '^[a-z0-9][a-z0-9_-]{1,78}[a-z0-9]$' or length(v_title)<3
       or v_idempotency is null or length(v_idempotency)<8 or length(v_idempotency)>160
       or jsonb_typeof(v_objectives)<>'array' or jsonb_array_length(v_objectives)>30 then
      raise exception using errcode='22023',message='Provide a valid course key, title, idempotency key and up to 30 learning objectives.';
    end if;
    if exists(select 1 from jsonb_array_elements(v_objectives) as obj(value)
      where jsonb_typeof(obj.value)<>'string' or length(trim(obj.value #>> '{}')) not between 2 and 240) then
      raise exception using errcode='22023',message='Each learning objective must be text between 2 and 240 characters.';
    end if;
    insert into ai_network.ai_training_courses(organization_id,course_key,course_title,description,learning_objectives,required_training,course_status,created_by_user_id,idempotency_key)
    values(v_org,v_key,v_title,v_description,v_objectives,v_required,'draft',p_actor_user_id,v_idempotency)
    on conflict(organization_id,idempotency_key) where idempotency_key is not null do nothing
    returning course_id into v_course;
    if v_course is null then
      select c.course_id into v_course from ai_network.ai_training_courses c where c.organization_id=v_org and c.idempotency_key=v_idempotency;
      if v_course is null then raise exception using errcode='23505',message='A training course with that key already exists.'; end if;
      v_reused:=true;
    else
      insert into ai_network.ai_training_course_history(organization_id,course_id,action,new_status,actor_user_id)
      values(v_org,v_course,'course_created','draft',p_actor_user_id);
    end if;
    select jsonb_build_object('course',to_jsonb(c)) into v_result from ai_network.ai_training_courses c where c.organization_id=v_org and c.course_id=v_course;
    return jsonb_build_object('result',v_result,'reused',v_reused);
  end if;

  if v_action='set_training_course_status' then
    v_course:=nullif(v_payload->>'course_id','')::uuid;
    v_status:=lower(coalesce(v_payload->>'status',''));
    v_reason:=left(trim(coalesce(v_payload->>'reason','')),1000);
    if v_status not in ('published','archived') then raise exception using errcode='22023',message='Choose published or archived as the course status.'; end if;
    select c.course_status into v_previous from ai_network.ai_training_courses c where c.organization_id=v_org and c.course_id=v_course for update;
    if v_previous is null then raise exception using errcode='P0002',message='Training course not found.'; end if;
    if v_previous=v_status then
      select to_jsonb(c) into v_result from ai_network.ai_training_courses c where c.organization_id=v_org and c.course_id=v_course;
      return jsonb_build_object('course',v_result,'reused',true);
    end if;
    if v_previous='archived' or (v_previous='published' and v_status<>'archived')
       or (v_previous='draft' and v_status not in ('published','archived'))
       or (v_status='archived' and length(v_reason)<3) then
      raise exception using errcode='22023',message='Course status transition is not allowed; provide a reason to archive.';
    end if;
    update ai_network.ai_training_courses c set course_status=v_status,updated_at=now() where c.organization_id=v_org and c.course_id=v_course;
    insert into ai_network.ai_training_course_history(organization_id,course_id,action,previous_status,new_status,reason,actor_user_id)
    values(v_org,v_course,case when v_status='published' then 'course_published' else 'course_archived' end,v_previous,v_status,v_reason,p_actor_user_id);
    select to_jsonb(c) into v_result from ai_network.ai_training_courses c where c.organization_id=v_org and c.course_id=v_course;
    return jsonb_build_object('course',v_result,'reused',false);
  end if;

  if v_action='list_training_enrollments' then
    select coalesce(jsonb_agg(q.item order by q.created_at desc),'[]'::jsonb) into v_result
    from (
      select jsonb_build_object('enrollment',to_jsonb(e),'course_title',c.course_title,'course_key',c.course_key,
        'identity',jsonb_build_object('identity_id',i.identity_id,'display_name',n.display_name,'username',n.username),
        'position_name',p.display_name) item,e.created_at
      from ai_network.ai_training_enrollments e
      join ai_network.ai_training_courses c on c.organization_id=e.organization_id and c.course_id=e.course_id
      join ai_network.ai_employment_records emp on emp.organization_id=e.organization_id and emp.employment_id=e.employment_id
      join ai_network.ai_identities i on i.identity_id=emp.identity_id
      left join ai_network.ai_names n on n.identity_id=i.identity_id
      left join ai_network.ai_positions p on p.organization_id=emp.organization_id and p.position_id=emp.position_id
      where e.organization_id=v_org
        and (v_payload->>'course_id' is null or e.course_id=(v_payload->>'course_id')::uuid)
        and (v_payload->>'employment_id' is null or e.employment_id=(v_payload->>'employment_id')::uuid)
      order by e.created_at desc limit 500
    ) q;
    return v_result;
  end if;

  if v_action='assign_training' then
    v_course:=nullif(v_payload->>'course_id','')::uuid;
    v_employment:=nullif(v_payload->>'employment_id','')::uuid;
    v_due:=nullif(v_payload->>'due_on','')::date;
    v_idempotency:=nullif(trim(v_payload->>'idempotency_key'),'');
    if v_course is null or v_employment is null or v_idempotency is null or length(v_idempotency) not between 8 and 160 then
      raise exception using errcode='22023',message='Choose a course, employee and stable idempotency key.';
    end if;
    if not exists(select 1 from ai_network.ai_training_courses c where c.organization_id=v_org and c.course_id=v_course and c.course_status='published') then
      raise exception using errcode='22023',message='Only published courses can be assigned.';
    end if;
    if not exists(select 1 from ai_network.ai_employment_records e where e.organization_id=v_org and e.employment_id=v_employment and e.employment_status in ('onboarding','active','restricted')) then
      raise exception using errcode='22023',message='Training can only be assigned to onboarding, active or restricted employees.';
    end if;
    insert into ai_network.ai_training_enrollments(organization_id,course_id,employment_id,enrollment_status,assigned_by_user_id,due_on,idempotency_key)
    values(v_org,v_course,v_employment,'assigned',p_actor_user_id,v_due,v_idempotency)
    on conflict do nothing returning enrollment_id into v_enrollment;
    if v_enrollment is null then
      select e.enrollment_id into v_enrollment from ai_network.ai_training_enrollments e
      where e.organization_id=v_org and (e.idempotency_key=v_idempotency or (e.course_id=v_course and e.employment_id=v_employment))
      order by (e.idempotency_key=v_idempotency) desc limit 1;
      if v_enrollment is null then raise exception using errcode='23505',message='Training assignment already exists with a different request.'; end if;
      v_reused:=true;
    else
      insert into ai_network.ai_training_enrollment_history(organization_id,enrollment_id,action,new_status,actor_user_id)
      values(v_org,v_enrollment,'training_assigned','assigned',p_actor_user_id);
    end if;
    select jsonb_build_object('enrollment',to_jsonb(e)) into v_result from ai_network.ai_training_enrollments e where e.organization_id=v_org and e.enrollment_id=v_enrollment;
    return jsonb_build_object('result',v_result,'reused',v_reused);
  end if;

  if v_action='set_training_enrollment_status' then
    v_enrollment:=nullif(v_payload->>'enrollment_id','')::uuid;
    v_status:=lower(coalesce(v_payload->>'status',''));
    v_reason:=left(trim(coalesce(v_payload->>'reason','')),1000);
    v_note:=left(trim(coalesce(v_payload->>'completion_note','')),2000);
    v_score:=nullif(v_payload->>'score','')::numeric;
    if v_status not in ('in_progress','completed','waived','cancelled') then raise exception using errcode='22023',message='Choose a valid training enrollment status.'; end if;
    select e.enrollment_status into v_previous from ai_network.ai_training_enrollments e where e.organization_id=v_org and e.enrollment_id=v_enrollment for update;
    if v_previous is null then raise exception using errcode='P0002',message='Training enrollment not found.'; end if;
    if v_previous=v_status then return jsonb_build_object('enrollment_id',v_enrollment,'status',v_status,'reused',true); end if;
    if not ((v_previous='assigned' and v_status in ('in_progress','completed','waived','cancelled')) or (v_previous='in_progress' and v_status in ('completed','waived','cancelled'))) then
      raise exception using errcode='22023',message='Training enrollment status transition is not allowed.';
    end if;
    if v_status in ('waived','cancelled') and length(v_reason)<10 then raise exception using errcode='22023',message='A reason of at least ten characters is required to waive or cancel training.'; end if;
    if v_status='completed' and length(v_note)<10 and v_score is null then raise exception using errcode='22023',message='Record a completion note or score before completing training.'; end if;
    if v_score is not null and (v_score<0 or v_score>100) then raise exception using errcode='22023',message='Training score must be between 0 and 100.'; end if;
    update ai_network.ai_training_enrollments e set enrollment_status=v_status,
      started_at=case when v_status='in_progress' then coalesce(e.started_at,now()) else e.started_at end,
      completed_at=case when v_status='completed' then now() else e.completed_at end,
      score=case when v_status='completed' then v_score else e.score end,
      completion_note=case when v_status='completed' then v_note else e.completion_note end,
      updated_at=now()
    where e.organization_id=v_org and e.enrollment_id=v_enrollment;
    insert into ai_network.ai_training_enrollment_history(organization_id,enrollment_id,action,previous_status,new_status,reason,actor_user_id)
    values(v_org,v_enrollment,case v_status when 'in_progress' then 'training_started' when 'completed' then 'training_completed' when 'waived' then 'training_waived' else 'training_cancelled' end,
      v_previous,v_status,case when v_status in ('waived','cancelled') then v_reason else v_note end,p_actor_user_id);
    select jsonb_build_object('enrollment',to_jsonb(e)) into v_result from ai_network.ai_training_enrollments e where e.organization_id=v_org and e.enrollment_id=v_enrollment;
    return jsonb_build_object('result',v_result,'reused',false);
  end if;

  if v_action='list_attendance' then
    select coalesce(jsonb_agg(q.item order by q.attendance_date desc,q.created_at desc),'[]'::jsonb) into v_result
    from (
      select jsonb_build_object('attendance',to_jsonb(a),
        'identity',jsonb_build_object('identity_id',i.identity_id,'display_name',n.display_name,'username',n.username),
        'position_name',p.display_name) item,a.attendance_date,a.created_at
      from ai_network.ai_employee_attendance a
      join ai_network.ai_employment_records emp on emp.organization_id=a.organization_id and emp.employment_id=a.employment_id
      join ai_network.ai_identities i on i.identity_id=emp.identity_id
      left join ai_network.ai_names n on n.identity_id=i.identity_id
      left join ai_network.ai_positions p on p.organization_id=emp.organization_id and p.position_id=emp.position_id
      where a.organization_id=v_org
        and (v_payload->>'employment_id' is null or a.employment_id=(v_payload->>'employment_id')::uuid)
        and (v_payload->>'from_date' is null or a.attendance_date>=(v_payload->>'from_date')::date)
        and (v_payload->>'to_date' is null or a.attendance_date<=(v_payload->>'to_date')::date)
      order by a.attendance_date desc,a.created_at desc limit 500
    ) q;
    return v_result;
  end if;

  if v_action='record_attendance' then
    v_employment:=nullif(v_payload->>'employment_id','')::uuid;
    v_att_date:=nullif(v_payload->>'attendance_date','')::date;
    v_status:=lower(coalesce(v_payload->>'attendance_status',''));
    v_in:=nullif(v_payload->>'check_in_at','')::timestamptz;
    v_out:=nullif(v_payload->>'check_out_at','')::timestamptz;
    v_reason:=left(trim(coalesce(v_payload->>'reason','')),2000);
    v_idempotency:=nullif(trim(v_payload->>'idempotency_key'),'');
    if v_employment is null or v_att_date is null or v_idempotency is null or length(v_idempotency) not between 8 and 160
       or v_status not in ('present','late','absent','excused','on_leave') then
      raise exception using errcode='22023',message='Provide an employee, date, valid attendance status and request idempotency key.';
    end if;
    if v_att_date>current_date then raise exception using errcode='22023',message='Attendance cannot be recorded for a future date.'; end if;
    if v_out is not null and (v_in is null or v_out<v_in) then raise exception using errcode='22023',message='Check-out must be later than the recorded check-in.'; end if;
    if v_status in ('present','late') and v_in is null then raise exception using errcode='22023',message='Present or late attendance requires a check-in time.'; end if;
    if v_status in ('absent','excused','on_leave') and length(v_reason)<3 then raise exception using errcode='22023',message='Record a reason for absent, excused or leave attendance.'; end if;
    if not exists(select 1 from ai_network.ai_employment_records e where e.organization_id=v_org and e.employment_id=v_employment
      and e.employment_status in ('onboarding','active','restricted')
      and (e.start_date is null or v_att_date>=e.start_date) and (e.end_date is null or v_att_date<=e.end_date)) then
      raise exception using errcode='22023',message='Attendance can only be recorded for current onboarding, active or restricted employees on their employment dates.';
    end if;
    select a.attendance_id,a.attendance_status into v_attendance,v_previous from ai_network.ai_employee_attendance a
    where a.organization_id=v_org and a.employment_id=v_employment and a.attendance_date=v_att_date for update;
    if v_attendance is null then
      insert into ai_network.ai_employee_attendance(organization_id,employment_id,attendance_date,attendance_status,check_in_at,check_out_at,reason,recorded_by_user_id,idempotency_key)
      values(v_org,v_employment,v_att_date,v_status,v_in,v_out,v_reason,p_actor_user_id,v_idempotency)
      returning attendance_id into v_attendance;
      insert into ai_network.ai_employee_attendance_history(organization_id,attendance_id,action,new_status,reason,actor_user_id,metadata)
      values(v_org,v_attendance,'attendance_recorded',v_status,v_reason,p_actor_user_id,jsonb_build_object('employment_id',v_employment,'attendance_date',v_att_date));
    else
      select to_jsonb(a) into v_existing from ai_network.ai_employee_attendance a where a.organization_id=v_org and a.attendance_id=v_attendance;
      if (v_existing->>'attendance_status')=v_status
         and (v_existing->>'check_in_at')::timestamptz is not distinct from v_in
         and (v_existing->>'check_out_at')::timestamptz is not distinct from v_out
         and coalesce(v_existing->>'reason','')=v_reason then
        return jsonb_build_object('attendance_id',v_attendance,'reused',true);
      end if;
      if length(v_reason)<10 then raise exception using errcode='22023',message='A correction reason of at least ten characters is required to edit a recorded attendance entry.'; end if;
      update ai_network.ai_employee_attendance a set attendance_status=v_status,check_in_at=v_in,check_out_at=v_out,
        reason=v_reason,recorded_by_user_id=p_actor_user_id,idempotency_key=v_idempotency,updated_at=now()
      where a.organization_id=v_org and a.attendance_id=v_attendance;
      insert into ai_network.ai_employee_attendance_history(organization_id,attendance_id,action,previous_status,new_status,reason,actor_user_id,metadata)
      values(v_org,v_attendance,'attendance_corrected',v_previous,v_status,v_reason,p_actor_user_id,jsonb_build_object('previous',v_existing));
    end if;
    select jsonb_build_object('attendance',to_jsonb(a)) into v_result from ai_network.ai_employee_attendance a where a.organization_id=v_org and a.attendance_id=v_attendance;
    return jsonb_build_object('result',v_result,'reused',false);
  end if;

  raise exception using errcode='22023',message='Unsupported AI HR development command.';
end;
$function$;

comment on function public.minglora_ai_hr_development_command(text,uuid,jsonb)
  is 'Owner-scoped human-managed training and attendance workflows; records only administrator-entered completion and attendance.';
revoke all on function public.minglora_ai_hr_development_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_hr_development_command(text,uuid,jsonb) to service_role;
