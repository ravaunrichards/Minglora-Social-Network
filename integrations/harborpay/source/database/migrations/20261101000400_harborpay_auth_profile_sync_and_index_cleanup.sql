
begin;

-- Keep server-only operational tables unexposed; remove only the duplicate partial index.
drop index if exists public.webhook_events_unprocessed_idx;

-- Cover foreign keys used by merchant membership and handoff ownership lookups.
create index if not exists merchant_members_invited_by_idx
  on public.merchant_members (invited_by)
  where invited_by is not null;

create index if not exists minglora_link_handoffs_linked_auth_user_id_idx
  on public.minglora_link_handoffs (linked_auth_user_id)
  where linked_auth_user_id is not null;

create index if not exists payment_links_created_by_idx
  on public.payment_links (created_by);

-- Keep the HarborPay profile's verification timestamp synchronized with Supabase Auth.
create or replace function private.harborpay_sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = coalesce(new.email, ''),
         email_verified_at = new.email_confirmed_at,
         updated_at = now()
   where id = new.id;
  return new;
end;
$$;

revoke all on function private.harborpay_sync_auth_user_profile()
  from public, anon, authenticated;

drop trigger if exists harborpay_auth_user_profile_updated on auth.users;
create trigger harborpay_auth_user_profile_updated
after update of email, email_confirmed_at on auth.users
for each row execute procedure private.harborpay_sync_auth_user_profile();

commit;

-- This trigger runs only after Supabase Auth changes the user's email or confirmation state.
