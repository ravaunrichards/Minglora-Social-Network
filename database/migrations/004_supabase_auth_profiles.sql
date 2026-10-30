-- Minglora Supabase Auth -> public profile records.
-- Apply ONLY to Minglora's dedicated Supabase project.
BEGIN;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 120),
  bio text NOT NULL DEFAULT '' CHECK (length(bio) <= 500),
  location text NOT NULL DEFAULT '' CHECK (length(location) <= 120),
  avatar_url text NOT NULL DEFAULT '',
  cover_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uq
  ON public.profiles (lower(username));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon, authenticated;

DROP POLICY IF EXISTS "Minglora profiles are readable" ON public.profiles;
CREATE POLICY "Minglora profiles are readable"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Members update their own Minglora profile" ON public.profiles;
CREATE POLICY "Members update their own Minglora profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT UPDATE (display_name, bio, location, avatar_url, cover_url)
  ON public.profiles TO authenticated;

-- Keep privileged trigger functions outside exposed schemas.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL PRIVILEGES ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.set_minglora_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.set_minglora_profile_updated_at()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_minglora_profile_updated_at ON public.profiles;
CREATE TRIGGER set_minglora_profile_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.set_minglora_profile_updated_at();

CREATE OR REPLACE FUNCTION private.handle_new_minglora_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_username text;
  fallback_username text;
  profile_name text;
BEGIN
  profile_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  fallback_username := 'member_' || left(replace(new.id::text, '-', ''), 23);

  IF profile_username !~ '^[a-z0-9_]{3,30}$' THEN
    profile_username := fallback_username;
  END IF;

  profile_name := left(trim(coalesce(
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'full_name',
    'Minglora Member'
  )), 120);

  IF length(profile_name) < 2 THEN
    profile_name := 'Minglora Member';
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (new.id, profile_username, profile_name)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- A requested handle may already belong to another account.
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (new.id, fallback_username, profile_name)
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION private.handle_new_minglora_user()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_minglora_auth_user_created ON auth.users;
CREATE TRIGGER on_minglora_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_new_minglora_user();

-- Backfill Auth users created before this trigger was installed.
-- Duplicate or malformed requested usernames receive a stable ID-derived handle.
WITH candidates AS (
  SELECT
    u.id,
    lower(trim(coalesce(u.raw_user_meta_data ->> 'username', ''))) AS requested_username,
    left(trim(coalesce(
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(u.email, ''), '@', 1),
      'Minglora Member'
    )), 120) AS requested_display_name,
    u.created_at,
    row_number() OVER (
      PARTITION BY lower(trim(coalesce(u.raw_user_meta_data ->> 'username', '')))
      ORDER BY u.created_at, u.id
    ) AS username_rank
  FROM auth.users AS u
),
normalized AS (
  SELECT
    id,
    CASE
      WHEN requested_username ~ '^[a-z0-9_]{3,30}$' AND username_rank = 1
        THEN requested_username
      ELSE 'member_' || left(replace(id::text, '-', ''), 23)
    END AS username,
    CASE
      WHEN length(requested_display_name) >= 2 THEN requested_display_name
      ELSE 'Minglora Member'
    END AS display_name
  FROM candidates
)
INSERT INTO public.profiles (id, username, display_name)
SELECT id, username, display_name
FROM normalized
ON CONFLICT (id) DO NOTHING;

COMMIT;
