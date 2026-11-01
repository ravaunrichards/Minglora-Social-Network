begin;

create table if not exists public.account_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references auth.users(id) on delete restrict,
  account_type text not null check (account_type in ('business', 'merchant', 'enterprise')),
  organization_name text not null check (length(trim(organization_name)) between 2 and 160),
  legal_name text,
  contact_name text not null check (length(trim(contact_name)) between 2 and 120),
  contact_email text not null,
  country_code char(2) not null default 'JM',
  registration_number text,
  industry text,
  website_url text,
  business_description text not null check (length(trim(business_description)) between 30 and 4000),
  use_case text not null check (length(trim(use_case)) between 10 and 2000),
  expected_monthly_volume_minor bigint,
  expected_monthly_transactions integer,
  countries_served char(2)[] not null default array['JM']::char(2)[],
  settlement_currency char(3) not null default 'USD',
  merchant_id uuid references public.merchant_accounts(id) on delete set null,
  status text not null default 'submitted'
    check (status in ('submitted', 'in_review', 'needs_information', 'approved', 'rejected', 'withdrawn')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_monthly_volume_minor is null or expected_monthly_volume_minor >= 0),
  check (expected_monthly_transactions is null or expected_monthly_transactions >= 0),
  check (cardinality(countries_served) between 1 and 40),
  check (account_type <> 'merchant' or merchant_id is not null),
  check (account_type = 'merchant' or merchant_id is null)
);

create index if not exists account_applications_owner_created_idx
  on public.account_applications (applicant_user_id, created_at desc);
create index if not exists account_applications_review_queue_idx
  on public.account_applications (status, created_at)
  where status in ('submitted', 'in_review', 'needs_information');
create unique index if not exists account_applications_merchant_id_idx
  on public.account_applications (merchant_id)
  where merchant_id is not null;

alter table public.account_applications enable row level security;
revoke all on public.account_applications from public, anon, authenticated;
grant all on public.account_applications to service_role;

drop trigger if exists harborpay_account_applications_updated_at on public.account_applications;
create trigger harborpay_account_applications_updated_at
before update on public.account_applications
for each row execute procedure private.harborpay_set_updated_at();

commit;
