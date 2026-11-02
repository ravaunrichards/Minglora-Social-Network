-- Applied to Minglora Supabase on 20261102050518; source migration 039_harborpay_consolidated_into_minglora.
-- This migration is for the single shared Minglora project.

-- Consolidate HarborPay's empty payment-service schema into the existing Minglora database.
-- HarborPay had no rows in any of these tables at migration time. The duplicate
-- HarborPay profiles/identity-handoff tables are intentionally not copied:
-- Minglora's auth.users + public.profiles are the single identity system.

create table public.merchant_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  legal_name text,
  country_code character(2) not null default 'JM',
  settlement_currency character(3) not null default 'USD',
  business_email text,
  website_url text,
  status text not null default 'draft' check (status in ('draft','pending_review','active','restricted','closed')),
  paypal_merchant_id text,
  payouts_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_type text not null default 'merchant' check (account_type in ('business','merchant','enterprise'))
);

create table public.merchant_members (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner','admin','finance','support','developer','viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (merchant_id,user_id)
);

create table public.merchant_customers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  email text not null,
  full_name text,
  phone_e164 text,
  country_code character(2),
  external_reference text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null default 'paypal' check (provider='paypal'),
  provider_order_id text unique,
  provider_capture_id text unique,
  idempotency_key text not null,
  amount_minor bigint not null check (amount_minor>0),
  currency character(3) not null default 'USD' check (currency='USD'),
  description text not null,
  status text not null default 'created' check (status in ('created','approved','pending','completed','failed','cancelled','refunded','review_required')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paypal' check (provider='paypal'),
  recipient_email text not null,
  amount_minor bigint not null check (amount_minor>0),
  currency character(3) not null default 'USD' check (currency='USD'),
  status text not null default 'processing' check (status in ('processing','submitted','succeeded','failed','requires_review')),
  idempotency_key text not null,
  provider_batch_id text unique,
  provider_item_id text,
  provider_sender_item_id text unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(created_by,idempotency_key)
);

create table public.webhook_events (
  provider_event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_started_at timestamptz,
  processing_attempts integer not null default 0 check (processing_attempts>=0),
  locked_by uuid,
  last_error text
);

create table public.payment_links (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  slug text not null unique,
  title text not null check (length(trim(title)) between 2 and 120),
  description text,
  amount_minor bigint check (amount_minor is null or amount_minor>0),
  currency character(3) not null default 'USD',
  status text not null default 'active' check (status in ('active','disabled','expired')),
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses>0),
  use_count integer not null default 0 check (use_count>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  customer_id uuid references public.merchant_customers(id) on delete set null,
  order_reference text not null,
  amount_minor bigint not null check (amount_minor>0),
  currency character(3) not null default 'USD',
  description text not null,
  status text not null default 'created' check (status in ('created','payment_pending','paid','partially_refunded','refunded','cancelled','expired')),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(merchant_id,idempotency_key),
  unique(merchant_id,order_reference)
);

create table public.account_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references auth.users(id) on delete restrict,
  account_type text not null check (account_type in ('business','merchant','enterprise')),
  organization_name text not null check (length(trim(organization_name)) between 2 and 160),
  legal_name text,
  contact_name text not null check (length(trim(contact_name)) between 2 and 120),
  contact_email text not null,
  country_code character(2) not null default 'JM',
  registration_number text,
  industry text,
  website_url text,
  business_description text not null check (length(trim(business_description)) between 30 and 4000),
  use_case text not null check (length(trim(use_case)) between 10 and 2000),
  expected_monthly_volume_minor bigint check (expected_monthly_volume_minor is null or expected_monthly_volume_minor>=0),
  expected_monthly_transactions integer check (expected_monthly_transactions is null or expected_monthly_transactions>=0),
  countries_served character(2)[] not null default array['JM'::character(2)] check (cardinality(countries_served) between 1 and 40),
  settlement_currency character(3) not null default 'USD',
  merchant_id uuid references public.merchant_accounts(id) on delete set null,
  status text not null default 'submitted' check (status in ('submitted','in_review','needs_information','approved','rejected','withdrawn')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (merchant_id is not null)
);

create index merchant_accounts_owner_created_idx on public.merchant_accounts(owner_user_id,created_at desc);
create unique index merchant_accounts_paypal_merchant_idx on public.merchant_accounts(paypal_merchant_id) where paypal_merchant_id is not null;
create unique index merchant_customers_external_reference_idx on public.merchant_customers(merchant_id,external_reference) where external_reference is not null;
create index merchant_customers_merchant_email_idx on public.merchant_customers(merchant_id,lower(email));
create index merchant_members_invited_by_idx on public.merchant_members(invited_by) where invited_by is not null;
create index merchant_members_user_idx on public.merchant_members(user_id,merchant_id);
create index orders_customer_created_idx on public.orders(customer_id,created_at desc);
create index orders_merchant_created_idx on public.orders(merchant_id,created_at desc);
create index payment_links_created_by_idx on public.payment_links(created_by);
create index payment_links_merchant_created_idx on public.payment_links(merchant_id,created_at desc);
create index payments_user_created_idx on public.payments(user_id,created_at desc);
create index payouts_created_at_idx on public.payouts(created_at desc);
create index webhook_events_claimable_idx on public.webhook_events(received_at) where processed_at is null;
create index account_applications_owner_created_idx on public.account_applications(applicant_user_id,created_at desc);
create index account_applications_review_queue_idx on public.account_applications(status,created_at) where status in ('submitted','in_review','needs_information');
create unique index account_applications_merchant_id_idx on public.account_applications(merchant_id) where merchant_id is not null;

-- Reuse Minglora's private schema and keep HarborPay authorization helpers private.
create or replace function private.harborpay_set_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end; $$;

create or replace function private.harborpay_has_merchant_role(p_merchant_id uuid,p_allowed_roles text[] default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.merchant_members mm
    where mm.merchant_id=p_merchant_id
      and mm.user_id=(select auth.uid())
      and (p_allowed_roles is null or mm.role=any(p_allowed_roles))
  );
$$;

create or replace function private.harborpay_add_merchant_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.merchant_members(merchant_id,user_id,role)
  values(new.id,new.owner_user_id,'owner')
  on conflict(merchant_id,user_id) do nothing;
  return new;
end; $$;

create or replace function public.harborpay_claim_webhook_event(
  p_provider_event_id text,p_event_type text,p_payload jsonb,p_worker_id uuid
) returns text language plpgsql security definer set search_path='' as $$
declare v_claimed boolean:=false; v_state text;
begin
  insert into public.webhook_events(provider_event_id,event_type,payload)
  values(p_provider_event_id,p_event_type,p_payload)
  on conflict(provider_event_id) do nothing;
  update public.webhook_events
    set processing_started_at=now(),processing_attempts=processing_attempts+1,
        locked_by=p_worker_id,last_error=null
    where provider_event_id=p_provider_event_id and processed_at is null
      and (processing_started_at is null or processing_started_at<now()-interval '5 minutes')
    returning true into v_claimed;
  if coalesce(v_claimed,false) then return 'claimed'; end if;
  select case when processed_at is not null then 'processed' else 'busy' end
    into v_state from public.webhook_events where provider_event_id=p_provider_event_id;
  return coalesce(v_state,'busy');
end; $$;

create or replace function public.harborpay_complete_webhook_event(p_provider_event_id text,p_worker_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_completed boolean:=false;
begin
  update public.webhook_events
    set processed_at=now(),processing_started_at=null,locked_by=null,last_error=null
    where provider_event_id=p_provider_event_id and locked_by=p_worker_id and processed_at is null
    returning true into v_completed;
  return coalesce(v_completed,false);
end; $$;

create or replace function public.harborpay_release_webhook_event(p_provider_event_id text,p_worker_id uuid,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_released boolean:=false;
begin
  update public.webhook_events
    set processing_started_at=null,locked_by=null,last_error=left(coalesce(p_error,'Processing failed'),1000)
    where provider_event_id=p_provider_event_id and locked_by=p_worker_id and processed_at is null
    returning true into v_released;
  return coalesce(v_released,false);
end; $$;

create trigger harborpay_account_applications_updated_at before update on public.account_applications
for each row execute function private.harborpay_set_updated_at();
create trigger harborpay_merchant_owner_created after insert on public.merchant_accounts
for each row execute function private.harborpay_add_merchant_owner();
create trigger harborpay_payments_updated_at before update on public.payments
for each row execute function private.harborpay_set_updated_at();
create trigger harborpay_payouts_updated_at before update on public.payouts
for each row execute function private.harborpay_set_updated_at();

alter table public.merchant_accounts enable row level security;
alter table public.merchant_members enable row level security;
alter table public.merchant_customers enable row level security;
alter table public.payments enable row level security;
alter table public.payouts enable row level security;
alter table public.webhook_events enable row level security;
alter table public.payment_links enable row level security;
alter table public.orders enable row level security;
alter table public.account_applications enable row level security;

create policy merchant_members_read_own_accounts on public.merchant_accounts
for select to authenticated using (private.harborpay_has_merchant_role(id,null::text[]));
create policy merchant_members_read_customers on public.merchant_customers
for select to authenticated using (private.harborpay_has_merchant_role(merchant_id,array['owner','admin','finance','support']::text[]));
create policy merchant_members_read_memberships on public.merchant_members
for select to authenticated using (
  user_id=(select auth.uid()) or private.harborpay_has_merchant_role(merchant_id,array['owner','admin','finance']::text[])
);
create policy merchant_members_read_orders on public.orders
for select to authenticated using (private.harborpay_has_merchant_role(merchant_id,null::text[]));
create policy merchant_members_read_payment_links on public.payment_links
for select to authenticated using (private.harborpay_has_merchant_role(merchant_id,null::text[]));
create policy "Customers can read their own payments" on public.payments
for select to authenticated using ((select auth.uid())=user_id);

grant usage on schema private to authenticated;
grant execute on function private.harborpay_has_merchant_role(uuid,text[]) to authenticated;
grant select on public.merchant_accounts,public.merchant_members,public.merchant_customers,
  public.orders,public.payment_links,public.payments to authenticated;
grant all on public.merchant_accounts,public.merchant_members,public.merchant_customers,
  public.orders,public.payment_links,public.payments,public.payouts,public.webhook_events,
  public.account_applications to service_role;

revoke all on function public.harborpay_claim_webhook_event(text,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.harborpay_complete_webhook_event(text,uuid) from public,anon,authenticated;
revoke all on function public.harborpay_release_webhook_event(text,uuid,text) from public,anon,authenticated;
grant execute on function public.harborpay_claim_webhook_event(text,text,jsonb,uuid) to service_role;
grant execute on function public.harborpay_complete_webhook_event(text,uuid) to service_role;
grant execute on function public.harborpay_release_webhook_event(text,uuid,text) to service_role;
