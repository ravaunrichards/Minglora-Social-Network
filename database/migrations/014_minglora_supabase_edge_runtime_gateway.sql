BEGIN;

-- Disable the previous raw PostgreSQL application login. The project database
-- remains Supabase PostgreSQL; the application will access it through an Edge Function.
ALTER ROLE minglora_runtime NOLOGIN PASSWORD NULL;
DROP POLICY IF EXISTS minglora_runtime_server_access
  ON public.minglora_runtime_state;
REVOKE ALL PRIVILEGES ON TABLE public.minglora_runtime_state
  FROM minglora_runtime;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM minglora_runtime;
REVOKE CONNECT ON DATABASE postgres FROM minglora_runtime;

-- Store only a SHA-256 digest of the Render-to-Edge-Function credential.
CREATE TABLE IF NOT EXISTS public.minglora_runtime_api_secrets (
  name text PRIMARY KEY,
  secret_sha256 text NOT NULL
    CHECK (secret_sha256 ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.minglora_runtime_api_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.minglora_runtime_api_secrets
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.minglora_runtime_api_secrets TO service_role;

-- Only Supabase's server-side Edge Function key accesses this state table.
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.minglora_runtime_state TO service_role;

COMMIT;
