begin;

alter table public.merchant_accounts
  add column if not exists account_type text not null default 'merchant';

alter table public.merchant_accounts
  drop constraint if exists merchant_accounts_account_type_check;

alter table public.merchant_accounts
  add constraint merchant_accounts_account_type_check
  check (account_type in ('business', 'merchant', 'enterprise'));

alter table public.account_applications
  drop constraint if exists account_applications_check;

alter table public.account_applications
  add constraint account_applications_account_record_required
  check (merchant_id is not null);

commit;
