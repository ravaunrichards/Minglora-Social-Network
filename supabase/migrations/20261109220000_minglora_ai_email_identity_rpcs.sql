-- Minglora AI email identity records.
-- An address record is not a mailbox. No verification/provisioning state is
-- advanced until a connected email provider confirms it.
BEGIN;

CREATE OR REPLACE FUNCTION public.minglora_ai_email_identity_upsert(
  p_email jsonb,
  p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_identity_id uuid;
  v_email_address text;
  v_email_type text;
  v_email_provider text;
  v_is_primary boolean;
  v_row public.ai_emails;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid THEN
    RAISE EXCEPTION 'Only the designated Minglora owner may manage AI email identities.' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR pg_catalog.jsonb_typeof(p_email) <> 'object' THEN
    RAISE EXCEPTION 'An AI email identity object is required.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_email) AS supplied(key)
    WHERE key NOT IN ('identityId','emailAddress','emailType','emailProvider','isPrimary')
  ) THEN
    RAISE EXCEPTION 'AI email payload contains unsupported fields. Verification and provisioning states cannot be self-declared.' USING ERRCODE = '22023';
  END IF;

  v_identity_id := NULLIF(p_email->>'identityId','')::uuid;
  v_email_address := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email->>'emailAddress','')));
  v_email_type := COALESCE(NULLIF(p_email->>'emailType',''),'primary');
  v_email_provider := pg_catalog.left(pg_catalog.btrim(COALESCE(p_email->>'emailProvider','')),80);
  v_is_primary := COALESCE((p_email->>'isPrimary')::boolean,false);

  IF v_identity_id IS NULL OR pg_catalog.char_length(v_email_address) NOT BETWEEN 3 AND 320
     OR v_email_address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR v_email_type NOT IN ('primary','recovery','notification','other') THEN
    RAISE EXCEPTION 'AI email identity fields are invalid.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_identities AS identity
    WHERE identity.identity_id = v_identity_id
      AND identity.owner_admin_id = p_actor_user_id
      AND identity.status NOT IN ('suspended','archived','retired')
  ) THEN
    RAISE EXCEPTION 'The AI identity is not owned by this administrator or is not eligible for an email identity.' USING ERRCODE = '23503';
  END IF;

  IF v_is_primary THEN
    UPDATE public.ai_emails
    SET is_primary = false,updated_at = pg_catalog.now()
    WHERE identity_id = v_identity_id AND status = 'active';
  END IF;

  INSERT INTO public.ai_emails AS existing_email (
    identity_id,email_address,email_type,is_primary,verification_status,
    email_provider,provisioning_status,provider_reference,management_reference,status
  ) VALUES (
    v_identity_id,v_email_address,v_email_type,v_is_primary,'not_verified',
    v_email_provider,'not_provisioned',NULL,NULL,'active'
  )
  ON CONFLICT (lower(email_address)) DO UPDATE
    SET email_type = EXCLUDED.email_type,
        email_provider = EXCLUDED.email_provider,
        is_primary = EXCLUDED.is_primary,
        status = 'active',
        updated_at = pg_catalog.now()
  WHERE existing_email.identity_id = EXCLUDED.identity_id
  RETURNING existing_email.* INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This email address is already assigned to another AI identity.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.ai_identity_audit_logs (
    identity_id,actor_user_id,action,target_type,target_id,summary,metadata
  ) VALUES (
    v_identity_id,p_actor_user_id,'email.identity_recorded','email_identity',
    v_row.id::text,'Recorded an AI email address. No mailbox has been provisioned or verified.',
    pg_catalog.jsonb_build_object(
      'emailType',v_email_type,
      'isPrimary',v_is_primary,
      'provisioningStatus',v_row.provisioning_status,
      'verificationStatus',v_row.verification_status
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id',v_row.id,
    'identityId',v_row.identity_id,
    'emailAddress',v_row.email_address,
    'emailType',v_row.email_type,
    'isPrimary',v_row.is_primary,
    'verificationStatus',v_row.verification_status,
    'emailProvider',v_row.email_provider,
    'provisioningStatus',v_row.provisioning_status,
    'status',v_row.status,
    'createdAt',v_row.created_at,
    'updatedAt',v_row.updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_email_identity_list(
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
    SELECT pg_catalog.jsonb_build_object(
      'id',email.id,
      'identityId',identity.identity_id,
      'firstName',names.first_name,
      'lastName',names.last_name,
      'displayName',names.display_name,
      'username',names.username,
      'emailAddress',email.email_address,
      'emailType',email.email_type,
      'isPrimary',email.is_primary,
      'verificationStatus',email.verification_status,
      'emailProvider',email.email_provider,
      'provisioningStatus',email.provisioning_status,
      'status',email.status,
      'lastVerifiedAt',email.last_verified_at,
      'createdAt',email.created_at,
      'updatedAt',email.updated_at
    ) AS item,
    email.created_at
    FROM public.ai_emails AS email
    JOIN public.ai_identities AS identity ON identity.identity_id = email.identity_id
    LEFT JOIN public.ai_names AS names ON names.identity_id = identity.identity_id
    WHERE identity.owner_admin_id = p_owner_admin_id
      AND (p_identity_id IS NULL OR identity.identity_id = p_identity_id)
    ORDER BY email.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),500)
    OFFSET GREATEST(COALESCE(p_offset,0),0)
  ) AS result;
$function$;

REVOKE ALL ON FUNCTION public.minglora_ai_email_identity_upsert(jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_email_identity_upsert(jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_email_identity_list(uuid,uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_email_identity_list(uuid,uuid,integer,integer) TO service_role;

COMMIT;
