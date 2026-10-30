# Minglora Supabase setup

Minglora's dedicated Supabase project is **`gzycobgbasnqqhnympkr`** in its own organization. Never use another product's project or keys.

## Database deployment

The following migrations have been applied and verified on the Minglora project:

- `005_minglora_supabase_relational_platform`
- `006_minglora_database_hardening`
- `007_minglora_authorization_and_live_integrity`
- `008_minglora_live_policy_consolidation`
- `009_minglora_runtime_database_role`
- `010_minglora_rls_and_write_privilege_hardening`
- `011_minglora_private_rls_authorization_helpers`
- `012_minglora_group_rls_cycle_break`
- `013_minglora_runtime_role_login_lock`

Migration 005 creates the Auth-linked profile model and the application's relational social domains. It also enables RLS on all public tables, adds table policies and privileges, configures 11 Minglora Storage buckets with object access policies, and adds eight user-facing tables to the Realtime publication. Migration 006 adds missing foreign-key indexes, a primary key to `memory_exclusions`, and removes public execution rights from the platform-installed `public.rls_auto_enable()` function. Migration 007 fixes group/Page authorization scope and ensures client requests cannot mark Live rooms or participants as provider-connected; those transitions must come from the trusted LiveKit/server flow. Migration 008 consolidates the Live participant policies. Migrations 009–013 provision a least-privilege API database role, harden client write privileges and ownership constraints, break recursive RLS dependencies, and keep the runtime role disabled for login until its password can be safely configured.

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

Active upload routing uses the dedicated bucket for each surface:

- `avatar` and `cover` → their public image buckets (10 MB and 20 MB).
- `post` → private `minglora-post-media` (up to 500 MB; photo, video, audio and GLB).
- `story` → private `minglora-stories` (up to 200 MB; photo and video).
- `group` and `page` → their separate private media buckets (up to 250 MB; JPEG/PNG/WEBP and MP4).
- `message` → private `minglora-message-attachments` (up to 100 MB; photos, video, voice notes including `audio/webm`, and supported documents).

`minglora-short-videos`, `minglora-marketplace-media`, `minglora-live-thumbnails`, and `minglora-data-exports` are provisioned with private access policies, but are not yet connected to dedicated upload screens/endpoints in the current web application. A bucket's existence alone does not mean a feature is wired to it.

Authenticated object paths are owner-scoped: the first folder segment must be the uploader's Auth UUID. Public delivery is limited to avatars and covers. Private media is delivered with short-lived signed URLs after application authorization; raw private object access remains blocked without the appropriate owner policy.

## Verification

After configuring Auth URLs and SMTP, create a real test account through Minglora and verify that it appears in Authentication → Users and has a `public.profiles` row with the same UUID. Test a confirmed login, profile update, and a rejected attempt to update another member's profile. Do not seed fake accounts to simulate this.

## Runtime database credential

Minglora has a dedicated `minglora_runtime` database role with access only to the protected compatibility-state table. Migration 013 leaves it `NOLOGIN` until a private password is set. In the Minglora Supabase SQL Editor, run the following with a newly generated long random password; do not commit it or paste it into chat:

```sql
ALTER ROLE minglora_runtime WITH LOGIN PASSWORD '<new-long-random-password>';
```

Then set the existing Render service's `DATABASE_URL` to the Minglora Session Pooler connection for this restricted role. The required connection string format is documented in `infrastructure/render/README.md`.

## Application integration still required

The Supabase schema is deployed, but the existing Node application still uses the single-row `public.minglora_runtime_state` compatibility store. The normalized domain tables are not yet the active data adapter for all application routes. The server already has its Minglora Supabase URL and publishable key configured. Its durable persistence remains unconfigured until the runtime-role password is set privately and the corresponding `DATABASE_URL`, `PERSISTENCE_DRIVER=postgres`, and `PGSSLMODE=require` are added to Render. Production readiness must remain false until `/api/ready` reports a connected PostgreSQL driver and configured Supabase Auth.

The generated database types are maintained at `database/types/database.types.ts`.