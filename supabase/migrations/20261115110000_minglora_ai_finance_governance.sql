-- Minglora AI Network finance governance: scoped budgets and immutable, idempotent usage ledger.
-- This records operational limits and measured usage only. It does not transfer money or activate AI workers.

create table if not exists ai_network.ai_finance_budget_policies (
  budget_policy_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  scope_type text not null check (scope_type in ('owner','organization','department','identity')),
  organization_id uuid references ai_network.ai_organizations(organization_id) on delete restrict,
  department_id uuid references ai_network.ai_departments(department_id) on delete restrict,
  identity_id uuid references ai_network.ai_identities(identity_id) on delete restrict,
  daily_token_limit bigint check (daily_token_limit is null or daily_token_limit between 0 and 100000000000),
  monthly_spend_limit_usd numeric(18,6) check (monthly_spend_limit_usd is null or monthly_spend_limit_usd between 0 and 1000000000),
  monthly_cpu_milliseconds_limit bigint check (monthly_cpu_milliseconds_limit is null or monthly_cpu_milliseconds_limit between 0 and 1000000000000000),
  monthly_gpu_milliseconds_limit bigint check (monthly_gpu_milliseconds_limit is null or monthly_gpu_milliseconds_limit between 0 and 1000000000000000),
  monthly_memory_mb_minutes_limit bigint check (monthly_memory_mb_minutes_limit is null or monthly_memory_mb_minutes_limit between 0 and 1000000000000000),
  monthly_storage_byte_hours_limit bigint check (monthly_storage_byte_hours_limit is null or monthly_storage_byte_hours_limit between 0 and 1000000000000000000),
  max_concurrent_tasks integer check (max_concurrent_tasks is null or max_concurrent_tasks between 0 and 1000000),
  currency text not null default 'USD' check (currency='USD'),
  policy_status text not null default 'active' check (policy_status in ('active','paused','archived')),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  updated_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope_type='owner' and organization_id is null and department_id is null and identity_id is null) or
    (scope_type='organization' and organization_id is not null and department_id is null and identity_id is null) or
    (scope_type='department' and organization_id is not null and department_id is not null and identity_id is null) or
    (scope_type='identity' and organization_id is null and department_id is null and identity_id is not null)
  ),
  check (
    daily_token_limit is not null or monthly_spend_limit_usd is not null or
    monthly_cpu_milliseconds_limit is not null or monthly_gpu_milliseconds_limit is not null or
    monthly_memory_mb_minutes_limit is not null or monthly_storage_byte_hours_limit is not null or
    max_concurrent_tasks is not null
  )
);

create unique index if not exists ai_finance_budget_owner_uq
  on ai_network.ai_finance_budget_policies(owner_user_id) where scope_type='owner';
create unique index if not exists ai_finance_budget_org_uq
  on ai_network.ai_finance_budget_policies(owner_user_id,organization_id) where scope_type='organization';
create unique index if not exists ai_finance_budget_department_uq
  on ai_network.ai_finance_budget_policies(owner_user_id,organization_id,department_id) where scope_type='department';
create unique index if not exists ai_finance_budget_identity_uq
  on ai_network.ai_finance_budget_policies(owner_user_id,identity_id) where scope_type='identity';
create index if not exists ai_finance_budget_owner_status_idx
  on ai_network.ai_finance_budget_policies(owner_user_id,policy_status,scope_type);

create table if not exists ai_network.ai_finance_budget_history (
  budget_history_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  budget_policy_id uuid not null references ai_network.ai_finance_budget_policies(budget_policy_id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('created','updated','paused','reactivated','archived')),
  reason text not null check (length(trim(reason)) between 10 and 1000),
  previous_policy jsonb,
  new_policy jsonb not null check (jsonb_typeof(new_policy)='object'),
  occurred_at timestamptz not null default now()
);
create index if not exists ai_finance_budget_history_owner_time_idx
  on ai_network.ai_finance_budget_history(owner_user_id,occurred_at desc);

create table if not exists ai_network.ai_finance_usage_ledger (
  usage_event_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  organization_id uuid references ai_network.ai_organizations(organization_id) on delete restrict,
  department_id uuid references ai_network.ai_departments(department_id) on delete restrict,
  task_id uuid references ai_network.ai_task_queue(task_id) on delete restrict,
  provider_assignment_id uuid references ai_network.ai_provider_assignments(assignment_id) on delete restrict,
  event_type text not null check (event_type in ('provider_usage','compute_usage','storage_usage')),
  provider_name text,
  model_identifier text,
  input_tokens bigint not null default 0 check (input_tokens between 0 and 1000000000000),
  output_tokens bigint not null default 0 check (output_tokens between 0 and 1000000000000),
  total_tokens bigint generated always as (input_tokens + output_tokens) stored,
  actual_cost_usd numeric(18,8) not null default 0 check (actual_cost_usd between 0 and 1000000000),
  cpu_milliseconds bigint not null default 0 check (cpu_milliseconds between 0 and 1000000000000000),
  gpu_milliseconds bigint not null default 0 check (gpu_milliseconds between 0 and 1000000000000000),
  memory_mb_minutes bigint not null default 0 check (memory_mb_minutes between 0 and 1000000000000000),
  storage_byte_hours bigint not null default 0 check (storage_byte_hours between 0 and 1000000000000000000),
  currency text not null default 'USD' check (currency='USD'),
  source_event_id text not null check (source_event_id ~ '^[A-Za-z0-9._:-]{8,160}$'),
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=8192),
  created_at timestamptz not null default now(),
  unique(owner_user_id,source_event_id),
  check (
    event_type<>'provider_usage' or
    (provider_assignment_id is not null and length(coalesce(provider_name,''))>0 and length(coalesce(model_identifier,''))>0)
  )
);
create index if not exists ai_finance_usage_owner_time_idx
  on ai_network.ai_finance_usage_ledger(owner_user_id,occurred_at desc);
create index if not exists ai_finance_usage_identity_time_idx
  on ai_network.ai_finance_usage_ledger(owner_user_id,identity_id,occurred_at desc);
create index if not exists ai_finance_usage_org_time_idx
  on ai_network.ai_finance_usage_ledger(owner_user_id,organization_id,occurred_at desc)
  where organization_id is not null;
create index if not exists ai_finance_usage_task_idx
  on ai_network.ai_finance_usage_ledger(task_id,occurred_at desc)
  where task_id is not null;

alter table ai_network.ai_finance_budget_policies enable row level security;
alter table ai_network.ai_finance_budget_history enable row level security;
alter table ai_network.ai_finance_usage_ledger enable row level security;
revoke all on table ai_network.ai_finance_budget_policies from public,anon,authenticated;
revoke all on table ai_network.ai_finance_budget_history from public,anon,authenticated;
revoke all on table ai_network.ai_finance_usage_ledger from public,anon,authenticated;
grant select,insert,update on ai_network.ai_finance_budget_policies to service_role;
grant select,insert on ai_network.ai_finance_budget_history to service_role;
grant select,insert on ai_network.ai_finance_usage_ledger to service_role;

create or replace function ai_network.prevent_ai_finance_ledger_mutation()
returns trigger
language plpgsql
security invoker
set search_path=''
as $function$
begin
  raise exception using errcode='42501',message='AI finance history and usage records are append-only.';
end;
$function$;
revoke all on function ai_network.prevent_ai_finance_ledger_mutation() from public,anon,authenticated;
grant execute on function ai_network.prevent_ai_finance_ledger_mutation() to service_role;
drop trigger if exists ai_finance_budget_history_immutable on ai_network.ai_finance_budget_history;
create trigger ai_finance_budget_history_immutable
  before update or delete on ai_network.ai_finance_budget_history
  for each row execute function ai_network.prevent_ai_finance_ledger_mutation();
drop trigger if exists ai_finance_usage_ledger_immutable on ai_network.ai_finance_usage_ledger;
create trigger ai_finance_usage_ledger_immutable
  before update or delete on ai_network.ai_finance_usage_ledger
  for each row execute function ai_network.prevent_ai_finance_ledger_mutation();


-- Enforce owner/org/department/identity task reservations before queue insertion.
-- Provider usage is still recorded even when it exceeds a cap; this guard applies before work is accepted.
create or replace function ai_network.enforce_ai_finance_task_budget()
returns trigger
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_department_id uuid;
  v_budget record;
  v_used_tokens bigint;
  v_reserved_tokens bigint;
  v_used_cost numeric(18,8);
  v_reserved_cost numeric(18,8);
  v_active_tasks bigint;
begin
  if current_user<>'service_role' then
    raise exception using errcode='42501',message='AI task budget checks are restricted to the private Minglora runtime.';
  end if;
  if tg_op='UPDATE' and new.status not in ('queued','running') then return new; end if;
  if new.organization_id is not null then
    select e.department_id into v_department_id
    from ai_network.ai_employment_records e
    where e.organization_id=new.organization_id and e.identity_id=new.identity_id
      and e.employment_status in ('active','restricted')
    order by e.updated_at desc
    limit 1;
  end if;

  for v_budget in
    select b.* from ai_network.ai_finance_budget_policies b
    where b.owner_user_id=new.owner_user_id
      and b.scope_type='owner'
    union all
    select b.* from ai_network.ai_finance_budget_policies b
    where b.owner_user_id=new.owner_user_id and b.scope_type='organization'
      and b.organization_id=new.organization_id
    union all
    select b.* from ai_network.ai_finance_budget_policies b
    where b.owner_user_id=new.owner_user_id and b.scope_type='department'
      and b.organization_id=new.organization_id and b.department_id=v_department_id
    union all
    select b.* from ai_network.ai_finance_budget_policies b
    where b.owner_user_id=new.owner_user_id and b.scope_type='identity'
      and b.identity_id=new.identity_id
  loop
    if v_budget.policy_status='paused' then
      raise exception using errcode='42501',message='An applicable AI finance budget is paused; no new task was accepted.';
    end if;
    if v_budget.policy_status<>'active' then continue; end if;

    if v_budget.daily_token_limit is not null then
      select coalesce(sum(l.total_tokens),0) into v_used_tokens
      from ai_network.ai_finance_usage_ledger l
      where l.owner_user_id=new.owner_user_id
        and l.occurred_at>=date_trunc('day',now()) and l.occurred_at<date_trunc('day',now())+interval '1 day'
        and (v_budget.scope_type='owner'
          or (v_budget.scope_type='organization' and l.organization_id=v_budget.organization_id)
          or (v_budget.scope_type='department' and l.department_id=v_budget.department_id)
          or (v_budget.scope_type='identity' and l.identity_id=v_budget.identity_id));
      select coalesce(sum(q.token_budget),0) into v_reserved_tokens
      from ai_network.ai_task_queue q
      where q.owner_user_id=new.owner_user_id and q.task_id<>new.task_id
        and q.created_at>=date_trunc('day',now())
        and q.status in ('pending_approval','queued','running')
        and (v_budget.scope_type='owner'
          or (v_budget.scope_type='organization' and q.organization_id=v_budget.organization_id)
          or (v_budget.scope_type='identity' and q.identity_id=v_budget.identity_id)
          or (v_budget.scope_type='department' and exists(
            select 1 from ai_network.ai_employment_records e
            where e.organization_id=q.organization_id and e.identity_id=q.identity_id
              and e.department_id=v_budget.department_id and e.employment_status in ('active','restricted')
          )));
      if v_used_tokens+v_reserved_tokens+new.token_budget>v_budget.daily_token_limit then
        raise exception using errcode='22023',message='The AI task would exceed an applicable daily token budget.';
      end if;
    end if;

    if v_budget.monthly_spend_limit_usd is not null then
      select coalesce(sum(l.actual_cost_usd),0) into v_used_cost
      from ai_network.ai_finance_usage_ledger l
      where l.owner_user_id=new.owner_user_id
        and l.occurred_at>=date_trunc('month',now()) and l.occurred_at<date_trunc('month',now())+interval '1 month'
        and (v_budget.scope_type='owner'
          or (v_budget.scope_type='organization' and l.organization_id=v_budget.organization_id)
          or (v_budget.scope_type='department' and l.department_id=v_budget.department_id)
          or (v_budget.scope_type='identity' and l.identity_id=v_budget.identity_id));
      select coalesce(sum(q.cost_limit_usd),0) into v_reserved_cost
      from ai_network.ai_task_queue q
      where q.owner_user_id=new.owner_user_id and q.task_id<>new.task_id
        and q.created_at>=date_trunc('month',now())
        and q.status in ('pending_approval','queued','running')
        and (v_budget.scope_type='owner'
          or (v_budget.scope_type='organization' and q.organization_id=v_budget.organization_id)
          or (v_budget.scope_type='identity' and q.identity_id=v_budget.identity_id)
          or (v_budget.scope_type='department' and exists(
            select 1 from ai_network.ai_employment_records e
            where e.organization_id=q.organization_id and e.identity_id=q.identity_id
              and e.department_id=v_budget.department_id and e.employment_status in ('active','restricted')
          )));
      if v_used_cost+v_reserved_cost+new.cost_limit_usd>v_budget.monthly_spend_limit_usd then
        raise exception using errcode='22023',message='The AI task would exceed an applicable monthly spend budget.';
      end if;
    end if;

    if v_budget.max_concurrent_tasks is not null and new.status in ('queued','running') then
      select count(*) into v_active_tasks
      from ai_network.ai_task_queue q
      where q.owner_user_id=new.owner_user_id and q.task_id<>new.task_id
        and q.status in ('queued','running')
        and (v_budget.scope_type='owner'
          or (v_budget.scope_type='organization' and q.organization_id=v_budget.organization_id)
          or (v_budget.scope_type='identity' and q.identity_id=v_budget.identity_id)
          or (v_budget.scope_type='department' and exists(
            select 1 from ai_network.ai_employment_records e
            where e.organization_id=q.organization_id and e.identity_id=q.identity_id
              and e.department_id=v_budget.department_id and e.employment_status in ('active','restricted')
          )));
      if v_active_tasks+1>v_budget.max_concurrent_tasks then
        raise exception using errcode='22023',message='The AI task would exceed an applicable concurrent-task limit.';
      end if;
    end if;
  end loop;
  return new;
end;
$function$;
revoke all on function ai_network.enforce_ai_finance_task_budget() from public,anon,authenticated;
grant execute on function ai_network.enforce_ai_finance_task_budget() to service_role;
drop trigger if exists ai_finance_task_budget_guard on ai_network.ai_task_queue;
create trigger ai_finance_task_budget_guard
  before insert or update on ai_network.ai_task_queue
  for each row execute function ai_network.enforce_ai_finance_task_budget();

create or replace function public.minglora_ai_finance_command(
  p_action text,
  p_actor_user_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_action text:=lower(coalesce(p_action,''));
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_scope text;
  v_org uuid;
  v_department uuid;
  v_identity uuid;
  v_policy_id uuid;
  v_before jsonb;
  v_policy jsonb;
  v_reason text;
  v_status text;
  v_daily bigint;
  v_spend numeric(18,6);
  v_cpu bigint;
  v_gpu bigint;
  v_memory bigint;
  v_storage bigint;
  v_concurrency integer;
  v_event_id uuid;
  v_source text;
  v_event_type text;
  v_assignment uuid;
  v_task uuid;
  v_provider text;
  v_model text;
  v_input bigint;
  v_output bigint;
  v_cost numeric(18,8);
  v_cpu_used bigint;
  v_gpu_used bigint;
  v_memory_used bigint;
  v_storage_used bigint;
  v_metadata jsonb;
  v_occurred timestamptz;
  v_from timestamptz;
  v_to timestamptz;
  v_limit integer;
  v_existing ai_network.ai_finance_usage_ledger%rowtype;
  v_result jsonb;
begin
  if current_user<>'service_role' then
    raise exception using errcode='42501',message='AI finance commands are restricted to the private Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode='42501',message='A valid signed-in Minglora administrator is required.';
  end if;
  if jsonb_typeof(v_payload)<>'object' or octet_length(v_payload::text)>32768 then
    raise exception using errcode='22023',message='AI finance input must be a JSON object no larger than 32 KB.';
  end if;
  if v_payload::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
    raise exception using errcode='22023',message='Credentials and secrets are not allowed in AI finance data.';
  end if;

  if v_action='list_budgets' then
    select jsonb_build_object(
      'budgets',coalesce(jsonb_agg(to_jsonb(b) order by b.scope_type,b.created_at),'[]'::jsonb),
      'policy_count',count(*)
    ) into v_result
    from ai_network.ai_finance_budget_policies b
    where b.owner_user_id=p_actor_user_id and b.policy_status<>'archived';
    return v_result;
  end if;

  if v_action='set_budget' then
    v_scope:=lower(coalesce(v_payload->>'scope_type','owner'));
    v_org:=nullif(v_payload->>'organization_id','')::uuid;
    v_department:=nullif(v_payload->>'department_id','')::uuid;
    v_identity:=nullif(v_payload->>'identity_id','')::uuid;
    v_reason:=left(trim(coalesce(v_payload->>'reason','')),1000);
    v_status:=lower(coalesce(v_payload->>'policy_status','active'));
    v_daily:=nullif(v_payload->>'daily_token_limit','')::bigint;
    v_spend:=nullif(v_payload->>'monthly_spend_limit_usd','')::numeric;
    v_cpu:=nullif(v_payload->>'monthly_cpu_milliseconds_limit','')::bigint;
    v_gpu:=nullif(v_payload->>'monthly_gpu_milliseconds_limit','')::bigint;
    v_memory:=nullif(v_payload->>'monthly_memory_mb_minutes_limit','')::bigint;
    v_storage:=nullif(v_payload->>'monthly_storage_byte_hours_limit','')::bigint;
    v_concurrency:=nullif(v_payload->>'max_concurrent_tasks','')::integer;
    if v_scope not in ('owner','organization','department','identity') or v_status not in ('active','paused','archived') then
      raise exception using errcode='22023',message='Choose a supported budget scope and status.';
    end if;
    if length(v_reason)<10 then raise exception using errcode='22023',message='A budget change reason of at least 10 characters is required.'; end if;
    if v_daily is null and v_spend is null and v_cpu is null and v_gpu is null and v_memory is null and v_storage is null and v_concurrency is null then
      raise exception using errcode='22023',message='Set at least one measurable budget limit.';
    end if;
    if v_scope='owner' and (v_org is not null or v_department is not null or v_identity is not null) then
      raise exception using errcode='22023',message='Owner budgets must not include organization, department or identity IDs.';
    elsif v_scope='organization' and (v_org is null or v_department is not null or v_identity is not null) then
      raise exception using errcode='22023',message='Organization budgets require only an organization ID.';
    elsif v_scope='department' and (v_org is null or v_department is null or v_identity is not null) then
      raise exception using errcode='22023',message='Department budgets require organization and department IDs.';
    elsif v_scope='identity' and (v_identity is null or v_org is not null or v_department is not null) then
      raise exception using errcode='22023',message='Identity budgets require only an identity ID.';
    end if;
    if v_org is not null and not exists(select 1 from ai_network.ai_organizations o where o.organization_id=v_org and o.owner_user_id=p_actor_user_id) then
      raise exception using errcode='42501',message='Organization is not owned by this Minglora administrator.';
    end if;
    if v_department is not null and not exists(
      select 1 from ai_network.ai_departments d where d.department_id=v_department and d.organization_id=v_org
    ) then
      raise exception using errcode='42501',message='Department does not belong to the selected organization.';
    end if;
    if v_identity is not null and not exists(select 1 from ai_network.ai_identities i where i.identity_id=v_identity and i.owner_user_id=p_actor_user_id) then
      raise exception using errcode='42501',message='AI identity is not owned by this Minglora administrator.';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text||':'||v_scope||':'||coalesce(v_org::text,'')||':'||coalesce(v_department::text,'')||':'||coalesce(v_identity::text,''),0));
    select b.budget_policy_id,to_jsonb(b) into v_policy_id,v_before
    from ai_network.ai_finance_budget_policies b
    where b.owner_user_id=p_actor_user_id and b.scope_type=v_scope
      and b.organization_id is not distinct from v_org
      and b.department_id is not distinct from v_department
      and b.identity_id is not distinct from v_identity
    for update;
    if v_policy_id is null then
      insert into ai_network.ai_finance_budget_policies(
        owner_user_id,scope_type,organization_id,department_id,identity_id,
        daily_token_limit,monthly_spend_limit_usd,monthly_cpu_milliseconds_limit,
        monthly_gpu_milliseconds_limit,monthly_memory_mb_minutes_limit,
        monthly_storage_byte_hours_limit,max_concurrent_tasks,policy_status,
        created_by_user_id,updated_by_user_id
      ) values (
        p_actor_user_id,v_scope,v_org,v_department,v_identity,
        v_daily,v_spend,v_cpu,v_gpu,v_memory,v_storage,v_concurrency,v_status,
        p_actor_user_id,p_actor_user_id
      ) returning budget_policy_id,to_jsonb(ai_finance_budget_policies) into v_policy_id,v_policy;
      v_status:='created';
    else
      update ai_network.ai_finance_budget_policies b set
        daily_token_limit=v_daily,monthly_spend_limit_usd=v_spend,
        monthly_cpu_milliseconds_limit=v_cpu,monthly_gpu_milliseconds_limit=v_gpu,
        monthly_memory_mb_minutes_limit=v_memory,monthly_storage_byte_hours_limit=v_storage,
        max_concurrent_tasks=v_concurrency,policy_status=v_status,
        updated_by_user_id=p_actor_user_id,updated_at=now()
      where b.budget_policy_id=v_policy_id
      returning to_jsonb(b) into v_policy;
      v_status:='updated';
    end if;
    insert into ai_network.ai_finance_budget_history(
      owner_user_id,budget_policy_id,actor_user_id,action,reason,previous_policy,new_policy
    ) values(
      p_actor_user_id,v_policy_id,p_actor_user_id,
      case when v_before is null then 'created' when coalesce(v_policy->>'policy_status','')='archived' then 'archived' when coalesce(v_policy->>'policy_status','')='paused' then 'paused' when coalesce(v_policy->>'policy_status','')='active' and coalesce(v_before->>'policy_status','')='paused' then 'reactivated' else 'updated' end,
      v_reason,v_before,coalesce(v_policy,'{}'::jsonb)
    );
    return jsonb_build_object('budget',v_policy,'reused',v_before is not null);
  end if;

  if v_action='list_usage' then
    v_from:=coalesce(nullif(v_payload->>'from','')::timestamptz,now()-interval '30 days');
    v_to:=coalesce(nullif(v_payload->>'to','')::timestamptz,now());
    v_limit:=coalesce(nullif(v_payload->>'limit','')::integer,100);
    if v_to<=v_from or v_to-v_from>interval '90 days' or v_limit<1 or v_limit>200 then
      raise exception using errcode='22023',message='Usage report range must be between 0 and 90 days and limit 1–200.';
    end if;
    select jsonb_build_object(
      'from',v_from,'to',v_to,
      'summary',jsonb_build_object(
        'event_count',count(*),'input_tokens',coalesce(sum(l.input_tokens),0),
        'output_tokens',coalesce(sum(l.output_tokens),0),'total_tokens',coalesce(sum(l.total_tokens),0),
        'actual_cost_usd',coalesce(sum(l.actual_cost_usd),0),
        'cpu_milliseconds',coalesce(sum(l.cpu_milliseconds),0),
        'gpu_milliseconds',coalesce(sum(l.gpu_milliseconds),0),
        'memory_mb_minutes',coalesce(sum(l.memory_mb_minutes),0),
        'storage_byte_hours',coalesce(sum(l.storage_byte_hours),0)
      ),
      'events',coalesce((
        select jsonb_agg(to_jsonb(x) order by x.occurred_at desc)
        from (
          select * from ai_network.ai_finance_usage_ledger
          where owner_user_id=p_actor_user_id and occurred_at>=v_from and occurred_at<=v_to
          order by occurred_at desc limit v_limit
        ) x
      ),'[]'::jsonb)
    ) into v_result
    from ai_network.ai_finance_usage_ledger l
    where l.owner_user_id=p_actor_user_id and l.occurred_at>=v_from and l.occurred_at<=v_to;
    return v_result;
  end if;

  if v_action='record_usage' then
    v_source:=trim(coalesce(v_payload->>'source_event_id',''));
    v_event_type:=lower(coalesce(v_payload->>'event_type','provider_usage'));
    v_identity:=nullif(v_payload->>'identity_id','')::uuid;
    v_assignment:=nullif(v_payload->>'provider_assignment_id','')::uuid;
    v_task:=nullif(v_payload->>'task_id','')::uuid;
    v_input:=coalesce(nullif(v_payload->>'input_tokens','')::bigint,0);
    v_output:=coalesce(nullif(v_payload->>'output_tokens','')::bigint,0);
    v_cost:=coalesce(nullif(v_payload->>'actual_cost_usd','')::numeric,0);
    v_cpu_used:=coalesce(nullif(v_payload->>'cpu_milliseconds','')::bigint,0);
    v_gpu_used:=coalesce(nullif(v_payload->>'gpu_milliseconds','')::bigint,0);
    v_memory_used:=coalesce(nullif(v_payload->>'memory_mb_minutes','')::bigint,0);
    v_storage_used:=coalesce(nullif(v_payload->>'storage_byte_hours','')::bigint,0);
    v_metadata:=coalesce(v_payload->'metadata','{}'::jsonb);
    v_occurred:=coalesce(nullif(v_payload->>'occurred_at','')::timestamptz,now());
    if length(v_source)<8 or length(v_source)>160 or v_source !~ '^[A-Za-z0-9._:-]+$' then
      raise exception using errcode='22023',message='A stable provider/runtime source event ID is required.';
    end if;
    if v_event_type not in ('provider_usage','compute_usage','storage_usage') then
      raise exception using errcode='22023',message='Choose a supported measured usage event type.';
    end if;
    if v_identity is null or not exists(select 1 from ai_network.ai_identities i where i.identity_id=v_identity and i.owner_user_id=p_actor_user_id) then
      raise exception using errcode='42501',message='AI identity is not owned by this Minglora administrator.';
    end if;
    if v_event_type='provider_usage' then
      if v_assignment is null then raise exception using errcode='22023',message='Provider usage must reference its actual provider assignment.'; end if;
      select m.provider_name,m.model_identifier into v_provider,v_model
      from ai_network.ai_provider_assignments a
      join ai_network.ai_provider_models m on m.model_id=a.model_id
      where a.assignment_id=v_assignment and a.identity_id=v_identity;
      if v_provider is null then raise exception using errcode='42501',message='Provider assignment does not belong to the selected AI identity.'; end if;
    end if;
    if v_task is not null and not exists(
      select 1 from ai_network.ai_task_queue q where q.task_id=v_task and q.owner_user_id=p_actor_user_id and q.identity_id=v_identity
    ) then raise exception using errcode='42501',message='Task does not belong to this owner and AI identity.'; end if;
    if v_task is not null then
      select q.organization_id into v_org from ai_network.ai_task_queue q
      where q.task_id=v_task and q.owner_user_id=p_actor_user_id and q.identity_id=v_identity;
    end if;
    if v_org is null then
      select e.organization_id into v_org from ai_network.ai_employment_records e
      where e.identity_id=v_identity and e.employment_status in ('active','restricted')
      order by e.updated_at desc limit 1;
    end if;
    if v_org is not null then
      select e.department_id into v_department from ai_network.ai_employment_records e
      where e.organization_id=v_org and e.identity_id=v_identity and e.employment_status in ('active','restricted')
      order by e.updated_at desc limit 1;
    end if;
    if jsonb_typeof(v_metadata)<>'object' or octet_length(v_metadata::text)>8192 or
       v_metadata::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
      raise exception using errcode='22023',message='Usage metadata must be a small, non-secret JSON object.';
    end if;
    insert into ai_network.ai_finance_usage_ledger(
      owner_user_id,identity_id,organization_id,department_id,task_id,provider_assignment_id,event_type,provider_name,model_identifier,
      input_tokens,output_tokens,actual_cost_usd,cpu_milliseconds,gpu_milliseconds,
      memory_mb_minutes,storage_byte_hours,source_event_id,occurred_at,metadata
    ) values(
      p_actor_user_id,v_identity,v_org,v_department,v_task,v_assignment,v_event_type,v_provider,v_model,
      v_input,v_output,v_cost,v_cpu_used,v_gpu_used,v_memory_used,v_storage_used,
      v_source,v_occurred,v_metadata
    ) on conflict(owner_user_id,source_event_id) do nothing
    returning usage_event_id into v_event_id;
    if v_event_id is null then
      select * into v_existing from ai_network.ai_finance_usage_ledger l
      where l.owner_user_id=p_actor_user_id and l.source_event_id=v_source;
      if v_existing.identity_id<>v_identity or v_existing.organization_id is distinct from v_org or
         v_existing.department_id is distinct from v_department or v_existing.task_id is distinct from v_task or
         v_existing.provider_assignment_id is distinct from v_assignment or
         v_existing.provider_name is distinct from v_provider or v_existing.model_identifier is distinct from v_model or
         v_existing.event_type<>v_event_type or v_existing.input_tokens<>v_input or
         v_existing.output_tokens<>v_output or v_existing.actual_cost_usd<>v_cost or
         v_existing.cpu_milliseconds<>v_cpu_used or v_existing.gpu_milliseconds<>v_gpu_used or
         v_existing.memory_mb_minutes<>v_memory_used or v_existing.storage_byte_hours<>v_storage_used or
         v_existing.occurred_at is distinct from v_occurred or v_existing.metadata is distinct from v_metadata then
        raise exception using errcode='23505',message='Usage source event ID was reused with different measured values.';
      end if;
      return jsonb_build_object('usage_event',to_jsonb(v_existing),'reused',true);
    end if;
    select to_jsonb(l) into v_result from ai_network.ai_finance_usage_ledger l where l.usage_event_id=v_event_id;
    return jsonb_build_object('usage_event',v_result,'reused',false);
  end if;

  raise exception using errcode='22023',message='Unsupported AI finance command.';
end;
$function$;

revoke all on function public.minglora_ai_finance_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_finance_command(text,uuid,jsonb) to service_role;
