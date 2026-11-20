-- Minglora AI Network: provider connection state and auditable health history.
-- Raw provider credentials remain in private server environment / approved secrets manager only.
-- Enabling a provider account requires a recent successful model-list probe.

create table if not exists ai_network.ai_provider_health_events (
  health_event_id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references ai_network.ai_provider_accounts(provider_account_id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  provider_identifier text not null check (provider_identifier ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  probe_status text not null check (probe_status in (
    'healthy','missing_credentials','missing_model','invalid_model','invalid_endpoint',
    'unauthorized','forbidden','model_unavailable','rate_limited','timeout',
    'network_error','provider_unavailable','provider_error','invalid_response',
    'adapter_unavailable','no_models'
  )),
  connected boolean not null default false,
  health_status text not null check (health_status in ('unknown','healthy','degraded','unavailable')),
  model_identifier text check (model_identifier is null or length(model_identifier) <= 200),
  model_count integer check (model_count is null or model_count between 0 and 2000),
  http_status integer check (http_status is null or http_status between 100 and 599),
  note text not null default '' check (length(note) <= 500),
  checked_at timestamptz not null default now(),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  check (not connected or health_status = 'healthy')
);

create index if not exists ai_provider_health_events_account_time_idx
  on ai_network.ai_provider_health_events(provider_account_id, checked_at desc);
create index if not exists ai_provider_health_events_owner_time_idx
  on ai_network.ai_provider_health_events(owner_user_id, checked_at desc);

create table if not exists ai_network.ai_provider_account_status_history (
  event_id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references ai_network.ai_provider_accounts(provider_account_id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  previous_status text not null check (previous_status in ('unconfigured','configured','restricted','revoked','disabled')),
  new_status text not null check (new_status in ('unconfigured','configured','restricted','revoked','disabled')),
  reason text not null check (length(reason) between 3 and 1000),
  occurred_at timestamptz not null default now()
);

create index if not exists ai_provider_account_status_history_account_time_idx
  on ai_network.ai_provider_account_status_history(provider_account_id, occurred_at desc);

alter table ai_network.ai_provider_health_events enable row level security;
alter table ai_network.ai_provider_account_status_history enable row level security;
revoke all on ai_network.ai_provider_health_events from public, anon, authenticated;
revoke all on ai_network.ai_provider_account_status_history from public, anon, authenticated;
grant select, insert on ai_network.ai_provider_health_events to service_role;
grant select, insert on ai_network.ai_provider_account_status_history to service_role;

create or replace function public.minglora_ai_provider_management_command(
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
  v_account_id uuid;
  v_provider_identifier text;
  v_provider_name text;
  v_old_status text;
  v_new_status text;
  v_health_status text;
  v_probe_status text;
  v_connected boolean := false;
  v_model_identifier text;
  v_model_count integer;
  v_http_status integer;
  v_note text;
  v_reason text;
  v_event_id uuid;
  v_last_checked_at timestamptz;
  v_synced_count integer := 0;
  v_item jsonb;
  v_model_id text;
  v_model_name text;
  v_model_version text;
  v_result jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI provider management is restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id=p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora administrator is required.';
  end if;
  if jsonb_typeof(v_payload)<>'object' or octet_length(v_payload::text)>400000 then
    raise exception using errcode = '22023', message = 'AI provider management payload must be a JSON object no larger than 400 KB.';
  end if;
  if v_payload ?| array[
    'api_key','apiKey','access_token','accessToken','password','credential',
    'credentials','secret','provider_secret','credential_secret_ref'
  ] then
    raise exception using errcode = '22023', message = 'Raw credentials and secret references cannot be submitted through this API.';
  end if;

  if v_action = 'list_provider_health_events' then
    if nullif(v_payload->>'provider_account_id','') is not null
       and coalesce(v_payload->>'provider_account_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid provider account ID is required.';
    end if;
    v_account_id := nullif(v_payload->>'provider_account_id','')::uuid;
    select coalesce(jsonb_agg(to_jsonb(e) order by e.checked_at desc),'[]'::jsonb)
      into v_result
    from (
      select h.health_event_id,h.provider_account_id,h.provider_identifier,h.probe_status,
        h.connected,h.health_status,h.model_identifier,h.model_count,h.http_status,h.note,
        h.checked_at,a.provider_name,a.status as account_status
      from ai_network.ai_provider_health_events h
      join ai_network.ai_provider_accounts a on a.provider_account_id=h.provider_account_id
      where h.owner_user_id=p_actor_user_id
        and (v_account_id is null or h.provider_account_id=v_account_id)
      order by h.checked_at desc
      limit 100
    ) e;
    return v_result;
  end if;

  if v_action = 'record_provider_health' then
    if coalesce(v_payload->>'provider_account_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid provider account ID is required for a health check.';
    end if;
    v_account_id := (v_payload->>'provider_account_id')::uuid;
    v_probe_status := lower(coalesce(v_payload->>'probe_status',''));
    v_health_status := lower(coalesce(v_payload->>'health_status','unknown'));
    if v_probe_status not in (
      'healthy','missing_credentials','missing_model','invalid_model','invalid_endpoint',
      'unauthorized','forbidden','model_unavailable','rate_limited','timeout',
      'network_error','provider_unavailable','provider_error','invalid_response',
      'adapter_unavailable','no_models'
    ) then
      raise exception using errcode = '22023', message = 'Unsupported provider health probe status.';
    end if;
    if v_health_status not in ('unknown','healthy','degraded','unavailable') then
      raise exception using errcode = '22023', message = 'Unsupported provider health state.';
    end if;
    if coalesce(v_payload->>'connected','false') not in ('true','false') then
      raise exception using errcode = '22023', message = 'Provider connected state must be boolean.';
    end if;
    v_connected := coalesce((v_payload->>'connected')::boolean,false);
    if v_connected and v_health_status <> 'healthy' then
      raise exception using errcode = '22023', message = 'A connected provider must have healthy health status.';
    end if;
    if nullif(v_payload->>'model_count','') is not null and (v_payload->>'model_count') !~ '^[0-9]{1,4}$' then
      raise exception using errcode = '22023', message = 'Provider model count must be a non-negative integer.';
    end if;
    if nullif(v_payload->>'http_status','') is not null and (v_payload->>'http_status') !~ '^[1-5][0-9]{2}$' then
      raise exception using errcode = '22023', message = 'Provider HTTP status must be a valid three-digit status code.';
    end if;
    v_model_identifier := nullif(left(trim(coalesce(v_payload->>'model_identifier','')),200),'');
    v_model_count := nullif(v_payload->>'model_count','')::integer;
    v_http_status := nullif(v_payload->>'http_status','')::integer;
    if v_model_count is not null and v_model_count not between 0 and 2000 then
      raise exception using errcode = '22023', message = 'Provider model count is outside the supported range.';
    end if;
    if v_http_status is not null and v_http_status not between 100 and 599 then
      raise exception using errcode = '22023', message = 'Provider HTTP status is invalid.';
    end if;
    v_note := left(trim(coalesce(v_payload->>'note','')),500);

    select a.provider_identifier into v_provider_identifier
    from ai_network.ai_provider_accounts a
    where a.provider_account_id=v_account_id and a.owner_user_id=p_actor_user_id
    for update;
    if v_provider_identifier is null then
      raise exception using errcode = 'P0002', message = 'Provider account not found for this administrator.';
    end if;

    insert into ai_network.ai_provider_health_events(
      provider_account_id,owner_user_id,provider_identifier,probe_status,connected,
      health_status,model_identifier,model_count,http_status,note,actor_user_id
    ) values (
      v_account_id,p_actor_user_id,v_provider_identifier,v_probe_status,v_connected,
      v_health_status,v_model_identifier,v_model_count,v_http_status,v_note,p_actor_user_id
    ) returning health_event_id into v_event_id;

    update ai_network.ai_provider_accounts a
      set health_status=v_health_status,last_checked_at=now(),updated_at=now()
    where a.provider_account_id=v_account_id and a.owner_user_id=p_actor_user_id;

    return jsonb_build_object(
      'health_event_id',v_event_id,'provider_account_id',v_account_id,
      'provider_identifier',v_provider_identifier,'probe_status',v_probe_status,
      'connected',v_connected,'health_status',v_health_status,
      'model_identifier',v_model_identifier,'model_count',v_model_count,
      'http_status',v_http_status,'note',v_note,'checked_at',now()
    );
  end if;

  if v_action = 'set_provider_account_status' then
    if coalesce(v_payload->>'provider_account_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid provider account ID is required.';
    end if;
    v_account_id := (v_payload->>'provider_account_id')::uuid;
    v_new_status := lower(coalesce(v_payload->>'status',''));
    v_reason := left(trim(coalesce(v_payload->>'reason','')),1000);
    if v_new_status is null or v_new_status not in ('configured','disabled') then
      raise exception using errcode = '22023', message = 'Provider accounts may only be enabled or disabled through this control.';
    end if;
    if length(v_reason)<3 then
      raise exception using errcode = '22023', message = 'A reason of at least three characters is required.';
    end if;

    select a.status,a.health_status,a.last_checked_at,a.provider_identifier,a.provider_name
      into v_old_status,v_health_status,v_last_checked_at,v_provider_identifier,v_provider_name
    from ai_network.ai_provider_accounts a
    where a.provider_account_id=v_account_id and a.owner_user_id=p_actor_user_id
    for update;
    if v_old_status is null then
      raise exception using errcode = 'P0002', message = 'Provider account not found for this administrator.';
    end if;
    if v_old_status='revoked' then
      raise exception using errcode = '22023', message = 'A revoked provider account cannot be re-enabled or changed.';
    end if;
    if v_new_status='configured' then
      if v_old_status='restricted' then
        raise exception using errcode = '22023', message = 'A restricted provider account cannot be enabled without administrator review.';
      end if;
      if v_health_status<>'healthy' or v_last_checked_at is null or v_last_checked_at < now()-interval '15 minutes' then
        raise exception using errcode = '22023', message = 'Run a successful provider connection probe within the last 15 minutes before enabling this account.';
      end if;
    end if;
    if v_old_status<>v_new_status then
      update ai_network.ai_provider_accounts a
        set status=v_new_status,updated_at=now()
      where a.provider_account_id=v_account_id and a.owner_user_id=p_actor_user_id;
      insert into ai_network.ai_provider_account_status_history(
        provider_account_id,owner_user_id,actor_user_id,previous_status,new_status,reason
      ) values (
        v_account_id,p_actor_user_id,p_actor_user_id,v_old_status,v_new_status,v_reason
      );
    end if;
    select jsonb_build_object(
      'provider_account_id',a.provider_account_id,'provider_name',a.provider_name,
      'provider_identifier',a.provider_identifier,'account_type',a.account_type,
      'status',a.status,'health_status',a.health_status,'last_checked_at',a.last_checked_at
    ) into v_result
    from ai_network.ai_provider_accounts a
    where a.provider_account_id=v_account_id and a.owner_user_id=p_actor_user_id;
    return jsonb_build_object('provider_account',v_result);
  end if;

  if v_action = 'sync_provider_models' then
    if coalesce(v_payload->>'provider_account_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid provider account ID is required for model discovery.';
    end if;
    v_account_id := (v_payload->>'provider_account_id')::uuid;
    if jsonb_typeof(coalesce(v_payload->'models','[]'::jsonb))<>'array'
       or jsonb_array_length(coalesce(v_payload->'models','[]'::jsonb))>200 then
      raise exception using errcode = '22023', message = 'Provider model discovery must contain no more than 200 model records.';
    end if;
    select a.provider_name,a.provider_identifier into v_provider_name,v_provider_identifier
    from ai_network.ai_provider_accounts a
    where a.provider_account_id=v_account_id and a.owner_user_id=p_actor_user_id;
    if v_provider_name is null then
      raise exception using errcode = 'P0002', message = 'Provider account not found for this administrator.';
    end if;

    for v_item in select value from jsonb_array_elements(coalesce(v_payload->'models','[]'::jsonb)) as rows(value)
    loop
      if jsonb_typeof(v_item)<>'object' then
        raise exception using errcode = '22023', message = 'Each discovered model must be an object.';
      end if;
      v_model_id := trim(coalesce(v_item->>'model_identifier',''));
      v_model_name := left(trim(coalesce(v_item->>'model_name','')),160);
      v_model_version := left(trim(coalesce(v_item->>'model_version','')),80);
      if v_model_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' or length(v_model_name)<2 then
        raise exception using errcode = '22023', message = 'A discovered model has an invalid identifier or display name.';
      end if;
      insert into ai_network.ai_provider_models(
        provider_name,model_name,model_identifier,model_version,model_capabilities,
        supported_languages,text_capability,image_capability,audio_capability,
        video_capability,voice_capability,tool_capability,is_active,updated_at
      ) values (
        v_provider_name,v_model_name,v_model_id,v_model_version,
        array['text']::text[],'{}'::text[],true,false,false,false,false,false,true,now()
      )
      on conflict (provider_name,model_identifier,model_version) do update
        set model_name=excluded.model_name,is_active=true,updated_at=now();
      v_synced_count := v_synced_count + 1;
    end loop;
    return jsonb_build_object(
      'provider_account_id',v_account_id,'provider_name',v_provider_name,
      'provider_identifier',v_provider_identifier,'synced_count',v_synced_count
    );
  end if;

  raise exception using errcode = '22023', message = 'Unsupported AI provider management command.';
end;
$function$;

comment on function public.minglora_ai_provider_management_command(text,uuid,jsonb)
  is 'Service-role-only provider connection health history, health-gated account enablement and model discovery metadata. Never accepts provider credentials.';

revoke all on function public.minglora_ai_provider_management_command(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_provider_management_command(text,uuid,jsonb) to service_role;
