begin;

alter table public.account_applications
  drop constraint if exists account_applications_check1;

alter table public.account_applications
  drop constraint if exists account_applications_merchant_type_check;

alter table public.account_applications
  add constraint account_applications_account_record_required
  check (merchant_id is not null);

commit;
