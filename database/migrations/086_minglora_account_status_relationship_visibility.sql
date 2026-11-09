BEGIN;

-- Account states are public relationship metadata, not a reason to destroy
-- follows/friendships. Auth remains the source of truth for these states.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_account_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_status_check
      CHECK (account_status IN ('active', 'banned', 'restricted', 'suspended', 'deactivated'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.minglora_account_status_from_auth(
  app_metadata jsonb,
  user_metadata jsonb,
  auth_banned_until timestamptz
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  resolved_status text;
BEGIN
  resolved_status := lower(coalesce(
    app_metadata ->> 'account_status',
    user_metadata ->> 'account_status',
    'active'
  ));

  IF auth_banned_until IS NOT NULL AND auth_banned_until > now() THEN
    RETURN 'banned';
  END IF;

  IF resolved_status = 'banned' THEN
    resolved_status := lower(coalesce(
      app_metadata ->> 'pre_ban_account_status',
      user_metadata ->> 'pre_ban_account_status',
      'active'
    ));
  END IF;

  IF resolved_status NOT IN ('active', 'restricted', 'suspended', 'deactivated') THEN
    resolved_status := 'active';
  END IF;

  RETURN resolved_status;
END;
$$;

-- Keep the profile column authoritative from Supabase Auth metadata. Clients
-- cannot self-clear a ban/restriction by writing directly to public.profiles.
CREATE OR REPLACE FUNCTION private.enforce_minglora_profile_account_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  auth_user auth.users%ROWTYPE;
BEGIN
  SELECT *
    INTO auth_user
    FROM auth.users
   WHERE id = NEW.id;

  IF NOT FOUND THEN
    NEW.account_status := 'active';
    RETURN NEW;
  END IF;

  NEW.account_status := private.minglora_account_status_from_auth(
    coalesce(auth_user.raw_app_meta_data, '{}'::jsonb),
    coalesce(auth_user.raw_user_meta_data, '{}'::jsonb),
    auth_user.banned_until
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_minglora_profile_account_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_minglora_profile_account_status ON public.profiles;
CREATE TRIGGER protect_minglora_profile_account_status
  BEFORE INSERT OR UPDATE OF account_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.enforce_minglora_profile_account_status();

CREATE OR REPLACE FUNCTION private.sync_minglora_profile_account_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  next_status text;
BEGIN
  next_status := private.minglora_account_status_from_auth(
    coalesce(NEW.raw_app_meta_data, '{}'::jsonb),
    coalesce(NEW.raw_user_meta_data, '{}'::jsonb),
    NEW.banned_until
  );

  UPDATE public.profiles
     SET account_status = next_status,
         updated_at = now()
   WHERE id = NEW.id
     AND account_status IS DISTINCT FROM next_status;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_minglora_profile_account_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_minglora_auth_user_status_synced ON auth.users;
CREATE TRIGGER on_minglora_auth_user_status_synced
  AFTER INSERT OR UPDATE OF raw_app_meta_data, raw_user_meta_data, banned_until
  ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.sync_minglora_profile_account_status();

-- Backfill existing Auth identities without inserting or deleting any users.
UPDATE public.profiles AS profile
   SET account_status = private.minglora_account_status_from_auth(
     coalesce(auth_user.raw_app_meta_data, '{}'::jsonb),
     coalesce(auth_user.raw_user_meta_data, '{}'::jsonb),
     auth_user.banned_until
   )
  FROM auth.users AS auth_user
 WHERE auth_user.id = profile.id
   AND profile.account_status IS DISTINCT FROM private.minglora_account_status_from_auth(
     coalesce(auth_user.raw_app_meta_data, '{}'::jsonb),
     coalesce(auth_user.raw_user_meta_data, '{}'::jsonb),
     auth_user.banned_until
   );

COMMENT ON COLUMN public.profiles.account_status IS
  'Public account state synchronized from protected Supabase Auth metadata. Only active accounts contribute to active social relationship totals.';

COMMIT;
