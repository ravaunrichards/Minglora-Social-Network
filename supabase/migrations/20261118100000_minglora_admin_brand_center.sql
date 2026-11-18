BEGIN;

-- Minglora Brand Center: additive, recoverable, owner-managed asset registry.
-- Source files remain private in Supabase Storage. Only the trusted Edge gateway
-- receives service-role access; browser roles receive no table or object grants.

CREATE TABLE IF NOT EXISTS public.brand_logo_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key text NOT NULL UNIQUE CHECK (category_key ~ '^[a-z0-9_]{2,80}$'),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 100),
  asset_scope text NOT NULL DEFAULT 'logo' CHECK (asset_scope IN ('logo','asset','both')),
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_logo_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_key text NOT NULL UNIQUE CHECK (collection_key ~ '^[a-z0-9_]{2,80}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '',
  collection_type text NOT NULL DEFAULT 'general' CHECK (collection_type IN ('logo','asset','archive','general')),
  is_system boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  category_id uuid REFERENCES public.brand_logo_categories(id) ON DELETE RESTRICT,
  collection_id uuid REFERENCES public.brand_logo_collections(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','active','archived')),
  active_version_id uuid,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_logo_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_id uuid NOT NULL REFERENCES public.brand_logos(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  storage_path text NOT NULL UNIQUE,
  original_file_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  width integer,
  height integer,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  version_kind text NOT NULL DEFAULT 'original' CHECK (version_kind IN ('original','modified','derived','restored')),
  change_note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (logo_id, version_number)
);

ALTER TABLE public.brand_logos
  DROP CONSTRAINT IF EXISTS brand_logos_active_version_fk;
ALTER TABLE public.brand_logos
  ADD CONSTRAINT brand_logos_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES public.brand_logo_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.brand_asset_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  asset_type text NOT NULL CHECK (asset_type IN (
    'profile_branding','cover_image','application_icon','favicon','website_banner','promotional_banner',
    'background','wallpaper','loading_animation','watermark','social_graphic','advertisement_template',
    'notification_graphic','email_graphic','live_graphic','meetwave_graphic','sticker','illustration',
    'brand_icon','seasonal_graphic','event_graphic','video_overlay','graphic_template','other'
  )),
  category_id uuid REFERENCES public.brand_logo_categories(id) ON DELETE RESTRICT,
  collection_id uuid REFERENCES public.brand_logo_collections(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','active','archived')),
  active_version_id uuid,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_asset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.brand_asset_library(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  storage_path text NOT NULL UNIQUE,
  original_file_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  width integer,
  height integer,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  version_kind text NOT NULL DEFAULT 'original' CHECK (version_kind IN ('original','modified','derived','restored')),
  change_note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, version_number)
);

ALTER TABLE public.brand_asset_library
  DROP CONSTRAINT IF EXISTS brand_asset_library_active_version_fk;
ALTER TABLE public.brand_asset_library
  ADD CONSTRAINT brand_asset_library_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES public.brand_asset_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.brand_logo_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_key text NOT NULL UNIQUE CHECK (location_key ~ '^[a-z0-9_]{2,80}$'),
  logo_id uuid REFERENCES public.brand_logos(id) ON DELETE RESTRICT,
  logo_version_id uuid REFERENCES public.brand_logo_versions(id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES public.brand_asset_library(id) ON DELETE RESTRICT,
  asset_version_id uuid REFERENCES public.brand_asset_versions(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_logo_assignments_one_source CHECK (
    (logo_id IS NOT NULL AND asset_id IS NULL AND (logo_version_id IS NOT NULL OR NOT is_active))
    OR (asset_id IS NOT NULL AND logo_id IS NULL AND (asset_version_id IS NOT NULL OR NOT is_active))
    OR (logo_id IS NULL AND asset_id IS NULL AND NOT is_active)
  ),
  CONSTRAINT brand_logo_assignments_version_owner CHECK (
    (logo_id IS NOT NULL AND asset_id IS NULL AND asset_version_id IS NULL)
    OR (asset_id IS NOT NULL AND logo_id IS NULL AND logo_version_id IS NULL)
    OR (logo_id IS NULL AND asset_id IS NULL AND logo_version_id IS NULL AND asset_version_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.brand_logo_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  logo_id uuid REFERENCES public.brand_logos(id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES public.brand_asset_library(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_logo_favorites_one_source CHECK ((logo_id IS NOT NULL) <> (asset_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS brand_logo_favorites_logo_unique
  ON public.brand_logo_favorites(user_id,logo_id) WHERE logo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS brand_logo_favorites_asset_unique
  ON public.brand_logo_favorites(user_id,asset_id) WHERE asset_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.brand_approval_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type text NOT NULL CHECK (object_type IN ('logo','asset','identity','global_brand')),
  object_id uuid,
  request_type text NOT NULL CHECK (request_type IN ('publish','replace','schedule','identity_change','global_replace')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.brand_logo_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_record_id uuid NOT NULL REFERENCES public.brand_approval_records(id) ON DELETE RESTRICT,
  object_type text NOT NULL CHECK (object_type IN ('logo','asset')),
  logo_id uuid REFERENCES public.brand_logos(id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES public.brand_asset_library(id) ON DELETE RESTRICT,
  logo_version_id uuid REFERENCES public.brand_logo_versions(id) ON DELETE RESTRICT,
  asset_version_id uuid REFERENCES public.brand_asset_versions(id) ON DELETE RESTRICT,
  location_key text NOT NULL CHECK (location_key ~ '^[a-z0-9_]{2,80}$'),
  scheduled_for timestamptz NOT NULL,
  expires_at timestamptz,
  timezone text NOT NULL DEFAULT 'UTC',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired','cancelled','failed')),
  previous_logo_id uuid REFERENCES public.brand_logos(id) ON DELETE RESTRICT,
  previous_asset_id uuid REFERENCES public.brand_asset_library(id) ON DELETE RESTRICT,
  previous_logo_version_id uuid REFERENCES public.brand_logo_versions(id) ON DELETE RESTRICT,
  previous_asset_version_id uuid REFERENCES public.brand_asset_versions(id) ON DELETE RESTRICT,
  previous_is_active boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  activated_at timestamptz,
  completed_at timestamptz,
  failure_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_logo_schedules_one_source CHECK (
    (object_type='logo' AND logo_id IS NOT NULL AND asset_id IS NULL AND logo_version_id IS NOT NULL AND asset_version_id IS NULL)
    OR (object_type='asset' AND asset_id IS NOT NULL AND logo_id IS NULL AND asset_version_id IS NOT NULL AND logo_version_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.brand_logo_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_identity_settings (
  setting_key text PRIMARY KEY CHECK (setting_key ~ '^[a-z0-9_.-]{2,100}$'),
  setting_value jsonb NOT NULL,
  description text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_deployment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_group_id uuid NOT NULL,
  location_key text NOT NULL,
  object_type text NOT NULL CHECK (object_type IN ('logo','asset','none')),
  logo_id uuid REFERENCES public.brand_logos(id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES public.brand_asset_library(id) ON DELETE RESTRICT,
  logo_version_id uuid REFERENCES public.brand_logo_versions(id) ON DELETE RESTRICT,
  asset_version_id uuid REFERENCES public.brand_asset_versions(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (operation IN ('publish','rollback','scheduled_activate','scheduled_restore')),
  status text NOT NULL CHECK (status IN ('published','rolled_back','failed')),
  previous_logo_id uuid REFERENCES public.brand_logos(id) ON DELETE RESTRICT,
  previous_asset_id uuid REFERENCES public.brand_asset_library(id) ON DELETE RESTRICT,
  previous_logo_version_id uuid REFERENCES public.brand_logo_versions(id) ON DELETE RESTRICT,
  previous_asset_version_id uuid REFERENCES public.brand_asset_versions(id) ON DELETE RESTRICT,
  previous_is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_logos_status_updated_idx ON public.brand_logos(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS brand_logos_collection_idx ON public.brand_logos(collection_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS brand_logo_versions_logo_idx ON public.brand_logo_versions(logo_id,version_number DESC);
CREATE INDEX IF NOT EXISTS brand_asset_versions_asset_idx ON public.brand_asset_versions(asset_id,version_number DESC);
CREATE INDEX IF NOT EXISTS brand_schedules_due_idx ON public.brand_logo_schedules(status,scheduled_for) WHERE status='pending';
CREATE INDEX IF NOT EXISTS brand_schedules_expiry_idx ON public.brand_logo_schedules(status,expires_at) WHERE status='active';
CREATE INDEX IF NOT EXISTS brand_approval_pending_idx ON public.brand_approval_records(status,created_at DESC);
CREATE INDEX IF NOT EXISTS brand_activity_created_idx ON public.brand_logo_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS brand_deployment_location_idx ON public.brand_deployment_history(location_key,created_at DESC);

INSERT INTO public.brand_logo_categories(category_key,display_name,asset_scope,is_system,sort_order) VALUES
 ('primary_logos','Primary Logos','logo',true,10),
 ('secondary_logos','Secondary Logos','logo',true,20),
 ('alternative_logos','Alternative Logos','logo',true,30),
 ('symbol_logos','Symbol Logos','logo',true,40),
 ('wordmarks','Wordmarks','logo',true,50),
 ('lettermarks','Lettermarks','logo',true,60),
 ('emblem_logos','Emblem Logos','logo',true,70),
 ('minimalist_logos','Minimalist Logos','logo',true,80),
 ('abstract_logos','Abstract Logos','logo',true,90),
 ('geometric_logos','Geometric Logos','logo',true,100),
 ('3d_logos','3D Logos','logo',true,110),
 ('metallic_logos','Metallic Logos','logo',true,120),
 ('gold_logos','Gold Logos','logo',true,130),
 ('silver_logos','Silver Logos','logo',true,140),
 ('chrome_logos','Chrome Logos','logo',true,150),
 ('gradient_logos','Gradient Logos','logo',true,160),
 ('animated_logos','Animated Logos','logo',true,170),
 ('monochrome_logos','Monochrome Logos','logo',true,180),
 ('black_logos','Black Logos','logo',true,190),
 ('white_logos','White Logos','logo',true,200),
 ('transparent_logos','Transparent Logos','logo',true,210),
 ('flat_logos','Flat Logos','logo',true,220),
 ('outline_logos','Outline Logos','logo',true,230),
 ('vintage_logos','Vintage Logos','logo',true,240),
 ('premium_logos','Premium Logos','logo',true,250),
 ('special_edition_logos','Special Edition Logos','logo',true,260),
 ('seasonal_logos','Seasonal Logos','logo',true,270),
 ('anniversary_logos','Anniversary Logos','logo',true,280),
 ('promotional_logos','Promotional Logos','logo',true,290),
 ('experimental_logos','Experimental Logos','logo',true,300),
 ('favicon_logos','Favicon Logos','logo',true,310),
 ('application_icons','Application Icons','both',true,320),
 ('social_media_logos','Social Media Logos','logo',true,330),
 ('watermark_logos','Watermark Logos','both',true,340),
 ('profile_branding','Profile Branding','asset',true,400),
 ('cover_images','Cover Images','asset',true,410),
 ('website_banners','Website Banners','asset',true,420),
 ('promotional_banners','Promotional Banners','asset',true,430),
 ('background_images','Background Images','asset',true,440),
 ('wallpapers','Wallpapers','asset',true,450),
 ('loading_animations','Loading Animations','asset',true,460),
 ('social_graphics','Social Media Graphics','asset',true,470),
 ('ad_templates','Advertisement Templates','asset',true,480),
 ('notification_graphics','Notification Graphics','asset',true,490),
 ('email_graphics','Email Graphics','asset',true,500),
 ('live_graphics','LIVE Streaming Graphics','asset',true,510),
 ('meetwave_graphics','MeetWave Graphics','asset',true,520),
 ('stickers','Stickers','asset',true,530),
 ('illustrations','Illustrations','asset',true,540),
 ('brand_icons','Brand Icons','asset',true,550),
 ('seasonal_graphics','Seasonal Graphics','asset',true,560),
 ('event_graphics','Special Event Graphics','asset',true,570),
 ('video_overlays','Video Overlays','asset',true,580),
 ('graphic_templates','Graphic Templates','asset',true,590),
 ('historical_branding','Historical Branding Archive','both',true,600)
ON CONFLICT (category_key) DO NOTHING;

INSERT INTO public.brand_logo_collections(collection_key,name,description,collection_type,is_system)
VALUES
 ('enigma_brand_identity','Enigma Brand Identity','Current Enigma identity collection. Import approved logo artwork here; the existing application Enigma asset remains untouched until a managed replacement is approved.','logo',true),
 ('historical_minglora_m_archive','Historical Minglora M Archive','Recoverable archive for original Minglora M branding. Historical artwork must never be overwritten by current Enigma files.','archive',true)
ON CONFLICT (collection_key) DO NOTHING;

INSERT INTO public.minglora_admin_permission_catalog(permission_key,display_name,description,risk_level) VALUES
 ('brand:read','Brand Center read','View brand assets, placements, identity settings and audit history.','medium'),
 ('brand:upload','Brand asset upload','Upload files into the private brand asset library.','medium'),
 ('brand:edit','Brand asset editing','Edit metadata and create recoverable versions of brand assets.','high'),
 ('brand:approve','Brand publication approval','Approve official brand identity and publication requests.','critical'),
 ('brand:publish','Brand publication','Publish approved brand assets to application locations.','critical'),
 ('brand:manage','Brand system management','Manage brand categories, collections, security and identity policy.','critical')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.minglora_admin_role_permissions(role_key,permission_key) VALUES
 ('read_only_auditor','brand:read'),
 ('content_administrator','brand:read'),('content_administrator','brand:upload'),('content_administrator','brand:edit'),
 ('technical_administrator','brand:read'),('technical_administrator','brand:upload'),('technical_administrator','brand:edit'),('technical_administrator','brand:publish'),
 ('security_administrator','brand:read'),('security_administrator','brand:approve'),
 ('super_administrator','brand:read'),('super_administrator','brand:upload'),('super_administrator','brand:edit'),
 ('super_administrator','brand:approve'),('super_administrator','brand:publish'),('super_administrator','brand:manage')
ON CONFLICT DO NOTHING;

ALTER TABLE public.brand_logo_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_logo_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_logo_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_asset_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_asset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_logo_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_logo_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_approval_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_logo_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_logo_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_identity_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_deployment_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.brand_logo_categories,public.brand_logo_collections,public.brand_logos,
  public.brand_logo_versions,public.brand_asset_library,public.brand_asset_versions,
  public.brand_logo_assignments,public.brand_logo_favorites,public.brand_approval_records,
  public.brand_logo_schedules,public.brand_logo_activity_logs,public.brand_identity_settings,
  public.brand_deployment_history FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.brand_logo_categories,public.brand_logo_collections,public.brand_logos,
  public.brand_logo_versions,public.brand_asset_library,public.brand_asset_versions,
  public.brand_logo_assignments,public.brand_logo_favorites,public.brand_approval_records,
  public.brand_logo_schedules,public.brand_logo_activity_logs,public.brand_identity_settings,
  public.brand_deployment_history TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_minglora_brand_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'Minglora brand history is append-only.' USING ERRCODE='42501';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_minglora_brand_history_mutation() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS brand_logo_versions_immutable ON public.brand_logo_versions;
CREATE TRIGGER brand_logo_versions_immutable BEFORE UPDATE OR DELETE ON public.brand_logo_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_minglora_brand_history_mutation();
DROP TRIGGER IF EXISTS brand_asset_versions_immutable ON public.brand_asset_versions;
CREATE TRIGGER brand_asset_versions_immutable BEFORE UPDATE OR DELETE ON public.brand_asset_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_minglora_brand_history_mutation();
DROP TRIGGER IF EXISTS brand_activity_append_only ON public.brand_logo_activity_logs;
CREATE TRIGGER brand_activity_append_only BEFORE UPDATE OR DELETE ON public.brand_logo_activity_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_minglora_brand_history_mutation();
DROP TRIGGER IF EXISTS brand_deployment_append_only ON public.brand_deployment_history;
CREATE TRIGGER brand_deployment_append_only BEFORE UPDATE OR DELETE ON public.brand_deployment_history
  FOR EACH ROW EXECUTE FUNCTION public.prevent_minglora_brand_history_mutation();

CREATE OR REPLACE FUNCTION public.minglora_dispatch_brand_schedules()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_item record;
  v_count integer := 0;
BEGIN
  FOR v_item IN
    SELECT s.*
    FROM public.brand_logo_schedules s
    JOIN public.brand_approval_records a ON a.id=s.approval_record_id AND a.status='approved'
    WHERE s.status='pending' AND s.scheduled_for <= now()
    ORDER BY s.scheduled_for,s.created_at
    LIMIT 100
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    INSERT INTO public.brand_logo_assignments(
      location_key,logo_id,logo_version_id,asset_id,asset_version_id,is_active,updated_by,updated_at
    ) VALUES (
      v_item.location_key,v_item.logo_id,v_item.logo_version_id,v_item.asset_id,v_item.asset_version_id,true,v_item.created_by,now()
    )
    ON CONFLICT (location_key) DO UPDATE SET
      logo_id=EXCLUDED.logo_id,logo_version_id=EXCLUDED.logo_version_id,
      asset_id=EXCLUDED.asset_id,asset_version_id=EXCLUDED.asset_version_id,
      is_active=true,updated_by=EXCLUDED.updated_by,updated_at=now();

    INSERT INTO public.brand_deployment_history(
      deployment_group_id,location_key,object_type,logo_id,asset_id,logo_version_id,asset_version_id,
      operation,status,previous_logo_id,previous_asset_id,previous_logo_version_id,previous_asset_version_id,
      previous_is_active,created_by,details
    ) VALUES (
      v_item.id,v_item.location_key,v_item.object_type,v_item.logo_id,v_item.asset_id,v_item.logo_version_id,v_item.asset_version_id,
      'scheduled_activate','published',v_item.previous_logo_id,v_item.previous_asset_id,
      v_item.previous_logo_version_id,v_item.previous_asset_version_id,v_item.previous_is_active,v_item.created_by,
      jsonb_build_object('scheduleId',v_item.id,'timezone',v_item.timezone)
    );

    UPDATE public.brand_logo_schedules
      SET status='active',activated_at=now()
      WHERE id=v_item.id;
    INSERT INTO public.brand_logo_activity_logs(actor_user_id,action,entity_type,entity_id,metadata)
      VALUES(v_item.created_by,'schedule.activated','schedule',v_item.id,jsonb_build_object('location',v_item.location_key));
    v_count := v_count + 1;
  END LOOP;

  FOR v_item IN
    SELECT s.*
    FROM public.brand_logo_schedules s
    WHERE s.status='active' AND s.expires_at IS NOT NULL AND s.expires_at <= now()
    ORDER BY s.expires_at,s.created_at
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.brand_logo_assignments(
      location_key,logo_id,logo_version_id,asset_id,asset_version_id,is_active,updated_by,updated_at
    ) VALUES (
      v_item.location_key,v_item.previous_logo_id,v_item.previous_logo_version_id,
      v_item.previous_asset_id,v_item.previous_asset_version_id,v_item.previous_is_active,v_item.created_by,now()
    )
    ON CONFLICT (location_key) DO UPDATE SET
      logo_id=EXCLUDED.logo_id,logo_version_id=EXCLUDED.logo_version_id,
      asset_id=EXCLUDED.asset_id,asset_version_id=EXCLUDED.asset_version_id,
      is_active=EXCLUDED.is_active,updated_by=EXCLUDED.updated_by,updated_at=now();

    INSERT INTO public.brand_deployment_history(
      deployment_group_id,location_key,object_type,logo_id,asset_id,logo_version_id,asset_version_id,
      operation,status,previous_logo_id,previous_asset_id,previous_logo_version_id,previous_asset_version_id,
      previous_is_active,created_by,details
    ) VALUES (
      gen_random_uuid(),v_item.location_key,
      CASE WHEN v_item.previous_logo_id IS NOT NULL THEN 'logo'
           WHEN v_item.previous_asset_id IS NOT NULL THEN 'asset' ELSE 'none' END,
      v_item.previous_logo_id,v_item.previous_asset_id,v_item.previous_logo_version_id,v_item.previous_asset_version_id,
      'scheduled_restore','published',v_item.logo_id,v_item.asset_id,v_item.logo_version_id,v_item.asset_version_id,
      true,v_item.created_by,jsonb_build_object('scheduleId',v_item.id,'expiredAt',now())
    );

    UPDATE public.brand_logo_schedules SET status='expired',completed_at=now() WHERE id=v_item.id;
    INSERT INTO public.brand_logo_activity_logs(actor_user_id,action,entity_type,entity_id,metadata)
      VALUES(v_item.created_by,'schedule.expired','schedule',v_item.id,jsonb_build_object('location',v_item.location_key));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.minglora_dispatch_brand_schedules() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_dispatch_brand_schedules() TO service_role;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname='minglora-brand-schedules';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
  PERFORM cron.schedule('minglora-brand-schedules','* * * * *',
    'SELECT public.minglora_dispatch_brand_schedules();');
END;
$$;

COMMIT;