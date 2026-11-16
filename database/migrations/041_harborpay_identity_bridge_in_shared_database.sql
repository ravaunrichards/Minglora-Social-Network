-- Applied to Minglora Supabase on 20261102050704; source migration 040_harborpay_identity_bridge_in_shared_database.
-- This migration is for the single shared Minglora project.

create table public.minglora_link_handoffs (
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
 check (expires_at>created_at)
);
create table public.minglora_identity_links (
 id uuid primary key default gen_random_uuid(),
 minglora_user_id uuid not null unique,
 harborpay_user_id uuid not null unique references auth.users(id) on delete restrict,
 email text not null,
 linked_at timestamptz not null default now(),
 revoked_at timestamptz
);
create index minglora_link_handoffs_expiry_idx on public.minglora_link_handoffs(expires_at) where linked_at is null;
create index minglora_link_handoffs_linked_auth_user_id_idx on public.minglora_link_handoffs(linked_auth_user_id) where linked_auth_user_id is not null;
create or replace function public.harborpay_exchange_minglora_handoff(p_token_hash text)
returns table(minglora_user_id uuid,email text,full_name text,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 return query
 update public.minglora_link_handoffs h
 set exchanged_at=now()
 where h.handoff_token_hash=p_token_hash
   and h.exchanged_at is null
   and h.linked_at is null
   and h.expires_at>now()
 returning h.minglora_user_id,h.email,h.full_name,h.expires_at;
end; $$;
alter table public.minglora_link_handoffs enable row level security;
alter table public.minglora_identity_links enable row level security;
grant all on public.minglora_link_handoffs,public.minglora_identity_links to service_role;
revoke all on function public.harborpay_exchange_minglora_handoff(text) from public,anon,authenticated;
grant execute on function public.harborpay_exchange_minglora_handoff(text) to service_role;
