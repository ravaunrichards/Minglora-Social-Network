BEGIN;

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS price_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fulfillment_options text[] NOT NULL DEFAULT ARRAY['pickup']::text[],
  ADD COLUMN IF NOT EXISTS service_mode text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS seller_sku text;

DO $$ BEGIN
  ALTER TABLE public.marketplace_listings ADD CONSTRAINT marketplace_listings_kind_check CHECK (kind IN ('product','service'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.marketplace_listings ADD CONSTRAINT marketplace_listings_price_type_check CHECK (price_type IN ('fixed','from','hourly','quote'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.marketplace_listings ADD CONSTRAINT marketplace_listings_quantity_check CHECK (quantity BETWEEN 0 AND 1000000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS marketplace_kind_category_idx ON public.marketplace_listings (kind,category,created_at DESC) WHERE status='active';
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_seller_sku_uq ON public.marketplace_listings (seller_id,lower(seller_sku)) WHERE seller_sku IS NOT NULL AND seller_sku<>'';

CREATE TABLE IF NOT EXISTS public.marketplace_seller_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  seller_type text NOT NULL CHECK (seller_type IN ('individual','business')),
  store_name text NOT NULL CHECK (length(store_name) BETWEEN 2 AND 100),
  description text NOT NULL CHECK (length(description) BETWEEN 20 AND 1000),
  country_code char(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  contact_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  identity_status text NOT NULL DEFAULT 'not_started' CHECK (identity_status IN ('not_started','pending','verified','rejected')),
  payout_status text NOT NULL DEFAULT 'not_connected' CHECK (payout_status IN ('not_connected','pending','verified','restricted')),
  terms_version text NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_seller_review_idx ON public.marketplace_seller_profiles (status,created_at);

CREATE TABLE IF NOT EXISTS public.marketplace_seller_verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.marketplace_seller_profiles(user_id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('submitted','document_requested','document_received','identity_verified','approved','rejected','suspended','reinstated')),
  reason text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_seller_events_idx ON public.marketplace_seller_verification_events (seller_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  currency char(3),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','converted','abandoned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_one_active_cart_per_buyer ON public.marketplace_carts (buyer_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS public.marketplace_cart_items (
  cart_id uuid NOT NULL REFERENCES public.marketplace_carts(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  fulfillment_method text NOT NULL CHECK (fulfillment_method IN ('pickup','local_delivery','shipping')),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cart_id,listing_id)
);

CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','paid','processing','partially_fulfilled','fulfilled','completed','cancelled','disputed','partially_refunded','refunded')),
  payment_status text NOT NULL DEFAULT 'not_started' CHECK (payment_status IN ('not_started','pending','authorized','captured','failed','partially_refunded','refunded','disputed')),
  item_subtotal_minor bigint NOT NULL CHECK (item_subtotal_minor>=0),
  fulfillment_minor bigint NOT NULL DEFAULT 0 CHECK (fulfillment_minor>=0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor>=0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor>=0),
  total_minor bigint NOT NULL CHECK (total_minor>=0),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  billing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS marketplace_orders_buyer_idx ON public.marketplace_orders (buyer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_orders_status_idx ON public.marketplace_orders (status,created_at);

CREATE TABLE IF NOT EXISTS public.marketplace_seller_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES public.marketplace_seller_profiles(user_id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'awaiting_seller' CHECK (status IN ('awaiting_seller','accepted','rejected','processing','ready_for_dispatch','dispatched','delivered','completed','cancelled','disputed')),
  gross_minor bigint NOT NULL CHECK (gross_minor>=0),
  commission_minor bigint NOT NULL DEFAULT 0 CHECK (commission_minor>=0),
  processor_fee_minor bigint NOT NULL DEFAULT 0 CHECK (processor_fee_minor>=0),
  seller_net_minor bigint NOT NULL CHECK (seller_net_minor>=0),
  payout_status text NOT NULL DEFAULT 'not_eligible' CHECK (payout_status IN ('not_eligible','pending','eligible','queued','paid','failed','held')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id,seller_id),
  CHECK (gross_minor=commission_minor+processor_fee_minor+seller_net_minor)
);
CREATE INDEX IF NOT EXISTS marketplace_seller_orders_seller_idx ON public.marketplace_seller_orders (seller_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.marketplace_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_order_id uuid NOT NULL REFERENCES public.marketplace_seller_orders(id) ON DELETE RESTRICT,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES public.marketplace_seller_profiles(user_id) ON DELETE RESTRICT,
  title_snapshot text NOT NULL,
  sku_snapshot text,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor>0),
  line_total_minor bigint NOT NULL CHECK (line_total_minor>0),
  listing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (line_total_minor=unit_price_minor*quantity)
);
CREATE INDEX IF NOT EXISTS marketplace_order_items_seller_idx ON public.marketplace_order_items (seller_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('paypal','other')),
  provider_order_id text,
  provider_capture_id text,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','approved','captured','failed','voided','partially_refunded','refunded')),
  amount_minor bigint NOT NULL CHECK (amount_minor>0),
  currency char(3) NOT NULL,
  failure_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_payment_provider_order_uq ON public.marketplace_payment_attempts (provider,provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_payment_capture_uq ON public.marketplace_payment_attempts (provider,provider_capture_id) WHERE provider_capture_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.marketplace_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received','processing','processed','failed','ignored')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider,provider_event_id)
);

CREATE TABLE IF NOT EXISTS public.marketplace_ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  account_code text NOT NULL CHECK (account_code IN ('processor_clearing','processor_fee_payable','seller_payable','marketplace_commission_revenue','payment_processing_expense','refund_payable','tax_payable')),
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id,account_code,currency)
);
CREATE TABLE IF NOT EXISTS public.marketplace_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('payment_capture','refund','payout','adjustment','chargeback','reversal')),
  source_reference text NOT NULL,
  currency char(3) NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type,source_reference)
);
CREATE TABLE IF NOT EXISTS public.marketplace_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES public.marketplace_journals(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.marketplace_ledger_accounts(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('debit','credit')),
  amount_minor bigint NOT NULL CHECK (amount_minor>0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_ledger_journal_idx ON public.marketplace_ledger_entries (journal_id);
CREATE INDEX IF NOT EXISTS marketplace_ledger_account_idx ON public.marketplace_ledger_entries (account_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.post_marketplace_journal(
  p_order_id uuid,
  p_source_type text,
  p_source_reference text,
  p_currency char(3),
  p_description text,
  p_entries jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_journal_id uuid;
  v_debits numeric:=0;
  v_credits numeric:=0;
  v_entry jsonb;
  v_account_id uuid;
  v_direction text;
  v_amount bigint;
BEGIN
  IF p_entries IS NULL OR jsonb_typeof(p_entries)<>'array' OR jsonb_array_length(p_entries)<2 THEN
    RAISE EXCEPTION 'A journal requires at least two entries';
  END IF;
  INSERT INTO public.marketplace_journals(order_id,source_type,source_reference,currency,description)
  VALUES(p_order_id,p_source_type,p_source_reference,p_currency,p_description)
  RETURNING id INTO v_journal_id;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    v_account_id:=(v_entry->>'account_id')::uuid;
    v_direction:=v_entry->>'direction';
    v_amount:=(v_entry->>'amount_minor')::bigint;
    IF v_direction NOT IN ('debit','credit') OR v_amount<=0 THEN
      RAISE EXCEPTION 'Invalid marketplace journal entry';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.marketplace_ledger_accounts a WHERE a.id=v_account_id AND a.currency=p_currency) THEN
      RAISE EXCEPTION 'Ledger account is missing or has the wrong currency';
    END IF;
    INSERT INTO public.marketplace_ledger_entries(journal_id,account_id,direction,amount_minor)
    VALUES(v_journal_id,v_account_id,v_direction,v_amount);
    IF v_direction='debit' THEN v_debits:=v_debits+v_amount; ELSE v_credits:=v_credits+v_amount; END IF;
  END LOOP;
  IF v_debits<>v_credits THEN RAISE EXCEPTION 'Marketplace journal is not balanced'; END IF;
  RETURN v_journal_id;
END $$;
REVOKE ALL ON FUNCTION public.post_marketplace_journal(uuid,text,text,char,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_marketplace_journal(uuid,text,text,char,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_marketplace_ledger_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $
BEGIN
  RAISE EXCEPTION 'Marketplace ledger entries are immutable; post a reversing journal instead';
END $;
DROP TRIGGER IF EXISTS marketplace_ledger_entries_immutable ON public.marketplace_ledger_entries;
CREATE TRIGGER marketplace_ledger_entries_immutable
BEFORE UPDATE OR DELETE ON public.marketplace_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.prevent_marketplace_ledger_entry_mutation();
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_platform_ledger_account_uq
  ON public.marketplace_ledger_accounts (account_code,currency)
  WHERE owner_user_id IS NULL;

CREATE TABLE IF NOT EXISTS public.marketplace_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_order_id uuid NOT NULL REFERENCES public.marketplace_seller_orders(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('pickup','local_delivery','shipping','digital')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','dispatched','delivered','collected','failed','returned')),
  carrier text NOT NULL DEFAULT '',
  tracking_reference text NOT NULL DEFAULT '',
  tracking_url text NOT NULL DEFAULT '',
  collection_code_hash text,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  proof_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (tracking_url='' OR tracking_url LIKE 'https://%')
);
CREATE INDEX IF NOT EXISTS marketplace_fulfillment_order_idx ON public.marketplace_fulfillments (seller_order_id,created_at);

CREATE TABLE IF NOT EXISTS public.marketplace_service_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','declined','cancelled','in_progress','completed_by_seller','completed','disputed')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  price_minor bigint CHECK (price_minor IS NULL OR price_minor>=0),
  currency char(3) NOT NULL,
  buyer_message text NOT NULL DEFAULT '' CHECK (length(buyer_message)<=1500),
  completion_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at>starts_at),
  CHECK (buyer_id<>seller_id)
);
CREATE INDEX IF NOT EXISTS marketplace_bookings_buyer_idx ON public.marketplace_service_bookings (buyer_id,starts_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_bookings_seller_idx ON public.marketplace_service_bookings (seller_id,starts_at);

CREATE TABLE IF NOT EXISTS public.marketplace_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE RESTRICT,
  seller_order_id uuid REFERENCES public.marketplace_seller_orders(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES public.marketplace_service_bookings(id) ON DELETE RESTRICT,
  opened_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('not_received','damaged','not_as_described','seller_cancelled','service_not_delivered','refund_request','payment_problem','other')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','awaiting_buyer','awaiting_seller','under_review','resolved_buyer','resolved_seller','closed','appealed')),
  requested_refund_minor bigint CHECK (requested_refund_minor IS NULL OR requested_refund_minor>=0),
  resolution text NOT NULL DEFAULT '',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(order_id,seller_order_id,booking_id)=1)
);
CREATE INDEX IF NOT EXISTS marketplace_cases_queue_idx ON public.marketplace_cases (status,created_at);
CREATE TABLE IF NOT EXISTS public.marketplace_case_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.marketplace_cases(id) ON DELETE RESTRICT,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.marketplace_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.marketplace_cases(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES public.marketplace_order_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','authorized','in_transit','received','refund_pending','refunded','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.marketplace_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.marketplace_seller_profiles(user_id) ON DELETE RESTRICT,
  seller_order_id uuid REFERENCES public.marketplace_seller_orders(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_payout_reference text,
  currency char(3) NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor>0),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','paid','failed','returned','held','cancelled')),
  failure_code text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL UNIQUE,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS marketplace_payouts_seller_idx ON public.marketplace_payouts (seller_id,initiated_at DESC);
CREATE TABLE IF NOT EXISTS public.marketplace_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES public.marketplace_service_bookings(id) ON DELETE RESTRICT,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES public.marketplace_seller_profiles(user_id) ON DELETE RESTRICT,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review text NOT NULL DEFAULT '' CHECK (length(review)<=2000),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(order_id,booking_id)=1)
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_order_review_once ON public.marketplace_reviews (order_id,reviewer_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_booking_review_once ON public.marketplace_reviews (booking_id,reviewer_id) WHERE booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.marketplace_job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  company_name text NOT NULL CHECK (length(company_name) BETWEEN 2 AND 120),
  title text NOT NULL CHECK (length(title) BETWEEN 5 AND 120),
  description text NOT NULL CHECK (length(description) BETWEEN 50 AND 6000),
  category text NOT NULL,
  employment_type text NOT NULL CHECK (employment_type IN ('full_time','part_time','contract','temporary','internship','freelance')),
  workplace_type text NOT NULL CHECK (workplace_type IN ('onsite','hybrid','remote')),
  location_label text NOT NULL DEFAULT '',
  currency char(3) NOT NULL DEFAULT 'JMD',
  salary_min_minor bigint CHECK (salary_min_minor IS NULL OR salary_min_minor>=0),
  salary_max_minor bigint CHECK (salary_max_minor IS NULL OR salary_max_minor>=0),
  application_deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','open','paused','closed','filled','rejected')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (salary_min_minor IS NULL OR salary_max_minor IS NULL OR salary_max_minor>=salary_min_minor),
  CHECK (workplace_type='remote' OR length(location_label)>=2)
);
CREATE INDEX IF NOT EXISTS marketplace_jobs_public_idx ON public.marketplace_job_postings (category,location_label,created_at DESC) WHERE status='open';
CREATE TABLE IF NOT EXISTS public.marketplace_job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.marketplace_job_postings(id) ON DELETE RESTRICT,
  applicant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed','shortlisted','rejected','hired','withdrawn')),
  cover_letter text NOT NULL CHECK (length(cover_letter) BETWEEN 30 AND 5000),
  resume_asset_id uuid REFERENCES public.media_assets(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id,applicant_id)
);
CREATE INDEX IF NOT EXISTS marketplace_job_applications_employer_idx ON public.marketplace_job_applications (job_id,status,created_at DESC);

ALTER TABLE public.marketplace_seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_seller_verification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_seller_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_service_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_case_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketplace_seller_profiles_read ON public.marketplace_seller_profiles FOR SELECT TO authenticated USING (user_id=(select auth.uid()) OR status='approved');
CREATE POLICY marketplace_seller_profiles_apply ON public.marketplace_seller_profiles FOR INSERT TO authenticated WITH CHECK (user_id=(select auth.uid()) AND status='pending' AND identity_status='not_started' AND payout_status='not_connected');
CREATE POLICY marketplace_seller_events_read ON public.marketplace_seller_verification_events FOR SELECT TO authenticated USING (seller_id=(select auth.uid()));
CREATE POLICY marketplace_carts_owner_read ON public.marketplace_carts FOR SELECT TO authenticated USING (buyer_id=(select auth.uid()));
CREATE POLICY marketplace_cart_items_owner_read ON public.marketplace_cart_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.marketplace_carts c WHERE c.id=cart_id AND c.buyer_id=(select auth.uid())));
CREATE POLICY marketplace_orders_participant_read ON public.marketplace_orders FOR SELECT TO authenticated USING (
 buyer_id=(select auth.uid()) OR EXISTS (SELECT 1 FROM public.marketplace_seller_orders so WHERE so.order_id=marketplace_orders.id AND so.seller_id=(select auth.uid()))
);
CREATE POLICY marketplace_seller_orders_participant_read ON public.marketplace_seller_orders FOR SELECT TO authenticated USING (
 seller_id=(select auth.uid()) OR EXISTS (SELECT 1 FROM public.marketplace_orders o WHERE o.id=order_id AND o.buyer_id=(select auth.uid()))
);
CREATE POLICY marketplace_order_items_participant_read ON public.marketplace_order_items FOR SELECT TO authenticated USING (
 seller_id=(select auth.uid()) OR EXISTS (SELECT 1 FROM public.marketplace_seller_orders so JOIN public.marketplace_orders o ON o.id=so.order_id WHERE so.id=seller_order_id AND o.buyer_id=(select auth.uid()))
);
CREATE POLICY marketplace_fulfillments_participant_read ON public.marketplace_fulfillments FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.marketplace_seller_orders so JOIN public.marketplace_orders o ON o.id=so.order_id WHERE so.id=seller_order_id AND (so.seller_id=(select auth.uid()) OR o.buyer_id=(select auth.uid())))
);
CREATE POLICY marketplace_bookings_participant_read ON public.marketplace_service_bookings FOR SELECT TO authenticated USING (buyer_id=(select auth.uid()) OR seller_id=(select auth.uid()));
CREATE POLICY marketplace_cases_participant_read ON public.marketplace_cases FOR SELECT TO authenticated USING (
 opened_by=(select auth.uid())
 OR EXISTS (SELECT 1 FROM public.marketplace_orders o WHERE o.id=order_id AND o.buyer_id=(select auth.uid()))
 OR EXISTS (SELECT 1 FROM public.marketplace_seller_orders so WHERE so.id=seller_order_id AND so.seller_id=(select auth.uid()))
 OR EXISTS (SELECT 1 FROM public.marketplace_service_bookings b WHERE b.id=booking_id AND (b.buyer_id=(select auth.uid()) OR b.seller_id=(select auth.uid())))
);
CREATE POLICY marketplace_case_messages_participant_read ON public.marketplace_case_messages FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.marketplace_cases c WHERE c.id=case_id AND (
  c.opened_by=(select auth.uid())
  OR EXISTS (SELECT 1 FROM public.marketplace_orders o WHERE o.id=c.order_id AND o.buyer_id=(select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.marketplace_seller_orders so WHERE so.id=c.seller_order_id AND so.seller_id=(select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.marketplace_service_bookings b WHERE b.id=c.booking_id AND (b.buyer_id=(select auth.uid()) OR b.seller_id=(select auth.uid())))
 ))
);
CREATE POLICY marketplace_payouts_seller_read ON public.marketplace_payouts FOR SELECT TO authenticated USING (seller_id=(select auth.uid()));
CREATE POLICY marketplace_reviews_public_read ON public.marketplace_reviews FOR SELECT TO anon,authenticated USING (status='published');
CREATE POLICY marketplace_reviews_verified_insert ON public.marketplace_reviews FOR INSERT TO authenticated WITH CHECK (
 reviewer_id=(select auth.uid()) AND (
  (order_id IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.marketplace_orders o JOIN public.marketplace_seller_orders so ON so.order_id=o.id
   WHERE o.id=order_id AND o.buyer_id=(select auth.uid()) AND so.seller_id=marketplace_reviews.seller_id AND o.status='completed'
  )) OR
  (booking_id IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.marketplace_service_bookings b
   WHERE b.id=booking_id AND b.buyer_id=(select auth.uid()) AND b.seller_id=marketplace_reviews.seller_id AND b.status='completed'
  ))
 )
);
CREATE POLICY marketplace_jobs_read ON public.marketplace_job_postings FOR SELECT TO anon,authenticated USING ((status='open' AND application_deadline>now()) OR employer_id=(select auth.uid()));
CREATE POLICY marketplace_jobs_insert_self ON public.marketplace_job_postings FOR INSERT TO authenticated WITH CHECK (employer_id=(select auth.uid()) AND status='pending_review');
CREATE POLICY marketplace_job_applications_read ON public.marketplace_job_applications FOR SELECT TO authenticated USING (
 applicant_id=(select auth.uid()) OR EXISTS (SELECT 1 FROM public.marketplace_job_postings j WHERE j.id=job_id AND j.employer_id=(select auth.uid()))
);
CREATE POLICY marketplace_job_applications_insert_self ON public.marketplace_job_applications FOR INSERT TO authenticated WITH CHECK (
 applicant_id=(select auth.uid()) AND EXISTS (SELECT 1 FROM public.marketplace_job_postings j WHERE j.id=job_id AND j.status='open' AND j.application_deadline>now() AND j.employer_id<>(select auth.uid()))
);
CREATE POLICY marketplace_job_applications_withdraw_self ON public.marketplace_job_applications FOR UPDATE TO authenticated USING (applicant_id=(select auth.uid())) WITH CHECK (applicant_id=(select auth.uid()) AND status='withdrawn');

REVOKE ALL ON public.marketplace_seller_verification_events,public.marketplace_payment_attempts,public.marketplace_webhook_events,public.marketplace_ledger_accounts,public.marketplace_journals,public.marketplace_ledger_entries,public.marketplace_returns FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.marketplace_orders,public.marketplace_seller_orders,public.marketplace_order_items,public.marketplace_fulfillments,public.marketplace_service_bookings,public.marketplace_cases,public.marketplace_case_messages,public.marketplace_payouts,public.marketplace_seller_profiles FROM anon,authenticated;
GRANT SELECT ON public.marketplace_seller_profiles,public.marketplace_carts,public.marketplace_cart_items,public.marketplace_orders,public.marketplace_seller_orders,public.marketplace_order_items,public.marketplace_fulfillments,public.marketplace_service_bookings,public.marketplace_cases,public.marketplace_case_messages,public.marketplace_payouts,public.marketplace_reviews,public.marketplace_job_postings,public.marketplace_job_applications TO authenticated;
GRANT SELECT ON public.marketplace_reviews,public.marketplace_job_postings TO anon;
GRANT INSERT ON public.marketplace_seller_profiles,public.marketplace_reviews,public.marketplace_job_postings,public.marketplace_job_applications TO authenticated;
GRANT UPDATE(status) ON public.marketplace_job_applications TO authenticated;
GRANT ALL ON public.marketplace_seller_profiles,public.marketplace_seller_verification_events,public.marketplace_carts,public.marketplace_cart_items,public.marketplace_orders,public.marketplace_seller_orders,public.marketplace_order_items,public.marketplace_payment_attempts,public.marketplace_webhook_events,public.marketplace_ledger_accounts,public.marketplace_journals,public.marketplace_ledger_entries,public.marketplace_fulfillments,public.marketplace_service_bookings,public.marketplace_cases,public.marketplace_case_messages,public.marketplace_returns,public.marketplace_payouts,public.marketplace_reviews,public.marketplace_job_postings,public.marketplace_job_applications TO service_role;

COMMENT ON TABLE public.marketplace_orders IS 'Marketplace order header; trusted commerce code alone may create or advance payment state.';
COMMENT ON TABLE public.marketplace_ledger_entries IS 'Append-only double-entry commerce ledger. Never update or delete posted entries.';
COMMENT ON TABLE public.marketplace_payment_attempts IS 'Provider transaction evidence. Browser redirects are not payment proof.';
COMMENT ON TABLE public.marketplace_job_postings IS 'Employer vacancies; public publication requires moderation review.';
COMMENT ON TABLE public.marketplace_job_applications IS 'Candidate applications, visible to applicant and posting employer under RLS.';

COMMIT;
