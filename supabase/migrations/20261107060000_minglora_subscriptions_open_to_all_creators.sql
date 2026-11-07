alter table public.subscription_creator_settings
  alter column application_status set default 'approved';

update public.subscription_creator_settings
set application_status = 'approved',
    rejection_reason = null,
    approved_at = coalesce(approved_at, now()),
    updated_at = now();

create or replace function public.minglora_guard_creator_subscription_settings()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user <> 'service_role' then
    if tg_op = 'INSERT' then
      new.application_status := 'approved';
      new.approved_by := null;
      new.approved_at := now();
      new.rejection_reason := null;
    else
      new.application_status := 'approved';
      new.approved_by := old.approved_by;
      new.approved_at := coalesce(old.approved_at, now());
      new.rejection_reason := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

comment on column public.subscription_creator_settings.application_status
  is 'All Minglora creators are automatically approved to offer subscriptions; availability is controlled by subscriptions_enabled and an active billing tier.';
