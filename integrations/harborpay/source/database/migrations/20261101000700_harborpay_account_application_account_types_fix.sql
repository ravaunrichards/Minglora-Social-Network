begin;

alter table public.account_applications
  drop constraint if exists account_applications_check1;

alter table public.account_applications
  drop constraint if exists account_applications_merchant_type_check;

commit;
