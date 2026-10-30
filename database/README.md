# Minglora database

Minglora's dedicated Supabase project is `gzycobgbasnqqhnympkr`. The live project has the canonical Supabase-native schema installed through migrations:

- `005_minglora_supabase_relational_platform.sql` — Auth-linked profile records, social and content domains, messaging, Groups, Pages, Stories, Live, calls, Marketplace, events, reporting, fundraisers, data-rights requests, protected runtime state, RLS policies, Storage buckets/policies, and Realtime publication membership.
- `006_minglora_database_hardening.sql` — missing foreign-key indexes, a primary key on `memory_exclusions`, and restricted execution of the platform's `public.rls_auto_enable()` function.
- `007_minglora_authorization_and_live_integrity.sql` — fixes group and Page ownership scoping, limits client access to Live/call state transitions, and hardens fundraiser review state.
- `008_minglora_live_policy_consolidation.sql` — consolidates Live participant policies to reduce permissive-policy overhead.

The generated Supabase database types are in `database/types/database.types.ts`.

## Identity and authentication

Supabase `auth.users` is the identity source. `public.profiles.id` references `auth.users.id`; there is no second password table. A private-schema trigger creates the corresponding profile from validated Auth metadata, with a stable fallback username when the requested username is invalid or already taken.

Supabase Auth owns password storage, email confirmation, password recovery, sessions and token issuance. Never add a Minglora password column or copy passwords into `public`.

## RLS and service-only records

All 47 public tables have RLS enabled. Most have policies that constrain rows to their owner, participants, audience or membership. `public.audit_log` and `public.minglora_runtime_state` intentionally have no client policies and are not granted to `anon` or `authenticated`; they are server-only. The Supabase security advisor reports these two locked tables as informational findings.

Storage uses 11 Minglora-prefixed buckets and owner-folder policies. Avatar and cover buckets are public for delivery; uploaded post, story, video, message, group, Page, Marketplace, live-thumbnail and export assets are private. Object paths must begin with the owning Auth UUID.

Realtime publication includes messages, notifications, live broadcasts, live participants, comments, post reactions, friendships and conversations.

## Important runtime integration status

The database schema is installed, but the current Node API still persists application state through the `public.minglora_runtime_state` JSONB compatibility adapter. It does **not yet read/write the 46 normalized domain tables as its active repository layer**. Do not mistake schema deployment for full application data-layer integration. The compatibility adapter is single-instance only.

The older migrations 001–004 are historical design/setup artifacts and must not be independently applied to a clean Minglora project. Migration 005 is the consolidated Supabase-native schema; migration 006 hardens it. Do not apply the original standalone `users/password_hash` schema alongside Supabase Auth.

No demo accounts, sample posts, fake messages, or engagement rows were seeded.