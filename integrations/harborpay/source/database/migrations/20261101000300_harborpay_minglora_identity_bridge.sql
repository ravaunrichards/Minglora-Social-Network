-- HarborPay <-> Minglora identity-link bridge.
-- It transfers only user-consented prefill fields; it does not share databases,
-- passwords, payment credentials, KYC evidence, wallet data, or social profile metadata.

begin;

create table if not exists public.minglora_link_handoffs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  minglora_user_id uuid not null,
  email text not null check (length(email) between 3 and 254),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  handoff_token_hash text not null unique,
  consent_version text not null,
  expires_at timestamptz not null,
  exchanged_at timestamptz,
  linked_at timestamptz,
  linked_auth_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists minglora_link_handoffs_expiry_idx
  on public.minglora_link_handoffs (expires_at)
  where linked_at is null;

create table if not exists public.minglora_identity_links (
  id uuid primary key default gen_random_uuid(),
  minglora_user_id uuid not null unique,
  harborpay_user_id uuid not null unique references auth.users(id) on delete restrict,
  email text not null,
  linked_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.minglora_link_handoffs enable row level security;
alter table public.minglora_identity_links enable row level security;
revoke all on public.minglora_link_handoffs, public.minglora_identity_links
  from public, anon, authenticated;
grant all on public.minglora_link_handoffs, public.minglora_identity_links to service_role;

create or replace function public.harborpay_exchange_minglora_handoff(p_token_hash text)
returns table (
  minglora_user_id uuid,
  email text,
  full_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    update public.minglora_link_handoffs h
       set exchanged_at = now()
     where h.handoff_token_hash = p_token_hash
       and h.exchanged_at is null
       and h.linked_at is null
       and h.expires_at > now()
     returning h.minglora_user_id, h.email, h.full_name, h.expires_at;
end;
$$;

revoke all on function public.harborpay_exchange_minglora_handoff(text)
  from public, anon, authenticated;
grant execute on function public.harborpay_exchange_minglora_handoff(text) to service_role;

create or replace function public.harborpay_link_minglora_identity(
  p_token_hash text,
  p_harborpay_user_id uuid,
  p_verified_email text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handoff_id uuid;
  v_minglora_user_id uuid;
  v_email text;
  v_inserted integer := 0;
  v_same_link boolean := false;
begin
  select h.id, h.minglora_user_id, h.email
    into v_handoff_id, v_minglora_user_id, v_email
    from public.minglora_link_handoffs h
   where h.handoff_token_hash = p_token_hash
     and h.exchanged_at is not null
     and h.linked_at is null
     and h.expires_at > now()
     and lower(h.email) = lower(trim(p_verified_email))
   for update;

  if not found then
    return false;
  end if;

  insert into public.minglora_identity_links (
    minglora_user_id, harborpay_user_id, email
  ) values (
    v_minglora_user_id, p_harborpay_user_id, lower(v_email)
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.minglora_link_handoffs
       set linked_at = now(),
           linked_auth_user_id = p_harborpay_user_id
     where id = v_handoff_id;
    return true;
  end if;

  select exists (
    select 1
      from public.minglora_identity_links l
     where l.minglora_user_id = v_minglora_user_id
       and l.harborpay_user_id = p_harborpay_user_id
       and lower(l.email) = lower(v_email)
       and l.revoked_at is null
  ) into v_same_link;

  if v_same_link then
    update public.minglora_link_handoffs
       set linked_at = now(),
           linked_auth_user_id = p_harborpay_user_id
     where id = v_handoff_id;
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.harborpay_link_minglora_identity(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.harborpay_link_minglora_identity(text, uuid, text)
  to service_role;

commit;
