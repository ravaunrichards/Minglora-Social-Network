BEGIN;

-- TikTok-style international subscription sharing:
-- 50% creator base, plus a verified 20 percentage-point monthly performance bonus.
-- The creator's share never falls below 50% or exceeds 70%; all money is
-- accounted for in integer minor units after the payment provider's fees.

ALTER TABLE public.creator_subscriptions
  DROP CONSTRAINT IF EXISTS creator_subscriptions_platform_share_bps_check,
  DROP CONSTRAINT IF EXISTS creator_subscriptions_creator_share_bps_check;
ALTER TABLE public.creator_subscriptions
  ADD CONSTRAINT creator_subscriptions_platform_share_bps_check
    CHECK (platform_share_bps IN (3000,5000)),
  ADD CONSTRAINT creator_subscriptions_creator_share_bps_check
    CHECK (creator_share_bps IN (5000,7000)),
  ADD CONSTRAINT creator_subscriptions_revenue_split_check
    CHECK (creator_share_bps + platform_share_bps = 10000);

ALTER TABLE public.subscription_creator_settings
  ADD COLUMN IF NOT EXISTS performance_bonus_bps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS performance_bonus_month date;
ALTER TABLE public.subscription_creator_settings
  DROP CONSTRAINT IF EXISTS subscription_creator_settings_performance_bonus_bps_check;
ALTER TABLE public.subscription_creator_settings
  ADD CONSTRAINT subscription_creator_settings_performance_bonus_bps_check
    CHECK (performance_bonus_bps IN (0,2000));

ALTER TABLE public.subscription_earnings_ledger
  ADD COLUMN IF NOT EXISTS creator_share_bps integer NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS platform_share_bps integer NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS performance_bonus_bps integer NOT NULL DEFAULT 0;
ALTER TABLE public.subscription_earnings_ledger
  DROP CONSTRAINT IF EXISTS subscription_earnings_ledger_share_check;
ALTER TABLE public.subscription_earnings_ledger
  ADD CONSTRAINT subscription_earnings_ledger_share_check
    CHECK (
      creator_share_bps IN (5000,7000)
      AND platform_share_bps IN (3000,5000)
      AND performance_bonus_bps IN (0,2000)
      AND creator_share_bps + platform_share_bps = 10000
      AND creator_share_bps = 5000 + performance_bonus_bps
    );

CREATE TABLE IF NOT EXISTS public.subscription_creator_performance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_start date NOT NULL,
  follower_count integer NOT NULL CHECK (follower_count >= 0),
  qualifying_video_views bigint NOT NULL CHECK (qualifying_video_views >= 0),
  subscriber_only_video_count integer NOT NULL CHECK (subscriber_only_video_count >= 0),
  bonus_eligible boolean NOT NULL,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewer_note text NOT NULL DEFAULT '' CHECK (length(reviewer_note) <= 1000),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, month_start),
  CHECK (
    NOT bonus_eligible OR (
      follower_count >= 10000
      AND qualifying_video_views >= 1000000
      AND subscriber_only_video_count >= 3
    )
  )
);

CREATE INDEX IF NOT EXISTS subscription_creator_performance_month_idx
  ON public.subscription_creator_performance_reviews(month_start DESC, bonus_eligible);

ALTER TABLE public.subscription_creator_performance_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_creator_performance_reviews FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON public.subscription_creator_performance_reviews TO service_role;

COMMIT;