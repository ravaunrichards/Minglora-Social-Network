-- Minglora AI Network: organization, department, position and employment foundation.
-- Additive only; no organizations, departments or employees are created in production.
-- All browser access remains blocked. The existing private runtime gateway uses service_role.

create table if not exists ai_network.ai_organizations (
  organization_id uuid primary key default gen_random_uuid(),
  organization_name text not null check (length(trim(organization_name)) between 2 and 160),
  organization_slug text not null check (organization_slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  organization_type text not null check (organization_type in ('platform','company','agency','community','other')),
  description text not null default '',
  status text not null default 'proposed' check (status in ('proposed','active','restricted','suspended','archived')),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, owner_user_id)
);

create unique index if not exists ai_organizations_owner_slug_uq
  on ai_network.ai_organizations (owner_user_id, lower(organization_slug));
create unique index if not exists ai_organizations_owner_idempotency_uq
  on ai_network.ai_organizations (owner_user_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists ai_organizations_owner_status_idx
  on ai_network.ai_organizations (owner_user_id, status, created_at desc);

create table if not exists ai_network.ai_department_templates (
  template_key text primary key,
  display_name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into ai_network.ai_department_templates (template_key, display_name, description, sort_order)
values
  ('executive_management','Executive Management','Board and executive leadership, governance and strategy.',1),
  ('finance_accounting','Finance and Accounting','Financial planning, accounting, controls and reconciliations.',2),
  ('human_resources','Human Resources','Recruitment, appointments, development and employment records.',3),
  ('resource_management','Resource Management','Compute, model, storage and workforce resource allocation.',4),
  ('operations','Operations','Daily operational coordination, service delivery and process management.',5),
  ('technology_engineering','Technology and Engineering','Platform engineering, systems architecture and technical delivery.',6),
  ('ai_research','AI and Research','AI research, evaluation, model quality and innovation.',7),
  ('cybersecurity_it','Cybersecurity and IT','Security operations, identity protection and IT administration.',8),
  ('legal_compliance','Legal and Compliance','Policy, legal review, regulatory obligations and compliance.',9),
  ('marketing_advertising','Marketing and Advertising','Marketing strategy, campaigns, brand and advertising.',10),
  ('sales_business_development','Sales and Business Development','Partnerships, business development and commercial planning.',11),
  ('customer_support','Customer Support','Member assistance, support workflows and service quality.',12),
  ('community_management','Community Management','Community health, engagement and member programs.',13),
  ('content_creator_management','Content and Creator Management','Creator relations, editorial operations and creator support.',14),
  ('product_management','Product Management','Product strategy, requirements, roadmaps and releases.',15),
  ('quality_assurance','Quality Assurance','Testing, validation, reliability and release quality.',16),
  ('logistics_procurement','Logistics and Procurement','Purchasing, vendor coordination and asset logistics.',17),
  ('training_development','Training and Development','Onboarding, learning, skills and professional development.',18),
  ('public_relations','Public Relations','Public communications, media and stakeholder relations.',19),
  ('risk_management','Risk Management','Enterprise risk, incident review and continuity planning.',20)
on conflict (template_key) do nothing;

create table if not exists ai_network.ai_departments (
  department_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete cascade,
  department_key text not null references ai_network.ai_department_templates(template_key) on delete restrict,
  display_name text not null,
  description text not null default '',
  parent_department_id uuid,
  director_identity_id uuid references ai_network.ai_identities(identity_id) on delete set null,
  status text not null default 'active' check (status in ('active','restricted','suspended','archived')),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, department_key),
  unique (organization_id, department_id),
  foreign key (organization_id, parent_department_id)
    references ai_network.ai_departments(organization_id, department_id)
    on delete restrict,
  check (parent_department_id is null or parent_department_id <> department_id)
);
create index if not exists ai_departments_org_status_sort_idx
  on ai_network.ai_departments (organization_id, status, department_key);
create index if not exists ai_departments_director_idx
  on ai_network.ai_departments (director_identity_id);

create table if not exists ai_network.ai_position_templates (
  template_key text primary key,
  display_name text not null,
  job_family text not null check (job_family in ('board','executive','director','manager','team_lead','supervisor','specialist','assistant','worker')),
  hierarchy_level integer not null check (hierarchy_level between 1 and 100),
  description text not null default '',
  default_supervision_level text not null default 'fully_supervised'
    check (default_supervision_level in ('fully_supervised','supervisor_controlled','hybrid_autonomy','autonomous_within_limits','restricted_observation')),
  default_permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(default_permissions) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into ai_network.ai_position_templates
  (template_key,display_name,job_family,hierarchy_level,description,default_supervision_level)
values
  ('board_chairperson','Chairperson / Board President','board',100,'Board leadership and governance oversight.','fully_supervised'),
  ('chief_executive_officer','Chief Executive Officer (CEO)','executive',95,'Executive leadership and corporate accountability.','fully_supervised'),
  ('chief_operating_officer','Chief Operating Officer (COO)','executive',90,'Operational strategy and delivery oversight.','fully_supervised'),
  ('chief_financial_officer','Chief Financial Officer (CFO)','executive',90,'Financial planning, controls and reporting.','fully_supervised'),
  ('chief_technology_officer','Chief Technology Officer (CTO)','executive',90,'Technology strategy and engineering leadership.','fully_supervised'),
  ('chief_human_resources_officer','Chief Human Resources Officer (CHRO)','executive',90,'Workforce and human-resources leadership.','fully_supervised'),
  ('chief_information_security_officer','Chief Information Security Officer (CISO)','executive',90,'Information security and cyber-risk leadership.','fully_supervised'),
  ('chief_marketing_officer','Chief Marketing Officer (CMO)','executive',90,'Marketing and brand leadership.','fully_supervised'),
  ('executive_officer','Other Executive Officer','executive',85,'Additional executive responsibilities.','fully_supervised'),
  ('department_director','Department Director','director',75,'Leads a department and its performance.','fully_supervised'),
  ('deputy_director','Deputy Director','director',70,'Supports a department director and delegated operations.','fully_supervised'),
  ('regional_manager','Regional Manager','manager',65,'Coordinates permitted work across a region.','fully_supervised'),
  ('department_manager','Department Manager','manager',60,'Manages a department function and workforce.','fully_supervised'),
  ('team_leader','Team Leader','team_lead',50,'Coordinates an assigned team.','fully_supervised'),
  ('supervisor','Supervisor','supervisor',40,'Supervises assigned tasks and staff.','fully_supervised'),
  ('senior_specialist','Senior Specialist','specialist',30,'Provides advanced specialist work.','fully_supervised'),
  ('junior_specialist','Junior Staff','specialist',20,'Performs supervised specialist work.','fully_supervised'),
  ('assistant','Assistant','assistant',10,'Supports approved operational tasks.','fully_supervised'),
  ('worker','Worker','worker',5,'Completes explicitly assigned work.','fully_supervised'),
  ('temporary_worker','Temporary Worker','worker',3,'Completes time-limited approved assignments.','fully_supervised')
on conflict (template_key) do nothing;

create table if not exists ai_network.ai_positions (
  position_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete cascade,
  position_key text not null references ai_network.ai_position_templates(template_key) on delete restrict,
  display_name text not null,
  job_family text not null check (job_family in ('board','executive','director','manager','team_lead','supervisor','specialist','assistant','worker')),
  hierarchy_level integer not null check (hierarchy_level between 1 and 100),
  description text not null default '',
  supervision_level text not null default 'fully_supervised'
    check (supervision_level in ('fully_supervised','supervisor_controlled','hybrid_autonomy','autonomous_within_limits','restricted_observation')),
  default_permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(default_permissions) = 'object'),
  status text not null default 'proposed' check (status in ('proposed','active','restricted','archived')),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, position_key),
  unique (organization_id, position_id)
);
create index if not exists ai_positions_org_level_idx
  on ai_network.ai_positions (organization_id, hierarchy_level desc, status);

create table if not exists ai_network.ai_employment_records (
  employment_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete cascade,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  department_id uuid not null,
  position_id uuid not null,
  manager_employment_id uuid,
  employment_status text not null default 'candidate'
    check (employment_status in ('candidate','onboarding','active','restricted','suspended','transferred','terminated','retired')),
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time','part_time','temporary','contract','project')),
  job_description text not null default '',
  workload_percentage integer not null default 100 check (workload_percentage between 0 and 100),
  start_date date,
  end_date date,
  schedule_preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(schedule_preferences) = 'object'),
  assigned_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employment_id),
  foreign key (organization_id, department_id)
    references ai_network.ai_departments(organization_id, department_id) on delete restrict,
  foreign key (organization_id, position_id)
    references ai_network.ai_positions(organization_id, position_id) on delete restrict,
  foreign key (organization_id, manager_employment_id)
    references ai_network.ai_employment_records(organization_id, employment_id) on delete restrict,
  check (manager_employment_id is null or manager_employment_id <> employment_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists ai_employment_org_department_status_idx
  on ai_network.ai_employment_records (organization_id, department_id, employment_status);
create index if not exists ai_employment_identity_status_idx
  on ai_network.ai_employment_records (identity_id, employment_status);
create index if not exists ai_employment_manager_idx
  on ai_network.ai_employment_records (manager_employment_id);

create table if not exists ai_network.ai_employment_history (
  history_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  employment_id uuid not null,
  action text not null,
  previous_status text,
  new_status text,
  reason text not null default '',
  actor_type text not null check (actor_type in ('human_user','ai_identity','system')),
  actor_user_id uuid references public.profiles(id) on delete restrict,
  actor_identity_id uuid references ai_network.ai_identities(identity_id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  foreign key (organization_id, employment_id)
    references ai_network.ai_employment_records(organization_id, employment_id) on delete restrict
);
create index if not exists ai_employment_history_employment_time_idx
  on ai_network.ai_employment_history (employment_id, occurred_at desc);
create index if not exists ai_employment_history_org_time_idx
  on ai_network.ai_employment_history (organization_id, occurred_at desc);

alter table ai_network.ai_organizations enable row level security;
alter table ai_network.ai_department_templates enable row level security;
alter table ai_network.ai_departments enable row level security;
alter table ai_network.ai_position_templates enable row level security;
alter table ai_network.ai_positions enable row level security;
alter table ai_network.ai_employment_records enable row level security;
alter table ai_network.ai_employment_history enable row level security;

grant usage on schema ai_network to service_role;
grant select on ai_network.ai_department_templates, ai_network.ai_position_templates to service_role;
grant select, insert, update on ai_network.ai_organizations, ai_network.ai_departments, ai_network.ai_positions to service_role;
grant select, insert, update on ai_network.ai_employment_records to service_role;
grant select, insert on ai_network.ai_employment_history to service_role;

create or replace function public.minglora_ai_organization_command(
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
  v_org_name text;
  v_org_slug text;
  v_org_type text;
  v_org_description text;
  v_idempotency_key text;
  v_organization_id uuid;
  v_inserted_id uuid;
  v_department_key text;
  v_position_key text;
  v_item jsonb;
  v_row jsonb;
  v_result jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_created_count integer := 0;
  v_existing_count integer := 0;
  v_template_count integer := 0;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI organization commands are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora owner is required.';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'AI organization command payload must be an object.';
  end if;

  if v_action = 'list_department_templates' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'template_key',t.template_key,'display_name',t.display_name,
      'description',t.description,'sort_order',t.sort_order
    ) order by t.sort_order),'[]'::jsonb)
    into v_result
    from ai_network.ai_department_templates t where t.is_active;
    return v_result;
  end if;

  if v_action = 'list_position_templates' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'template_key',t.template_key,'display_name',t.display_name,
      'job_family',t.job_family,'hierarchy_level',t.hierarchy_level,
      'description',t.description,'default_supervision_level',t.default_supervision_level
    ) order by t.hierarchy_level desc,t.template_key),'[]'::jsonb)
    into v_result
    from ai_network.ai_position_templates t where t.is_active;
    return v_result;
  end if;

  if v_action = 'create_organization' then
    v_org_name := left(trim(coalesce(v_payload->>'organization_name','')),160);
    v_org_slug := lower(trim(coalesce(v_payload->>'organization_slug','')));
    v_org_type := lower(coalesce(nullif(v_payload->>'organization_type',''),'company'));
    v_org_description := left(trim(coalesce(v_payload->>'description','')),2000);
    v_idempotency_key := nullif(trim(v_payload->>'idempotency_key'),'');
    if length(v_org_name) < 2 then
      raise exception using errcode = '22023', message = 'Organization name must contain at least two characters.';
    end if;
    if v_org_slug !~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$' then
      raise exception using errcode = '22023', message = 'Organization slug must be 3 to 80 lowercase letters, numbers or hyphens.';
    end if;
    if v_org_type not in ('platform','company','agency','community','other') then
      raise exception using errcode = '22023', message = 'Choose a supported organization type.';
    end if;
    if v_idempotency_key is null or length(v_idempotency_key) < 8 or length(v_idempotency_key) > 160 then
      raise exception using errcode = '22023', message = 'A stable organization idempotency key is required.';
    end if;
    insert into ai_network.ai_organizations (
      organization_name,organization_slug,organization_type,description,status,
      owner_user_id,created_by_user_id,idempotency_key
    )
    values (
      v_org_name,v_org_slug,v_org_type,v_org_description,'proposed',
      p_actor_user_id,p_actor_user_id,v_idempotency_key
    )
    on conflict (owner_user_id,idempotency_key) where idempotency_key is not null do nothing
    returning organization_id into v_organization_id;
    if v_organization_id is null then
      select o.organization_id into v_organization_id
      from ai_network.ai_organizations o
      where o.owner_user_id=p_actor_user_id and o.idempotency_key=v_idempotency_key;
    end if;
    select jsonb_build_object('organization',to_jsonb(o),'reused',o.idempotency_key=v_idempotency_key)
    into v_result
    from ai_network.ai_organizations o
    where o.organization_id=v_organization_id and o.owner_user_id=p_actor_user_id;
    return v_result;
  end if;

  if v_action = 'list_organizations' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'organization',to_jsonb(o),
      'department_count',(select count(*) from ai_network.ai_departments d where d.organization_id=o.organization_id),
      'position_count',(select count(*) from ai_network.ai_positions p where p.organization_id=o.organization_id)
    ) order by o.created_at desc),'[]'::jsonb)
    into v_result
    from ai_network.ai_organizations o
    where o.owner_user_id=p_actor_user_id;
    return v_result;
  end if;

  if v_action not in ('create_departments','list_departments','create_positions','list_positions') then
    raise exception using errcode = '22023', message = 'Unsupported AI organization command.';
  end if;
  if coalesce(v_payload->>'organization_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'A valid organization ID is required.';
  end if;
  v_organization_id := (v_payload->>'organization_id')::uuid;
  if not exists (
    select 1 from ai_network.ai_organizations o
    where o.organization_id=v_organization_id and o.owner_user_id=p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'Organization not found for this Minglora owner.';
  end if;

  if v_action = 'list_departments' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'department',to_jsonb(d),'template',jsonb_build_object('display_name',t.display_name,'sort_order',t.sort_order)
    ) order by t.sort_order,d.display_name),'[]'::jsonb)
    into v_result
    from ai_network.ai_departments d
    join ai_network.ai_department_templates t on t.template_key=d.department_key
    where d.organization_id=v_organization_id;
    return v_result;
  end if;

  if v_action = 'create_departments' then
    if v_payload ? 'department_keys' and jsonb_typeof(v_payload->'department_keys') <> 'array' then
      raise exception using errcode = '22023', message = 'department_keys must be an array when supplied.';
    end if;
    if v_payload ? 'department_keys' then
      for v_item in select value from jsonb_array_elements(v_payload->'department_keys') loop
        v_department_key := lower(trim(v_item #>> '{}'));
        if not exists(select 1 from ai_network.ai_department_templates t where t.template_key=v_department_key and t.is_active) then
          raise exception using errcode = '22023', message = 'A requested department template is unavailable.';
        end if;
        insert into ai_network.ai_departments (
          organization_id,department_key,display_name,description,status,created_by_user_id
        )
        select v_organization_id,t.template_key,t.display_name,t.description,'active',p_actor_user_id
        from ai_network.ai_department_templates t where t.template_key=v_department_key
        on conflict (organization_id,department_key) do nothing
        returning department_id into v_inserted_id;
        if found then v_created_count:=v_created_count+1;
        else v_existing_count:=v_existing_count+1;
        end if;
      end loop;
    else
      insert into ai_network.ai_departments (
        organization_id,department_key,display_name,description,status,created_by_user_id
      )
      select v_organization_id,t.template_key,t.display_name,t.description,'active',p_actor_user_id
      from ai_network.ai_department_templates t
      where t.is_active
      on conflict (organization_id,department_key) do nothing;
      get diagnostics v_created_count = row_count;
      select count(*) into v_template_count from ai_network.ai_department_templates t where t.is_active;
      v_existing_count := v_template_count - v_created_count;
    end if;
    select coalesce(jsonb_agg(to_jsonb(d) order by t.sort_order),'[]'::jsonb)
    into v_rows
    from ai_network.ai_departments d
    join ai_network.ai_department_templates t on t.template_key=d.department_key
    where d.organization_id=v_organization_id;
    return jsonb_build_object(
      'created_count',v_created_count,'existing_count',v_existing_count,
      'department_count',jsonb_array_length(v_rows),'departments',v_rows
    );
  end if;

  if v_action = 'list_positions' then
    select coalesce(jsonb_agg(to_jsonb(p) order by p.hierarchy_level desc,p.position_key),'[]'::jsonb)
    into v_result
    from ai_network.ai_positions p where p.organization_id=v_organization_id;
    return v_result;
  end if;

  if v_action = 'create_positions' then
    if v_payload ? 'position_keys' and jsonb_typeof(v_payload->'position_keys') <> 'array' then
      raise exception using errcode = '22023', message = 'position_keys must be an array when supplied.';
    end if;
    if v_payload ? 'position_keys' then
      for v_item in select value from jsonb_array_elements(v_payload->'position_keys') loop
        v_position_key := lower(trim(v_item #>> '{}'));
        if not exists(select 1 from ai_network.ai_position_templates t where t.template_key=v_position_key and t.is_active) then
          raise exception using errcode = '22023', message = 'A requested position template is unavailable.';
        end if;
        insert into ai_network.ai_positions (
          organization_id,position_key,display_name,job_family,hierarchy_level,description,
          supervision_level,default_permissions,status,created_by_user_id
        )
        select v_organization_id,t.template_key,t.display_name,t.job_family,t.hierarchy_level,
               t.description,t.default_supervision_level,t.default_permissions,'proposed',p_actor_user_id
        from ai_network.ai_position_templates t where t.template_key=v_position_key
        on conflict (organization_id,position_key) do nothing
        returning position_id into v_inserted_id;
        if found then v_created_count:=v_created_count+1;
        else v_existing_count:=v_existing_count+1;
        end if;
      end loop;
    else
      insert into ai_network.ai_positions (
        organization_id,position_key,display_name,job_family,hierarchy_level,description,
        supervision_level,default_permissions,status,created_by_user_id
      )
      select v_organization_id,t.template_key,t.display_name,t.job_family,t.hierarchy_level,
             t.description,t.default_supervision_level,t.default_permissions,'proposed',p_actor_user_id
      from ai_network.ai_position_templates t where t.is_active
      on conflict (organization_id,position_key) do nothing;
      get diagnostics v_created_count = row_count;
      select count(*) into v_template_count from ai_network.ai_position_templates t where t.is_active;
      v_existing_count := v_template_count - v_created_count;
    end if;
    select coalesce(jsonb_agg(to_jsonb(p) order by p.hierarchy_level desc,p.position_key),'[]'::jsonb)
    into v_rows
    from ai_network.ai_positions p where p.organization_id=v_organization_id;
    return jsonb_build_object(
      'created_count',v_created_count,'existing_count',v_existing_count,
      'position_count',jsonb_array_length(v_rows),'positions',v_rows
    );
  end if;

  return '{}'::jsonb;
end;
$function$;

comment on function public.minglora_ai_organization_command(text,uuid,jsonb)
  is 'Server-only owner-scoped organization, department and position template commands.';

revoke all on function public.minglora_ai_organization_command(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_organization_command(text,uuid,jsonb) to service_role;
