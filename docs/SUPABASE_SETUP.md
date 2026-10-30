# Minglora Supabase setup

Minglora must use its own Supabase project. Do not put Zovara, ZUNO, or another product's project URL or keys in Minglora's environment.

## Configure Auth

1. In the Minglora Supabase project, copy the Project URL and publishable key.
2. Set AUTH_PROVIDER=supabase, SUPABASE_URL, and SUPABASE_PUBLISHABLE_KEY in the Minglora server environment.
3. Set SUPABASE_AUTH_REDIRECT_URL to the deployed Minglora origin plus the configured auth callback path when using email confirmation redirects.
4. Keep SUPABASE_SERVICE_ROLE_KEY server-only. The current signup/login implementation does not need it.
5. In Supabase Auth settings, configure the site URL and allowed redirect URLs for the actual Minglora domain. Choose whether email confirmation is required and configure a working SMTP provider before relying on confirmation email delivery.

## Apply the profile migration

Apply migrations/004_supabase_auth_profiles.sql to the Minglora Supabase database using the SQL Editor or an approved migration workflow. It creates public.profiles, enables RLS, applies owner-only profile updates, creates a profile automatically when a row is inserted into auth.users, and backfills profiles for Auth users that already exist.

The migration is scoped to auth.users and public.profiles. Do not apply it to another product's project.

## Verify

After applying the migration, create one test account through Minglora. Confirm that:
- the account appears in Supabase Dashboard → Authentication → Users;
- a profile row exists in public.profiles with the same UUID;
- the profile username and display name match the signup metadata;
- the user can log in after completing email confirmation, when confirmation is enabled;
- an unauthenticated user cannot update a profile.

Minglora will not silently fall back to local-only account creation in production. If the Supabase URL/key are absent or placeholders, the Auth endpoints return HTTP 503. This keeps incomplete setup visible instead of recording accounts in the wrong place.

## Existing Minglora accounts

Accounts created before the Supabase Auth integration remain in the existing application store. When an existing member logs in with their correct old password, Minglora verifies the stored password hash and creates the corresponding Supabase Auth account and profile. Existing application user IDs and social relationships are retained. This is a lazy migration; it occurs on that member's next successful login.
