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

-- Reuse Minglora's existing owner-controlled RBAC catalogue for narrowly scoped brand roles.
ALTER TABLE public.minglora_platform_staff
  DROP CONSTRAINT IF EXISTS minglora_platform_staff_role_check;
ALTER TABLE public.minglora_platform_staff
  ADD CONSTRAINT minglora_platform_staff_role_check CHECK (role IN (
    'owner','admin','moderator','reviewer','super_administrator',
    'finance_administrator','technical_administrator','security_administrator',
    'content_administrator','creator_manager','support_administrator','read_only_auditor',
    'brand_administrator','brand_asset_uploader','brand_asset_editor',
    'brand_approval_manager','brand_publisher','brand_read_only'
  ));

INSERT INTO public.minglora_admin_role_definitions(role_key,display_name,description,assignable) VALUES
 ('brand_administrator','Brand Administrator','Manage Minglora logos, brand assets, identity, approvals, placements and publishing. Does not grant general platform administration.',true),
 ('brand_asset_uploader','Brand Asset Uploader','Upload new logo assets and immutable versions; view current brand records.',true),
 ('brand_asset_editor','Brand Asset Editor','Edit logo metadata, categories, collections and brand identity; view current brand records.',true),
 ('brand_approval_manager','Brand Approval Manager','Review and approve logo versions; view brand records.',true),
 ('brand_publisher','Brand Publisher','Publish approved logo placements, schedule changes and rollbacks; view brand records.',true),
 ('brand_read_only','Brand Read-only','View the Logo Center, approved assets, placements and history without changing records.',true)
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO public.minglora_admin_permission_catalog(permission_key,display_name,description,risk_level) VALUES
 ('brand:read','Brand library read','View the Logo Center, logo assets, placements and brand history.','medium'),
 ('brand:upload','Brand asset upload','Upload new logo assets and immutable source versions.','medium'),
 ('brand:edit','Brand asset editing','Edit asset metadata, categories, collections and brand identity settings.','high'),
 ('brand:approve','Brand asset approval','Approve a current logo version for publication eligibility.','high'),
 ('brand:publish','Brand publishing','Publish approved placements, schedule changes and controlled rollbacks.','critical'),
 ('brand:manage','Full brand management','All Logo Center permissions without general platform administration.','critical')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.minglora_admin_role_permissions(role_key,permission_key)
SELECT mapping.role_key,mapping.permission_key
FROM (VALUES
 ('brand_administrator','brand:read'),('brand_administrator','brand:upload'),
 ('brand_administrator','brand:edit'),('brand_administrator','brand:approve'),
 ('brand_administrator','brand:publish'),('brand_administrator','brand:manage'),
 ('brand_asset_uploader','brand:read'),('brand_asset_uploader','brand:upload'),
 ('brand_asset_editor','brand:read'),('brand_asset_editor','brand:edit'),
 ('brand_approval_manager','brand:read'),('brand_approval_manager','brand:approve'),
 ('brand_publisher','brand:read'),('brand_publisher','brand:publish'),
 ('brand_read_only','brand:read')
) AS mapping(role_key,permission_key)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.minglora_assert_brand_permission(
  p_actor_user_id uuid,p_mfa_verified boolean,p_permission text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_owner_id constant uuid := '5b998c21-86b5-4621-ab37-e0808a2657b1';
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Brand administration must use the trusted Minglora server runtime.' USING ERRCODE='42501';
  END IF;
  IF p_actor_user_id IS NULL OR p_mfa_verified IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A signed-in MFA-verified administrator session is required.' USING ERRCODE='42501';
  END IF;
  IF p_permission NOT IN ('brand:read','brand:upload','brand:edit','brand:approve','brand:publish') THEN
    RAISE EXCEPTION 'Choose a supported Logo Center permission.' USING ERRCODE='22023';
  END IF;
  IF p_actor_user_id=v_owner_id AND EXISTS (
    SELECT 1 FROM public.minglora_platform_staff s
    JOIN auth.users u ON u.id=s.user_id
    WHERE s.user_id=v_owner_id AND s.role='owner' AND s.active=true
      AND s.mfa_required=true AND 'platform:admin'=ANY(s.permissions)
      AND lower(u.email)='creatorhubcreatornetwork@gmail.com'
      AND u.email_confirmed_at IS NOT NULL
  ) THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.minglora_platform_staff s
    JOIN auth.users u ON u.id=s.user_id
    JOIN public.profiles p ON p.id=s.user_id
    WHERE s.user_id=p_actor_user_id AND s.active=true AND s.mfa_required=true
      AND s.role IN ('brand_administrator','brand_asset_uploader','brand_asset_editor',
                     'brand_approval_manager','brand_publisher','brand_read_only')
      AND u.email_confirmed_at IS NOT NULL
      AND (p_permission=ANY(s.permissions) OR 'brand:manage'=ANY(s.permissions))
  ) THEN
    RAISE EXCEPTION 'Your Minglora administrator assignment does not include this Logo Center permission.' USING ERRCODE='42501';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.minglora_assert_brand_permission(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_assert_brand_permission(uuid,boolean,text) TO service_role;

CREATE OR REPLACE FUNCTION public.minglora_admin_brand_command(
  p_actor_user_id uuid,
  p_mfa_verified boolean,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_owner_id constant uuid := '5b998c21-86b5-4621-ab37-e0808a2657b1';
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_payload jsonb := CASE WHEN jsonb_typeof(p_payload)='object' THEN p_payload ELSE '{}'::jsonb END;
  v_asset_id uuid;
  v_version_id uuid;
  v_category_id uuid;
  v_collection_id uuid;
  v_actor uuid := p_actor_user_id;
  v_title text;
  v_name text;
  v_slug text;
  v_description text;
  v_note text;
  v_status text;
  v_placement text;
  v_mime text;
  v_format text;
  v_path text;
  v_size bigint;
  v_version_number integer;
  v_activates timestamptz;
  v_expires timestamptz;
  v_timezone text;
  v_previous_asset uuid;
  v_previous_version uuid;
  v_assignment_id uuid;
  v_row record;
  v_result jsonb;
  v_permission text;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Brand administration must use the trusted Minglora server runtime.' USING ERRCODE='42501';
  END IF;
  IF p_mfa_verified IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A verified MFA session is required for Logo Center access.' USING ERRCODE='42501';
  END IF;
  v_permission := CASE
    WHEN v_action IN ('list','asset_url','favorite_toggle') THEN 'brand:read'
    WHEN v_action IN ('upload_prepare','upload_session_get','upload_complete') THEN 'brand:upload'
    WHEN v_action IN ('asset_update','asset_status','category_create','collection_create','identity_update') THEN 'brand:edit'
    WHEN v_action='asset_approve' THEN 'brand:approve'
    WHEN v_action IN ('assignment_set','schedule_create','schedule_cancel') THEN 'brand:publish'
    ELSE NULL
  END;
  IF v_permission IS NULL THEN
    RAISE EXCEPTION 'Unsupported Logo Center permission action.' USING ERRCODE='22023';
  END IF;
  PERFORM public.minglora_assert_brand_permission(v_actor,p_mfa_verified,v_permission);

  IF v_action='list' THEN
    v_name := left(btrim(coalesce(v_payload->>'search','')),120);
    v_category_id := nullif(v_payload->>'categoryId','')::uuid;
    v_collection_id := nullif(v_payload->>'collectionId','')::uuid;
    RETURN jsonb_build_object(
      'permissions',to_jsonb(coalesce((SELECT s.permissions FROM public.minglora_platform_staff s WHERE s.user_id=v_actor),ARRAY[]::text[]) || CASE WHEN v_actor=v_owner_id THEN ARRAY['brand:manage']::text[] ELSE ARRAY[]::text[] END),
      'categories',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sort_order,c.name)
        FROM public.minglora_brand_logo_categories c WHERE c.status='active'),'[]'::jsonb),
      'collections',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.is_system DESC,c.name)
        FROM public.minglora_brand_logo_collections c WHERE c.status='active'),'[]'::jsonb),
      'assets',coalesce((
        SELECT jsonb_agg(to_jsonb(a) ORDER BY a.updated_at DESC)
        FROM (
          SELECT l.id,l.title,l.description,l.category_id,c.name AS category_name,
            l.collection_id,k.name AS collection_name,l.original_name,l.mime_type,l.file_format,
            l.byte_size,l.width,l.height,l.duration_ms,l.storage_bucket,l.storage_path,
            l.current_version_id,l.approved_version_id,l.status,l.created_by,l.created_at,l.updated_at,
            (SELECT count(*)::integer FROM public.minglora_brand_logo_versions v WHERE v.asset_id=l.id) AS version_count,
            EXISTS(SELECT 1 FROM public.minglora_brand_logo_favorites f WHERE f.asset_id=l.id AND f.user_id=v_actor) AS is_favorite
          FROM public.minglora_brand_logo_assets l
          LEFT JOIN public.minglora_brand_logo_categories c ON c.id=l.category_id
          LEFT JOIN public.minglora_brand_logo_collections k ON k.id=l.collection_id
          WHERE l.status <> 'deleted'
            AND (v_name='' OR l.title ILIKE '%'||v_name||'%' OR l.original_name ILIKE '%'||v_name||'%')
            AND (v_category_id IS NULL OR l.category_id=v_category_id)
            AND (v_collection_id IS NULL OR l.collection_id=v_collection_id)
          ORDER BY l.updated_at DESC LIMIT 100
        ) a
      ),'[]'::jsonb),
      'versions',coalesce((
        SELECT jsonb_agg(to_jsonb(v) ORDER BY v.created_at DESC)
        FROM (
          SELECT v.id,v.asset_id,v.version_number,v.original_name,v.mime_type,v.file_format,v.byte_size,
            v.width,v.height,v.duration_ms,v.storage_bucket,v.storage_path,v.change_note,v.uploaded_by,v.created_at,
            (SELECT a.approved_version_id=v.id FROM public.minglora_brand_logo_assets a WHERE a.id=v.asset_id) AS is_approved
          FROM public.minglora_brand_logo_versions v
          ORDER BY v.created_at DESC LIMIT 250
        ) v
      ),'[]'::jsonb),
      'assignments',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.placement_key)
        FROM public.minglora_brand_logo_assignments a),'[]'::jsonb),
      'schedules',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.activates_at)
        FROM public.minglora_brand_logo_schedules s WHERE s.status='scheduled'),'[]'::jsonb),
      'identitySettings',(SELECT to_jsonb(i) FROM public.minglora_brand_identity_settings i WHERE singleton=true),
      'activity',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC)
        FROM (SELECT * FROM public.minglora_brand_logo_activity_logs ORDER BY created_at DESC LIMIT 50) a),'[]'::jsonb),
      'stats',jsonb_build_object(
        'total',(SELECT count(*) FROM public.minglora_brand_logo_assets WHERE status<>'deleted'),
        'draft',(SELECT count(*) FROM public.minglora_brand_logo_assets WHERE status='draft'),
        'approved',(SELECT count(*) FROM public.minglora_brand_logo_assets WHERE status='approved'),
        'active',(SELECT count(*) FROM public.minglora_brand_logo_assets WHERE status='active'),
        'archived',(SELECT count(*) FROM public.minglora_brand_logo_assets WHERE status='archived'),
        'scheduled',(SELECT count(*) FROM public.minglora_brand_logo_schedules WHERE status='scheduled'),
        'bytes',(SELECT coalesce(sum(byte_size),0) FROM public.minglora_brand_logo_assets WHERE status<>'deleted')
      )
    );
  ELSIF v_action='upload_prepare' THEN
    v_asset_id := coalesce(nullif(v_payload->>'assetId','')::uuid,gen_random_uuid());
    v_version_id := coalesce(nullif(v_payload->>'versionId','')::uuid,gen_random_uuid());
    v_title := left(btrim(coalesce(v_payload->>'title','')),120);
    v_description := left(coalesce(v_payload->>'description',''),2000);
    v_note := left(coalesce(v_payload->>'changeNote',''),500);
    v_name := left(btrim(coalesce(v_payload->>'originalName','')),255);
    v_mime := lower(btrim(coalesce(v_payload->>'mimeType','')));
    v_format := lower(btrim(coalesce(v_payload->>'fileFormat','')));
    v_size := nullif(v_payload->>'byteSize','')::bigint;
    v_category_id := nullif(v_payload->>'categoryId','')::uuid;
    v_collection_id := nullif(v_payload->>'collectionId','')::uuid;
    IF v_title='' OR v_name='' OR v_mime NOT IN (
      'image/svg+xml','image/png','image/apng','image/jpeg','image/webp','image/gif',
      'image/vnd.microsoft.icon','image/x-icon','application/json','video/mp4','video/webm'
    ) OR v_size IS NULL OR v_size<1 OR v_size>52428800 THEN
      RAISE EXCEPTION 'Choose a supported logo file up to 50 MB and enter a title.' USING ERRCODE='22023';
    END IF;
    IF v_category_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.minglora_brand_logo_categories WHERE id=v_category_id AND status='active'
    ) THEN RAISE EXCEPTION 'The selected logo category is unavailable.' USING ERRCODE='22023'; END IF;
    IF v_collection_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.minglora_brand_logo_collections WHERE id=v_collection_id AND status='active'
    ) THEN RAISE EXCEPTION 'The selected logo collection is unavailable.' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.minglora_brand_logo_assets WHERE id=v_asset_id AND status='deleted') THEN
      RAISE EXCEPTION 'A deleted logo cannot receive a new version.' USING ERRCODE='22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.minglora_brand_logo_assets WHERE id=v_asset_id) THEN
      SELECT coalesce(max(version_number),0)+1 INTO v_version_number
      FROM public.minglora_brand_logo_versions WHERE asset_id=v_asset_id;
    ELSE
      v_version_number := 1;
    END IF;
    v_path := 'owner/'||v_actor::text||'/'||v_asset_id::text||'/'||v_version_id::text||'/original.'||v_format;
    INSERT INTO public.minglora_brand_logo_upload_sessions(
      asset_id,version_id,actor_user_id,object_path,title,description,category_id,collection_id,
      original_name,mime_type,file_format,byte_size,change_note
    ) VALUES (
      v_asset_id,v_version_id,v_actor,v_path,v_title,v_description,v_category_id,v_collection_id,
      v_name,v_mime,v_format,v_size,v_note
    );
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
    VALUES(v_actor,'upload.prepared','logo',v_asset_id,jsonb_build_object('versionId',v_version_id,'mimeType',v_mime,'byteSize',v_size));
    RETURN jsonb_build_object('assetId',v_asset_id,'versionId',v_version_id,'path',v_path,'versionNumber',v_version_number);
  ELSIF v_action='upload_session_get' THEN
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    v_version_id := nullif(v_payload->>'versionId','')::uuid;
    SELECT * INTO v_row FROM public.minglora_brand_logo_upload_sessions s
    WHERE s.asset_id=v_asset_id AND s.version_id=v_version_id
      AND s.actor_user_id=v_actor AND s.status='pending' AND s.expires_at>now();
    IF NOT FOUND THEN RAISE EXCEPTION 'The logo upload session is missing or expired.' USING ERRCODE='P0002'; END IF;
    RETURN jsonb_build_object('assetId',v_row.asset_id,'versionId',v_row.version_id,
      'path',v_row.object_path,'mimeType',v_row.mime_type,'byteSize',v_row.byte_size,
      'originalName',v_row.original_name,'fileFormat',v_row.file_format);
  ELSIF v_action='upload_complete' THEN
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    v_version_id := nullif(v_payload->>'versionId','')::uuid;
    SELECT * INTO v_row FROM public.minglora_brand_logo_upload_sessions s
    WHERE s.asset_id=v_asset_id AND s.version_id=v_version_id
      AND s.actor_user_id=v_actor AND s.status='pending' AND s.expires_at>now()
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The logo upload session is missing, expired or already completed.' USING ERRCODE='P0002'; END IF;
    IF EXISTS (SELECT 1 FROM public.minglora_brand_logo_assets WHERE id=v_asset_id) THEN
      SELECT coalesce(max(version_number),0)+1 INTO v_version_number
      FROM public.minglora_brand_logo_versions WHERE asset_id=v_asset_id;
    ELSE
      v_version_number := 1;
      INSERT INTO public.minglora_brand_logo_assets(
        id,title,description,category_id,collection_id,original_name,mime_type,file_format,
        byte_size,width,height,duration_ms,storage_path,status,created_by,updated_by
      ) VALUES (
        v_asset_id,v_row.title,v_row.description,v_row.category_id,v_row.collection_id,
        v_row.original_name,v_row.mime_type,v_row.file_format,v_row.byte_size,
        nullif(v_payload->>'width','')::integer,nullif(v_payload->>'height','')::integer,
        nullif(v_payload->>'durationMs','')::bigint,v_row.object_path,'draft',v_actor,v_actor
      );
    END IF;
    INSERT INTO public.minglora_brand_logo_versions(
      id,asset_id,version_number,original_name,mime_type,file_format,byte_size,
      width,height,duration_ms,storage_path,change_note,uploaded_by
    ) VALUES (
      v_version_id,v_asset_id,v_version_number,v_row.original_name,v_row.mime_type,v_row.file_format,
      v_row.byte_size,nullif(v_payload->>'width','')::integer,
      nullif(v_payload->>'height','')::integer,nullif(v_payload->>'durationMs','')::bigint,
      v_row.object_path,v_row.change_note,v_actor
    );
    UPDATE public.minglora_brand_logo_assets SET
      storage_path=v_row.object_path,current_version_id=v_version_id,
      original_name=CASE WHEN v_version_number=1 THEN v_row.original_name ELSE original_name END,
      mime_type=v_row.mime_type,file_format=v_row.file_format,byte_size=v_row.byte_size,
      width=nullif(v_payload->>'width','')::integer,height=nullif(v_payload->>'height','')::integer,
      duration_ms=nullif(v_payload->>'durationMs','')::bigint,
      category_id=coalesce(v_row.category_id,category_id),
      collection_id=coalesce(v_row.collection_id,collection_id),
      status=CASE WHEN status IN ('approved','active') THEN status ELSE 'draft' END,
      updated_by=v_actor,updated_at=now()
    WHERE id=v_asset_id;
    UPDATE public.minglora_brand_logo_upload_sessions SET status='completed',completed_at=now()
    WHERE id=v_row.id;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
    VALUES(v_actor,'upload.completed','logo',v_asset_id,jsonb_build_object('versionId',v_version_id,'versionNumber',v_version_number));
    RETURN jsonb_build_object('ok',true,'assetId',v_asset_id,'versionId',v_version_id,'versionNumber',v_version_number);
  ELSIF v_action='category_create' THEN
    v_name := left(btrim(coalesce(v_payload->>'name','')),80);
    v_slug := lower(regexp_replace(v_name,'[^a-z0-9]+','-','g'));
    IF char_length(v_name)<2 OR v_slug='' THEN RAISE EXCEPTION 'Enter a category name with at least two characters.' USING ERRCODE='22023'; END IF;
    INSERT INTO public.minglora_brand_logo_categories(slug,name,description,is_system,created_by)
    VALUES(v_slug,v_name,left(coalesce(v_payload->>'description',''),500),false,v_actor)
    RETURNING id INTO v_category_id;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id)
    VALUES(v_actor,'category.created','category',v_category_id);
    RETURN jsonb_build_object('ok',true,'id',v_category_id);
  ELSIF v_action='collection_create' THEN
    v_name := left(btrim(coalesce(v_payload->>'name','')),100);
    v_slug := lower(regexp_replace(v_name,'[^a-z0-9]+','-','g'));
    IF char_length(v_name)<2 OR v_slug='' THEN RAISE EXCEPTION 'Enter a collection name with at least two characters.' USING ERRCODE='22023'; END IF;
    INSERT INTO public.minglora_brand_logo_collections(slug,name,description,is_system,created_by)
    VALUES(v_slug,v_name,left(coalesce(v_payload->>'description',''),1000),false,v_actor)
    RETURNING id INTO v_collection_id;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id)
    VALUES(v_actor,'collection.created','collection',v_collection_id);
    RETURN jsonb_build_object('ok',true,'id',v_collection_id);
  ELSIF v_action='asset_update' THEN
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    UPDATE public.minglora_brand_logo_assets SET
      title=coalesce(nullif(left(btrim(v_payload->>'title'),120),''),title),
      description=left(coalesce(v_payload->>'description',description),2000),
      category_id=CASE WHEN v_payload ? 'categoryId' THEN nullif(v_payload->>'categoryId','')::uuid ELSE category_id END,
      collection_id=CASE WHEN v_payload ? 'collectionId' THEN nullif(v_payload->>'collectionId','')::uuid ELSE collection_id END,
      updated_by=v_actor,updated_at=now()
    WHERE id=v_asset_id AND status<>'deleted';
    IF NOT FOUND THEN RAISE EXCEPTION 'The logo asset could not be found.' USING ERRCODE='P0002'; END IF;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id)
    VALUES(v_actor,'asset.updated','logo',v_asset_id);
    RETURN jsonb_build_object('ok',true);
  ELSIF v_action='asset_status' THEN
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    v_status := lower(btrim(coalesce(v_payload->>'status','')));
    IF v_status NOT IN ('archived','draft') THEN RAISE EXCEPTION 'Choose archive or restore for this logo.' USING ERRCODE='22023'; END IF;
    UPDATE public.minglora_brand_logo_assets a SET
      status=CASE
        WHEN v_status='archived' THEN 'archived'
        WHEN a.approved_version_id=a.current_version_id AND a.approved_version_id IS NOT NULL THEN 'approved'
        WHEN EXISTS (
          SELECT 1 FROM public.minglora_brand_logo_assignments p
          WHERE p.asset_id=a.id AND p.version_id=a.approved_version_id AND p.status='active'
        ) THEN 'active'
        ELSE 'draft'
      END,
      updated_by=v_actor,updated_at=now()
    WHERE a.id=v_asset_id AND a.status<>'deleted' AND
      ((v_status='archived' AND a.status<>'archived') OR (v_status='draft' AND a.status='archived'));
    IF NOT FOUND THEN RAISE EXCEPTION 'The logo could not be archived or restored from its current state.' USING ERRCODE='P0002'; END IF;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
    VALUES(v_actor,'asset.'||v_status,'logo',v_asset_id);
    RETURN jsonb_build_object('ok',true,'status',(SELECT status FROM public.minglora_brand_logo_assets WHERE id=v_asset_id));
  ELSIF v_action='favorite_toggle' THEN
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.minglora_brand_logo_assets WHERE id=v_asset_id AND status<>'deleted') THEN
      RAISE EXCEPTION 'The logo asset could not be found.' USING ERRCODE='P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.minglora_brand_logo_favorites WHERE user_id=v_actor AND asset_id=v_asset_id) THEN
      DELETE FROM public.minglora_brand_logo_favorites WHERE user_id=v_actor AND asset_id=v_asset_id;
      RETURN jsonb_build_object('ok',true,'isFavorite',false);
    END IF;
    INSERT INTO public.minglora_brand_logo_favorites(user_id,asset_id) VALUES(v_actor,v_asset_id) ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok',true,'isFavorite',true);
  ELSIF v_action='asset_approve' THEN
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    SELECT current_version_id INTO v_version_id
    FROM public.minglora_brand_logo_assets WHERE id=v_asset_id AND status IN ('draft','approved','active');
    IF NOT FOUND OR v_version_id IS NULL THEN RAISE EXCEPTION 'The logo has no valid current version to approve.' USING ERRCODE='P0002'; END IF;
    UPDATE public.minglora_brand_logo_assets SET
      approved_version_id=v_version_id,
      status=CASE WHEN status='active' THEN 'active' ELSE 'approved' END,
      updated_by=v_actor,updated_at=now() WHERE id=v_asset_id;
    INSERT INTO public.minglora_brand_logo_approval_records(asset_id,version_id,decision,notes,actor_user_id)
    VALUES(v_asset_id,v_version_id,'approved',left(coalesce(v_payload->>'notes',''),1000),v_actor);
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id)
    VALUES(v_actor,'asset.approved','logo',v_asset_id);
    RETURN jsonb_build_object('ok',true,'status',(SELECT status FROM public.minglora_brand_logo_assets WHERE id=v_asset_id),'versionId',v_version_id);
  ELSIF v_action='assignment_set' THEN
    v_placement := lower(btrim(coalesce(v_payload->>'placementKey','')));
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    v_version_id := coalesce(nullif(v_payload->>'versionId','')::uuid,
      (SELECT current_version_id FROM public.minglora_brand_logo_assets WHERE id=v_asset_id));
    IF NOT EXISTS (SELECT 1 FROM public.minglora_brand_logo_assets
      WHERE id=v_asset_id AND status IN ('approved','active') AND approved_version_id=v_version_id) THEN
      RAISE EXCEPTION 'Only an approved current logo version can be assigned for publication.' USING ERRCODE='42501';
    END IF;
    INSERT INTO public.minglora_brand_logo_assignments(placement_key,asset_id,version_id,status,updated_by)
    VALUES(v_placement,v_asset_id,v_version_id,'pending_approval',v_actor)
    ON CONFLICT(placement_key) DO UPDATE SET
      asset_id=EXCLUDED.asset_id,version_id=EXCLUDED.version_id,status='pending_approval',
      updated_by=EXCLUDED.updated_by,updated_at=now()
    RETURNING id INTO v_assignment_id;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
    VALUES(v_actor,'assignment.pending','placement',v_assignment_id,jsonb_build_object('placementKey',v_placement,'assetId',v_asset_id));
    RETURN jsonb_build_object('ok',true,'assignmentId',v_assignment_id,'status','pending_approval');
  ELSIF v_action='assignment_publish' THEN
    v_placement := lower(btrim(coalesce(v_payload->>'placementKey','')));
    SELECT * INTO v_row FROM public.minglora_brand_logo_assignments
    WHERE placement_key=v_placement AND status='pending_approval' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No pending logo placement approval was found.' USING ERRCODE='P0002'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.minglora_brand_logo_assets
      WHERE id=v_row.asset_id AND status IN ('approved','active') AND approved_version_id=v_row.version_id) THEN
      RAISE EXCEPTION 'The assigned logo version is no longer approved.' USING ERRCODE='42501';
    END IF;
    v_previous_asset := v_row.asset_id;
    v_previous_version := v_row.version_id;
    SELECT h.deployed_asset_id,h.deployed_version_id INTO v_row
    FROM public.minglora_brand_deployment_history h
    WHERE h.placement_key=v_placement
    ORDER BY h.created_at DESC LIMIT 1;
    IF FOUND THEN
      v_previous_asset := v_row.deployed_asset_id;
      v_previous_version := v_row.deployed_version_id;
    ELSE
      v_previous_asset := NULL;
      v_previous_version := NULL;
    END IF;
    SELECT id INTO v_assignment_id FROM public.minglora_brand_logo_assignments WHERE placement_key=v_placement;
    UPDATE public.minglora_brand_logo_assignments SET status='active',updated_by=v_actor,updated_at=now()
    WHERE id=v_assignment_id;
    UPDATE public.minglora_brand_logo_assets SET status='active',updated_by=v_actor,updated_at=now()
    WHERE id=(SELECT asset_id FROM public.minglora_brand_logo_assignments WHERE id=v_assignment_id);
    INSERT INTO public.minglora_brand_deployment_history(
      assignment_id,placement_key,action,previous_asset_id,previous_version_id,
      deployed_asset_id,deployed_version_id,actor_user_id
    ) VALUES (
      v_assignment_id,v_placement,'published',v_previous_asset,v_previous_version,
      (SELECT asset_id FROM public.minglora_brand_logo_assignments WHERE id=v_assignment_id),
      (SELECT version_id FROM public.minglora_brand_logo_assignments WHERE id=v_assignment_id),v_actor
    );
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
    VALUES(v_actor,'assignment.published','placement',v_assignment_id,jsonb_build_object('placementKey',v_placement));
    RETURN jsonb_build_object('ok',true,'assignmentId',v_assignment_id,'status','active');
  ELSIF v_action='assignment_rollback' THEN
    v_placement := lower(btrim(coalesce(v_payload->>'placementKey','')));
    SELECT * INTO v_row FROM public.minglora_brand_logo_assignments WHERE placement_key=v_placement FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The logo placement does not exist.' USING ERRCODE='P0002'; END IF;
    SELECT * INTO v_row FROM public.minglora_brand_deployment_history
    WHERE placement_key=v_placement AND action='published'
    ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'No previous published logo version is available for rollback.' USING ERRCODE='P0002'; END IF;
    SELECT id INTO v_assignment_id FROM public.minglora_brand_logo_assignments WHERE placement_key=v_placement;
    IF v_row.previous_asset_id IS NULL THEN
      UPDATE public.minglora_brand_logo_assignments SET asset_id=NULL,version_id=NULL,status='disabled',
        updated_by=v_actor,updated_at=now() WHERE id=v_assignment_id;
    ELSE
      UPDATE public.minglora_brand_logo_assignments SET asset_id=v_row.previous_asset_id,
        version_id=v_row.previous_version_id,status='active',updated_by=v_actor,updated_at=now()
      WHERE id=v_assignment_id;
    END IF;
    INSERT INTO public.minglora_brand_deployment_history(
      assignment_id,placement_key,action,previous_asset_id,previous_version_id,
      deployed_asset_id,deployed_version_id,actor_user_id
    ) VALUES (
      v_assignment_id,v_placement,'rolled_back',v_row.deployed_asset_id,v_row.deployed_version_id,
      v_row.previous_asset_id,v_row.previous_version_id,v_actor
    );
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
    VALUES(v_actor,'assignment.rolled_back','placement',v_assignment_id,jsonb_build_object('placementKey',v_placement));
    RETURN jsonb_build_object('ok',true,'status','rolled_back');
  ELSIF v_action='schedule_create' THEN
    v_placement := lower(btrim(coalesce(v_payload->>'placementKey','')));
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    v_version_id := coalesce(nullif(v_payload->>'versionId','')::uuid,
      (SELECT current_version_id FROM public.minglora_brand_logo_assets WHERE id=v_asset_id));
    v_activates := nullif(v_payload->>'activatesAt','')::timestamptz;
    v_expires := nullif(v_payload->>'expiresAt','')::timestamptz;
    v_timezone := left(coalesce(v_payload->>'timezone','America/Jamaica'),64);
    IF v_activates IS NULL OR v_activates<=now() OR
       (v_expires IS NOT NULL AND v_expires<=v_activates) THEN
      RAISE EXCEPTION 'Choose a future activation time and a later optional expiry.' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.minglora_brand_logo_assets
      WHERE id=v_asset_id AND status='approved' AND current_version_id=v_version_id) THEN
      RAISE EXCEPTION 'Only an approved logo version can be scheduled.' USING ERRCODE='42501';
    END IF;
    INSERT INTO public.minglora_brand_logo_schedules(
      placement_key,asset_id,version_id,activates_at,expires_at,timezone,created_by
    ) VALUES(v_placement,v_asset_id,v_version_id,v_activates,v_expires,v_timezone,v_actor)
    RETURNING id INTO v_assignment_id;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id)
    VALUES(v_actor,'schedule.created','schedule',v_assignment_id);
    RETURN jsonb_build_object('ok',true,'scheduleId',v_assignment_id,'status','scheduled');
  ELSIF v_action='schedule_cancel' THEN
    v_asset_id := nullif(v_payload->>'scheduleId','')::uuid;
    UPDATE public.minglora_brand_logo_schedules SET status='cancelled'
    WHERE id=v_asset_id AND status='scheduled';
    IF NOT FOUND THEN RAISE EXCEPTION 'The pending brand schedule could not be cancelled.' USING ERRCODE='P0002'; END IF;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id)
    VALUES(v_actor,'schedule.cancelled','schedule',v_asset_id);
    RETURN jsonb_build_object('ok',true,'status','cancelled');
  ELSIF v_action='identity_update' THEN
    v_result := v_payload->'settings';
    IF v_result IS NULL OR jsonb_typeof(v_result)<>'object' OR pg_column_size(v_result)>32768 THEN
      RAISE EXCEPTION 'Brand identity settings must be a valid object under 32 KB.' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.minglora_brand_identity_settings(singleton,settings,version,updated_by,updated_at)
    VALUES(true,v_result,1,v_actor,now())
    ON CONFLICT(singleton) DO UPDATE SET
      settings=EXCLUDED.settings,
      version=public.minglora_brand_identity_settings.version+1,
      updated_by=EXCLUDED.updated_by,updated_at=now();
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,details)
    VALUES(v_actor,'identity.updated','brand_identity',jsonb_build_object('version',(SELECT version FROM public.minglora_brand_identity_settings WHERE singleton=true)));
    RETURN (SELECT to_jsonb(i) FROM public.minglora_brand_identity_settings i WHERE singleton=true);
  ELSIF v_action='asset_url' THEN
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    v_version_id := nullif(v_payload->>'versionId','')::uuid;
    SELECT v.storage_bucket,v.storage_path INTO v_row
    FROM public.minglora_brand_logo_versions v
    JOIN public.minglora_brand_logo_assets a ON a.id=v.asset_id
    WHERE a.id=v_asset_id AND v.id=coalesce(v_version_id,a.current_version_id) AND a.status<>'deleted';
    IF NOT FOUND THEN RAISE EXCEPTION 'The requested logo version is unavailable.' USING ERRCODE='P0002'; END IF;
    RETURN jsonb_build_object('bucket',v_row.storage_bucket,'path',v_row.storage_path);
  ELSE
    RAISE EXCEPTION 'Unsupported Minglora brand management action.' USING ERRCODE='22023';
  END IF;
END;
$function$;

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
  PERFORM public.minglora_assert_brand_permission(p_actor_user_id,p_mfa_verified,'brand:publish');
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
  PERFORM public.minglora_assert_brand_permission(p_actor_user_id,p_mfa_verified,'brand:edit');
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
  PERFORM public.minglora_assert_brand_permission(p_actor_user_id,p_mfa_verified,'brand:publish');
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

