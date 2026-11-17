-- Minglora AI Network: safe per-identity provider/model execution.
-- Source-only until reviewed. This migration does not create credentials or enable workers.
begin;

alter table ai_network.ai_provider_assignment_history
  drop constraint if exists ai_provider_assignment_history_action_check;
alter table ai_network.ai_provider_assignment_history
  add constraint ai_provider_assignment_history_action_check
  check (action in ('assigned','status_changed','provider_health_verified','provider_health_failed'));

alter table ai_network.ai_provider_assignment_history
  drop constraint if exists ai_provider_assignment_history_new_status_check;
alter table ai_network.ai_provider_assignment_history
  add constraint ai_provider_assignment_history_new_status_check
  check (new_status in ('pending','active','restricted','disabled','revoked'));

create table if not exists ai_network.ai_provider_health_events (
  health_event_id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references ai_network.ai_provider_assignments(assignment_id) on delete restrict,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  provider_account_id uuid not null references ai_network.ai_provider_accounts(provider_account_id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  provider_name text not null check (provider_name ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  model_identifier text not null check (length(model_identifier) between 1 and 180),
  outcome text not null check (outcome in ('healthy','degraded','unavailable')),
  probe_method text not null check (probe_method = 'model_retrieval'),
  http_status integer check (http_status is null or http_status between 100 and 599),
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 60000),
  note text not null default '' check (length(note) <= 360),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  checked_at timestamptz not null default now()
);
create index if not exists ai_provider_health_events_assignment_time_idx
  on ai_network.ai_provider_health_events(assignment_id,checked_at desc);
create index if not exists ai_provider_health_events_account_time_idx
  on ai_network.ai_provider_health_events(provider_account_id,checked_at desc);
create index if not exists ai_provider_health_events_owner_time_idx
  on ai_network.ai_provider_health_events(owner_user_id,checked_at desc);

alter table ai_network.ai_provider_health_events enable row level security;
revoke all on table ai_network.ai_provider_health_events from public,anon,authenticated;
grant select,insert on table ai_network.ai_provider_health_events to service_role;

create or replace function public.minglora_ai_provider_execution_command(
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
  v_assignment_id uuid;
  v_identity_id uuid;
  v_account_id uuid;
  v_assignment_status text;
  v_assignment_health text;
  v_account_status text;
  v_account_health text;
  v_provider_name text;
  v_account_type text;
  v_provider_identifier text;
  v_model_identifier text;
  v_model_name text;
  v_text_capability boolean;
  v_model_active boolean;
  v_assigned_capabilities text[];
  v_checked_at timestamptz;
  v_outcome text;
  v_probe_method text;
  v_note text;
  v_http_status integer;
  v_latency_ms integer;
  v_secret_environment_variable text;
  v_result jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI provider execution commands are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id=p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora account is required.';
  end if;
  if jsonb_typeof(v_payload)<>'object' then
    raise exception using errcode = '22023', message = 'AI provider execution payload must be an object.';
  end if;
  if v_payload ?| array[
    'api_key','apiKey','access_token','accessToken','password','credential',
    'credentials','secret','provider_secret','credential_secret_ref','authorization'
  ] then
    raise exception using errcode = '22023', message = 'Provider credentials and secret references cannot be submitted through this API.';
  end if;

  if v_action='resolve_execution' then
    if coalesce(v_payload->>'identity_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid AI identity ID is required for provider routing.';
    end if;
    if coalesce(v_payload->>'capability','text') <> 'text' then
      raise exception using errcode = '22023', message = 'This execution gateway currently routes only text chat requests.';
    end if;
    v_identity_id := (v_payload->>'identity_id')::uuid;

    select a.assignment_id,a.identity_id,a.provider_account_id,a.assignment_status,a.provider_health_status,
      a.assigned_capabilities,pa.status,pa.health_status,pa.account_type,m.provider_name,pa.provider_identifier,
      m.model_identifier,m.model_name,m.text_capability,m.is_active
    into v_assignment_id,v_identity_id,v_account_id,v_assignment_status,v_assignment_health,
      v_assigned_capabilities,v_account_status,v_account_health,v_account_type,v_provider_name,v_provider_identifier,
      v_model_identifier,v_model_name,v_text_capability,v_model_active
    from ai_network.ai_identities i
    join ai_network.ai_provider_assignments a on a.identity_id=i.identity_id
    join ai_network.ai_provider_models m on m.model_id=a.model_id
    join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
    where i.identity_id=v_identity_id
      and i.owner_user_id=p_actor_user_id
      and i.enabled=true
      and i.status='active'
      and a.assignment_status='active'
      and a.provider_health_status='healthy'
      and pa.owner_user_id=p_actor_user_id
      and pa.status='configured'
      and pa.account_type='managed'
      and pa.health_status='healthy'
      and pa.last_checked_at >= now()-interval '15 minutes'
      and a.last_checked_at >= now()-interval '15 minutes'
      and m.is_active=true
      and m.text_capability=true
      and 'text'=any(a.assigned_capabilities)
    order by a.routing_priority asc,a.assigned_at desc
    limit 1;

    if v_assignment_id is null then
      raise exception using errcode='55000', message='This AI identity has no active text-model assignment with recent verified provider health. Assign a model and verify its provider connection first.';
    end if;

    select jsonb_build_object(
      'assignment_id',v_assignment_id,
      'identity_id',v_identity_id,
      'provider_account_id',v_account_id,
      'provider_name',v_provider_name,
      'provider_identifier',v_provider_identifier,
      'model_identifier',v_model_identifier,
      'model_name',v_model_name,
      'assignment_status',v_assignment_status,
      'provider_health_status',v_assignment_health,
      'provider_account_status',v_account_status,
      'provider_account_health_status',v_account_health,
      'account_type',v_account_type,
      'text_capability',v_text_capability,
      'assigned_capabilities',to_jsonb(v_assigned_capabilities)
    ) into v_result;
    return v_result;
  end if;

  if coalesce(v_payload->>'assignment_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'A valid provider assignment ID is required.';
  end if;
  v_assignment_id := (v_payload->>'assignment_id')::uuid;

  select a.identity_id,a.provider_account_id,a.assignment_status,a.provider_health_status,
    pa.status,pa.health_status,pa.account_type,m.provider_name,pa.provider_identifier,m.model_identifier,
    m.model_name,m.text_capability,m.is_active,a.assigned_capabilities
  into v_identity_id,v_account_id,v_assignment_status,v_assignment_health,
    v_account_status,v_account_health,v_account_type,v_provider_name,v_provider_identifier,v_model_identifier,
    v_model_name,v_text_capability,v_model_active,v_assigned_capabilities
  from ai_network.ai_provider_assignments a
  join ai_network.ai_identities i on i.identity_id=a.identity_id
  join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
  join ai_network.ai_provider_models m on m.model_id=a.model_id
  where a.assignment_id=v_assignment_id
    and i.owner_user_id=p_actor_user_id
    and pa.owner_user_id=p_actor_user_id
  for update of a,pa;

  if not found then
    raise exception using errcode = 'P0002', message = 'Provider assignment not found for this Minglora account.';
  end if;

  if v_action='get_assignment_for_verification' then
    if v_assignment_status not in ('pending','active') then
      raise exception using errcode='55000', message='Only pending or active provider assignments can be health-verified. Restricted, disabled and revoked assignments must be reviewed first.';
    end if;
    return jsonb_build_object(
      'assignment_id',v_assignment_id,
      'identity_id',v_identity_id,
      'provider_account_id',v_account_id,
      'provider_name',v_provider_name,
      'provider_identifier',v_provider_identifier,
      'model_identifier',v_model_identifier,
      'model_name',v_model_name,
      'assignment_status',v_assignment_status,
      'provider_health_status',v_assignment_health,
      'provider_account_status',v_account_status,
      'provider_account_health_status',v_account_health,
      'account_type',v_account_type,
      'text_capability',v_text_capability,
      'assigned_capabilities',to_jsonb(v_assigned_capabilities)
    );
  end if;

  if v_action='record_probe_result' then
    v_outcome:=lower(coalesce(v_payload->>'outcome',''));
    v_probe_method:=coalesce(v_payload->>'probe_method','');
    v_note:=left(coalesce(v_payload->>'note','Provider model access could not be verified.'),360);
    v_http_status:=nullif(v_payload->>'http_status','')::integer;
    v_latency_ms:=nullif(v_payload->>'latency_ms','')::integer;
    if v_outcome not in ('degraded','unavailable') or v_probe_method<>'model_retrieval' then
      raise exception using errcode='22023',message='A failed model-retrieval probe result is required.';
    end if;
    update ai_network.ai_provider_accounts pa
      set health_status=v_outcome,last_checked_at=now(),updated_at=now()
      where pa.provider_account_id=v_account_id;
    update ai_network.ai_provider_assignments a
      set provider_health_status=v_outcome,
          assignment_status=case when a.assignment_status='active' then 'restricted' else a.assignment_status end,
          last_checked_at=now(),updated_at=now()
      where a.assignment_id=v_assignment_id;
    if v_assignment_status='active' then
      insert into ai_network.ai_provider_assignment_history(
        assignment_id,identity_id,actor_user_id,action,previous_status,new_status,reason,metadata
      ) values (
        v_assignment_id,v_identity_id,p_actor_user_id,'provider_health_failed','active','restricted',v_note,
        jsonb_build_object('provider_name',v_provider_name,'model_identifier',v_model_identifier,'outcome',v_outcome)
      );
    end if;
    insert into ai_network.ai_provider_health_events(
      assignment_id,identity_id,provider_account_id,owner_user_id,actor_user_id,
      provider_name,model_identifier,outcome,probe_method,http_status,latency_ms,note,metadata
    ) values (
      v_assignment_id,v_identity_id,v_account_id,p_actor_user_id,p_actor_user_id,
      v_provider_name,v_model_identifier,v_outcome,v_probe_method,v_http_status,v_latency_ms,v_note,
      jsonb_build_object('probe_result_recorded',true)
    );
    return jsonb_build_object('recorded',true,'assignment_id',v_assignment_id,
      'assignment_status',case when v_assignment_status='active' then 'restricted' else v_assignment_status end,
      'provider_health_status',v_outcome);
  end if;

  if v_action='activate_verified_assignment' then
    v_outcome:=lower(coalesce(v_payload->>'probe_status',''));
    v_probe_method:=coalesce(v_payload->>'probe_method','');
    v_checked_at:=nullif(v_payload->>'checked_at','')::timestamptz;
    v_http_status:=nullif(v_payload->>'http_status','')::integer;
    v_latency_ms:=nullif(v_payload->>'latency_ms','')::integer;
    v_note:=left(coalesce(v_payload->>'note','Provider model access verified.'),360);
    if v_outcome<>'healthy' or v_probe_method<>'model_retrieval' or v_checked_at is null or
       v_checked_at < now()-interval '90 seconds' or v_checked_at > now()+interval '10 seconds' then
      raise exception using errcode='22023',message='A recent successful server-side model-access verification is required before activation.';
    end if;
    if lower(coalesce(v_payload->>'provider_name',''))<>v_provider_name or
       coalesce(v_payload->>'model_identifier','')<>v_model_identifier then
      raise exception using errcode='22023',message='Provider/model verification evidence does not match the assigned model.';
    end if;
    if v_assignment_status not in ('pending','active') or v_account_status in ('disabled','revoked') or
       v_account_type is distinct from 'managed' or
       v_model_active is distinct from true or v_text_capability is distinct from true or
       not ('text'=any(v_assigned_capabilities)) then
      raise exception using errcode='55000',message='Only eligible platform-managed text-model assignments can use the Minglora server environment credential. User-managed provider credentials need an approved secrets-manager integration.';
    end if;
    v_secret_environment_variable:=case v_provider_name when 'openai' then 'OPENAI_API_KEY' else null end;
    if v_secret_environment_variable is null then
      raise exception using errcode='55000',message='No production execution adapter is registered for this provider. The assignment remains inactive.';
    end if;
    update ai_network.ai_provider_accounts pa
      set status='configured',
          health_status='healthy',
          last_checked_at=now(),
          provider_configuration=coalesce(pa.provider_configuration,'{}'::jsonb) ||
            jsonb_build_object('credential_source','server_environment',
              'credential_environment_variable',v_secret_environment_variable),
          updated_at=now()
      where pa.provider_account_id=v_account_id;
    update ai_network.ai_provider_assignments a
      set assignment_status='active',
          provider_health_status='healthy',
          last_checked_at=now(),
          updated_at=now()
      where a.assignment_id=v_assignment_id;
    insert into ai_network.ai_provider_assignment_history(
      assignment_id,identity_id,actor_user_id,action,previous_status,new_status,reason,metadata
    ) values (
      v_assignment_id,v_identity_id,p_actor_user_id,'provider_health_verified',
      v_assignment_status,'active','Server-side provider model access was verified.',
      jsonb_build_object('provider_name',v_provider_name,'model_identifier',v_model_identifier,
        'probe_method',v_probe_method,'http_status',v_http_status,'checked_at',v_checked_at)
    );
    insert into ai_network.ai_provider_health_events(
      assignment_id,identity_id,provider_account_id,owner_user_id,actor_user_id,
      provider_name,model_identifier,outcome,probe_method,http_status,latency_ms,note,metadata
    ) values (
      v_assignment_id,v_identity_id,v_account_id,p_actor_user_id,p_actor_user_id,
      v_provider_name,v_model_identifier,'healthy',v_probe_method,v_http_status,v_latency_ms,v_note,
      jsonb_build_object('credential_source','server_environment',
        'credential_environment_variable',v_secret_environment_variable)
    );
    return jsonb_build_object('activated',true,'assignment_id',v_assignment_id,
      'identity_id',v_identity_id,'provider_name',v_provider_name,'model_identifier',v_model_identifier,
      'assignment_status','active','provider_health_status','healthy',
      'provider_account_status','configured','provider_account_health_status','healthy');
  end if;

  raise exception using errcode='22023',message='Unsupported AI provider execution command.';
end;
$function$;

comment on function public.minglora_ai_provider_execution_command(text,uuid,jsonb)
  is 'Service-role-only per-identity provider/model verification, activation and execution routing. No secrets are accepted or returned.';
revoke all on function public.minglora_ai_provider_execution_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_provider_execution_command(text,uuid,jsonb) to service_role;

commit;
