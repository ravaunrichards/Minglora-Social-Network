BEGIN;

-- Dedicated, private brand asset storage. Existing member-media buckets and records are untouched.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'minglora-brand-assets',
  'minglora-brand-assets',
  false,
  52428800,
  ARRAY['image/svg+xml','image/png','image/apng','image/jpeg','image/webp','image/gif',
        'image/vnd.microsoft.icon','image/x-icon','application/json',
        'video/mp4','video/webm']::text[]
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'minglora-brand-assets' AND public = false
  ) THEN
    RAISE EXCEPTION 'minglora-brand-assets must exist as a private Supabase Storage bucket';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.minglora_brand_logo_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_brand_logo_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 100),
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_brand_logo_assets (
  id uuid PRIMARY KEY,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  category_id uuid REFERENCES public.minglora_brand_logo_categories(id) ON DELETE RESTRICT,
  collection_id uuid REFERENCES public.minglora_brand_logo_collections(id) ON DELETE SET NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  file_format text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 52428800),
  width integer CHECK (width IS NULL OR width BETWEEN 1 AND 50000),
  height integer CHECK (height IS NULL OR height BETWEEN 1 AND 50000),
  duration_ms bigint CHECK (duration_ms IS NULL OR duration_ms >= 0),
  storage_bucket text NOT NULL DEFAULT 'minglora-brand-assets'
    CHECK (storage_bucket = 'minglora-brand-assets'),
  storage_path text NOT NULL UNIQUE,
  current_version_id uuid,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','active','archived','deleted')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_brand_logo_versions (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES public.minglora_brand_logo_assets(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number >= 1),
  original_name text NOT NULL,
  mime_type text NOT NULL,
  file_format text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 52428800),
  width integer CHECK (width IS NULL OR width BETWEEN 1 AND 50000),
  height integer CHECK (height IS NULL OR height BETWEEN 1 AND 50000),
  duration_ms bigint CHECK (duration_ms IS NULL OR duration_ms >= 0),
  storage_bucket text NOT NULL DEFAULT 'minglora-brand-assets'
    CHECK (storage_bucket = 'minglora-brand-assets'),
  storage_path text NOT NULL UNIQUE,
  change_note text NOT NULL DEFAULT '',
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asset_id, version_number)
);

ALTER TABLE public.minglora_brand_logo_assets
  DROP CONSTRAINT IF EXISTS minglora_brand_logo_assets_current_version_fk;
ALTER TABLE public.minglora_brand_logo_assets
  ADD CONSTRAINT minglora_brand_logo_assets_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES public.minglora_brand_logo_versions(id)
  ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.minglora_brand_logo_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.minglora_brand_logo_assets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, asset_id)
);

CREATE TABLE IF NOT EXISTS public.minglora_brand_logo_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_key text NOT NULL UNIQUE CHECK (placement_key IN (
    'website_header','website_footer','mobile_app','desktop_app','tablet_app',
    'admin_dashboard','login_page','registration_page','password_recovery_page',
    'loading_screen','splash_screen','browser_favicon','notifications',
    'email_templates','live_streaming','meetwave','video_watermarks',
    'image_watermarks','post_share_previews','application_icons','error_pages',
    'maintenance_pages','promotional_pages'
  )),
  asset_id uuid REFERENCES public.minglora_brand_logo_assets(id) ON DELETE RESTRICT,
  version_id uuid REFERENCES public.minglora_brand_logo_versions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','active','scheduled','disabled','rolled_back')),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'disabled' AND asset_id IS NULL AND version_id IS NULL)
    OR (status <> 'disabled' AND asset_id IS NOT NULL AND version_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.minglora_brand_logo_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_key text NOT NULL,
  asset_id uuid NOT NULL REFERENCES public.minglora_brand_logo_assets(id) ON DELETE RESTRICT,
  version_id uuid NOT NULL REFERENCES public.minglora_brand_logo_versions(id) ON DELETE RESTRICT,
  activates_at timestamptz NOT NULL,
  expires_at timestamptz,
  timezone text NOT NULL DEFAULT 'America/Jamaica',
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','activated','expired','cancelled','failed')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > activates_at)
);

CREATE TABLE IF NOT EXISTS public.minglora_brand_logo_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  version_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  object_path text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category_id uuid REFERENCES public.minglora_brand_logo_categories(id) ON DELETE RESTRICT,
  collection_id uuid REFERENCES public.minglora_brand_logo_collections(id) ON DELETE SET NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  file_format text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 52428800),
  change_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','expired','failed')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS minglora_brand_logo_assets_status_created_idx
  ON public.minglora_brand_logo_assets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS minglora_brand_logo_assets_category_idx
  ON public.minglora_brand_logo_assets(category_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS minglora_brand_logo_assets_collection_idx
  ON public.minglora_brand_logo_assets(collection_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS minglora_brand_logo_versions_asset_idx
  ON public.minglora_brand_logo_versions(asset_id, version_number DESC);
CREATE INDEX IF NOT EXISTS minglora_brand_logo_schedules_due_idx
  ON public.minglora_brand_logo_schedules(status, activates_at);
CREATE INDEX IF NOT EXISTS minglora_brand_logo_upload_sessions_expiry_idx
  ON public.minglora_brand_logo_upload_sessions(status, expires_at);

CREATE TABLE IF NOT EXISTS public.minglora_brand_identity_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.minglora_brand_identity_settings(singleton, settings)
VALUES (true, '{}'::jsonb)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.minglora_brand_logo_approval_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.minglora_brand_logo_assets(id) ON DELETE RESTRICT,
  version_id uuid NOT NULL REFERENCES public.minglora_brand_logo_versions(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  notes text NOT NULL DEFAULT '',
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_brand_deployment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.minglora_brand_logo_assignments(id) ON DELETE RESTRICT,
  placement_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('published','rolled_back','disabled')),
  previous_asset_id uuid REFERENCES public.minglora_brand_logo_assets(id) ON DELETE RESTRICT,
  previous_version_id uuid REFERENCES public.minglora_brand_logo_versions(id) ON DELETE RESTRICT,
  deployed_asset_id uuid REFERENCES public.minglora_brand_logo_assets(id) ON DELETE RESTRICT,
  deployed_version_id uuid REFERENCES public.minglora_brand_logo_versions(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS minglora_brand_deployment_history_placement_idx
  ON public.minglora_brand_deployment_history(placement_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.minglora_brand_logo_activity_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS minglora_brand_logo_activity_logs_created_idx
  ON public.minglora_brand_logo_activity_logs(created_at DESC);

-- The collection is a real organizational record. No logo file is invented or seeded.
INSERT INTO public.minglora_brand_logo_collections(slug,name,description,is_system)
VALUES ('enigma-branding','Enigma Branding','Official Enigma logo and visual identity variants. Add approved original artwork as it is verified.',true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.minglora_brand_logo_categories(slug,name,sort_order,is_system) VALUES
('primary-logos','Primary Logos',1,true),
('secondary-logos','Secondary Logos',2,true),
('alternative-logos','Alternative Logos',3,true),
('symbol-logos','Symbol Logos',4,true),
('wordmarks','Wordmarks',5,true),
('lettermarks','Lettermarks',6,true),
('emblem-logos','Emblem Logos',7,true),
('minimalist-logos','Minimalist Logos',8,true),
('abstract-logos','Abstract Logos',9,true),
('geometric-logos','Geometric Logos',10,true),
('3d-logos','3D Logos',11,true),
('metallic-logos','Metallic Logos',12,true),
('gold-logos','Gold Logos',13,true),
('silver-logos','Silver Logos',14,true),
('chrome-logos','Chrome Logos',15,true),
('gradient-logos','Gradient Logos',16,true),
('animated-logos','Animated Logos',17,true),
('monochrome-logos','Monochrome Logos',18,true),
('black-logos','Black Logos',19,true),
('white-logos','White Logos',20,true),
('transparent-logos','Transparent Logos',21,true),
('flat-logos','Flat Logos',22,true),
('outline-logos','Outline Logos',23,true),
('vintage-logos','Vintage Logos',24,true),
('premium-logos','Premium Logos',25,true),
('special-edition-logos','Special Edition Logos',26,true),
('seasonal-logos','Seasonal Logos',27,true),
('anniversary-logos','Anniversary Logos',28,true),
('promotional-logos','Promotional Logos',29,true),
('experimental-logos','Experimental Logos',30,true),
('favicon-logos','Favicon Logos',31,true),
('application-icons','Application Icons',32,true),
('social-media-logos','Social Media Logos',33,true),
('watermark-logos','Watermark Logos',34,true)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.minglora_brand_logo_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_brand_logo_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_brand_logo_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_brand_logo_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_brand_logo_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_brand_logo_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_brand_logo_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_brand_logo_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_brand_identity_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_brand_logo_approval_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_brand_deployment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_brand_logo_activity_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.minglora_brand_logo_categories,
  public.minglora_brand_logo_collections,
  public.minglora_brand_logo_assets,
  public.minglora_brand_logo_versions,
  public.minglora_brand_logo_favorites,
  public.minglora_brand_logo_assignments,
  public.minglora_brand_logo_schedules,
  public.minglora_brand_logo_upload_sessions,
  public.minglora_brand_identity_settings,
  public.minglora_brand_logo_approval_records,
  public.minglora_brand_deployment_history,
  public.minglora_brand_logo_activity_logs
FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.minglora_brand_logo_categories,
  public.minglora_brand_logo_collections,
  public.minglora_brand_logo_assets,
  public.minglora_brand_logo_versions,
  public.minglora_brand_logo_favorites,
  public.minglora_brand_logo_assignments,
  public.minglora_brand_logo_schedules,
  public.minglora_brand_logo_upload_sessions,
  public.minglora_brand_identity_settings,
  public.minglora_brand_logo_approval_records,
  public.minglora_brand_deployment_history,
  public.minglora_brand_logo_activity_logs
TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_minglora_brand_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'Minglora brand activity records are append-only.' USING ERRCODE='42501';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_minglora_brand_audit_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS minglora_brand_logo_activity_append_only ON public.minglora_brand_logo_activity_logs;
CREATE TRIGGER minglora_brand_logo_activity_append_only
BEFORE UPDATE OR DELETE ON public.minglora_brand_logo_activity_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_minglora_brand_audit_mutation();

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
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Brand administration must use the trusted Minglora server runtime.' USING ERRCODE='42501';
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

  IF v_action='list' THEN
    v_name := left(btrim(coalesce(v_payload->>'search','')),120);
    v_category_id := nullif(v_payload->>'categoryId','')::uuid;
    v_collection_id := nullif(v_payload->>'collectionId','')::uuid;
    RETURN jsonb_build_object(
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
            l.current_version_id,l.status,l.created_by,l.created_at,l.updated_at,
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
          SELECT id,asset_id,version_number,original_name,mime_type,file_format,byte_size,
            width,height,duration_ms,storage_bucket,storage_path,change_note,uploaded_by,created_at
          FROM public.minglora_brand_logo_versions
          ORDER BY created_at DESC LIMIT 250
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
    UPDATE public.minglora_brand_logo_assets SET status=v_status,updated_by=v_actor,updated_at=now()
    WHERE id=v_asset_id AND (status<>'deleted') AND
      ((v_status='archived' AND status<>'archived') OR (v_status='draft' AND status='archived'));
    IF NOT FOUND THEN RAISE EXCEPTION 'The logo could not be archived or restored from its current state.' USING ERRCODE='P0002'; END IF;
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id,details)
    VALUES(v_actor,'asset.'||v_status,'logo',v_asset_id);
    RETURN jsonb_build_object('ok',true,'status',v_status);
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
    FROM public.minglora_brand_logo_assets WHERE id=v_asset_id AND status IN ('draft','approved');
    IF NOT FOUND OR v_version_id IS NULL THEN RAISE EXCEPTION 'The logo has no valid current version to approve.' USING ERRCODE='P0002'; END IF;
    UPDATE public.minglora_brand_logo_assets SET status='approved',updated_by=v_actor,updated_at=now() WHERE id=v_asset_id;
    INSERT INTO public.minglora_brand_logo_approval_records(asset_id,version_id,decision,notes,actor_user_id)
    VALUES(v_asset_id,v_version_id,'approved',left(coalesce(v_payload->>'notes',''),1000),v_actor);
    INSERT INTO public.minglora_brand_logo_activity_logs(actor_user_id,action,target_type,target_id)
    VALUES(v_actor,'asset.approved','logo',v_asset_id);
    RETURN jsonb_build_object('ok',true,'status','approved','versionId',v_version_id);
  ELSIF v_action='assignment_set' THEN
    v_placement := lower(btrim(coalesce(v_payload->>'placementKey','')));
    v_asset_id := nullif(v_payload->>'assetId','')::uuid;
    v_version_id := coalesce(nullif(v_payload->>'versionId','')::uuid,
      (SELECT current_version_id FROM public.minglora_brand_logo_assets WHERE id=v_asset_id));
    IF NOT EXISTS (SELECT 1 FROM public.minglora_brand_logo_assets
      WHERE id=v_asset_id AND status IN ('approved','active') AND current_version_id=v_version_id) THEN
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
      WHERE id=v_row.asset_id AND status IN ('approved','active') AND current_version_id=v_row.version_id) THEN
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

CREATE OR REPLACE FUNCTION public.minglora_brand_public_manifest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Public brand manifest must be requested through the Minglora server runtime.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'placements',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'placementKey',a.placement_key,'assetId',a.asset_id,'versionId',a.version_id,
        'title',l.title,'mimeType',v.mime_type,'storageBucket',v.storage_bucket,'storagePath',v.storage_path
      ) ORDER BY a.placement_key)
      FROM public.minglora_brand_logo_assignments a
      JOIN public.minglora_brand_logo_assets l ON l.id=a.asset_id
      JOIN public.minglora_brand_logo_versions v ON v.id=a.version_id AND v.asset_id=l.id
      WHERE a.status='active' AND l.status IN ('approved','active')
    ),'[]'::jsonb),
    'updatedAt',now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.minglora_admin_brand_command(uuid,boolean,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_admin_brand_command(uuid,boolean,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_brand_public_manifest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_brand_public_manifest() TO service_role;

COMMIT;
