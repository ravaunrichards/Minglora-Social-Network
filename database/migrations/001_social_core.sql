-- Minglora relational social-network core.
-- DESIGN FOUNDATION ONLY: the current JSON-backed server does not apply this migration.
-- Review and test on a disposable PostgreSQL database before adopting it.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deactivated','pending_deletion')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_status_created_idx ON users (status, created_at DESC);

CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  bio text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  avatar_asset_id uuid,
  cover_asset_id uuid,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','friends','private')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id, blocker_id);

CREATE TABLE IF NOT EXISTS user_follows (
  follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);
CREATE INDEX IF NOT EXISTS user_follows_followed_idx ON user_follows (followed_id, created_at DESC);

CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('like','love','care','haha','wow','sad','angry')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_reactions_user_idx ON post_reactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_post_created_idx ON comments (post_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments (parent_id, created_at ASC) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS saved_posts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  collection_name text NOT NULL DEFAULT 'Saved',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS social_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private','hidden')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_groups_discovery_idx ON social_groups (visibility, status, created_at DESC);
CREATE TABLE IF NOT EXISTS group_memberships (
  group_id uuid NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','moderator','admin','owner')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('requested','active','banned','left')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_memberships_user_idx ON group_memberships (user_id, status, joined_at DESC);

CREATE TABLE IF NOT EXISTS group_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pages_handle_lower_uq ON pages (lower(handle));
CREATE TABLE IF NOT EXISTS page_roles (
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','editor','analyst','moderator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, user_id)
);

CREATE TABLE IF NOT EXISTS page_follows (
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, user_id)
);
CREATE INDEX IF NOT EXISTS page_follows_user_idx ON page_follows (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS page_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  published_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
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
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  viewer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct','group')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
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
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
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
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
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
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response text NOT NULL CHECK (response IN ('going','interested','not_going')),
  responded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_type text NOT NULL CHECK (target_type IN ('user','post','comment','group','page','message','event','listing','media')),
  target_id uuid NOT NULL,
  category text NOT NULL,
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','actioned','dismissed','appealed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS reports_queue_idx ON reports (status, created_at ASC);

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
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
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id, created_at DESC);
COMMIT;
