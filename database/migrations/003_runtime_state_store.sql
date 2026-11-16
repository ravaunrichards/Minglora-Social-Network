-- Minglora runtime PostgreSQL persistence table.
-- The current API stores state in one JSONB document as a compatibility bridge.
-- Keep the API at one instance until normalized transactional repositories replace it.
BEGIN;

CREATE TABLE IF NOT EXISTS public.minglora_runtime_state (
  state_key text PRIMARY KEY CHECK (state_key = 'primary'),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.minglora_runtime_state (state_key, state)
VALUES ('primary', '{
  "users": [], "posts": [], "friendships": [], "follows": [], "blocks": [],
  "savedPosts": [], "groups": [], "groupPosts": [], "stories": [],
  "storyViews": [], "pages": [], "pageRoles": [], "pageFollows": [],
  "pagePosts": [], "messages": [], "notifications": [], "sessions": []
}'::jsonb)
ON CONFLICT (state_key) DO NOTHING;

ALTER TABLE public.minglora_runtime_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.minglora_runtime_state FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.minglora_runtime_state FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.minglora_runtime_state FROM authenticated';
  END IF;
END
$$;

COMMIT;
