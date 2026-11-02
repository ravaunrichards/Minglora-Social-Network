-- Roll back HarborPay-specific database objects from Minglora.
-- The original 040-042 migrations remain in history for reproducible upgrades;
-- this forward migration removes their HarborPay-only objects.
-- Generic profiles.locale and profiles.timezone preferences are intentionally retained.
-- Minglora marketplace PayPal, creator payout, and coin purchase tables are untouched.

drop table if exists public.minglora_identity_links;
drop table if exists public.minglora_link_handoffs;
drop table if exists public.account_applications;
drop table if exists public.orders;
drop table if exists public.payment_links;
drop table if exists public.payments;
drop table if exists public.payouts;
drop table if exists public.webhook_events;
drop table if exists public.merchant_customers;
drop table if exists public.merchant_members;
drop table if exists public.merchant_accounts;

drop function if exists public.harborpay_exchange_minglora_handoff(text);
drop function if exists public.harborpay_claim_webhook_event(text, text, jsonb, uuid);
drop function if exists public.harborpay_complete_webhook_event(text, uuid);
drop function if exists public.harborpay_release_webhook_event(text, uuid, text);
drop function if exists private.harborpay_add_merchant_owner();
drop function if exists private.harborpay_has_merchant_role(uuid, text[]);
drop function if exists private.harborpay_set_updated_at();
