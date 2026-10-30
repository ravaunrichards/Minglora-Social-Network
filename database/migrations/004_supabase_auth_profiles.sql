-- Minglora Supabase Auth -> public profile records.
-- Apply ONLY to the dedicated Minglora Supabase project.
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

DROP POLICY IF EXISTS "Minglora profiles are readable" ON public.profiles;
CREATE POLICY "Minglora profiles are readable"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Members update their own Minglora profile" ON public.profiles;
CREATE POLICY "Members update their own Minglora profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT UPDATE (display_name, bio, location, avatar_url, cover_url, updated_at)
  ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_minglora_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_username text;
  profile_name text;
BEGIN
  profile_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  IF profile_username !~ '^[a-z0-9_]{3,30}

  profile_name := trim(coalesce(
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'full_name',
    'Minglora Member'
  ));
  IF length(profile_name) < 2 THEN
    profile_name := 'Minglora Member';
  END IF;
  profile_name := left(profile_name, 120);

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (new.id, profile_username, profile_name);

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_minglora_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_minglora_auth_user_created ON auth.users;
CREATE TRIGGER on_minglora_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_minglora_user();

-- Backfill Auth users that predate this trigger. Keep valid unique usernames;
-- use a stable ID-derived handle when metadata is missing or duplicated.
WITH candidates AS (
  SELECT
    u.id,
    lower(trim(coalesce(u.raw_user_meta_data ->> 'username', ''))) AS requested_username,
    left(trim(coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1), 'Minglora Member')), 120) AS display_name,
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
      WHEN requested_username ~ '^[a-z0-9_]{3,30}
 THEN
    profile_username := 'member_' || left(replace(new.id::text, '-', ''), 23);
  END IF;

  profile_name := trim(coalesce(
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'full_name',
    'Minglora Member'
  ));
  IF length(profile_name) < 2 THEN
    profile_name := 'Minglora Member';
  END IF;
  profile_name := left(profile_name, 120);

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (new.id, profile_username, profile_name);

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_minglora_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_minglora_auth_user_created ON auth.users;
CREATE TRIGGER on_minglora_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_minglora_user();

COMMIT;
 AND username_rank = 1
        THEN requested_username
      ELSE 'member_' || left(replace(id::text, '-', ''), 23)
    END AS username,
    CASE WHEN length(display_name) >= 2 THEN display_name ELSE 'Minglora Member' END AS display_name
  FROM candidates
)
INSERT INTO public.profiles (id, username, display_name)
SELECT id, username, display_name
FROM normalized
ON CONFLICT (id) DO NOTHING;

COMMIT;
 THEN
    profile_username := 'member_' || left(replace(new.id::text, '-', ''), 23);
  END IF;

  profile_name := trim(coalesce(
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'full_name',
    'Minglora Member'
  ));
  IF length(profile_name) < 2 THEN
    profile_name := 'Minglora Member';
  END IF;
  profile_name := left(profile_name, 120);

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (new.id, profile_username, profile_name);

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_minglora_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_minglora_auth_user_created ON auth.users;
CREATE TRIGGER on_minglora_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_minglora_user();

COMMIT;
