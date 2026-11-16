-- Minglora extended social-domain schema foundation.
-- DESIGN ONLY: the current application uses src/store.js JSON persistence and does not run SQL migrations.
-- Review on a disposable PostgreSQL database, add migration automation/tests, and plan data migration before adoption.
BEGIN;

CREATE TABLE IF NOT EXISTS photo_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  audience text NOT NULL DEFAULT 'friends' CHECK (audience IN ('public','friends','followers','private')),
  cover_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photo_albums_owner_created_idx ON photo_albums (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS album_photos (
  album_id uuid NOT NULL REFERENCES photo_albums(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 2000),
  sort_order integer NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, asset_id)
);
CREATE INDEX IF NOT EXISTS album_photos_order_idx ON album_photos (album_id, sort_order, added_at);

CREATE TABLE IF NOT EXISTS photo_tags (
  asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  tagged_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tagged_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, tagged_user_id),
  CHECK (tagged_user_id <> tagged_by)
);
CREATE INDEX IF NOT EXISTS photo_tags_user_status_idx ON photo_tags (tagged_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS short_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  sound_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 5000),
  audience text NOT NULL DEFAULT 'public' CHECK (audience IN ('public','friends','followers','private')),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 1000 AND 180000),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','rejected','hidden','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS short_videos_feed_idx ON short_videos (created_at DESC, id DESC) WHERE status = 'ready';
CREATE INDEX IF NOT EXISTS short_videos_creator_idx ON short_videos (creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS short_video_play_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES short_videos(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watched_ms integer NOT NULL DEFAULT 0 CHECK (watched_ms >= 0),
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS short_video_play_events_video_idx ON short_video_play_events (video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS short_video_play_events_viewer_idx ON short_video_play_events (viewer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS live_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  audience text NOT NULL DEFAULT 'public' CHECK (audience IN ('public','friends','followers','private','subscribers')),
  room_ref text UNIQUE,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','live','ended','cancelled','failed')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS live_broadcasts_host_idx ON live_broadcasts (host_id, created_at DESC);
CREATE INDEX IF NOT EXISTS live_broadcasts_active_idx ON live_broadcasts (status, started_at DESC);

CREATE TABLE IF NOT EXISTS live_participants (
  broadcast_id uuid NOT NULL REFERENCES live_broadcasts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('host','cohost','moderator','guest','viewer')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','requested','accepted','connected','removed','left','rejected')),
  joined_at timestamptz,
  left_at timestamptz,
  PRIMARY KEY (broadcast_id, user_id)
);
CREATE INDEX IF NOT EXISTS live_participants_user_idx ON live_participants (user_id, status);

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('voice','video')),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','ringing','active','ended','missed','rejected','failed')),
  room_ref text UNIQUE,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);
CREATE TABLE IF NOT EXISTS call_participants (
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitation_status text NOT NULL DEFAULT 'invited' CHECK (invitation_status IN ('invited','ringing','accepted','rejected','missed','left')),
  joined_at timestamptz,
  left_at timestamptz,
  PRIMARY KEY (call_id, user_id)
);
CREATE INDEX IF NOT EXISTS call_participants_user_idx ON call_participants (user_id, call_id);

CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_provider text,
  place_ref text,
  place_name text NOT NULL CHECK (length(place_name) BETWEEN 1 AND 180),
  audience text NOT NULL DEFAULT 'friends' CHECK (audience IN ('public','friends','followers','private')),
  post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checkins_user_created_idx ON checkins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS checkins_place_idx ON checkins (place_provider, place_ref);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app','email','push','realtime')),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_type, channel)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_hash text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx ON email_verification_tokens (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS memory_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memory_exclusions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  excluded_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (excluded_user_id IS NOT NULL OR starts_on IS NOT NULL OR ends_on IS NOT NULL),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS memory_exclusions_user_idx ON memory_exclusions (user_id, excluded_user_id);

CREATE TABLE IF NOT EXISTS fundraisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  beneficiary_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  currency char(3) NOT NULL,
  goal_minor bigint NOT NULL CHECK (goal_minor > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','active','paused','completed','cancelled','rejected')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS fundraisers_status_created_idx ON fundraisers (status, created_at DESC);

CREATE TABLE IF NOT EXISTS fundraiser_donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fundraiser_id uuid NOT NULL REFERENCES fundraisers(id) ON DELETE RESTRICT,
  donor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  provider text NOT NULL,
  provider_reference text UNIQUE,
  status text NOT NULL CHECK (status IN ('pending','completed','failed','refunded','disputed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS fundraiser_donations_fundraiser_idx ON fundraiser_donations (fundraiser_id, created_at DESC);

CREATE TABLE IF NOT EXISTS data_rights_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_type text NOT NULL CHECK (request_type IN ('export','deletion')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','verifying','processing','ready','completed','rejected','failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,
  result_storage_key text,
  failure_code text
);
CREATE INDEX IF NOT EXISTS data_rights_requests_user_idx ON data_rights_requests (user_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS video_watch_history (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES short_videos(id) ON DELETE CASCADE,
  position_ms integer NOT NULL DEFAULT 0 CHECK (position_ms >= 0),
  last_watched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

COMMIT;
