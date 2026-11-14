-- Minglora AI HR talent management: promotions, human performance reviews and succession plans.
-- Additive/private only. No employee, review or succession records are seeded.
-- Promotion reuses the existing checked transfer workflow and adds an explicit promotion record.

create table if not exists ai_network.ai_performance_reviews (
  review_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  employment_id uuid not null,
  reviewer_user_id uuid not null references public.profiles(id) on delete restrict,
  finalized_by_user_id uuid references public.profiles(id) on delete restrict,
  review_period_start date not null,
  review_period_end date not null,
  rating numeric(3,2) not null check (rating between 1 and 5),
  outcome text not null check (outcome in ('continue','promotion_consideration','improvement_plan','role_change')),
  summary text not null check (length(trim(summary)) between 10 and 4000),
  strengths jsonb not null default '[]'::jsonb check (jsonb_typeof(strengths)='array' and jsonb_array_length(strengths)<=20),
  improvement_areas jsonb not null default '[]'::jsonb check (jsonb_typeof(improvement_areas)='array' and jsonb_array_length(improvement_areas)<=20),
  goals jsonb not null default '[]'::jsonb check (jsonb_typeof(goals)='array' and jsonb_array_length(goals)<=20),
  review_status text not null default 'submitted' check (review_status in ('submitted','finalized','withdrawn')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,review_id),
  foreign key (organization_id,employment_id)
    references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  check (review_period_end >= review_period_start),
  check ((review_status='finalized') = (finalized_at is not null and finalized_by_user_id is not null))
);
create unique index if not exists ai_performance_reviews_idempotency_uq
  on ai_network.ai_performance_reviews (organization_id,employment_id,reviewer_user_id,idempotency_key);
create index if not exists ai_performance_reviews_org_period_idx
  on ai_network.ai_performance_reviews (organization_id,review_period_end desc,created_at desc);
create index if not exists ai_performance_reviews_employment_idx
  on ai_network.ai_performance_reviews (organization_id,employment_id,created_at desc);

create table if not exists ai_network.ai_performance_review_history (
  event_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  review_id uuid not null,
  action text not null check (action in ('review_submitted','review_finalized','review_withdrawn')),
  previous_status text,
  new_status text not null,
  reason text not null default '',
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  foreign key (organization_id,review_id)
    references ai_network.ai_performance_reviews(organization_id,review_id) on delete restrict
);
create index if not exists ai_performance_review_history_org_time_idx
  on ai_network.ai_performance_review_history (organization_id,occurred_at desc);
create index if not exists ai_performance_review_history_review_idx
  on ai_network.ai_performance_review_history (review_id,occurred_at desc);

create table if not exists ai_network.ai_succession_plans (
  plan_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  role_position_id uuid not null,
  incumbent_employment_id uuid,
  successor_employment_id uuid not null,
  readiness_level text not null check (readiness_level in ('ready_now','within_6_months','within_1_year','development_required')),
  plan_status text not null default 'draft' check (plan_status in ('draft','active','completed','cancelled')),
  rationale text not null check (length(trim(rationale)) between 10 and 2000),
  development_actions jsonb not null default '[]'::jsonb check (jsonb_typeof(development_actions)='array' and jsonb_array_length(development_actions)<=25),
  review_due_on date,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,plan_id),
  foreign key (organization_id,role_position_id)
    references ai_network.ai_positions(organization_id,position_id) on delete restrict,
  foreign key (organization_id,incumbent_employment_id)
    references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  foreign key (organization_id,successor_employment_id)
    references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  check (incumbent_employment_id is null or incumbent_employment_id<>successor_employment_id)
);
create unique index if not exists ai_succession_plans_idempotency_uq
  on ai_network.ai_succession_plans (organization_id,idempotency_key);
create unique index if not exists ai_succession_plans_active_successor_uq
  on ai_network.ai_succession_plans (organization_id,role_position_id,successor_employment_id)
  where plan_status in ('draft','active');
create index if not exists ai_succession_plans_org_status_idx
  on ai_network.ai_succession_plans (organization_id,plan_status,updated_at desc);

create table if not exists ai_network.ai_succession_plan_history (
  event_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_id uuid not null,
  action text not null check (action in ('succession_plan_created','succession_plan_activated','succession_plan_completed','succession_plan_cancelled')),
  previous_status text,
  new_status text not null,
  reason text not null default '',
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  foreign key (organization_id,plan_id)
    references ai_network.ai_succession_plans(organization_id,plan_id) on delete restrict
);
create index if not exists ai_succession_plan_history_org_time_idx
  on ai_network.ai_succession_plan_history (organization_id,occurred_at desc);
create index if not exists ai_succession_plan_history_plan_idx
  on ai_network.ai_succession_plan_history (plan_id,occurred_at desc);

create table if not exists ai_network.ai_employee_promotions (
  promotion_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  previous_employment_id uuid not null,
  new_employment_id uuid not null,
  previous_department_id uuid not null,
  previous_position_id uuid not null,
  new_department_id uuid not null,
  new_position_id uuid not null,
  supporting_review_id uuid,
  promoted_by_user_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 10 and 1000),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  created_at timestamptz not null default now(),
  unique (organization_id,promotion_id),
  unique (organization_id,previous_employment_id),
  unique (organization_id,new_employment_id),
  unique (organization_id,idempotency_key),
  foreign key (organization_id,previous_employment_id)
    references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  foreign key (organization_id,new_employment_id)
    references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
  foreign key (organization_id,previous_department_id)
    references ai_network.ai_departments(organization_id,department_id) on delete restrict,
  foreign key (organization_id,previous_position_id)
    references ai_network.ai_positions(organization_id,position_id) on delete restrict,
  foreign key (organization_id,new_department_id)
    references ai_network.ai_departments(organization_id,department_id) on delete restrict,
  foreign key (organization_id,new_position_id)
    references ai_network.ai_positions(organization_id,position_id) on delete restrict,
  foreign key (organization_id,supporting_review_id)
    references ai_network.ai_performance_reviews(organization_id,review_id) on delete restrict,
  check (previous_employment_id<>new_employment_id)
);

alter table ai_network.ai_performance_reviews enable row level security;
alter table ai_network.ai_performance_review_history enable row level security;
alter table ai_network.ai_succession_plans enable row level security;
alter table ai_network.ai_succession_plan_history enable row level security;
alter table ai_network.ai_employee_promotions enable row level security;

grant select,insert,update on ai_network.ai_performance_reviews to service_role;
grant select,insert on ai_network.ai_performance_review_history to service_role;
grant select,insert,update on ai_network.ai_succession_plans to service_role;
grant select,insert on ai_network.ai_succession_plan_history to service_role;
grant select,insert on ai_network.ai_employee_promotions to service_role;

comment on table ai_network.ai_performance_reviews is
  'Human-authored, organization-scoped AI employee reviews. These are not fabricated runtime metrics or model-generated ratings.';
comment on table ai_network.ai_succession_plans is
  'Owner-managed succession planning for organizational AI roles. Plans do not appoint or promote successors automatically.';
comment on table ai_network.ai_employee_promotions is
  'Explicit audited promotions linked to the prior employment and the new role record created by the existing transfer workflow.';

create or replace function public.minglora_ai_hr_talent_command(
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
  v_employment_id uuid;
  v_new_employment_id uuid;
  v_review_id uuid;
  v_plan_id uuid;
  v_idempotency_key text;
  v_reason text;
  v_status text;
  v_previous_status text;
  v_readiness text;
  v_outcome text;
  v_rating numeric(3,2);
  v_period_start date;
  v_period_end date;
  v_role_position_id uuid;
  v_incumbent_employment_id uuid;
  v_successor_employment_id uuid;
  v_previous_department_id uuid;
  v_previous_position_id uuid;
  v_new_department_id uuid;
  v_new_position_id uuid;
  v_supporting_review_id uuid;
  v_current_rank integer;
  v_target_rank integer;
  v_candidate_rank integer;
  v_transfer_result jsonb;
  v_reused boolean := false;
  v_review jsonb;
  v_result jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI HR talent commands are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id=p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora administrator is required.';
  end if;
  if jsonb_typeof(v_payload)<>'object' then
    raise exception using errcode = '22023', message = 'AI HR talent payload must be an object.';
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

  if v_action='list_performance_reviews' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'review',to_jsonb(r),
      'identity',jsonb_build_object('identity_id',i.identity_id,'display_name',n.display_name,'username',n.username),
      'position_name',p.display_name
    ) order by r.created_at desc),'[]'::jsonb)
    into v_result
    from ai_network.ai_performance_reviews r
    join ai_network.ai_employment_records e on e.employment_id=r.employment_id and e.organization_id=r.organization_id
    join ai_network.ai_identities i on i.identity_id=e.identity_id
    left join ai_network.ai_names n on n.identity_id=i.identity_id
    join ai_network.ai_positions p on p.position_id=e.position_id and p.organization_id=e.organization_id
    where r.organization_id=v_organization_id;
    return v_result;
  end if;

  if v_action='create_performance_review' then
    v_employment_id := nullif(v_payload->>'employment_id','')::uuid;
    v_period_start := nullif(v_payload->>'review_period_start','')::date;
    v_period_end := nullif(v_payload->>'review_period_end','')::date;
    v_rating := nullif(v_payload->>'rating','')::numeric;
    v_outcome := lower(coalesce(v_payload->>'outcome',''));
    v_reason := left(trim(coalesce(v_payload->>'summary','')),4000);
    v_idempotency_key := nullif(trim(v_payload->>'idempotency_key'),'');
    if v_period_start is null or v_period_end is null or v_period_end<v_period_start then
      raise exception using errcode = '22023', message = 'Enter a valid review period with an end date on or after the start date.';
    end if;
    if v_rating is null or v_rating<1 or v_rating>5 then
      raise exception using errcode = '22023', message = 'Performance rating must be between 1 and 5.';
    end if;
    if v_outcome not in ('continue','promotion_consideration','improvement_plan','role_change') then
      raise exception using errcode = '22023', message = 'Choose a supported performance review outcome.';
    end if;
    if length(v_reason)<10 then
      raise exception using errcode = '22023', message = 'Performance review summary must contain at least 10 characters.';
    end if;
    if v_idempotency_key is null or length(v_idempotency_key)<8 or length(v_idempotency_key)>160 then
      raise exception using errcode = '22023', message = 'A stable performance review idempotency key is required.';
    end if;
    if jsonb_typeof(coalesce(v_payload->'strengths','[]'::jsonb))<>'array'
       or jsonb_typeof(coalesce(v_payload->'improvement_areas','[]'::jsonb))<>'array'
       or jsonb_typeof(coalesce(v_payload->'goals','[]'::jsonb))<>'array'
       or jsonb_array_length(coalesce(v_payload->'strengths','[]'::jsonb))>20
       or jsonb_array_length(coalesce(v_payload->'improvement_areas','[]'::jsonb))>20
       or jsonb_array_length(coalesce(v_payload->'goals','[]'::jsonb))>20 then
      raise exception using errcode = '22023', message = 'Strengths, improvement areas and goals must each be arrays with at most 20 items.';
    end if;
    if not exists (
      select 1 from ai_network.ai_employment_records e
      where e.employment_id=v_employment_id and e.organization_id=v_organization_id
        and e.employment_status='active'
    ) then
      raise exception using errcode = '22023', message = 'Only an active AI employee can receive a performance review.';
    end if;
    insert into ai_network.ai_performance_reviews (
      organization_id,employment_id,reviewer_user_id,review_period_start,review_period_end,
      rating,outcome,summary,strengths,improvement_areas,goals,review_status,idempotency_key
    ) values (
      v_organization_id,v_employment_id,p_actor_user_id,v_period_start,v_period_end,
      v_rating,v_outcome,v_reason,coalesce(v_payload->'strengths','[]'::jsonb),
      coalesce(v_payload->'improvement_areas','[]'::jsonb),coalesce(v_payload->'goals','[]'::jsonb),
      'submitted',v_idempotency_key
    ) on conflict (organization_id,employment_id,reviewer_user_id,idempotency_key) do nothing
    returning review_id into v_review_id;
    if v_review_id is null then
      v_reused := true;
      select r.review_id into v_review_id from ai_network.ai_performance_reviews r
      where r.organization_id=v_organization_id and r.employment_id=v_employment_id
        and r.reviewer_user_id=p_actor_user_id and r.idempotency_key=v_idempotency_key;
    else
      insert into ai_network.ai_performance_review_history (
        organization_id,review_id,action,previous_status,new_status,reason,actor_user_id
      ) values (v_organization_id,v_review_id,'review_submitted',null,'submitted','Human-authored review submitted.',p_actor_user_id);
    end if;
    select to_jsonb(r) into v_review from ai_network.ai_performance_reviews r
    where r.organization_id=v_organization_id and r.review_id=v_review_id;
    return jsonb_build_object('review',v_review,'reused',v_reused);
  end if;

  if v_action='finalize_performance_review' then
    v_review_id := nullif(v_payload->>'review_id','')::uuid;
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    if length(v_reason)<3 then
      raise exception using errcode = '22023', message = 'Provide a reason to finalize this performance review.';
    end if;
    select r.review_status into v_previous_status
    from ai_network.ai_performance_reviews r
    where r.organization_id=v_organization_id and r.review_id=v_review_id
    for update;
    if v_previous_status is null then raise exception using errcode = 'P0002', message = 'Performance review not found.'; end if;
    if v_previous_status<>'submitted' then raise exception using errcode = '22023', message = 'Only a submitted performance review can be finalized.'; end if;
    update ai_network.ai_performance_reviews r
    set review_status='finalized',finalized_by_user_id=p_actor_user_id,finalized_at=now(),updated_at=now()
    where r.organization_id=v_organization_id and r.review_id=v_review_id
    returning to_jsonb(r) into v_review;
    insert into ai_network.ai_performance_review_history (
      organization_id,review_id,action,previous_status,new_status,reason,actor_user_id
    ) values (v_organization_id,v_review_id,'review_finalized',v_previous_status,'finalized',v_reason,p_actor_user_id);
    return jsonb_build_object('review',v_review);
  end if;

  if v_action='list_succession_plans' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'plan',to_jsonb(s),
      'role_name',p.display_name,
      'incumbent_name',ni.display_name,
      'successor_name',ns.display_name
    ) order by s.updated_at desc),'[]'::jsonb)
    into v_result
    from ai_network.ai_succession_plans s
    join ai_network.ai_positions p on p.organization_id=s.organization_id and p.position_id=s.role_position_id
    left join ai_network.ai_employment_records ei on ei.organization_id=s.organization_id and ei.employment_id=s.incumbent_employment_id
    left join ai_network.ai_identities ii on ii.identity_id=ei.identity_id
    left join ai_network.ai_names ni on ni.identity_id=ii.identity_id
    join ai_network.ai_employment_records es on es.organization_id=s.organization_id and es.employment_id=s.successor_employment_id
    join ai_network.ai_identities isucc on isucc.identity_id=es.identity_id
    left join ai_network.ai_names ns on ns.identity_id=isucc.identity_id
    where s.organization_id=v_organization_id;
    return v_result;
  end if;

  if v_action='create_succession_plan' then
    v_role_position_id := nullif(v_payload->>'role_position_id','')::uuid;
    v_incumbent_employment_id := nullif(v_payload->>'incumbent_employment_id','')::uuid;
    v_successor_employment_id := nullif(v_payload->>'successor_employment_id','')::uuid;
    v_readiness := lower(coalesce(v_payload->>'readiness_level',''));
    v_reason := left(trim(coalesce(v_payload->>'rationale','')),2000);
    v_idempotency_key := nullif(trim(v_payload->>'idempotency_key'),'');
    if v_readiness not in ('ready_now','within_6_months','within_1_year','development_required') then
      raise exception using errcode = '22023', message = 'Choose a supported successor readiness level.';
    end if;
    if length(v_reason)<10 then raise exception using errcode = '22023', message = 'Succession rationale must contain at least 10 characters.'; end if;
    if v_idempotency_key is null or length(v_idempotency_key)<8 or length(v_idempotency_key)>160 then
      raise exception using errcode = '22023', message = 'A stable succession plan idempotency key is required.';
    end if;
    if jsonb_typeof(coalesce(v_payload->'development_actions','[]'::jsonb))<>'array'
       or jsonb_array_length(coalesce(v_payload->'development_actions','[]'::jsonb))>25 then
      raise exception using errcode = '22023', message = 'Succession development actions must be an array with at most 25 items.';
    end if;
    select p.hierarchy_level into v_target_rank from ai_network.ai_positions p
    where p.organization_id=v_organization_id and p.position_id=v_role_position_id and p.status='active';
    if v_target_rank is null then raise exception using errcode = '22023', message = 'Choose an active target position in this organization.'; end if;
    if v_incumbent_employment_id is not null and not exists (
      select 1 from ai_network.ai_employment_records e
      where e.organization_id=v_organization_id and e.employment_id=v_incumbent_employment_id
        and e.position_id=v_role_position_id and e.employment_status='active'
    ) then
      raise exception using errcode = '22023', message = 'The incumbent must be the active employee currently holding the target role.';
    end if;
    select p.hierarchy_level into v_candidate_rank
    from ai_network.ai_employment_records e
    join ai_network.ai_positions p on p.organization_id=e.organization_id and p.position_id=e.position_id
    where e.organization_id=v_organization_id and e.employment_id=v_successor_employment_id
      and e.employment_status='active';
    if v_candidate_rank is null or v_candidate_rank>=v_target_rank then
      raise exception using errcode = '22023', message = 'The nominated successor must be active and currently hold a lower-level position than the target role.';
    end if;
    if v_incumbent_employment_id is not null and exists (
      select 1 from ai_network.ai_employment_records ei
      join ai_network.ai_employment_records es on es.organization_id=ei.organization_id
      where ei.employment_id=v_incumbent_employment_id and es.employment_id=v_successor_employment_id
        and ei.identity_id=es.identity_id
    ) then
      raise exception using errcode = '22023', message = 'An employee cannot be their own successor.';
    end if;
    insert into ai_network.ai_succession_plans (
      organization_id,role_position_id,incumbent_employment_id,successor_employment_id,
      readiness_level,plan_status,rationale,development_actions,review_due_on,
      owner_user_id,created_by_user_id,idempotency_key
    ) values (
      v_organization_id,v_role_position_id,v_incumbent_employment_id,v_successor_employment_id,
      v_readiness,'draft',v_reason,coalesce(v_payload->'development_actions','[]'::jsonb),
      nullif(v_payload->>'review_due_on','')::date,p_actor_user_id,p_actor_user_id,v_idempotency_key
    ) on conflict (organization_id,idempotency_key) do nothing
    returning plan_id into v_plan_id;
    if v_plan_id is null then
      v_reused := true;
      select s.plan_id into v_plan_id from ai_network.ai_succession_plans s
      where s.organization_id=v_organization_id and s.idempotency_key=v_idempotency_key;
    else
      insert into ai_network.ai_succession_plan_history (
        organization_id,plan_id,action,previous_status,new_status,reason,actor_user_id
      ) values (v_organization_id,v_plan_id,'succession_plan_created',null,'draft','Succession plan created.',p_actor_user_id);
    end if;
    select to_jsonb(s) into v_result from ai_network.ai_succession_plans s
    where s.organization_id=v_organization_id and s.plan_id=v_plan_id;
    return jsonb_build_object('plan',v_result,'reused',v_reused);
  end if;

  if v_action='update_succession_plan' then
    v_plan_id := nullif(v_payload->>'plan_id','')::uuid;
    v_status := lower(coalesce(v_payload->>'status',''));
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    if v_status not in ('active','completed','cancelled') then
      raise exception using errcode = '22023', message = 'Choose active, completed or cancelled for a succession plan.';
    end if;
    if length(v_reason)<3 then raise exception using errcode = '22023', message = 'A reason of at least three characters is required.'; end if;
    select s.plan_status into v_previous_status
    from ai_network.ai_succession_plans s
    where s.organization_id=v_organization_id and s.plan_id=v_plan_id for update;
    if v_previous_status is null then raise exception using errcode = 'P0002', message = 'Succession plan not found.'; end if;
    if not (
      (v_previous_status='draft' and v_status in ('active','cancelled')) or
      (v_previous_status='active' and v_status in ('completed','cancelled'))
    ) then
      raise exception using errcode = '22023', message = 'That succession plan status transition is not permitted.';
    end if;
    update ai_network.ai_succession_plans s
    set plan_status=v_status,updated_at=now()
    where s.organization_id=v_organization_id and s.plan_id=v_plan_id
    returning to_jsonb(s) into v_result;
    insert into ai_network.ai_succession_plan_history (
      organization_id,plan_id,action,previous_status,new_status,reason,actor_user_id
    ) values (
      v_organization_id,v_plan_id,
      case v_status when 'active' then 'succession_plan_activated' when 'completed' then 'succession_plan_completed' else 'succession_plan_cancelled' end,
      v_previous_status,v_status,v_reason,p_actor_user_id
    );
    return jsonb_build_object('plan',v_result);
  end if;

  if v_action='list_promotions' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'promotion',to_jsonb(pr),
      'identity',jsonb_build_object('identity_id',i.identity_id,'display_name',n.display_name,'username',n.username),
      'previous_position_name',pp.display_name,
      'new_position_name',np.display_name
    ) order by pr.created_at desc),'[]'::jsonb)
    into v_result
    from ai_network.ai_employee_promotions pr
    join ai_network.ai_identities i on i.identity_id=pr.identity_id
    left join ai_network.ai_names n on n.identity_id=i.identity_id
    join ai_network.ai_positions pp on pp.organization_id=pr.organization_id and pp.position_id=pr.previous_position_id
    join ai_network.ai_positions np on np.organization_id=pr.organization_id and np.position_id=pr.new_position_id
    where pr.organization_id=v_organization_id;
    return v_result;
  end if;

  if v_action='promote_employee' then
    v_employment_id := nullif(v_payload->>'employment_id','')::uuid;
    v_new_department_id := nullif(v_payload->>'department_id','')::uuid;
    v_new_position_id := nullif(v_payload->>'position_id','')::uuid;
    v_manager_employment_id := nullif(v_payload->>'manager_employment_id','')::uuid;
    v_supporting_review_id := nullif(v_payload->>'supporting_review_id','')::uuid;
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    v_idempotency_key := nullif(trim(v_payload->>'idempotency_key'),'');
    if length(v_reason)<10 then raise exception using errcode = '22023', message = 'A promotion reason of at least 10 characters is required.'; end if;
    if v_idempotency_key is null or length(v_idempotency_key)<8 or length(v_idempotency_key)>160 then
      raise exception using errcode = '22023', message = 'A stable promotion idempotency key is required.';
    end if;
    select e.identity_id,e.department_id,e.position_id,e.employment_status
      into v_identity_id,v_previous_department_id,v_previous_position_id,v_previous_status
    from ai_network.ai_employment_records e
    where e.organization_id=v_organization_id and e.employment_id=v_employment_id for update;
    if v_identity_id is null or v_previous_status<>'active' then
      raise exception using errcode = '22023', message = 'Only a current active AI employee can be promoted.';
    end if;
    select p.hierarchy_level into v_current_rank from ai_network.ai_positions p
    where p.organization_id=v_organization_id and p.position_id=v_previous_position_id;
    select p.hierarchy_level into v_target_rank from ai_network.ai_positions p
    where p.organization_id=v_organization_id and p.position_id=v_new_position_id
      and p.status in ('active','proposed','restricted');
    if v_target_rank is null or v_current_rank is null or v_target_rank<=v_current_rank then
      raise exception using errcode = '22023', message = 'A promotion must move the employee to a higher-level position in the same organization.';
    end if;
    if not exists (
      select 1 from ai_network.ai_departments d
      where d.organization_id=v_organization_id and d.department_id=v_new_department_id and d.status='active'
    ) then raise exception using errcode = '22023', message = 'Choose an active destination department.'; end if;
    if v_supporting_review_id is not null and not exists (
      select 1 from ai_network.ai_performance_reviews r
      where r.organization_id=v_organization_id and r.review_id=v_supporting_review_id
        and r.employment_id=v_employment_id and r.review_status='finalized'
        and r.outcome in ('promotion_consideration','role_change')
    ) then
      raise exception using errcode = '22023', message = 'A supporting review must be finalized and recommend promotion or role change.';
    end if;
    select to_jsonb(p) into v_result from ai_network.ai_employee_promotions p
    where p.organization_id=v_organization_id and p.idempotency_key=v_idempotency_key;
    if v_result is not null then return jsonb_build_object('promotion',v_result,'reused',true); end if;
    v_transfer_result := public.minglora_ai_hr_command(
      'transfer_employee',
      p_actor_user_id,
      jsonb_build_object(
        'organization_id',v_organization_id,
        'employment_id',v_employment_id,
        'department_id',v_new_department_id,
        'position_id',v_new_position_id,
        'manager_employment_id',v_manager_employment_id,
        'reason',v_reason,
        'idempotency_key','promotion:'||v_idempotency_key
      )
    );
    v_new_employment_id := nullif(v_transfer_result->'employment'->>'employment_id','')::uuid;
    if v_new_employment_id is null then
      raise exception using errcode = 'P0001', message = 'Promotion did not return a replacement employment record.';
    end if;
    insert into ai_network.ai_employee_promotions (
      organization_id,identity_id,previous_employment_id,new_employment_id,
      previous_department_id,previous_position_id,new_department_id,new_position_id,
      supporting_review_id,promoted_by_user_id,reason,idempotency_key
    ) values (
      v_organization_id,v_identity_id,v_employment_id,v_new_employment_id,
      v_previous_department_id,v_previous_position_id,v_new_department_id,v_new_position_id,
      v_supporting_review_id,p_actor_user_id,v_reason,v_idempotency_key
    ) returning to_jsonb(ai_employee_promotions) into v_result;
    insert into ai_network.ai_employment_history (
      organization_id,employment_id,action,reason,actor_type,actor_user_id,metadata
    ) values (
      v_organization_id,v_employment_id,'promoted',v_reason,'human_user',p_actor_user_id,
      jsonb_build_object('promotion_id',v_result->>'promotion_id','replacement_employment_id',v_new_employment_id,
        'previous_position_id',v_previous_position_id,'new_position_id',v_new_position_id)
    );
    return jsonb_build_object('promotion',v_result,'employment',v_transfer_result->'employment','reused',false);
  end if;

  raise exception using errcode = '22023', message = 'Unsupported AI HR talent command.';
end;
$function$;

comment on function public.minglora_ai_hr_talent_command(text,uuid,jsonb)
  is 'Server-only owner-scoped human HR talent management: promotion, performance review and succession planning.';

revoke all on function public.minglora_ai_hr_talent_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_hr_talent_command(text,uuid,jsonb) to service_role;
