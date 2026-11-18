-- Minglora Logo Center completion: safe pending placement swaps, version recovery and scheduled deployment.

ALTER TABLE public.minglora_brand_logo_assignments
  ADD COLUMN IF NOT EXISTS pending_asset_id uuid
    REFERENCES public.minglora_brand_logo_assets(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pending_version_id uuid
    REFERENCES public.minglora_brand_logo_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pending_updated_by uuid
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pending_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='minglora_brand_logo_assignments_pending_pair_check'
      AND conrelid='public.minglora_brand_logo_assignments'::regclass
  ) THEN
    ALTER TABLE public.minglora_brand_logo_assignments
      ADD CONSTRAINT minglora_brand_logo_assignments_pending_pair_check
      CHECK (
        (pending_asset_id IS NULL AND pending_version_id IS NULL AND pending_updated_by IS NULL)
        OR
        (pending_asset_id IS NOT NULL AND pending_version_id IS NOT NULL AND pending_updated_by IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.minglora_assert_brand_owner(
  p_actor_user_id uuid,p_mfa_verified boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_owner_id constant uuid := '5b998c21-86b5-4621-ab37-e0808a2657b1';
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Brand administration must use the trusted Minglora server runtime.' USING ERRCODE='42501';
  END IF;
  IF p_actor_user_id IS DISTINCT FROM v_owner_id OR p_mfa_verified IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Only the MFA-verified designated Minglora owner can manage official branding.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.minglora_platform_staff s
    JOIN auth.users u ON u.id=s.user_id
    WHERE s.user_id=v_owner_id AND s.role='owner' AND s.active=true
      AND s.mfa_required=true AND 'platform:admin'=ANY(s.permissions)
      AND lower(u.email)='creatorhubcreatornetwork@gmail.com'
      AND u.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The designated Creator Hub owner record is not valid.' USING ERRCODE='42501';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.minglora_assert_brand_owner(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_assert_brand_owner(uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.minglora_brand_assignment_command(
  p_actor_user_id uuid,p_mfa_verified boolean,p_action text,p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_payload jsonb := CASE WHEN jsonb_typeof(p_payload)='object' THEN p_payload ELSE '{}'::jsonb END;
  v_placement text := lower(btrim(coalesce(p_payload->>'placementKey','')));
  v_asset uuid;
  v_version uuid;
  v_assignment public.minglora_brand_logo_assignments%ROWTYPE;
  v_history public.minglora_brand_deployment_history%ROWTYPE;
  v_previous_asset uuid;
  v_previous_version uuid;
BEGIN
  PERFORM public.minglora_assert_brand_owner(p_actor_user_id,p_mfa_verified);
  IF v_placement NOT IN (
    'website_header','website_footer','mobile_app','desktop_app','tablet_app',
    'admin_dashboard','login_page','registration_page','password_recovery_page',
    'loading_screen','splash_screen','browser_favicon','notifications','email_templates',
    'live_streaming','meetwave','video_watermarks','image_watermarks','post_share_previews',
    'application_icons','error_pages','maintenance_pages','promotional_pages'
  ) THEN RAISE EXCEPTION 'Choose a supported brand placement.' USING ERRCODE='22023'; END IF;

  IF v_action='prepare' THEN
    v_asset:=nullif(v_payload->>'assetId','')::uuid;
    v_version:=coalesce(nullif(v_payload->>'versionId','')::uuid,
      (SELECT current_version_id FROM public.minglora_brand_logo_assets WHERE id=v_asset));
    IF NOT EXISTS(SELECT 1 FROM public.minglora_brand_logo_assets
      WHERE id=v_asset AND status IN ('approved','active')
        AND current_version_id=v_version AND approved_version_id=v_version) THEN
      RAISE EXCEPTION 'Only the current approved logo version can be prepared.' USING ERRCODE='42501';
    END IF;
    SELECT * INTO v_assignment FROM public.minglora_brand_logo_assignments
      WHERE placement_key=v_placement FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.minglora_brand_logo_assignments(
        placement_key,asset_id,version_id,status,updated_by,
        pending_asset_id,pending_version_id,pending_updated_by,pending_updated_at
      ) VALUES(v_placement,NULL,NULL,'disabled',p_actor_user_id,
        v_asset,v_version,p_actor_user_id,now());
    ELSE
      UPDATE public.minglora_brand_logo_assignments SET
        pending_asset_id=v_asset,pending_version_id=v_version,
        pending_updated_by=p_actor_user_id,pending_updated_at=now(),
        updated_by=p_actor_user_id,updated_at=now()
      WHERE id=v_assignment.id;
    END IF;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
    SELECT p_actor_user_id,'assignment.pending','placement',a.id,
      jsonb_build_object('placementKey',v_placement,'assetId',v_asset,'versionId',v_version)
    FROM public.minglora_brand_logo_assignments a WHERE a.placement_key=v_placement;
    RETURN jsonb_build_object('ok',true,'status','pending_approval');
  ELSIF v_action='publish' THEN
    SELECT * INTO v_assignment FROM public.minglora_brand_logo_assignments
      WHERE placement_key=v_placement AND pending_asset_id IS NOT NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No prepared placement is waiting for publication.' USING ERRCODE='P0002'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.minglora_brand_logo_assets
      WHERE id=v_assignment.pending_asset_id
        AND status IN ('approved','active')
        AND current_version_id=v_assignment.pending_version_id
        AND approved_version_id=v_assignment.pending_version_id) THEN
      RAISE EXCEPTION 'The prepared logo version is no longer approved.' USING ERRCODE='42501';
    END IF;
    v_previous_asset:=CASE WHEN v_assignment.status='active' THEN v_assignment.asset_id ELSE NULL END;
    v_previous_version:=CASE WHEN v_assignment.status='active' THEN v_assignment.version_id ELSE NULL END;

    UPDATE public.minglora_brand_logo_assignments SET
      asset_id=pending_asset_id,version_id=pending_version_id,status='active',
      pending_asset_id=NULL,pending_version_id=NULL,pending_updated_by=NULL,pending_updated_at=NULL,
      updated_by=p_actor_user_id,updated_at=now()
    WHERE id=v_assignment.id;
    UPDATE public.minglora_brand_logo_assets SET status='active',updated_by=p_actor_user_id,updated_at=now()
      WHERE id=v_assignment.pending_asset_id;
    IF v_previous_asset IS NOT NULL AND v_previous_asset<>v_assignment.pending_asset_id THEN
      UPDATE public.minglora_brand_logo_assets a SET
        status=CASE
          WHEN EXISTS(SELECT 1 FROM public.minglora_brand_logo_assignments x
            WHERE x.asset_id=a.id AND x.status='active') THEN 'active'
          WHEN a.approved_version_id=a.current_version_id AND a.approved_version_id IS NOT NULL THEN 'approved'
          ELSE 'draft'
        END,updated_by=p_actor_user_id,updated_at=now()
      WHERE a.id=v_previous_asset;
    END IF;
    INSERT INTO public.minglora_brand_deployment_history(
      assignment_id,placement_key,action,previous_asset_id,previous_version_id,
      deployed_asset_id,deployed_version_id,actor_user_id,details
    ) VALUES(v_assignment.id,v_placement,'published',v_previous_asset,v_previous_version,
      v_assignment.pending_asset_id,v_assignment.pending_version_id,p_actor_user_id,
      jsonb_build_object('publication','admin_approved'));
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
    VALUES(p_actor_user_id,'assignment.published','placement',v_assignment.id,
      jsonb_build_object('placementKey',v_placement,'assetId',v_assignment.pending_asset_id));
    RETURN jsonb_build_object('ok',true,'status','active','assignmentId',v_assignment.id);
  ELSIF v_action='rollback' THEN
    SELECT * INTO v_assignment FROM public.minglora_brand_logo_assignments
      WHERE placement_key=v_placement FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The logo placement does not exist.' USING ERRCODE='P0002'; END IF;
    SELECT * INTO v_history FROM public.minglora_brand_deployment_history
      WHERE placement_key=v_placement AND action='published'
      ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'No previous published logo version is available.' USING ERRCODE='P0002'; END IF;
    IF v_history.previous_asset_id IS NULL THEN
      UPDATE public.minglora_brand_logo_assignments SET
        asset_id=NULL,version_id=NULL,status='disabled',
        pending_asset_id=NULL,pending_version_id=NULL,pending_updated_by=NULL,pending_updated_at=NULL,
        updated_by=p_actor_user_id,updated_at=now()
      WHERE id=v_assignment.id;
    ELSE
      UPDATE public.minglora_brand_logo_assignments SET
        asset_id=v_history.previous_asset_id,version_id=v_history.previous_version_id,status='active',
        pending_asset_id=NULL,pending_version_id=NULL,pending_updated_by=NULL,pending_updated_at=NULL,
        updated_by=p_actor_user_id,updated_at=now()
      WHERE id=v_assignment.id;
      UPDATE public.minglora_brand_logo_assets SET status='active',updated_by=p_actor_user_id,updated_at=now()
        WHERE id=v_history.previous_asset_id;
    END IF;
    IF v_assignment.asset_id IS NOT NULL THEN
      UPDATE public.minglora_brand_logo_assets a SET
        status=CASE
          WHEN EXISTS(SELECT 1 FROM public.minglora_brand_logo_assignments x
            WHERE x.asset_id=a.id AND x.status='active' AND x.id<>v_assignment.id) THEN 'active'
          WHEN a.approved_version_id=a.current_version_id AND a.approved_version_id IS NOT NULL THEN 'approved'
          ELSE 'draft'
        END,updated_by=p_actor_user_id,updated_at=now()
      WHERE a.id=v_assignment.asset_id;
    END IF;
    INSERT INTO public.minglora_brand_deployment_history(
      assignment_id,placement_key,action,previous_asset_id,previous_version_id,
      deployed_asset_id,deployed_version_id,actor_user_id,details
    ) VALUES(v_assignment.id,v_placement,'rolled_back',v_assignment.asset_id,v_assignment.version_id,
      v_history.previous_asset_id,v_history.previous_version_id,p_actor_user_id,
      jsonb_build_object('rollback','admin_requested'));
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
    VALUES(p_actor_user_id,'assignment.rolled_back','placement',v_assignment.id,
      jsonb_build_object('placementKey',v_placement));
    RETURN jsonb_build_object('ok',true,'status','rolled_back');
  END IF;
  RAISE EXCEPTION 'Unsupported brand assignment action.' USING ERRCODE='22023';
END;
$function$;
REVOKE ALL ON FUNCTION public.minglora_brand_assignment_command(uuid,boolean,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_brand_assignment_command(uuid,boolean,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.minglora_brand_logo_restore_version(
  p_actor_user_id uuid,p_mfa_verified boolean,p_asset_id uuid,p_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_asset public.minglora_brand_logo_assets%ROWTYPE; v_version public.minglora_brand_logo_versions%ROWTYPE;
BEGIN
  PERFORM public.minglora_assert_brand_owner(p_actor_user_id,p_mfa_verified);
  SELECT * INTO v_asset FROM public.minglora_brand_logo_assets
    WHERE id=p_asset_id AND status<>'deleted' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The logo asset is unavailable.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_version FROM public.minglora_brand_logo_versions
    WHERE id=p_version_id AND asset_id=p_asset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The requested version does not belong to this asset.' USING ERRCODE='P0002'; END IF;
  UPDATE public.minglora_brand_logo_assets SET
    original_name=v_version.original_name,mime_type=v_version.mime_type,file_format=v_version.file_format,
    byte_size=v_version.byte_size,width=v_version.width,height=v_version.height,
    duration_ms=v_version.duration_ms,storage_path=v_version.storage_path,current_version_id=v_version.id,
    status=CASE
      WHEN EXISTS(SELECT 1 FROM public.minglora_brand_logo_assignments a
        WHERE a.asset_id=p_asset_id AND a.status='active') THEN 'active'
      WHEN approved_version_id=v_version.id THEN 'approved'
      ELSE 'draft'
    END,updated_by=p_actor_user_id,updated_at=now()
  WHERE id=p_asset_id;
  INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
  VALUES(p_actor_user_id,'version.restored','logo',p_asset_id,
    jsonb_build_object('versionId',p_version_id,'versionNumber',v_version.version_number));
  RETURN jsonb_build_object('ok',true,'assetId',p_asset_id,'versionId',p_version_id,
    'versionNumber',v_version.version_number);
END;
$function$;
REVOKE ALL ON FUNCTION public.minglora_brand_logo_restore_version(uuid,boolean,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_brand_logo_restore_version(uuid,boolean,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.minglora_brand_logo_schedule_create(
  p_actor_user_id uuid,p_mfa_verified boolean,p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_payload jsonb := CASE WHEN jsonb_typeof(p_payload)='object' THEN p_payload ELSE '{}'::jsonb END;
  v_placement text := lower(btrim(coalesce(p_payload->>'placementKey','')));
  v_asset uuid := nullif(p_payload->>'assetId','')::uuid;
  v_version uuid;
  v_starts timestamptz := nullif(p_payload->>'activatesAt','')::timestamptz;
  v_ends timestamptz := nullif(p_payload->>'expiresAt','')::timestamptz;
  v_zone text := left(coalesce(p_payload->>'timezone','America/Jamaica'),64);
  v_schedule uuid;
BEGIN
  PERFORM public.minglora_assert_brand_owner(p_actor_user_id,p_mfa_verified);
  IF v_placement NOT IN (
    'website_header','website_footer','mobile_app','desktop_app','tablet_app',
    'admin_dashboard','login_page','registration_page','password_recovery_page',
    'loading_screen','splash_screen','browser_favicon','notifications','email_templates',
    'live_streaming','meetwave','video_watermarks','image_watermarks','post_share_previews',
    'application_icons','error_pages','maintenance_pages','promotional_pages'
  ) THEN RAISE EXCEPTION 'Choose a supported brand placement.' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=v_zone) THEN
    RAISE EXCEPTION 'Choose a valid IANA timezone.' USING ERRCODE='22023';
  END IF;
  IF v_starts IS NULL OR v_starts<=now() OR (v_ends IS NOT NULL AND v_ends<=v_starts) THEN
    RAISE EXCEPTION 'Choose a future activation time and a later optional expiry.' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(nullif(v_payload->>'versionId','')::uuid,a.current_version_id)
    INTO v_version FROM public.minglora_brand_logo_assets a WHERE a.id=v_asset;
  IF NOT EXISTS(SELECT 1 FROM public.minglora_brand_logo_assets
    WHERE id=v_asset AND status IN ('approved','active')
      AND current_version_id=v_version AND approved_version_id=v_version) THEN
    RAISE EXCEPTION 'Only the current approved version can be scheduled.' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.minglora_brand_logo_schedules(
    placement_key,asset_id,version_id,activates_at,expires_at,timezone,created_by
  ) VALUES(v_placement,v_asset,v_version,v_starts,v_ends,v_zone,p_actor_user_id)
  RETURNING id INTO v_schedule;
  INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
  VALUES(p_actor_user_id,'schedule.created','schedule',v_schedule,
    jsonb_build_object('placementKey',v_placement,'assetId',v_asset,'timezone',v_zone));
  RETURN jsonb_build_object('ok',true,'scheduleId',v_schedule,'status','scheduled');
END;
$function$;
REVOKE ALL ON FUNCTION public.minglora_brand_logo_schedule_create(uuid,boolean,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_brand_logo_schedule_create(uuid,boolean,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.minglora_brand_logo_schedule_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.placement_key NOT IN (
    'website_header','website_footer','mobile_app','desktop_app','tablet_app',
    'admin_dashboard','login_page','registration_page','password_recovery_page',
    'loading_screen','splash_screen','browser_favicon','notifications','email_templates',
    'live_streaming','meetwave','video_watermarks','image_watermarks','post_share_previews',
    'application_icons','error_pages','maintenance_pages','promotional_pages'
  ) THEN RAISE EXCEPTION 'Choose a supported Minglora brand placement.' USING ERRCODE='22023'; END IF;
  IF NEW.status IN ('scheduled','activated') AND EXISTS(
    SELECT 1 FROM public.minglora_brand_logo_schedules s
    WHERE s.id IS DISTINCT FROM NEW.id AND s.placement_key=NEW.placement_key
      AND s.status IN ('scheduled','activated')
      AND tstzrange(s.activates_at,coalesce(s.expires_at,'infinity'::timestamptz),'[)')
        && tstzrange(NEW.activates_at,coalesce(NEW.expires_at,'infinity'::timestamptz),'[)')
  ) THEN
    RAISE EXCEPTION 'Another scheduled brand change overlaps this placement and time window.' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS minglora_brand_logo_schedule_overlap_guard ON public.minglora_brand_logo_schedules;
CREATE TRIGGER minglora_brand_logo_schedule_overlap_guard
  BEFORE INSERT OR UPDATE OF placement_key,activates_at,expires_at,status
  ON public.minglora_brand_logo_schedules
  FOR EACH ROW EXECUTE FUNCTION public.minglora_brand_logo_schedule_guard();

CREATE OR REPLACE FUNCTION public.dispatch_due_minglora_brand_logo_schedules()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_schedule public.minglora_brand_logo_schedules%ROWTYPE;
  v_assignment public.minglora_brand_logo_assignments%ROWTYPE;
  v_history public.minglora_brand_deployment_history%ROWTYPE;
  v_prior_asset uuid; v_prior_version uuid; v_assignment_id uuid;
  v_activated integer:=0; v_expired integer:=0; v_failed integer:=0;
BEGIN
  IF current_user<>'service_role' THEN
    RAISE EXCEPTION 'Logo scheduler is restricted to the internal Minglora service role.' USING ERRCODE='42501';
  END IF;

  FOR v_schedule IN
    SELECT s.* FROM public.minglora_brand_logo_schedules s
    WHERE s.status='scheduled' AND s.activates_at<=now()
    ORDER BY s.activates_at,s.created_at FOR UPDATE SKIP LOCKED LIMIT 50
  LOOP
    BEGIN
      IF v_schedule.expires_at IS NOT NULL AND v_schedule.expires_at<=now() THEN
        UPDATE public.minglora_brand_logo_schedules SET status='expired' WHERE id=v_schedule.id;
        INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
        VALUES(v_schedule.created_by,'schedule.expired','schedule',v_schedule.id,
          jsonb_build_object('reason','Activation window elapsed before dispatch.'));
        v_expired:=v_expired+1; CONTINUE;
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.minglora_brand_logo_assets a
        WHERE a.id=v_schedule.asset_id AND a.status IN ('approved','active')
          AND a.current_version_id=v_schedule.version_id AND a.approved_version_id=v_schedule.version_id) THEN
        UPDATE public.minglora_brand_logo_schedules SET status='failed' WHERE id=v_schedule.id;
        INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
        VALUES(v_schedule.created_by,'schedule.failed','schedule',v_schedule.id,
          jsonb_build_object('reason','Scheduled version is no longer current and approved.'));
        v_failed:=v_failed+1; CONTINUE;
      END IF;

      SELECT * INTO v_assignment FROM public.minglora_brand_logo_assignments
        WHERE placement_key=v_schedule.placement_key FOR UPDATE;
      IF FOUND AND v_assignment.status='active' THEN
        v_prior_asset:=v_assignment.asset_id; v_prior_version:=v_assignment.version_id;
      ELSE v_prior_asset:=NULL; v_prior_version:=NULL; END IF;

      IF v_assignment.id IS NULL THEN
        INSERT INTO public.minglora_brand_logo_assignments(placement_key,asset_id,version_id,status,updated_by)
        VALUES(v_schedule.placement_key,v_schedule.asset_id,v_schedule.version_id,'active',v_schedule.created_by)
        RETURNING id INTO v_assignment_id;
      ELSE
        UPDATE public.minglora_brand_logo_assignments SET
          asset_id=v_schedule.asset_id,version_id=v_schedule.version_id,status='active',
          updated_by=v_schedule.created_by,updated_at=now()
        WHERE id=v_assignment.id RETURNING id INTO v_assignment_id;
      END IF;
      UPDATE public.minglora_brand_logo_assets SET status='active',updated_by=v_schedule.created_by,updated_at=now()
        WHERE id=v_schedule.asset_id;
      IF v_prior_asset IS NOT NULL AND v_prior_asset<>v_schedule.asset_id THEN
        UPDATE public.minglora_brand_logo_assets a SET
          status=CASE
            WHEN EXISTS(SELECT 1 FROM public.minglora_brand_logo_assignments x
              WHERE x.asset_id=a.id AND x.status='active') THEN 'active'
            WHEN a.approved_version_id=a.current_version_id AND a.approved_version_id IS NOT NULL THEN 'approved'
            ELSE 'draft'
          END,updated_by=v_schedule.created_by,updated_at=now()
        WHERE a.id=v_prior_asset;
      END IF;
      INSERT INTO public.minglora_brand_deployment_history(
        assignment_id,placement_key,action,previous_asset_id,previous_version_id,
        deployed_asset_id,deployed_version_id,actor_user_id,details
      ) VALUES(v_assignment_id,v_schedule.placement_key,'published',v_prior_asset,v_prior_version,
        v_schedule.asset_id,v_schedule.version_id,v_schedule.created_by,
        jsonb_build_object('scheduleId',v_schedule.id,'deploymentSource','scheduler'));
      UPDATE public.minglora_brand_logo_schedules SET status='activated' WHERE id=v_schedule.id;
      INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
      VALUES(v_schedule.created_by,'schedule.activated','schedule',v_schedule.id,
        jsonb_build_object('placementKey',v_schedule.placement_key,'assetId',v_schedule.asset_id));
      v_activated:=v_activated+1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.minglora_brand_logo_schedules SET status='failed' WHERE id=v_schedule.id;
      INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
      VALUES(v_schedule.created_by,'schedule.failed','schedule',v_schedule.id,
        jsonb_build_object('error',left(SQLERRM,500)));
      v_failed:=v_failed+1;
    END;
  END LOOP;

  FOR v_schedule IN
    SELECT s.* FROM public.minglora_brand_logo_schedules s
    WHERE s.status='activated' AND s.expires_at IS NOT NULL AND s.expires_at<=now()
    ORDER BY s.expires_at,s.created_at FOR UPDATE SKIP LOCKED LIMIT 50
  LOOP
    BEGIN
      SELECT * INTO v_assignment FROM public.minglora_brand_logo_assignments
        WHERE placement_key=v_schedule.placement_key FOR UPDATE;
      SELECT * INTO v_history FROM public.minglora_brand_deployment_history h
        WHERE h.placement_key=v_schedule.placement_key AND h.action='published'
          AND h.details->>'scheduleId'=v_schedule.id::text
        ORDER BY h.created_at DESC LIMIT 1;
      IF FOUND AND v_assignment.id IS NOT NULL AND v_assignment.status='active'
        AND v_assignment.asset_id=v_schedule.asset_id AND v_assignment.version_id=v_schedule.version_id
        AND v_history.id=(
          SELECT h2.id FROM public.minglora_brand_deployment_history h2
          WHERE h2.placement_key=v_schedule.placement_key AND h2.action='published'
          ORDER BY h2.created_at DESC LIMIT 1
        ) THEN
        IF v_history.previous_asset_id IS NULL THEN
          UPDATE public.minglora_brand_logo_assignments SET asset_id=NULL,version_id=NULL,status='disabled',
            updated_by=v_schedule.created_by,updated_at=now() WHERE id=v_assignment.id;
        ELSE
          UPDATE public.minglora_brand_logo_assignments SET asset_id=v_history.previous_asset_id,
            version_id=v_history.previous_version_id,status='active',
            updated_by=v_schedule.created_by,updated_at=now() WHERE id=v_assignment.id;
          UPDATE public.minglora_brand_logo_assets SET status='active',
            updated_by=v_schedule.created_by,updated_at=now() WHERE id=v_history.previous_asset_id;
        END IF;
        UPDATE public.minglora_brand_logo_assets a SET
          status=CASE
            WHEN EXISTS(SELECT 1 FROM public.minglora_brand_logo_assignments x
              WHERE x.asset_id=a.id AND x.status='active') THEN 'active'
            WHEN a.approved_version_id=a.current_version_id AND a.approved_version_id IS NOT NULL THEN 'approved'
            ELSE 'draft'
          END,updated_by=v_schedule.created_by,updated_at=now()
        WHERE a.id=v_schedule.asset_id;
        INSERT INTO public.minglora_brand_deployment_history(
          assignment_id,placement_key,action,previous_asset_id,previous_version_id,
          deployed_asset_id,deployed_version_id,actor_user_id,details
        ) VALUES(v_assignment.id,v_schedule.placement_key,'rolled_back',v_schedule.asset_id,v_schedule.version_id,
          v_history.previous_asset_id,v_history.previous_version_id,v_schedule.created_by,
          jsonb_build_object('scheduleId',v_schedule.id,'rollbackSource','expiry'));
      END IF;
      UPDATE public.minglora_brand_logo_schedules SET status='expired' WHERE id=v_schedule.id;
      INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
      VALUES(v_schedule.created_by,'schedule.expired','schedule',v_schedule.id,
        jsonb_build_object('placementKey',v_schedule.placement_key));
      v_expired:=v_expired+1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.minglora_brand_logo_schedules SET status='failed' WHERE id=v_schedule.id;
      INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
      VALUES(v_schedule.created_by,'schedule.failed','schedule',v_schedule.id,
        jsonb_build_object('phase','expiry','error',left(SQLERRM,500)));
      v_failed:=v_failed+1;
    END;
  END LOOP;
  RETURN jsonb_build_object('activated',v_activated,'expired',v_expired,'failed',v_failed);
END;
$function$;
REVOKE ALL ON FUNCTION public.dispatch_due_minglora_brand_logo_schedules() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_due_minglora_brand_logo_schedules() TO service_role;

DO $$
DECLARE v_job_id bigint;
BEGIN
  FOR v_job_id IN SELECT jobid FROM cron.job WHERE jobname='minglora_brand_logo_schedule_dispatch'
  LOOP PERFORM cron.unschedule(v_job_id); END LOOP;
  PERFORM cron.schedule(
    'minglora_brand_logo_schedule_dispatch','* * * * *',
    'SET ROLE service_role; SELECT public.dispatch_due_minglora_brand_logo_schedules(); RESET ROLE;'
  );
END;
$$;
