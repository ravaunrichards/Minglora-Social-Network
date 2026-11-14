-- Minglora AI Network: public-profile discovery, user following and saved discovery groups.
-- All records stay in the private schema and are accessed only through the authenticated server runtime.

create table if not exists ai_network.ai_identity_follows (
  follow_id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  follower_user_id uuid not null references public.profiles(id) on delete restrict,
  follow_status text not null default 'active'
    check (follow_status in ('requested','active','declined','blocked')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (identity_id,follower_user_id)
);
create index if not exists ai_identity_follows_identity_status_idx
  on ai_network.ai_identity_follows(identity_id,follow_status,requested_at desc);
create index if not exists ai_identity_follows_user_status_idx
  on ai_network.ai_identity_follows(follower_user_id,follow_status,updated_at desc);

create table if not exists ai_network.ai_saved_discovery_groups (
  group_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  group_name text not null check (length(trim(group_name)) between 2 and 80),
  filters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(filters)='object' and octet_length(filters::text)<=16384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id,group_name)
);
create index if not exists ai_saved_discovery_groups_owner_updated_idx
  on ai_network.ai_saved_discovery_groups(owner_user_id,updated_at desc);

alter table ai_network.ai_identity_follows enable row level security;
alter table ai_network.ai_saved_discovery_groups enable row level security;
grant select,insert,update,delete on ai_network.ai_identity_follows to service_role;
grant select,insert,update,delete on ai_network.ai_saved_discovery_groups to service_role;

create or replace function public.minglora_ai_discovery_command(
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
  v_filters jsonb := coalesce(v_payload->'filters','{}'::jsonb);
  v_identity_id uuid;
  v_follow_id uuid;
  v_group_id uuid;
  v_profile_visibility text;
  v_follow_status text;
  v_decision text;
  v_group_name text;
  v_search text;
  v_profession text;
  v_sort text;
  v_limit integer;
  v_offset integer;
  v_recent_days integer;
  v_categories text[];
  v_populations text[];
  v_genders text[];
  v_countries text[];
  v_nationalities text[];
  v_languages text[];
  v_interests text[];
  v_skills text[];
  v_capabilities text[];
  v_regions text[];
  v_rows jsonb;
  v_count integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_item record;
  v_existing ai_network.ai_identity_follows%rowtype;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI discovery commands are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora user is required for AI discovery.';
  end if;
  if jsonb_typeof(v_payload)<>'object' or jsonb_typeof(v_filters)<>'object' then
    raise exception using errcode = '22023', message = 'AI discovery payload and filters must be JSON objects.';
  end if;
  if v_payload::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
    raise exception using errcode = '22023', message = 'Credentials and secrets are not allowed in discovery requests.';
  end if;

  if v_action='discover' then
    if octet_length(v_filters::text)>16384 then
      raise exception using errcode = '22023', message = 'Discovery filters are limited to 16 KB.';
    end if;
    if jsonb_typeof(v_filters->'category_keys') not in ('array','null')
       or jsonb_typeof(v_filters->'populations') not in ('array','null')
       or jsonb_typeof(v_filters->'genders') not in ('array','null')
       or jsonb_typeof(v_filters->'countries') not in ('array','null')
       or jsonb_typeof(v_filters->'nationalities') not in ('array','null')
       or jsonb_typeof(v_filters->'languages') not in ('array','null')
       or jsonb_typeof(v_filters->'interests') not in ('array','null')
       or jsonb_typeof(v_filters->'skills') not in ('array','null')
       or jsonb_typeof(v_filters->'capabilities') not in ('array','null')
       or jsonb_typeof(v_filters->'regions') not in ('array','null') then
      raise exception using errcode = '22023', message = 'Multi-select discovery filters must be JSON arrays.';
    end if;
    v_categories := array(select lower(trim(x)) from jsonb_array_elements_text(coalesce(v_filters->'category_keys','[]'::jsonb)) x limit 50);
    v_populations := array(select lower(trim(x)) from jsonb_array_elements_text(coalesce(v_filters->'populations','[]'::jsonb)) x limit 3);
    v_genders := array(select lower(trim(x)) from jsonb_array_elements_text(coalesce(v_filters->'genders','[]'::jsonb)) x limit 5);
    v_countries := array(select upper(trim(x)) from jsonb_array_elements_text(coalesce(v_filters->'countries','[]'::jsonb)) x limit 260);
    v_nationalities := array(select lower(trim(x)) from jsonb_array_elements_text(coalesce(v_filters->'nationalities','[]'::jsonb)) x limit 100);
    v_languages := array(select lower(trim(x)) from jsonb_array_elements_text(coalesce(v_filters->'languages','[]'::jsonb)) x limit 100);
    v_interests := array(select lower(trim(x)) from jsonb_array_elements_text(coalesce(v_filters->'interests','[]'::jsonb)) x limit 100);
    v_skills := array(select lower(trim(x)) from jsonb_array_elements_text(coalesce(v_filters->'skills','[]'::jsonb)) x limit 100);
    v_capabilities := array(select lower(trim(x)) from jsonb_array_elements_text(coalesce(v_filters->'capabilities','[]'::jsonb)) x limit 50);
    v_regions := array(select lower(trim(x)) from jsonb_array_elements_text(coalesce(v_filters->'regions','[]'::jsonb)) x limit 100);
    if exists(select 1 from unnest(coalesce(v_countries,'{}'::text[])) x where x !~ '^[A-Z]{2}$') then
      raise exception using errcode = '22023', message = 'Countries must use ISO 3166-1 alpha-2 codes.';
    end if;
    if exists(select 1 from unnest(coalesce(v_populations,'{}'::text[])) x where x not in ('independent','organizational','specialized_service')) then
      raise exception using errcode = '22023', message = 'Choose a supported AI population.';
    end if;
    if exists(select 1 from unnest(coalesce(v_genders,'{}'::text[])) x where x not in ('female','male','non_binary','other','prefer_not_to_say')) then
      raise exception using errcode = '22023', message = 'Choose a supported gender value.';
    end if;
    v_search := left(trim(coalesce(v_filters->>'search','')),120);
    v_profession := left(trim(coalesce(v_filters->>'profession','')),100);
    v_sort := lower(coalesce(v_filters->>'sort','newest'));
    if v_sort not in ('newest','popular') then v_sort := 'newest'; end if;
    v_limit := least(greatest(coalesce(nullif(v_payload->>'limit','')::integer,24),1),100);
    v_offset := greatest(coalesce(nullif(v_payload->>'offset','')::integer,0),0);
    v_recent_days := greatest(0,least(coalesce(nullif(v_filters->>'recent_days','')::integer,0),3650));

    with filtered as materialized (
      select
        i.identity_id,
        i.population,
        i.category_key,
        i.subcategory,
        i.created_at,
        n.first_name,
        n.middle_name,
        n.last_name,
        n.full_name,
        n.display_name,
        n.username,
        n.profile_identifier,
        p.bio,
        p.introduction,
        p.gender,
        p.gender_presentation,
        p.nationality,
        p.country_of_origin,
        p.current_country,
        p.state_province,
        p.parish_county,
        p.district,
        p.city,
        p.town,
        p.time_zone,
        p.personality,
        p.interests,
        p.hobbies,
        p.profession,
        p.skills,
        p.avatar_storage_ref,
        p.cover_storage_ref,
        p.profile_visibility,
        (select coalesce(jsonb_agg(jsonb_build_object('language_tag',l.language_tag,'language_name',l.language_name,'dialect',l.dialect,'proficiency',l.proficiency) order by l.is_primary desc,l.language_tag),'[]'::jsonb)
           from ai_network.ai_identity_languages l where l.identity_id=i.identity_id) as languages,
        (select coalesce(array_agg(c.capability_key order by c.capability_key),'{}'::text[])
           from ai_network.ai_identity_capabilities c where c.identity_id=i.identity_id and c.is_enabled=true) as capabilities,
        (select count(*)::integer from ai_network.ai_identity_follows f where f.identity_id=i.identity_id and f.follow_status='active') as follower_count,
        exists(select 1 from ai_network.ai_identity_follows f where f.identity_id=i.identity_id and f.follower_user_id=p_actor_user_id and f.follow_status='active') as is_following,
        exists(select 1 from ai_network.ai_identity_follows f where f.identity_id=i.identity_id and f.follower_user_id=p_actor_user_id and f.follow_status='requested') as follow_requested
      from ai_network.ai_identities i
      join ai_network.ai_names n on n.identity_id=i.identity_id
      join ai_network.ai_profiles p on p.identity_id=i.identity_id
      where i.status='active' and i.enabled=true
        and p.profile_visibility='public'
        and (cardinality(v_categories)=0 or i.category_key=any(v_categories))
        and (cardinality(v_populations)=0 or i.population=any(v_populations))
        and (cardinality(v_genders)=0 or p.gender=any(v_genders))
        and (cardinality(v_countries)=0 or p.current_country=any(v_countries) or p.country_of_origin=any(v_countries)
             or exists(select 1 from ai_network.ai_identity_locations loc where loc.identity_id=i.identity_id and loc.is_public=true and loc.country_code=any(v_countries)))
        and (cardinality(v_nationalities)=0 or lower(p.nationality)=any(v_nationalities))
        and (cardinality(v_languages)=0 or exists(select 1 from ai_network.ai_identity_languages l where l.identity_id=i.identity_id and lower(l.language_tag)=any(v_languages)))
        and (cardinality(v_interests)=0 or exists(select 1 from unnest(coalesce(p.interests,'{}'::text[])||coalesce(p.hobbies,'{}'::text[])) interest where lower(interest)=any(v_interests)))
        and (cardinality(v_skills)=0 or exists(select 1 from unnest(coalesce(p.skills,'{}'::text[])) skill where lower(skill)=any(v_skills)))
        and (v_profession='' or p.profession ilike '%'||v_profession||'%')
        and (cardinality(v_regions)=0 or lower(p.state_province)=any(v_regions) or lower(p.parish_county)=any(v_regions)
             or lower(p.district)=any(v_regions) or lower(p.city)=any(v_regions) or lower(p.town)=any(v_regions))
        and (cardinality(v_capabilities)=0 or exists(select 1 from ai_network.ai_identity_capabilities c where c.identity_id=i.identity_id and c.is_enabled=true and lower(c.capability_key)=any(v_capabilities)))
        and (v_search='' or n.username ilike '%'||v_search||'%' or n.display_name ilike '%'||v_search||'%'
             or n.first_name ilike '%'||v_search||'%' or n.last_name ilike '%'||v_search||'%' or p.profession ilike '%'||v_search||'%')
        and (v_recent_days=0 or i.created_at>=now()-make_interval(days=>v_recent_days))
    )
    select jsonb_build_object(
      'total',(select count(*) from filtered),
      'limit',v_limit,
      'offset',v_offset,
      'sort',v_sort,
      'identities',coalesce((
        select jsonb_agg(jsonb_build_object(
          'identity_id',page.identity_id,
          'population',page.population,
          'category_key',page.category_key,
          'subcategory',page.subcategory,
          'created_at',page.created_at,
          'name',jsonb_build_object('first_name',page.first_name,'middle_name',page.middle_name,'last_name',page.last_name,
            'full_name',page.full_name,'display_name',page.display_name,'username',page.username,'profile_identifier',page.profile_identifier),
          'profile',jsonb_build_object('bio',page.bio,'introduction',page.introduction,'gender',page.gender,
            'gender_presentation',page.gender_presentation,'nationality',page.nationality,'country_of_origin',page.country_of_origin,
            'current_country',page.current_country,'state_province',page.state_province,'parish_county',page.parish_county,
            'district',page.district,'city',page.city,'town',page.town,'time_zone',page.time_zone,'personality',page.personality,
            'interests',page.interests,'hobbies',page.hobbies,'profession',page.profession,'skills',page.skills,
            'avatar_storage_ref',page.avatar_storage_ref,'cover_storage_ref',page.cover_storage_ref),
          'languages',page.languages,
          'capabilities',to_jsonb(page.capabilities),
          'follower_count',page.follower_count,
          'is_following',page.is_following,
          'follow_requested',page.follow_requested
        ) order by case when v_sort='popular' then page.follower_count end desc nulls last,page.created_at desc)
        from (select * from filtered order by case when v_sort='popular' then follower_count end desc nulls last,created_at desc limit v_limit offset v_offset) page
      ),'[]'::jsonb)
    ) into v_rows;
    return coalesce(v_rows,'{}'::jsonb);
  end if;

  if v_action='follow' then
    if coalesce(v_payload->>'identity_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid AI identity ID is required.';
    end if;
    v_identity_id := (v_payload->>'identity_id')::uuid;
    select p.profile_visibility into v_profile_visibility
      from ai_network.ai_identities i join ai_network.ai_profiles p on p.identity_id=i.identity_id
      where i.identity_id=v_identity_id and i.status='active' and i.enabled=true;
    if not found or v_profile_visibility='hidden' then
      raise exception using errcode='P0002',message='AI profile is unavailable.';
    end if;
    if exists(select 1 from ai_network.ai_identities i where i.identity_id=v_identity_id and i.owner_user_id=p_actor_user_id) then
      raise exception using errcode='22023',message='You cannot follow an AI identity you own.';
    end if;
    v_follow_status := case when v_profile_visibility='public' then 'active' else 'requested' end;
    insert into ai_network.ai_identity_follows(identity_id,follower_user_id,follow_status)
    values(v_identity_id,p_actor_user_id,v_follow_status)
    on conflict(identity_id,follower_user_id) do update
      set follow_status=case when ai_identity_follows.follow_status='blocked' then 'blocked' else excluded.follow_status end,
          updated_at=now()
    returning * into v_existing;
    if v_existing.follow_status='blocked' then
      raise exception using errcode='42501',message='This AI follow relationship is blocked.';
    end if;
    return jsonb_build_object('identity_id',v_identity_id,'follow_status',v_existing.follow_status,'requested_at',v_existing.requested_at);
  end if;

  if v_action='unfollow' then
    if coalesce(v_payload->>'identity_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid AI identity ID is required.';
    end if;
    delete from ai_network.ai_identity_follows
      where identity_id=(v_payload->>'identity_id')::uuid and follower_user_id=p_actor_user_id;
    get diagnostics v_count=row_count;
    return jsonb_build_object('unfollowed',v_count>0,'removed',v_count);
  end if;

  if v_action='bulk_follow' then
    if jsonb_typeof(v_payload->'identity_ids')<>'array' or jsonb_array_length(v_payload->'identity_ids')<1
       or jsonb_array_length(v_payload->'identity_ids')>100 then
      raise exception using errcode='22023',message='Bulk follow requires between 1 and 100 AI identity IDs.';
    end if;
    for v_item in select distinct value as identity_text from jsonb_array_elements_text(v_payload->'identity_ids') loop
      if v_item.identity_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode='22023',message='Bulk follow contains an invalid AI identity ID.';
      end if;
      v_identity_id := v_item.identity_text::uuid;
      select p.profile_visibility into v_profile_visibility
        from ai_network.ai_identities i join ai_network.ai_profiles p on p.identity_id=i.identity_id
        where i.identity_id=v_identity_id and i.status='active' and i.enabled=true;
      if found and v_profile_visibility<>'hidden'
         and not exists(select 1 from ai_network.ai_identities i where i.identity_id=v_identity_id and i.owner_user_id=p_actor_user_id) then
        v_follow_status := case when v_profile_visibility='public' then 'active' else 'requested' end;
        insert into ai_network.ai_identity_follows(identity_id,follower_user_id,follow_status)
          values(v_identity_id,p_actor_user_id,v_follow_status)
          on conflict(identity_id,follower_user_id) do nothing;
        if found then v_count:=v_count+1; end if;
      end if;
    end loop;
    return jsonb_build_object('created_or_reused',v_count,'requested',true);
  end if;

  if v_action='list_following' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'identity_id',i.identity_id,'follow_status',f.follow_status,'requested_at',f.requested_at,
      'name',jsonb_build_object('display_name',n.display_name,'username',n.username),
      'category_key',i.category_key
    ) order by f.updated_at desc),'[]'::jsonb)
    into v_rows
    from ai_network.ai_identity_follows f
    join ai_network.ai_identities i on i.identity_id=f.identity_id
    join ai_network.ai_names n on n.identity_id=i.identity_id
    where f.follower_user_id=p_actor_user_id and f.follow_status in ('active','requested');
    return jsonb_build_object('following',coalesce(v_rows,'[]'::jsonb));
  end if;

  if v_action='list_follow_requests' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'follow_id',f.follow_id,'identity_id',i.identity_id,'follower_user_id',f.follower_user_id,
      'follow_status',f.follow_status,'requested_at',f.requested_at,'name',jsonb_build_object('display_name',n.display_name,'username',n.username)
    ) order by f.requested_at desc),'[]'::jsonb)
    into v_rows
    from ai_network.ai_identity_follows f
    join ai_network.ai_identities i on i.identity_id=f.identity_id
    join ai_network.ai_names n on n.identity_id=i.identity_id
    where i.owner_user_id=p_actor_user_id and f.follow_status='requested';
    return jsonb_build_object('requests',coalesce(v_rows,'[]'::jsonb));
  end if;

  if v_action='review_follow_request' then
    if coalesce(v_payload->>'follow_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid AI follow request ID is required.';
    end if;
    v_follow_id := (v_payload->>'follow_id')::uuid;
    v_decision := lower(coalesce(v_payload->>'decision',''));
    if v_decision not in ('approve','decline') then
      raise exception using errcode='22023',message='Choose approve or decline for the follow request.';
    end if;
    update ai_network.ai_identity_follows f
      set follow_status=case when v_decision='approve' then 'active' else 'declined' end,
          reviewed_at=now(),reviewed_by_user_id=p_actor_user_id,updated_at=now()
      from ai_network.ai_identities i
      where f.follow_id=v_follow_id and f.identity_id=i.identity_id
        and i.owner_user_id=p_actor_user_id and f.follow_status='requested'
      returning jsonb_build_object('follow_id',f.follow_id,'follow_status',f.follow_status) into v_rows;
    if not found then raise exception using errcode='42501',message='Follow request is unavailable or is not owned by this AI identity manager.'; end if;
    return v_rows;
  end if;

  if v_action='list_saved_groups' then
    select coalesce(jsonb_agg(to_jsonb(g) order by g.updated_at desc),'[]'::jsonb)
      into v_rows from ai_network.ai_saved_discovery_groups g where g.owner_user_id=p_actor_user_id;
    return jsonb_build_object('groups',coalesce(v_rows,'[]'::jsonb));
  end if;

  if v_action='save_discovery_group' then
    v_group_name := left(trim(coalesce(v_payload->>'group_name','')),80);
    v_filters := coalesce(v_payload->'filters','{}'::jsonb);
    if length(v_group_name)<2 or jsonb_typeof(v_filters)<>'object' or octet_length(v_filters::text)>16384 then
      raise exception using errcode='22023',message='A group name and safe filter object are required.';
    end if;
    insert into ai_network.ai_saved_discovery_groups(owner_user_id,group_name,filters)
      values(p_actor_user_id,v_group_name,v_filters)
      on conflict(owner_user_id,group_name) do update set filters=excluded.filters,updated_at=now()
      returning group_id into v_group_id;
    return jsonb_build_object('group_id',v_group_id,'group_name',v_group_name,'filters',v_filters);
  end if;

  if v_action='delete_saved_group' then
    if coalesce(v_payload->>'group_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid saved discovery group ID is required.';
    end if;
    delete from ai_network.ai_saved_discovery_groups
      where group_id=(v_payload->>'group_id')::uuid and owner_user_id=p_actor_user_id;
    get diagnostics v_count=row_count;
    return jsonb_build_object('deleted',v_count>0);
  end if;

  raise exception using errcode='22023',message='Unsupported AI discovery command.';
end;
$function$;

revoke all on function public.minglora_ai_discovery_command(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_discovery_command(text,uuid,jsonb) to service_role;
comment on function public.minglora_ai_discovery_command(text,uuid,jsonb)
  is 'Private authenticated AI profile discovery, user-to-AI following, follow approvals and saved discovery filters.';
