BEGIN;
CREATE TABLE IF NOT EXISTS public.subscription_creator_settings (
 creator_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 application_status text NOT NULL DEFAULT 'not_applied' CHECK (application_status IN ('not_applied','pending','approved','rejected','suspended')),
 subscriptions_enabled boolean NOT NULL DEFAULT false,
 subscriber_badge_enabled boolean NOT NULL DEFAULT true,
 subscriber_chat_enabled boolean NOT NULL DEFAULT false,
 subscriber_only_live_enabled boolean NOT NULL DEFAULT true,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 rejection_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (NOT subscriptions_enabled OR application_status = 'approved')
);
CREATE TABLE IF NOT EXISTS public.subscription_tiers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL DEFAULT 'Monthly membership' CHECK (length(btrim(name)) BETWEEN 2 AND 48),
 description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
 currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
 price_minor integer NOT NULL CHECK (price_minor BETWEEN 100 AND 1000000),
 billing_interval text NOT NULL DEFAULT 'month' CHECK (billing_interval = 'month'),
 benefits jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(benefits) = 'array'),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, creator_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_tiers_one_active_per_creator ON public.subscription_tiers(creator_id) WHERE is_active;
CREATE TABLE IF NOT EXISTS public.creator_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 subscriber_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 tier_id uuid NOT NULL,
 status text NOT NULL CHECK (status IN ('incomplete','active','past_due','canceled','expired','refunded')),
 currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
 amount_minor integer NOT NULL CHECK (amount_minor > 0),
 platform_share_bps integer NOT NULL DEFAULT 5000 CHECK (platform_share_bps = 5000),
 creator_share_bps integer NOT NULL DEFAULT 5000 CHECK (creator_share_bps = 5000),
 provider text NOT NULL CHECK (provider = 'paypal'),
 provider_customer_id text,
 provider_subscription_id text,
 current_period_start timestamptz,
 current_period_end timestamptz,
 cancel_at_period_end boolean NOT NULL DEFAULT false,
 canceled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (creator_id <> subscriber_id),
 FOREIGN KEY (tier_id, creator_id) REFERENCES public.subscription_tiers(id, creator_id),
 UNIQUE (provider, provider_subscription_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS creator_subscriptions_one_live_per_pair ON public.creator_subscriptions(creator_id,subscriber_id) WHERE status IN ('incomplete','active','past_due');
CREATE TABLE IF NOT EXISTS public.subscription_payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL CHECK (provider = 'paypal'),
 provider_event_id text NOT NULL,
 provider_subscription_id text,
 subscription_id uuid REFERENCES public.creator_subscriptions(id) ON DELETE SET NULL,
 event_type text NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 processed_at timestamptz,
 processing_error text,
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_event_id)
);
CREATE TABLE IF NOT EXISTS public.subscription_earnings_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subscription_id uuid NOT NULL REFERENCES public.creator_subscriptions(id) ON DELETE RESTRICT,
 payment_event_id uuid REFERENCES public.subscription_payment_events(id) ON DELETE SET NULL,
 creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 subscriber_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
 gross_minor integer NOT NULL CHECK (gross_minor > 0),
 creator_minor integer NOT NULL CHECK (creator_minor >= 0),
 platform_minor integer NOT NULL CHECK (platform_minor >= 0),
 entry_type text NOT NULL CHECK (entry_type IN ('payment','refund','adjustment')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (creator_minor + platform_minor = gross_minor)
);
CREATE INDEX IF NOT EXISTS subscription_ledger_creator_date ON public.subscription_earnings_ledger(creator_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.subscription_content_access (
 content_id uuid PRIMARY KEY,
 creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 access_level text NOT NULL DEFAULT 'subscribers' CHECK (access_level IN ('public','subscribers')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.minglora_has_active_subscription(p_creator_id uuid,p_subscriber_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE AS $active$
 SELECT EXISTS(SELECT 1 FROM public.creator_subscriptions s WHERE s.creator_id=p_creator_id AND s.subscriber_id=p_subscriber_id AND s.status='active' AND (s.current_period_end IS NULL OR s.current_period_end>now()));
$active$;
REVOKE ALL ON FUNCTION public.minglora_has_active_subscription(uuid,uuid) FROM PUBLIC, anon, authenticated;
ALTER TABLE public.subscription_creator_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_earnings_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_content_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscription_creator_settings_read ON public.subscription_creator_settings FOR SELECT TO authenticated USING(application_status='approved' OR creator_id=auth.uid());
CREATE POLICY subscription_creator_settings_insert ON public.subscription_creator_settings FOR INSERT TO authenticated WITH CHECK(creator_id=auth.uid());
CREATE POLICY subscription_creator_settings_update ON public.subscription_creator_settings FOR UPDATE TO authenticated USING(creator_id=auth.uid()) WITH CHECK(creator_id=auth.uid());
CREATE POLICY subscription_tiers_read ON public.subscription_tiers FOR SELECT TO authenticated USING(is_active OR creator_id=auth.uid());
CREATE POLICY subscription_tiers_insert ON public.subscription_tiers FOR INSERT TO authenticated WITH CHECK(creator_id=auth.uid());
CREATE POLICY subscription_tiers_update ON public.subscription_tiers FOR UPDATE TO authenticated USING(creator_id=auth.uid()) WITH CHECK(creator_id=auth.uid());
CREATE POLICY creator_subscriptions_read ON public.creator_subscriptions FOR SELECT TO authenticated USING(creator_id=auth.uid() OR subscriber_id=auth.uid());
CREATE POLICY subscription_ledger_read ON public.subscription_earnings_ledger FOR SELECT TO authenticated USING(creator_id=auth.uid());
CREATE POLICY subscription_content_manage ON public.subscription_content_access FOR ALL TO authenticated USING(creator_id=auth.uid()) WITH CHECK(creator_id=auth.uid());
CREATE POLICY subscription_content_read ON public.subscription_content_access FOR SELECT TO authenticated USING(access_level='public' OR creator_id=auth.uid() OR public.minglora_has_active_subscription(creator_id,auth.uid()));
REVOKE ALL ON public.creator_subscriptions,public.subscription_payment_events,public.subscription_earnings_ledger FROM anon,authenticated;
REVOKE ALL ON public.subscription_creator_settings, public.subscription_tiers, public.creator_subscriptions, public.subscription_payment_events, public.subscription_earnings_ledger, public.subscription_content_access FROM anon, authenticated;
GRANT ALL PRIVILEGES ON public.subscription_creator_settings, public.subscription_tiers, public.creator_subscriptions, public.subscription_payment_events, public.subscription_earnings_ledger, public.subscription_content_access TO service_role;
COMMIT;