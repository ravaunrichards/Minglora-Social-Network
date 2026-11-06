-- Manual, owner-authorized PayPal withdrawals for Minglora's 50% platform gift share.
-- Platform withdrawals are isolated from creator_payouts and all Coin wallets.

create table if not exists public.minglora_platform_payout_accounts (
  id boolean primary key default true check (id = true),
  paypal_email text not null check (length(paypal_email) between 3 and 254),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.minglora_platform_payouts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  amount_minor bigint not null check (amount_minor >= 100),
  currency text not null default 'USD' check (currency = 'USD'),
  paypal_email text not null check (length(paypal_email) between 3 and 254),
  status text not null default 'requested' check (status in ('requested','processing','paid','failed')),
  paypal_batch_id text unique,
  created_by uuid not null references public.profiles(id),
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  paid_at timestamptz
);

create index if not exists minglora_platform_payouts_status_created_idx
  on public.minglora_platform_payouts(status, created_at desc);

alter table public.minglora_platform_payout_accounts enable row level security;
alter table public.minglora_platform_payouts enable row level security;
revoke all on public.minglora_platform_payout_accounts from anon, authenticated;
revoke all on public.minglora_platform_payouts from anon, authenticated;
grant all on public.minglora_platform_payout_accounts to service_role;
grant all on public.minglora_platform_payouts to service_role;

create or replace function public.minglora_get_platform_gift_earnings(
  p_admin_user_id uuid, p_admin_email text
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  eligible_gifts bigint;
  eligible_gross_minor bigint;
  eligible_creator_share_minor numeric(20,2);
  platform_share_minor numeric(20,2);
  excluded_promo_gifts bigint;
  excluded_promo_creator_share_minor numeric(20,2);
  excluded_promo_platform_share_minor numeric(20,2);
  pending_creator_payout_minor bigint;
  paid_creator_payout_minor bigint;
  pending_platform_payout_minor bigint;
  paid_platform_payout_minor bigint;
  available_platform_share_minor bigint;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if not public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) then
    raise exception 'Only the active Creator Hub owner can view platform gift earnings' using errcode='42501';
  end if;

  select count(*)::bigint, coalesce(sum(e.gross_minor),0)::bigint,
         coalesce(sum(e.creator_share_minor),0), coalesce(sum(e.platform_share_minor),0)
    into eligible_gifts,eligible_gross_minor,eligible_creator_share_minor,platform_share_minor
    from public.creator_earnings_ledger e
    where e.funding_source in ('cash','marketing','mixed','admin_promotional');

  select count(*)::bigint, coalesce(sum(e.creator_share_minor),0), coalesce(sum(e.platform_share_minor),0)
    into excluded_promo_gifts,excluded_promo_creator_share_minor,excluded_promo_platform_share_minor
    from public.creator_earnings_ledger e where e.funding_source='promo';

  select coalesce(sum(p.amount_minor),0)::bigint into pending_creator_payout_minor
    from public.creator_payouts p where p.status in ('requested','processing');
  select coalesce(sum(p.amount_minor),0)::bigint into paid_creator_payout_minor
    from public.creator_payouts p where p.status='paid';
  select coalesce(sum(p.amount_minor),0)::bigint into pending_platform_payout_minor
    from public.minglora_platform_payouts p where p.status in ('requested','processing');
  select coalesce(sum(p.amount_minor),0)::bigint into paid_platform_payout_minor
    from public.minglora_platform_payouts p where p.status='paid';

  available_platform_share_minor := greatest(0,
    round(coalesce(platform_share_minor,0))::bigint
      - pending_platform_payout_minor - paid_platform_payout_minor);

  return jsonb_build_object(
    'eligibleGiftCount',eligible_gifts,
    'eligibleGrossMinor',eligible_gross_minor,
    'eligibleCreatorShareMinor',eligible_creator_share_minor,
    'recordedPlatformShareMinor',platform_share_minor,
    'pendingCreatorPayoutMinor',pending_creator_payout_minor,
    'paidCreatorPayoutMinor',paid_creator_payout_minor,
    'pendingPlatformPayoutMinor',pending_platform_payout_minor,
    'paidPlatformPayoutMinor',paid_platform_payout_minor,
    'availablePlatformShareMinor',available_platform_share_minor,
    'excludedPromotionalGiftCount',excluded_promo_gifts,
    'excludedPromotionalCreatorShareMinor',excluded_promo_creator_share_minor,
    'excludedPromotionalPlatformShareMinor',excluded_promo_platform_share_minor,
    'currency','USD',
    'note','Recorded platform share is not a live PayPal balance. Only eligible cash-backed ledger value is considered; pending and paid platform withdrawals are excluded from the available amount.'
  );
end;
$function$;

create or replace function public.minglora_request_platform_payout(
  p_admin_user_id uuid, p_admin_email text, p_amount_minor bigint, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  destination_email text;
  platform_earned_minor bigint;
  reserved_minor bigint;
  payout_id uuid;
  existing public.minglora_platform_payouts%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if not public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) then
    raise exception 'Only the active Creator Hub owner can withdraw Minglora platform earnings' using errcode='42501';
  end if;
  if p_amount_minor is null or p_amount_minor < 100 or p_request_id is null then
    raise exception 'Enter a valid platform withdrawal amount and request reference' using errcode='22023';
  end if;

  select a.paypal_email into destination_email
    from public.minglora_platform_payout_accounts a where a.id=true for update;
  if destination_email is null then
    raise exception 'Save the Minglora PayPal receiving email before withdrawing' using errcode='23514';
  end if;

  select * into existing from public.minglora_platform_payouts p where p.request_id=p_request_id;
  if found then
    if existing.amount_minor <> p_amount_minor or existing.paypal_email <> destination_email then
      raise exception 'Withdrawal request reference was already used for different details' using errcode='23505';
    end if;
    return jsonb_build_object('payoutId',existing.id,'status',existing.status,
      'amountMinor',existing.amount_minor,'paypalEmail',existing.paypal_email,'alreadyExists',true);
  end if;

  select round(coalesce(sum(e.platform_share_minor),0))::bigint into platform_earned_minor
    from public.creator_earnings_ledger e
    where e.funding_source in ('cash','marketing','mixed','admin_promotional');
  select coalesce(sum(p.amount_minor),0)::bigint into reserved_minor
    from public.minglora_platform_payouts p where p.status in ('requested','processing','paid');

  if p_amount_minor > greatest(0,platform_earned_minor-reserved_minor) then
    raise exception 'Withdrawal exceeds Minglora available platform earnings' using errcode='22003';
  end if;

  insert into public.minglora_platform_payouts(
    request_id,amount_minor,currency,paypal_email,status,created_by
  ) values (p_request_id,p_amount_minor,'USD',destination_email,'requested',p_admin_user_id)
  returning id into payout_id;

  return jsonb_build_object('payoutId',payout_id,'status','requested',
    'amountMinor',p_amount_minor,'paypalEmail',destination_email,'alreadyExists',false);
end;
$function$;

create or replace function public.minglora_update_platform_payout(
  p_admin_user_id uuid, p_admin_email text, p_payout_id uuid, p_status text,
  p_paypal_batch_id text default null, p_failure_code text default null,
  p_failure_message text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare updated public.minglora_platform_payouts%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if not public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) then
    raise exception 'Only the active Creator Hub owner can update platform withdrawals' using errcode='42501';
  end if;
  if p_payout_id is null or p_status not in ('processing','paid','failed') then
    raise exception 'Invalid platform payout status update' using errcode='22023';
  end if;

  update public.minglora_platform_payouts p
    set status=p_status,
        paypal_batch_id=coalesce(p_paypal_batch_id,p.paypal_batch_id),
        failure_code=case when p_status='failed' then left(coalesce(p_failure_code,''),100) else null end,
        failure_message=case when p_status='failed' then left(coalesce(p_failure_message,''),500) else null end,
        submitted_at=case when p_status='processing' then coalesce(p.submitted_at,now()) else p.submitted_at end,
        paid_at=case when p_status='paid' then coalesce(p.paid_at,now()) else p.paid_at end,
        updated_at=now()
    where p.id=p_payout_id and p.status in ('requested','processing',p_status)
    returning p.* into updated;
  if not found then
    raise exception 'Platform payout was not found or its status cannot be changed' using errcode='P0002';
  end if;
  return jsonb_build_object('id',updated.id,'amountMinor',updated.amount_minor,
    'paypalEmail',updated.paypal_email,'status',updated.status,
    'paypalBatchId',updated.paypal_batch_id,'createdAt',updated.created_at,'paidAt',updated.paid_at);
end;
$function$;

revoke all on function public.minglora_get_platform_gift_earnings(uuid,text) from public, anon, authenticated;
revoke all on function public.minglora_request_platform_payout(uuid,text,bigint,uuid) from public, anon, authenticated;
revoke all on function public.minglora_update_platform_payout(uuid,text,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.minglora_get_platform_gift_earnings(uuid,text) to service_role;
grant execute on function public.minglora_request_platform_payout(uuid,text,bigint,uuid) to service_role;
grant execute on function public.minglora_update_platform_payout(uuid,text,uuid,text,text,text,text) to service_role;
