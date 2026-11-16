BEGIN;

-- The runtime gateway is the only Marketplace writer. Remove inherited
-- table-level grants and re-grant only the read access required by RLS-backed
-- public catalogue and participant views.
REVOKE ALL ON TABLE
  public.marketplace_listings,
  public.marketplace_seller_profiles,
  public.marketplace_seller_public_profiles,
  public.marketplace_job_postings,
  public.marketplace_job_applications,
  public.marketplace_service_bookings,
  public.marketplace_saved_listings,
  public.marketplace_orders,
  public.marketplace_seller_orders,
  public.marketplace_order_items,
  public.marketplace_fulfillments,
  public.marketplace_cases,
  public.marketplace_case_messages,
  public.marketplace_payouts,
  public.marketplace_reviews,
  public.marketplace_seller_verification_events,
  public.listing_media,
  public.media_assets
FROM anon,authenticated;

-- Public catalogue data: SELECT only, filtered by the existing RLS policies.
GRANT SELECT ON TABLE
  public.marketplace_listings,
  public.marketplace_seller_public_profiles,
  public.marketplace_job_postings,
  public.marketplace_reviews,
  public.listing_media
TO anon,authenticated;

-- Private participant data: authenticated SELECT only, always filtered by RLS.
GRANT SELECT ON TABLE
  public.marketplace_seller_profiles,
  public.marketplace_job_applications,
  public.marketplace_service_bookings,
  public.marketplace_saved_listings,
  public.marketplace_orders,
  public.marketplace_seller_orders,
  public.marketplace_order_items,
  public.marketplace_fulfillments,
  public.marketplace_cases,
  public.marketplace_case_messages,
  public.marketplace_payouts,
  public.marketplace_seller_verification_events,
  public.media_assets
TO authenticated;

-- Reviews retain the existing verified-purchase/verified-booking INSERT
-- policy. No direct client UPDATE or DELETE access is granted.
GRANT INSERT ON TABLE public.marketplace_reviews TO authenticated;

-- Explicitly keep finance, quote, reservation and internal event tables
-- server-only. No exposed client role should read or mutate these records.
REVOKE ALL ON TABLE
  public.marketplace_checkout_quotes,
  public.marketplace_fulfillment_rates,
  public.marketplace_inventory_reservations,
  public.marketplace_journals,
  public.marketplace_ledger_accounts,
  public.marketplace_ledger_entries,
  public.marketplace_order_events,
  public.marketplace_payment_attempts,
  public.marketplace_payment_configuration,
  public.marketplace_payout_events,
  public.marketplace_refunds,
  public.marketplace_returns,
  public.marketplace_webhook_events
FROM anon,authenticated;

-- Runtime gateway uses service_role for the operational writes. Retain
-- explicit grants even where earlier migrations already supplied them.
GRANT ALL ON TABLE
  public.marketplace_listings,
  public.marketplace_seller_profiles,
  public.marketplace_seller_public_profiles,
  public.marketplace_job_postings,
  public.marketplace_job_applications,
  public.marketplace_service_bookings,
  public.marketplace_saved_listings,
  public.marketplace_orders,
  public.marketplace_seller_orders,
  public.marketplace_order_items,
  public.marketplace_fulfillments,
  public.marketplace_cases,
  public.marketplace_case_messages,
  public.marketplace_payouts,
  public.marketplace_reviews,
  public.marketplace_seller_verification_events,
  public.marketplace_checkout_quotes,
  public.marketplace_fulfillment_rates,
  public.marketplace_inventory_reservations,
  public.marketplace_journals,
  public.marketplace_ledger_accounts,
  public.marketplace_ledger_entries,
  public.marketplace_order_events,
  public.marketplace_payment_attempts,
  public.marketplace_payment_configuration,
  public.marketplace_payout_events,
  public.marketplace_refunds,
  public.marketplace_returns,
  public.marketplace_webhook_events,
  public.listing_media,
  public.media_assets
TO service_role;

-- Cover the seller_order_id FK used by buyer/seller order-detail lookups and
-- the FK maintenance path.
CREATE INDEX IF NOT EXISTS marketplace_order_items_seller_order_idx
  ON public.marketplace_order_items(seller_order_id);

COMMIT;
