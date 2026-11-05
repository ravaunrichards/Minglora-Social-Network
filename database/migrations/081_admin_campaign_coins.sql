-- Admin Campaign Coins: a dedicated source wallet for manual Admin Centre campaigns.
-- This balance is independent of public member Coin wallets, Main Promotional Coins,
-- and the legacy cash-backed marketing budget.

drop function if exists public.admin_campaign_coins_allocate(uuid,bigint,uuid,text,text);
drop function if exists public.admin_campaign_coins_fund(bigint,uuid,text);
drop function if exists public.admin_campaign_coins_get_wallet();
drop function if exists public.admin_campaign_coins_authorized();

create table if not exists public.admin_campaign_coins_wallets (
  admin_user_id uuid primary key references public.profiles(id) on delete restrict,
  available_coins bigint not null default 0 check (available_coins >= 0),
  lifetime_funded_coins bigint not null default 0 check (lifetime_funded_coins >= 0),
  lifetime_allocated_coins bigint not null default 0 check (lifetime_allocated_coins >= 0),
  max_balance_coins bigint not null default 1000000000000
    check (max_balance_coins = 1000000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_campaign_coins_wallet_max_balance
    check (available_coins <= max_balance_coins)
);

create table if not exists public.admin_campaign_coins_ledger (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  admin_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  member_user_id uuid references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in ('funding','allocation','refund','reversal','adjustment')),
  delta_coins bigint not null check (delta_coins <> 0),
  balance_after bigint not null check (balance_after >= 0),
  campaign_name text not null default '' check (char_length(campaign_name) <= 120),
  note text not null default '' check (char_length(note) <= 500),
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists admin_campaign_coins_ledger_admin_created_idx
  on public.admin_campaign_coins_ledger (admin_user_id, created_at desc);
create index if not exists admin_campaign_coins_ledger_member_created_idx
  on public.admin_campaign_coins_ledger (member_user_id, created_at desc);

alter table public.admin_campaign_coins_wallets enable row level security;
alter table public.admin_campaign_coins_ledger enable row level security;
revoke all on public.admin_campaign_coins_wallets from public, anon, authenticated;
revoke all on public.admin_campaign_coins_ledger from public, anon, authenticated;
grant all on public.admin_campaign_coins_wallets to service_role;
grant all on public.admin_campaign_coins_ledger to service_role;

create or replace function public.admin_campaign_coins_authorized(
  p_admin_user_id uuid,
  p_admin_email text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_admin_user_id = '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid
    and lower(coalesce(p_admin_email,'')) = 'creatorhubcreatornetwork@gmail.com'
    and exists (
      select 1
      from auth.users u
      join public.profiles p on p.id = u.id
      join public.minglora_platform_staff s on s.user_id = u.id
      where u.id = p_admin_user_id
        and lower(u.email) = 'creatorhubcreatornetwork@gmail.com'
        and coalesce(u.raw_app_meta_data->>'role','') = 'platform_owner'
        and p.verification_status = 'verified'
        and p.verification_badge = 'blue'
        and s.role = 'owner'
        and s.active = true
        and 'platform:admin' = any(s.permissions)
    );
$$;

create or replace function public.admin_campaign_coins_get_wallet(
  p_admin_user_id uuid,
  p_admin_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.admin_campaign_coins_wallets%rowtype;
begin
  if not public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) then
    raise exception 'Not authorized for Admin Campaign Coins.';
  end if;

  insert into public.admin_campaign_coins_wallets (admin_user_id)
  values (p_admin_user_id)
  on conflict (admin_user_id) do nothing;

  select * into v_wallet
  from public.admin_campaign_coins_wallets
  where admin_user_id = p_admin_user_id;

  return jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'title', 'Admin Campaign Coins',
    'owner_email', 'CreatorHubCreatorNetwork@gmail.com'
  );
end;
$$;

create or replace function public.admin_campaign_coins_fund(
  p_admin_user_id uuid,
  p_admin_email text,
  p_amount_coins bigint,
  p_request_id uuid,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.admin_campaign_coins_wallets%rowtype;
  v_existing public.admin_campaign_coins_ledger%rowtype;
begin
  if not public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) then
    raise exception 'Not authorized for Admin Campaign Coins.';
  end if;
  if p_amount_coins is null or p_amount_coins < 1
     or p_amount_coins > 1000000000000 or p_request_id is null then
    raise exception 'Enter a valid positive funding amount and request ID.';
  end if;

  insert into public.admin_campaign_coins_wallets (admin_user_id)
  values (p_admin_user_id)
  on conflict (admin_user_id) do nothing;

  select * into v_wallet
  from public.admin_campaign_coins_wallets
  where admin_user_id = p_admin_user_id
  for update;

  select * into v_existing
  from public.admin_campaign_coins_ledger
  where request_id = p_request_id;

  if found then
    if v_existing.admin_user_id <> p_admin_user_id
       or v_existing.event_type <> 'funding'
       or v_existing.delta_coins <> p_amount_coins then
      raise exception 'Request ID was already used for a different transaction.';
    end if;
    return jsonb_build_object(
      'already_processed', true,
      'ledger', to_jsonb(v_existing),
      'wallet', to_jsonb(v_wallet)
    );
  end if;

  if v_wallet.available_coins + p_amount_coins > v_wallet.max_balance_coins then
    raise exception 'Funding would exceed the 1 trillion Coin wallet limit.';
  end if;

  update public.admin_campaign_coins_wallets
  set available_coins = available_coins + p_amount_coins,
      lifetime_funded_coins = lifetime_funded_coins + p_amount_coins,
      updated_at = now()
  where admin_user_id = p_admin_user_id
  returning * into v_wallet;

  insert into public.admin_campaign_coins_ledger (
    request_id, admin_user_id, actor_user_id, event_type,
    delta_coins, balance_after, note
  ) values (
    p_request_id, p_admin_user_id, p_admin_user_id, 'funding',
    p_amount_coins, v_wallet.available_coins, left(coalesce(p_note,''),500)
  )
  returning * into v_existing;

  return jsonb_build_object(
    'already_processed', false,
    'ledger', to_jsonb(v_existing),
    'wallet', to_jsonb(v_wallet)
  );
end;
$$;

create or replace function public.admin_campaign_coins_allocate(
  p_admin_user_id uuid,
  p_admin_email text,
  p_member_user_id uuid,
  p_amount_coins bigint,
  p_request_id uuid,
  p_campaign_name text default '',
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.admin_campaign_coins_wallets%rowtype;
  v_member_wallet public.admin_promotional_gift_wallets%rowtype;
  v_existing public.admin_campaign_coins_ledger%rowtype;
begin
  if not public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) then
    raise exception 'Not authorized for Admin Campaign Coins.';
  end if;
  if p_member_user_id is null or p_member_user_id = p_admin_user_id
     or p_amount_coins is null or p_amount_coins < 1
     or p_amount_coins > 1000000000000 or p_request_id is null then
    raise exception 'Enter a valid member, positive Coin amount and request ID.';
  end if;
  if not exists (
    select 1 from public.profiles where id = p_member_user_id
  ) then
    raise exception 'Minglora member was not found.';
  end if;

  insert into public.admin_campaign_coins_wallets (admin_user_id)
  values (p_admin_user_id)
  on conflict (admin_user_id) do nothing;

  select * into v_wallet
  from public.admin_campaign_coins_wallets
  where admin_user_id = p_admin_user_id
  for update;

  select * into v_existing
  from public.admin_campaign_coins_ledger
  where request_id = p_request_id;

  if found then
    if v_existing.admin_user_id <> p_admin_user_id
       or v_existing.event_type <> 'allocation'
       or v_existing.member_user_id <> p_member_user_id
       or v_existing.delta_coins <> -p_amount_coins then
      raise exception 'Request ID was already used for a different transaction.';
    end if;

    select * into v_member_wallet
    from public.admin_promotional_gift_wallets
    where user_id = p_member_user_id;

    return jsonb_build_object(
      'already_processed', true,
      'ledger', to_jsonb(v_existing),
      'admin_wallet', to_jsonb(v_wallet),
      'member_promotional_wallet', to_jsonb(v_member_wallet),
      'main_coin_wallet_touched', false,
      'main_promotional_coins_touched', false
    );
  end if;

  if v_wallet.available_coins < p_amount_coins then
    raise exception 'Insufficient Admin Campaign Coins balance.';
  end if;

  insert into public.admin_promotional_gift_wallets (user_id)
  values (p_member_user_id)
  on conflict (user_id) do nothing;

  select * into v_member_wallet
  from public.admin_promotional_gift_wallets
  where user_id = p_member_user_id
  for update;

  if v_member_wallet.available_coins > 9223372036854775807 - p_amount_coins
     or v_member_wallet.lifetime_allocated_coins > 9223372036854775807 - p_amount_coins then
    raise exception 'Member promotional gift wallet limit exceeded.';
  end if;

  update public.admin_campaign_coins_wallets
  set available_coins = available_coins - p_amount_coins,
      lifetime_allocated_coins = lifetime_allocated_coins + p_amount_coins,
      updated_at = now()
  where admin_user_id = p_admin_user_id
  returning * into v_wallet;

  update public.admin_promotional_gift_wallets
  set available_coins = available_coins + p_amount_coins,
      lifetime_allocated_coins = lifetime_allocated_coins + p_amount_coins,
      updated_at = now()
  where user_id = p_member_user_id
  returning * into v_member_wallet;

  insert into public.admin_campaign_coins_ledger (
    request_id, admin_user_id, actor_user_id, member_user_id,
    event_type, delta_coins, balance_after, campaign_name, note
  ) values (
    p_request_id, p_admin_user_id, p_admin_user_id, p_member_user_id,
    'allocation', -p_amount_coins, v_wallet.available_coins,
    left(coalesce(p_campaign_name,''),120), left(coalesce(p_note,''),500)
  )
  returning * into v_existing;

  return jsonb_build_object(
    'already_processed', false,
    'ledger', to_jsonb(v_existing),
    'admin_wallet', to_jsonb(v_wallet),
    'member_promotional_wallet', to_jsonb(v_member_wallet),
    'main_coin_wallet_touched', false,
    'main_promotional_coins_touched', false
  );
end;
$$;

revoke all on function public.admin_campaign_coins_authorized(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_campaign_coins_get_wallet(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_campaign_coins_fund(uuid,text,bigint,uuid,text) from public,anon,authenticated;
revoke all on function public.admin_campaign_coins_allocate(uuid,text,uuid,bigint,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_campaign_coins_authorized(uuid,text) to service_role;
grant execute on function public.admin_campaign_coins_get_wallet(uuid,text) to service_role;
grant execute on function public.admin_campaign_coins_fund(uuid,text,bigint,uuid,text) to service_role;
grant execute on function public.admin_campaign_coins_allocate(uuid,text,uuid,bigint,uuid,text,text) to service_role;
