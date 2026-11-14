-- Verify the real Minglora Supabase API connection without inventing a billing plan.
-- The runtime gateway must successfully probe Postgres and Storage before invoking this function.
BEGIN;

CREATE OR REPLACE FUNCTION public.minglora_admin_verify_supabase_provider_connection(
  p_actor_user_id uuid,
  p_provider_id uuid,
  p_project_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_provider_key text;
  v_provider public.minglora_admin_service_providers%ROWTYPE;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid THEN
    RAISE EXCEPTION 'Only the designated Minglora owner can verify provider connections'
      USING ERRCODE = '42501';
  END IF;

  IF p_provider_id IS NULL OR p_project_ref IS NULL OR p_project_ref !~ '^[a-z0-9]{20}$' THEN
    RAISE EXCEPTION 'A valid Supabase provider and project reference are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT provider_key INTO v_provider_key
    FROM public.minglora_admin_service_providers
   WHERE id = p_provider_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The provider record does not exist' USING ERRCODE = 'P0002';
  END IF;
  IF v_provider_key <> 'supabase' THEN
    RAISE EXCEPTION 'This connection verifier only supports the configured Supabase provider'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.minglora_admin_service_providers
     SET api_available = true,
         api_connection_status = 'connected',
         integration_method = 'api',
         account_identifier = p_project_ref,
         last_synced_at = pg_catalog.now(),
         updated_by = p_actor_user_id,
         updated_at = pg_catalog.now()
   WHERE id = p_provider_id
   RETURNING * INTO v_provider;

  INSERT INTO public.minglora_admin_finance_audit_events
    (actor_user_id, entity_type, entity_id, action, metadata)
  VALUES
    (p_actor_user_id, 'provider', p_provider_id, 'updated',
     pg_catalog.jsonb_build_object(
       'connection_test', 'passed',
       'provider_key', 'supabase',
       'project_ref', p_project_ref,
       'probes', pg_catalog.jsonb_build_array('postgres', 'storage')
     ));

  RETURN pg_catalog.jsonb_build_object('ok', true, 'record', pg_catalog.to_jsonb(v_provider));
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_admin_verify_supabase_provider_connection(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_admin_verify_supabase_provider_connection(uuid,uuid,text)
  TO service_role;

COMMIT;
