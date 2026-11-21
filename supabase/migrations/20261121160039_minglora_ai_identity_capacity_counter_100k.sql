-- Maintain an indexed global count so identity creation and capacity status
-- remain efficient as Minglora approaches the 100,000 identity registry ceiling.

begin;

alter table ai_network.ai_identity_capacity_limits
  add column if not exists registered_count bigint not null default 0;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='ai_network.ai_identity_capacity_limits'::regclass
      and conname='ai_identity_capacity_registered_count_nonnegative'
  ) then
    alter table ai_network.ai_identity_capacity_limits
      add constraint ai_identity_capacity_registered_count_nonnegative
      check (registered_count >= 0);
  end if;
end;
$constraint$;

-- Lock the same control row used by all identity writers, then reconcile in
-- the next statement so the row count sees any writer that committed first.
do $backfill$
begin
  perform 1
  from ai_network.ai_identity_capacity_limits
  where capacity_key='global'
  for update;

  update ai_network.ai_identity_capacity_limits
  set registered_count=(select count(*)::bigint from ai_network.ai_identities),
      updated_at=now()
  where capacity_key='global';
end;
$backfill$;

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
  select c.maximum_identities, c.registered_count
    into v_maximum, v_registered
  from ai_network.ai_identity_capacity_limits c
  where c.capacity_key='global'
  for update;

  if v_maximum is null or v_registered is null then
    raise exception using
      errcode='55000',
      message='Minglora AI identity capacity configuration is unavailable; creation is blocked.';
  end if;

  -- Keep idempotent replays valid even when the registry is at capacity.
  if new.owner_user_id is not null
     and new.idempotency_key is not null
     and exists (
       select 1
       from ai_network.ai_identities i
       where i.owner_user_id=new.owner_user_id
         and i.idempotency_key=new.idempotency_key
     ) then
    return new;
  end if;

  if v_registered >= v_maximum then
    raise exception using
      errcode='54000',
      message='Minglora has reached its global AI identity registration ceiling.',
      detail=format('Maximum registered identities: %s.',v_maximum);
  end if;

  return new;
end;
$function$;

create or replace function ai_network.increment_global_ai_identity_capacity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  update ai_network.ai_identity_capacity_limits
  set registered_count=registered_count+1,
      updated_at=now()
  where capacity_key='global';

  if not found then
    raise exception using
      errcode='55000',
      message='Minglora AI identity capacity counter is unavailable; creation is blocked.';
  end if;

  return new;
end;
$function$;

create or replace function ai_network.lock_global_ai_identity_capacity_for_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  perform 1
  from ai_network.ai_identity_capacity_limits
  where capacity_key='global'
  for update;

  if not found then
    raise exception using
      errcode='55000',
      message='Minglora AI identity capacity configuration is unavailable; deletion is blocked.';
  end if;

  return old;
end;
$function$;

create or replace function ai_network.decrement_global_ai_identity_capacity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  update ai_network.ai_identity_capacity_limits
  set registered_count=greatest(registered_count-1,0),
      updated_at=now()
  where capacity_key='global';

  if not found then
    raise exception using
      errcode='55000',
      message='Minglora AI identity capacity counter is unavailable; deletion is blocked.';
  end if;

  return old;
end;
$function$;

revoke all on function ai_network.enforce_global_ai_identity_capacity() from public, anon, authenticated;
revoke all on function ai_network.increment_global_ai_identity_capacity() from public, anon, authenticated;
revoke all on function ai_network.lock_global_ai_identity_capacity_for_delete() from public, anon, authenticated;
revoke all on function ai_network.decrement_global_ai_identity_capacity() from public, anon, authenticated;
grant execute on function ai_network.enforce_global_ai_identity_capacity() to service_role;
grant execute on function ai_network.increment_global_ai_identity_capacity() to service_role;
grant execute on function ai_network.lock_global_ai_identity_capacity_for_delete() to service_role;
grant execute on function ai_network.decrement_global_ai_identity_capacity() to service_role;

drop trigger if exists ai_identities_capacity_after_insert on ai_network.ai_identities;
create trigger ai_identities_capacity_after_insert
after insert on ai_network.ai_identities
for each row execute function ai_network.increment_global_ai_identity_capacity();

drop trigger if exists ai_identities_capacity_before_delete on ai_network.ai_identities;
create trigger ai_identities_capacity_before_delete
before delete on ai_network.ai_identities
for each row execute function ai_network.lock_global_ai_identity_capacity_for_delete();

drop trigger if exists ai_identities_capacity_after_delete on ai_network.ai_identities;
create trigger ai_identities_capacity_after_delete
after delete on ai_network.ai_identities
for each row execute function ai_network.decrement_global_ai_identity_capacity();

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
    raise exception using errcode='42501',
      message='AI identity capacity status is restricted to the Minglora server runtime.';
  end if;

  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id=p_actor_user_id
  ) then
    raise exception using errcode='42501',
      message='A valid signed-in Minglora user is required for AI capacity status.';
  end if;

  select c.maximum_identities, c.registered_count
    into v_maximum, v_registered
  from ai_network.ai_identity_capacity_limits c
  where c.capacity_key='global';

  if v_maximum is null or v_registered is null then
    raise exception using errcode='55000',
      message='Minglora AI identity capacity configuration is unavailable.';
  end if;

  return jsonb_build_object(
    'registered_count',v_registered,
    'maximum_identities',v_maximum,
    'remaining_capacity',greatest(v_maximum-v_registered,0),
    'capacity_reached',v_registered>=v_maximum
  );
end;
$function$;

revoke all on function public.minglora_ai_identity_capacity_status(uuid) from public, anon, authenticated;
grant execute on function public.minglora_ai_identity_capacity_status(uuid) to service_role;

commit;
