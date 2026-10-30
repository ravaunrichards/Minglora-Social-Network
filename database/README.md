# Minglora database

Minglora's dedicated Supabase project is `gzycobgbasnqqhnympkr`. The live project has the canonical Supabase-native schema installed through migrations:

- `005_minglora_supabase_relational_platform.sql` — Auth-linked profile records, social and content domains, messaging, Groups, Pages, Stories, Live, calls, Marketplace, events, reporting, fundraisers, data-rights requests, protected runtime state, RLS policies, Storage buckets/policies, and Realtime publication membership.
- `006_minglora_database_hardening.sql` — missing foreign-key indexes, a primary key on `memory_exclusions`, and restricted execution of the platform's `public.rls_auto_enable()` function.
- `007_minglora_authorization_and_live_integrity.sql` — fixes group and Page ownership scoping, limits client access to Live/call state transitions, and hardens fundraiser review state.
- `008_minglora_live_policy_consolidation.sql` — consolidates Live participant policies to reduce permissive-policy overhead.
- `009_minglora_runtime_database_role.sql` — provisions the restricted runtime database role and RLS policy for the compatibility store.
- `010_minglora_rls_and_write_privilege_hardening.sql` — restricts mutable columns, ownership, publication and processing state.
- `011_minglora_private_rls_authorization_helpers.sql` and `012_minglora_group_rls_cycle_break.sql` — break recursive cross-table authorization checks using private, fixed-purpose helpers.
- `013_minglora_runtime_role_login_lock.sql` — keeps the runtime role `NOLOGIN` until a password is safely provisioned and stored privately.

The generated Supabase database types are in `database/types/database.types.ts`.

## Identity and authentication

Supabase `auth.users` is the identity source. `public.profiles.id` references `auth.users.id`; there is no second password table. A private-schema trigger creates the corresponding profile from validated Auth metadata, with a stable fallback username when the requested username is invalid or already taken.

Supabase Auth owns password storage, email confirmation, password recovery, sessions and token issuance. Never add a Minglora password column or copy passwords into `public`.

## RLS and service-only records

All 47 public tables have RLS enabled. Most have policies that constrain rows to their owner, participants, audience or membership. `public.audit_log` intentionally has no client policies and remains inaccessible to `anon` and `authenticated`. `public.minglora_runtime_state` is server-only and has an RLS policy exclusively for the dedicated `minglora_runtime` database role.

Storage uses 11 Minglora-prefixed buckets and owner-folder policies. Avatar and cover buckets are public for delivery; uploaded post, story, video, message, group, Page, Marketplace, live-thumbnail and export assets are private. Object paths must begin with the owning Auth UUID.

Realtime publication includes messages, notifications, live broadcasts, live participants, comments, post reactions, friendships and conversations.

## Important runtime integration status

The database schema is installed, but the current Node API still persists application state through the `public.minglora_runtime_state` JSONB compatibility adapter. It does **not yet read/write the 46 normalized domain tables as its active repository layer**. Do not mistake schema deployment for full application data-layer integration. The compatibility adapter is single-instance only.

The older migrations 001–004 are historical design/setup artifacts and must not be independently applied to a clean Minglora project. Migrations 005–013 are the applied Supabase-native schema and hardening sequence. Do not apply the original standalone `users/password_hash` schema alongside Supabase Auth.

## Runtime database login

The application runtime uses the restricted `minglora_runtime` role only for `public.minglora_runtime_state`. Migration 013 intentionally sets this role to `NOLOGIN` until its password is provisioned privately. Set its password in the Minglora Supabase SQL Editor (never in Git):

```sql
ALTER ROLE minglora_runtime WITH LOGIN PASSWORD '<new-long-random-password>';
```

Then place the Session Pooler connection string for this role into the existing Render service's private `DATABASE_URL` secret. Use the Session Pooler on port 5432 for Render's IPv4 network; do not use the `postgres` owner account. The connection string is documented in `infrastructure/render/README.md`.

No demo accounts, sample posts, fake messages, or engagement rows were seeded.