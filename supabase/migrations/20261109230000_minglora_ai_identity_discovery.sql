-- Public, privacy-safe AI identity discovery.
-- Only identities explicitly approved for public exposure are discoverable.
BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_identity_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  follower_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  exclude_from_human_follow_counts boolean NOT NULL DEFAULT true CHECK (exclude_from_human_follow_counts),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id,follower_user_id)
);
ALTER TABLE public.ai_identity_followers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_identity_followers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_identity_followers TO service_role;

CREATE INDEX IF NOT EXISTS ai_identity_followers_identity_active_idx
  ON public.ai_identity_followers (identity_id,created_at DESC) WHERE status='active';
CREATE INDEX IF NOT EXISTS ai_identity_followers_user_active_idx
  ON public.ai_identity_followers (follower_user_id,created_at DESC) WHERE status='active';

CREATE INDEX IF NOT EXISTS ai_identities_public_discovery_idx
  ON public.ai_identities (status,population,category_id,created_at DESC)
  WHERE public_profile_enabled = true;
CREATE INDEX IF NOT EXISTS ai_profiles_public_gender_country_idx
  ON public.ai_profiles (gender,current_country,profession)
  WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS ai_profiles_public_search_idx
  ON public.ai_profiles USING gin (
    to_tsvector(
      'simple',
      COALESCE(biography,'') || ' ' ||
      COALESCE(introduction,'') || ' ' ||
      COALESCE(personality,'') || ' ' ||
      COALESCE(communication_style,'') || ' ' ||
      COALESCE(profession,'')
    )
  )
  WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS ai_names_discovery_username_idx
  ON public.ai_names (username);
CREATE INDEX IF NOT EXISTS ai_locations_discovery_region_idx
  ON public.ai_identity_locations (country_code,state_province,parish_county,city)
  WHERE location_type = 'current';
CREATE INDEX IF NOT EXISTS ai_languages_discovery_code_idx
  ON public.ai_identity_languages (language_code,identity_id);
CREATE INDEX IF NOT EXISTS ai_capabilities_verified_discovery_idx
  ON public.ai_identity_capabilities (capability_code,identity_id)
  WHERE enabled = true AND verification_status = 'verified';

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_discover(
  p_search text DEFAULT '',
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_sort text DEFAULT 'newest',
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0,
  p_viewer_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_search text := pg_catalog.btrim(COALESCE(p_search,''));
  v_sort text := COALESCE(NULLIF(p_sort,''),'newest');
  v_key text;
  v_result jsonb;
BEGIN
  IF pg_catalog.char_length(v_search) > 160 THEN
    RAISE EXCEPTION 'AI discovery search text is too long.' USING ERRCODE = '22023';
  END IF;
  IF p_filters IS NULL OR pg_catalog.jsonb_typeof(p_filters) <> 'object' THEN
    RAISE EXCEPTION 'AI discovery filters must be an object.' USING ERRCODE = '22023';
  END IF;
  IF v_sort NOT IN ('newest','recently_updated') OR
     p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR
     p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000000 THEN
    RAISE EXCEPTION 'AI discovery sort or pagination is invalid.' USING ERRCODE = '22023';
  END IF;

  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(p_filters)
  LOOP
    IF v_key NOT IN (
      'gender','nationality','countryOfOrigin','currentCountry','countryCode',
      'stateProvince','parishCounty','city','language','category','profession',
      'personality','interest','capability'
    ) THEN
      RAISE EXCEPTION 'AI discovery contains an unsupported filter.' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.jsonb_typeof(p_filters->v_key) <> 'array' OR
       pg_catalog.jsonb_array_length(p_filters->v_key) > 50 THEN
      RAISE EXCEPTION 'Each AI discovery filter must be an array with at most 50 values.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  WITH filtered AS (
    SELECT
      identity.identity_id,
      identity.owner_admin_id,
      identity.population,
      identity.identity_type,
      identity.category_id,
      identity.public_profile_slug,
      identity.created_at,
      identity.updated_at AS identity_updated_at,
      names.first_name,
      names.middle_name,
      names.last_name,
      names.full_name,
      names.display_name,
      names.username,
      profile.biography,
      profile.introduction,
      profile.gender,
      profile.gender_presentation,
      profile.nationality,
      profile.country_of_origin,
      profile.current_country,
      profile.time_zone,
      profile.personality,
      profile.communication_style,
      profile.interests,
      profile.hobbies,
      profile.profession,
      profile.skills,
      profile.updated_at AS profile_updated_at,
      COALESCE(category.name,'') AS category_name,
      COALESCE(category.description,'') AS category_description
    FROM public.ai_identities AS identity
    JOIN public.ai_names AS names ON names.identity_id = identity.identity_id
    JOIN public.ai_profiles AS profile ON profile.identity_id = identity.identity_id
    LEFT JOIN public.minglora_ai_bot_categories AS category ON category.id = identity.category_id
    WHERE identity.status = 'active'
      AND identity.public_profile_enabled = true
      AND profile.visibility = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM public.ai_identity_blocks AS block
        WHERE block.identity_id=identity.identity_id
          AND block.user_id=p_viewer_user_id
      )
      AND (
        v_search = '' OR
        names.display_name ILIKE '%' || v_search || '%' OR
        names.username ILIKE '%' || v_search || '%' OR
        profile.biography ILIKE '%' || v_search || '%' OR
        profile.introduction ILIKE '%' || v_search || '%' OR
        profile.profession ILIKE '%' || v_search || '%' OR
        pg_catalog.to_tsvector(
          'simple',
          COALESCE(profile.personality,'') || ' ' ||
          COALESCE(profile.communication_style,'') || ' ' ||
          COALESCE(profile.interests::text,'') || ' ' ||
          COALESCE(profile.hobbies::text,'')
        ) @@ pg_catalog.plainto_tsquery('simple',v_search)
      )
      AND (
        NOT (p_filters ? 'gender') OR EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_filters->'gender') AS f(value)
          WHERE pg_catalog.lower(f.value)=profile.gender
        )
      )
      AND (
        NOT (p_filters ? 'nationality') OR EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_filters->'nationality') AS f(value)
          WHERE pg_catalog.lower(f.value)=pg_catalog.lower(profile.nationality)
        )
      )
      AND (
        NOT (p_filters ? 'countryOfOrigin') OR EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_filters->'countryOfOrigin') AS f(value)
          WHERE pg_catalog.lower(f.value)=pg_catalog.lower(profile.country_of_origin)
        )
      )
      AND (
        NOT (p_filters ? 'currentCountry') OR EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_filters->'currentCountry') AS f(value)
          WHERE pg_catalog.lower(f.value)=pg_catalog.lower(profile.current_country)
        )
      )
      AND (
        NOT (p_filters ? 'countryCode') OR EXISTS (
          SELECT 1 FROM public.ai_identity_locations AS location
          JOIN pg_catalog.jsonb_array_elements_text(p_filters->'countryCode') AS f(value)
            ON pg_catalog.upper(f.value)=location.country_code
          WHERE location.identity_id=identity.identity_id
            AND location.location_type='current'
        )
      )
      AND (
        NOT (p_filters ? 'stateProvince') OR EXISTS (
          SELECT 1 FROM public.ai_identity_locations AS location
          JOIN pg_catalog.jsonb_array_elements_text(p_filters->'stateProvince') AS f(value)
            ON pg_catalog.lower(f.value)=pg_catalog.lower(location.state_province)
          WHERE location.identity_id=identity.identity_id
            AND location.location_type='current'
        )
      )
      AND (
        NOT (p_filters ? 'parishCounty') OR EXISTS (
          SELECT 1 FROM public.ai_identity_locations AS location
          JOIN pg_catalog.jsonb_array_elements_text(p_filters->'parishCounty') AS f(value)
            ON pg_catalog.lower(f.value)=pg_catalog.lower(location.parish_county)
          WHERE location.identity_id=identity.identity_id
            AND location.location_type='current'
        )
      )
      AND (
        NOT (p_filters ? 'city') OR EXISTS (
          SELECT 1 FROM public.ai_identity_locations AS location
          JOIN pg_catalog.jsonb_array_elements_text(p_filters->'city') AS f(value)
            ON pg_catalog.lower(f.value)=pg_catalog.lower(location.city)
          WHERE location.identity_id=identity.identity_id
            AND location.location_type='current'
        )
      )
      AND (
        NOT (p_filters ? 'language') OR EXISTS (
          SELECT 1 FROM public.ai_identity_languages AS language
          JOIN pg_catalog.jsonb_array_elements_text(p_filters->'language') AS f(value)
            ON pg_catalog.lower(f.value) IN (
              pg_catalog.lower(language.language_code),
              pg_catalog.lower(language.language_name),
              pg_catalog.lower(language.dialect)
            )
          WHERE language.identity_id=identity.identity_id
        )
      )
      AND (
        NOT (p_filters ? 'category') OR EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_filters->'category') AS f(value)
          WHERE f.value=identity.category_id OR pg_catalog.lower(f.value)=pg_catalog.lower(category.name)
        )
      )
      AND (
        NOT (p_filters ? 'profession') OR EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_filters->'profession') AS f(value)
          WHERE pg_catalog.lower(f.value)=pg_catalog.lower(profile.profession)
        )
      )
      AND (
        NOT (p_filters ? 'personality') OR EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_filters->'personality') AS f(value)
          WHERE profile.personality ILIKE '%' || f.value || '%'
        )
      )
      AND (
        NOT (p_filters ? 'interest') OR EXISTS (
          SELECT 1
          FROM pg_catalog.jsonb_array_elements_text(p_filters->'interest') AS f(value)
          CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(profile.interests) AS interest(value)
          WHERE pg_catalog.lower(interest.value)=pg_catalog.lower(f.value)
        )
      )
      AND (
        NOT (p_filters ? 'capability') OR EXISTS (
          SELECT 1 FROM public.ai_identity_capabilities AS capability
          JOIN pg_catalog.jsonb_array_elements_text(p_filters->'capability') AS f(value)
            ON pg_catalog.lower(f.value)=pg_catalog.lower(capability.capability_code)
          WHERE capability.identity_id=identity.identity_id
            AND capability.enabled=true
            AND capability.verification_status='verified'
        )
      )
  ),
  page AS (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN v_sort='recently_updated' THEN GREATEST(identity_updated_at,profile_updated_at) END DESC NULLS LAST,
      created_at DESC,
      identity_id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT pg_catalog.jsonb_build_object(
    'total',(SELECT pg_catalog.count(*) FROM filtered),
    'items',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'identityId',page.identity_id,
          'ownerAdminId',page.owner_admin_id,
          'isFollowing',EXISTS (
            SELECT 1 FROM public.ai_identity_followers AS follower
            WHERE follower.identity_id=page.identity_id
              AND follower.follower_user_id=p_viewer_user_id
              AND follower.status='active'
          ),
          'followersCount',(
            SELECT pg_catalog.count(*) FROM public.ai_identity_followers AS follower
            WHERE follower.identity_id=page.identity_id AND follower.status='active'
          ),
          'population',page.population,
          'identityType',page.identity_type,
          'categoryId',page.category_id,
          'categoryName',page.category_name,
          'categoryDescription',page.category_description,
          'publicProfileSlug',page.public_profile_slug,
          'firstName',page.first_name,
          'middleName',page.middle_name,
          'lastName',page.last_name,
          'displayName',page.display_name,
          'username',page.username,
          'biography',page.biography,
          'introduction',page.introduction,
          'gender',page.gender,
          'genderPresentation',page.gender_presentation,
          'nationality',page.nationality,
          'countryOfOrigin',page.country_of_origin,
          'currentCountry',page.current_country,
          'timeZone',page.time_zone,
          'personality',page.personality,
          'communicationStyle',page.communication_style,
          'interests',page.interests,
          'hobbies',page.hobbies,
          'profession',page.profession,
          'skills',page.skills,
          'languages',(
            SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'code',language.language_code,'name',language.language_name,'dialect',language.dialect
            ) ORDER BY language.language_name),'[]'::jsonb)
            FROM public.ai_identity_languages AS language
            WHERE language.identity_id=page.identity_id
          ),
          'locations',(
            SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'locationType',location.location_type,'countryCode',location.country_code,
              'countryName',location.country_name,'stateProvince',location.state_province,
              'district',location.district,'parishCounty',location.parish_county,
              'city',location.city,'town',location.town,'timeZone',location.time_zone,
              'isPrimary',location.is_primary
            ) ORDER BY location.is_primary DESC),'[]'::jsonb)
            FROM public.ai_identity_locations AS location
            WHERE location.identity_id=page.identity_id
              AND location.location_type IN ('origin','current')
          ),
          'createdAt',page.created_at,
          'updatedAt',GREATEST(page.identity_updated_at,page.profile_updated_at)
        ) ORDER BY
          CASE WHEN v_sort='recently_updated' THEN GREATEST(page.identity_updated_at,page.profile_updated_at) END DESC NULLS LAST,
          page.created_at DESC,
          page.identity_id
      )
      FROM page
    ),'[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_ai_identity_discover(text,jsonb,text,integer,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_identity_discover(text,jsonb,text,integer,integer) TO service_role;

COMMIT;
