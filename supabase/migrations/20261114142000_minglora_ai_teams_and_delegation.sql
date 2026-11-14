-- Minglora AI Network: relational teams and explicit, human-reviewed delegation.
-- Delegation can enqueue only read-only/content tasks; execution remains subject to task approval and paused runtime controls.

create table if not exists ai_network.ai_teams (
  team_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid references ai_network.ai_organizations(organization_id) on delete restrict,
  population_scope text not null check (population_scope in ('independent','organizational','specialized_service')),
  team_name text not null check (length(trim(team_name)) between 2 and 80),
  description text not null default '' check (length(description) <= 1000),
  coordination_mode text not null default 'human_reviewed'
    check (coordination_mode in ('human_reviewed','manager_supervised')),
  status text not null default 'draft'
    check (status in ('draft','active','paused','archived')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id,team_id),
  unique (owner_user_id,idempotency_key),
  check ((population_scope='organizational') = (organization_id is not null))
);

create unique index if not exists ai_teams_owner_name_lower_uidx
  on ai_network.ai_teams(owner_user_id,lower(team_name))
  where status <> 'archived';
create index if not exists ai_teams_owner_status_recent_idx
  on ai_network.ai_teams(owner_user_id,status,created_at desc);
create index if not exists ai_teams_organization_status_idx
  on ai_network.ai_teams(organization_id,status)
  where organization_id is not null;

create table if not exists ai_network.ai_team_memberships (
  membership_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  team_id uuid not null references ai_network.ai_teams(team_id) on delete restrict,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  member_role text not null default 'member'
    check (member_role in ('lead','member','observer')),
  membership_status text not null default 'active'
    check (membership_status in ('active','paused','removed')),
  added_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id,identity_id),
  unique (owner_user_id,membership_id)
);
create index if not exists ai_team_memberships_owner_team_status_idx
  on ai_network.ai_team_memberships(owner_user_id,team_id,membership_status,member_role);
create index if not exists ai_team_memberships_identity_status_idx
  on ai_network.ai_team_memberships(identity_id,membership_status);

create unique index if not exists ai_team_one_active_lead_uidx
  on ai_network.ai_team_memberships(team_id)
  where membership_status='active' and member_role='lead';

create table if not exists ai_network.ai_delegation_grants (
  delegation_grant_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  team_id uuid not null references ai_network.ai_teams(team_id) on delete restrict,
  grantor_identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  grantee_identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  allowed_task_types text[] not null check (
    cardinality(allowed_task_types) between 1 and 50
    and array_position(allowed_task_types,null) is null
  ),
  allowed_action_classes text[] not null check (
    cardinality(allowed_action_classes) between 1 and 2
    and allowed_action_classes <@ array['read_only','content']::text[]
  ),
  max_token_budget integer not null default 0 check (max_token_budget between 0 and 10000000),
  max_cost_limit_usd numeric(14,6) not null default 0 check (max_cost_limit_usd between 0 and 1000),
  requires_human_approval boolean not null default true check (requires_human_approval=true),
  grant_status text not null default 'active'
    check (grant_status in ('active','paused','revoked','expired')),
  expires_at timestamptz not null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id,delegation_grant_id),
  unique (owner_user_id,idempotency_key),
  check (grantor_identity_id <> grantee_identity_id)
);
create index if not exists ai_delegation_grants_owner_status_expiry_idx
  on ai_network.ai_delegation_grants(owner_user_id,grant_status,expires_at);
create index if not exists ai_delegation_grants_team_pair_idx
  on ai_network.ai_delegation_grants(team_id,grantor_identity_id,grantee_identity_id,grant_status);

create table if not exists ai_network.ai_delegation_events (
  delegation_event_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  delegation_grant_id uuid not null references ai_network.ai_delegation_grants(delegation_grant_id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_identity_id uuid references ai_network.ai_identities(identity_id) on delete restrict,
  event_type text not null check (event_type in ('grant_created','grant_revoked','grant_paused','grant_reactivated','task_delegated')),
  reason text not null default '' check (length(reason) <= 1000),
  task_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now()
);
create index if not exists ai_delegation_events_owner_grant_time_idx
  on ai_network.ai_delegation_events(owner_user_id,delegation_grant_id,occurred_at desc);

alter table ai_network.ai_task_queue
  add column if not exists delegation_grant_id uuid
    references ai_network.ai_delegation_grants(delegation_grant_id) on delete restrict;
alter table ai_network.ai_task_queue
  add column if not exists delegated_from_identity_id uuid
    references ai_network.ai_identities(identity_id) on delete restrict;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='ai_task_queue_delegation_pair_check'
      and conrelid='ai_network.ai_task_queue'::regclass
  ) then
    alter table ai_network.ai_task_queue
      add constraint ai_task_queue_delegation_pair_check
      check ((delegation_grant_id is null) = (delegated_from_identity_id is null));
  end if;
end
$$;
create index if not exists ai_task_queue_owner_delegation_idx
  on ai_network.ai_task_queue(owner_user_id,delegation_grant_id,created_at desc)
  where delegation_grant_id is not null;

alter table ai_network.ai_teams enable row level security;
alter table ai_network.ai_team_memberships enable row level security;
alter table ai_network.ai_delegation_grants enable row level security;
alter table ai_network.ai_delegation_events enable row level security;
revoke all on ai_network.ai_teams,ai_network.ai_team_memberships,
  ai_network.ai_delegation_grants,ai_network.ai_delegation_events from public,anon,authenticated;
grant select,insert,update on ai_network.ai_teams to service_role;
grant select,insert,update on ai_network.ai_team_memberships to service_role;
grant select,insert,update on ai_network.ai_delegation_grants to service_role;
grant select,insert on ai_network.ai_delegation_events to service_role;

create or replace function public.minglora_ai_team_command(
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
  v_owner uuid := p_actor_user_id;
  v_team_id uuid;
  v_org_id uuid;
  v_identity_id uuid;
  v_from_identity_id uuid;
  v_to_identity_id uuid;
  v_grant_id uuid;
  v_task_id uuid;
  v_member jsonb;
  v_member_ids jsonb;
  v_name text;
  v_description text;
  v_scope text;
  v_role text;
  v_key text;
  v_task_title text;
  v_task_type text;
  v_action_class text;
  v_token_budget integer;
  v_cost_limit numeric(14,6);
  v_grant_max_token_budget integer;
  v_grant_max_cost_limit numeric(14,6);
  v_expiry timestamptz;
  v_grant_reused boolean := false;
  v_allowed_task_types text[];
  v_allowed_action_classes text[];
  v_org_id_for_grant uuid;
  v_task_result jsonb;
  v_task_row ai_network.ai_task_queue%rowtype;
  v_task_status text;
  v_created_count integer := 0;
  v_existing_id uuid;
  v_result jsonb;
  v_rows jsonb;
  v_reason text;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='AI team and delegation commands are restricted to Minglora server runtime.';
  end if;
  if v_owner is null or not exists(select 1 from public.profiles p where p.id=v_owner) then
    raise exception using errcode='42501',message='A valid signed-in Minglora account is required.';
  end if;
  if jsonb_typeof(v_payload)<>'object' then
    raise exception using errcode='22023',message='AI team command payload must be a JSON object.';
  end if;

  if v_action='create_team' then
    v_name:=left(trim(coalesce(v_payload->>'team_name',v_payload->>'name','')),80);
    v_description:=left(trim(coalesce(v_payload->>'description','')),1000);
    v_scope:=lower(coalesce(nullif(v_payload->>'population_scope',''),'independent'));
    v_key:=nullif(trim(coalesce(v_payload->>'idempotency_key','')),'');
    v_member_ids:=coalesce(v_payload->'member_ids','[]'::jsonb);
    v_org_id:=nullif(v_payload->>'organization_id','')::uuid;
    if length(v_name)<2 then raise exception using errcode='22023',message='Team name must contain at least two characters.'; end if;
    if v_scope not in ('independent','organizational','specialized_service') then
      raise exception using errcode='22023',message='Choose a supported AI team population.';
    end if;
    if (v_scope='organizational') <> (v_org_id is not null) then
      raise exception using errcode='22023',message='Organizational teams must reference their organization; other teams cannot.';
    end if;
    if jsonb_typeof(v_member_ids)<>'array' or jsonb_array_length(v_member_ids)<1 or jsonb_array_length(v_member_ids)>20 then
      raise exception using errcode='22023',message='Choose between 1 and 20 AI team members.';
    end if;
    if v_key is null or length(v_key)<8 or length(v_key)>160 then
      raise exception using errcode='22023',message='A stable team idempotency key is required.';
    end if;
    if v_scope='organizational' then
      if not exists(select 1 from public.minglora_platform_staff s
        where s.user_id=v_owner and s.active=true and s.role in ('owner','admin','moderator')) then
        raise exception using errcode='42501',message='Only an authorized Minglora platform administrator can create organizational AI teams.';
      end if;
      if not exists(select 1 from ai_network.ai_organizations o
        where o.organization_id=v_org_id and o.owner_user_id=v_owner
          and o.status not in ('suspended','archived')) then
        raise exception using errcode='42501',message='Organization is unavailable for this Minglora administrator.';
      end if;
    end if;
    select t.team_id into v_team_id from ai_network.ai_teams t
      where t.owner_user_id=v_owner and t.idempotency_key=v_key;
    if v_team_id is null then
      insert into ai_network.ai_teams(
        owner_user_id,organization_id,population_scope,team_name,description,
        coordination_mode,status,idempotency_key,created_by_user_id
      ) values (
        v_owner,v_org_id,v_scope,v_name,v_description,
        case when v_scope='organizational' then 'manager_supervised' else 'human_reviewed' end,
        'draft',v_key,v_owner
      )
      on conflict(owner_user_id,idempotency_key) do nothing
      returning team_id into v_team_id;
    end if;
    if v_team_id is null then
      select t.team_id into v_team_id from ai_network.ai_teams t
        where t.owner_user_id=v_owner and t.idempotency_key=v_key;
    end if;
    if not exists(select 1 from ai_network.ai_teams t
      where t.team_id=v_team_id and t.owner_user_id=v_owner
        and t.team_name=v_name and t.population_scope=v_scope
        and t.organization_id is not distinct from v_org_id) then
      raise exception using errcode='23505',message='Team idempotency key was already used for a different team request.';
    end if;
    for v_member in select value from jsonb_array_elements(v_member_ids) loop
      if jsonb_typeof(v_member)<>'string' or (v_member #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode='22023',message='Every team member must be a valid AI identity ID.';
      end if;
      v_identity_id:=(v_member #>> '{}')::uuid;
      if not exists(select 1 from ai_network.ai_identities i
        where i.identity_id=v_identity_id and i.owner_user_id=v_owner
          and i.population=v_scope and i.status not in ('suspended','archived','retired')) then
        raise exception using errcode='42501',message='Every team member must be an available, owner-controlled AI identity in the team population.';
      end if;
      if v_scope='organizational' and not exists(select 1 from ai_network.ai_employment_records e
        where e.organization_id=v_org_id and e.identity_id=v_identity_id
          and e.employment_status in ('onboarding','active','restricted')) then
        raise exception using errcode='42501',message='Organizational team members must have a current employment record in this organization.';
      end if;
      insert into ai_network.ai_team_memberships(
        owner_user_id,team_id,identity_id,member_role,membership_status,added_by_user_id
      ) values (
        v_owner,v_team_id,v_identity_id,
        case when v_created_count=0 and not exists(select 1 from ai_network.ai_team_memberships m
          where m.team_id=v_team_id and m.membership_status='active' and m.member_role='lead')
          then 'lead' else 'member' end,
        'active',v_owner
      )
      on conflict(team_id,identity_id) do update
        set membership_status='active',updated_at=now()
      where ai_network.ai_team_memberships.owner_user_id=v_owner;
      v_created_count:=v_created_count+1;
    end loop;
    update ai_network.ai_teams t set status='active',updated_at=now()
      where t.team_id=v_team_id and t.owner_user_id=v_owner and t.status='draft';
    select to_jsonb(t) into v_result from ai_network.ai_teams t
      where t.team_id=v_team_id and t.owner_user_id=v_owner;
    return jsonb_build_object('team',v_result,'created_memberships',v_created_count);
  end if;

  if v_action='list_teams' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id',t.team_id,
        'team_id',t.team_id,
        'name',t.team_name,
        'description',t.description,
        'coordinationMode',t.coordination_mode,
        'status',t.status,
        'organization_id',t.organization_id,
        'population_scope',t.population_scope,
        'botIds',coalesce((
          select jsonb_agg(coalesce(nullif(p.extra_profile_data->>'bot_id',''),m.identity_id::text) order by m.created_at)
          from ai_network.ai_team_memberships m
          left join ai_network.ai_profiles p on p.identity_id=m.identity_id
          where m.team_id=t.team_id and m.owner_user_id=v_owner and m.membership_status='active'
        ),'[]'::jsonb),
        'members',coalesce((
          select jsonb_agg(jsonb_build_object(
            'identity_id',m.identity_id,
            'member_role',m.member_role,
            'membership_status',m.membership_status,
            'first_name',n.first_name,
            'last_name',n.last_name,
            'display_name',n.display_name,
            'username',n.username
          ) order by case m.member_role when 'lead' then 0 when 'member' then 1 else 2 end,m.created_at)
          from ai_network.ai_team_memberships m
          join ai_network.ai_names n on n.identity_id=m.identity_id
          where m.team_id=t.team_id and m.owner_user_id=v_owner and m.membership_status<>'removed'
        ),'[]'::jsonb)
      ) order by t.created_at desc
    ),'[]'::jsonb) into v_rows
    from ai_network.ai_teams t where t.owner_user_id=v_owner and t.status<>'archived';
    return jsonb_build_object('teams',v_rows);
  end if;

  if v_action in ('add_member','remove_member') then
    if coalesce(v_payload->>'team_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_payload->>'identity_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid team and AI identity are required.';
    end if;
    v_team_id:=(v_payload->>'team_id')::uuid;
    v_identity_id:=(v_payload->>'identity_id')::uuid;
    select t.organization_id,t.population_scope into v_org_id,v_scope
      from ai_network.ai_teams t where t.team_id=v_team_id and t.owner_user_id=v_owner
        and t.status in ('draft','active','paused') for update;
    if not found then raise exception using errcode='P0002',message='AI team not found or unavailable.'; end if;
    if not exists(select 1 from ai_network.ai_identities i where i.identity_id=v_identity_id
      and i.owner_user_id=v_owner and i.population=v_scope
      and i.status not in ('suspended','archived','retired')) then
      raise exception using errcode='42501',message='AI identity is not an available member of this owner-controlled team.';
    end if;
    if v_scope='organizational' and not exists(select 1 from public.minglora_platform_staff s
      where s.user_id=v_owner and s.active=true and s.role in ('owner','admin','moderator')) then
      raise exception using errcode='42501',message='Only an authorized platform administrator can manage organizational team members.';
    end if;
    if v_scope='organizational' and not exists(select 1 from ai_network.ai_employment_records e
      where e.organization_id=v_org_id and e.identity_id=v_identity_id
        and e.employment_status in ('onboarding','active','restricted')) then
      raise exception using errcode='42501',message='Organizational team members must have a current employment record in the organization.';
    end if;
    if v_action='remove_member' then
      update ai_network.ai_team_memberships m set membership_status='removed',updated_at=now()
        where m.team_id=v_team_id and m.identity_id=v_identity_id and m.owner_user_id=v_owner
          and m.membership_status<>'removed';
      if not found then raise exception using errcode='P0002',message='Active team membership not found.'; end if;
      update ai_network.ai_delegation_grants g set grant_status='revoked',updated_at=now()
        where g.team_id=v_team_id and g.owner_user_id=v_owner
          and (g.grantor_identity_id=v_identity_id or g.grantee_identity_id=v_identity_id)
          and g.grant_status='active';
      return jsonb_build_object('removed',true,'identity_id',v_identity_id);
    end if;
    v_role:=lower(coalesce(nullif(v_payload->>'member_role',''),'member'));
    if v_role not in ('lead','member','observer') then raise exception using errcode='22023',message='Choose lead, member or observer for a team role.'; end if;
    if v_role='lead' and exists(select 1 from ai_network.ai_team_memberships m
      where m.team_id=v_team_id and m.owner_user_id=v_owner and m.membership_status='active'
        and m.member_role='lead' and m.identity_id<>v_identity_id) then
      raise exception using errcode='23505',message='This team already has an active lead. Remove or change the existing lead first.';
    end if;
    insert into ai_network.ai_team_memberships(
      owner_user_id,team_id,identity_id,member_role,membership_status,added_by_user_id
    ) values (v_owner,v_team_id,v_identity_id,v_role,'active',v_owner)
    on conflict(team_id,identity_id) do update
      set member_role=excluded.member_role,membership_status='active',updated_at=now()
    where ai_network.ai_team_memberships.owner_user_id=v_owner;
    update ai_network.ai_teams set status='active',updated_at=now()
      where team_id=v_team_id and owner_user_id=v_owner and status='draft';
    return jsonb_build_object('added',true,'identity_id',v_identity_id,'member_role',v_role);
  end if;

  if v_action='create_delegation_grant' then
    if coalesce(v_payload->>'team_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_payload->>'grantor_identity_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_payload->>'grantee_identity_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid team, grantor and recipient AI identity are required.';
    end if;
    v_team_id:=(v_payload->>'team_id')::uuid;
    v_from_identity_id:=(v_payload->>'grantor_identity_id')::uuid;
    v_to_identity_id:=(v_payload->>'grantee_identity_id')::uuid;
    v_key:=nullif(trim(v_payload->>'idempotency_key'),'');
    if jsonb_typeof(coalesce(v_payload->'allowed_task_types','[]'::jsonb))<>'array'
       or jsonb_typeof(coalesce(v_payload->'allowed_action_classes','[]'::jsonb))<>'array' then
      raise exception using errcode='22023',message='Delegation task types and action classes must be arrays.';
    end if;
    v_allowed_task_types:=array(select lower(trim(q.value)) from jsonb_array_elements_text(coalesce(v_payload->'allowed_task_types','[]'::jsonb)) as q(value));
    v_allowed_action_classes:=array(select lower(trim(q.value)) from jsonb_array_elements_text(coalesce(v_payload->'allowed_action_classes','[]'::jsonb)) as q(value));
    v_token_budget:=coalesce(nullif(v_payload->>'max_token_budget','')::integer,0);
    v_cost_limit:=coalesce(nullif(v_payload->>'max_cost_limit_usd','')::numeric,0);
    v_expiry:=coalesce(nullif(v_payload->>'expires_at','')::timestamptz,now()+interval '30 days');
    select t.organization_id into v_org_id from ai_network.ai_teams t
      where t.team_id=v_team_id and t.owner_user_id=v_owner and t.status='active' for update;
    if not found then raise exception using errcode='P0002',message='Active AI team not found.'; end if;
    if v_from_identity_id=v_to_identity_id then raise exception using errcode='22023',message='An AI identity cannot delegate to itself.'; end if;
    if v_key is null or length(v_key)<8 or length(v_key)>160 then raise exception using errcode='22023',message='A stable delegation idempotency key is required.'; end if;
    if cardinality(v_allowed_task_types)<1 or cardinality(v_allowed_task_types)>50
       or exists(select 1 from unnest(v_allowed_task_types) x where x !~ '^[a-z][a-z0-9_.-]{1,79}$') then
      raise exception using errcode='22023',message='Delegation requires 1 to 50 valid task types.';
    end if;
    if cardinality(v_allowed_action_classes)<1 or cardinality(v_allowed_action_classes)>2
       or not (v_allowed_action_classes <@ array['read_only','content']::text[]) then
      raise exception using errcode='42501',message='Delegation is limited to read-only and content tasks; external, social, financial, security and moderation actions are not delegable.';
    end if;
    if v_token_budget<0 or v_token_budget>10000000 or v_cost_limit<0 or v_cost_limit>1000
       or v_expiry<=now() or v_expiry>now()+interval '90 days' then
      raise exception using errcode='22023',message='Delegation budgets or expiry are outside the allowed range.';
    end if;
    if not exists(select 1 from ai_network.ai_team_memberships m where m.team_id=v_team_id
      and m.owner_user_id=v_owner and m.identity_id=v_from_identity_id and m.membership_status='active'
      and m.member_role='lead') or not exists(select 1 from ai_network.ai_team_memberships m
      where m.team_id=v_team_id and m.owner_user_id=v_owner and m.identity_id=v_to_identity_id
        and m.membership_status='active' and m.member_role in ('member','observer')) then
      raise exception using errcode='42501',message='Delegation requires the active team lead and an active member or observer from the same team.';
    end if;
    if not exists(select 1 from ai_network.ai_identities i where i.identity_id=v_from_identity_id
      and i.owner_user_id=v_owner and i.status='active' and i.enabled=true)
       or not exists(select 1 from ai_network.ai_identities i where i.identity_id=v_to_identity_id
      and i.owner_user_id=v_owner and i.status='active' and i.enabled=true) then
      raise exception using errcode='42501',message='Both delegating and receiving AI identities must be active and enabled.';
    end if;
    if v_org_id is not null and not exists(
      select 1 from ai_network.ai_employment_records manager
      join ai_network.ai_employment_records report
        on report.manager_employment_id=manager.employment_id
        and report.organization_id=manager.organization_id
      where manager.organization_id=v_org_id and manager.identity_id=v_from_identity_id
        and report.identity_id=v_to_identity_id
        and manager.employment_status='active' and report.employment_status='active'
    ) then
      raise exception using errcode='42501',message='Organizational delegation is limited to the delegator’s active direct reports.';
    end if;
    select g.delegation_grant_id into v_existing_id from ai_network.ai_delegation_grants g
      where g.owner_user_id=v_owner and g.idempotency_key=v_key;
    v_grant_reused := v_existing_id is not null;
    if v_existing_id is null then
      insert into ai_network.ai_delegation_grants(
        owner_user_id,team_id,grantor_identity_id,grantee_identity_id,
        allowed_task_types,allowed_action_classes,max_token_budget,max_cost_limit_usd,
        requires_human_approval,grant_status,expires_at,idempotency_key,created_by_user_id
      ) values (
        v_owner,v_team_id,v_from_identity_id,v_to_identity_id,
        v_allowed_task_types,v_allowed_action_classes,v_token_budget,v_cost_limit,
        true,'active',v_expiry,v_key,v_owner
      ) on conflict(owner_user_id,idempotency_key) do nothing
      returning delegation_grant_id into v_existing_id;
    end if;
    if v_existing_id is null then
      select g.delegation_grant_id into v_existing_id from ai_network.ai_delegation_grants g
        where g.owner_user_id=v_owner and g.idempotency_key=v_key;
      v_grant_reused := true;
    end if;
    if not exists(select 1 from ai_network.ai_delegation_grants g where g.delegation_grant_id=v_existing_id
      and g.owner_user_id=v_owner and g.team_id=v_team_id and g.grantor_identity_id=v_from_identity_id
      and g.grantee_identity_id=v_to_identity_id and g.allowed_task_types=v_allowed_task_types
      and g.allowed_action_classes=v_allowed_action_classes and g.max_token_budget=v_token_budget
      and g.max_cost_limit_usd=v_cost_limit and g.expires_at=v_expiry) then
      raise exception using errcode='23505',message='Delegation idempotency key was already used for a different grant.';
    end if;
    if not v_grant_reused then
      insert into ai_network.ai_delegation_events(
        owner_user_id,delegation_grant_id,actor_user_id,actor_identity_id,event_type,reason,metadata
      ) values (
        v_owner,v_existing_id,v_owner,v_from_identity_id,'grant_created','Owner-authorized, human-reviewed delegation grant.',
        jsonb_build_object('team_id',v_team_id,'grantee_identity_id',v_to_identity_id,
          'allowed_task_types',to_jsonb(v_allowed_task_types),'allowed_action_classes',to_jsonb(v_allowed_action_classes),
          'requires_human_approval',true)
      );
    end if;
    select to_jsonb(g) into v_result from ai_network.ai_delegation_grants g
      where g.delegation_grant_id=v_existing_id and g.owner_user_id=v_owner;
    return jsonb_build_object('delegation_grant',v_result,'reused',v_grant_reused);
  end if;

  if v_action in ('revoke_delegation_grant','pause_delegation_grant','reactivate_delegation_grant') then
    if coalesce(v_payload->>'delegation_grant_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid delegation grant ID is required.';
    end if;
    v_grant_id:=(v_payload->>'delegation_grant_id')::uuid;
    v_reason:=left(trim(coalesce(v_payload->>'reason','Delegation authority changed by the owner.')),1000);
    if v_action='revoke_delegation_grant' then
      update ai_network.ai_delegation_grants g set grant_status='revoked',updated_at=now()
        where g.delegation_grant_id=v_grant_id and g.owner_user_id=v_owner
        returning g.team_id,g.grantor_identity_id into v_team_id,v_from_identity_id;
    elsif v_action='pause_delegation_grant' then
      update ai_network.ai_delegation_grants g set grant_status='paused',updated_at=now()
        where g.delegation_grant_id=v_grant_id and g.owner_user_id=v_owner
        returning g.team_id,g.grantor_identity_id into v_team_id,v_from_identity_id;
    else
      update ai_network.ai_delegation_grants g set grant_status='active',updated_at=now()
        where g.delegation_grant_id=v_grant_id and g.owner_user_id=v_owner
          and g.expires_at>now()
        returning g.team_id,g.grantor_identity_id into v_team_id,v_from_identity_id;
    end if;
    if v_team_id is null then raise exception using errcode='P0002',message='Delegation grant not found or unavailable.'; end if;
    insert into ai_network.ai_delegation_events(
      owner_user_id,delegation_grant_id,actor_user_id,actor_identity_id,event_type,reason
    ) values (
      v_owner,v_grant_id,v_owner,v_from_identity_id,
      case v_action when 'revoke_delegation_grant' then 'grant_revoked'
        when 'pause_delegation_grant' then 'grant_paused' else 'grant_reactivated' end,
      v_reason
    );
    select to_jsonb(g) into v_result from ai_network.ai_delegation_grants g
      where g.delegation_grant_id=v_grant_id and g.owner_user_id=v_owner;
    return jsonb_build_object('delegation_grant',v_result);
  end if;

  if v_action='list_delegation_grants' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'grant',to_jsonb(g),
      'team_name',t.team_name,
      'grantor_name',ng.display_name,
      'grantee_name',nt.display_name
    ) order by g.created_at desc),'[]'::jsonb) into v_rows
    from ai_network.ai_delegation_grants g
    join ai_network.ai_teams t on t.team_id=g.team_id and t.owner_user_id=v_owner
    join ai_network.ai_names ng on ng.identity_id=g.grantor_identity_id
    join ai_network.ai_names nt on nt.identity_id=g.grantee_identity_id
    where g.owner_user_id=v_owner;
    return jsonb_build_object('delegation_grants',v_rows);
  end if;

  if v_action='delegate_task' then
    if coalesce(v_payload->>'delegation_grant_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid delegation grant ID is required.';
    end if;
    v_grant_id:=(v_payload->>'delegation_grant_id')::uuid;
    v_task_title:=left(trim(coalesce(v_payload->>'task_title','')),180);
    v_task_type:=lower(trim(coalesce(v_payload->>'task_type','')));
    v_action_class:=lower(trim(coalesce(v_payload->>'action_class','')));
    v_grant_max_token_budget:=0;
    v_grant_max_cost_limit:=0;
    v_token_budget:=coalesce(nullif(v_payload->>'token_budget','')::integer,0);
    v_cost_limit:=coalesce(nullif(v_payload->>'cost_limit_usd','')::numeric,0);
    v_key:=nullif(trim(coalesce(v_payload->>'idempotency_key','')),'');
    if length(v_task_title)<3 or v_key is null or length(v_key)<8 or length(v_key)>160 then
      raise exception using errcode='22023',message='Delegated task title and stable idempotency key are required.';
    end if;
    select g.team_id,g.grantor_identity_id,g.grantee_identity_id,g.allowed_task_types,
      g.allowed_action_classes,g.max_token_budget,g.max_cost_limit_usd,g.expires_at,
      t.organization_id
      into v_team_id,v_from_identity_id,v_to_identity_id,v_allowed_task_types,
        v_allowed_action_classes,v_grant_max_token_budget,v_grant_max_cost_limit,v_expiry,
        v_org_id
    from ai_network.ai_delegation_grants g
    join ai_network.ai_teams t on t.team_id=g.team_id and t.owner_user_id=g.owner_user_id
    where g.delegation_grant_id=v_grant_id and g.owner_user_id=v_owner
      and g.grant_status='active' and g.expires_at>now()
      and t.status='active';
    if not found then raise exception using errcode='42501',message='An active, unexpired delegation grant is required.'; end if;
    if v_task_type !~ '^[a-z][a-z0-9_.-]{1,79}$'
       or not (v_task_type=any(v_allowed_task_types))
       or not (v_action_class=any(v_allowed_action_classes))
       or v_action_class not in ('read_only','content') then
      raise exception using errcode='42501',message='Delegated task type or action class is outside the explicit grant scope.';
    end if;
    if v_token_budget<0 or v_cost_limit<0 then raise exception using errcode='22023',message='Delegated task budget must be non-negative.'; end if;
    if v_token_budget > v_grant_max_token_budget
       or v_cost_limit > v_grant_max_cost_limit then
      raise exception using errcode='42501',message='Delegated task exceeds its grant budget.';
    end if;
    if not exists(select 1 from ai_network.ai_team_memberships m where m.team_id=v_team_id
      and m.owner_user_id=v_owner and m.identity_id=v_from_identity_id
      and m.membership_status='active' and m.member_role='lead')
       or not exists(select 1 from ai_network.ai_team_memberships m where m.team_id=v_team_id
      and m.owner_user_id=v_owner and m.identity_id=v_to_identity_id
      and m.membership_status='active' and m.member_role in ('member','observer')) then
      raise exception using errcode='42501',message='Both identities must retain their active lead/member team memberships.';
    end if;
    if not exists(select 1 from ai_network.ai_identities i where i.identity_id=v_from_identity_id
      and i.owner_user_id=v_owner and i.status='active' and i.enabled=true)
       or not exists(select 1 from ai_network.ai_identities i where i.identity_id=v_to_identity_id
      and i.owner_user_id=v_owner and i.status='active' and i.enabled=true
      and i.supervision_level<>'restricted_observation') then
      raise exception using errcode='42501',message='Delegator and recipient must be active, enabled and eligible for supervised work.';
    end if;
    if v_org_id is not null and not exists(
      select 1 from ai_network.ai_employment_records manager
      join ai_network.ai_employment_records report on report.manager_employment_id=manager.employment_id
        and report.organization_id=manager.organization_id
      where manager.organization_id=v_org_id and manager.identity_id=v_from_identity_id
        and report.identity_id=v_to_identity_id
        and manager.employment_status='active' and report.employment_status='active'
    ) then
      raise exception using errcode='42501',message='Organizational delegation is limited to the delegator’s current active direct reports.';
    end if;
    if jsonb_typeof(coalesce(v_payload->'task_payload','{}'::jsonb))<>'object'
       or octet_length(coalesce(v_payload->'task_payload','{}'::jsonb)::text)>65536 then
      raise exception using errcode='22023',message='Delegated task payload must be a JSON object no larger than 64 KB.';
    end if;
    v_task_result:=public.minglora_ai_task_command('create_task',v_owner,jsonb_build_object(
      'identity_id',v_to_identity_id,
      'organization_id',v_org_id,
      'task_title',v_task_title,
      'task_type',v_task_type,
      'action_class',v_action_class,
      'task_payload',coalesce(v_payload->'task_payload','{}'::jsonb),
      'priority',coalesce(nullif(v_payload->>'priority','')::integer,100),
      'scheduled_for',coalesce(v_payload->>'scheduled_for',now()::text),
      'max_attempts',coalesce(nullif(v_payload->>'max_attempts','')::integer,3),
      'token_budget',v_token_budget,
      'cost_limit_usd',v_cost_limit,
      'idempotency_key',v_key
    ));
    v_task_id:=nullif(v_task_result->'task'->>'task_id','')::uuid;
    if v_task_id is null then raise exception using errcode='P0001',message='Delegated task could not be added to the durable queue.'; end if;
    select q.* into v_task_row from ai_network.ai_task_queue q
      where q.task_id=v_task_id and q.owner_user_id=v_owner for update;
    if v_task_row.task_id is null then raise exception using errcode='P0001',message='Delegated task queue record could not be verified.'; end if;
    if coalesce(v_task_result->>'reused','false')='true' then
      if v_task_row.delegation_grant_id is distinct from v_grant_id
        or v_task_row.delegated_from_identity_id is distinct from v_from_identity_id then
        raise exception using errcode='23505',message='Task idempotency key was already used outside this delegation grant.';
      end if;
      return jsonb_build_object('task',to_jsonb(v_task_row),'reused',true,'requires_human_approval',true);
    end if;
    update ai_network.ai_task_queue q set
      delegation_grant_id=v_grant_id,
      delegated_from_identity_id=v_from_identity_id,
      requires_approval=true,
      status='pending_approval',
      approved_by_user_id=null,
      approved_at=null,
      updated_at=now()
    where q.task_id=v_task_id and q.owner_user_id=v_owner;
    insert into ai_network.ai_task_approvals(owner_user_id,task_id,approval_status)
      values(v_owner,v_task_id,'requested')
      on conflict(task_id) do nothing;
    insert into ai_network.ai_task_events(
      owner_user_id,task_id,actor_type,actor_user_id,event_type,previous_status,new_status,reason,metadata
    ) values(
      v_owner,v_task_id,'human_user',v_owner,'ai_delegation_requested',v_task_row.status,'pending_approval',
      'AI team member delegated a scoped task; Minglora owner approval is mandatory.',
      jsonb_build_object('delegation_grant_id',v_grant_id,'delegated_from_identity_id',v_from_identity_id,
        'delegated_to_identity_id',v_to_identity_id,'team_id',v_team_id)
    );
    insert into ai_network.ai_delegation_events(
      owner_user_id,delegation_grant_id,actor_user_id,actor_identity_id,event_type,reason,task_id,metadata
    ) values(
      v_owner,v_grant_id,v_owner,v_from_identity_id,'task_delegated',
      'A scoped task was submitted to the human approval queue.',v_task_id,
      jsonb_build_object('task_type',v_task_type,'action_class',v_action_class)
    );
    select q.* into v_task_row from ai_network.ai_task_queue q
      where q.task_id=v_task_id and q.owner_user_id=v_owner;
    return jsonb_build_object('task',to_jsonb(v_task_row),'reused',false,'requires_human_approval',true);
  end if;

  raise exception using errcode='22023',message='Unsupported AI team command.';
end;
$function$;

revoke all on function public.minglora_ai_team_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_team_command(text,uuid,jsonb) to service_role;
