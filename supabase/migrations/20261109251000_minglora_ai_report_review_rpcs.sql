-- Owner-only triage for member-submitted AI identity reports.
BEGIN;

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_report_list(
  p_owner_admin_id uuid,
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_owner_admin_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid THEN
    RAISE EXCEPTION 'Only the designated Minglora owner may review AI identity reports.' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('all','pending','in_review','actioned','dismissed') OR
     p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 OR
     p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000000 THEN
    RAISE EXCEPTION 'AI report review filters are invalid.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(result.item ORDER BY result.created_at DESC),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT pg_catalog.jsonb_build_object(
      'reportId',report.id,
      'identityId',identity.identity_id,
      'displayName',names.display_name,
      'username',names.username,
      'publicProfileSlug',identity.public_profile_slug,
      'reason',report.reason,
      'details',report.details,
      'status',report.status,
      'resolutionNote',report.resolution_note,
      'reviewedBy',report.reviewed_by,
      'reviewedAt',report.reviewed_at,
      'createdAt',report.created_at,
      'updatedAt',report.updated_at
    ) AS item,
    report.created_at
    FROM public.ai_identity_reports AS report
    JOIN public.ai_identities AS identity ON identity.identity_id=report.identity_id
    LEFT JOIN public.ai_names AS names ON names.identity_id=identity.identity_id
    WHERE p_status='all' OR report.status=p_status
    ORDER BY report.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) AS result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_report_review(
  p_report_id uuid,
  p_status text,
  p_resolution_note text,
  p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_row public.ai_identity_reports;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid THEN
    RAISE EXCEPTION 'Only the designated Minglora owner may review AI identity reports.' USING ERRCODE = '42501';
  END IF;
  IF p_report_id IS NULL OR p_status IS NULL OR
     p_status NOT IN ('in_review','actioned','dismissed') OR
     pg_catalog.char_length(COALESCE(p_resolution_note,'')) > 1200 THEN
    RAISE EXCEPTION 'AI report review values are invalid.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ai_identity_reports
  SET status=p_status,
      resolution_note=pg_catalog.btrim(COALESCE(p_resolution_note,'')),
      reviewed_by=p_actor_user_id,
      reviewed_at=pg_catalog.now(),
      updated_at=pg_catalog.now()
  WHERE id=p_report_id
    AND status IN ('pending','in_review')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI report was not found or is already closed.' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.ai_identity_audit_logs (
    identity_id,actor_user_id,action,target_type,target_id,summary,metadata
  ) VALUES (
    v_row.identity_id,p_actor_user_id,'safety.report_reviewed','ai_identity_report',
    v_row.id::text,'The Minglora owner reviewed an AI identity safety report.',
    pg_catalog.jsonb_build_object(
      'status',v_row.status,'reason',v_row.reason,
      'resolutionNote',v_row.resolution_note,'reviewedAt',v_row.reviewed_at
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'reportId',v_row.id,'identityId',v_row.identity_id,
    'status',v_row.status,'resolutionNote',v_row.resolution_note,
    'reviewedAt',v_row.reviewed_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_ai_identity_report_list(uuid,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_identity_report_list(uuid,text,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_identity_report_review(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_identity_report_review(uuid,text,text,uuid) TO service_role;

COMMIT;
