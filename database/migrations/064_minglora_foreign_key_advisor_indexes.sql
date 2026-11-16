-- Targeted indexes for foreign keys identified by the Supabase performance advisor.
-- These indexes do not change row visibility, data, or financial behavior.

create index if not exists marketplace_application_review_alerts_application_user_id_idx
  on public.marketplace_application_review_alerts (application_user_id);

create index if not exists marketplace_business_identity_submissions_reviewed_by_idx
  on public.marketplace_business_identity_submissions (reviewed_by);

create index if not exists profile_verification_applications_reviewed_by_idx
  on public.profile_verification_applications (reviewed_by);

create index if not exists profile_verification_review_alerts_application_id_idx
  on public.profile_verification_review_alerts (application_id);

create index if not exists profile_verification_review_events_actor_id_idx
  on public.profile_verification_review_events (actor_id);
