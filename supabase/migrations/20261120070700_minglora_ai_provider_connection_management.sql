-- Minglora AI Network Phase 4.3: provider connection management and persisted health history.
-- Secrets remain outside the database. Health records contain only sanitized status metadata.

create table if not exists ai_network.ai_provider_health_events (
  event_id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references ai_network.ai_provider_accounts(provider_account_id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  provider_name text not null,
  health_status text not null check (health_status in (
    'unknown','healthy','degraded','unhealthy','unauthorized','forbidden',
    'model_unavailable','rate_limited','provider_unavailable','network_error',
    'timeout','invalid_response','provider_error'
  )),
  model_identifier text,
  response_time_ms integer check (response_time_ms is null or response_time_ms between 0 and 120000),
  error_code text not null default '',
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  checked_at timestamptz not null default now()
);
create index if not exists ai_provider_health_events_account_time_idx
  on ai_network.ai_provider_health_events(provider_account_id, checked_at desc);
create index if not exists ai_provider_health_events_provider_time_idx
  on ai_network.ai_provider_health_events(provider_name, checked_at desc);
alter table ai_network.ai_provider_health_events enable row level security;
grant select, insert on ai_network.ai_provider_health_events to service_role;

alter table ai_network.ai_provider_accounts
  drop constraint if exists ai_provider_accounts_status_check;
alter table ai_network.ai_provider_accounts
  add constraint ai_provider_accounts_status_check
  check (status in ('unconfigured','configured','restricted','enabled','disabled','revoked'));
create index if not exists ai_provider_accounts_owner_provider_idx
  on ai_network.ai_provider_accounts(owner_user_id, provider_name);

alter table ai_network.ai_provider_assignment_history
  drop constraint if exists ai_provider_assignment_history_new_status_check;
alter table ai_network.ai_provider_assignment_history
  add constraint ai_provider_assignment_history_new_status_check
  check (new_status in ('pending','active','restricted','disabled','revoked'));

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
  v_health_status text;
  v_account_health_status text;
  v_last_checked_at timestamptz;
  v_account_provider_name text;
  v_response_time_ms integer;
  v_error_code text;
  v_checked_at timestamptz;
  v_metadata jsonb;
  v_event_id uuid;
  v_inference_verified_at timestamptz;
  v_inference_verified boolean;
  v_provider_account_status text;
  v_identity_status text;
  v_identity_enabled boolean;
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
        'status',i.status,
        'enabled',i.enabled
      ),
      'model',jsonb_build_object(
        'model_id',m.model_id,
        'provider_name',m.provider_name,
        'model_name',m.model_name,
        'model_identifier',m.model_identifier,
        'model_version',m.model_version,
        'text_capability',m.text_capability,
        'is_active',m.is_active
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


  if v_action = 'list_provider_health' then
    if nullif(v_payload->>'provider_account_id','') is not null
       and coalesce(v_payload->>'provider_account_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid provider account ID is required.';
    end if;
    v_provider_account_id := nullif(v_payload->>'provider_account_id','')::uuid;
    select coalesce(jsonb_agg(jsonb_build_object(
      'event_id',h.event_id,'provider_account_id',h.provider_account_id,
      'provider_name',h.provider_name,'health_status',h.health_status,
      'model_identifier',h.model_identifier,'response_time_ms',h.response_time_ms,
      'error_code',h.error_code,'reason',h.reason,'metadata',h.metadata,'checked_at',h.checked_at
    ) order by h.checked_at desc),'[]'::jsonb)
      into v_result
    from (
      select h.*
      from ai_network.ai_provider_health_events h
      join ai_network.ai_provider_accounts a on a.provider_account_id=h.provider_account_id
      where a.owner_user_id=p_actor_user_id
        and (v_provider_account_id is null or h.provider_account_id=v_provider_account_id)
      order by h.checked_at desc
      limit 50
    ) h;
    return v_result;
  end if;

  if v_action = 'reserve_provider_inference' then
    if coalesce(v_payload->>'provider_account_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid provider account ID is required.';
    end if;
    v_provider_account_id := (v_payload->>'provider_account_id')::uuid;
    v_provider_name := lower(trim(coalesce(v_payload->>'provider_name','')));
    v_model_identifier := left(trim(coalesce(v_payload->>'model_identifier','')),200);
    if length(v_model_identifier)<1 then
      raise exception using errcode = '22023', message = 'A selected provider model is required.';
    end if;

    select a.provider_name,a.account_type,a.status
      into v_account_provider_name,v_account_type,v_old_status
    from ai_network.ai_provider_accounts a
    where a.provider_account_id=v_provider_account_id and a.owner_user_id=p_actor_user_id
    for update;
    if v_account_provider_name is null then
      raise exception using errcode = 'P0002', message = 'Provider account not found for this owner.';
    end if;
    if v_account_type<>'managed' then
      raise exception using errcode = '42501', message = 'Inference verification requires a managed provider account with platform credentials.';
    end if;
    if v_old_status='revoked' then
      raise exception using errcode = '22023', message = 'A revoked provider account cannot be inference-tested or reactivated.';
    end if;
    if v_provider_name<>v_account_provider_name then
      raise exception using errcode = '22023', message = 'Provider name does not match the selected provider account.';
    end if;
    if coalesce(v_payload->>'model_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid discovered provider model ID is required.';
    end if;
    v_model_id := (v_payload->>'model_id')::uuid;
    select m.model_identifier,m.is_active
      into v_model_name,v_model_active
    from ai_network.ai_provider_models m
    where m.model_id=v_model_id and m.provider_name=v_provider_name;
    if v_model_name is null or v_model_name<>v_model_identifier or not coalesce(v_model_active,false) then
      raise exception using errcode = '22023', message = 'The selected model is not active in this provider account catalogue.';
    end if;

    select h.checked_at into v_last_checked_at
    from ai_network.ai_provider_health_events h
    where h.provider_account_id=v_provider_account_id
      and h.metadata->>'inference_verification_attempt'='true'
    order by h.checked_at desc
    limit 1;
    if v_last_checked_at is not null and v_last_checked_at>now()-interval '30 seconds' then
      raise exception using errcode = '22023', message = 'An inference verification was just attempted for this account. Retry after the 30-second safety interval.';
    end if;

    v_checked_at := now();
    v_health_status := 'unknown';
    v_metadata := jsonb_build_object(
      'inference_verification_attempt',true,
      'inference_verified',false,
      'in_progress',true,
      'verification_type','fixed_prompt',
      'model_id',v_model_id::text
    );
    insert into ai_network.ai_provider_health_events(
      provider_account_id,actor_user_id,provider_name,health_status,model_identifier,
      response_time_ms,error_code,reason,metadata,checked_at
    ) values (
      v_provider_account_id,p_actor_user_id,v_account_provider_name,v_health_status,
      v_model_identifier,0,'',
      'Bounded inference verification started. Generated output is not retained.',
      v_metadata,v_checked_at
    ) returning event_id into v_event_id;

    update ai_network.ai_provider_accounts a
    set health_status='unknown',
        last_checked_at=v_checked_at,
        status=case when v_old_status='enabled' then 'disabled' else a.status end,
        updated_at=now()
    where a.provider_account_id=v_provider_account_id and a.owner_user_id=p_actor_user_id;
    update ai_network.ai_provider_assignments a
    set provider_health_status='unknown',
        last_checked_at=v_checked_at,
        assignment_status=case
          when v_old_status='enabled' and a.assignment_status<>'revoked' then 'disabled'
          else a.assignment_status
        end,
        updated_at=now()
    where a.provider_account_id=v_provider_account_id;

    select jsonb_build_object(
      'event_id',h.event_id,'provider_account_id',h.provider_account_id,
      'provider_name',h.provider_name,'health_status',h.health_status,
      'model_identifier',h.model_identifier,'model_id',h.metadata->>'model_id',
      'checked_at',h.checked_at,'metadata',h.metadata
    ) into v_result
    from ai_network.ai_provider_health_events h where h.event_id=v_event_id;
    return jsonb_build_object('reservation',v_result);
  end if;

  if v_action = 'record_provider_health' then
    if coalesce(v_payload->>'provider_account_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid provider account ID is required.';
    end if;
    v_provider_account_id := (v_payload->>'provider_account_id')::uuid;
    v_health_status := lower(trim(coalesce(v_payload->>'health_status','unknown')));
    if v_health_status not in (
      'unknown','healthy','degraded','unhealthy','unauthorized','forbidden',
      'model_unavailable','rate_limited','provider_unavailable','network_error',
      'timeout','invalid_response','provider_error'
    ) then
      raise exception using errcode = '22023', message = 'Unsupported provider health status.';
    end if;
    v_model_identifier := left(trim(coalesce(v_payload->>'model_identifier','')),200);
    v_response_time_ms := nullif(v_payload->>'response_time_ms','')::integer;
    v_error_code := left(trim(coalesce(v_payload->>'error_code','')),120);
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    v_checked_at := coalesce(nullif(v_payload->>'checked_at','')::timestamptz,now());
    v_metadata := coalesce(v_payload->'metadata','{}'::jsonb);
    if jsonb_typeof(v_metadata)<>'object' then
      raise exception using errcode = '22023', message = 'Provider health metadata must be a JSON object.';
    end if;
    if v_response_time_ms is not null and (v_response_time_ms<0 or v_response_time_ms>120000) then
      raise exception using errcode = '22023', message = 'Provider response time must be between 0 and 120000 milliseconds.';
    end if;

    select a.provider_name,a.account_type,a.status
      into v_account_provider_name,v_account_type,v_old_status
    from ai_network.ai_provider_accounts a
    where a.provider_account_id=v_provider_account_id and a.owner_user_id=p_actor_user_id
    for update;
    if v_account_provider_name is null then
      raise exception using errcode = 'P0002', message = 'Provider account not found for this owner.';
    end if;
    if v_old_status='revoked' then
      raise exception using errcode = '22023', message = 'A revoked provider account cannot be probed or reactivated.';
    end if;
    if v_account_type<>'managed' then
      raise exception using errcode = '42501', message = 'Only managed provider accounts can be linked to platform environment credentials.';
    end if;

    v_provider_name := lower(trim(coalesce(v_payload->>'provider_name','')));
    if v_provider_name<>'' and v_provider_name<>v_account_provider_name then
      raise exception using errcode = '22023', message = 'Provider name does not match the selected provider account.';
    end if;
    v_provider_name := v_account_provider_name;

    if v_metadata->>'inference_verification_attempt'='true' then
      if coalesce(v_metadata->>'model_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode = '22023', message = 'Inference verification events must identify the exact catalogue model.';
      end if;
      v_model_id := (v_metadata->>'model_id')::uuid;
      select m.model_name into v_model_name
      from ai_network.ai_provider_models m
      where m.model_id=v_model_id
        and m.provider_name=v_provider_name
        and m.model_identifier=v_model_identifier
        and m.is_active=true;
      if v_model_name is null then
        raise exception using errcode = '22023', message = 'Inference verification model does not match an active catalogue model for this provider.';
      end if;
    end if;

    insert into ai_network.ai_provider_health_events(
      provider_account_id,actor_user_id,provider_name,health_status,model_identifier,
      response_time_ms,error_code,reason,metadata,checked_at
    ) values (
      v_provider_account_id,p_actor_user_id,v_provider_name,v_health_status,nullif(v_model_identifier,''),
      v_response_time_ms,v_error_code,v_reason,v_metadata,v_checked_at
    ) returning event_id into v_event_id;

    v_account_health_status := case
      when v_health_status='healthy' then 'healthy'
      when v_health_status='degraded' then 'degraded'
      when v_health_status='unknown' then 'unknown'
      else 'unavailable'
    end;

    if v_metadata->>'inference_verification_attempt'='true'
       and v_metadata->>'inference_verified'='true' then
      update ai_network.ai_provider_models m
      set text_capability=true,
          model_capabilities=case
            when 'text'=any(m.model_capabilities) then m.model_capabilities
            else array_append(m.model_capabilities,'text')
          end,
          updated_at=now()
      where m.model_id=v_model_id;
    end if;

    update ai_network.ai_provider_accounts a
    set health_status=v_account_health_status,
        last_checked_at=v_checked_at,
        status=case
          when v_metadata->>'inference_verification_attempt'='true'
           and v_metadata->>'inference_verified'='false'
           and v_metadata->>'in_progress' is distinct from 'true'
          then 'disabled'
          else a.status
        end,
        updated_at=now()
    where a.provider_account_id=v_provider_account_id and a.owner_user_id=p_actor_user_id;

    update ai_network.ai_provider_assignments a
    set provider_health_status=v_account_health_status,
        last_checked_at=v_checked_at,
        assignment_status=case
          when v_metadata->>'inference_verification_attempt'='true'
           and v_metadata->>'inference_verified'='false'
           and v_metadata->>'in_progress' is distinct from 'true'
           and a.assignment_status<>'revoked'
          then 'disabled'
          else a.assignment_status
        end,
        updated_at=now()
    where a.provider_account_id=v_provider_account_id;

    select jsonb_build_object(
      'event_id',h.event_id,'provider_account_id',h.provider_account_id,
      'provider_name',h.provider_name,'health_status',h.health_status,
      'model_identifier',h.model_identifier,'response_time_ms',h.response_time_ms,
      'error_code',h.error_code,'reason',h.reason,'metadata',h.metadata,'checked_at',h.checked_at
    ) into v_result
    from ai_network.ai_provider_health_events h where h.event_id=v_event_id;
    return jsonb_build_object('health_event',v_result);
  end if;

  if v_action = 'set_provider_account_status' then
    if coalesce(v_payload->>'provider_account_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid provider account ID is required.';
    end if;
    v_provider_account_id := (v_payload->>'provider_account_id')::uuid;
    v_new_status := lower(trim(coalesce(v_payload->>'status','')));
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    if v_new_status not in ('enabled','disabled','revoked') then
      raise exception using errcode = '22023', message = 'Choose enabled, disabled or revoked for the provider account.';
    end if;
    if length(v_reason)<3 then
      raise exception using errcode = '22023', message = 'A reason of at least three characters is required.';
    end if;
    select a.status,a.health_status,a.last_checked_at,a.account_type
      into v_old_status,v_account_health_status,v_last_checked_at,v_account_type
    from ai_network.ai_provider_accounts a
    where a.provider_account_id=v_provider_account_id and a.owner_user_id=p_actor_user_id
    for update;
    if v_old_status is null then
      raise exception using errcode = 'P0002', message = 'Provider account not found for this owner.';
    end if;
    if v_old_status='revoked' and v_new_status<>'revoked' then
      raise exception using errcode = '22023', message = 'A revoked provider account cannot be reactivated.';
    end if;
    if v_new_status='enabled' then
      if v_account_type<>'managed' then
        raise exception using errcode = '42501', message = 'Only managed provider accounts can be enabled using platform environment credentials.';
      end if;
      if v_account_health_status<>'healthy' or v_last_checked_at is null
         or v_last_checked_at<now()-interval '15 minutes' then
        raise exception using errcode = '22023', message = 'A successful provider health check must complete within the last 15 minutes before enabling the account.';
      end if;
      select h.checked_at,h.health_status,(h.metadata->>'inference_verified')='true'
        into v_inference_verified_at,v_health_status,v_inference_verified
      from ai_network.ai_provider_health_events h
      where h.provider_account_id=v_provider_account_id
        and h.metadata->>'inference_verification_attempt'='true'
      order by h.checked_at desc
      limit 1;
      if v_inference_verified_at is null
         or v_inference_verified_at<now()-interval '15 minutes'
         or v_health_status<>'healthy'
         or v_inference_verified is distinct from true then
        raise exception using errcode = '22023', message = 'A successful inference verification must complete within the last 15 minutes before enabling the account.';
      end if;
    end if;
    update ai_network.ai_provider_accounts a
    set status=v_new_status,updated_at=now()
    where a.provider_account_id=v_provider_account_id and a.owner_user_id=p_actor_user_id;
    if v_new_status in ('disabled','revoked') then
      update ai_network.ai_provider_assignments a
      set assignment_status=case when a.assignment_status='revoked' then 'revoked' else 'disabled' end,
          updated_at=now()
      where a.provider_account_id=v_provider_account_id;
    end if;
    select jsonb_build_object(
      'provider_account_id',a.provider_account_id,'provider_name',a.provider_name,
      'provider_identifier',a.provider_identifier,'account_type',a.account_type,
      'status',a.status,'health_status',a.health_status,'last_checked_at',a.last_checked_at
    ) into v_result
    from ai_network.ai_provider_accounts a
    where a.provider_account_id=v_provider_account_id and a.owner_user_id=p_actor_user_id;
    return jsonb_build_object('provider_account',v_result);
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
    ) on conflict do nothing
    returning assignment_id into v_assignment_id;
    if v_assignment_id is null then
      v_reused := true;
      select a.assignment_id into v_assignment_id
      from ai_network.ai_provider_assignments a
      where a.identity_id=v_identity_id and a.model_id=v_model_id
        and a.provider_account_id is not distinct from v_provider_account_id;
    end if;
    if not v_reused then
      insert into ai_network.ai_provider_assignment_history(
      assignment_id,identity_id,actor_user_id,action,previous_status,new_status,reason,metadata
      ) values (
        v_assignment_id,v_identity_id,p_actor_user_id,'assigned',null,'pending',
        'Provider/model metadata assignment created; connection health is unverified.',
        jsonb_build_object('model_id',v_model_id,'provider_account_id',v_provider_account_id,'fallback_model_id',v_fallback_model_id)
      );
    end if;
    select jsonb_build_object(
      'assignment_id',a.assignment_id,'identity_id',a.identity_id,'model_id',a.model_id,
      'provider_account_id',a.provider_account_id,'fallback_model_id',a.fallback_model_id,
      'routing_priority',a.routing_priority,'assigned_capabilities',a.assigned_capabilities,
      'supported_languages',a.supported_languages,'assignment_status',a.assignment_status,
      'provider_health_status',a.provider_health_status
    ) into v_result from ai_network.ai_provider_assignments a where a.assignment_id=v_assignment_id;
    return jsonb_build_object('assignment',v_result,'reused',v_reused);
  end if;

  if v_action = 'set_provider_assignment_status' then
    if coalesce(v_payload->>'assignment_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid provider assignment ID is required.';
    end if;
    v_assignment_id := (v_payload->>'assignment_id')::uuid;
    v_new_status := lower(coalesce(v_payload->>'status',''));
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    if v_new_status not in ('pending','active','restricted','disabled','revoked') then
      raise exception using errcode = '22023', message = 'Choose pending, active, restricted, disabled or revoked for the provider assignment.';
    end if;
    if length(v_reason)<3 then
      raise exception using errcode = '22023', message = 'A reason of at least three characters is required.';
    end if;
    select a.assignment_status,a.identity_id,a.model_id,a.provider_account_id,i.status,i.enabled
      into v_old_status,v_identity_id,v_model_id,v_provider_account_id,v_identity_status,v_identity_enabled
    from ai_network.ai_provider_assignments a
    join ai_network.ai_identities i on i.identity_id=a.identity_id
    where a.assignment_id=v_assignment_id and i.owner_user_id=p_actor_user_id
    for update of a,i;
    if v_old_status is null then
      raise exception using errcode = 'P0002', message = 'Provider assignment not found for this owner.';
    end if;
    if v_old_status='revoked' and v_new_status<>'revoked' then
      raise exception using errcode = '22023', message = 'A revoked provider assignment cannot be reactivated.';
    end if;

    if v_new_status='active' then
      if v_identity_status<>'active' or v_identity_enabled is distinct from true then
        raise exception using errcode = '22023', message = 'Only an active and enabled AI identity can receive an active provider assignment.';
      end if;
      if v_provider_account_id is null then
        raise exception using errcode = '22023', message = 'An active provider assignment requires a managed provider account.';
      end if;

      select m.provider_name,(m.is_active and m.text_capability)
        into v_provider_name,v_model_active
      from ai_network.ai_provider_models m where m.model_id=v_model_id;
      if v_provider_name is null or v_model_active is distinct from true then
        raise exception using errcode = '22023', message = 'The assigned model must be active and have successful text-inference verification.';
      end if;

      select a.provider_name,a.status,a.health_status,a.last_checked_at,a.account_type
        into v_account_provider_name,v_provider_account_status,v_account_health_status,v_last_checked_at,v_account_type
      from ai_network.ai_provider_accounts a
      where a.provider_account_id=v_provider_account_id and a.owner_user_id=p_actor_user_id
      for update;
      if v_account_provider_name is null or v_account_type<>'managed'
         or v_account_provider_name<>v_provider_name then
        raise exception using errcode = '42501', message = 'The provider account must be managed, owner-scoped and match the assigned model.';
      end if;
      if v_provider_account_status<>'enabled'
         or v_account_health_status<>'healthy'
         or v_last_checked_at is null
         or v_last_checked_at<now()-interval '15 minutes' then
        raise exception using errcode = '22023', message = 'The provider account must be enabled with a healthy check from the last 15 minutes.';
      end if;

      select h.checked_at,h.health_status,(h.metadata->>'inference_verified')='true'
        into v_inference_verified_at,v_health_status,v_inference_verified
      from ai_network.ai_provider_health_events h
      where h.provider_account_id=v_provider_account_id
        and h.metadata->>'inference_verification_attempt'='true'
        and h.metadata->>'model_id'=v_model_id::text
      order by h.checked_at desc
      limit 1;
      if v_inference_verified_at is null
         or v_inference_verified_at<now()-interval '15 minutes'
         or v_health_status<>'healthy'
         or v_inference_verified is distinct from true then
        raise exception using errcode = '22023', message = 'This exact model needs a successful inference verification within the last 15 minutes before assignment activation.';
      end if;
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
  is 'Server-only AI provider catalogue, sanitized health history and provider account status commands. Does not accept credentials.';

revoke all on function public.minglora_ai_provider_command(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_provider_command(text,uuid,jsonb) to service_role;
