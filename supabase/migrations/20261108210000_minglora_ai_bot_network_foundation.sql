-- Minglora Personal AI Bots Network — normalized storage foundation.
-- AI identities remain records, never Auth users or public human profiles.
-- Every table is RLS-enabled and granted only to the existing service_role.
-- The current Admin API stays owner/MFA-gated; no user-facing client can access
-- this data through the Supabase Data API.

BEGIN;

CREATE TABLE IF NOT EXISTS public.minglora_ai_bot_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  hybrid_enabled boolean NOT NULL DEFAULT false,
  identity_design_target bigint NOT NULL DEFAULT 8300000000 CHECK (identity_design_target > 0),
  max_concurrent_executions integer NOT NULL DEFAULT 0 CHECK (max_concurrent_executions BETWEEN 0 AND 10000),
  daily_execution_budget integer NOT NULL DEFAULT 0 CHECK (daily_execution_budget BETWEEN 0 AND 1000000),
  automatic_suspension_enabled boolean NOT NULL DEFAULT true,
  emergency_shutdown_at timestamptz,
  emergency_shutdown_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.minglora_ai_bot_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.minglora_ai_bot_categories (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 56),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 600),
  is_builtin boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minglora_ai_bot_categories_id_format
    CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS minglora_ai_bot_categories_name_uq
  ON public.minglora_ai_bot_categories (lower(name));

INSERT INTO public.minglora_ai_bot_categories (id,name,description,is_builtin,sort_order)
VALUES
  ('ai-friends','AI Friends','Clearly identified AI companions and conversational friends.',true,1),
  ('ai-creators','AI Creators','Prepare original posts, creative concepts, captions and media briefs.',true,2),
  ('ai-influencers','AI Influencers','Create disclosed AI creator campaigns and trend commentary; never fake endorsements or engagement.',true,3),
  ('ai-news','AI News','Prepare sourced news summaries for editorial review and publication approval.',true,4),
  ('ai-musicians','AI Musicians','Support music discovery, original music planning and disclosed musical content.',true,5),
  ('ai-entertainers','AI Entertainers','Prepare jokes, quizzes, games and entertainment activities.',true,6),
  ('ai-gamers','AI Gamers','Support gaming communities, game guides, challenges and event planning.',true,7),
  ('ai-community-hosts','AI Community Hosts','Prepare and coordinate community discussions and events.',true,8),
  ('ai-live-hosts','AI Live Hosts','Prepare clearly identified AI-led live show plans; broadcasts require explicit approval.',true,9),
  ('ai-moderators','AI Moderators','Identify possible policy issues and prepare moderation recommendations for human review.',true,10),
  ('ai-support','AI Support','Help members navigate Minglora and prepare support responses for review.',true,11),
  ('ai-educators','AI Educators','Prepare learning activities, explanations and quizzes with source-aware guidance.',true,12),
  ('ai-sports','AI Sports','Prepare sports information, explainers and community discussion prompts.',true,13),
  ('ai-travel','AI Travel','Prepare travel inspiration, destination explainers and itinerary drafts.',true,14),
  ('ai-business','AI Business','Prepare business education, customer-service drafts and small-business resources.',true,15)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.minglora_ai_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  category_id text NOT NULL REFERENCES public.minglora_ai_bot_categories(id) ON DELETE RESTRICT,
  username text NOT NULL UNIQUE
    CHECK (username = lower(username) AND username ~ '^ai_[a-z0-9_]{2,40}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 64),
  bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 600),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 600),
  personality text NOT NULL DEFAULT '' CHECK (char_length(personality) <= 1200),
  interests jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(interests) = 'array'),
  hobbies jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hobbies) = 'array'),
  languages text[] NOT NULL DEFAULT ARRAY['English']::text[],
  knowledge_areas text[] NOT NULL DEFAULT ARRAY[]::text[],
  profile_picture_asset_id uuid,
  disclosure_label text NOT NULL DEFAULT 'AI Bot' CHECK (disclosure_label = 'AI Bot'),
  ai_disclosure_visible boolean NOT NULL DEFAULT true CHECK (ai_disclosure_visible),
  content_disclosure_required boolean NOT NULL DEFAULT true CHECK (content_disclosure_required),
  status text NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('disabled','enabled','paused','suspended')),
  autonomy_mode text NOT NULL DEFAULT 'administrator_controlled'
    CHECK (autonomy_mode IN ('administrator_controlled','human_approval','hybrid')),
  allowed_autonomous_actions text[] NOT NULL DEFAULT ARRAY[]::text[]
    CHECK (allowed_autonomous_actions <@ ARRAY[
      'analytics_read','moderation_flag','draft_content','translate_content','prepare_faq_draft'
    ]::text[]),
  memory_enabled boolean NOT NULL DEFAULT false,
  memory_settings jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(memory_settings) = 'object'),
  administrator_instructions text NOT NULL DEFAULT '' CHECK (char_length(administrator_instructions) <= 4000),
  scheduled_activation_at timestamptz,
  scheduled_deactivation_at timestamptz,
  last_active_at timestamptz,
  last_execution_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_admin_id)
);

CREATE INDEX IF NOT EXISTS minglora_ai_bots_owner_created_idx
  ON public.minglora_ai_bots (owner_admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS minglora_ai_bots_category_status_idx
  ON public.minglora_ai_bots (category_id, status);
CREATE INDEX IF NOT EXISTS minglora_ai_bots_status_active_idx
  ON public.minglora_ai_bots (status, last_active_at DESC);

CREATE TABLE IF NOT EXISTS public.minglora_ai_bot_schedules (
  bot_id uuid PRIMARY KEY,
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  timezone text NOT NULL DEFAULT 'America/Jamaica' CHECK (char_length(timezone) BETWEEN 1 AND 80),
  days_of_week smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7]::smallint[]
    CHECK (
      cardinality(days_of_week) BETWEEN 1 AND 7
      AND days_of_week <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
    ),
  start_time time NOT NULL DEFAULT time '00:00',
  end_time time NOT NULL DEFAULT time '23:59',
  max_tasks_per_day integer NOT NULL DEFAULT 0 CHECK (max_tasks_per_day BETWEEN 0 AND 500),
  scheduled_activation_at timestamptz,
  scheduled_deactivation_at timestamptz,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minglora_ai_bot_schedules_bot_owner_fk
    FOREIGN KEY (bot_id,owner_admin_id)
    REFERENCES public.minglora_ai_bots(id,owner_admin_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS minglora_ai_bot_schedules_due_idx
  ON public.minglora_ai_bot_schedules (enabled, scheduled_activation_at, scheduled_deactivation_at);

CREATE TABLE IF NOT EXISTS public.minglora_ai_bot_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 64),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 600),
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled','disabled','paused')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,owner_admin_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS minglora_ai_bot_teams_owner_name_uq
  ON public.minglora_ai_bot_teams (owner_admin_id,lower(name));

CREATE TABLE IF NOT EXISTS public.minglora_ai_bot_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  team_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minglora_ai_bot_team_members_team_owner_fk
    FOREIGN KEY (team_id,owner_admin_id)
    REFERENCES public.minglora_ai_bot_teams(id,owner_admin_id) ON DELETE CASCADE,
  CONSTRAINT minglora_ai_bot_team_members_bot_owner_fk
    FOREIGN KEY (bot_id,owner_admin_id)
    REFERENCES public.minglora_ai_bots(id,owner_admin_id) ON DELETE CASCADE,
  UNIQUE (team_id,bot_id)
);

CREATE INDEX IF NOT EXISTS minglora_ai_bot_team_members_bot_idx
  ON public.minglora_ai_bot_team_members (bot_id);

CREATE TABLE IF NOT EXISTS public.minglora_ai_bot_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  bot_id uuid NOT NULL,
  task_type text NOT NULL CHECK (task_type IN (
    'assistant_request','draft_post','share_media','create_reel','draft_comment','draft_reply',
    'follow','unfollow','react','join_group','send_message','event_participation',
    'customer_service_draft','support_draft','moderation_review','analytics_report',
    'automation_request','community_event_draft','live_show_plan','translation','other'
  )),
  instruction text NOT NULL CHECK (char_length(instruction) BETWEEN 5 AND 4000),
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  request_source text NOT NULL DEFAULT 'administrator'
    CHECK (request_source IN ('administrator','schedule','system')),
  status text NOT NULL DEFAULT 'awaiting_administrator_approval'
    CHECK (status IN (
      'awaiting_administrator_approval','approved_waiting_for_worker','running',
      'completed','failed','cancelled','rejected'
    )),
  high_impact boolean NOT NULL DEFAULT true,
  approval_required boolean NOT NULL DEFAULT true CHECK (approval_required),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  execution_started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text CHECK (error_message IS NULL OR char_length(error_message) <= 500),
  idempotency_key uuid,
  exclude_from_human_engagement_metrics boolean NOT NULL DEFAULT true
    CHECK (exclude_from_human_engagement_metrics),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minglora_ai_bot_tasks_bot_owner_fk
    FOREIGN KEY (bot_id,owner_admin_id)
    REFERENCES public.minglora_ai_bots(id,owner_admin_id) ON DELETE CASCADE,
  UNIQUE (bot_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS minglora_ai_bot_tasks_queue_idx
  ON public.minglora_ai_bot_tasks (status,created_at)
  WHERE status IN ('awaiting_administrator_approval','approved_waiting_for_worker');
CREATE INDEX IF NOT EXISTS minglora_ai_bot_tasks_bot_created_idx
  ON public.minglora_ai_bot_tasks (bot_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.minglora_ai_bot_follow_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_visibility_snapshot text NOT NULL DEFAULT 'unknown'
    CHECK (target_visibility_snapshot IN ('public','friends','private','unknown')),
  approval_required boolean NOT NULL DEFAULT true,
  target_approved_at timestamptz,
  excluded boolean NOT NULL DEFAULT false,
  exclusion_reason text NOT NULL DEFAULT '' CHECK (char_length(exclusion_reason) <= 300),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 600),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_admin_id,target_user_id),
  CHECK (NOT excluded OR approval_required)
);

CREATE TABLE IF NOT EXISTS public.minglora_ai_bot_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  bot_id uuid NOT NULL,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','active','rejected','unfollowed','blocked','excluded')),
  target_approval_required boolean NOT NULL DEFAULT true,
  target_approved_at timestamptz,
  exclude_from_human_follow_counts boolean NOT NULL DEFAULT true
    CHECK (exclude_from_human_follow_counts),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minglora_ai_bot_follows_bot_owner_fk
    FOREIGN KEY (bot_id,owner_admin_id)
    REFERENCES public.minglora_ai_bots(id,owner_admin_id) ON DELETE CASCADE,
  CONSTRAINT minglora_ai_bot_follows_approval_guard
    CHECK (status <> 'active' OR NOT target_approval_required OR target_approved_at IS NOT NULL),
  UNIQUE (bot_id,target_user_id)
);

CREATE INDEX IF NOT EXISTS minglora_ai_bot_follows_target_idx
  ON public.minglora_ai_bot_follows (target_user_id,status);
CREATE INDEX IF NOT EXISTS minglora_ai_bot_follows_bot_idx
  ON public.minglora_ai_bot_follows (bot_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.minglora_ai_bot_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  bot_id uuid NOT NULL,
  follower_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','removed')),
  exclude_from_human_follow_counts boolean NOT NULL DEFAULT true
    CHECK (exclude_from_human_follow_counts),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minglora_ai_bot_followers_bot_owner_fk
    FOREIGN KEY (bot_id,owner_admin_id)
    REFERENCES public.minglora_ai_bots(id,owner_admin_id) ON DELETE CASCADE,
  UNIQUE (bot_id,follower_user_id)
);

CREATE TABLE IF NOT EXISTS public.minglora_ai_bot_follow_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 300),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_admin_id,target_user_id)
);

CREATE TABLE IF NOT EXISTS public.minglora_ai_bot_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  bot_id uuid,
  team_id uuid,
  action text NOT NULL CHECK (char_length(action) BETWEEN 2 AND 100),
  target_type text NOT NULL CHECK (char_length(target_type) BETWEEN 2 AND 60),
  target_id text,
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 1000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minglora_ai_bot_audit_bot_fk
    FOREIGN KEY (bot_id)
    REFERENCES public.minglora_ai_bots(id) ON DELETE SET NULL,
  CONSTRAINT minglora_ai_bot_audit_team_fk
    FOREIGN KEY (team_id)
    REFERENCES public.minglora_ai_bot_teams(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS minglora_ai_bot_audit_owner_created_idx
  ON public.minglora_ai_bot_audit (owner_admin_id,created_at DESC);
CREATE INDEX IF NOT EXISTS minglora_ai_bot_audit_bot_created_idx
  ON public.minglora_ai_bot_audit (bot_id,created_at DESC);

COMMENT ON TABLE public.minglora_ai_bots IS
  'AI-only Minglora identities. Rows are not Auth users and must never be inserted into profiles, user_follows, or human engagement totals.';
COMMENT ON TABLE public.minglora_ai_bot_follows IS
  'AI bot following relationships are deliberately separate from public.user_follows and must be excluded from human popularity metrics.';
COMMENT ON TABLE public.minglora_ai_bot_followers IS
  'Human-to-AI-bot follows are stored separately from public.user_follows and are not human member follower counts.';
COMMENT ON TABLE public.minglora_ai_bot_tasks IS
  'Queued instructions only. No row implies a social action executed; a worker must re-check authorization, privacy, blocks and rate limits.';


-- Canonical AI identity contract. These rows are independent of human Auth users
-- and the legacy JSONB runtime-state representation. The bot control plane may
-- reference a human owner, but an AI identity is never an auth.users row.
CREATE TABLE IF NOT EXISTS public.ai_identities (
  identity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  population text NOT NULL CHECK (population IN ('independent','organizational','specialized_service')),
  identity_type text NOT NULL DEFAULT 'social_personality' CHECK (char_length(identity_type) BETWEEN 2 AND 80),
  category_id text REFERENCES public.minglora_ai_bot_categories(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'created' CHECK (status IN (
    'proposed','created','under_review','approved','active','restricted','suspended','archived','retired'
  )),
  parent_identity_id uuid REFERENCES public.ai_identities(identity_id) ON DELETE SET NULL,
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_system text NOT NULL DEFAULT 'minglora' CHECK (char_length(source_system) BETWEEN 2 AND 40),
  source_identity_id uuid,
  public_profile_slug text NOT NULL UNIQUE CHECK (public_profile_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*
-- The existing Minglora server-to-Supabase runtime gateway uses service_role.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'minglora_ai_bot_settings',
    'minglora_ai_bot_categories',
    'minglora_ai_bots',
    'minglora_ai_bot_schedules',
    'minglora_ai_bot_teams',
    'minglora_ai_bot_team_members',
    'minglora_ai_bot_tasks',
    'minglora_ai_bot_follow_targets',
    'minglora_ai_bot_follows',
    'minglora_ai_bot_followers',
    'minglora_ai_bot_follow_exclusions',
    'minglora_ai_bot_audit',
    'ai_identities','ai_names','ai_profiles','ai_emails','ai_provider_accounts',
    'ai_provider_models','ai_provider_assignments','ai_identity_locations','ai_identity_languages',
    'ai_identity_capabilities','ai_identity_permissions','ai_identity_owners',
    'ai_identity_status_history','ai_identity_versions','ai_identity_audit_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;

COMMIT;
),
  public_profile_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_admin_id,source_system,source_identity_id)
);
CREATE INDEX IF NOT EXISTS ai_identities_owner_status_created_idx
  ON public.ai_identities (owner_admin_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_identities_population_status_idx
  ON public.ai_identities (population,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_identities_category_status_idx
  ON public.ai_identities (category_id,status);

CREATE TABLE IF NOT EXISTS public.ai_names (
  identity_id uuid PRIMARY KEY REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  first_name text NOT NULL CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 80),
  last_name text NOT NULL CHECK (char_length(btrim(last_name)) BETWEEN 1 AND 80),
  middle_name text NOT NULL DEFAULT '' CHECK (char_length(middle_name) <= 80),
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 180),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 120),
  username text NOT NULL UNIQUE CHECK (username = lower(username) AND username ~ '^ai_[a-z0-9_]{2,40}
-- The existing Minglora server-to-Supabase runtime gateway uses service_role.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'minglora_ai_bot_settings',
    'minglora_ai_bot_categories',
    'minglora_ai_bots',
    'minglora_ai_bot_schedules',
    'minglora_ai_bot_teams',
    'minglora_ai_bot_team_members',
    'minglora_ai_bot_tasks',
    'minglora_ai_bot_follow_targets',
    'minglora_ai_bot_follows',
    'minglora_ai_bot_followers',
    'minglora_ai_bot_follow_exclusions',
    'minglora_ai_bot_audit'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;

COMMIT;
),
  public_profile_url text NOT NULL UNIQUE CHECK (char_length(public_profile_url) <= 300),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_names_first_last_idx ON public.ai_names (lower(last_name),lower(first_name));

CREATE TABLE IF NOT EXISTS public.ai_profiles (
  identity_id uuid PRIMARY KEY REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  biography text NOT NULL DEFAULT '' CHECK (char_length(biography) <= 4000),
  introduction text NOT NULL DEFAULT '' CHECK (char_length(introduction) <= 2000),
  gender text NOT NULL DEFAULT 'prefer_not_to_specify'
    CHECK (gender IN ('female','male','non_binary','other','prefer_not_to_specify')),
  gender_presentation text NOT NULL DEFAULT '' CHECK (char_length(gender_presentation) <= 80),
  nationality text NOT NULL DEFAULT '',
  country_of_origin text NOT NULL DEFAULT '',
  current_country text NOT NULL DEFAULT '',
  time_zone text NOT NULL DEFAULT 'UTC' CHECK (char_length(time_zone) BETWEEN 1 AND 80),
  personality text NOT NULL DEFAULT '' CHECK (char_length(personality) <= 4000),
  communication_style text NOT NULL DEFAULT '' CHECK (char_length(communication_style) <= 2000),
  interests jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(interests) = 'array'),
  hobbies jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hobbies) = 'array'),
  education jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(education) = 'array'),
  profession text NOT NULL DEFAULT '',
  skills jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(skills) = 'array'),
  avatar_storage_reference text,
  cover_storage_reference text,
  voice_preferences jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(voice_preferences) = 'object'),
  avatar_preferences jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(avatar_preferences) = 'object'),
  memory_enabled boolean NOT NULL DEFAULT false,
  memory_configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(memory_configuration) = 'object'),
  ai_disclosure_visible boolean NOT NULL DEFAULT true CHECK (ai_disclosure_visible),
  fictional_identity boolean NOT NULL DEFAULT true CHECK (fictional_identity),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','friends','private')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  email_address text NOT NULL CHECK (char_length(email_address) BETWEEN 3 AND 320),
  email_type text NOT NULL DEFAULT 'primary' CHECK (email_type IN ('primary','recovery','notification','other')),
  is_primary boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'not_verified'
    CHECK (verification_status IN ('not_verified','pending','verified','failed','revoked')),
  email_provider text NOT NULL DEFAULT '',
  provisioning_status text NOT NULL DEFAULT 'not_provisioned'
    CHECK (provisioning_status IN ('not_provisioned','requested','provisioned','failed','revoked')),
  provider_reference text,
  management_reference text,
  last_verified_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_emails_address_ci_uq ON public.ai_emails (lower(email_address));
CREATE UNIQUE INDEX IF NOT EXISTS ai_emails_one_primary_per_identity_uq
  ON public.ai_emails (identity_id) WHERE is_primary AND status = 'active';
CREATE INDEX IF NOT EXISTS ai_emails_identity_status_idx ON public.ai_emails (identity_id,status);

CREATE TABLE IF NOT EXISTS public.ai_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  provider_name text NOT NULL CHECK (char_length(provider_name) BETWEEN 2 AND 80),
  provider_identifier text NOT NULL CHECK (char_length(provider_identifier) BETWEEN 2 AND 120),
  provider_account_reference text NOT NULL DEFAULT '',
  provider_configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_configuration) = 'object'),
  credential_secret_reference text,
  account_status text NOT NULL DEFAULT 'configured'
    CHECK (account_status IN ('configured','active','restricted','disabled','revoked','error')),
  provider_health_status text NOT NULL DEFAULT 'unknown'
    CHECK (provider_health_status IN ('unknown','healthy','degraded','unavailable','error')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id,provider_identifier,provider_account_reference)
);
COMMENT ON COLUMN public.ai_provider_accounts.credential_secret_reference IS
  'Reference to a server-side secret manager entry only. Never store raw API keys, tokens or passwords here.';

CREATE TABLE IF NOT EXISTS public.ai_provider_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id uuid REFERENCES public.ai_provider_accounts(id) ON DELETE SET NULL,
  provider_name text NOT NULL CHECK (char_length(provider_name) BETWEEN 2 AND 80),
  model_name text NOT NULL CHECK (char_length(model_name) BETWEEN 1 AND 160),
  model_identifier text NOT NULL CHECK (char_length(model_identifier) BETWEEN 1 AND 200),
  model_version text NOT NULL DEFAULT '',
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(capabilities) = 'object'),
  supported_languages text[] NOT NULL DEFAULT ARRAY[]::text[],
  text_capable boolean NOT NULL DEFAULT true,
  image_capable boolean NOT NULL DEFAULT false,
  audio_capable boolean NOT NULL DEFAULT false,
  video_capable boolean NOT NULL DEFAULT false,
  voice_capable boolean NOT NULL DEFAULT false,
  tool_permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  assignment_status text NOT NULL DEFAULT 'available'
    CHECK (assignment_status IN ('available','restricted','disabled','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_name,model_identifier,model_version)
);
CREATE INDEX IF NOT EXISTS ai_provider_models_provider_idx
  ON public.ai_provider_models (provider_name,assignment_status);

CREATE TABLE IF NOT EXISTS public.ai_provider_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  provider_account_id uuid REFERENCES public.ai_provider_accounts(id) ON DELETE SET NULL,
  model_id uuid NOT NULL REFERENCES public.ai_provider_models(id) ON DELETE RESTRICT,
  fallback_assignment_id uuid REFERENCES public.ai_provider_assignments(id) ON DELETE SET NULL,
  routing_priority smallint NOT NULL DEFAULT 100 CHECK (routing_priority BETWEEN 1 AND 1000),
  is_primary boolean NOT NULL DEFAULT false,
  capability_overrides jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(capability_overrides) = 'object'),
  tool_permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  assignment_status text NOT NULL DEFAULT 'configured'
    CHECK (assignment_status IN ('configured','active','restricted','disabled','error')),
  provider_health_status text NOT NULL DEFAULT 'unknown'
    CHECK (provider_health_status IN ('unknown','healthy','degraded','unavailable','error')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_provider_assignments_identity_priority_idx
  ON public.ai_provider_assignments (identity_id,assignment_status,routing_priority);
CREATE UNIQUE INDEX IF NOT EXISTS ai_provider_assignments_one_primary_uq
  ON public.ai_provider_assignments (identity_id) WHERE is_primary AND assignment_status = 'active';

CREATE TABLE IF NOT EXISTS public.ai_identity_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  location_type text NOT NULL CHECK (location_type IN ('origin','current','operating','registered')),
  country_code text NOT NULL DEFAULT '' CHECK (country_code = '' OR country_code ~ '^[A-Z]{2}
-- The existing Minglora server-to-Supabase runtime gateway uses service_role.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'minglora_ai_bot_settings',
    'minglora_ai_bot_categories',
    'minglora_ai_bots',
    'minglora_ai_bot_schedules',
    'minglora_ai_bot_teams',
    'minglora_ai_bot_team_members',
    'minglora_ai_bot_tasks',
    'minglora_ai_bot_follow_targets',
    'minglora_ai_bot_follows',
    'minglora_ai_bot_followers',
    'minglora_ai_bot_follow_exclusions',
    'minglora_ai_bot_audit'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;

COMMIT;
),
  country_name text NOT NULL DEFAULT '',
  state_province text NOT NULL DEFAULT '',
  parish_county text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  town text NOT NULL DEFAULT '',
  time_zone text NOT NULL DEFAULT 'UTC',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id,location_type)
);
CREATE INDEX IF NOT EXISTS ai_identity_locations_country_region_idx
  ON public.ai_identity_locations (country_code,state_province,parish_county,city);

CREATE TABLE IF NOT EXISTS public.ai_identity_languages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  language_code text NOT NULL CHECK (char_length(language_code) BETWEEN 2 AND 20),
  language_name text NOT NULL DEFAULT '',
  dialect text NOT NULL DEFAULT '',
  proficiency text NOT NULL DEFAULT 'fluent'
    CHECK (proficiency IN ('native','fluent','advanced','intermediate','basic')),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id,language_code,dialect)
);
CREATE INDEX IF NOT EXISTS ai_identity_languages_search_idx
  ON public.ai_identity_languages (language_code,dialect,identity_id);

CREATE TABLE IF NOT EXISTS public.ai_identity_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  capability_code text NOT NULL CHECK (char_length(capability_code) BETWEEN 2 AND 100),
  enabled boolean NOT NULL DEFAULT false,
  capability_configuration jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(capability_configuration) = 'object'),
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','verified','degraded','unavailable')),
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id,capability_code)
);

CREATE TABLE IF NOT EXISTS public.ai_identity_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  permission_code text NOT NULL CHECK (char_length(permission_code) BETWEEN 2 AND 120),
  resource_scope text NOT NULL DEFAULT 'self' CHECK (char_length(resource_scope) <= 240),
  allowed boolean NOT NULL DEFAULT false,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id,permission_code,resource_scope)
);
CREATE INDEX IF NOT EXISTS ai_identity_permissions_identity_allowed_idx
  ON public.ai_identity_permissions (identity_id,allowed);

CREATE TABLE IF NOT EXISTS public.ai_identity_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  owner_type text NOT NULL CHECK (owner_type IN ('human_admin','organization_identity')),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  owner_identity_id uuid REFERENCES public.ai_identities(identity_id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (owner_type = 'human_admin' AND owner_user_id IS NOT NULL AND owner_identity_id IS NULL)
    OR
    (owner_type = 'organization_identity' AND owner_user_id IS NULL AND owner_identity_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_identity_owners_human_owner_uq
  ON public.ai_identity_owners (identity_id,owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_identity_owners_owner_identity_idx
  ON public.ai_identity_owners (owner_identity_id) WHERE owner_identity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_identity_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL CHECK (new_status IN (
    'proposed','created','under_review','approved','active','restricted','suspended','archived','retired'
  )),
  changed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_identity_id uuid REFERENCES public.ai_identities(identity_id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_identity_status_history_identity_created_idx
  ON public.ai_identity_status_history (identity_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_identity_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  version_number bigint NOT NULL CHECK (version_number > 0),
  configuration_snapshot jsonb NOT NULL CHECK (jsonb_typeof(configuration_snapshot) = 'object'),
  changed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id,version_number)
);

CREATE TABLE IF NOT EXISTS public.ai_identity_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid REFERENCES public.ai_identities(identity_id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_identity_id uuid REFERENCES public.ai_identities(identity_id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 2 AND 120),
  target_type text NOT NULL DEFAULT 'identity' CHECK (char_length(target_type) <= 80),
  target_id text,
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 1200),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_identity_audit_logs_identity_created_idx
  ON public.ai_identity_audit_logs (identity_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_identity_audit_logs_actor_created_idx
  ON public.ai_identity_audit_logs (actor_user_id,created_at DESC);

-- The write RPC is atomic: identity, separate first/last names, public-profile
-- metadata, owner, lifecycle history, version and audit all commit together.
CREATE OR REPLACE FUNCTION public.minglora_ai_identity_upsert(
  p_identity jsonb,
  p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid;
  v_owner uuid;
  v_category text;
  v_population text;
  v_type text;
  v_status text;
  v_previous_status text;
  v_username text;
  v_slug text;
  v_first_name text;
  v_last_name text;
  v_middle_name text;
  v_full_name text;
  v_display_name text;
  v_version bigint;
  v_is_new boolean;
BEGIN
  IF p_identity IS NULL OR pg_catalog.jsonb_typeof(p_identity) <> 'object' OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'A valid identity object and authenticated owner are required.' USING ERRCODE = '22023';
  END IF;
  v_id := NULLIF(p_identity->>'id','')::uuid;
  v_owner := p_actor_user_id;
  v_category := NULLIF(pg_catalog.btrim(p_identity->>'category_id'),'');
  v_population := COALESCE(NULLIF(p_identity->>'population',''),'independent');
  v_type := COALESCE(NULLIF(p_identity->>'identity_type',''),'social_personality');
  v_status := COALESCE(NULLIF(p_identity->>'status',''),'created');
  v_username := pg_catalog.lower(pg_catalog.btrim(p_identity->>'username'));
  v_slug := pg_catalog.lower(pg_catalog.btrim(p_identity->>'public_profile_slug'));
  v_first_name := pg_catalog.btrim(p_identity->>'first_name');
  v_last_name := pg_catalog.btrim(p_identity->>'last_name');
  v_middle_name := COALESCE(pg_catalog.btrim(p_identity->>'middle_name'),'');
  v_display_name := COALESCE(NULLIF(pg_catalog.btrim(p_identity->>'display_name'),''),pg_catalog.concat_ws(' ',v_first_name,v_middle_name,v_last_name));
  v_full_name := COALESCE(NULLIF(pg_catalog.btrim(p_identity->>'full_name'),''),pg_catalog.concat_ws(' ',v_first_name,v_middle_name,v_last_name));

  IF v_id IS NULL OR v_first_name IS NULL OR v_first_name = '' OR v_last_name IS NULL OR v_last_name = '' THEN
    RAISE EXCEPTION 'AI identity ID, first name and last name are required.' USING ERRCODE = '22023';
  END IF;
  IF v_username !~ '^ai_[a-z0-9_]{2,40}
-- The existing Minglora server-to-Supabase runtime gateway uses service_role.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'minglora_ai_bot_settings',
    'minglora_ai_bot_categories',
    'minglora_ai_bots',
    'minglora_ai_bot_schedules',
    'minglora_ai_bot_teams',
    'minglora_ai_bot_team_members',
    'minglora_ai_bot_tasks',
    'minglora_ai_bot_follow_targets',
    'minglora_ai_bot_follows',
    'minglora_ai_bot_followers',
    'minglora_ai_bot_follow_exclusions',
    'minglora_ai_bot_audit'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;

COMMIT;
 OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*
-- The existing Minglora server-to-Supabase runtime gateway uses service_role.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'minglora_ai_bot_settings',
    'minglora_ai_bot_categories',
    'minglora_ai_bots',
    'minglora_ai_bot_schedules',
    'minglora_ai_bot_teams',
    'minglora_ai_bot_team_members',
    'minglora_ai_bot_tasks',
    'minglora_ai_bot_follow_targets',
    'minglora_ai_bot_follows',
    'minglora_ai_bot_followers',
    'minglora_ai_bot_follow_exclusions',
    'minglora_ai_bot_audit'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;

COMMIT;
 THEN
    RAISE EXCEPTION 'AI username or public profile slug is invalid.' USING ERRCODE = '22023';
  END IF;
  IF v_population NOT IN ('independent','organizational','specialized_service') OR
     v_status NOT IN ('proposed','created','under_review','approved','active','restricted','suspended','archived','retired') THEN
    RAISE EXCEPTION 'AI population or lifecycle status is invalid.' USING ERRCODE = '22023';
  END IF;

  SELECT i.status INTO v_previous_status
  FROM public.ai_identities AS i
  WHERE i.identity_id = v_id AND i.owner_admin_id = v_owner
  FOR UPDATE;
  v_is_new := NOT FOUND;

  INSERT INTO public.ai_identities (
    identity_id,population,identity_type,category_id,status,parent_identity_id,
    owner_admin_id,source_system,source_identity_id,public_profile_slug,
    public_profile_enabled,created_at,updated_at
  ) VALUES (
    v_id,v_population,v_type,v_category,v_status,
    NULLIF(p_identity->>'parent_identity_id','')::uuid,
    v_owner,'minglora',v_id,v_slug,
    COALESCE((p_identity->>'public_profile_enabled')::boolean,false),
    COALESCE(NULLIF(p_identity->>'created_at','')::timestamptz,pg_catalog.now()),
    pg_catalog.now()
  )
  ON CONFLICT (identity_id) DO UPDATE SET
    population=EXCLUDED.population,
    identity_type=EXCLUDED.identity_type,
    category_id=EXCLUDED.category_id,
    status=EXCLUDED.status,
    parent_identity_id=EXCLUDED.parent_identity_id,
    public_profile_slug=EXCLUDED.public_profile_slug,
    public_profile_enabled=EXCLUDED.public_profile_enabled,
    updated_at=pg_catalog.now()
  WHERE public.ai_identities.owner_admin_id = v_owner;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI identity is owned by a different administrator.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_names (
    identity_id,first_name,last_name,middle_name,full_name,display_name,username,public_profile_url,updated_at
  ) VALUES (
    v_id,v_first_name,v_last_name,v_middle_name,v_full_name,v_display_name,v_username,
    '/ai/' || v_slug,pg_catalog.now()
  )
  ON CONFLICT (identity_id) DO UPDATE SET
    first_name=EXCLUDED.first_name,
    last_name=EXCLUDED.last_name,
    middle_name=EXCLUDED.middle_name,
    full_name=EXCLUDED.full_name,
    display_name=EXCLUDED.display_name,
    username=EXCLUDED.username,
    public_profile_url=EXCLUDED.public_profile_url,
    updated_at=pg_catalog.now();

  INSERT INTO public.ai_profiles (
    identity_id,biography,introduction,gender,nationality,country_of_origin,current_country,
    time_zone,personality,interests,hobbies,profession,skills,avatar_storage_reference,
    cover_storage_reference,memory_enabled,memory_configuration,ai_disclosure_visible,
    fictional_identity,visibility,updated_at
  ) VALUES (
    v_id,
    COALESCE(LEFT(p_identity->>'biography',4000),''),
    COALESCE(LEFT(p_identity->>'introduction',2000),''),
    COALESCE(NULLIF(p_identity->>'gender',''),'prefer_not_to_specify'),
    COALESCE(p_identity->>'nationality',''),
    COALESCE(p_identity->>'country_of_origin',''),
    COALESCE(p_identity->>'current_country',''),
    COALESCE(NULLIF(p_identity->>'time_zone',''),'UTC'),
    COALESCE(LEFT(p_identity->>'personality',4000),''),
    CASE WHEN pg_catalog.jsonb_typeof(p_identity->'interests')='array' THEN p_identity->'interests' ELSE '[]'::jsonb END,
    CASE WHEN pg_catalog.jsonb_typeof(p_identity->'hobbies')='array' THEN p_identity->'hobbies' ELSE '[]'::jsonb END,
    COALESCE(p_identity->>'profession',''),
    CASE WHEN pg_catalog.jsonb_typeof(p_identity->'skills')='array' THEN p_identity->'skills' ELSE '[]'::jsonb END,
    NULLIF(p_identity->>'avatar_storage_reference',''),
    NULLIF(p_identity->>'cover_storage_reference',''),
    COALESCE((p_identity->>'memory_enabled')::boolean,false),
    CASE WHEN pg_catalog.jsonb_typeof(p_identity->'memory_configuration')='object' THEN p_identity->'memory_configuration' ELSE '{}'::jsonb END,
    true,true,
    COALESCE(NULLIF(p_identity->>'visibility',''),'private'),
    pg_catalog.now()
  )
  ON CONFLICT (identity_id) DO UPDATE SET
    biography=EXCLUDED.biography,
    introduction=EXCLUDED.introduction,
    gender=EXCLUDED.gender,
    nationality=EXCLUDED.nationality,
    country_of_origin=EXCLUDED.country_of_origin,
    current_country=EXCLUDED.current_country,
    time_zone=EXCLUDED.time_zone,
    personality=EXCLUDED.personality,
    interests=EXCLUDED.interests,
    hobbies=EXCLUDED.hobbies,
    profession=EXCLUDED.profession,
    skills=EXCLUDED.skills,
    avatar_storage_reference=EXCLUDED.avatar_storage_reference,
    cover_storage_reference=EXCLUDED.cover_storage_reference,
    memory_enabled=EXCLUDED.memory_enabled,
    memory_configuration=EXCLUDED.memory_configuration,
    visibility=EXCLUDED.visibility,
    updated_at=pg_catalog.now();

  INSERT INTO public.ai_identity_owners (identity_id,owner_type,owner_user_id,is_primary)
  VALUES (v_id,'human_admin',v_owner,true)
  ON CONFLICT DO NOTHING;

  IF v_is_new OR v_previous_status IS DISTINCT FROM v_status THEN
    INSERT INTO public.ai_identity_status_history (
      identity_id,previous_status,new_status,changed_by_user_id,reason
    ) VALUES (v_id,v_previous_status,v_status,v_owner,'Minglora AI identity create/update');
  END IF;

  SELECT COALESCE(pg_catalog.max(v.version_number),0)+1 INTO v_version
  FROM public.ai_identity_versions AS v WHERE v.identity_id=v_id;
  INSERT INTO public.ai_identity_versions (
    identity_id,version_number,configuration_snapshot,changed_by_user_id
  ) VALUES (
    v_id,v_version,p_identity,v_owner
  );
  INSERT INTO public.ai_identity_audit_logs (
    identity_id,actor_user_id,action,target_type,target_id,summary
  ) VALUES (
    v_id,v_owner,CASE WHEN v_is_new THEN 'identity.created' ELSE 'identity.updated' END,
    'ai_identity',v_id::text,'Persisted canonical Minglora AI identity and separate name fields.'
  );

  RETURN pg_catalog.jsonb_build_object(
    'id',v_id,'population',v_population,'status',v_status,
    'first_name',v_first_name,'last_name',v_last_name,'username',v_username,
    'public_profile_slug',v_slug,'created',v_is_new
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_list(
  p_owner_admin_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    pg_catalog.jsonb_agg(result.item ORDER BY result.created_at DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT
      pg_catalog.jsonb_build_object(
        'id',i.identity_id,
        'population',i.population,
        'identityType',i.identity_type,
        'categoryId',i.category_id,
        'status',i.status,
        'parentIdentityId',i.parent_identity_id,
        'publicProfileSlug',i.public_profile_slug,
        'publicProfileEnabled',i.public_profile_enabled,
        'firstName',n.first_name,
        'lastName',n.last_name,
        'middleName',n.middle_name,
        'fullName',n.full_name,
        'displayName',n.display_name,
        'username',n.username,
        'publicProfileUrl',n.public_profile_url,
        'bio',p.biography,
        'gender',p.gender,
        'nationality',p.nationality,
        'countryOfOrigin',p.country_of_origin,
        'currentCountry',p.current_country,
        'timeZone',p.time_zone,
        'personality',p.personality,
        'interests',p.interests,
        'hobbies',p.hobbies,
        'profession',p.profession,
        'skills',p.skills,
        'memoryEnabled',p.memory_enabled,
        'createdAt',i.created_at,
        'updatedAt',i.updated_at
      ) AS item,
      i.created_at
    FROM public.ai_identities AS i
    JOIN public.ai_names AS n ON n.identity_id=i.identity_id
    LEFT JOIN public.ai_profiles AS p ON p.identity_id=i.identity_id
    WHERE i.owner_admin_id=p_owner_admin_id
    ORDER BY i.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),1000)
    OFFSET GREATEST(COALESCE(p_offset,0),0)
  ) AS result;
$function$;

REVOKE ALL ON FUNCTION public.minglora_ai_identity_upsert(jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_identity_upsert(jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_identity_list(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_identity_list(uuid,integer,integer) TO service_role;

-- Do not expose these tables to anonymous or authenticated clients.
-- The existing Minglora server-to-Supabase runtime gateway uses service_role.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'minglora_ai_bot_settings',
    'minglora_ai_bot_categories',
    'minglora_ai_bots',
    'minglora_ai_bot_schedules',
    'minglora_ai_bot_teams',
    'minglora_ai_bot_team_members',
    'minglora_ai_bot_tasks',
    'minglora_ai_bot_follow_targets',
    'minglora_ai_bot_follows',
    'minglora_ai_bot_followers',
    'minglora_ai_bot_follow_exclusions',
    'minglora_ai_bot_audit'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;

COMMIT;
