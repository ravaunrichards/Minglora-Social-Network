BEGIN;

-- Minglora Supabase production schema.
-- Identity is owned by Supabase Auth; profiles contain no password material.
-- Migration is intentionally empty-first-run: it creates no member or engagement data.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 120),
  bio text NOT NULL DEFAULT '' CHECK (length(bio) <= 500),
  location text NOT NULL DEFAULT '' CHECK (length(location) <= 120),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','friends','private')),
  avatar_url text NOT NULL DEFAULT '' CHECK (avatar_url = '' OR avatar_url LIKE 'https://%'),
  cover_url text NOT NULL DEFAULT '' CHECK (cover_url = '' OR cover_url LIKE 'https://%'),
  avatar_asset_id uuid,
  cover_asset_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uq
  ON public.profiles (lower(username));

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL PRIVILEGES ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.handle_new_minglora_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_username text;
  fallback_username text;
  requested_name text;
BEGIN
  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  fallback_username := 'member_' || left(replace(new.id::text, '-', ''), 23);
  IF requested_username !~ '^[a-z0-9_]{3,30}$' THEN
    requested_username := fallback_username;
  END IF;

  requested_name := left(trim(coalesce(
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'full_name',
    'Minglora Member'
  )), 120);
  IF length(requested_name) < 2 THEN
    requested_name := 'Minglora Member';
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (new.id, requested_username, requested_name)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (new.id, fallback_username, requested_name)
    ON CONFLICT (id) DO NOTHING;
  END;
  RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION private.handle_new_minglora_user() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_minglora_auth_user_created ON auth.users;
CREATE TRIGGER on_minglora_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_minglora_user();

-- Backfill only existing Auth identities; no synthetic accounts are created.
WITH candidates AS (
  SELECT
    u.id,
    lower(trim(coalesce(u.raw_user_meta_data ->> 'username', ''))) AS wanted_username,
    left(trim(coalesce(
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(u.email, ''), '@', 1),
      'Minglora Member'
    )), 120) AS wanted_name,
    row_number() OVER (
      PARTITION BY lower(trim(coalesce(u.raw_user_meta_data ->> 'username', '')))
      ORDER BY u.created_at, u.id
    ) AS username_rank
  FROM auth.users u
)
INSERT INTO public.profiles (id, username, display_name)
SELECT
  id,
  CASE WHEN wanted_username ~ '^[a-z0-9_]{3,30}$' AND username_rank = 1
       THEN wanted_username
       ELSE 'member_' || left(replace(id::text, '-', ''), 23)
  END,
  CASE WHEN length(wanted_name) >= 2 THEN wanted_name ELSE 'Minglora Member' END
FROM candidates
ON CONFLICT (id) DO NOTHING;

-- Minglora relational social-network core.
-- DESIGN FOUNDATION ONLY: the current JSON-backed server does not apply this migration.
-- Review and test on a disposable PostgreSQL database before adopting it.

CREATE EXTENSION IF NOT EXISTS pgcrypto;



CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id, blocker_id);

CREATE TABLE IF NOT EXISTS user_follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  followed_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);
CREATE INDEX IF NOT EXISTS user_follows_followed_idx ON user_follows (followed_id, created_at DESC);

CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> recipient_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_uq
  ON friendships (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id));
CREATE INDEX IF NOT EXISTS friendships_recipient_status_idx ON friendships (recipient_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  media_type text NOT NULL CHECK (media_type IN ('image','video','audio','document')),
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  width integer,
  height integer,
  duration_ms bigint,
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending','processing','ready','rejected','failed','deleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_assets_owner_created_idx ON media_assets (owner_id, created_at DESC);
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_avatar_asset_fk;
ALTER TABLE profiles ADD CONSTRAINT profiles_avatar_asset_fk FOREIGN KEY (avatar_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_cover_asset_fk;
ALTER TABLE profiles ADD CONSTRAINT profiles_cover_asset_fk FOREIGN KEY (cover_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT 'public' CHECK (audience IN ('public','friends','followers','private')),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','hidden','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(body) <= 10000)
);
CREATE INDEX IF NOT EXISTS posts_author_created_idx ON posts (author_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS posts_feed_created_idx ON posts (created_at DESC, id DESC) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS post_media (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  caption text NOT NULL DEFAULT '',
  PRIMARY KEY (post_id, asset_id)
);
CREATE TABLE IF NOT EXISTS post_reactions (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('like','love','care','haha','wow','sad','angry')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_reactions_user_idx ON post_reactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_post_created_idx ON comments (post_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments (parent_id, created_at ASC) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS saved_posts (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  collection_name text NOT NULL DEFAULT 'Saved',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS social_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private','hidden')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_groups_discovery_idx ON social_groups (visibility, status, created_at DESC);
CREATE TABLE IF NOT EXISTS group_memberships (
  group_id uuid NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','moderator','admin','owner')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('requested','active','banned','left')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_memberships_user_idx ON group_memberships (user_id, status, joined_at DESC);

CREATE TABLE IF NOT EXISTS group_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_posts_group_created_idx ON group_posts (group_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS group_posts_author_created_idx ON group_posts (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','unpublished','disabled')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pages_handle_lower_uq ON pages (lower(handle));
CREATE TABLE IF NOT EXISTS page_roles (
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','editor','analyst','moderator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, user_id)
);

CREATE TABLE IF NOT EXISTS page_follows (
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, user_id)
);
CREATE INDEX IF NOT EXISTS page_follows_user_idx ON page_follows (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS page_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  published_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 5000),
  image_url text NOT NULL DEFAULT '' CHECK (length(image_url) <= 2000),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (body <> '' OR image_url <> ''),
  CHECK (image_url = '' OR image_url LIKE 'https://%')
);
CREATE INDEX IF NOT EXISTS page_posts_page_created_idx ON page_posts (page_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS page_posts_publisher_idx ON page_posts (published_by, created_at DESC);

CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES media_assets(id) ON DELETE RESTRICT,
  text text NOT NULL DEFAULT '' CHECK (length(text) <= 1000),
  image_url text NOT NULL DEFAULT '' CHECK (length(image_url) <= 2000),
  audience text NOT NULL DEFAULT 'public' CHECK (audience IN ('public','friends','followers','private')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at),
  CHECK (text <> '' OR image_url <> '' OR asset_id IS NOT NULL),
  CHECK (image_url = '' OR image_url LIKE 'https://%')
);
CREATE INDEX IF NOT EXISTS stories_active_idx ON stories (expires_at, author_id);
CREATE TABLE IF NOT EXISTS story_views (
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct','group')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  muted_until timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON conversation_members (user_id, joined_at DESC);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body text NOT NULL DEFAULT '',
  attachment_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(body) <= 10000),
  CHECK (length(body) > 0 OR attachment_asset_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages (conversation_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL,
  entity_type text,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_inbox_idx ON notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (recipient_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  description text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  time_zone text NOT NULL,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','friends','invite_only')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX IF NOT EXISTS events_starts_idx ON events (starts_at) WHERE status = 'scheduled';
CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response text NOT NULL CHECK (response IN ('going','interested','not_going')),
  responded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  target_type text NOT NULL CHECK (target_type IN ('user','post','comment','group','page','message','event','listing','media')),
  target_id uuid NOT NULL,
  category text NOT NULL,
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','actioned','dismissed','appealed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS reports_queue_idx ON reports (status, created_at ASC);

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  description text NOT NULL DEFAULT '',
  price_minor bigint CHECK (price_minor IS NULL OR price_minor >= 0),
  currency char(3),
  category text NOT NULL,
  condition text NOT NULL DEFAULT 'unspecified',
  location_label text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','sold','archived','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((price_minor IS NULL AND currency IS NULL) OR (price_minor IS NOT NULL AND currency IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS marketplace_active_idx ON marketplace_listings (category, created_at DESC) WHERE status = 'active';
CREATE TABLE IF NOT EXISTS listing_media (
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, asset_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id, created_at DESC);

-- Minglora extended social-domain schema foundation.
-- DESIGN ONLY: the current application uses src/store.js JSON persistence and does not run SQL migrations.
-- Review on a disposable PostgreSQL database, add migration automation/tests, and plan data migration before adoption.

CREATE TABLE IF NOT EXISTS photo_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
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
  tagged_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tagged_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, tagged_user_id),
  CHECK (tagged_user_id <> tagged_by)
);
CREATE INDEX IF NOT EXISTS photo_tags_user_status_idx ON photo_tags (tagged_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS short_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
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
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  watched_ms integer NOT NULL DEFAULT 0 CHECK (watched_ms >= 0),
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS short_video_play_events_video_idx ON short_video_play_events (video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS short_video_play_events_viewer_idx ON short_video_play_events (viewer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS live_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
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
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('host','cohost','moderator','guest','viewer')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','requested','accepted','connected','removed','left','rejected')),
  joined_at timestamptz,
  left_at timestamptz,
  PRIMARY KEY (broadcast_id, user_id)
);
CREATE INDEX IF NOT EXISTS live_participants_user_idx ON live_participants (user_id, status);

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
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
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitation_status text NOT NULL DEFAULT 'invited' CHECK (invitation_status IN ('invited','ringing','accepted','rejected','missed','left')),
  joined_at timestamptz,
  left_at timestamptz,
  PRIMARY KEY (call_id, user_id)
);
CREATE INDEX IF NOT EXISTS call_participants_user_idx ON call_participants (user_id, call_id);

CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
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
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app','email','push','realtime')),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_type, channel)
);



CREATE TABLE IF NOT EXISTS memory_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memory_exclusions (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  excluded_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (excluded_user_id IS NOT NULL OR starts_on IS NOT NULL OR ends_on IS NOT NULL),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS memory_exclusions_user_idx ON memory_exclusions (user_id, excluded_user_id);

CREATE TABLE IF NOT EXISTS fundraisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  beneficiary_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
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
  donor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
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
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
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
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES short_videos(id) ON DELETE CASCADE,
  position_ms integer NOT NULL DEFAULT 0 CHECK (position_ms >= 0),
  last_watched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);


-- Single-instance compatibility store for the existing Node API.
-- It is not exposed to anon/authenticated clients; normalized tables above/below
-- are the durable relational domain model for future repository adapters.
CREATE TABLE IF NOT EXISTS public.minglora_runtime_state (
  state_key text PRIMARY KEY CHECK (state_key = 'primary'),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.minglora_runtime_state (state_key, state)
VALUES ('primary', '{
  "users": [], "posts": [], "friendships": [], "follows": [], "blocks": [],
  "savedPosts": [], "groups": [], "groupPosts": [], "stories": [],
  "storyViews": [], "pages": [], "pageRoles": [], "pageFollows": [],
  "pagePosts": [], "messages": [], "notifications": [], "sessions": [],
  "liveSessions": [], "liveParticipants": []
}'::jsonb)
ON CONFLICT (state_key) DO NOTHING;


-- updated_at is database-maintained on mutable records.
CREATE OR REPLACE FUNCTION private.set_minglora_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION private.set_minglora_updated_at() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','posts','comments','group_posts','page_posts',
    'marketplace_listings','photo_albums','short_videos'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_minglora_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_minglora_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.set_minglora_updated_at()',
      t
    );
  END LOOP;
END $$;

-- Add group/page owner membership records from the actual creator action.
CREATE OR REPLACE FUNCTION private.add_minglora_group_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.group_memberships(group_id,user_id,role,status)
  VALUES (new.id,new.owner_id,'owner','active')
  ON CONFLICT (group_id,user_id) DO NOTHING;
  RETURN new;
END; $$;
REVOKE ALL ON FUNCTION private.add_minglora_group_owner() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS add_minglora_group_owner ON public.social_groups;
CREATE TRIGGER add_minglora_group_owner AFTER INSERT ON public.social_groups
FOR EACH ROW EXECUTE FUNCTION private.add_minglora_group_owner();

CREATE OR REPLACE FUNCTION private.add_minglora_page_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.page_roles(page_id,user_id,role)
  VALUES (new.id,new.created_by,'owner')
  ON CONFLICT (page_id,user_id) DO NOTHING;
  RETURN new;
END; $$;
REVOKE ALL ON FUNCTION private.add_minglora_page_owner() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS add_minglora_page_owner ON public.pages;
CREATE TRIGGER add_minglora_page_owner AFTER INSERT ON public.pages
FOR EACH ROW EXECUTE FUNCTION private.add_minglora_page_owner();

-- RLS is mandatory for every table in the exposed public schema.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;

-- Internal state, audit history, and payment settlement records are server-only.
REVOKE ALL PRIVILEGES ON public.minglora_runtime_state, public.audit_log FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fundraiser_donations FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.data_rights_requests FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.reports FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM anon, authenticated;
GRANT UPDATE(read_at) ON public.notifications TO authenticated;
REVOKE UPDATE ON public.friendships FROM authenticated;
GRANT UPDATE(status) ON public.friendships TO authenticated;
REVOKE UPDATE ON public.group_memberships FROM authenticated;
GRANT UPDATE(status) ON public.group_memberships TO authenticated;
REVOKE UPDATE ON public.photo_tags FROM authenticated;
GRANT UPDATE(status) ON public.photo_tags TO authenticated;
REVOKE UPDATE ON public.live_participants FROM authenticated;
GRANT UPDATE(status) ON public.live_participants TO authenticated;
REVOKE UPDATE ON public.call_participants FROM authenticated;
GRANT UPDATE(invitation_status) ON public.call_participants TO authenticated;
REVOKE UPDATE ON public.event_rsvps FROM authenticated;
GRANT UPDATE(response) ON public.event_rsvps TO authenticated;
REVOKE UPDATE ON public.notification_preferences FROM authenticated;
GRANT UPDATE(enabled) ON public.notification_preferences TO authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE(display_name,bio,location,visibility,avatar_url,cover_url,avatar_asset_id,cover_asset_id)
  ON public.profiles TO authenticated;

-- Member profiles.
DROP POLICY IF EXISTS minglora_profiles_read ON public.profiles;
CREATE POLICY minglora_profiles_read ON public.profiles
FOR SELECT TO anon, authenticated
USING (
  visibility='public'
  OR id=(select auth.uid())
  OR (
    visibility='friends'
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status='accepted'
        AND ((f.requester_id=profiles.id AND f.recipient_id=(select auth.uid()))
          OR (f.recipient_id=profiles.id AND f.requester_id=(select auth.uid())))
    )
  )
);
DROP POLICY IF EXISTS minglora_profiles_update_self ON public.profiles;
CREATE POLICY minglora_profiles_update_self ON public.profiles
FOR UPDATE TO authenticated
USING (id=(select auth.uid()))
WITH CHECK (id=(select auth.uid()));

-- Relationships.
CREATE POLICY minglora_blocks_read_self ON public.user_blocks
FOR SELECT TO authenticated USING (blocker_id=(select auth.uid()));
CREATE POLICY minglora_blocks_insert_self ON public.user_blocks
FOR INSERT TO authenticated WITH CHECK (blocker_id=(select auth.uid()));
CREATE POLICY minglora_blocks_delete_self ON public.user_blocks
FOR DELETE TO authenticated USING (blocker_id=(select auth.uid()));

CREATE POLICY minglora_follows_read ON public.user_follows
FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY minglora_follows_insert_self ON public.user_follows
FOR INSERT TO authenticated WITH CHECK (follower_id=(select auth.uid()));
CREATE POLICY minglora_follows_delete_self ON public.user_follows
FOR DELETE TO authenticated USING (follower_id=(select auth.uid()));

CREATE POLICY minglora_friendships_read_participant ON public.friendships
FOR SELECT TO authenticated
USING (requester_id=(select auth.uid()) OR recipient_id=(select auth.uid()));
CREATE POLICY minglora_friendships_request_self ON public.friendships
FOR INSERT TO authenticated
WITH CHECK (requester_id=(select auth.uid()) AND status='pending');
CREATE POLICY minglora_friendships_respond ON public.friendships
FOR UPDATE TO authenticated
USING (recipient_id=(select auth.uid()) AND status='pending')
WITH CHECK (recipient_id=(select auth.uid()) AND status IN ('accepted','declined'));
CREATE POLICY minglora_friendships_remove_participant ON public.friendships
FOR DELETE TO authenticated
USING (requester_id=(select auth.uid()) OR recipient_id=(select auth.uid()));

-- Media metadata is visible to its owner or through a published public post/video.
CREATE POLICY minglora_media_read ON public.media_assets
FOR SELECT TO authenticated
USING (
  owner_id=(select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.post_media pm JOIN public.posts p ON p.id=pm.post_id
    WHERE pm.asset_id=media_assets.id AND p.status='published'
      AND (p.audience='public' OR p.author_id=(select auth.uid()))
  )
  OR EXISTS (
    SELECT 1 FROM public.short_videos v WHERE v.asset_id=media_assets.id
      AND v.status='ready' AND (v.audience='public' OR v.creator_id=(select auth.uid()))
  )
);
CREATE POLICY minglora_media_insert_self ON public.media_assets
FOR INSERT TO authenticated WITH CHECK (owner_id=(select auth.uid()));
CREATE POLICY minglora_media_update_self ON public.media_assets
FOR UPDATE TO authenticated USING (owner_id=(select auth.uid()))
WITH CHECK (owner_id=(select auth.uid()));
CREATE POLICY minglora_media_delete_self ON public.media_assets
FOR DELETE TO authenticated USING (owner_id=(select auth.uid()));

-- Posts, reactions, comments and saved items.
CREATE POLICY minglora_posts_read ON public.posts
FOR SELECT TO anon, authenticated
USING (
  status='published'
  AND (
    audience='public'
    OR author_id=(select auth.uid())
    OR (audience='followers' AND EXISTS (
      SELECT 1 FROM public.user_follows f
      WHERE f.follower_id=(select auth.uid()) AND f.followed_id=posts.author_id
    ))
    OR (audience='friends' AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status='accepted'
        AND ((f.requester_id=posts.author_id AND f.recipient_id=(select auth.uid()))
          OR (f.recipient_id=posts.author_id AND f.requester_id=(select auth.uid())))
    ))
  )
  OR author_id=(select auth.uid())
);
CREATE POLICY minglora_posts_insert_self ON public.posts
FOR INSERT TO authenticated WITH CHECK (author_id=(select auth.uid()));
CREATE POLICY minglora_posts_update_self ON public.posts
FOR UPDATE TO authenticated USING (author_id=(select auth.uid()))
WITH CHECK (author_id=(select auth.uid()));
CREATE POLICY minglora_posts_delete_self ON public.posts
FOR DELETE TO authenticated USING (author_id=(select auth.uid()));

CREATE POLICY minglora_post_media_read ON public.post_media
FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id));
CREATE POLICY minglora_post_media_insert ON public.post_media
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id AND p.author_id=(select auth.uid())));
CREATE POLICY minglora_post_media_delete ON public.post_media
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id AND p.author_id=(select auth.uid())));

CREATE POLICY minglora_reactions_read ON public.post_reactions
FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id));
CREATE POLICY minglora_reactions_insert_self ON public.post_reactions
FOR INSERT TO authenticated
WITH CHECK (user_id=(select auth.uid()) AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id));
CREATE POLICY minglora_reactions_update_self ON public.post_reactions
FOR UPDATE TO authenticated USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()));
CREATE POLICY minglora_reactions_delete_self ON public.post_reactions
FOR DELETE TO authenticated USING (user_id=(select auth.uid()));

CREATE POLICY minglora_comments_read ON public.comments
FOR SELECT TO anon, authenticated
USING (status='visible' AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id));
CREATE POLICY minglora_comments_insert_self ON public.comments
FOR INSERT TO authenticated
WITH CHECK (author_id=(select auth.uid()) AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id));
CREATE POLICY minglora_comments_update_self ON public.comments
FOR UPDATE TO authenticated USING (author_id=(select auth.uid()))
WITH CHECK (author_id=(select auth.uid()));
CREATE POLICY minglora_comments_delete_self ON public.comments
FOR DELETE TO authenticated USING (author_id=(select auth.uid()));

CREATE POLICY minglora_saved_posts_self ON public.saved_posts
FOR ALL TO authenticated
USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()));

-- Groups and group discussions.
CREATE POLICY minglora_groups_read ON public.social_groups
FOR SELECT TO anon, authenticated
USING (
  (visibility='public' AND status='active')
  OR owner_id=(select auth.uid())
  OR EXISTS (SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id=social_groups.id AND gm.user_id=(select auth.uid()) AND gm.status='active')
);
CREATE POLICY minglora_groups_insert_self ON public.social_groups
FOR INSERT TO authenticated WITH CHECK (owner_id=(select auth.uid()));
CREATE POLICY minglora_groups_update_owner ON public.social_groups
FOR UPDATE TO authenticated USING (owner_id=(select auth.uid()))
WITH CHECK (owner_id=(select auth.uid()));
CREATE POLICY minglora_groups_delete_owner ON public.social_groups
FOR DELETE TO authenticated USING (owner_id=(select auth.uid()));

CREATE POLICY minglora_group_members_read_self ON public.group_memberships
FOR SELECT TO authenticated USING (user_id=(select auth.uid()));
CREATE POLICY minglora_group_members_join ON public.group_memberships
FOR INSERT TO authenticated
WITH CHECK (
  user_id=(select auth.uid())
  AND status IN ('requested','active')
  AND EXISTS (SELECT 1 FROM public.social_groups g
    WHERE g.id=group_id AND g.visibility='public' AND g.status='active')
);
CREATE POLICY minglora_group_members_leave ON public.group_memberships
FOR UPDATE TO authenticated USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()) AND status IN ('active','left'));
CREATE POLICY minglora_group_members_remove_self ON public.group_memberships
FOR DELETE TO authenticated USING (user_id=(select auth.uid()));

CREATE POLICY minglora_group_posts_read ON public.group_posts
FOR SELECT TO anon, authenticated
USING (
  author_id=(select auth.uid())
  OR EXISTS (SELECT 1 FROM public.social_groups g
    WHERE g.id=group_id AND g.visibility='public' AND g.status='active')
  OR EXISTS (SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id=group_posts.group_id AND gm.user_id=(select auth.uid()) AND gm.status='active')
);
CREATE POLICY minglora_group_posts_insert ON public.group_posts
FOR INSERT TO authenticated
WITH CHECK (author_id=(select auth.uid()) AND EXISTS (
  SELECT 1 FROM public.group_memberships gm
  WHERE gm.group_id=group_id AND gm.user_id=(select auth.uid()) AND gm.status='active'
));
CREATE POLICY minglora_group_posts_update_self ON public.group_posts
FOR UPDATE TO authenticated USING (author_id=(select auth.uid()))
WITH CHECK (author_id=(select auth.uid()));
CREATE POLICY minglora_group_posts_delete_self ON public.group_posts
FOR DELETE TO authenticated USING (author_id=(select auth.uid()));

-- Pages and publishing roles.
CREATE POLICY minglora_pages_read ON public.pages
FOR SELECT TO anon, authenticated USING (status='active' OR created_by=(select auth.uid()));
CREATE POLICY minglora_pages_insert_self ON public.pages
FOR INSERT TO authenticated WITH CHECK (created_by=(select auth.uid()));
CREATE POLICY minglora_pages_update_creator ON public.pages
FOR UPDATE TO authenticated USING (created_by=(select auth.uid()))
WITH CHECK (created_by=(select auth.uid()));
CREATE POLICY minglora_pages_delete_creator ON public.pages
FOR DELETE TO authenticated USING (created_by=(select auth.uid()));

CREATE POLICY minglora_page_roles_read ON public.page_roles
FOR SELECT TO authenticated
USING (user_id=(select auth.uid()) OR EXISTS (
  SELECT 1 FROM public.pages p WHERE p.id=page_id AND p.created_by=(select auth.uid())
));
CREATE POLICY minglora_page_roles_insert_owner ON public.page_roles
FOR INSERT TO authenticated WITH CHECK (EXISTS (
  SELECT 1 FROM public.pages p WHERE p.id=page_id AND p.created_by=(select auth.uid())
));
CREATE POLICY minglora_page_roles_delete_owner ON public.page_roles
FOR DELETE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.pages p WHERE p.id=page_id AND p.created_by=(select auth.uid())
));

CREATE POLICY minglora_page_follows_read ON public.page_follows
FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY minglora_page_follows_insert_self ON public.page_follows
FOR INSERT TO authenticated WITH CHECK (user_id=(select auth.uid()));
CREATE POLICY minglora_page_follows_delete_self ON public.page_follows
FOR DELETE TO authenticated USING (user_id=(select auth.uid()));

CREATE POLICY minglora_page_posts_read ON public.page_posts
FOR SELECT TO anon, authenticated
USING (status='published' AND EXISTS (SELECT 1 FROM public.pages p WHERE p.id=page_id AND p.status='active'));
CREATE POLICY minglora_page_posts_insert_manager ON public.page_posts
FOR INSERT TO authenticated
WITH CHECK (published_by=(select auth.uid()) AND EXISTS (
  SELECT 1 FROM public.page_roles pr WHERE pr.page_id=page_id
    AND pr.user_id=(select auth.uid()) AND pr.role IN ('owner','admin','editor')
));
CREATE POLICY minglora_page_posts_update_manager ON public.page_posts
FOR UPDATE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.page_roles pr WHERE pr.page_id=page_id
    AND pr.user_id=(select auth.uid()) AND pr.role IN ('owner','admin','editor')
));
CREATE POLICY minglora_page_posts_delete_manager ON public.page_posts
FOR DELETE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.page_roles pr WHERE pr.page_id=page_id
    AND pr.user_id=(select auth.uid()) AND pr.role IN ('owner','admin','editor')
));

-- Stories and audience-limited story views.

CREATE POLICY minglora_stories_read ON public.stories
FOR SELECT TO anon, authenticated
USING (
  expires_at > now()
  AND (
    audience='public'
    OR author_id=(select auth.uid())
    OR (
      audience='followers'
      AND EXISTS (
        SELECT 1 FROM public.user_follows f
        WHERE f.follower_id=(select auth.uid()) AND f.followed_id=stories.author_id
      )
    )
    OR (
      audience='friends'
      AND EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status='accepted'
          AND (
            (f.requester_id=stories.author_id AND f.recipient_id=(select auth.uid()))
            OR (f.recipient_id=stories.author_id AND f.requester_id=(select auth.uid()))
          )
      )
    )
  )
);
CREATE POLICY minglora_stories_insert_self ON public.stories
FOR INSERT TO authenticated WITH CHECK (
  author_id=(select auth.uid()) AND expires_at>now()
  AND expires_at<=now()+interval '25 hours'
);
CREATE POLICY minglora_stories_update_self ON public.stories
FOR UPDATE TO authenticated USING (author_id=(select auth.uid()))
WITH CHECK (author_id=(select auth.uid()));
CREATE POLICY minglora_stories_delete_self ON public.stories
FOR DELETE TO authenticated USING (author_id=(select auth.uid()));

CREATE POLICY minglora_story_views_read ON public.story_views
FOR SELECT TO authenticated
USING (viewer_id=(select auth.uid()) OR EXISTS (
  SELECT 1 FROM public.stories s WHERE s.id=story_id AND s.author_id=(select auth.uid())
));
CREATE POLICY minglora_story_views_insert_self ON public.story_views
FOR INSERT TO authenticated
WITH CHECK (viewer_id=(select auth.uid()) AND EXISTS (
  SELECT 1 FROM public.stories s WHERE s.id=story_id AND s.expires_at>now()
));

-- Direct and group messaging. Membership is the authorization boundary.
CREATE POLICY minglora_conversations_read_member ON public.conversations
FOR SELECT TO authenticated
USING (created_by=(select auth.uid()) OR EXISTS (
  SELECT 1 FROM public.conversation_members cm
  WHERE cm.conversation_id=conversations.id AND cm.user_id=(select auth.uid())
));
CREATE POLICY minglora_conversations_create_self ON public.conversations
FOR INSERT TO authenticated WITH CHECK (created_by=(select auth.uid()));

CREATE POLICY minglora_conversation_members_read_self ON public.conversation_members
FOR SELECT TO authenticated USING (user_id=(select auth.uid()));
CREATE POLICY minglora_conversation_members_add ON public.conversation_members
FOR INSERT TO authenticated
WITH CHECK (
  user_id=(select auth.uid())
  OR EXISTS (SELECT 1 FROM public.conversations c
    WHERE c.id=conversation_id AND c.created_by=(select auth.uid()))
);
CREATE POLICY minglora_conversation_members_update_self ON public.conversation_members
FOR UPDATE TO authenticated USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()));
CREATE POLICY minglora_conversation_members_remove_self ON public.conversation_members
FOR DELETE TO authenticated USING (user_id=(select auth.uid()));

CREATE POLICY minglora_messages_read_member ON public.messages
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.conversation_members cm
  WHERE cm.conversation_id=messages.conversation_id AND cm.user_id=(select auth.uid())
));
CREATE POLICY minglora_messages_send_member ON public.messages
FOR INSERT TO authenticated WITH CHECK (
  sender_id=(select auth.uid()) AND EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id=messages.conversation_id AND cm.user_id=(select auth.uid())
  )
);
CREATE POLICY minglora_messages_update_sender ON public.messages
FOR UPDATE TO authenticated USING (sender_id=(select auth.uid()))
WITH CHECK (sender_id=(select auth.uid()));
CREATE POLICY minglora_messages_delete_sender ON public.messages
FOR DELETE TO authenticated USING (sender_id=(select auth.uid()));

-- Notifications are written by trusted server actions, read by recipient.
CREATE POLICY minglora_notifications_read_self ON public.notifications
FOR SELECT TO authenticated USING (recipient_id=(select auth.uid()));
CREATE POLICY minglora_notifications_update_self ON public.notifications
FOR UPDATE TO authenticated USING (recipient_id=(select auth.uid()))
WITH CHECK (recipient_id=(select auth.uid()));

-- Events, RSVPs, moderation and marketplace.
CREATE POLICY minglora_events_read ON public.events
FOR SELECT TO anon, authenticated
USING (visibility='public' OR creator_id=(select auth.uid()));
CREATE POLICY minglora_events_insert_self ON public.events
FOR INSERT TO authenticated WITH CHECK (creator_id=(select auth.uid()));
CREATE POLICY minglora_events_update_self ON public.events
FOR UPDATE TO authenticated USING (creator_id=(select auth.uid()))
WITH CHECK (creator_id=(select auth.uid()));
CREATE POLICY minglora_events_delete_self ON public.events
FOR DELETE TO authenticated USING (creator_id=(select auth.uid()));

CREATE POLICY minglora_event_rsvps_read ON public.event_rsvps
FOR SELECT TO authenticated
USING (user_id=(select auth.uid()) OR EXISTS (
  SELECT 1 FROM public.events e WHERE e.id=event_id AND e.creator_id=(select auth.uid())
));
CREATE POLICY minglora_event_rsvps_insert_self ON public.event_rsvps
FOR INSERT TO authenticated WITH CHECK (user_id=(select auth.uid()));
CREATE POLICY minglora_event_rsvps_update_self ON public.event_rsvps
FOR UPDATE TO authenticated USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()));
CREATE POLICY minglora_event_rsvps_delete_self ON public.event_rsvps
FOR DELETE TO authenticated USING (user_id=(select auth.uid()));

CREATE POLICY minglora_reports_read_self ON public.reports
FOR SELECT TO authenticated USING (reporter_id=(select auth.uid()));
CREATE POLICY minglora_reports_insert_self ON public.reports
FOR INSERT TO authenticated WITH CHECK (reporter_id=(select auth.uid()));

CREATE POLICY minglora_marketplace_read ON public.marketplace_listings
FOR SELECT TO anon, authenticated
USING (status='active' OR seller_id=(select auth.uid()));
CREATE POLICY minglora_marketplace_insert_self ON public.marketplace_listings
FOR INSERT TO authenticated WITH CHECK (seller_id=(select auth.uid()));
CREATE POLICY minglora_marketplace_update_self ON public.marketplace_listings
FOR UPDATE TO authenticated USING (seller_id=(select auth.uid()))
WITH CHECK (seller_id=(select auth.uid()));
CREATE POLICY minglora_marketplace_delete_self ON public.marketplace_listings
FOR DELETE TO authenticated USING (seller_id=(select auth.uid()));
CREATE POLICY minglora_listing_media_read ON public.listing_media
FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id=listing_id));
CREATE POLICY minglora_listing_media_insert ON public.listing_media
FOR INSERT TO authenticated WITH CHECK (EXISTS (
  SELECT 1 FROM public.marketplace_listings l
  WHERE l.id=listing_id AND l.seller_id=(select auth.uid())
));
CREATE POLICY minglora_listing_media_delete ON public.listing_media
FOR DELETE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.marketplace_listings l
  WHERE l.id=listing_id AND l.seller_id=(select auth.uid())
));

-- Photo albums and tagging.

CREATE POLICY minglora_albums_read ON public.photo_albums
FOR SELECT TO anon, authenticated
USING (
  status='active'
  AND (
    audience='public'
    OR owner_id=(select auth.uid())
    OR (
      audience='followers'
      AND EXISTS (
        SELECT 1 FROM public.user_follows f
        WHERE f.follower_id=(select auth.uid()) AND f.followed_id=photo_albums.owner_id
      )
    )
    OR (
      audience='friends'
      AND EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status='accepted'
          AND (
            (f.requester_id=photo_albums.owner_id AND f.recipient_id=(select auth.uid()))
            OR (f.recipient_id=photo_albums.owner_id AND f.requester_id=(select auth.uid()))
          )
      )
    )
  )
);
CREATE POLICY minglora_albums_insert_self ON public.photo_albums
FOR INSERT TO authenticated WITH CHECK (owner_id=(select auth.uid()));
CREATE POLICY minglora_albums_update_self ON public.photo_albums
FOR UPDATE TO authenticated USING (owner_id=(select auth.uid()))
WITH CHECK (owner_id=(select auth.uid()));
CREATE POLICY minglora_albums_delete_self ON public.photo_albums
FOR DELETE TO authenticated USING (owner_id=(select auth.uid()));

CREATE POLICY minglora_album_photos_read ON public.album_photos
FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.photo_albums a WHERE a.id=album_id));
CREATE POLICY minglora_album_photos_insert ON public.album_photos
FOR INSERT TO authenticated WITH CHECK (EXISTS (
  SELECT 1 FROM public.photo_albums a WHERE a.id=album_id AND a.owner_id=(select auth.uid())
));
CREATE POLICY minglora_album_photos_delete ON public.album_photos
FOR DELETE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.photo_albums a WHERE a.id=album_id AND a.owner_id=(select auth.uid())
));

CREATE POLICY minglora_photo_tags_read ON public.photo_tags
FOR SELECT TO authenticated
USING (tagged_user_id=(select auth.uid()) OR tagged_by=(select auth.uid()));
CREATE POLICY minglora_photo_tags_insert ON public.photo_tags
FOR INSERT TO authenticated WITH CHECK (tagged_by=(select auth.uid()));
CREATE POLICY minglora_photo_tags_update_recipient ON public.photo_tags
FOR UPDATE TO authenticated USING (tagged_user_id=(select auth.uid()))
WITH CHECK (tagged_user_id=(select auth.uid()));
CREATE POLICY minglora_photo_tags_delete_participant ON public.photo_tags
FOR DELETE TO authenticated
USING (tagged_user_id=(select auth.uid()) OR tagged_by=(select auth.uid()));

-- Short video feeds, watch events and creator ownership.

CREATE POLICY minglora_short_videos_read ON public.short_videos
FOR SELECT TO anon, authenticated
USING (
  creator_id=(select auth.uid())
  OR (
    status='ready'
    AND (
      audience='public'
      OR (
        audience='followers'
        AND EXISTS (
          SELECT 1 FROM public.user_follows f
          WHERE f.follower_id=(select auth.uid()) AND f.followed_id=short_videos.creator_id
        )
      )
      OR (
        audience='friends'
        AND EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE f.status='accepted'
            AND (
              (f.requester_id=short_videos.creator_id AND f.recipient_id=(select auth.uid()))
              OR (f.recipient_id=short_videos.creator_id AND f.requester_id=(select auth.uid()))
            )
        )
      )
    )
  )
);
CREATE POLICY minglora_short_videos_insert_self ON public.short_videos
FOR INSERT TO authenticated WITH CHECK (creator_id=(select auth.uid()));
CREATE POLICY minglora_short_videos_update_self ON public.short_videos
FOR UPDATE TO authenticated USING (creator_id=(select auth.uid()))
WITH CHECK (creator_id=(select auth.uid()));
CREATE POLICY minglora_short_videos_delete_self ON public.short_videos
FOR DELETE TO authenticated USING (creator_id=(select auth.uid()));

CREATE POLICY minglora_video_plays_read_self ON public.short_video_play_events
FOR SELECT TO authenticated USING (viewer_id=(select auth.uid()));
CREATE POLICY minglora_video_plays_insert_self ON public.short_video_play_events
FOR INSERT TO authenticated WITH CHECK (viewer_id=(select auth.uid()));

-- Live sessions and calls: participant rows are real state, not seeded viewer counts.
CREATE POLICY minglora_live_read ON public.live_broadcasts
FOR SELECT TO anon, authenticated
USING ((audience='public' AND status='live') OR host_id=(select auth.uid()));
CREATE POLICY minglora_live_create_host ON public.live_broadcasts
FOR INSERT TO authenticated WITH CHECK (host_id=(select auth.uid()));
CREATE POLICY minglora_live_update_host ON public.live_broadcasts
FOR UPDATE TO authenticated USING (host_id=(select auth.uid()))
WITH CHECK (host_id=(select auth.uid()));
CREATE POLICY minglora_live_delete_host ON public.live_broadcasts
FOR DELETE TO authenticated USING (host_id=(select auth.uid()));

CREATE POLICY minglora_live_participants_read ON public.live_participants
FOR SELECT TO authenticated
USING (user_id=(select auth.uid()) OR EXISTS (
  SELECT 1 FROM public.live_broadcasts b
  WHERE b.id=broadcast_id AND b.host_id=(select auth.uid())
));
CREATE POLICY minglora_live_participants_request ON public.live_participants
FOR INSERT TO authenticated WITH CHECK (user_id=(select auth.uid()) AND status='requested');
CREATE POLICY minglora_live_participants_update_self ON public.live_participants
FOR UPDATE TO authenticated USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()) AND status IN ('requested','accepted','left'));
CREATE POLICY minglora_live_participants_delete_self ON public.live_participants
FOR DELETE TO authenticated USING (user_id=(select auth.uid()));

CREATE POLICY minglora_calls_read ON public.calls
FOR SELECT TO authenticated
USING (created_by=(select auth.uid()) OR EXISTS (
  SELECT 1 FROM public.call_participants cp WHERE cp.call_id=calls.id AND cp.user_id=(select auth.uid())
));
CREATE POLICY minglora_calls_create_self ON public.calls
FOR INSERT TO authenticated WITH CHECK (created_by=(select auth.uid()));
CREATE POLICY minglora_calls_update_creator ON public.calls
FOR UPDATE TO authenticated USING (created_by=(select auth.uid()))
WITH CHECK (created_by=(select auth.uid()));
CREATE POLICY minglora_calls_delete_creator ON public.calls
FOR DELETE TO authenticated USING (created_by=(select auth.uid()));

CREATE POLICY minglora_call_participants_read ON public.call_participants
FOR SELECT TO authenticated
USING (user_id=(select auth.uid()) OR EXISTS (
  SELECT 1 FROM public.calls c WHERE c.id=call_id AND c.created_by=(select auth.uid())
));
CREATE POLICY minglora_call_participants_insert ON public.call_participants
FOR INSERT TO authenticated WITH CHECK (
  user_id=(select auth.uid()) OR EXISTS (
    SELECT 1 FROM public.calls c WHERE c.id=call_id AND c.created_by=(select auth.uid())
  )
);
CREATE POLICY minglora_call_participants_update_self ON public.call_participants
FOR UPDATE TO authenticated USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()));
CREATE POLICY minglora_call_participants_delete_self ON public.call_participants
FOR DELETE TO authenticated USING (user_id=(select auth.uid()));

-- Check-ins, preferences, fundraiser/payment records and data-rights requests.

CREATE POLICY minglora_checkins_read ON public.checkins
FOR SELECT TO anon, authenticated
USING (
  audience='public'
  OR user_id=(select auth.uid())
  OR (
    audience='followers'
    AND EXISTS (
      SELECT 1 FROM public.user_follows f
      WHERE f.follower_id=(select auth.uid()) AND f.followed_id=checkins.user_id
    )
  )
  OR (
    audience='friends'
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status='accepted'
        AND (
          (f.requester_id=checkins.user_id AND f.recipient_id=(select auth.uid()))
          OR (f.recipient_id=checkins.user_id AND f.requester_id=(select auth.uid()))
        )
    )
  )
);
CREATE POLICY minglora_checkins_insert_self ON public.checkins
FOR INSERT TO authenticated WITH CHECK (user_id=(select auth.uid()));
CREATE POLICY minglora_checkins_update_self ON public.checkins
FOR UPDATE TO authenticated USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()));
CREATE POLICY minglora_checkins_delete_self ON public.checkins
FOR DELETE TO authenticated USING (user_id=(select auth.uid()));

CREATE POLICY minglora_notification_preferences_self ON public.notification_preferences
FOR ALL TO authenticated USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()));
CREATE POLICY minglora_memory_preferences_self ON public.memory_preferences
FOR ALL TO authenticated USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()));
CREATE POLICY minglora_memory_exclusions_self ON public.memory_exclusions
FOR ALL TO authenticated USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()));

CREATE POLICY minglora_fundraisers_read ON public.fundraisers
FOR SELECT TO anon, authenticated USING (status='active' OR organizer_id=(select auth.uid()));
CREATE POLICY minglora_fundraisers_insert_self ON public.fundraisers
FOR INSERT TO authenticated WITH CHECK (organizer_id=(select auth.uid()) AND status='draft');
CREATE POLICY minglora_fundraisers_update_self ON public.fundraisers
FOR UPDATE TO authenticated USING (organizer_id=(select auth.uid()))
WITH CHECK (organizer_id=(select auth.uid()));
CREATE POLICY minglora_donations_read_participant ON public.fundraiser_donations
FOR SELECT TO authenticated
USING (
  donor_user_id=(select auth.uid()) OR EXISTS (
    SELECT 1 FROM public.fundraisers f
    WHERE f.id=fundraiser_id AND f.organizer_id=(select auth.uid())
  )
);

CREATE POLICY minglora_data_rights_read_self ON public.data_rights_requests
FOR SELECT TO authenticated USING (user_id=(select auth.uid()));
CREATE POLICY minglora_data_rights_insert_self ON public.data_rights_requests
FOR INSERT TO authenticated WITH CHECK (user_id=(select auth.uid()) AND status='requested');
CREATE POLICY minglora_video_history_self ON public.video_watch_history
FOR ALL TO authenticated USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()));

-- Storage buckets. Member-specific paths must begin with the authenticated UUID.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES
 ('minglora-avatars','minglora-avatars',true,10485760,ARRAY['image/jpeg','image/png','image/webp','image/avif']),
 ('minglora-covers','minglora-covers',true,20971520,ARRAY['image/jpeg','image/png','image/webp','image/avif']),
 ('minglora-post-media','minglora-post-media',false,524288000,ARRAY['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/ogg','audio/webm','model/gltf-binary']),
 ('minglora-stories','minglora-stories',false,209715200,ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']),
 ('minglora-short-videos','minglora-short-videos',false,1073741824,ARRAY['video/mp4','video/webm','video/quicktime']),
 ('minglora-message-attachments','minglora-message-attachments',false,104857600,ARRAY['image/jpeg','image/png','image/webp','video/mp4','audio/mpeg','audio/mp4','audio/ogg','application/pdf']),
 ('minglora-group-media','minglora-group-media',false,262144000,ARRAY['image/jpeg','image/png','image/webp','video/mp4']),
 ('minglora-page-media','minglora-page-media',false,262144000,ARRAY['image/jpeg','image/png','image/webp','video/mp4']),
 ('minglora-marketplace-media','minglora-marketplace-media',false,262144000,ARRAY['image/jpeg','image/png','image/webp','video/mp4']),
 ('minglora-live-thumbnails','minglora-live-thumbnails',false,20971520,ARRAY['image/jpeg','image/png','image/webp']),
 ('minglora-data-exports','minglora-data-exports',false,104857600,ARRAY['application/zip','application/json','text/csv','application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE POLICY minglora_avatars_insert_owner ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id='minglora-avatars' AND (storage.foldername(name))[1]=(select auth.uid())::text
);
CREATE POLICY minglora_avatars_update_owner ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id='minglora-avatars' AND (storage.foldername(name))[1]=(select auth.uid())::text
) WITH CHECK (
  bucket_id='minglora-avatars' AND (storage.foldername(name))[1]=(select auth.uid())::text
);
CREATE POLICY minglora_avatars_delete_owner ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id='minglora-avatars' AND (storage.foldername(name))[1]=(select auth.uid())::text
);
CREATE POLICY minglora_covers_insert_owner ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id='minglora-covers' AND (storage.foldername(name))[1]=(select auth.uid())::text
);
CREATE POLICY minglora_covers_update_owner ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id='minglora-covers' AND (storage.foldername(name))[1]=(select auth.uid())::text
) WITH CHECK (
  bucket_id='minglora-covers' AND (storage.foldername(name))[1]=(select auth.uid())::text
);
CREATE POLICY minglora_covers_delete_owner ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id='minglora-covers' AND (storage.foldername(name))[1]=(select auth.uid())::text
);

DO $$
DECLARE bucket_name text;
BEGIN
  FOREACH bucket_name IN ARRAY ARRAY[
    'minglora-post-media','minglora-stories','minglora-short-videos',
    'minglora-message-attachments','minglora-group-media','minglora-page-media',
    'minglora-marketplace-media','minglora-live-thumbnails','minglora-data-exports'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id=%L AND (storage.foldername(name))[1]=(select auth.uid())::text)',
      bucket_name || '_read_owner', bucket_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id=%L AND (storage.foldername(name))[1]=(select auth.uid())::text)',
      bucket_name || '_insert_owner', bucket_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id=%L AND (storage.foldername(name))[1]=(select auth.uid())::text) WITH CHECK (bucket_id=%L AND (storage.foldername(name))[1]=(select auth.uid())::text)',
      bucket_name || '_update_owner', bucket_name, bucket_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id=%L AND (storage.foldername(name))[1]=(select auth.uid())::text)',
      bucket_name || '_delete_owner', bucket_name
    );
  END LOOP;
END $$;

-- Realtime publishes only stateful, RLS-protected user-facing records.
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.live_broadcasts REPLICA IDENTITY FULL;
ALTER TABLE public.live_participants REPLICA IDENTITY FULL;
ALTER TABLE public.comments REPLICA IDENTITY FULL;
ALTER TABLE public.post_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.friendships REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY[
      'messages','notifications','live_broadcasts','live_participants',
      'comments','post_reactions','friendships','conversations'
    ] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

COMMIT;