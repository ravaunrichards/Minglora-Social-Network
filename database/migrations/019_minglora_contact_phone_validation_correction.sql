-- Keeps the profile and Auth-user signup trigger phone rules identical.
BEGIN;
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_contact_phone_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_contact_phone_format
  CHECK (contact_phone = '' OR contact_phone ~ '^\+[1-9][0-9]{7,14}$');

CREATE OR REPLACE FUNCTION private.handle_new_minglora_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  requested_username text;
  fallback_username text;
  requested_name text;
  requested_phone text;
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

  requested_phone := trim(coalesce(
    new.raw_user_meta_data ->> 'phone_number',
    new.raw_user_meta_data ->> 'contact_phone',
    ''
  ));
  IF requested_phone <> ''
     AND requested_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Contact phone must be in international E.164 format'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.profiles (
      id, username, display_name, contact_phone,
      country, county, parish, city, gender, relationship_status
    )
    VALUES (
      new.id,
      requested_username,
      requested_name,
      requested_phone,
      left(coalesce(new.raw_user_meta_data ->> 'country', ''), 100),
      left(coalesce(new.raw_user_meta_data ->> 'county', ''), 100),
      left(coalesce(new.raw_user_meta_data ->> 'parish', ''), 100),
      left(coalesce(new.raw_user_meta_data ->> 'city', ''), 100),
      left(coalesce(new.raw_user_meta_data ->> 'gender', ''), 80),
      left(coalesce(new.raw_user_meta_data ->> 'relationshipStatus', ''), 80)
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public.profiles (id, username, display_name, contact_phone)
    VALUES (new.id, fallback_username, requested_name, requested_phone)
    ON CONFLICT (id) DO NOTHING;
  END;
  RETURN new;
END;
$function$;
COMMIT;