-- Member-level privacy, reporting and public profile reads for AI identities.
-- AI blocks/reports are separate from human account blocks and human follows.
BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_identity_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id,user_id)
);
CREATE INDEX IF NOT EXISTS ai_identity_blocks_user_created_idx
  ON public.ai_identity_blocks (user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_identity_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN (
    'impersonation','spam','misleading_identity','inappropriate_content',
    'harassment','privacy','other'
  )),
  details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 2000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_review','actioned','dismissed')),
  resolution_note text NOT NULL DEFAULT '' CHECK (char_length(resolution_note) <= 1200),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id,reporter_user_id)
);
CREATE INDEX IF NOT EXISTS ai_identity_reports_status_created_idx
  ON public.ai_identity_reports (status,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_identity_reports_identity_idx
  ON public.ai_identity_reports (identity_id,created_at DESC);

ALTER TABLE public.ai_identity_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_identity_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_identity_blocks TO service_role;
ALTER TABLE public.ai_identity_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_identity_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_identity_reports TO service_role;

CREATE OR REPLACE FUNCTION public.ai_identity_follow_block_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status='active' AND EXISTS (
    SELECT 1 FROM public.ai_identity_blocks AS block
    WHERE block.identity_id=NEW.identity_id
      AND block.user_id=NEW.follower_user_id
  ) THEN
    RAISE EXCEPTION 'This AI identity is blocked by this member.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ai_identity_follow_block_guard_trigger ON public.ai_identity_followers;
CREATE TRIGGER ai_identity_follow_block_guard_trigger
BEFORE INSERT OR UPDATE OF status ON public.ai_identity_followers
FOR EACH ROW EXECUTE FUNCTION public.ai_identity_follow_block_guard();

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_block_set(
  p_identity_id uuid,
  p_user_id uuid,
  p_block boolean,
  p_reason text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_identity public.ai_identities;
  v_blocked boolean;
BEGIN
  IF p_identity_id IS NULL OR p_user_id IS NULL OR p_block IS NULL OR
     pg_catalog.char_length(COALESCE(p_reason,'')) > 300 THEN
    RAISE EXCEPTION 'AI profile block values are invalid.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_identity
  FROM public.ai_identities AS identity
  WHERE identity.identity_id=p_identity_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI identity not found.' USING ERRCODE = '23503';
  END IF;

  IF p_block THEN
    INSERT INTO public.ai_identity_blocks(identity_id,user_id,reason)
    VALUES(p_identity_id,p_user_id,pg_catalog.btrim(COALESCE(p_reason,'')))
    ON CONFLICT(identity_id,user_id) DO UPDATE
      SET reason=EXCLUDED.reason,created_at=pg_catalog.now();
    UPDATE public.ai_identity_followers
    SET status='removed',updated_at=pg_catalog.now()
    WHERE identity_id=p_identity_id AND follower_user_id=p_user_id AND status='active';
    v_blocked:=true;
  ELSE
    DELETE FROM public.ai_identity_blocks
    WHERE identity_id=p_identity_id AND user_id=p_user_id;
    v_blocked:=false;
  END IF;

  INSERT INTO public.ai_identity_audit_logs (
    identity_id,actor_user_id,action,target_type,target_id,summary,metadata
  ) VALUES (
    p_identity_id,p_user_id,
    CASE WHEN p_block THEN 'safety.profile_blocked' ELSE 'safety.profile_unblocked' END,
    'ai_identity',p_identity_id::text,
    CASE WHEN p_block THEN 'A Minglora member blocked an AI identity.' ELSE 'A Minglora member unblocked an AI identity.' END,
    pg_catalog.jsonb_build_object('memberId',p_user_id,'blocked',v_blocked)
  );

  RETURN pg_catalog.jsonb_build_object('identityId',p_identity_id,'blocked',v_blocked);
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_block_list(
  p_user_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    pg_catalog.jsonb_agg(result.item ORDER BY result.created_at DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT pg_catalog.jsonb_build_object(
      'identityId',identity.identity_id,
      'displayName',names.display_name,
      'username',names.username,
      'publicProfileSlug',identity.public_profile_slug,
      'createdAt',block.created_at
    ) AS item,
    block.created_at
    FROM public.ai_identity_blocks AS block
    JOIN public.ai_identities AS identity ON identity.identity_id=block.identity_id
    LEFT JOIN public.ai_names AS names ON names.identity_id=identity.identity_id
    WHERE block.user_id=p_user_id
    ORDER BY block.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),500)
    OFFSET GREATEST(COALESCE(p_offset,0),0)
  ) AS result;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_report_create(
  p_identity_id uuid,
  p_reporter_user_id uuid,
  p_reason text,
  p_details text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_row public.ai_identity_reports;
BEGIN
  IF p_identity_id IS NULL OR p_reporter_user_id IS NULL OR
     p_reason NOT IN ('impersonation','spam','misleading_identity','inappropriate_content','harassment','privacy','other') OR
     pg_catalog.char_length(COALESCE(p_details,'')) > 2000 THEN
    RAISE EXCEPTION 'AI profile report values are invalid.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.ai_identities AS identity
    JOIN public.ai_profiles AS profile ON profile.identity_id=identity.identity_id
    WHERE identity.identity_id=p_identity_id
      AND identity.status='active'
      AND identity.public_profile_enabled=true
      AND profile.visibility='public'
      AND NOT EXISTS (
        SELECT 1 FROM public.ai_identity_blocks AS block
        WHERE block.identity_id=identity.identity_id AND block.user_id=p_reporter_user_id
      )
  ) THEN
    RAISE EXCEPTION 'AI profile is unavailable for reporting.' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.ai_identity_reports (
    identity_id,reporter_user_id,reason,details,status
  ) VALUES (
    p_identity_id,p_reporter_user_id,p_reason,pg_catalog.btrim(COALESCE(p_details,'')),'pending'
  )
  ON CONFLICT(identity_id,reporter_user_id) DO UPDATE SET
    reason=EXCLUDED.reason,
    details=EXCLUDED.details,
    status='pending',
    resolution_note='',
    reviewed_by=NULL,
    reviewed_at=NULL,
    updated_at=pg_catalog.now()
  RETURNING * INTO v_row;

  INSERT INTO public.ai_identity_audit_logs (
    identity_id,actor_user_id,action,target_type,target_id,summary,metadata
  ) VALUES (
    p_identity_id,p_reporter_user_id,'safety.profile_reported','ai_identity_report',
    v_row.id::text,'A Minglora member submitted an AI profile safety report.',
    pg_catalog.jsonb_build_object('reason',p_reason,'reportId',v_row.id)
  );

  RETURN pg_catalog.jsonb_build_object(
    'reportId',v_row.id,'identityId',v_row.identity_id,
    'status',v_row.status,'createdAt',v_row.created_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_public_profile_get(
  p_slug text,
  p_viewer_user_id uuid
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'identityId',identity.identity_id,
    'ownerAdminId',identity.owner_admin_id,
    'population',identity.population,
    'identityType',identity.identity_type,
    'categoryId',identity.category_id,
    'categoryName',COALESCE(category.name,'AI member'),
    'categoryDescription',COALESCE(category.description,''),
    'publicProfileSlug',identity.public_profile_slug,
    'firstName',names.first_name,
    'middleName',names.middle_name,
    'lastName',names.last_name,
    'displayName',names.display_name,
    'username',names.username,
    'biography',profile.biography,
    'introduction',profile.introduction,
    'gender',profile.gender,
    'genderPresentation',profile.gender_presentation,
    'nationality',profile.nationality,
    'countryOfOrigin',profile.country_of_origin,
    'currentCountry',profile.current_country,
    'timeZone',profile.time_zone,
    'personality',profile.personality,
    'communicationStyle',profile.communication_style,
    'interests',profile.interests,
    'hobbies',profile.hobbies,
    'education',profile.education,
    'profession',profile.profession,
    'skills',profile.skills,
    'visibility',profile.visibility,
    'isFollowing',EXISTS(
      SELECT 1 FROM public.ai_identity_followers AS follower
      WHERE follower.identity_id=identity.identity_id
        AND follower.follower_user_id=p_viewer_user_id
        AND follower.status='active'
    ),
    'isBlocked',EXISTS(
      SELECT 1 FROM public.ai_identity_blocks AS block
      WHERE block.identity_id=identity.identity_id AND block.user_id=p_viewer_user_id
    ),
    'followersCount',(
      SELECT pg_catalog.count(*) FROM public.ai_identity_followers AS follower
      WHERE follower.identity_id=identity.identity_id AND follower.status='active'
    ),
    'languages',(
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'code',language.language_code,'name',language.language_name,'dialect',language.dialect
      ) ORDER BY language.language_name),'[]'::jsonb)
      FROM public.ai_identity_languages AS language WHERE language.identity_id=identity.identity_id
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
      WHERE location.identity_id=identity.identity_id AND location.location_type IN ('origin','current')
    ),
    'createdAt',identity.created_at,
    'updatedAt',GREATEST(identity.updated_at,profile.updated_at)
  )
  FROM public.ai_identities AS identity
  JOIN public.ai_names AS names ON names.identity_id=identity.identity_id
  JOIN public.ai_profiles AS profile ON profile.identity_id=identity.identity_id
  LEFT JOIN public.minglora_ai_bot_categories AS category ON category.id=identity.category_id
  WHERE identity.public_profile_slug=p_slug
    AND identity.status='active'
    AND identity.public_profile_enabled=true
    AND profile.visibility='public'
    AND NOT EXISTS (
      SELECT 1 FROM public.ai_identity_blocks AS block
      WHERE block.identity_id=identity.identity_id AND block.user_id=p_viewer_user_id
    )
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.minglora_ai_identity_block_set(uuid,uuid,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_identity_block_set(uuid,uuid,boolean,text) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_identity_block_list(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_identity_block_list(uuid,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_identity_report_create(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_identity_report_create(uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_identity_public_profile_get(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_identity_public_profile_get(text,uuid) TO service_role;

COMMIT;
