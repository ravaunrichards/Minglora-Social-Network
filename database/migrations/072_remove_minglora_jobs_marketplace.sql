BEGIN;
SET LOCAL lock_timeout = '5s';

-- Remove feature-specific records stored alongside shared social data.
DELETE FROM public.notifications
WHERE lower(coalesce(kind,'')) LIKE 'marketplace%'
   OR lower(coalesce(entity_type,'')) LIKE 'marketplace%';

DELETE FROM public.audit_log
WHERE lower(coalesce(action,'')) LIKE 'marketplace%'
   OR lower(coalesce(target_type,'')) LIKE 'marketplace%'
   OR lower(coalesce(action,'')) LIKE 'job_posting%'
   OR lower(coalesce(target_type,'')) IN ('job_posting','job_application');

DELETE FROM public.reports
WHERE lower(coalesce(target_type,'')) = 'marketplace_listing';

DELETE FROM public.media_assets
WHERE slot = 'marketplace'
   OR coalesce(attached_to,'') LIKE 'marketplace:%';

-- Marketplace permissions were added to the shared staff table; retain all
-- other platform, moderation, verification, finance and settings permissions.
UPDATE public.minglora_platform_staff
SET permissions = array_remove(coalesce(permissions, ARRAY[]::text[]), 'marketplace.*'),
    updated_at = now()
WHERE 'marketplace.*' = ANY(coalesce(permissions, ARRAY[]::text[]));

-- Drop all feature-owned tables, indexes, triggers, RLS policies and data.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND left(tablename, 12) = 'marketplace_'
    ORDER BY tablename
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;

  FOR r IN
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND left(table_name, 12) = 'marketplace_'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.table_name);
  END LOOP;

  -- Remove Marketplace-specific routines, including RPCs and trigger helpers.
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (p.proname ILIKE '%marketplace%' OR p.prosrc ILIKE '%marketplace%')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.signature);
  END LOOP;
END $$;

COMMIT;
