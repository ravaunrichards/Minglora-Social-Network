-- Global Minglora AI identity registry ceiling.
-- Registration is capped independently of active worker concurrency.
-- Batch imports intentionally remain limited to 100 rows per request.

begin;

create table if not exists ai_network.ai_identity_capacity_limits (
  capacity_key text primary key check (capacity_key = 'global'),
  maximum_identities bigint not null check (maximum_identities between 1 and 100000),
  updated_at timestamptz not null default now()
);

alter table ai_network.ai_identity_capacity_limits enable row level security;
revoke all on table ai_network.ai_identity_capacity_limits from public, anon, authenticated, service_role;
grant select, update on table ai_network.ai_identity_capacity_limits to service_role;

insert into ai_network.ai_identity_capacity_limits(capacity_key, maximum_identities)
values ('global', 100000)
on conflict (capacity_key) do nothing;

create or replace function ai_network.enforce_global_ai_identity_capacity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_maximum bigint;
  v_registered bigint;
begin
  -- Lock the single global control row until commit to serialize concurrent
  -- inserts. This check applies to single creation and every bulk/retry path.
  select c.maximum_identities
    into v_maximum
  from ai_network.ai_identity_capacity_limits c
  where c.capacity_key = 'global'
  for update;

  if v_maximum is null then
    raise exception using
      errcode = '55000',
      message = 'Minglora AI identity capacity configuration is unavailable; creation is blocked.';
  end if;

  -- Permit a concurrent idempotent replay to reach the existing unique key.
  if new.owner_user_id is not null
     and new.idempotency_key is not null
     and exists (
       select 1
       from ai_network.ai_identities i
       where i.owner_user_id = new.owner_user_id
         and i.idempotency_key = new.idempotency_key
     ) then
    return new;
  end if;

  select count(*)::bigint
    into v_registered
  from ai_network.ai_identities;

  if v_registered >= v_maximum then
    raise exception using
      errcode = '54000',
      message = 'Minglora has reached its global AI identity registration ceiling.',
      detail = format('Maximum registered identities: %s.', v_maximum);
  end if;

  return new;
end;
$function$;

revoke all on function ai_network.enforce_global_ai_identity_capacity() from public, anon, authenticated;
grant execute on function ai_network.enforce_global_ai_identity_capacity() to service_role;

drop trigger if exists ai_identities_enforce_global_capacity on ai_network.ai_identities;
create trigger ai_identities_enforce_global_capacity
before insert on ai_network.ai_identities
for each row execute function ai_network.enforce_global_ai_identity_capacity();

create or replace function public.minglora_ai_identity_capacity_status(
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_maximum bigint;
  v_registered bigint;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'AI identity capacity status is restricted to the Minglora server runtime.';
  end if;

  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501',
      message = 'A valid signed-in Minglora user is required for AI capacity status.';
  end if;

  select c.maximum_identities
    into v_maximum
  from ai_network.ai_identity_capacity_limits c
  where c.capacity_key = 'global';

  if v_maximum is null then
    raise exception using errcode = '55000',
      message = 'Minglora AI identity capacity configuration is unavailable.';
  end if;

  select count(*)::bigint
    into v_registered
  from ai_network.ai_identities;

  return jsonb_build_object(
    'registered_count', v_registered,
    'maximum_identities', v_maximum,
    'remaining_capacity', greatest(v_maximum - v_registered, 0),
    'capacity_reached', v_registered >= v_maximum
  );
end;
$function$;

revoke all on function public.minglora_ai_identity_capacity_status(uuid) from public, anon, authenticated;
grant execute on function public.minglora_ai_identity_capacity_status(uuid) to service_role;

commit;
