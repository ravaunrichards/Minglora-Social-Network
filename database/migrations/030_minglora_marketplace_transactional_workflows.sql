BEGIN;

-- Fix the service-listing pricing model inherited from the original catalogue.
-- Quote-priced services have a currency but no fixed price.
ALTER TABLE public.marketplace_listings
  DROP CONSTRAINT IF EXISTS marketplace_listings_check;
ALTER TABLE public.marketplace_listings
  ADD CONSTRAINT marketplace_listings_price_currency_kind_check CHECK (
    currency IS NOT NULL AND
    ((kind='product' AND price_minor IS NOT NULL) OR
     (kind='service' AND ((price_type='quote' AND price_minor IS NULL) OR
                          (price_type<>'quote' AND price_minor IS NOT NULL))))
  );
ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS reserved_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE public.marketplace_listings
  ADD CONSTRAINT marketplace_reserved_quantity_check CHECK (reserved_quantity>=0 AND reserved_quantity<=quantity);

ALTER TABLE public.marketplace_orders
  ADD COLUMN IF NOT EXISTS refunded_minor bigint NOT NULL DEFAULT 0 CHECK (refunded_minor>=0);
ALTER TABLE public.marketplace_seller_orders
  ADD COLUMN IF NOT EXISTS refunded_minor bigint NOT NULL DEFAULT 0 CHECK (refunded_minor>=0),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_eligible_at timestamptz;

CREATE TABLE IF NOT EXISTS public.marketplace_seller_public_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.marketplace_seller_profiles(user_id) ON DELETE CASCADE,
  store_name text NOT NULL CHECK (length(store_name) BETWEEN 2 AND 100),
  description text NOT NULL CHECK (length(description) BETWEEN 20 AND 1000),
  country_code char(2) NOT NULL,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active','inactive','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketplace_seller_public_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketplace_seller_public_profiles_read
  ON public.marketplace_seller_public_profiles
  FOR SELECT TO anon,authenticated USING (status='active');
GRANT SELECT ON public.marketplace_seller_public_profiles TO anon,authenticated;
GRANT ALL ON public.marketplace_seller_public_profiles TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_payment_configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  provider text CHECK (provider IN ('paypal','other')),
  marketplace_approval_status text NOT NULL DEFAULT 'pending' CHECK (marketplace_approval_status IN ('pending','approved','rejected','suspended')),
  checkout_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  tax_calculation_enabled boolean NOT NULL DEFAULT false,
  commission_bps integer NOT NULL DEFAULT 0 CHECK (commission_bps BETWEEN 0 AND 3000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
INSERT INTO public.marketplace_payment_configuration(singleton,provider,marketplace_approval_status,checkout_enabled,payouts_enabled,tax_calculation_enabled,commission_bps)
VALUES(true,'paypal','pending',false,false,false,0)
ON CONFLICT(singleton) DO NOTHING;
ALTER TABLE public.marketplace_payment_configuration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_payment_configuration FROM anon,authenticated;
GRANT ALL ON public.marketplace_payment_configuration TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_fulfillment_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.marketplace_seller_profiles(user_id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('local_delivery','shipping')),
  currency char(3) NOT NULL,
  country_code char(2),
  region_label text NOT NULL DEFAULT '',
  postal_prefix text NOT NULL DEFAULT '',
  price_minor bigint NOT NULL CHECK (price_minor>=0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_fulfillment_rate_key
  ON public.marketplace_fulfillment_rates(listing_id,method,currency,coalesce(country_code,''),region_label,postal_prefix);
CREATE INDEX IF NOT EXISTS marketplace_fulfillment_rate_lookup
  ON public.marketplace_fulfillment_rates(listing_id,method,currency,active);
ALTER TABLE public.marketplace_fulfillment_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_fulfillment_rates FROM anon,authenticated;
GRANT ALL ON public.marketplace_fulfillment_rates TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_checkout_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  currency char(3) NOT NULL,
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 20),
  seller_ids uuid[] NOT NULL,
  item_subtotal_minor bigint NOT NULL CHECK (item_subtotal_minor>=0),
  fulfillment_minor bigint NOT NULL DEFAULT 0 CHECK (fulfillment_minor>=0),
  commission_preview_minor bigint NOT NULL DEFAULT 0 CHECK (commission_preview_minor>=0),
  tax_minor bigint CHECK (tax_minor IS NULL OR tax_minor>=0),
  total_minor_before_tax bigint NOT NULL CHECK (total_minor_before_tax>=0),
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blockers)='array'),
  checkout_ready boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'informational' CHECK (status IN ('informational','accepted','converted','expired','cancelled')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_quotes_buyer_idx ON public.marketplace_checkout_quotes(buyer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_quotes_expiry_idx ON public.marketplace_checkout_quotes(status,expires_at);
ALTER TABLE public.marketplace_checkout_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_checkout_quotes FROM anon,authenticated;
GRANT ALL ON public.marketplace_checkout_quotes TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE RESTRICT,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','committed','released','expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,listing_id)
);
CREATE INDEX IF NOT EXISTS marketplace_inventory_reservation_lookup
  ON public.marketplace_inventory_reservations(listing_id,status,expires_at);
ALTER TABLE public.marketplace_inventory_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_inventory_reservations FROM anon,authenticated;
GRANT ALL ON public.marketplace_inventory_reservations TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE RESTRICT,
  seller_order_id uuid REFERENCES public.marketplace_seller_orders(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_order_events_order_idx
  ON public.marketplace_order_events(order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_order_events_seller_order_idx
  ON public.marketplace_order_events(seller_order_id,created_at DESC);
ALTER TABLE public.marketplace_order_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_order_events FROM anon,authenticated;
GRANT ALL ON public.marketplace_order_events TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE RESTRICT,
  seller_order_id uuid REFERENCES public.marketplace_seller_orders(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.marketplace_cases(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_refund_reference text,
  idempotency_key text NOT NULL UNIQUE,
  amount_minor bigint NOT NULL CHECK (amount_minor>0),
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processing','succeeded','failed','held')),
  reason text NOT NULL DEFAULT '',
  failure_code text NOT NULL DEFAULT '',
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_provider_refund_uq
  ON public.marketplace_refunds(provider,provider_refund_reference)
  WHERE provider_refund_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_refunds_order_idx
  ON public.marketplace_refunds(order_id,created_at DESC);
ALTER TABLE public.marketplace_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_refunds FROM anon,authenticated;
GRANT ALL ON public.marketplace_refunds TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_payout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES public.marketplace_payouts(id) ON DELETE RESTRICT,
  provider_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
ALTER TABLE public.marketplace_payout_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_payout_events FROM anon,authenticated;
GRANT ALL ON public.marketplace_payout_events TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_saved_listings (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,listing_id)
);
CREATE INDEX IF NOT EXISTS marketplace_saved_listing_user_idx
  ON public.marketplace_saved_listings(user_id,created_at DESC);
ALTER TABLE public.marketplace_saved_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketplace_saved_listings_read_own
  ON public.marketplace_saved_listings FOR SELECT TO authenticated USING(user_id=(select auth.uid()));
REVOKE INSERT,UPDATE,DELETE ON public.marketplace_saved_listings FROM anon,authenticated;
GRANT SELECT ON public.marketplace_saved_listings TO authenticated;
GRANT ALL ON public.marketplace_saved_listings TO service_role;

-- Complete indexes for the marketplace foreign keys that participate in the hot paths.
CREATE INDEX IF NOT EXISTS marketplace_cart_items_listing_idx ON public.marketplace_cart_items(listing_id);
CREATE INDEX IF NOT EXISTS marketplace_case_messages_sender_idx ON public.marketplace_case_messages(sender_id);
CREATE INDEX IF NOT EXISTS marketplace_cases_opened_by_idx ON public.marketplace_cases(opened_by);
CREATE INDEX IF NOT EXISTS marketplace_cases_assigned_to_idx ON public.marketplace_cases(assigned_to);
CREATE INDEX IF NOT EXISTS marketplace_cases_order_idx ON public.marketplace_cases(order_id);
CREATE INDEX IF NOT EXISTS marketplace_cases_seller_order_idx ON public.marketplace_cases(seller_order_id);
CREATE INDEX IF NOT EXISTS marketplace_cases_booking_idx ON public.marketplace_cases(booking_id);
CREATE INDEX IF NOT EXISTS marketplace_job_applications_applicant_idx ON public.marketplace_job_applications(applicant_id);
CREATE INDEX IF NOT EXISTS marketplace_job_applications_resume_idx ON public.marketplace_job_applications(resume_asset_id);
CREATE INDEX IF NOT EXISTS marketplace_jobs_employer_idx ON public.marketplace_job_postings(employer_id);
CREATE INDEX IF NOT EXISTS marketplace_jobs_reviewer_idx ON public.marketplace_job_postings(reviewed_by);
CREATE INDEX IF NOT EXISTS marketplace_journals_order_idx ON public.marketplace_journals(order_id);
CREATE INDEX IF NOT EXISTS marketplace_order_items_listing_idx ON public.marketplace_order_items(listing_id);
CREATE INDEX IF NOT EXISTS marketplace_payment_attempts_order_idx ON public.marketplace_payment_attempts(order_id);
CREATE INDEX IF NOT EXISTS marketplace_payouts_seller_order_idx ON public.marketplace_payouts(seller_order_id);
CREATE INDEX IF NOT EXISTS marketplace_returns_case_idx ON public.marketplace_returns(case_id);
CREATE INDEX IF NOT EXISTS marketplace_returns_item_idx ON public.marketplace_returns(order_item_id);
CREATE INDEX IF NOT EXISTS marketplace_reviews_reviewer_idx ON public.marketplace_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS marketplace_service_bookings_listing_idx ON public.marketplace_service_bookings(listing_id);
CREATE INDEX IF NOT EXISTS marketplace_service_bookings_buyer_idx ON public.marketplace_service_bookings(buyer_id);

-- Marketplace writes now go only through the authenticated Minglora runtime service.
REVOKE INSERT,UPDATE,DELETE ON public.marketplace_listings,public.listing_media,
  public.marketplace_seller_profiles,public.marketplace_job_postings,
  public.marketplace_job_applications
FROM anon,authenticated;
GRANT ALL ON public.marketplace_listings,public.listing_media,
  public.marketplace_seller_profiles,public.marketplace_job_postings,
  public.marketplace_job_applications
TO service_role;

-- Keep the trigger function's name resolution deterministic.
CREATE OR REPLACE FUNCTION public.prevent_marketplace_ledger_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $immutable$
BEGIN
  RAISE EXCEPTION 'Marketplace ledger entries are immutable; post a reversing journal instead';
END $immutable$;
REVOKE ALL ON FUNCTION public.prevent_marketplace_ledger_entry_mutation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_marketplace_ledger_entry_mutation() TO service_role;

CREATE OR REPLACE FUNCTION public.create_marketplace_checkout_quote(
  p_buyer_id uuid,
  p_items jsonb,
  p_fulfillment_by_listing jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $quote$
DECLARE
  v_config public.marketplace_payment_configuration%ROWTYPE;
  v_listing public.marketplace_listings%ROWTYPE;
  v_seller public.marketplace_seller_profiles%ROWTYPE;
  v_item jsonb;
  v_lines jsonb:='[]'::jsonb;
  v_seller_ids uuid[]:=ARRAY[]::uuid[];
  v_blockers text[]:=ARRAY[]::text[];
  v_listing_id uuid;
  v_quantity integer;
  v_fulfillment text;
  v_currency char(3);
  v_rate_minor bigint;
  v_line_minor bigint;
  v_subtotal bigint:=0;
  v_fulfillment_total bigint:=0;
  v_commission bigint:=0;
  v_total bigint:=0;
  v_quote_id uuid:=gen_random_uuid();
  v_created_at timestamptz:=now();
  v_expires_at timestamptz:=now()+interval '10 minutes';
  v_seller_id uuid;
BEGIN
  IF p_buyer_id IS NULL THEN RAISE EXCEPTION 'Buyer is required'; END IF;
  IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>20 THEN
    RAISE EXCEPTION 'A checkout quote must contain between 1 and 20 items';
  END IF;
  IF p_fulfillment_by_listing IS NULL OR jsonb_typeof(p_fulfillment_by_listing)<>'object' THEN
    RAISE EXCEPTION 'Choose a fulfilment option for every product';
  END IF;
  SELECT * INTO v_config FROM public.marketplace_payment_configuration WHERE singleton=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace payment configuration is unavailable'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_listing_id:=nullif(v_item->>'listingId','')::uuid;
    v_quantity:=coalesce((v_item->>'quantity')::integer,0);
    IF v_listing_id IS NULL OR v_quantity<1 OR v_quantity>100 THEN
      RAISE EXCEPTION 'Each product needs a valid listing and quantity from 1 to 100';
    END IF;
    IF EXISTS (SELECT 1 FROM public.marketplace_checkout_quotes q
               WHERE q.buyer_id=p_buyer_id AND q.status='informational'
                 AND q.expires_at>now() AND q.id= v_quote_id) THEN
      RAISE EXCEPTION 'Invalid checkout quote';
    END IF;
    SELECT * INTO v_listing FROM public.marketplace_listings WHERE id=v_listing_id;
    IF NOT FOUND OR v_listing.status<>'active' OR v_listing.kind<>'product' THEN
      RAISE EXCEPTION 'One or more products are no longer available';
    END IF;
    IF v_listing.seller_id=p_buyer_id THEN RAISE EXCEPTION 'You cannot purchase your own listing'; END IF;
    IF v_listing.price_minor IS NULL OR v_listing.price_minor<=0 OR v_listing.currency IS NULL THEN
      RAISE EXCEPTION 'A product has an invalid price or currency';
    END IF;
    IF v_listing.quantity-v_listing.reserved_quantity<v_quantity THEN
      RAISE EXCEPTION 'Requested quantity exceeds available stock for %',v_listing.title;
    END IF;
    IF v_currency IS NULL THEN v_currency:=v_listing.currency;
    ELSIF v_currency<>v_listing.currency THEN
      RAISE EXCEPTION 'Split products with different currencies into separate checkouts';
    END IF;
    v_fulfillment:=coalesce(p_fulfillment_by_listing->>v_listing_id::text,'');
    IF NOT (v_listing.fulfillment_options @> ARRAY[v_fulfillment]::text[]) THEN
      RAISE EXCEPTION 'Choose a fulfilment option offered by each seller';
    END IF;
    v_rate_minor:=0;
    IF v_fulfillment<>'pickup' THEN
      SELECT r.price_minor INTO v_rate_minor
      FROM public.marketplace_fulfillment_rates r
      WHERE r.listing_id=v_listing.id AND r.seller_id=v_listing.seller_id
        AND r.method=v_fulfillment AND r.currency=v_currency AND r.active=true
        AND r.country_code IS NULL AND r.region_label=''
        AND r.postal_prefix=''
      ORDER BY r.updated_at DESC LIMIT 1;
      IF v_rate_minor IS NULL THEN
        RAISE EXCEPTION 'A seller-confirmed delivery or shipping rate is required before this item can be quoted';
      END IF;
    END IF;
    v_line_minor:=v_listing.price_minor::bigint*v_quantity::bigint;
    IF v_line_minor>1000000000000 OR v_subtotal+v_line_minor>1000000000000 THEN
      RAISE EXCEPTION 'The checkout amount exceeds the supported limit';
    END IF;
    v_subtotal:=v_subtotal+v_line_minor;
    v_fulfillment_total:=v_fulfillment_total+v_rate_minor;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
      'listingId',v_listing.id,'sellerId',v_listing.seller_id,'title',left(v_listing.title,180),
      'quantity',v_quantity,'unitPriceMinor',v_listing.price_minor,'lineSubtotalMinor',v_line_minor,
      'fulfillment',v_fulfillment,'fulfillmentMinor',v_rate_minor
    ));
    IF NOT (v_listing.seller_id=ANY(v_seller_ids)) THEN v_seller_ids:=array_append(v_seller_ids,v_listing.seller_id); END IF;
  END LOOP;

  FOREACH v_seller_id IN ARRAY v_seller_ids
  LOOP
    SELECT * INTO v_seller FROM public.marketplace_seller_profiles WHERE user_id=v_seller_id;
    IF NOT FOUND OR v_seller.status<>'approved' OR v_seller.identity_status<>'verified' THEN
      v_blockers:=array_append(v_blockers,'One or more sellers have not completed marketplace identity or business verification.');
    ELSIF v_seller.payout_status<>'verified' THEN
      v_blockers:=array_append(v_blockers,'One or more sellers have not completed payout onboarding.');
    END IF;
  END LOOP;
  v_commission:=round(v_subtotal*v_config.commission_bps/10000.0)::bigint;
  v_total:=v_subtotal+v_fulfillment_total;
  IF NOT v_config.tax_calculation_enabled THEN
    v_blockers:=array_append(v_blockers,'Tax and customs calculations are not configured for this checkout.');
  END IF;
  IF v_config.marketplace_approval_status<>'approved' OR NOT v_config.checkout_enabled THEN
    v_blockers:=array_append(v_blockers,'Live marketplace payment processing is not enabled for this platform.');
  END IF;
  IF v_config.provider IS NULL THEN
    v_blockers:=array_append(v_blockers,'A marketplace payment provider has not been approved.');
  END IF;

  INSERT INTO public.marketplace_checkout_quotes(
    id,buyer_id,currency,lines,seller_ids,item_subtotal_minor,fulfillment_minor,
    commission_preview_minor,tax_minor,total_minor_before_tax,blockers,checkout_ready,
    status,expires_at,created_at,updated_at
  ) VALUES (
    v_quote_id,p_buyer_id,v_currency,v_lines,v_seller_ids,v_subtotal,v_fulfillment_total,
    v_commission,NULL,v_total,to_jsonb(v_blockers),cardinality(v_blockers)=0,
    'informational',v_expires_at,v_created_at,v_created_at
  );

  RETURN jsonb_build_object(
    'id',v_quote_id,'buyerId',p_buyer_id,'currency',v_currency,'lines',v_lines,
    'sellerIds',to_jsonb(v_seller_ids),'itemSubtotalMinor',v_subtotal,
    'fulfillmentMinor',v_fulfillment_total,'marketplaceCommissionPreviewMinor',v_commission,
    'taxMinor',NULL,'totalMinorBeforeTax',v_total,
    'checkoutReady',cardinality(v_blockers)=0,'blockers',to_jsonb(v_blockers),
    'createdAt',v_created_at,'expiresAt',v_expires_at,'status','informational'
  );
END $quote$;

CREATE OR REPLACE FUNCTION public.create_marketplace_service_booking(
  p_buyer_id uuid,
  p_listing_id uuid,
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_message text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $booking$
DECLARE
  v_listing public.marketplace_listings%ROWTYPE;
  v_seller public.marketplace_seller_profiles%ROWTYPE;
  v_booking public.marketplace_service_bookings%ROWTYPE;
  v_end_at timestamptz;
BEGIN
  IF p_buyer_id IS NULL OR p_listing_id IS NULL THEN RAISE EXCEPTION 'Buyer and service listing are required'; END IF;
  IF p_start_at IS NULL OR p_start_at<now()+interval '15 minutes' THEN RAISE EXCEPTION 'Choose a booking time at least 15 minutes in the future'; END IF;
  IF p_duration_minutes<15 OR p_duration_minutes>480 OR p_duration_minutes%15<>0 THEN
    RAISE EXCEPTION 'Duration must be in 15-minute increments from 15 minutes to 8 hours';
  END IF;
  IF length(coalesce(p_message,''))>1500 THEN RAISE EXCEPTION 'Booking notes cannot exceed 1,500 characters'; END IF;
  SELECT * INTO v_listing FROM public.marketplace_listings WHERE id=p_listing_id AND status='active' AND kind='service';
  IF NOT FOUND OR v_listing.seller_id=p_buyer_id THEN RAISE EXCEPTION 'This service is not available for booking'; END IF;
  SELECT * INTO v_seller FROM public.marketplace_seller_profiles WHERE user_id=v_listing.seller_id;
  IF NOT FOUND OR v_seller.status<>'approved' OR v_seller.identity_status<>'verified' THEN
    RAISE EXCEPTION 'This service provider has not completed seller verification';
  END IF;
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext(v_listing.seller_id::text));
  v_end_at:=p_start_at+(p_duration_minutes*interval '1 minute');
  IF EXISTS (
    SELECT 1 FROM public.marketplace_service_bookings b
    WHERE b.seller_id=v_listing.seller_id
      AND b.status IN ('requested','accepted','in_progress','completed_by_seller')
      AND b.starts_at<v_end_at AND b.ends_at>p_start_at
  ) THEN
    RAISE EXCEPTION 'That appointment time is already requested or booked. Choose another time';
  END IF;
  INSERT INTO public.marketplace_service_bookings(
    listing_id,buyer_id,seller_id,status,starts_at,ends_at,duration_minutes,
    price_minor,currency,buyer_message
  ) VALUES (
    v_listing.id,p_buyer_id,v_listing.seller_id,'requested',p_start_at,v_end_at,
    p_duration_minutes,v_listing.price_minor,v_listing.currency,left(coalesce(p_message,''),1500)
  ) RETURNING * INTO v_booking;
  RETURN jsonb_build_object(
    'id',v_booking.id,'listingId',v_booking.listing_id,'buyerId',v_booking.buyer_id,
    'sellerId',v_booking.seller_id,'status',v_booking.status,'startAt',v_booking.starts_at,
    'endAt',v_booking.ends_at,'durationMinutes',v_booking.duration_minutes,
    'priceMinor',v_booking.price_minor,'currency',v_booking.currency,
    'message',v_booking.buyer_message,'createdAt',v_booking.created_at,'updatedAt',v_booking.updated_at
  );
END $booking$;

CREATE OR REPLACE FUNCTION public.transition_marketplace_service_booking(
  p_booking_id uuid,
  p_actor_id uuid,
  p_next_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $booking_transition$
DECLARE
  v_booking public.marketplace_service_bookings%ROWTYPE;
  v_is_buyer boolean;
  v_is_seller boolean;
  v_allowed boolean:=false;
BEGIN
  SELECT * INTO v_booking FROM public.marketplace_service_bookings
  WHERE id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  v_is_buyer:=v_booking.buyer_id=p_actor_id;
  v_is_seller:=v_booking.seller_id=p_actor_id;
  IF NOT v_is_buyer AND NOT v_is_seller THEN RAISE EXCEPTION 'You are not a participant in this booking'; END IF;
  IF v_booking.status='requested' AND p_next_status IN ('accepted','declined') AND v_is_seller THEN v_allowed:=true; END IF;
  IF v_booking.status='requested' AND p_next_status='cancelled' AND v_is_buyer THEN v_allowed:=true; END IF;
  IF v_booking.status='accepted' AND p_next_status='cancelled' AND v_is_buyer THEN v_allowed:=true; END IF;
  IF v_booking.status='accepted' AND p_next_status='completed_by_seller' AND v_is_seller THEN v_allowed:=true; END IF;
  IF v_booking.status='completed_by_seller' AND p_next_status IN ('completed','disputed') AND v_is_buyer THEN v_allowed:=true; END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'This booking transition is not permitted'; END IF;
  UPDATE public.marketplace_service_bookings
  SET status=p_next_status,
      completion_confirmed_at=CASE WHEN p_next_status='completed' THEN now() ELSE completion_confirmed_at END,
      updated_at=now()
  WHERE id=p_booking_id RETURNING * INTO v_booking;
  RETURN jsonb_build_object(
    'id',v_booking.id,'listingId',v_booking.listing_id,'buyerId',v_booking.buyer_id,
    'sellerId',v_booking.seller_id,'status',v_booking.status,'startAt',v_booking.starts_at,
    'endAt',v_booking.ends_at,'durationMinutes',v_booking.duration_minutes,
    'priceMinor',v_booking.price_minor,'currency',v_booking.currency,
    'message',v_booking.buyer_message,'createdAt',v_booking.created_at,'updatedAt',v_booking.updated_at,
    'completionConfirmedAt',v_booking.completion_confirmed_at
  );
END $booking_transition$;

REVOKE ALL ON FUNCTION public.create_marketplace_checkout_quote(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_checkout_quote(uuid,jsonb,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.create_marketplace_service_booking(uuid,uuid,timestamptz,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_service_booking(uuid,uuid,timestamptz,integer,text) TO service_role;
REVOKE ALL ON FUNCTION public.transition_marketplace_service_booking(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transition_marketplace_service_booking(uuid,uuid,text) TO service_role;

COMMIT;
