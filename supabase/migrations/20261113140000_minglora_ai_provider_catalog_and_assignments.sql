-- Minglora AI Network: provider catalogue metadata and safe per-identity model assignments.
-- Source-only until reviewed/deployed. Does not accept, store or return provider credentials.
-- Every new assignment remains pending / health unknown until a real adapter verifies it.

create table if not exists ai_network.ai_provider_assignment_history (
  event_id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references ai_network.ai_provider_assignments(assignment_id) on delete restrict,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('assigned','status_changed')),
  previous_status text,
  new_status text not null check (new_status in ('pending','restricted','disabled','revoked')),
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now()
);
create index if not exists ai_provider_assignment_history_identity_time_idx
  on ai_network.ai_provider_assignment_history(identity_id, occurred_at desc);
create index if not exists ai_provider_assignment_history_assignment_time_idx
  on ai_network.ai_provider_assignment_history(assignment_id, occurred_at desc);

create unique index if not exists ai_provider_assignments_identity_model_account_uq
  on ai_network.ai_provider_assignments(identity_id, model_id, provider_account_id)
  where provider_account_id is not null;
create unique index if not exists ai_provider_assignments_identity_model_no_account_uq
  on ai_network.ai_provider_assignments(identity_id, model_id)
  where provider_account_id is null;

alter table ai_network.ai_provider_assignment_history enable row level security;
grant select, insert on ai_network.ai_provider_assignment_history to service_role;
grant select, insert, update on ai_network.ai_provider_accounts to service_role;
grant select, insert, update on ai_network.ai_provider_models to service_role;
grant select, insert, update on ai_network.ai_provider_assignments to service_role;

create or replace function public.minglora_ai_provider_command(
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
  v_provider_name text;
  v_provider_identifier text;
  v_model_name text;
  v_model_identifier text;
  v_model_version text;
  v_account_type text;
  v_provider_account_id uuid;
  v_model_id uuid;
  v_fallback_model_id uuid;
  v_assignment_id uuid;
  v_identity_id uuid;
  v_old_status text;
  v_new_status text;
  v_reason text;
  v_priority integer;
  v_model_capabilities text[];
  v_supported_languages text[];
  v_assigned_capabilities text[];
  v_assignment_languages text[];
  v_result jsonb;
  v_reused boolean := false;
  v_model_active boolean := false;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI provider commands are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id=p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora administrator is required.';
  end if;
  if jsonb_typeof(v_payload)<>'object' then
    raise exception using errcode = '22023', message = 'AI provider command payload must be an object.';
  end if;
  if v_payload ?| array[
    'api_key','apiKey','access_token','accessToken','password','credential',
    'credentials','secret','provider_secret','credential_secret_ref'
  ] then
    raise exception using errcode = '22023', message = 'Raw credentials and secret references cannot be submitted through this API.';
  end if;

  if v_action = 'list_provider_accounts' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'provider_account_id',a.provider_account_id,
      'provider_name',a.provider_name,
      'provider_identifier',a.provider_identifier,
      'account_type',a.account_type,
      'status',a.status,
      'health_status',a.health_status,
      'assigned_at',a.assigned_at,
      'last_checked_at',a.last_checked_at
    ) order by a.provider_name,a.provider_identifier),'[]'::jsonb)
    into v_result
    from ai_network.ai_provider_accounts a
    where a.owner_user_id=p_actor_user_id;
    return v_result;
  end if;

  if v_action = 'list_provider_models' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'model_id',m.model_id,
      'provider_name',m.provider_name,
      'model_name',m.model_name,
      'model_identifier',m.model_identifier,
      'model_version',m.model_version,
      'model_capabilities',m.model_capabilities,
      'supported_languages',m.supported_languages,
      'text_capability',m.text_capability,
      'image_capability',m.image_capability,
      'audio_capability',m.audio_capability,
      'video_capability',m.video_capability,
      'voice_capability',m.voice_capability,
      'tool_capability',m.tool_capability,
      'is_active',m.is_active
    ) order by m.provider_name,m.model_name,m.model_version),'[]'::jsonb)
    into v_result
    from ai_network.ai_provider_models m
    where m.is_active=true;
    return v_result;
  end if;

  if v_action = 'list_provider_assignments' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'assignment',jsonb_build_object(
        'assignment_id',a.assignment_id,
        'identity_id',a.identity_id,
        'provider_account_id',a.provider_account_id,
        'model_id',a.model_id,
        'fallback_model_id',a.fallback_model_id,
        'routing_priority',a.routing_priority,
        'assigned_capabilities',a.assigned_capabilities,
        'supported_languages',a.supported_languages,
        'assignment_status',a.assignment_status,
        'provider_health_status',a.provider_health_status,
        'assigned_at',a.assigned_at,
        'last_checked_at',a.last_checked_at
      ),
      'identity',jsonb_build_object(
        'identity_id',i.identity_id,
        'display_name',n.display_name,
        'username',n.username,
        'status',i.status
      ),
      'model',jsonb_build_object(
        'model_id',m.model_id,
        'provider_name',m.provider_name,
        'model_name',m.model_name,
        'model_identifier',m.model_identifier,
        'model_version',m.model_version
      ),
      'provider_account',case when pa.provider_account_id is null then null else jsonb_build_object(
        'provider_account_id',pa.provider_account_id,
        'provider_name',pa.provider_name,
        'provider_identifier',pa.provider_identifier,
        'status',pa.status,
        'health_status',pa.health_status
      ) end,
      'fallback_model',case when fm.model_id is null then null else jsonb_build_object(
        'model_id',fm.model_id,'provider_name',fm.provider_name,
        'model_name',fm.model_name,'model_identifier',fm.model_identifier
      ) end
    ) order by i.created_at desc,a.routing_priority,a.assigned_at desc),'[]'::jsonb)
    into v_result
    from ai_network.ai_provider_assignments a
    join ai_network.ai_identities i on i.identity_id=a.identity_id
    join ai_network.ai_names n on n.identity_id=i.identity_id
    join ai_network.ai_provider_models m on m.model_id=a.model_id
    left join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
    left join ai_network.ai_provider_models fm on fm.model_id=a.fallback_model_id
    where i.owner_user_id=p_actor_user_id;
    return v_result;
  end if;

  if v_action = 'create_provider_account' then
    v_provider_name := lower(trim(coalesce(v_payload->>'provider_name','')));
    v_provider_identifier := trim(coalesce(v_payload->>'provider_identifier',''));
    if v_provider_name !~ '^[a-z0-9][a-z0-9._-]{1,79}$' then
      raise exception using errcode = '22023', message = 'Provider name must be a 2–80 character lowercase identifier.';
    end if;
    if length(v_provider_identifier)<1 or length(v_provider_identifier)>160 then
      raise exception using errcode = '22023', message = 'Provider account identifier must contain 1–160 characters.';
    end if;
    v_account_type := lower(coalesce(nullif(v_payload->>'account_type',''),'user'));
    if v_account_type not in ('user','managed') then
      raise exception using errcode = '22023', message = 'Only user-managed or managed account references can be registered here.';
    end if;
    insert into ai_network.ai_provider_accounts(
      owner_user_id,provider_name,provider_identifier,account_type,
      credential_secret_ref,provider_configuration,status,health_status
    ) values (
      p_actor_user_id,v_provider_name,v_provider_identifier,v_account_type,
      null,'{}'::jsonb,'unconfigured','unknown'
    )
    on conflict (owner_user_id,provider_name,provider_identifier) do nothing
    returning provider_account_id into v_provider_account_id;
    if v_provider_account_id is null then
      v_reused := true;
      select a.provider_account_id into v_provider_account_id
      from ai_network.ai_provider_accounts a
      where a.owner_user_id=p_actor_user_id
        and a.provider_name=v_provider_name and a.provider_identifier=v_provider_identifier;
    end if;
    select jsonb_build_object(
      'provider_account_id',a.provider_account_id,'provider_name',a.provider_name,
      'provider_identifier',a.provider_identifier,'account_type',a.account_type,
      'status',a.status,'health_status',a.health_status
    ) into v_result from ai_network.ai_provider_accounts a
    where a.provider_account_id=v_provider_account_id and a.owner_user_id=p_actor_user_id;
    return jsonb_build_object('provider_account',v_result,'reused',v_reused);
  end if;

  if v_action = 'create_provider_model' then
    v_provider_name := lower(trim(coalesce(v_payload->>'provider_name','')));
    v_model_name := left(trim(coalesce(v_payload->>'model_name','')),160);
    v_model_identifier := left(trim(coalesce(v_payload->>'model_identifier','')),180);
    v_model_version := left(trim(coalesce(v_payload->>'model_version','')),80);
    if v_provider_name !~ '^[a-z0-9][a-z0-9._-]{1,79}$' or length(v_model_name)<2 or length(v_model_identifier)<1 then
      raise exception using errcode = '22023', message = 'A valid provider name, model name and model identifier are required.';
    end if;
    if jsonb_typeof(coalesce(v_payload->'model_capabilities','[]'::jsonb))<>'array'
       or jsonb_typeof(coalesce(v_payload->'supported_languages','[]'::jsonb))<>'array' then
      raise exception using errcode = '22023', message = 'Model capabilities and languages must be JSON arrays.';
    end if;
    if jsonb_array_length(coalesce(v_payload->'model_capabilities','[]'::jsonb))>40
       or jsonb_array_length(coalesce(v_payload->'supported_languages','[]'::jsonb))>250 then
      raise exception using errcode = '22023', message = 'Model metadata exceeds the supported capability or language limits.';
    end if;
    select coalesce(array_agg(distinct lower(trim(item.value))),'{}'::text[])
      into v_model_capabilities
    from jsonb_array_elements_text(coalesce(v_payload->'model_capabilities','[]'::jsonb)) as item(value);
    select coalesce(array_agg(distinct lower(trim(item.value))),'{}'::text[])
      into v_supported_languages
    from jsonb_array_elements_text(coalesce(v_payload->'supported_languages','[]'::jsonb)) as item(value);
    insert into ai_network.ai_provider_models(
      provider_name,model_name,model_identifier,model_version,model_capabilities,supported_languages,
      text_capability,image_capability,audio_capability,video_capability,voice_capability,tool_capability,is_active
    ) values (
      v_provider_name,v_model_name,v_model_identifier,v_model_version,v_model_capabilities,v_supported_languages,
      coalesce((v_payload->>'text_capability')::boolean,false),
      coalesce((v_payload->>'image_capability')::boolean,false),
      coalesce((v_payload->>'audio_capability')::boolean,false),
      coalesce((v_payload->>'video_capability')::boolean,false),
      coalesce((v_payload->>'voice_capability')::boolean,false),
      coalesce((v_payload->>'tool_capability')::boolean,false),true
    )
    on conflict (provider_name,model_identifier,model_version) do nothing
    returning model_id into v_model_id;
    if v_model_id is null then
      v_reused := true;
      select m.model_id into v_model_id from ai_network.ai_provider_models m
      where m.provider_name=v_provider_name and m.model_identifier=v_model_identifier and m.model_version=v_model_version;
    end if;
    select jsonb_build_object(
      'model_id',m.model_id,'provider_name',m.provider_name,'model_name',m.model_name,
      'model_identifier',m.model_identifier,'model_version',m.model_version,
      'model_capabilities',m.model_capabilities,'supported_languages',m.supported_languages,
      'text_capability',m.text_capability,'image_capability',m.image_capability,
      'audio_capability',m.audio_capability,'video_capability',m.video_capability,
      'voice_capability',m.voice_capability,'tool_capability',m.tool_capability,'is_active',m.is_active
    ) into v_result from ai_network.ai_provider_models m where m.model_id=v_model_id;
    return jsonb_build_object('model',v_result,'reused',v_reused);
  end if;

  if v_action = 'assign_provider_model' then
    if coalesce(v_payload->>'identity_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_payload->>'model_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'Choose a valid AI identity and provider model.';
    end if;
    v_identity_id := (v_payload->>'identity_id')::uuid;
    v_model_id := (v_payload->>'model_id')::uuid;
    v_provider_account_id := nullif(v_payload->>'provider_account_id','')::uuid;
    v_fallback_model_id := nullif(v_payload->>'fallback_model_id','')::uuid;
    v_priority := coalesce(nullif(v_payload->>'routing_priority','')::integer,100);
    if v_priority<1 or v_priority>10000 then
      raise exception using errcode = '22023', message = 'Routing priority must be between 1 and 10000.';
    end if;
    if not exists (
      select 1 from ai_network.ai_identities i
      where i.identity_id=v_identity_id and i.owner_user_id=p_actor_user_id
        and i.status not in ('suspended','archived','retired')
    ) then raise exception using errcode = '42501', message = 'AI identity is unavailable or not owned by this administrator.'; end if;
    select m.provider_name,m.model_capabilities,m.supported_languages,m.is_active
      into v_provider_name,v_model_capabilities,v_supported_languages,v_model_active
    from ai_network.ai_provider_models m where m.model_id=v_model_id;
    if v_provider_name is null or not coalesce(v_model_active,false) then
      raise exception using errcode = '22023', message = 'Provider model is missing or inactive in the catalogue.';
    end if;
    if v_provider_account_id is not null and not exists (
      select 1 from ai_network.ai_provider_accounts a
      where a.provider_account_id=v_provider_account_id and a.owner_user_id=p_actor_user_id
        and a.provider_name=v_provider_name and a.status not in ('revoked','disabled')
    ) then raise exception using errcode = '42501', message = 'Provider account is not owned by this administrator or does not match the selected model.'; end if;
    if v_fallback_model_id is not null and not exists (
      select 1 from ai_network.ai_provider_models m where m.model_id=v_fallback_model_id and m.is_active=true
    ) then raise exception using errcode = '22023', message = 'Fallback provider model is unavailable.'; end if;
    if v_fallback_model_id=v_model_id then
      raise exception using errcode = '22023', message = 'Fallback model must be different from the primary model.';
    end if;
    if jsonb_typeof(coalesce(v_payload->'assigned_capabilities','[]'::jsonb))<>'array'
       or jsonb_typeof(coalesce(v_payload->'supported_languages','[]'::jsonb))<>'array' then
      raise exception using errcode = '22023', message = 'Assigned capabilities and languages must be JSON arrays.';
    end if;
    if jsonb_array_length(coalesce(v_payload->'assigned_capabilities','[]'::jsonb))>40
       or jsonb_array_length(coalesce(v_payload->'supported_languages','[]'::jsonb))>250 then
      raise exception using errcode = '22023', message = 'Assignment capability or language limits were exceeded.';
    end if;
    select coalesce(array_agg(distinct lower(trim(item.value))),'{}'::text[])
      into v_assigned_capabilities
    from jsonb_array_elements_text(coalesce(v_payload->'assigned_capabilities','[]'::jsonb)) as item(value);
    select coalesce(array_agg(distinct lower(trim(item.value))),'{}'::text[])
      into v_assignment_languages
    from jsonb_array_elements_text(coalesce(v_payload->'supported_languages','[]'::jsonb)) as item(value);
    if exists (select 1 from unnest(v_assigned_capabilities) cap where not (cap=any(v_model_capabilities))) then
      raise exception using errcode = '22023', message = 'Assigned capabilities exceed the selected model catalogue capabilities.';
    end if;
    if cardinality(v_supported_languages)>0 and exists (
      select 1 from unnest(v_assignment_languages) lang where not (lang=any(v_supported_languages))
    ) then raise exception using errcode = '22023', message = 'Assigned languages exceed the selected model catalogue languages.'; end if;
    select a.assignment_id into v_assignment_id
    from ai_network.ai_provider_assignments a
    where a.identity_id=v_identity_id and a.model_id=v_model_id
      and a.provider_account_id is not distinct from v_provider_account_id;
    if v_assignment_id is not null then
      v_reused := true;
      select jsonb_build_object(
        'assignment_id',a.assignment_id,'identity_id',a.identity_id,'model_id',a.model_id,
        'provider_account_id',a.provider_account_id,'fallback_model_id',a.fallback_model_id,
        'routing_priority',a.routing_priority,'assigned_capabilities',a.assigned_capabilities,
        'supported_languages',a.supported_languages,'assignment_status',a.assignment_status,
        'provider_health_status',a.provider_health_status
      ) into v_result from ai_network.ai_provider_assignments a where a.assignment_id=v_assignment_id;
      return jsonb_build_object('assignment',v_result,'reused',true);
    end if;
    insert into ai_network.ai_provider_assignments(
      identity_id,provider_account_id,model_id,fallback_model_id,routing_priority,
      assigned_capabilities,supported_languages,assignment_status,provider_health_status
    ) values (
      v_identity_id,v_provider_account_id,v_model_id,v_fallback_model_id,v_priority,
      v_assigned_capabilities,v_assignment_languages,'pending','unknown'
    ) returning assignment_id into v_assignment_id;
    insert into ai_network.ai_provider_assignment_history(
      assignment_id,identity_id,actor_user_id,action,previous_status,new_status,reason,metadata
    ) values (
      v_assignment_id,v_identity_id,p_actor_user_id,'assigned',null,'pending',
      'Provider/model metadata assignment created; connection health is unverified.',
      jsonb_build_object('model_id',v_model_id,'provider_account_id',v_provider_account_id,'fallback_model_id',v_fallback_model_id)
    );
    select jsonb_build_object(
      'assignment_id',a.assignment_id,'identity_id',a.identity_id,'model_id',a.model_id,
      'provider_account_id',a.provider_account_id,'fallback_model_id',a.fallback_model_id,
      'routing_priority',a.routing_priority,'assigned_capabilities',a.assigned_capabilities,
      'supported_languages',a.supported_languages,'assignment_status',a.assignment_status,
      'provider_health_status',a.provider_health_status
    ) into v_result from ai_network.ai_provider_assignments a where a.assignment_id=v_assignment_id;
    return jsonb_build_object('assignment',v_result,'reused',false);
  end if;

  if v_action = 'set_provider_assignment_status' then
    if coalesce(v_payload->>'assignment_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid provider assignment ID is required.';
    end if;
    v_assignment_id := (v_payload->>'assignment_id')::uuid;
    v_new_status := lower(coalesce(v_payload->>'status',''));
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    if v_new_status not in ('pending','restricted','disabled','revoked') then
      raise exception using errcode = '22023', message = 'Provider assignments cannot be activated until provider health is independently verified.';
    end if;
    if length(v_reason)<3 then
      raise exception using errcode = '22023', message = 'A reason of at least three characters is required.';
    end if;
    select a.assignment_status,a.identity_id into v_old_status,v_identity_id
    from ai_network.ai_provider_assignments a
    join ai_network.ai_identities i on i.identity_id=a.identity_id
    where a.assignment_id=v_assignment_id and i.owner_user_id=p_actor_user_id
    for update of a;
    if v_old_status is null then raise exception using errcode = 'P0002', message = 'Provider assignment not found for this owner.'; end if;
    if v_old_status='revoked' and v_new_status<>'revoked' then
      raise exception using errcode = '22023', message = 'A revoked provider assignment cannot be reactivated.';
    end if;
    if v_old_status<>v_new_status then
      update ai_network.ai_provider_assignments a
      set assignment_status=v_new_status,updated_at=now()
      where a.assignment_id=v_assignment_id;
      insert into ai_network.ai_provider_assignment_history(
        assignment_id,identity_id,actor_user_id,action,previous_status,new_status,reason
      ) values (
        v_assignment_id,v_identity_id,p_actor_user_id,'status_changed',v_old_status,v_new_status,v_reason
      );
    end if;
    select jsonb_build_object(
      'assignment_id',a.assignment_id,'identity_id',a.identity_id,'model_id',a.model_id,
      'provider_account_id',a.provider_account_id,'fallback_model_id',a.fallback_model_id,
      'routing_priority',a.routing_priority,'assigned_capabilities',a.assigned_capabilities,
      'supported_languages',a.supported_languages,'assignment_status',a.assignment_status,
      'provider_health_status',a.provider_health_status
    ) into v_result from ai_network.ai_provider_assignments a where a.assignment_id=v_assignment_id;
    return jsonb_build_object('assignment',v_result);
  end if;

  raise exception using errcode = '22023', message = 'Unsupported AI provider command.';
end;
$function$;

comment on function public.minglora_ai_provider_command(text,uuid,jsonb)
  is 'Server-only AI provider catalogue and pending assignment commands. Does not accept credentials or assert provider health.';

revoke all on function public.minglora_ai_provider_command(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_provider_command(text,uuid,jsonb) to service_role;
