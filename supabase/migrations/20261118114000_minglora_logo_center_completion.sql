BEGIN;

-- Extend the existing brand asset table instead of creating a competing library.
ALTER TABLE public.minglora_brand_logo_assets
  ADD COLUMN IF NOT EXISTS asset_type text NOT NULL DEFAULT 'logo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.minglora_brand_logo_assets'::regclass
      AND conname='minglora_brand_logo_assets_asset_type_check'
  ) THEN
    ALTER TABLE public.minglora_brand_logo_assets
      ADD CONSTRAINT minglora_brand_logo_assets_asset_type_check
      CHECK (asset_type IN (
        'logo','profile_branding','cover_image','application_icon','favicon','website_banner',
        'promotional_banner','background_image','wallpaper','loading_animation','watermark',
        'social_media_graphic','advertisement_template','notification_graphic','email_graphic',
        'live_streaming_graphic','meetwave_graphic','sticker','illustration','brand_icon',
        'seasonal_graphic','event_graphic','video_overlay','graphic_template'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS minglora_brand_logo_assets_type_updated_idx
  ON public.minglora_brand_logo_assets(asset_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.minglora_brand_backup_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing','verified','degraded','failed')),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot)='object'),
  snapshot_sha256 text CHECK (snapshot_sha256 IS NULL OR snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  asset_count integer NOT NULL DEFAULT 0 CHECK (asset_count >= 0),
  version_count integer NOT NULL DEFAULT 0 CHECK (version_count >= 0),
  backup_copy_count integer NOT NULL DEFAULT 0 CHECK (backup_copy_count >= 0),
  backup_bytes bigint NOT NULL DEFAULT 0 CHECK (backup_bytes >= 0),
  failure_reason text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_restored_at timestamptz,
  last_restored_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS minglora_brand_backup_snapshots_created_idx
  ON public.minglora_brand_backup_snapshots(created_at DESC);
ALTER TABLE public.minglora_brand_backup_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.minglora_brand_backup_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.minglora_brand_backup_snapshots TO service_role;

-- Add Logo Center capabilities to the existing Minglora administrator role catalogue.
INSERT INTO public.minglora_admin_permission_catalog(permission_key,display_name,description,risk_level) VALUES
 ('brand:read','Brand asset view','View approved brand assets, versions, analytics and backup status.','medium'),
 ('brand:upload','Brand asset upload','Upload new brand assets and create immutable asset versions.','high'),
 ('brand:edit','Brand asset editing','Edit metadata, organize assets and create derived or restored versions.','high'),
 ('brand:approve','Brand asset approval','Approve a logo version for placement and publication review.','high'),
 ('brand:publish','Brand publication','Publish and roll back approved brand placements.','critical'),
 ('brand:manage','Brand identity administration','Manage official identity settings, permissions, backup restoration and system policies.','critical')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.minglora_admin_role_permissions(role_key,permission_key)
SELECT mapping.role_key,mapping.permission_key
FROM (VALUES
 ('technical_administrator','brand:read'),
 ('technical_administrator','brand:upload'),
 ('technical_administrator','brand:edit'),
 ('content_administrator','brand:read'),
 ('content_administrator','brand:upload'),
 ('content_administrator','brand:edit'),
 ('security_administrator','brand:read'),
 ('read_only_auditor','brand:read'),
 ('creator_manager','brand:read')
) AS mapping(role_key,permission_key)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.minglora_admin_brand_extension_command(
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
  v_actor uuid := p_actor_user_id;
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_payload jsonb := CASE WHEN jsonb_typeof(p_payload)='object' THEN p_payload ELSE '{}'::jsonb END;
  v_asset_id uuid;
  v_version_id uuid;
  v_new_asset_id uuid;
  v_new_version_id uuid;
  v_snapshot_id uuid;
  v_snapshot_row public.minglora_brand_backup_snapshots%ROWTYPE;
  v_asset public.minglora_brand_logo_assets%ROWTYPE;
  v_version public.minglora_brand_logo_versions%ROWTYPE;
  v_title text;
  v_asset_type text;
  v_path text;
  v_format text;
  v_version_number integer;
  v_copy_count integer;
  v_byte_count bigint;
  v_snapshot jsonb;
  v_copies jsonb;
  v_copy jsonb;
  v_mapping jsonb := '{}'::jsonb;
  v_new_status text;
  v_placement text;
  v_assignment record;
  v_existing record;
  v_old_asset uuid;
  v_old_version uuid;
  v_new_asset uuid;
  v_new_version uuid;
  v_history_action text;
  v_restored integer := 0;
  v_disabled integer := 0;
  v_now timestamptz := now();
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Brand extension administration must use the trusted Minglora server runtime.' USING ERRCODE='42501';
  END IF;
  IF v_actor IS DISTINCT FROM v_owner_id OR p_mfa_verified IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Only the MFA-verified designated Minglora owner can manage official brand identity.' USING ERRCODE='42501';
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

  IF v_action='asset_type_update' THEN
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    v_asset_type := lower(btrim(coalesce(v_payload->>'assetType','logo')));
    IF v_asset_type NOT IN (
      'logo','profile_branding','cover_image','application_icon','favicon','website_banner',
      'promotional_banner','background_image','wallpaper','loading_animation','watermark',
      'social_media_graphic','advertisement_template','notification_graphic','email_graphic',
      'live_streaming_graphic','meetwave_graphic','sticker','illustration','brand_icon',
      'seasonal_graphic','event_graphic','video_overlay','graphic_template'
    ) THEN RAISE EXCEPTION 'Choose a supported brand asset type.' USING ERRCODE='22023'; END IF;
    UPDATE public.minglora_brand_logo_assets
      SET asset_type=v_asset_type,updated_by=v_actor,updated_at=now()
      WHERE id=v_asset_id AND status<>'deleted';
    IF NOT FOUND THEN RAISE EXCEPTION 'The brand asset could not be found.' USING ERRCODE='P0002'; END IF;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
      VALUES(v_actor,'asset.type_updated','brand_asset',v_asset_id,jsonb_build_object('assetType',v_asset_type));
    RETURN jsonb_build_object('ok',true,'assetType',v_asset_type);
  ELSIF v_action='asset_delete' THEN
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    IF EXISTS (SELECT 1 FROM public.minglora_brand_logo_assignments WHERE asset_id=v_asset_id AND status='active')
       OR EXISTS (SELECT 1 FROM public.minglora_brand_logo_schedules WHERE asset_id=v_asset_id AND status='scheduled') THEN
      RAISE EXCEPTION 'An assigned or scheduled brand asset cannot be deleted. Roll back its placements or cancel its schedules first.' USING ERRCODE='42501';
    END IF;
    UPDATE public.minglora_brand_logo_assets SET status='deleted',updated_by=v_actor,updated_at=now()
      WHERE id=v_asset_id AND status NOT IN ('deleted','archived');
    IF NOT FOUND THEN RAISE EXCEPTION 'The brand asset could not be deleted from its current state.' USING ERRCODE='P0002'; END IF;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id)
      VALUES(v_actor,'asset.soft_deleted','brand_asset',v_asset_id);
    RETURN jsonb_build_object('ok',true,'status','deleted','recoverable',true);
  ELSIF v_action='asset_restore_deleted' THEN
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    UPDATE public.minglora_brand_logo_assets a SET
      status=CASE WHEN a.approved_version_id=a.current_version_id AND a.approved_version_id IS NOT NULL
        THEN 'approved' ELSE 'draft' END,
      updated_by=v_actor,updated_at=now()
    WHERE a.id=v_asset_id AND a.status='deleted';
    IF NOT FOUND THEN RAISE EXCEPTION 'The deleted brand asset is unavailable for recovery.' USING ERRCODE='P0002'; END IF;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id)
      VALUES(v_actor,'asset.restored_from_deleted','brand_asset',v_asset_id);
    RETURN jsonb_build_object('ok',true,'status',(SELECT status FROM public.minglora_brand_logo_assets WHERE id=v_asset_id));
  ELSIF v_action='deleted_assets' THEN
    RETURN jsonb_build_object('assets',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',a.id,'title',a.title,'assetType',a.asset_type,'categoryId',a.category_id,
        'collectionId',a.collection_id,'fileFormat',a.file_format,'byteSize',a.byte_size,
        'deletedAt',a.updated_at,'versionCount',(SELECT count(*) FROM public.minglora_brand_logo_versions v WHERE v.asset_id=a.id)
      ) ORDER BY a.updated_at DESC)
      FROM public.minglora_brand_logo_assets a WHERE a.status='deleted'
    ),'[]'::jsonb));
  ELSIF v_action='asset_duplicate_prepare' THEN
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    SELECT * INTO v_asset FROM public.minglora_brand_logo_assets
      WHERE id=v_asset_id AND status NOT IN ('deleted') FOR SHARE;
    IF NOT FOUND OR v_asset.current_version_id IS NULL THEN
      RAISE EXCEPTION 'The source brand asset has no recoverable current version.' USING ERRCODE='P0002';
    END IF;
    SELECT * INTO v_version FROM public.minglora_brand_logo_versions
      WHERE id=v_asset.current_version_id AND asset_id=v_asset_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The source version is unavailable.' USING ERRCODE='P0002'; END IF;
    v_new_asset_id := gen_random_uuid();
    v_new_version_id := gen_random_uuid();
    v_path := 'owner/'||v_actor::text||'/'||v_new_asset_id::text||'/'||v_new_version_id::text||'/original.'||v_version.file_format;
    RETURN jsonb_build_object(
      'assetId',v_new_asset_id,'versionId',v_new_version_id,'path',v_path,
      'sourcePath',v_version.storage_path,'title',left(v_asset.title||' copy',120),
      'description',v_asset.description,'assetType',v_asset.asset_type,
      'categoryId',v_asset.category_id,'collectionId',v_asset.collection_id,
      'originalName',v_version.original_name,'mimeType',v_version.mime_type,'fileFormat',v_version.file_format,
      'byteSize',v_version.byte_size,'width',v_version.width,'height',v_version.height,'durationMs',v_version.duration_ms
    );
  ELSIF v_action='asset_duplicate_complete' THEN
    v_asset_id := nullif(v_payload->>'sourceAssetId','')::uuid;
    v_new_asset_id := nullif(v_payload->>'assetId','')::uuid;
    v_new_version_id := nullif(v_payload->>'versionId','')::uuid;
    v_path := left(coalesce(v_payload->>'path',''),500);
    IF v_new_asset_id IS NULL OR v_new_version_id IS NULL OR v_path NOT LIKE 'owner/'||v_actor::text||'/'||v_new_asset_id::text||'/'||v_new_version_id::text||'/original.%' THEN
      RAISE EXCEPTION 'The copied brand asset path is invalid.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_asset FROM public.minglora_brand_logo_assets WHERE id=v_asset_id AND status<>'deleted';
    IF NOT FOUND THEN RAISE EXCEPTION 'The source brand asset is no longer available.' USING ERRCODE='P0002'; END IF;
    SELECT * INTO v_version FROM public.minglora_brand_logo_versions WHERE id=v_asset.current_version_id AND asset_id=v_asset.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The source brand version is no longer available.' USING ERRCODE='P0002'; END IF;
    INSERT INTO public.minglora_brand_logo_assets(
      id,title,description,category_id,collection_id,original_name,mime_type,file_format,
      byte_size,width,height,duration_ms,storage_path,current_version_id,status,created_by,updated_by,asset_type
    ) VALUES (
      v_new_asset_id,left(coalesce(v_payload->>'title',v_asset.title||' copy'),120),v_asset.description,
      v_asset.category_id,v_asset.collection_id,v_version.original_name,v_version.mime_type,v_version.file_format,
      v_version.byte_size,v_version.width,v_version.height,v_version.duration_ms,v_path,NULL,
      'draft',v_actor,v_actor,v_asset.asset_type
    );
    INSERT INTO public.minglora_brand_logo_versions(
      id,asset_id,version_number,original_name,mime_type,file_format,byte_size,width,height,duration_ms,storage_path,change_note,uploaded_by
    ) VALUES (
      v_new_version_id,v_new_asset_id,1,v_version.original_name,v_version.mime_type,v_version.file_format,
      v_version.byte_size,v_version.width,v_version.height,v_version.duration_ms,v_path,
      'Duplicated from asset '||v_asset_id::text,v_actor
    );
    UPDATE public.minglora_brand_logo_assets SET current_version_id=v_new_version_id WHERE id=v_new_asset_id;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
      VALUES(v_actor,'asset.duplicated','brand_asset',v_new_asset_id,jsonb_build_object('sourceAssetId',v_asset_id));
    RETURN jsonb_build_object('ok',true,'assetId',v_new_asset_id,'versionId',v_new_version_id);
  ELSIF v_action='asset_restore_version_prepare' THEN
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    v_version_id := nullif(v_payload->>'versionId','')::uuid;
    SELECT * INTO v_asset FROM public.minglora_brand_logo_assets WHERE id=v_asset_id AND status<>'deleted' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The brand asset was not found.' USING ERRCODE='P0002'; END IF;
    SELECT * INTO v_version FROM public.minglora_brand_logo_versions WHERE id=v_version_id AND asset_id=v_asset_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The selected historical version was not found.' USING ERRCODE='P0002'; END IF;
    v_new_version_id := gen_random_uuid();
    v_path := 'owner/'||v_actor::text||'/'||v_asset_id::text||'/'||v_new_version_id::text||'/original.'||v_version.file_format;
    SELECT coalesce(max(version_number),0)+1 INTO v_version_number
      FROM public.minglora_brand_logo_versions WHERE asset_id=v_asset_id;
    RETURN jsonb_build_object(
      'assetId',v_asset_id,'versionId',v_new_version_id,'versionNumber',v_version_number,
      'path',v_path,'sourcePath',v_version.storage_path,'originalName',v_version.original_name,
      'mimeType',v_version.mime_type,'fileFormat',v_version.file_format,'byteSize',v_version.byte_size,
      'width',v_version.width,'height',v_version.height,'durationMs',v_version.duration_ms
    );
  ELSIF v_action='asset_restore_version_complete' THEN
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    v_new_version_id := nullif(v_payload->>'versionId','')::uuid;
    v_path := left(coalesce(v_payload->>'path',''),500);
    IF v_new_version_id IS NULL OR v_path NOT LIKE 'owner/'||v_actor::text||'/'||v_asset_id::text||'/'||v_new_version_id::text||'/original.%' THEN
      RAISE EXCEPTION 'The restored brand version path is invalid.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_asset FROM public.minglora_brand_logo_assets WHERE id=v_asset_id AND status<>'deleted' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The brand asset is no longer available.' USING ERRCODE='P0002'; END IF;
    v_version_id := nullif(v_payload->>'sourceVersionId','')::uuid;
    SELECT * INTO v_version FROM public.minglora_brand_logo_versions WHERE id=v_version_id AND asset_id=v_asset_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The historical source version is no longer available.' USING ERRCODE='P0002'; END IF;
    SELECT coalesce(max(version_number),0)+1 INTO v_version_number
      FROM public.minglora_brand_logo_versions WHERE asset_id=v_asset_id;
    INSERT INTO public.minglora_brand_logo_versions(
      id,asset_id,version_number,original_name,mime_type,file_format,byte_size,width,height,duration_ms,
      storage_path,change_note,uploaded_by
    ) VALUES (
      v_new_version_id,v_asset_id,v_version_number,v_version.original_name,v_version.mime_type,
      v_version.file_format,v_version.byte_size,v_version.width,v_version.height,v_version.duration_ms,
      v_path,'Restored as a new immutable version from version '||v_version.version_number::text,v_actor
    );
    UPDATE public.minglora_brand_logo_assets SET
      current_version_id=v_new_version_id,storage_path=v_path,original_name=v_version.original_name,
      mime_type=v_version.mime_type,file_format=v_version.file_format,byte_size=v_version.byte_size,
      width=v_version.width,height=v_version.height,duration_ms=v_version.duration_ms,
      status=CASE WHEN EXISTS (SELECT 1 FROM public.minglora_brand_logo_assignments a WHERE a.asset_id=v_asset_id AND a.status='active')
        THEN 'active' ELSE 'draft' END,
      updated_by=v_actor,updated_at=now()
      WHERE id=v_asset_id;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
      VALUES(v_actor,'asset.version_restored','brand_asset',v_asset_id,jsonb_build_object('sourceVersionId',v_version_id,'newVersionId',v_new_version_id));
    RETURN jsonb_build_object('ok',true,'assetId',v_asset_id,'versionId',v_new_version_id,'versionNumber',v_version_number,'status',(SELECT status FROM public.minglora_brand_logo_assets WHERE id=v_asset_id));
  ELSIF v_action='analytics' THEN
    RETURN jsonb_build_object(
      'stats',jsonb_build_object(
        'total',(SELECT count(*) FROM public.minglora_brand_logo_assets WHERE status<>'deleted'),
        'logos',(SELECT count(*) FROM public.minglora_brand_logo_assets WHERE asset_type='logo' AND status<>'deleted'),
        'assets',(SELECT count(*) FROM public.minglora_brand_logo_assets WHERE asset_type<>'logo' AND status<>'deleted'),
        'active',(SELECT count(*) FROM public.minglora_brand_logo_assets WHERE status='active'),
        'approved',(SELECT count(*) FROM public.minglora_brand_logo_assets WHERE status='approved'),
        'draft',(SELECT count(*) FROM public.minglora_brand_logo_assets WHERE status='draft'),
        'archived',(SELECT count(*) FROM public.minglora_brand_logo_assets WHERE status='archived'),
        'deleted',(SELECT count(*) FROM public.minglora_brand_logo_assets WHERE status='deleted'),
        'versions',(SELECT count(*) FROM public.minglora_brand_logo_versions),
        'assignments',(SELECT count(*) FROM public.minglora_brand_logo_assignments WHERE status='active'),
        'pendingAssignments',(SELECT count(*) FROM public.minglora_brand_logo_assignments WHERE status='pending_approval'),
        'scheduled',(SELECT count(*) FROM public.minglora_brand_logo_schedules WHERE status='scheduled'),
        'backupSnapshots',(SELECT count(*) FROM public.minglora_brand_backup_snapshots WHERE status='verified'),
        'storageBytes',(SELECT coalesce(sum(byte_size),0) FROM public.minglora_brand_logo_versions),
        'unused',(SELECT count(*) FROM public.minglora_brand_logo_assets a WHERE a.status<>'deleted'
          AND NOT EXISTS (SELECT 1 FROM public.minglora_brand_logo_assignments p WHERE p.asset_id=a.id AND p.status='active'))
      ),
      'mostUsed',coalesce((
        SELECT jsonb_agg(jsonb_build_object('assetId',x.asset_id,'title',x.title,'placements',x.placements)
          ORDER BY x.placements DESC,x.title)
        FROM (
          SELECT a.id AS asset_id,a.title,count(*)::integer AS placements
          FROM public.minglora_brand_logo_assignments p
          JOIN public.minglora_brand_logo_assets a ON a.id=p.asset_id
          WHERE p.status='active' GROUP BY a.id,a.title ORDER BY count(*) DESC LIMIT 10
        ) x
      ),'[]'::jsonb),
      'recentDeployments',coalesce((
        SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
        FROM (SELECT id,placement_key,action,previous_asset_id,deployed_asset_id,created_at
          FROM public.minglora_brand_deployment_history ORDER BY created_at DESC LIMIT 25) x
      ),'[]'::jsonb),
      'recentAssets',coalesce((
        SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'assetType',asset_type,'status',status,'updatedAt',updated_at)
          ORDER BY updated_at DESC)
        FROM (SELECT id,title,asset_type,status,updated_at FROM public.minglora_brand_logo_assets
          WHERE status<>'deleted' ORDER BY updated_at DESC LIMIT 10) x
      ),'[]'::jsonb),
      'formats',coalesce((
        SELECT jsonb_agg(jsonb_build_object('format',file_format,'count',format_count,'bytes',bytes)
          ORDER BY format_count DESC)
        FROM (SELECT lower(file_format) AS file_format,count(*)::integer AS format_count,sum(byte_size)::bigint AS bytes
          FROM public.minglora_brand_logo_assets WHERE status<>'deleted' GROUP BY lower(file_format)) x
      ),'[]'::jsonb),
      'loadFailureTracking','not_configured'
    );
  ELSIF v_action='backup_prepare' THEN
    v_title := left(btrim(coalesce(v_payload->>'label','')),120);
    IF v_title='' THEN v_title := 'Brand backup '||to_char(now(),'YYYY-MM-DD HH24:MI'); END IF;
    IF char_length(v_title)<2 THEN RAISE EXCEPTION 'Enter a backup label of at least two characters.' USING ERRCODE='22023'; END IF;
    v_snapshot := jsonb_build_object(
      'schemaVersion',1,
      'createdAt',now(),
      'assets',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at) FROM public.minglora_brand_logo_assets a),'[]'::jsonb),
      'versions',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.created_at) FROM public.minglora_brand_logo_versions v),'[]'::jsonb),
      'assignments',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.placement_key)
        FROM public.minglora_brand_logo_assignments a WHERE a.status IN ('active','disabled')),'[]'::jsonb),
      'categories',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sort_order,c.name) FROM public.minglora_brand_logo_categories c),'[]'::jsonb),
      'collections',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.name) FROM public.minglora_brand_logo_collections c),'[]'::jsonb),
      'identitySettings',(SELECT to_jsonb(i) FROM public.minglora_brand_identity_settings i WHERE singleton=true),
      'copies','[]'::jsonb
    );
    INSERT INTO public.minglora_brand_backup_snapshots(label,status,snapshot,asset_count,version_count,created_by)
    VALUES(v_title,'preparing',v_snapshot,jsonb_array_length(v_snapshot->'assets'),jsonb_array_length(v_snapshot->'versions'),v_actor)
    RETURNING id INTO v_snapshot_id;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
      VALUES(v_actor,'backup.prepared','backup_snapshot',v_snapshot_id,jsonb_build_object('assetCount',jsonb_array_length(v_snapshot->'assets'),'versionCount',jsonb_array_length(v_snapshot->'versions')));
    RETURN jsonb_build_object(
      'snapshotId',v_snapshot_id,'assets',v_snapshot->'assets',
      'versions',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'versionId',v.id,'assetId',v.asset_id,'sourcePath',v.storage_path,
        'fileFormat',v.file_format,'byteSize',v.byte_size,'versionNumber',v.version_number
      ) ORDER BY v.created_at) FROM public.minglora_brand_logo_versions v),'[]'::jsonb)
    );
  ELSIF v_action='backup_complete' THEN
    v_snapshot_id := nullif(v_payload->>'snapshotId','')::uuid;
    v_copies := CASE WHEN jsonb_typeof(v_payload->'copies')='array' THEN v_payload->'copies' ELSE '[]'::jsonb END;
    SELECT * INTO v_snapshot_row FROM public.minglora_brand_backup_snapshots
      WHERE id=v_snapshot_id AND created_by=v_actor AND status='preparing' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The pending backup record was not found.' USING ERRCODE='P0002'; END IF;
    IF jsonb_array_length(v_copies)<>v_snapshot_row.version_count THEN
      RAISE EXCEPTION 'The backup copy count does not match the immutable version inventory.' USING ERRCODE='22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_copies) c(value)
      WHERE coalesce(c.value->>'backupPath','') NOT LIKE 'recovery/'||v_snapshot_id::text||'/%'
        OR coalesce(c.value->>'sha256','') !~ '^[a-f0-9]{64}$'
        OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_snapshot_row.snapshot->'versions') v(value)
          WHERE v.value->>'id'=c.value->>'versionId')
    ) THEN RAISE EXCEPTION 'A backup object path, version reference or checksum is invalid.' USING ERRCODE='22023'; END IF;
    v_snapshot := jsonb_set(v_snapshot_row.snapshot,'{copies}',v_copies,true);
    v_byte_count := coalesce((SELECT sum((c.value->>'byteSize')::bigint) FROM jsonb_array_elements(v_copies) c(value)),0);
    UPDATE public.minglora_brand_backup_snapshots SET
      snapshot=v_snapshot,
      snapshot_sha256=encode(extensions.digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex'),
      backup_copy_count=jsonb_array_length(v_copies),
      backup_bytes=v_byte_count,status='verified',completed_at=now(),failure_reason=''
    WHERE id=v_snapshot_id;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
      VALUES(v_actor,'backup.verified','backup_snapshot',v_snapshot_id,jsonb_build_object('copyCount',jsonb_array_length(v_copies),'backupBytes',v_byte_count));
    RETURN jsonb_build_object('ok',true,'snapshotId',v_snapshot_id,'status','verified','copyCount',jsonb_array_length(v_copies),'backupBytes',v_byte_count);
  ELSIF v_action='backup_fail' THEN
    v_snapshot_id := nullif(v_payload->>'snapshotId','')::uuid;
    UPDATE public.minglora_brand_backup_snapshots SET status='failed',
      failure_reason=left(coalesce(v_payload->>'reason','Storage copy or integrity verification failed.'),240),
      completed_at=now()
    WHERE id=v_snapshot_id AND created_by=v_actor AND status='preparing';
    IF NOT FOUND THEN RAISE EXCEPTION 'The pending backup record could not be marked failed.' USING ERRCODE='P0002'; END IF;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id)
      VALUES(v_actor,'backup.failed','backup_snapshot',v_snapshot_id);
    RETURN jsonb_build_object('ok',true,'status','failed');
  ELSIF v_action='backup_list' THEN
    RETURN jsonb_build_object('snapshots',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',b.id,'label',b.label,'status',b.status,'snapshotSha256',b.snapshot_sha256,
        'assetCount',b.asset_count,'versionCount',b.version_count,'backupCopyCount',b.backup_copy_count,
        'backupBytes',b.backup_bytes,'failureReason',b.failure_reason,'createdAt',b.created_at,
        'completedAt',b.completed_at,'lastRestoredAt',b.last_restored_at
      ) ORDER BY b.created_at DESC)
      FROM (SELECT * FROM public.minglora_brand_backup_snapshots ORDER BY created_at DESC LIMIT 50) b
    ),'[]'::jsonb));
  ELSIF v_action='backup_verify' THEN
    v_snapshot_id := nullif(v_payload->>'snapshotId','')::uuid;
    SELECT * INTO v_snapshot_row FROM public.minglora_brand_backup_snapshots WHERE id=v_snapshot_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The requested backup snapshot was not found.' USING ERRCODE='P0002'; END IF;
    RETURN jsonb_build_object(
      'snapshotId',v_snapshot_id,
      'status',v_snapshot_row.status,
      'integrityValid',v_snapshot_row.snapshot_sha256 IS NOT NULL
        AND v_snapshot_row.snapshot_sha256=encode(extensions.digest(convert_to(v_snapshot_row.snapshot::text,'UTF8'),'sha256'),'hex'),
      'snapshot',v_snapshot_row.snapshot,
      'backupCopyCount',v_snapshot_row.backup_copy_count
    );
  ELSIF v_action='backup_restore' THEN
    v_snapshot_id := nullif(v_payload->>'snapshotId','')::uuid;
    SELECT * INTO v_snapshot_row FROM public.minglora_brand_backup_snapshots
      WHERE id=v_snapshot_id AND status='verified'
        AND snapshot_sha256=encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex')
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'A verified, integrity-valid backup is required for restoration.' USING ERRCODE='42501'; END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(v_snapshot_row.snapshot->'copies'))<>v_snapshot_row.version_count THEN
      RAISE EXCEPTION 'The backup does not contain every immutable logo version.' USING ERRCODE='22023';
    END IF;

    -- Map the historical version IDs to immutable, restored copy paths. Reuse an
    -- already registered copy path on subsequent restores; never rewrite a version row.
    FOR v_copy IN SELECT value FROM jsonb_array_elements(v_snapshot_row.snapshot->'versions') AS versions(value) LOOP
      v_version_id := (v_copy->>'id')::uuid;
      SELECT c.value INTO v_copies FROM jsonb_array_elements(v_snapshot_row.snapshot->'copies') AS c(value)
        WHERE c.value->>'versionId'=v_version_id::text LIMIT 1;
      v_path := v_copies->>'backupPath';
      IF v_path IS NULL OR v_path NOT LIKE 'recovery/'||v_snapshot_id::text||'/%' THEN
        RAISE EXCEPTION 'A verified backup file mapping is missing.' USING ERRCODE='22023';
      END IF;
      SELECT id INTO v_new_version_id FROM public.minglora_brand_logo_versions WHERE storage_path=v_path;
      IF v_new_version_id IS NULL THEN
        SELECT coalesce(max(version_number),0)+1 INTO v_version_number
          FROM public.minglora_brand_logo_versions WHERE asset_id=(v_copy->>'asset_id')::uuid;
        INSERT INTO public.minglora_brand_logo_versions(
          id,asset_id,version_number,original_name,mime_type,file_format,byte_size,width,height,duration_ms,
          storage_path,change_note,uploaded_by
        ) VALUES (
          gen_random_uuid(),(v_copy->>'asset_id')::uuid,v_version_number,v_copy->>'original_name',
          v_copy->>'mime_type',v_copy->>'file_format',(v_copy->>'byte_size')::bigint,
          nullif(v_copy->>'width','')::integer,nullif(v_copy->>'height','')::integer,
          nullif(v_copy->>'duration_ms','')::bigint,v_path,
          'Restored from verified backup '||v_snapshot_id::text,v_actor
        ) RETURNING id INTO v_new_version_id;
      END IF;
      v_mapping := v_mapping || jsonb_build_object(v_version_id::text,v_new_version_id::text);
    END LOOP;

    FOR v_copy IN SELECT value FROM jsonb_array_elements(v_snapshot_row.snapshot->'assets') AS assets(value) LOOP
      v_asset_id := (v_copy->>'id')::uuid;
      v_version_id := nullif(v_copy->>'current_version_id','')::uuid;
      v_new_version_id := nullif(v_mapping->>v_version_id::text,'')::uuid;
      IF v_new_version_id IS NULL THEN
        RAISE EXCEPTION 'The backup asset references a missing current version.' USING ERRCODE='22023';
      END IF;
      SELECT * INTO v_version FROM public.minglora_brand_logo_versions WHERE id=v_new_version_id;
      UPDATE public.minglora_brand_logo_assets SET
        title=left(v_copy->>'title',120),description=coalesce(v_copy->>'description',''),
        category_id=nullif(v_copy->>'category_id','')::uuid,collection_id=nullif(v_copy->>'collection_id','')::uuid,
        asset_type=coalesce(v_copy->>'asset_type','logo'),
        original_name=v_version.original_name,mime_type=v_version.mime_type,file_format=v_version.file_format,
        byte_size=v_version.byte_size,width=v_version.width,height=v_version.height,duration_ms=v_version.duration_ms,
        storage_path=v_version.storage_path,current_version_id=v_new_version_id,
        approved_version_id=CASE WHEN nullif(v_copy->>'approved_version_id','') IS NULL THEN NULL
          ELSE nullif(v_mapping->> (v_copy->>'approved_version_id'),'')::uuid END,
        status=CASE WHEN v_copy->>'status'='deleted' THEN 'deleted'
          WHEN v_copy->>'status'='archived' THEN 'archived'
          WHEN nullif(v_mapping->>(v_copy->>'approved_version_id'),'')::uuid=v_new_version_id THEN 'approved'
          ELSE 'draft' END,
        updated_by=v_actor,updated_at=now()
      WHERE id=v_asset_id;
    END LOOP;

    FOR v_copy IN SELECT value FROM jsonb_array_elements(v_snapshot_row.snapshot->'assignments') AS assignments(value) LOOP
      v_placement := v_copy->>'placement_key';
      SELECT * INTO v_existing FROM public.minglora_brand_logo_assignments
        WHERE placement_key=v_placement FOR UPDATE;
      v_old_asset := CASE WHEN FOUND THEN v_existing.asset_id ELSE NULL END;
      v_old_version := CASE WHEN FOUND THEN v_existing.version_id ELSE NULL END;
      v_new_asset := nullif(v_copy->>'asset_id','')::uuid;
      v_version_id := nullif(v_copy->>'version_id','')::uuid;
      v_new_version := nullif(v_mapping->>v_version_id::text,'')::uuid;
      IF v_copy->>'status'='active' AND (v_new_asset IS NULL OR v_new_version IS NULL) THEN
        RAISE EXCEPTION 'The backup contains an invalid active placement.' USING ERRCODE='22023';
      END IF;
      IF v_copy->>'status'='active' THEN
        INSERT INTO public.minglora_brand_logo_assignments(placement_key,asset_id,version_id,status,updated_by)
          VALUES(v_placement,v_new_asset,v_new_version,'active',v_actor)
        ON CONFLICT(placement_key) DO UPDATE SET asset_id=EXCLUDED.asset_id,version_id=EXCLUDED.version_id,
          status='active',updated_by=v_actor,updated_at=now();
        v_history_action := 'published';
        v_restored := v_restored+1;
      ELSE
        INSERT INTO public.minglora_brand_logo_assignments(placement_key,asset_id,version_id,status,updated_by)
          VALUES(v_placement,NULL,NULL,'disabled',v_actor)
        ON CONFLICT(placement_key) DO UPDATE SET asset_id=NULL,version_id=NULL,status='disabled',
          updated_by=v_actor,updated_at=now();
        v_history_action := 'disabled';
        v_disabled := v_disabled+1;
      END IF;
      SELECT id INTO v_asset_id FROM public.minglora_brand_logo_assignments WHERE placement_key=v_placement;
      INSERT INTO public.minglora_brand_deployment_history(
        assignment_id,placement_key,action,previous_asset_id,previous_version_id,
        deployed_asset_id,deployed_version_id,actor_user_id,details
      ) VALUES (
        v_asset_id,v_placement,v_history_action,v_old_asset,v_old_version,
        CASE WHEN v_history_action='published' THEN v_new_asset ELSE NULL END,
        CASE WHEN v_history_action='published' THEN v_new_version ELSE NULL END,
        v_actor,jsonb_build_object('backupSnapshotId',v_snapshot_id,'source','backup_restore')
      );
    END LOOP;

    -- Placements created after the snapshot are disabled rather than left live.
    FOR v_existing IN
      SELECT * FROM public.minglora_brand_logo_assignments a
      WHERE a.status='active' AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_snapshot_row.snapshot->'assignments') x(value)
        WHERE x.value->>'placement_key'=a.placement_key
      )
      FOR UPDATE
    LOOP
      UPDATE public.minglora_brand_logo_assignments SET asset_id=NULL,version_id=NULL,
        status='disabled',updated_by=v_actor,updated_at=now() WHERE id=v_existing.id;
      INSERT INTO public.minglora_brand_deployment_history(
        assignment_id,placement_key,action,previous_asset_id,previous_version_id,
        deployed_asset_id,deployed_version_id,actor_user_id,details
      ) VALUES (
        v_existing.id,v_existing.placement_key,'disabled',v_existing.asset_id,v_existing.version_id,
        NULL,NULL,v_actor,jsonb_build_object('backupSnapshotId',v_snapshot_id,'source','backup_restore')
      );
      v_disabled := v_disabled+1;
    END LOOP;

    UPDATE public.minglora_brand_logo_assets a SET status='active',updated_by=v_actor,updated_at=now()
      WHERE EXISTS (SELECT 1 FROM public.minglora_brand_logo_assignments p WHERE p.asset_id=a.id AND p.status='active')
        AND a.status<>'deleted';
    UPDATE public.minglora_brand_identity_settings i SET
      settings=coalesce(v_snapshot_row.snapshot->'identitySettings'->'settings','{}'::jsonb),
      version=i.version+1,updated_by=v_actor,updated_at=now()
      WHERE i.singleton=true;
    UPDATE public.minglora_brand_backup_snapshots SET last_restored_at=now(),last_restored_by=v_actor
      WHERE id=v_snapshot_id;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
      VALUES(v_actor,'backup.restored','backup_snapshot',v_snapshot_id,jsonb_build_object('placementsRestored',v_restored,'placementsDisabled',v_disabled));
    RETURN jsonb_build_object('ok',true,'snapshotId',v_snapshot_id,'placementsRestored',v_restored,'placementsDisabled',v_disabled);
  ELSE
    RAISE EXCEPTION 'Unsupported Minglora brand extension action.' USING ERRCODE='22023';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_admin_brand_extension_command(uuid,boolean,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_admin_brand_extension_command(uuid,boolean,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.minglora_brand_schedule_dispatch()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_schedule record;
  v_assignment record;
  v_history record;
  v_activated integer := 0;
  v_expired integer := 0;
  v_failed integer := 0;
  v_previous_asset uuid;
  v_previous_version uuid;
  v_assignment_id uuid;
BEGIN
  -- The function has no grants to browser roles. Supabase Cron runs with
  -- the migration owner; the trusted runtime can also invoke it as service_role.
  IF coalesce(auth.role(),'') NOT IN ('','service_role') THEN
    RAISE EXCEPTION 'Brand schedule dispatch is an internal database operation.' USING ERRCODE='42501';
  END IF;

  FOR v_schedule IN
    SELECT * FROM public.minglora_brand_logo_schedules
    WHERE status='scheduled' AND activates_at<=now()
    ORDER BY activates_at,id LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.minglora_brand_logo_assets a
      JOIN public.minglora_brand_logo_versions v ON v.id=v_schedule.version_id AND v.asset_id=a.id
      WHERE a.id=v_schedule.asset_id AND a.status IN ('approved','active')
        AND a.approved_version_id=v_schedule.version_id
    ) THEN
      UPDATE public.minglora_brand_logo_schedules SET status='failed' WHERE id=v_schedule.id;
      INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
        VALUES(v_schedule.created_by,'schedule.failed','schedule',v_schedule.id,jsonb_build_object('reason','The approved version is no longer available.'));
      v_failed := v_failed+1;
      CONTINUE;
    END IF;

    v_previous_asset := NULL;
    v_previous_version := NULL;
    SELECT a.id,a.asset_id,a.version_id INTO v_assignment_id,v_previous_asset,v_previous_version
      FROM public.minglora_brand_logo_assignments a
      WHERE a.placement_key=v_schedule.placement_key FOR UPDATE;

    IF FOUND AND (SELECT status FROM public.minglora_brand_logo_assignments WHERE id=v_assignment_id) <> 'active' THEN
      v_previous_asset := NULL;
      v_previous_version := NULL;
    END IF;

    INSERT INTO public.minglora_brand_logo_assignments(placement_key,asset_id,version_id,status,updated_by)
      VALUES(v_schedule.placement_key,v_schedule.asset_id,v_schedule.version_id,'active',v_schedule.created_by)
    ON CONFLICT(placement_key) DO UPDATE SET asset_id=EXCLUDED.asset_id,version_id=EXCLUDED.version_id,
      status='active',updated_by=EXCLUDED.updated_by,updated_at=now()
    RETURNING id INTO v_assignment_id;

    UPDATE public.minglora_brand_logo_assets SET status='active',updated_by=v_schedule.created_by,updated_at=now()
      WHERE id=v_schedule.asset_id;
    INSERT INTO public.minglora_brand_deployment_history(
      assignment_id,placement_key,action,previous_asset_id,previous_version_id,
      deployed_asset_id,deployed_version_id,actor_user_id,details
    ) VALUES (
      v_assignment_id,v_schedule.placement_key,'published',v_previous_asset,v_previous_version,
      v_schedule.asset_id,v_schedule.version_id,v_schedule.created_by,
      jsonb_build_object('scheduleId',v_schedule.id,'timezone',v_schedule.timezone,'expiresAt',v_schedule.expires_at,'source','scheduler')
    );
    UPDATE public.minglora_brand_logo_schedules SET status='activated' WHERE id=v_schedule.id;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
      VALUES(v_schedule.created_by,'schedule.activated','schedule',v_schedule.id,jsonb_build_object('placementKey',v_schedule.placement_key));
    v_activated := v_activated+1;
  END LOOP;

  FOR v_schedule IN
    SELECT * FROM public.minglora_brand_logo_schedules
    WHERE status='activated' AND expires_at IS NOT NULL AND expires_at<=now()
    ORDER BY expires_at,id LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_assignment FROM public.minglora_brand_logo_assignments
      WHERE placement_key=v_schedule.placement_key FOR UPDATE;
    IF FOUND AND v_assignment.status='active'
      AND v_assignment.asset_id=v_schedule.asset_id AND v_assignment.version_id=v_schedule.version_id THEN
      SELECT * INTO v_history FROM public.minglora_brand_deployment_history
        WHERE placement_key=v_schedule.placement_key AND action='published'
          AND details->>'scheduleId'=v_schedule.id::text
        ORDER BY created_at DESC LIMIT 1;
      IF FOUND THEN
        IF v_history.previous_asset_id IS NULL THEN
          UPDATE public.minglora_brand_logo_assignments SET asset_id=NULL,version_id=NULL,
            status='disabled',updated_by=v_schedule.created_by,updated_at=now()
            WHERE id=v_assignment.id;
          INSERT INTO public.minglora_brand_deployment_history(
            assignment_id,placement_key,action,previous_asset_id,previous_version_id,
            deployed_asset_id,deployed_version_id,actor_user_id,details
          ) VALUES (
            v_assignment.id,v_schedule.placement_key,'disabled',v_schedule.asset_id,v_schedule.version_id,
            NULL,NULL,v_schedule.created_by,jsonb_build_object('scheduleId',v_schedule.id,'source','scheduled_expiry')
          );
        ELSE
          UPDATE public.minglora_brand_logo_assignments SET asset_id=v_history.previous_asset_id,
            version_id=v_history.previous_version_id,status='active',updated_by=v_schedule.created_by,updated_at=now()
            WHERE id=v_assignment.id;
          UPDATE public.minglora_brand_logo_assets SET status='active',updated_by=v_schedule.created_by,updated_at=now()
            WHERE id=v_history.previous_asset_id;
          INSERT INTO public.minglora_brand_deployment_history(
            assignment_id,placement_key,action,previous_asset_id,previous_version_id,
            deployed_asset_id,deployed_version_id,actor_user_id,details
          ) VALUES (
            v_assignment.id,v_schedule.placement_key,'rolled_back',v_schedule.asset_id,v_schedule.version_id,
            v_history.previous_asset_id,v_history.previous_version_id,v_schedule.created_by,
            jsonb_build_object('scheduleId',v_schedule.id,'source','scheduled_expiry')
          );
        END IF;
        UPDATE public.minglora_brand_logo_assets a SET
          status=CASE WHEN a.approved_version_id=a.current_version_id AND a.approved_version_id IS NOT NULL
            THEN 'approved' ELSE 'draft' END,
          updated_by=v_schedule.created_by,updated_at=now()
        WHERE a.id=v_schedule.asset_id
          AND NOT EXISTS (SELECT 1 FROM public.minglora_brand_logo_assignments p WHERE p.asset_id=a.id AND p.status='active');
      END IF;
    END IF;
    -- A later manual publish takes precedence; expiry never overwrites it.
    UPDATE public.minglora_brand_logo_schedules SET status='expired' WHERE id=v_schedule.id;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
      VALUES(v_schedule.created_by,'schedule.expired','schedule',v_schedule.id,jsonb_build_object('placementKey',v_schedule.placement_key));
    v_expired := v_expired+1;
  END LOOP;

  RETURN jsonb_build_object('activated',v_activated,'expired',v_expired,'failed',v_failed,'processedAt',now());
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_brand_schedule_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_brand_schedule_dispatch() TO service_role;

-- pg_cron is already installed and is the project's existing scheduler.
SELECT cron.schedule(
  'minglora_brand_schedule_dispatch',
  '* * * * *',
  'SELECT public.minglora_brand_schedule_dispatch();'
);

COMMIT;
