BEGIN;

CREATE TABLE IF NOT EXISTS public.minglora_audio_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key text NOT NULL UNIQUE CHECK (category_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  label text NOT NULL CHECK (length(label) BETWEEN 2 AND 100),
  parent_id uuid REFERENCES public.minglora_audio_categories(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_audio_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_name text NOT NULL CHECK (length(website_name) BETWEEN 2 AND 120),
  domain text NOT NULL CHECK (length(domain) BETWEEN 3 AND 253),
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  terms_url text CHECK (terms_url IS NULL OR terms_url ~ '^https://'),
  source_type text NOT NULL DEFAULT 'external_library' CHECK (source_type IN ('external_library','creator_upload','member_recording','platform_original','archive')),
  accessed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain,source_url)
);

CREATE TABLE IF NOT EXISTS public.minglora_audio_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_name text NOT NULL CHECK (length(license_name) BETWEEN 2 AND 120),
  license_url text NOT NULL CHECK (license_url ~ '^https://'),
  commercial_use_allowed boolean NOT NULL DEFAULT false,
  redistribution_allowed boolean NOT NULL DEFAULT false,
  attribution_required boolean NOT NULL DEFAULT false,
  attribution_text text NOT NULL DEFAULT '',
  modification_allowed boolean NOT NULL DEFAULT false,
  territory_scope text NOT NULL DEFAULT 'worldwide' CHECK (territory_scope IN ('worldwide','restricted','unknown')),
  territory_notes text NOT NULL DEFAULT '',
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected','expired')),
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  expires_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT attribution_required OR length(attribution_text) > 0)
);

CREATE TABLE IF NOT EXISTS public.minglora_audio_events (
  event_key text PRIMARY KEY CHECK (event_key ~ '^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$'),
  category_id uuid NOT NULL REFERENCES public.minglora_audio_categories(id) ON DELETE RESTRICT,
  label text NOT NULL CHECK (length(label) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_audio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key text NOT NULL UNIQUE CHECK (length(asset_key) BETWEEN 3 AND 120),
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '',
  scope text NOT NULL CHECK (scope IN ('platform','creator','private_user')),
  category_id uuid NOT NULL REFERENCES public.minglora_audio_categories(id) ON DELETE RESTRICT,
  event_key text REFERENCES public.minglora_audio_events(event_key) ON DELETE SET NULL,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_id uuid REFERENCES public.minglora_audio_sources(id) ON DELETE RESTRICT,
  license_id uuid REFERENCES public.minglora_audio_licenses(id) ON DELETE RESTRICT,
  origin_type text NOT NULL CHECK (origin_type IN ('field_recording','studio_recording','voice_recording','instrument_recording','environmental_recording','wildlife_recording','cultural_recording','user_original_recording','creator_original_recording','legacy_procedural','synthetic','ai_generated','text_to_speech','unknown')),
  authenticity_status text NOT NULL DEFAULT 'unverified' CHECK (authenticity_status IN ('unverified','verified_authentic','rejected_synthetic','rejected_ai','rejected_fake')),
  review_status text NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft','pending_review','approved','rejected','inactive','archived')),
  original_filename text NOT NULL CHECK (original_filename ~ '^[a-z0-9]+(_[a-z0-9]+){2,}_v[0-9]{3,}\\.(mp3|m4a|ogg|opus|wav|flac|aac|webm)$'),
  storage_bucket text NOT NULL DEFAULT 'minglora-sounds' CHECK (storage_bucket = 'minglora-sounds'),
  storage_path text NOT NULL CHECK (length(storage_path) BETWEEN 3 AND 1024),
  file_format text NOT NULL CHECK (file_format IN ('mp3','m4a','ogg','opus','wav','flac','aac','webm')),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 100 AND 3600000),
  sample_rate_hz integer CHECK (sample_rate_hz IS NULL OR sample_rate_hz BETWEEN 8000 AND 384000),
  bit_rate_bps integer CHECK (bit_rate_bps IS NULL OR bit_rate_bps BETWEEN 8000 AND 2000000),
  channel_count smallint CHECK (channel_count IS NULL OR channel_count BETWEEN 1 AND 8),
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes BETWEEN 1 AND 52428800),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  commercial_use_allowed boolean NOT NULL DEFAULT false,
  redistribution_allowed boolean NOT NULL DEFAULT false,
  attribution_required boolean NOT NULL DEFAULT false,
  attribution_text text NOT NULL DEFAULT '',
  license_verified boolean NOT NULL DEFAULT false,
  rights_confirmed boolean NOT NULL DEFAULT false,
  download_date date,
  recorded_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (storage_bucket,storage_path),
  CHECK (NOT attribution_required OR length(attribution_text) > 0),
  CHECK (scope <> 'platform' OR (source_id IS NOT NULL AND license_id IS NOT NULL)),
  CHECK (review_status <> 'approved' OR (scope = 'platform' AND authenticity_status = 'verified_authentic' AND license_verified AND commercial_use_allowed AND redistribution_allowed AND rights_confirmed))
);

CREATE TABLE IF NOT EXISTS public.minglora_audio_asset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.minglora_audio_assets(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  original_filename text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'minglora-sounds' CHECK (storage_bucket = 'minglora-sounds'),
  storage_path text NOT NULL,
  file_format text NOT NULL CHECK (file_format IN ('mp3','m4a','ogg','opus','wav','flac','aac','webm')),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 100 AND 3600000),
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes BETWEEN 1 AND 52428800),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  change_note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id,version_number),
  UNIQUE (storage_bucket,storage_path)
);

CREATE TABLE IF NOT EXISTS public.minglora_audio_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key text NOT NULL UNIQUE CHECK (profile_key ~ '^[a-z][a-z0-9_-]{1,60}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 100),
  description text NOT NULL DEFAULT '',
  scope text NOT NULL DEFAULT 'platform' CHECK (scope IN ('platform','user')),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'platform' AND user_id IS NULL) OR (scope = 'user' AND user_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.minglora_audio_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL REFERENCES public.minglora_audio_events(event_key) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.minglora_audio_assets(id) ON DELETE RESTRICT,
  profile_id uuid REFERENCES public.minglora_audio_profiles(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  volume numeric(4,3) NOT NULL DEFAULT 1.0 CHECK (volume BETWEEN 0 AND 1),
  loop_playback boolean NOT NULL DEFAULT false,
  playback_speed numeric(3,2) NOT NULL DEFAULT 1.0 CHECK (playback_speed BETWEEN 0.5 AND 2.0),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_key,profile_id)
);

CREATE TABLE IF NOT EXISTS public.minglora_user_audio_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.minglora_audio_profiles(id) ON DELETE SET NULL,
  master_volume numeric(4,3) NOT NULL DEFAULT 1.0 CHECK (master_volume BETWEEN 0 AND 1),
  muted boolean NOT NULL DEFAULT false,
  category_preferences jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(category_preferences) = 'object'),
  device_preferences jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(device_preferences) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_user_audio_favorites (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.minglora_audio_assets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,asset_id)
);

CREATE TABLE IF NOT EXISTS public.minglora_audio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  project_type text NOT NULL CHECK (project_type IN ('post','reel','story','video','slideshow','voiceover','audio_only')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','editing','render_queued','rendering','ready','failed','published','archived')),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms BETWEEN 0 AND 86400000),
  render_asset_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  project_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(project_metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_audio_project_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.minglora_audio_projects(id) ON DELETE CASCADE,
  track_type text NOT NULL CHECK (track_type IN ('original_media','background_music','voiceover','sound_effect','additional')),
  asset_id uuid REFERENCES public.minglora_audio_assets(id) ON DELETE SET NULL,
  media_asset_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  label text NOT NULL DEFAULT '',
  start_ms integer NOT NULL DEFAULT 0 CHECK (start_ms BETWEEN 0 AND 86400000),
  trim_start_ms integer NOT NULL DEFAULT 0 CHECK (trim_start_ms BETWEEN 0 AND 3600000),
  trim_end_ms integer CHECK (trim_end_ms IS NULL OR trim_end_ms BETWEEN 1 AND 3600000),
  volume numeric(4,3) NOT NULL DEFAULT 1.0 CHECK (volume BETWEEN 0 AND 1),
  fade_in_ms integer NOT NULL DEFAULT 0 CHECK (fade_in_ms BETWEEN 0 AND 30000),
  fade_out_ms integer NOT NULL DEFAULT 0 CHECK (fade_out_ms BETWEEN 0 AND 30000),
  playback_speed numeric(3,2) NOT NULL DEFAULT 1.0 CHECK (playback_speed BETWEEN 0.5 AND 2.0),
  is_muted boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (trim_end_ms IS NULL OR trim_end_ms > trim_start_ms),
  CHECK (trim_end_ms IS NULL OR fade_in_ms + fade_out_ms <= trim_end_ms - trim_start_ms)
);

CREATE TABLE IF NOT EXISTS public.minglora_audio_usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.minglora_audio_assets(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  content_type text NOT NULL CHECK (content_type IN ('post','reel','story','video','live','meeting','notification','call','other')),
  content_id text NOT NULL DEFAULT '',
  usage_type text NOT NULL DEFAULT 'play' CHECK (usage_type IN ('play','publish','preview','download','assignment')),
  territory text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_audio_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.minglora_audio_assets(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  report_type text NOT NULL CHECK (report_type IN ('copyright','licensing','impersonation','mislabelled_recording','abuse','other')),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','resolved','dismissed')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_audio_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS minglora_audio_assets_category_status_idx ON public.minglora_audio_assets(category_id,review_status,created_at DESC);
CREATE INDEX IF NOT EXISTS minglora_audio_assets_scope_status_idx ON public.minglora_audio_assets(scope,review_status,created_at DESC);
CREATE INDEX IF NOT EXISTS minglora_audio_assets_sha256_idx ON public.minglora_audio_assets(sha256);
CREATE INDEX IF NOT EXISTS minglora_audio_events_category_idx ON public.minglora_audio_events(category_id,is_active);
CREATE INDEX IF NOT EXISTS minglora_audio_assignments_event_idx ON public.minglora_audio_assignments(event_key,is_enabled);
CREATE INDEX IF NOT EXISTS minglora_audio_usage_asset_created_idx ON public.minglora_audio_usage_records(asset_id,created_at DESC);
CREATE INDEX IF NOT EXISTS minglora_audio_reports_status_idx ON public.minglora_audio_reports(status,created_at DESC);
CREATE INDEX IF NOT EXISTS minglora_audio_projects_owner_status_idx ON public.minglora_audio_projects(owner_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS minglora_audio_project_tracks_project_order_idx ON public.minglora_audio_project_tracks(project_id,sort_order,created_at);

INSERT INTO public.minglora_audio_categories(category_key,label,sort_order)
VALUES
  ('notifications','Notifications',1),('messaging','Messaging',2),('voice_calls','Voice calls',3),
  ('video_calls','Video calls',4),('meetwave','MeetWave',5),('live_streaming','LIVE streaming',6),
  ('live_gifts','LIVE gifts',7),('coins_transactions','Coins and transactions',8),('posts','Posts',9),
  ('reels','Reels',10),('stories','Stories',11),('photos_albums','Photos and albums',12),
  ('videos','Videos',13),('gaming','Gaming',14),('marketplace','Marketplace',15),('payments','Payments',16),
  ('security','Security',17),('navigation','Navigation',18),('accessibility','Accessibility',19),
  ('creator_studio','Creator Studio',20),('ai_network','AI Network',21),('music','Music',22),
  ('sound_effects','Sound effects',23),('voice_recordings','Voice recordings',24),
  ('environmental_recordings','Environmental recordings',25),('cultural_recordings','Cultural and traditional recordings',26)
ON CONFLICT (category_key) DO NOTHING;

INSERT INTO public.minglora_audio_events(event_key,category_id,label,is_active)
SELECT seed.event_key,category.id,seed.label,seed.is_active
FROM (VALUES
  ('notification.incoming','notifications','Incoming notification',true),
  ('notification.system','notifications','System notification',true),
  ('message.incoming','messaging','Incoming private message',true),
  ('message.outgoing','messaging','Outgoing message',true),
  ('message.group_incoming','messaging','Incoming group message',true),
  ('message.voice_received','messaging','Voice message received',true),
  ('message.voice_sent','messaging','Voice message sent',true),
  ('message.reaction','messaging','Message reaction',true),
  ('message.error','messaging','Message error',true),
  ('call.incoming_voice','voice_calls','Incoming voice call',true),
  ('call.outgoing_voice','voice_calls','Outgoing voice call',true),
  ('call.incoming_video','video_calls','Incoming video call',true),
  ('call.outgoing_video','video_calls','Outgoing video call',true),
  ('call.connecting','voice_calls','Call connecting',true),
  ('call.connected','voice_calls','Call connected',true),
  ('call.participant_joined','voice_calls','Participant joined',true),
  ('call.participant_left','voice_calls','Participant left',true),
  ('call.muted','voice_calls','Microphone muted',true),
  ('call.unmuted','voice_calls','Microphone unmuted',true),
  ('call.ended','voice_calls','Call ended',true),
  ('call.missed','voice_calls','Missed call',true),
  ('meetwave.invitation','meetwave','Meeting invitation',true),
  ('meetwave.reminder','meetwave','Meeting reminder',true),
  ('meetwave.participant_joined','meetwave','Meeting participant joined',true),
  ('live.started','live_streaming','LIVE started',true),
  ('live.viewer_joined','live_streaming','Viewer joined LIVE',true),
  ('live.viewer_left','live_streaming','Viewer left LIVE',true),
  ('live.host_notice','live_streaming','Host notice',true),
  ('live.ended','live_streaming','LIVE ended',true),
  ('gift.received','live_gifts','Gift received',true),
  ('gift.special_received','live_gifts','Special gift received',true),
  ('coin.received','coins_transactions','Coins received',true),
  ('coin.purchase_success','coins_transactions','Coin purchase successful',true),
  ('payment.success','payments','Payment successful',true),
  ('payment.failure','payments','Payment failed',true),
  ('post.published','posts','Post published',true),
  ('reel.published','reels','Reel published',true),
  ('story.published','stories','Story published',true),
  ('photo.uploaded','photos_albums','Photo uploaded',true),
  ('video.uploaded','videos','Video uploaded',true),
  ('gaming.match_found','gaming','Game match found',true),
  ('gaming.session_event','gaming','Game session event',true),
  ('security.login_alert','security','Login alert',true),
  ('security.account_alert','security','Account security alert',true),
  ('navigation.action_feedback','navigation','Navigation feedback',true),
  ('accessibility.spoken_feedback','accessibility','Accessible spoken feedback',true),
  ('creator.export_ready','creator_studio','Creator export ready',true),
  ('ai.response_received','ai_network','AI response received',true),
  ('marketplace.order_update','marketplace','Marketplace order update',false)
) AS seed(event_key,category_key,label,is_active)
JOIN public.minglora_audio_categories AS category ON category.category_key=seed.category_key
ON CONFLICT (event_key) DO NOTHING;

ALTER TABLE public.minglora_audio_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_audio_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_audio_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_audio_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_audio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_audio_asset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_audio_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_audio_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_user_audio_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_user_audio_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_audio_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_audio_project_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_audio_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_audio_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_audio_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.minglora_audio_categories,public.minglora_audio_sources,
  public.minglora_audio_licenses,public.minglora_audio_events,public.minglora_audio_assets,
  public.minglora_audio_asset_versions,public.minglora_audio_profiles,public.minglora_audio_assignments,
  public.minglora_user_audio_preferences,public.minglora_user_audio_favorites,
  public.minglora_audio_projects,public.minglora_audio_project_tracks,public.minglora_audio_usage_records,
  public.minglora_audio_reports,public.minglora_audio_audit_logs FROM anon,authenticated;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.minglora_audio_categories,public.minglora_audio_sources,
  public.minglora_audio_licenses,public.minglora_audio_events,public.minglora_audio_assets,
  public.minglora_audio_asset_versions,public.minglora_audio_profiles,public.minglora_audio_assignments,
  public.minglora_user_audio_preferences,public.minglora_user_audio_favorites,
  public.minglora_audio_projects,public.minglora_audio_project_tracks,public.minglora_audio_usage_records,
  public.minglora_audio_reports,public.minglora_audio_audit_logs TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.minglora_audio_audit_logs_id_seq TO service_role;

COMMIT;
