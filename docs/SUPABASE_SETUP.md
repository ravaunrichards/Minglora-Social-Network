# Minglora Supabase setup

Minglora's dedicated Supabase project is **`gzycobgbasnqqhnympkr`** in its own organization. Never use another product's project or keys.

## Database deployment

The following migrations have been applied and verified on the Minglora project:

- `005_minglora_supabase_relational_platform`
- `006_minglora_database_hardening`
- `007_minglora_authorization_and_live_integrity`
- `008_minglora_live_policy_consolidation`

Migration 005 creates the Auth-linked profile model and the application's relational social domains. It also enables RLS on all public tables, adds table policies and privileges, configures 11 Minglora Storage buckets with object access policies, and adds eight user-facing tables to the Realtime publication. Migration 006 adds missing foreign-key indexes, a primary key to `memory_exclusions`, and removes public execution rights from the platform-installed `public.rls_auto_enable()` function. Migration 007 fixes group/Page authorization scope and ensures client requests cannot mark Live rooms or participants as provider-connected; those transitions must come from the trusted LiveKit/server flow. Migration 008 consolidates the Live participant policies.

The database starts empty. No test user or sample engagement data was inserted.

## Auth identity model

Supabase Auth's `auth.users` is the authoritative identity store. A private-schema database trigger creates a matching `public.profiles` record after each Auth user is inserted. The profile UUID is the Auth UUID. Password hashes, reset tokens and verification tokens are not stored in Minglora public tables; Supabase Auth owns those functions.

The current server integration accepts these matching environment pairs (prefer the first):

- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Legacy compatibility: `SUPABASE_URL` and `SUPABASE_ANON_KEY`

Both values must belong to this Minglora project. Publishable/anon keys are suitable for browser requests subject to RLS. Never put a Supabase secret/service-role key in browser code or public environment variables. The current signup/login integration does not require a service-role key.

## Dashboard settings still required

In Supabase Dashboard → Authentication → URL Configuration, set the Site URL to the actual deployed Minglora origin and add only the actual Minglora callback/redirect URLs used by the application. Configure email confirmation according to the launch policy. Before relying on confirmation or recovery emails, configure and test a transactional SMTP provider with an appropriate sender domain and delivery limits. These Auth dashboard settings cannot be set by the database migration.

## Storage

The migration created these 11 buckets:

- Public delivery: `minglora-avatars`, `minglora-covers`.
- Private: `minglora-post-media`, `minglora-stories`, `minglora-short-videos`, `minglora-message-attachments`, `minglora-group-media`, `minglora-page-media`, `minglora-marketplace-media`, `minglora-live-thumbnails`, `minglora-data-exports`.

Authenticated object paths are owner-scoped: the first folder segment must be the uploader's Auth UUID. Private asset delivery should use authenticated download or signed URLs.

## Verification

After configuring Auth URLs and SMTP, create a real test account through Minglora and verify that it appears in Authentication → Users and has a `public.profiles` row with the same UUID. Test a confirmed login, profile update, and a rejected attempt to update another member's profile. Do not seed fake accounts to simulate this.

## Application integration still required

The Supabase schema is deployed, but the existing Node application still uses the single-row `public.minglora_runtime_state` compatibility store. The normalized domain tables are not yet the active data adapter for all application routes. The server also needs its private `DATABASE_URL`, `PERSISTENCE_DRIVER=postgres`, `PGSSLMODE=require`, `SUPABASE_URL`, and matching `SUPABASE_PUBLISHABLE_KEY` configured in the Minglora hosting environment before its production readiness check can pass.

The generated database types are maintained at `database/types/database.types.ts`.