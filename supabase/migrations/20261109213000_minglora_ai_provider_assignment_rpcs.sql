-- Minglora AI provider/model assignment management.
-- Configuration is persisted as an unverified assignment. Provider readiness
-- is only updated by the server-side runtime after a real adapter health check.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ai_provider_assignments_configured_identity_model_uq
  ON public.ai_provider_assignments (identity_id,provider_account_id,model_id)
  WHERE assignment_status IN ('configured','active','restricted');
CREATE UNIQUE INDEX IF NOT EXISTS ai_provider_assignments_one_configured_primary_uq
  ON public.ai_provider_assignments (identity_id)
  WHERE is_primary AND assignment_status IN ('configured','active');

CREATE OR REPLACE FUNCTION public.minglora_ai_provider_assignment_upsert(
  p_config jsonb,
  p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_identity_id uuid;
  v_provider_name text;
  v_provider_identifier text;
  v_account_reference text;
  v_secret_reference text;
  v_model_name text;
  v_model_identifier text;
  v_model_version text;
  v_supported_languages text[];
  v_capabilities jsonb;
  v_text boolean;
  v_image boolean;
  v_audio boolean;
  v_video boolean;
  v_voice boolean;
  v_priority integer;
  v_primary boolean;
  v_account_id uuid;
  v_model_id uuid;
  v_assignment_id uuid;
  v_result jsonb;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid THEN
    RAISE EXCEPTION 'Only the designated Minglora owner may configure AI providers.' USING ERRCODE = '42501';
  END IF;
  IF p_config IS NULL OR pg_catalog.jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'A provider assignment object is required.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_config) AS supplied(key)
    WHERE key NOT IN (
      'identityId','providerName','providerIdentifier','providerAccountReference',
      'credentialSecretReference','modelName','modelIdentifier','modelVersion',
      'supportedLanguages','capabilities','textCapable','imageCapable','audioCapable',
      'videoCapable','voiceCapable','routingPriority','isPrimary'
    )
  ) THEN
    RAISE EXCEPTION 'Provider payload contains unsupported fields. Raw credentials are never accepted.' USING ERRCODE = '22023';
  END IF;

  v_identity_id := NULLIF(p_config->>'identityId','')::uuid;
  v_provider_name := pg_catalog.btrim(COALESCE(p_config->>'providerName',''));
  v_provider_identifier := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_config->>'providerIdentifier','')));
  v_account_reference := pg_catalog.btrim(COALESCE(p_config->>'providerAccountReference','default'));
  v_secret_reference := NULLIF(pg_catalog.btrim(p_config->>'credentialSecretReference'),'');
  v_model_name := pg_catalog.btrim(COALESCE(p_config->>'modelName',''));
  v_model_identifier := pg_catalog.btrim(COALESCE(p_config->>'modelIdentifier',''));
  v_model_version := pg_catalog.btrim(COALESCE(p_config->>'modelVersion',''));
  v_supported_languages := ARRAY[]::text[];
  v_capabilities := COALESCE(p_config->'capabilities','{}'::jsonb);
  v_text := COALESCE((p_config->>'textCapable')::boolean,true);
  v_image := COALESCE((p_config->>'imageCapable')::boolean,false);
  v_audio := COALESCE((p_config->>'audioCapable')::boolean,false);
  v_video := COALESCE((p_config->>'videoCapable')::boolean,false);
  v_voice := COALESCE((p_config->>'voiceCapable')::boolean,false);
  v_priority := COALESCE((p_config->>'routingPriority')::integer,100);
  v_primary := COALESCE((p_config->>'isPrimary')::boolean,false);

  IF v_identity_id IS NULL OR v_provider_name !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{1,78}$'
     OR v_provider_identifier !~ '^[a-z][a-z0-9._-]{1,79}$'
     OR v_account_reference !~ '^[A-Za-z0-9._:-]{1,120}$'
     OR v_model_name !~ '^.{1,160}$'
     OR v_model_identifier !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
     OR v_priority NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Provider, model, account or routing fields are invalid.' USING ERRCODE = '22023';
  END IF;
  IF v_secret_reference IS NOT NULL AND v_secret_reference !~ '^env:MINGLORA_AI_PROVIDER_[A-Z0-9_]{2,80}$' THEN
    RAISE EXCEPTION 'Credential must be an environment-secret reference, not a raw secret.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_typeof(v_capabilities) <> 'object' OR
     EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_object_keys(v_capabilities) AS capability(key)
       WHERE key NOT IN ('text','image','audio','video','voice','embeddings','tools')
     ) THEN
    RAISE EXCEPTION 'Provider model capabilities contain unsupported fields.' USING ERRCODE = '22023';
  END IF;
  IF p_config ? 'supportedLanguages' THEN
    IF pg_catalog.jsonb_typeof(p_config->'supportedLanguages') <> 'array' OR
       pg_catalog.jsonb_array_length(p_config->'supportedLanguages') > 100 THEN
      RAISE EXCEPTION 'Supported languages must be an array of at most 100 values.' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(pg_catalog.array_agg(DISTINCT pg_catalog.left(pg_catalog.btrim(value),20)),'{}'::text[])
    INTO v_supported_languages
    FROM pg_catalog.jsonb_array_elements_text(p_config->'supportedLanguages') AS language(value)
    WHERE pg_catalog.btrim(value) <> '';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_identities AS identity
    WHERE identity.identity_id = v_identity_id
      AND identity.owner_admin_id = p_actor_user_id
      AND identity.population IN ('independent','organizational','specialized_service')
      AND identity.status NOT IN ('suspended','archived','retired')
  ) THEN
    RAISE EXCEPTION 'The AI identity is not owned by this administrator or is not eligible for a provider assignment.' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.ai_provider_accounts AS existing_account (
    identity_id,provider_name,provider_identifier,provider_account_reference,
    provider_configuration,credential_secret_reference,account_status,provider_health_status
  ) VALUES (
    v_identity_id,v_provider_name,v_provider_identifier,v_account_reference,
    '{}'::jsonb,v_secret_reference,'configured','unknown'
  )
  ON CONFLICT (identity_id,provider_identifier,provider_account_reference) DO UPDATE
    SET provider_name = EXCLUDED.provider_name,
        credential_secret_reference = EXCLUDED.credential_secret_reference,
        account_status = 'configured',
        provider_health_status = 'unknown',
        last_checked_at = NULL,
        updated_at = pg_catalog.now()
  RETURNING id INTO v_account_id;

  INSERT INTO public.ai_provider_models (
    provider_account_id,provider_name,model_name,model_identifier,model_version,
    capabilities,supported_languages,text_capable,image_capable,audio_capable,
    video_capable,voice_capable,tool_permissions,assignment_status
  ) VALUES (
    NULL,v_provider_name,v_model_name,v_model_identifier,v_model_version,
    v_capabilities,v_supported_languages,v_text,v_image,v_audio,v_video,v_voice,
    ARRAY[]::text[],'available'
  )
  ON CONFLICT (provider_name,model_identifier,model_version) DO UPDATE
    SET model_name = EXCLUDED.model_name,
        capabilities = EXCLUDED.capabilities,
        supported_languages = EXCLUDED.supported_languages,
        text_capable = EXCLUDED.text_capable,
        image_capable = EXCLUDED.image_capable,
        audio_capable = EXCLUDED.audio_capable,
        video_capable = EXCLUDED.video_capable,
        voice_capable = EXCLUDED.voice_capable,
        tool_permissions = ARRAY[]::text[],
        assignment_status = 'available',
        updated_at = pg_catalog.now()
  RETURNING id INTO v_model_id;

  IF v_primary THEN
    UPDATE public.ai_provider_assignments
    SET is_primary = false,updated_at = pg_catalog.now()
    WHERE identity_id = v_identity_id AND assignment_status IN ('configured','active');
  END IF;

  INSERT INTO public.ai_provider_assignments AS existing_assignment (
    identity_id,provider_account_id,model_id,routing_priority,is_primary,
    capability_overrides,tool_permissions,assignment_status,provider_health_status
  ) VALUES (
    v_identity_id,v_account_id,v_model_id,v_priority,v_primary,
    '{}'::jsonb,ARRAY[]::text[],'configured','unknown'
  )
  ON CONFLICT (identity_id,provider_account_id,model_id)
  WHERE assignment_status IN ('configured','active','restricted')
  DO UPDATE SET
    routing_priority = EXCLUDED.routing_priority,
    is_primary = EXCLUDED.is_primary,
    assignment_status = 'configured',
    provider_health_status = 'unknown',
    last_checked_at = NULL,
    updated_at = pg_catalog.now()
  RETURNING id INTO v_assignment_id;

  SELECT pg_catalog.jsonb_build_object(
    'assignmentId',assignment.id,
    'identityId',assignment.identity_id,
    'providerAccountId',account.id,
    'providerName',account.provider_name,
    'providerIdentifier',account.provider_identifier,
    'providerAccountReference',account.provider_account_reference,
    'credentialConfigured',(account.credential_secret_reference IS NOT NULL),
    'accountStatus',account.account_status,
    'providerHealthStatus',account.provider_health_status,
    'modelId',model.id,
    'modelName',model.model_name,
    'modelIdentifier',model.model_identifier,
    'modelVersion',model.model_version,
    'capabilities',model.capabilities,
    'supportedLanguages',model.supported_languages,
    'routingPriority',assignment.routing_priority,
    'isPrimary',assignment.is_primary,
    'assignmentStatus',assignment.assignment_status,
    'toolPermissions',assignment.tool_permissions,
    'lastCheckedAt',assignment.last_checked_at
  ) INTO v_result
  FROM public.ai_provider_assignments AS assignment
  JOIN public.ai_provider_accounts AS account ON account.id = assignment.provider_account_id
  JOIN public.ai_provider_models AS model ON model.id = assignment.model_id
  WHERE assignment.id = v_assignment_id;

  INSERT INTO public.ai_identity_audit_logs (
    identity_id,actor_user_id,action,target_type,target_id,summary,metadata
  ) VALUES (
    v_identity_id,p_actor_user_id,'provider.assignment_configured','provider_assignment',
    v_assignment_id::text,'Configured provider/model assignment; provider health remains unverified.',
    pg_catalog.jsonb_build_object(
      'providerIdentifier',v_provider_identifier,
      'modelIdentifier',v_model_identifier,
      'credentialConfigured',(v_secret_reference IS NOT NULL),
      'routingPriority',v_priority,
      'isPrimary',v_primary
    )
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_provider_assignment_list(
  p_owner_admin_id uuid,
  p_identity_id uuid DEFAULT NULL,
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
    SELECT
      pg_catalog.jsonb_build_object(
        'assignmentId',assignment.id,
        'identityId',identity.identity_id,
        'firstName',names.first_name,
        'lastName',names.last_name,
        'displayName',names.display_name,
        'username',names.username,
        'providerAccountId',account.id,
        'providerName',account.provider_name,
        'providerIdentifier',account.provider_identifier,
        'providerAccountReference',account.provider_account_reference,
        'credentialConfigured',(account.credential_secret_reference IS NOT NULL),
        'accountStatus',account.account_status,
        'providerHealthStatus',assignment.provider_health_status,
        'modelId',model.id,
        'modelName',model.model_name,
        'modelIdentifier',model.model_identifier,
        'modelVersion',model.model_version,
        'capabilities',model.capabilities,
        'supportedLanguages',model.supported_languages,
        'routingPriority',assignment.routing_priority,
        'isPrimary',assignment.is_primary,
        'assignmentStatus',assignment.assignment_status,
        'toolPermissions',assignment.tool_permissions,
        'lastCheckedAt',assignment.last_checked_at,
        'createdAt',assignment.created_at
      ) AS item,
      assignment.created_at
    FROM public.ai_provider_assignments AS assignment
    JOIN public.ai_identities AS identity ON identity.identity_id = assignment.identity_id
    LEFT JOIN public.ai_names AS names ON names.identity_id = identity.identity_id
    JOIN public.ai_provider_accounts AS account ON account.id = assignment.provider_account_id
    JOIN public.ai_provider_models AS model ON model.id = assignment.model_id
    WHERE identity.owner_admin_id = p_owner_admin_id
      AND (p_identity_id IS NULL OR identity.identity_id = p_identity_id)
    ORDER BY assignment.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),500)
    OFFSET GREATEST(COALESCE(p_offset,0),0)
  ) AS result;
$function$;

REVOKE ALL ON FUNCTION public.minglora_ai_provider_assignment_upsert(jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_provider_assignment_upsert(jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_provider_assignment_list(uuid,uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_provider_assignment_list(uuid,uuid,integer,integer) TO service_role;

COMMIT;
