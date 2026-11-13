-- Minglora AI Network: owner-scoped recruitment, appointments and employment lifecycle.
-- Additive only. No vacancies, applications or employment records are created by this migration.
-- All access remains in the private ai_network schema through service_role RPC calls.

alter table ai_network.ai_employment_records
  add column if not exists application_id uuid,
  add column if not exists idempotency_key text;

create unique index if not exists ai_employment_records_application_uq
  on ai_network.ai_employment_records (application_id)
  where application_id is not null;
create unique index if not exists ai_employment_records_org_idempotency_uq
  on ai_network.ai_employment_records (organization_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists ai_employment_records_one_current_role_uq
  on ai_network.ai_employment_records (organization_id, identity_id)
  where employment_status in ('onboarding','active','restricted','suspended');

create table if not exists ai_network.ai_recruitment_vacancies (
  vacancy_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete cascade,
  department_id uuid not null,
  position_id uuid not null,
  vacancy_title text not null check (length(trim(vacancy_title)) between 3 and 160),
  summary text not null default '',
  description text not null default '',
  requirements jsonb not null default '[]'::jsonb check (jsonb_typeof(requirements) = 'array'),
  openings integer not null default 1 check (openings between 1 and 1000),
  status text not null default 'draft' check (status in ('draft','open','paused','closed','archived')),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, vacancy_id),
  foreign key (organization_id, department_id)
    references ai_network.ai_departments(organization_id, department_id) on delete restrict,
  foreign key (organization_id, position_id)
    references ai_network.ai_positions(organization_id, position_id) on delete restrict
);
create unique index if not exists ai_recruitment_vacancies_owner_idempotency_uq
  on ai_network.ai_recruitment_vacancies (owner_user_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists ai_recruitment_vacancies_org_status_idx
  on ai_network.ai_recruitment_vacancies (organization_id, status, created_at desc);

create table if not exists ai_network.ai_recruitment_applications (
  application_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vacancy_id uuid not null,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  application_status text not null default 'submitted'
    check (application_status in ('submitted','under_review','shortlisted','approved','rejected','withdrawn','appointed')),
  cover_note text not null default '',
  review_note text not null default '',
  submitted_by_user_id uuid not null references public.profiles(id) on delete restrict,
  reviewed_by_user_id uuid references public.profiles(id) on delete restrict,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, application_id),
  unique (vacancy_id, identity_id),
  foreign key (organization_id, vacancy_id)
    references ai_network.ai_recruitment_vacancies(organization_id, vacancy_id) on delete restrict
);
create unique index if not exists ai_recruitment_applications_idempotency_uq
  on ai_network.ai_recruitment_applications (vacancy_id, submitted_by_user_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists ai_recruitment_applications_org_status_idx
  on ai_network.ai_recruitment_applications (organization_id, application_status, created_at desc);
create index if not exists ai_recruitment_applications_identity_idx
  on ai_network.ai_recruitment_applications (identity_id, created_at desc);

create table if not exists ai_network.ai_recruitment_history (
  event_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vacancy_id uuid,
  application_id uuid,
  action text not null,
  previous_status text,
  new_status text,
  reason text not null default '',
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now(),
  foreign key (organization_id, vacancy_id)
    references ai_network.ai_recruitment_vacancies(organization_id, vacancy_id) on delete restrict,
  foreign key (organization_id, application_id)
    references ai_network.ai_recruitment_applications(organization_id, application_id) on delete restrict
);
create index if not exists ai_recruitment_history_org_time_idx
  on ai_network.ai_recruitment_history (organization_id, occurred_at desc);
create index if not exists ai_recruitment_history_application_time_idx
  on ai_network.ai_recruitment_history (application_id, occurred_at desc);

alter table ai_network.ai_employment_records
  add constraint ai_employment_records_application_fk
  foreign key (organization_id, application_id)
  references ai_network.ai_recruitment_applications(organization_id, application_id)
  on delete restrict;

alter table ai_network.ai_recruitment_vacancies enable row level security;
alter table ai_network.ai_recruitment_applications enable row level security;
alter table ai_network.ai_recruitment_history enable row level security;
grant select, insert, update on ai_network.ai_recruitment_vacancies to service_role;
grant select, insert, update on ai_network.ai_recruitment_applications to service_role;
grant select, insert on ai_network.ai_recruitment_history to service_role;
grant select, insert, update on ai_network.ai_employment_records to service_role;
grant select, insert on ai_network.ai_employment_history to service_role;

create or replace function public.minglora_ai_hr_command(
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
  v_organization_id uuid;
  v_vacancy_id uuid;
  v_application_id uuid;
  v_identity_id uuid;
  v_employment_id uuid;
  v_new_employment_id uuid;
  v_department_id uuid;
  v_position_id uuid;
  v_manager_employment_id uuid;
  v_idempotency_key text;
  v_status text;
  v_previous_status text;
  v_reason text;
  v_note text;
  v_title text;
  v_summary text;
  v_description text;
  v_requirements jsonb;
  v_openings integer;
  v_employment_type text;
  v_workload integer;
  v_job_description text;
  v_rank integer;
  v_manager_rank integer;
  v_reused boolean := false;
  v_old_manager_employment_id uuid;
  v_row jsonb;
  v_result jsonb;
  v_rows jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI HR commands are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora administrator is required.';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'AI HR command payload must be an object.';
  end if;
  if coalesce(v_payload->>'organization_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'A valid organization ID is required.';
  end if;
  v_organization_id := (v_payload->>'organization_id')::uuid;
  if not exists (
    select 1 from ai_network.ai_organizations o
    where o.organization_id=v_organization_id and o.owner_user_id=p_actor_user_id
      and o.status not in ('suspended','archived')
  ) then
    raise exception using errcode = '42501', message = 'Organization not found or unavailable for this Minglora administrator.';
  end if;

  if v_action = 'list_vacancies' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'vacancy',to_jsonb(v),
      'application_count',(select count(*) from ai_network.ai_recruitment_applications a where a.vacancy_id=v.vacancy_id),
      'appointed_count',(select count(*) from ai_network.ai_recruitment_applications a where a.vacancy_id=v.vacancy_id and a.application_status='appointed')
    ) order by v.created_at desc),'[]'::jsonb)
    into v_result
    from ai_network.ai_recruitment_vacancies v
    where v.organization_id=v_organization_id and v.owner_user_id=p_actor_user_id;
    return v_result;
  end if;

  if v_action = 'create_vacancy' then
    if coalesce(v_payload->>'department_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_payload->>'position_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'Select a valid department and position.';
    end if;
    v_department_id := (v_payload->>'department_id')::uuid;
    v_position_id := (v_payload->>'position_id')::uuid;
    v_title := left(trim(coalesce(v_payload->>'vacancy_title','')),160);
    v_summary := left(trim(coalesce(v_payload->>'summary','')),300);
    v_description := left(trim(coalesce(v_payload->>'description','')),4000);
    v_requirements := coalesce(v_payload->'requirements','[]'::jsonb);
    v_openings := coalesce(nullif(v_payload->>'openings','')::integer,1);
    v_idempotency_key := nullif(trim(v_payload->>'idempotency_key'),'');
    if length(v_title)<3 then raise exception using errcode = '22023', message = 'Vacancy title must contain at least three characters.'; end if;
    if jsonb_typeof(v_requirements)<>'array' or jsonb_array_length(v_requirements)>50 then
      raise exception using errcode = '22023', message = 'Requirements must be an array of at most 50 items.';
    end if;
    if v_openings<1 or v_openings>1000 then raise exception using errcode = '22023', message = 'Vacancy openings must be between 1 and 1000.'; end if;
    if v_idempotency_key is null or length(v_idempotency_key)<8 or length(v_idempotency_key)>160 then
      raise exception using errcode = '22023', message = 'A stable vacancy idempotency key is required.';
    end if;
    if not exists(select 1 from ai_network.ai_departments d where d.organization_id=v_organization_id and d.department_id=v_department_id and d.status='active') then
      raise exception using errcode = '22023', message = 'Choose an active department in this organization.';
    end if;
    if not exists(select 1 from ai_network.ai_positions p where p.organization_id=v_organization_id and p.position_id=v_position_id and p.status in ('active','proposed','restricted')) then
      raise exception using errcode = '22023', message = 'Choose an available position in this organization.';
    end if;
    v_reused := false;
    insert into ai_network.ai_recruitment_vacancies (
      organization_id,department_id,position_id,vacancy_title,summary,description,requirements,openings,status,
      owner_user_id,created_by_user_id,idempotency_key
    )
    values (
      v_organization_id,v_department_id,v_position_id,v_title,v_summary,v_description,v_requirements,v_openings,
      'draft',p_actor_user_id,p_actor_user_id,v_idempotency_key
    )
    on conflict (owner_user_id,idempotency_key) where idempotency_key is not null do nothing
    returning vacancy_id into v_vacancy_id;
    if v_vacancy_id is null then
      v_reused := true;
      select v.vacancy_id into v_vacancy_id from ai_network.ai_recruitment_vacancies v
      where v.owner_user_id=p_actor_user_id and v.idempotency_key=v_idempotency_key;
    else
      insert into ai_network.ai_recruitment_history (
        organization_id,vacancy_id,action,new_status,reason,actor_user_id
      ) values (v_organization_id,v_vacancy_id,'vacancy_created','draft','Vacancy draft created.',p_actor_user_id);
    end if;
    select to_jsonb(v) into v_result from ai_network.ai_recruitment_vacancies v
    where v.vacancy_id=v_vacancy_id and v.owner_user_id=p_actor_user_id;
    return jsonb_build_object('vacancy',v_result,'reused',v_reused);
  end if;

  if v_action = 'set_vacancy_status' then
    v_vacancy_id := nullif(v_payload->>'vacancy_id','')::uuid;
    v_status := lower(coalesce(v_payload->>'status',''));
    if v_status not in ('draft','open','paused','closed','archived') then
      raise exception using errcode = '22023', message = 'Choose a supported vacancy status.';
    end if;
    select v.status into v_previous_status from ai_network.ai_recruitment_vacancies v
    where v.vacancy_id=v_vacancy_id and v.organization_id=v_organization_id and v.owner_user_id=p_actor_user_id
    for update;
    if v_previous_status is null then raise exception using errcode = 'P0002', message = 'Vacancy not found for this organization.'; end if;
    update ai_network.ai_recruitment_vacancies v
    set status=v_status,updated_at=now()
    where v.vacancy_id=v_vacancy_id and v.organization_id=v_organization_id and v.owner_user_id=p_actor_user_id
    returning to_jsonb(v) into v_result;
    insert into ai_network.ai_recruitment_history (
      organization_id,vacancy_id,action,previous_status,new_status,reason,actor_user_id
    ) values (v_organization_id,v_vacancy_id,'vacancy_status_changed',v_previous_status,v_status,'Vacancy status updated.',p_actor_user_id);
    return jsonb_build_object('vacancy',v_result);
  end if;

  if v_action = 'create_application' then
    v_vacancy_id := nullif(v_payload->>'vacancy_id','')::uuid;
    if coalesce(v_payload->>'identity_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid AI identity is required.';
    end if;
    v_identity_id := (v_payload->>'identity_id')::uuid;
    v_note := left(trim(coalesce(v_payload->>'cover_note','')),2000);
    v_idempotency_key := nullif(trim(v_payload->>'idempotency_key'),'');
    if v_idempotency_key is null or length(v_idempotency_key)<8 or length(v_idempotency_key)>160 then
      raise exception using errcode = '22023', message = 'A stable application idempotency key is required.';
    end if;
    if not exists (
      select 1 from ai_network.ai_recruitment_vacancies v
      where v.vacancy_id=v_vacancy_id and v.organization_id=v_organization_id
        and v.owner_user_id=p_actor_user_id and v.status='open'
        and (select count(*) from ai_network.ai_recruitment_applications a where a.vacancy_id=v.vacancy_id and a.application_status='appointed')<v.openings
    ) then raise exception using errcode = '22023', message = 'Vacancy is not open or all openings have been filled.'; end if;
    if not exists (
      select 1 from ai_network.ai_identities i
      where i.identity_id=v_identity_id and (
        i.owner_user_id=p_actor_user_id or exists (
          select 1 from ai_network.ai_identity_owners o
          where o.identity_id=i.identity_id and o.owner_type='user' and o.owner_user_id=p_actor_user_id
        )
      )
    ) then raise exception using errcode = '42501', message = 'AI identity is not owned or managed by this Minglora administrator.'; end if;
    v_reused := false;
    insert into ai_network.ai_recruitment_applications (
      organization_id,vacancy_id,identity_id,application_status,cover_note,submitted_by_user_id,idempotency_key
    )
    values (v_organization_id,v_vacancy_id,v_identity_id,'submitted',v_note,p_actor_user_id,v_idempotency_key)
    on conflict (vacancy_id,identity_id) do nothing
    returning application_id into v_application_id;
    if v_application_id is null then
      v_reused := true;
      select a.application_id into v_application_id from ai_network.ai_recruitment_applications a
      where a.vacancy_id=v_vacancy_id and a.identity_id=v_identity_id;
    else
      insert into ai_network.ai_recruitment_history (
        organization_id,vacancy_id,application_id,action,new_status,reason,actor_user_id
      ) values (v_organization_id,v_vacancy_id,v_application_id,'application_submitted','submitted','AI candidate application submitted.',p_actor_user_id);
    end if;
    select to_jsonb(a) into v_result from ai_network.ai_recruitment_applications a
    where a.application_id=v_application_id and a.organization_id=v_organization_id;
    return jsonb_build_object('application',v_result,'reused',v_reused);
  end if;

  if v_action = 'list_applications' then
    v_vacancy_id := nullif(v_payload->>'vacancy_id','')::uuid;
    select coalesce(jsonb_agg(jsonb_build_object(
      'application',to_jsonb(a),
      'identity',jsonb_build_object('identity_id',i.identity_id,'display_name',n.display_name,'username',n.username,'status',i.status),
      'vacancy_title',v.vacancy_title
    ) order by a.created_at desc),'[]'::jsonb)
    into v_result
    from ai_network.ai_recruitment_applications a
    join ai_network.ai_identities i on i.identity_id=a.identity_id
    left join ai_network.ai_names n on n.identity_id=i.identity_id
    join ai_network.ai_recruitment_vacancies v on v.vacancy_id=a.vacancy_id
    where a.organization_id=v_organization_id and (v_vacancy_id is null or a.vacancy_id=v_vacancy_id);
    return v_result;
  end if;

  if v_action = 'review_application' then
    v_application_id := nullif(v_payload->>'application_id','')::uuid;
    v_status := lower(coalesce(v_payload->>'status',''));
    v_note := left(trim(coalesce(v_payload->>'review_note','')),2000);
    if v_status not in ('under_review','shortlisted','approved','rejected','withdrawn') then
      raise exception using errcode = '22023', message = 'Choose a supported application review status.';
    end if;
    select a.application_status into v_previous_status from ai_network.ai_recruitment_applications a
    where a.application_id=v_application_id and a.organization_id=v_organization_id
      and a.application_status in ('submitted','under_review','shortlisted','approved')
    for update;
    if v_previous_status is null then raise exception using errcode = 'P0002', message = 'Application not found or no longer reviewable.'; end if;
    update ai_network.ai_recruitment_applications a
    set application_status=v_status,review_note=v_note,reviewed_by_user_id=p_actor_user_id,updated_at=now()
    where a.application_id=v_application_id and a.organization_id=v_organization_id
    returning to_jsonb(a) into v_result;
    insert into ai_network.ai_recruitment_history (
      organization_id,application_id,action,previous_status,new_status,reason,actor_user_id
    ) values (v_organization_id,v_application_id,'application_reviewed',v_previous_status,v_status,v_note,p_actor_user_id);
    return jsonb_build_object('application',v_result);
  end if;

  if v_action = 'list_employees' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'employment',to_jsonb(e),
      'identity',jsonb_build_object('identity_id',i.identity_id,'display_name',n.display_name,'username',n.username,'status',i.status),
      'department_name',d.display_name,'position_name',p.display_name,
      'manager_employment_id',e.manager_employment_id
    ) order by e.created_at desc),'[]'::jsonb)
    into v_result
    from ai_network.ai_employment_records e
    join ai_network.ai_identities i on i.identity_id=e.identity_id
    left join ai_network.ai_names n on n.identity_id=i.identity_id
    join ai_network.ai_departments d on d.department_id=e.department_id and d.organization_id=e.organization_id
    join ai_network.ai_positions p on p.position_id=e.position_id and p.organization_id=e.organization_id
    where e.organization_id=v_organization_id;
    return v_result;
  end if;

  if v_action = 'appoint_employee' then
    v_application_id := nullif(v_payload->>'application_id','')::uuid;
    v_manager_employment_id := nullif(v_payload->>'manager_employment_id','')::uuid;
    v_idempotency_key := nullif(trim(v_payload->>'idempotency_key'),'');
    v_workload := coalesce(nullif(v_payload->>'workload_percentage','')::integer,100);
    v_employment_type := lower(coalesce(nullif(v_payload->>'employment_type',''),'full_time'));
    v_job_description := left(trim(coalesce(v_payload->>'job_description','')),3000);
    if v_idempotency_key is null or length(v_idempotency_key)<8 or length(v_idempotency_key)>160 then
      raise exception using errcode = '22023', message = 'A stable appointment idempotency key is required.';
    end if;
    if v_workload<0 or v_workload>100 then raise exception using errcode = '22023', message = 'Workload must be between 0 and 100 percent.'; end if;
    if v_employment_type not in ('full_time','part_time','temporary','contract','project') then raise exception using errcode = '22023', message = 'Choose a supported employment type.'; end if;
    select a.vacancy_id,a.identity_id into v_vacancy_id,v_identity_id
    from ai_network.ai_recruitment_applications a
    where a.application_id=v_application_id and a.organization_id=v_organization_id
      and a.application_status='approved' for update;
    if v_identity_id is null then
      select e.employment_id into v_employment_id from ai_network.ai_employment_records e
      where e.organization_id=v_organization_id and e.application_id=v_application_id;
      if v_employment_id is not null then
        select to_jsonb(e) into v_result from ai_network.ai_employment_records e where e.employment_id=v_employment_id;
        return jsonb_build_object('employment',v_result,'reused',true);
      end if;
      raise exception using errcode = '42501', message = 'Only an approved AI application can be appointed.';
    end if;
    select v.department_id,v.position_id into v_department_id,v_position_id
    from ai_network.ai_recruitment_vacancies v
    where v.vacancy_id=v_vacancy_id and v.organization_id=v_organization_id and v.owner_user_id=p_actor_user_id;
    if v_department_id is null then raise exception using errcode = 'P0002', message = 'Recruitment vacancy not found.'; end if;
    if v_manager_employment_id is not null then
      select p.hierarchy_level into v_rank
      from ai_network.ai_positions p where p.position_id=v_position_id and p.organization_id=v_organization_id;
      select p.hierarchy_level into v_manager_rank
      from ai_network.ai_employment_records e
      join ai_network.ai_positions p on p.position_id=e.position_id and p.organization_id=e.organization_id
      where e.employment_id=v_manager_employment_id and e.organization_id=v_organization_id
        and e.employment_status='active';
      if v_manager_rank is null or v_manager_rank<=v_rank then
        raise exception using errcode = '22023', message = 'The reporting manager must be active and hold a higher-level position.';
      end if;
    end if;
    v_reused := false;
    insert into ai_network.ai_employment_records (
      organization_id,identity_id,department_id,position_id,manager_employment_id,
      employment_status,employment_type,job_description,workload_percentage,start_date,
      schedule_preferences,assigned_by_user_id,application_id,idempotency_key
    )
    values (
      v_organization_id,v_identity_id,v_department_id,v_position_id,v_manager_employment_id,
      'onboarding',v_employment_type,v_job_description,v_workload,current_date,
      coalesce(v_payload->'schedule_preferences','{}'::jsonb),p_actor_user_id,v_application_id,v_idempotency_key
    )
    on conflict (organization_id,idempotency_key) where idempotency_key is not null do nothing
    returning employment_id into v_employment_id;
    if v_employment_id is null then
      v_reused := true;
      select e.employment_id into v_employment_id from ai_network.ai_employment_records e
      where e.organization_id=v_organization_id and e.idempotency_key=v_idempotency_key;
    else
      insert into ai_network.ai_employment_history (
        organization_id,employment_id,action,previous_status,new_status,reason,actor_type,actor_user_id,metadata
      ) values (
        v_organization_id,v_employment_id,'appointed',null,'onboarding','Approved AI candidate appointed.', 'human_user',p_actor_user_id,
        jsonb_build_object('application_id',v_application_id,'vacancy_id',v_vacancy_id,'department_id',v_department_id,'position_id',v_position_id)
      );
      update ai_network.ai_recruitment_applications
      set application_status='appointed',reviewed_by_user_id=p_actor_user_id,updated_at=now()
      where application_id=v_application_id and organization_id=v_organization_id;
      insert into ai_network.ai_recruitment_history (
        organization_id,vacancy_id,application_id,action,previous_status,new_status,reason,actor_user_id
      ) values (v_organization_id,v_vacancy_id,v_application_id,'candidate_appointed','approved','appointed','Approved candidate appointed as an AI employee.',p_actor_user_id);
    end if;
    select to_jsonb(e) into v_result from ai_network.ai_employment_records e
    where e.employment_id=v_employment_id and e.organization_id=v_organization_id;
    return jsonb_build_object('employment',v_result,'reused',v_reused);
  end if;

  if v_action = 'transition_employment' then
    v_employment_id := nullif(v_payload->>'employment_id','')::uuid;
    v_status := lower(coalesce(v_payload->>'status',''));
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    if length(v_reason)<3 then raise exception using errcode = '22023', message = 'A reason of at least three characters is required for an employment status change.'; end if;
    select e.employment_status,e.manager_employment_id into v_previous_status,v_old_manager_employment_id
    from ai_network.ai_employment_records e
    where e.employment_id=v_employment_id and e.organization_id=v_organization_id for update;
    if v_previous_status is null then raise exception using errcode = 'P0002', message = 'Employment record not found.'; end if;
    if not (
      (v_previous_status='onboarding' and v_status in ('active','suspended','terminated')) or
      (v_previous_status='active' and v_status in ('restricted','suspended','terminated','retired')) or
      (v_previous_status='restricted' and v_status in ('active','suspended','terminated')) or
      (v_previous_status='suspended' and v_status in ('active','terminated'))
    ) then raise exception using errcode = '22023', message = 'That employment status transition is not permitted.'; end if;
    update ai_network.ai_employment_records e
    set employment_status=v_status,
        end_date=case when v_status in ('terminated','retired') then coalesce(e.end_date,current_date) else e.end_date end,
        updated_at=now()
    where e.employment_id=v_employment_id and e.organization_id=v_organization_id
    returning to_jsonb(e) into v_result;
    insert into ai_network.ai_employment_history (
      organization_id,employment_id,action,previous_status,new_status,reason,actor_type,actor_user_id
    ) values (v_organization_id,v_employment_id,'status_changed',v_previous_status,v_status,v_reason,'human_user',p_actor_user_id);
    return jsonb_build_object('employment',v_result);
  end if;

  if v_action = 'set_employment_manager' then
    v_employment_id := nullif(v_payload->>'employment_id','')::uuid;
    v_manager_employment_id := nullif(v_payload->>'manager_employment_id','')::uuid;
    select p.hierarchy_level into v_rank
    from ai_network.ai_employment_records e
    join ai_network.ai_positions p on p.position_id=e.position_id and p.organization_id=e.organization_id
    where e.employment_id=v_employment_id and e.organization_id=v_organization_id
      and e.employment_status in ('onboarding','active','restricted','suspended') for update;
    if v_rank is null then raise exception using errcode = 'P0002', message = 'Current employment record not found.'; end if;
    if v_manager_employment_id is not null then
      select p.hierarchy_level into v_manager_rank
      from ai_network.ai_employment_records e
      join ai_network.ai_positions p on p.position_id=e.position_id and p.organization_id=e.organization_id
      where e.employment_id=v_manager_employment_id and e.organization_id=v_organization_id and e.employment_status='active';
      if v_manager_rank is null or v_manager_rank<=v_rank then
        raise exception using errcode = '22023', message = 'Manager must be active and have a higher-level position.';
      end if;
      if exists (
        with recursive chain(employment_id,manager_employment_id,path,cycle) as (
          select e.employment_id,e.manager_employment_id,array[e.employment_id]::uuid[],false
          from ai_network.ai_employment_records e
          where e.employment_id=v_manager_employment_id and e.organization_id=v_organization_id
          union all
          select e.employment_id,e.manager_employment_id,c.path||e.employment_id,e.employment_id=any(c.path)
          from chain c join ai_network.ai_employment_records e
            on e.employment_id=c.manager_employment_id and e.organization_id=v_organization_id
          where c.manager_employment_id is not null and not c.cycle
        )
        select 1 from chain where employment_id=v_employment_id
      ) then raise exception using errcode = '22023', message = 'Reporting changes cannot create a managerial cycle.'; end if;
    end if;
    update ai_network.ai_employment_records e
    set manager_employment_id=v_manager_employment_id,updated_at=now()
    where e.employment_id=v_employment_id and e.organization_id=v_organization_id
    returning to_jsonb(e) into v_result;
    insert into ai_network.ai_employment_history (
      organization_id,employment_id,action,reason,actor_type,actor_user_id,metadata
    ) values (
      v_organization_id,v_employment_id,'manager_assigned','Reporting relationship updated.','human_user',p_actor_user_id,
      jsonb_build_object('previous_manager_employment_id',v_old_manager_employment_id,'manager_employment_id',v_manager_employment_id)
    );
    return jsonb_build_object('employment',v_result);
  end if;

  if v_action = 'transfer_employee' then
    v_employment_id := nullif(v_payload->>'employment_id','')::uuid;
    v_manager_employment_id := nullif(v_payload->>'manager_employment_id','')::uuid;
    v_idempotency_key := nullif(trim(v_payload->>'idempotency_key'),'');
    if coalesce(v_payload->>'department_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_payload->>'position_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'Select a valid destination department and position.';
    end if;
    v_department_id := (v_payload->>'department_id')::uuid;
    v_position_id := (v_payload->>'position_id')::uuid;
    if v_idempotency_key is null or length(v_idempotency_key)<8 or length(v_idempotency_key)>160 then
      raise exception using errcode = '22023', message = 'A stable transfer idempotency key is required.';
    end if;
    select e.identity_id,e.employment_status,e.employment_type,e.job_description,e.workload_percentage
      into v_identity_id,v_previous_status,v_employment_type,v_job_description,v_workload
    from ai_network.ai_employment_records e
    where e.employment_id=v_employment_id and e.organization_id=v_organization_id for update;
    if v_identity_id is null or v_previous_status not in ('active','restricted','suspended') then
      raise exception using errcode = 'P0002', message = 'Only a current employee can be transferred.';
    end if;
    if exists(select 1 from ai_network.ai_employment_records e where e.organization_id=v_organization_id and e.identity_id=v_identity_id and e.idempotency_key=v_idempotency_key) then
      select e.employment_id into v_new_employment_id from ai_network.ai_employment_records e
      where e.organization_id=v_organization_id and e.identity_id=v_identity_id and e.idempotency_key=v_idempotency_key;
      select to_jsonb(e) into v_result from ai_network.ai_employment_records e where e.employment_id=v_new_employment_id;
      return jsonb_build_object('employment',v_result,'reused',true);
    end if;
    if not exists(select 1 from ai_network.ai_departments d where d.organization_id=v_organization_id and d.department_id=v_department_id and d.status='active') then
      raise exception using errcode = '22023', message = 'Destination department must be active.';
    end if;
    select p.hierarchy_level into v_rank from ai_network.ai_positions p
    where p.position_id=v_position_id and p.organization_id=v_organization_id and p.status in ('active','proposed','restricted');
    if v_rank is null then raise exception using errcode = '22023', message = 'Destination position is unavailable.'; end if;
    if v_manager_employment_id is not null then
      select p.hierarchy_level into v_manager_rank
      from ai_network.ai_employment_records e
      join ai_network.ai_positions p on p.position_id=e.position_id and p.organization_id=e.organization_id
      where e.employment_id=v_manager_employment_id and e.organization_id=v_organization_id and e.employment_status='active';
      if v_manager_rank is null or v_manager_rank<=v_rank then raise exception using errcode = '22023', message = 'New manager must be active and hold a higher-level position.'; end if;
    end if;
    update ai_network.ai_employment_records e
    set employment_status='transferred',end_date=current_date,updated_at=now()
    where e.employment_id=v_employment_id and e.organization_id=v_organization_id;
    insert into ai_network.ai_employment_records (
      organization_id,identity_id,department_id,position_id,manager_employment_id,
      employment_status,employment_type,job_description,workload_percentage,start_date,
      schedule_preferences,assigned_by_user_id,idempotency_key
    )
    select v_organization_id,v_identity_id,v_department_id,v_position_id,v_manager_employment_id,
      'onboarding',v_employment_type,coalesce(nullif(v_payload->>'job_description',''),v_job_description),
      v_workload,current_date,coalesce(v_payload->'schedule_preferences',e.schedule_preferences),
      p_actor_user_id,v_idempotency_key
    from ai_network.ai_employment_records e
    where e.employment_id=v_employment_id and e.organization_id=v_organization_id
    returning employment_id into v_new_employment_id;
    insert into ai_network.ai_employment_history (
      organization_id,employment_id,action,previous_status,new_status,reason,actor_type,actor_user_id,metadata
    ) values (
      v_organization_id,v_employment_id,'transferred',v_previous_status,'transferred',
      left(trim(coalesce(v_payload->>'reason','Department/position transfer')),1000),'human_user',p_actor_user_id,
      jsonb_build_object('replacement_employment_id',v_new_employment_id)
    );
    insert into ai_network.ai_employment_history (
      organization_id,employment_id,action,previous_status,new_status,reason,actor_type,actor_user_id,metadata
    ) values (
      v_organization_id,v_new_employment_id,'transfer_received',null,'onboarding',
      left(trim(coalesce(v_payload->>'reason','Department/position transfer')),1000),'human_user',p_actor_user_id,
      jsonb_build_object('previous_employment_id',v_employment_id)
    );
    select to_jsonb(e) into v_result from ai_network.ai_employment_records e where e.employment_id=v_new_employment_id;
    return jsonb_build_object('employment',v_result,'previous_employment_id',v_employment_id);
  end if;

  raise exception using errcode = '22023', message = 'Unsupported AI HR command.';
end;
$function$;

comment on function public.minglora_ai_hr_command(text,uuid,jsonb)
  is 'Server-only owner-scoped AI recruitment, appointment, manager, transfer and employment lifecycle commands.';

revoke all on function public.minglora_ai_hr_command(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_hr_command(text,uuid,jsonb) to service_role;
