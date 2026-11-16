
-- Dedicated least-privilege API role for the JSONB compatibility adapter.
-- Password is provisioned out-of-band and stored only in the hosting secret store.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='minglora_runtime') THEN
    CREATE ROLE minglora_runtime LOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
      CONNECTION LIMIT 10;
  END IF;
END $$;

GRANT CONNECT ON DATABASE postgres TO minglora_runtime;
GRANT USAGE ON SCHEMA public TO minglora_runtime;
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.minglora_runtime_state TO minglora_runtime;

DROP POLICY IF EXISTS minglora_runtime_server_access
  ON public.minglora_runtime_state;
CREATE POLICY minglora_runtime_server_access
  ON public.minglora_runtime_state
  FOR ALL TO minglora_runtime
  USING (true)
  WITH CHECK (true);

COMMIT;
