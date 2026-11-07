BEGIN;

-- Align the monthly performance bonus review threshold with the current
-- TikTok-style Subscription incentive: 10,000 followers, 100,000 views,
-- and at least three subscriber-only videos in the reviewed month.
ALTER TABLE public.subscription_creator_performance_reviews
  DROP CONSTRAINT IF EXISTS subscription_creator_performance_reviews_check;

ALTER TABLE public.subscription_creator_performance_reviews
  ADD CONSTRAINT subscription_creator_performance_reviews_bonus_eligibility_check
  CHECK (
    NOT bonus_eligible OR (
      follower_count >= 10000
      AND qualifying_video_views >= 100000
      AND subscriber_only_video_count >= 3
    )
  );

COMMIT;