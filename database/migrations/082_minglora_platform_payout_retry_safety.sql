-- Prevent duplicate platform PayPal payouts after interrupted requests or repeated submissions.
-- Reuses one owner request id safely and permits only one unsettled platform payout at a time.

create or replace function public.minglora_request_platform_payout(
  p_admin_user_id uuid,
  p_admin_email text,
  p_amount_minor bigint,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  destination_email text;
  platform_earned_minor bigint;
  reserved_minor bigint;
  payout_id uuid;
  existing public.minglora_platform_payouts%rowtype;
  active_payout public.minglora_platform_payouts%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if not public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) then
    raise exception 'Only the active Creator Hub owner can withdraw Minglora platform earnings'
      using errcode='42501';
  end if;
  if p_amount_minor is null or p_amount_minor < 100 or p_request_id is null then
    raise exception 'Enter a valid platform withdrawal amount and request reference'
      using errcode='22023';
  end if;

  -- Serialize all platform withdrawal reservations through the single
  -- destination row. This protects the available total from concurrent requests.
  select a.paypal_email into destination_email
    from public.minglora_platform_payout_accounts a
    where a.id=true
    for update;
  if destination_email is null then
    raise exception 'Save the Minglora PayPal receiving email before withdrawing'
      using errcode='23514';
  end if;

  -- A repeated request id returns its existing payout record. The Render
  -- service reuses the same PayPal-Request-Id if a previous response was lost.
  select * into existing
    from public.minglora_platform_payouts p
    where p.request_id=p_request_id;
  if found then
    if existing.amount_minor <> p_amount_minor or existing.paypal_email <> destination_email then
      raise exception 'Withdrawal request reference was already used for different details'
        using errcode='23505';
    end if;
    return jsonb_build_object(
      'payoutId',existing.id,'status',existing.status,
      'amountMinor',existing.amount_minor,'paypalEmail',existing.paypal_email,
      'paypalBatchId',existing.paypal_batch_id,'failureCode',existing.failure_code,
      'failureMessage',existing.failure_message,'alreadyExists',true
    );
  end if;

  -- Never create a second payout while an earlier payout remains uncertain.
  select * into active_payout
    from public.minglora_platform_payouts p
    where p.status in ('requested','processing')
    order by p.created_at desc
    limit 1
    for update;
  if found then
    raise exception 'A Minglora platform withdrawal is already requested or processing. Review its history before starting another.'
      using errcode='55000';
  end if;

  select round(coalesce(sum(e.platform_share_minor),0))::bigint
    into platform_earned_minor
    from public.creator_earnings_ledger e
    where e.funding_source in ('cash','marketing','mixed','admin_promotional');

  select coalesce(sum(p.amount_minor),0)::bigint
    into reserved_minor
    from public.minglora_platform_payouts p
    where p.status in ('requested','processing','paid');

  if p_amount_minor > greatest(0,platform_earned_minor-reserved_minor) then
    raise exception 'Withdrawal exceeds Minglora available platform earnings'
      using errcode='22003';
  end if;

  insert into public.minglora_platform_payouts(
    request_id,amount_minor,currency,paypal_email,status,created_by
  ) values (
    p_request_id,p_amount_minor,'USD',destination_email,'requested',p_admin_user_id
  ) returning id into payout_id;

  return jsonb_build_object(
    'payoutId',payout_id,'status','requested',
    'amountMinor',p_amount_minor,'paypalEmail',destination_email,
    'paypalBatchId',null,'alreadyExists',false
  );
end;
$function$;

revoke all on function public.minglora_request_platform_payout(uuid,text,bigint,uuid) from public, anon, authenticated;
grant execute on function public.minglora_request_platform_payout(uuid,text,bigint,uuid) to service_role;
