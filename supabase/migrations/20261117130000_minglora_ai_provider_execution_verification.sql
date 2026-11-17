-- Minglora AI provider execution verification.
-- Adds a service-only health ledger and a guarded activation RPC.
-- Production application is intentionally separate from this source change.

create table if not exists ai_network.ai_provider_health_events (
  health_event_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  assignment_id uuid not null references ai_network.ai_provider_assignments(assignment_id) on delete restrict,
  provider_account_id uuid not null references ai_network.ai_provider_accounts(provider_account_id) on delete restrict,
  model_id uuid not null references ai_network.ai_provider_models(model_id) on delete restrict,
  provider_name text not null check (provider_name ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  health_status text not null check (health_status in ('healthy','degraded','unavailable')),
  probe_status text not null check (probe_status ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  http_status integer check (http_status is null or http_status between 100 and 599),
  input_tokens integer not null default 0 check (input_tokens between 0 and 1000000),
  output_tokens integer not null default 0 check (output_tokens between 0 and 1000000),
  total_tokens integer not null default 0 check (total_tokens between 0 and 1000000),
  note text not null default '' check (octet_length(note) <= 800),
  checked_at timestamptz not null default now()
);

create index if not exists ai_provider_health_events_owner_checked_idx
  on ai_network.ai_provider_health_events(owner_user_id, checked_at desc);
create index if not exists ai_provider_health_events_assignment_checked_idx
  on ai_network.ai_provider_health_events(assignment_id, checked_at desc);

alter table ai_network.ai_provider_health_events enable row level security;
revoke all on ai_network.ai_provider_health_events from public, anon, authenticated;
grant select, insert on ai_network.ai_provider_health_events to service_role;

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
  v_assignment_id uuid;
  v_identity_id uuid;
  v_provider_account_id uuid;
  v_model_id uuid;
  v_provider_name text;
  v_model_identifier text;
  v_account_provider_name text;
  v_health_status text;
  v_probe_status text;
  v_connected boolean;
  v_http_status integer;
  v_input_tokens integer := 0;
  v_output_tokens integer := 0;
  v_total_tokens integer := 0;
  v_note text := '';
  v_assignment_status text;
  v_account_status text;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI provider execution verification is restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora administrator is required.';
  end if;
  if lower(coalesce(p_action,'')) <> 'verify_assignment' then
    raise exception using errcode = '22023', message = 'Unsupported AI provider execution command.';
  end if;
  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'Provider execution payload must be a JSON object.';
  end if;
  if p_payload::text ~* '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential|private[_-]?key)"[[:space:]]*:' then
    raise exception using errcode = '22023', message = 'Provider credentials and secrets are not allowed in execution verification records.';
  end if;
  if coalesce(p_payload->>'assignment_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'A valid provider assignment ID is required.';
  end if;

  v_assignment_id := (p_payload->>'assignment_id')::uuid;
  v_provider_name := lower(trim(coalesce(p_payload->>'provider_name','')));
  v_model_identifier := trim(coalesce(p_payload->>'model_identifier',''));
  v_health_status := lower(trim(coalesce(p_payload->>'health_status','')));
  v_probe_status := lower(trim(coalesce(p_payload->>'probe_status','')));
  v_connected := coalesce((p_payload->>'connected')::boolean,false);
  if coalesce(p_payload->>'http_status','') ~ '^\d{3}$' then
    v_http_status := (p_payload->>'http_status')::integer;
  end if;
  if coalesce(p_payload #>> '{usage,input_tokens}','') ~ '^\d{1,7}$' then
    v_input_tokens := least(1000000,(p_payload #>> '{usage,input_tokens}')::integer);
  end if;
  if coalesce(p_payload #>> '{usage,output_tokens}','') ~ '^\d{1,7}$' then
    v_output_tokens := least(1000000,(p_payload #>> '{usage,output_tokens}')::integer);
  end if;
  if coalesce(p_payload #>> '{usage,total_tokens}','') ~ '^\d{1,7}$' then
    v_total_tokens := least(1000000,(p_payload #>> '{usage,total_tokens}')::integer);
  end if;
  v_note := left(regexp_replace(coalesce(p_payload->>'note',''), '[[:cntrl:]]', ' ', 'g'), 800);

  if v_health_status not in ('healthy','degraded','unavailable') then
    raise exception using errcode = '22023', message = 'A valid provider health status is required.';
  end if;
  if length(v_provider_name)<2 or length(v_provider_name)>80 or
     length(v_model_identifier)<1 or length(v_model_identifier)>180 then
    raise exception using errcode = '22023', message = 'The provider and model identifiers are invalid.';
  end if;
  if v_health_status='healthy' and (not v_connected or v_probe_status<>'inference_verified') then
    raise exception using errcode = '22023', message = 'An assignment can only be activated after a successful moderated model inference test.';
  end if;
  if v_health_status<>'healthy' and v_connected then
    raise exception using errcode = '22023', message = 'A connected result must be recorded as healthy.';
  end if;

  select a.identity_id,a.provider_account_id,a.model_id,a.assignment_status,
         m.provider_name,m.model_identifier,pa.provider_name,pa.status
    into v_identity_id,v_provider_account_id,v_model_id,v_assignment_status,
         v_provider_name,v_model_identifier,v_account_provider_name,v_account_status
  from ai_network.ai_provider_assignments a
  join ai_network.ai_identities i on i.identity_id=a.identity_id
  join ai_network.ai_provider_models m on m.model_id=a.model_id
  join ai_network.ai_provider_accounts pa on pa.provider_account_id=a.provider_account_id
  where a.assignment_id=v_assignment_id
    and i.owner_user_id=p_actor_user_id
    and pa.owner_user_id=p_actor_user_id
  for update of a,pa;

  if v_identity_id is null then
    raise exception using errcode = 'P0002', message = 'Provider assignment or account was not found for this owner.';
  end if;
  if v_provider_name <> lower(trim(coalesce(p_payload->>'provider_name',''))) or
     v_model_identifier <> trim(coalesce(p_payload->>'model_identifier','')) or
     v_account_provider_name <> v_provider_name then
    raise exception using errcode = '22023', message = 'The provider or model metadata did not match the persisted assignment.';
  end if;
  if v_provider_name <> 'openai' then
    raise exception using errcode = '0A000', message = 'This Minglora execution adapter currently supports OpenAI text models only.';
  end if;
  if not exists (
    select 1
    from ai_network.ai_identities i
    join ai_network.ai_provider_models m on m.model_id=v_model_id
    join ai_network.ai_provider_assignments a on a.assignment_id=v_assignment_id
    where i.identity_id=v_identity_id and i.owner_user_id=p_actor_user_id
      and i.status='active' and i.enabled=true
      and m.is_active=true and m.text_capability=true
      and 'text'=any(a.assigned_capabilities)
  ) then
    raise exception using errcode = '42501', message = 'Only enabled active identities with an assigned text-capable model can pass provider execution verification.';
  end if;
  if v_assignment_status in ('disabled','revoked') or v_account_status in ('disabled','revoked') then
    raise exception using errcode = '42501', message = 'A disabled or revoked provider assignment/account cannot be verified.';
  end if;

  update ai_network.ai_provider_accounts
  set status = case
        when v_health_status='healthy' then 'configured'
        when status='configured' then 'restricted'
        else status
      end,
      health_status=v_health_status,
      last_checked_at=now(),
      updated_at=now()
  where provider_account_id=v_provider_account_id and owner_user_id=p_actor_user_id;

  update ai_network.ai_provider_assignments
  set assignment_status=case
        when v_health_status='healthy' then 'active'
        when assignment_status='active' then 'restricted'
        else assignment_status
      end,
      provider_health_status=v_health_status,
      last_checked_at=now(),
      updated_at=now()
  where assignment_id=v_assignment_id;

  insert into ai_network.ai_provider_health_events(
    owner_user_id,assignment_id,provider_account_id,model_id,provider_name,
    health_status,probe_status,http_status,input_tokens,output_tokens,total_tokens,note
  ) values (
    p_actor_user_id,v_assignment_id,v_provider_account_id,v_model_id,v_provider_name,
    v_health_status,v_probe_status,v_http_status,v_input_tokens,v_output_tokens,v_total_tokens,v_note
  );

  return jsonb_build_object(
    'assignment_id',v_assignment_id,
    'identity_id',v_identity_id,
    'provider_account_id',v_provider_account_id,
    'model_id',v_model_id,
    'provider_name',v_provider_name,
    'health_status',v_health_status,
    'assignment_status',case when v_health_status='healthy' then 'active'
      when v_assignment_status='active' then 'restricted' else v_assignment_status end,
    'checked_at',now(),
    'usage',jsonb_build_object('input_tokens',v_input_tokens,'output_tokens',v_output_tokens,'total_tokens',v_total_tokens)
  );
end;
$function$;

comment on function public.minglora_ai_provider_execution_command(text,uuid,jsonb)
  is 'Server-only, audit-backed provider execution verification. Activates only after a moderated inference smoke test succeeds.';

revoke all on function public.minglora_ai_provider_execution_command(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_provider_execution_command(text,uuid,jsonb) to service_role;
