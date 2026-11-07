-- Keep the SECURITY DEFINER activity trigger's search path pinned to trusted built-ins.
BEGIN;
ALTER FUNCTION private.minglora_capture_internal_activity() SET search_path = pg_catalog;
COMMIT;
