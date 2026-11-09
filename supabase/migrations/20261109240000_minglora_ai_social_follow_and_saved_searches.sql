-- AI-to-member relationships and saved AI discovery searches.
-- These are separate from public.user_follows and human engagement totals.
BEGIN;

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_public_owner_lookup(
  p_identity_id uuid,
  p_viewer_user_id uuid
) RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT identity.owner_admin_id
  FROM public.ai_identities AS identity
  LEFT JOIN public.ai_profiles AS profile ON profile.identity_id = identity.identity_id
  WHERE identity.identity_id = p_identity_id
    AND (
      (
        identity.status = 'active'
        AND identity.public_profile_enabled = true
        AND profile.visibility = 'public'
      )
      OR EXISTS (
        SELECT 1 FROM public.ai_identity_followers AS follower
        WHERE follower.identity_id = identity.identity_id
          AND follower.follower_user_id = p_viewer_user_id
          AND follower.status = 'active'
      )
    )
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_follow_set(
  p_identity_id uuid,
  p_follower_user_id uuid,
  p_follow boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_owner_admin_id uuid;
  v_is_following boolean := false;
  v_count bigint := 0;
BEGIN
  IF p_identity_id IS NULL OR p_follower_user_id IS NULL OR p_follow IS NULL THEN
    RAISE EXCEPTION 'AI follow identity, member and action are required.' USING ERRCODE = '22023';
  END IF;

  IF p_follow THEN
    SELECT identity.owner_admin_id INTO v_owner_admin_id
    FROM public.ai_identities AS identity
    JOIN public.ai_profiles AS profile ON profile.identity_id = identity.identity_id
    WHERE identity.identity_id = p_identity_id
      AND identity.status = 'active'
      AND identity.public_profile_enabled = true
      AND profile.visibility = 'public'
    FOR UPDATE OF identity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'This AI profile is not available for public following.' USING ERRCODE = '23503';
    END IF;
    IF v_owner_admin_id = p_follower_user_id THEN
      RAISE EXCEPTION 'The owner cannot follow their own AI identity.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.ai_identity_followers (
      identity_id,follower_user_id,status,exclude_from_human_follow_counts
    ) VALUES (
      p_identity_id,p_follower_user_id,'active',true
    )
    ON CONFLICT (identity_id,follower_user_id) DO UPDATE SET
      status='active',
      updated_at=pg_catalog.now();
    v_is_following := true;
  ELSE
    UPDATE public.ai_identity_followers
    SET status='removed',updated_at=pg_catalog.now()
    WHERE identity_id=p_identity_id
      AND follower_user_id=p_follower_user_id
      AND status='active';
    v_is_following := false;

    SELECT identity.owner_admin_id INTO v_owner_admin_id
    FROM public.ai_identities AS identity
    WHERE identity.identity_id=p_identity_id;
  END IF;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.ai_identity_followers
  WHERE identity_id=p_identity_id AND status='active';

  INSERT INTO public.ai_identity_audit_logs (
    identity_id,actor_user_id,action,target_type,target_id,summary,metadata
  ) VALUES (
    p_identity_id,p_follower_user_id,
    CASE WHEN p_follow THEN 'social.followed' ELSE 'social.unfollowed' END,
    'ai_identity',p_identity_id::text,
    CASE WHEN p_follow THEN 'A Minglora member followed a public AI identity.'
         ELSE 'A Minglora member unfollowed an AI identity.' END,
    pg_catalog.jsonb_build_object(
      'relationshipType','human_follows_ai',
      'excludeFromHumanFollowCounts',true,
      'activeAiFollowers',v_count
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'identityId',p_identity_id,
    'isFollowing',v_is_following,
    'followersCount',v_count,
    'excludeFromHumanFollowCounts',true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_follow_list(
  p_follower_user_id uuid,
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
      'ownerAdminId',identity.owner_admin_id,
      'displayName',names.display_name,
      'username',names.username,
      'publicProfileSlug',identity.public_profile_slug,
      'categoryId',identity.category_id,
      'biography',profile.biography,
      'followedAt',follower.created_at,
      'followersCount',(
        SELECT pg_catalog.count(*) FROM public.ai_identity_followers AS active_follower
        WHERE active_follower.identity_id=identity.identity_id AND active_follower.status='active'
      )
    ) AS item,
    follower.created_at
    FROM public.ai_identity_followers AS follower
    JOIN public.ai_identities AS identity ON identity.identity_id=follower.identity_id
    JOIN public.ai_names AS names ON names.identity_id=identity.identity_id
    JOIN public.ai_profiles AS profile ON profile.identity_id=identity.identity_id
    WHERE follower.follower_user_id=p_follower_user_id
      AND follower.status='active'
      AND identity.status='active'
      AND identity.public_profile_enabled=true
      AND profile.visibility='public'
    ORDER BY follower.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),500)
    OFFSET GREATEST(COALESCE(p_offset,0),0)
  ) AS result;
$function$;

CREATE TABLE IF NOT EXISTS public.ai_discovery_saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  search_text text NOT NULL DEFAULT '' CHECK (char_length(search_text) <= 160),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters)='object'),
  sort text NOT NULL DEFAULT 'newest' CHECK (sort IN ('newest','recently_updated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,name)
);
CREATE INDEX IF NOT EXISTS ai_discovery_saved_searches_user_updated_idx
  ON public.ai_discovery_saved_searches (user_id,updated_at DESC);
ALTER TABLE public.ai_discovery_saved_searches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_discovery_saved_searches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_discovery_saved_searches TO service_role;


CREATE OR REPLACE FUNCTION public.minglora_ai_discovery_saved_search_upsert(
  p_user_id uuid,
  p_name text,
  p_search_text text,
  p_filters jsonb,
  p_sort text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_key text;
  v_row public.ai_discovery_saved_searches;
BEGIN
  IF p_user_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_name,''))) NOT BETWEEN 2 AND 80
     OR pg_catalog.char_length(COALESCE(p_search_text,'')) > 160
     OR p_sort IS NULL OR p_sort NOT IN ('newest','recently_updated')
     OR p_filters IS NULL OR pg_catalog.jsonb_typeof(p_filters)<>'object' THEN
    RAISE EXCEPTION 'Saved AI discovery search values are invalid.' USING ERRCODE = '22023';
  END IF;

  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(p_filters)
  LOOP
    IF v_key NOT IN (
      'gender','nationality','countryOfOrigin','currentCountry','countryCode',
      'stateProvince','parishCounty','city','language','category','profession',
      'personality','interest','capability'
    ) OR pg_catalog.jsonb_typeof(p_filters->v_key)<>'array'
       OR pg_catalog.jsonb_array_length(p_filters->v_key)>50 THEN
      RAISE EXCEPTION 'Saved AI discovery filters contain an unsupported or oversized field.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_discovery_saved_searches
    WHERE user_id=p_user_id AND name=pg_catalog.btrim(p_name)
  ) AND (
    SELECT pg_catalog.count(*) FROM public.ai_discovery_saved_searches WHERE user_id=p_user_id
  ) >= 50 THEN
    RAISE EXCEPTION 'A member can save up to 50 AI discovery searches.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ai_discovery_saved_searches AS existing_search (
    user_id,name,search_text,filters,sort
  ) VALUES (
    p_user_id,pg_catalog.btrim(p_name),COALESCE(p_search_text,''),p_filters,p_sort
  )
  ON CONFLICT (user_id,name) DO UPDATE SET
    search_text=EXCLUDED.search_text,
    filters=EXCLUDED.filters,
    sort=EXCLUDED.sort,
    updated_at=pg_catalog.now()
  RETURNING * INTO v_row;

  RETURN pg_catalog.jsonb_build_object(
    'id',v_row.id,'name',v_row.name,'searchText',v_row.search_text,
    'filters',v_row.filters,'sort',v_row.sort,
    'createdAt',v_row.created_at,'updatedAt',v_row.updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_discovery_saved_search_list(
  p_user_id uuid
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',saved.id,'name',saved.name,'searchText',saved.search_text,
      'filters',saved.filters,'sort',saved.sort,
      'createdAt',saved.created_at,'updatedAt',saved.updated_at
    ) ORDER BY saved.updated_at DESC),
    '[]'::jsonb
  )
  FROM public.ai_discovery_saved_searches AS saved
  WHERE saved.user_id=p_user_id;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_discovery_saved_search_delete(
  p_user_id uuid,
  p_search_id uuid
) RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH deleted AS (
    DELETE FROM public.ai_discovery_saved_searches
    WHERE user_id=p_user_id AND id=p_search_id
    RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM deleted);
$function$;

REVOKE ALL ON FUNCTION public.minglora_ai_identity_public_owner_lookup(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_identity_public_owner_lookup(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_identity_follow_set(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_identity_follow_set(uuid,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_identity_follow_list(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_identity_follow_list(uuid,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_discovery_saved_search_upsert(uuid,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_discovery_saved_search_upsert(uuid,text,text,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_discovery_saved_search_list(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_discovery_saved_search_list(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_discovery_saved_search_delete(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_discovery_saved_search_delete(uuid,uuid) TO service_role;

COMMIT;
