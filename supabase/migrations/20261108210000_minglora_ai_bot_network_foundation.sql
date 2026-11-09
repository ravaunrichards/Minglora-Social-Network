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
