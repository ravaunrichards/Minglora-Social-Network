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

In Supabase Dashboard → Authentication → URL Configuration, set the Site URL to the actual deployed Minglora origin and add only the actual Minglora callback/redirect URLs used by the application. Configure email confirmation according to the launch policy. Before relying on confirmation or recovery emails, configure and test a transactional SMTP provider with an appropriate sender domain and delivery limits.

For the current Render production deployment, set the Render service environment variables:
- `APP_ORIGIN=https://minglora-social-network.onrender.com`
- `SUPABASE_AUTH_REDIRECT_URL=https://minglora-social-network.onrender.com/`

The production origin is resolved from these trusted HTTPS settings and never from request or forwarded-host headers. Invalid or localhost values are rejected. Supabase Auth uses its **Site URL** whenever an Auth request does not pass a specific redirect URL, so the hosted project setting must also be corrected.

In Supabase Dashboard → Authentication → URL Configuration, set:
- **Site URL:** `https://minglora-social-network.onrender.com`
- **Redirect URLs:** `https://minglora-social-network.onrender.com`
- **Redirect URLs:** `https://minglora-social-network.onrender.com/**`
- **Redirect URLs:** `https://minglora-social-network.onrender.com/?password-recovery=1`

Remove the production `http://localhost:3000` Site URL and any localhost redirect entries. The Site URL is the fallback for magic links, email confirmations and recovery when no per-request redirect is supplied. A redirect supplied by code must also match the project's allow-list.

### Supabase Auth email templates

For the Magic Link, Confirm signup, Reset Password, Invite user and Change email templates, use Supabase's generated `{{ .ConfirmationURL }}` for the action link. Do not construct an action link from `{{ .SiteURL }}`, hard-code `localhost:3000`, or replace the Supabase verification host with the Minglora app host. Example Magic Link template:

```html
<h2>Your Minglora sign-in link</h2>
<p>Use the secure one-time link below to sign in to Minglora.</p>
<p><a href="{{ .ConfirmationURL }}">Sign in to Minglora</a></p>
<p>If you did not request this link, you can ignore this email.</p>
```

The generated ConfirmationURL performs Supabase verification first and then applies the configured redirect. When a request explicitly supplies `redirectTo`, a custom template that constructs a verification URL may need `{{ .RedirectTo }}`; the safer standard is to link to `{{ .ConfirmationURL }}`. Minglora now recognizes the Supabase `type=magiclink` callback, validates its access token server-side against Supabase Auth, creates the app session, and enforces any verified TOTP MFA factor before opening the account. One-time tokens are removed from the browser URL before the session exchange.

These hosted Auth URL and email-template settings cannot be changed by a database migration or by the current Supabase project connector. Save the dashboard configuration directly. Previously sent links may retain the old destination; request a fresh magic link after saving.

## Account access across devices

Minglora creates a separate signed application session for each successful sign-in. The same account can therefore be active in more than one browser/device at the same time. The Settings & Privacy session manager lists active sessions and supports revoking one device or all other devices. Signing out should remove only the current device's session.

In Supabase Dashboard → Authentication → Sessions, keep **Single session per user** disabled. Enabling that optional restriction would terminate other sessions when the member signs in elsewhere and would conflict with Minglora's multi-device requirement. Do not configure a maximum of one active session.

## Email and recovery delivery

New Minglora accounts are created by the trusted Edge Function with `email_confirm: true`; members can sign in immediately after registration without waiting for an email confirmation link. Password recovery is different.

### Current hosted email-provider limitation

The hosted Minglora project was verified on 2026-11-03 as using Supabase's default sender (`noreply@mail.app.supabase.io`), not a custom SMTP provider. The default sender is a development/testing service: it only sends to addresses belonging to the Supabase organization team and is limited to **2 Auth emails per hour across the entire project** while email confirmation is enabled. Supabase returns HTTP 429 with `over_email_send_rate_limit` when the hourly project quota is exhausted. A separate per-user resend cooldown also applies. Changing to another recipient address does not bypass the project-wide quota.

**Do not disable Confirm email to bypass this limit.** That marks arbitrary signup email addresses as confirmed without proving ownership. Keep the current account-security behavior and configure a real sender instead.

### Zero-cost SMTP option for a small launch: Gmail

Minglora's owner requested a $0-only setup. A dedicated personal Gmail account can be used as a no-domain, no-monthly-fee SMTP sender for low-volume testing or a small private launch. This is a constrained starter option, not a high-volume production mail platform.

1. Create or choose a dedicated Gmail account used only for Minglora system email. Do not use a personal inbox that contains private correspondence.
2. Enable Google 2-Step Verification on that account.
3. Open the Google Account **App passwords** page and create a unique app password for Minglora. Google only offers app passwords to eligible accounts with 2-Step Verification; accounts using Advanced Protection, security-key-only 2-Step Verification, or some managed work/school accounts may not have the option.
4. In Supabase Dashboard → **Authentication → SMTP Settings**, enable custom SMTP and enter:
   - Host: `smtp.gmail.com`
   - Port: `465` (SSL) or `587` (STARTTLS)
   - Username: the complete dedicated Gmail address
   - Password: the generated Google app password (not the normal Google password)
   - Sender email: the same Gmail address
   - Sender name: `Minglora`
5. Save the SMTP settings, then use **Authentication → Rate Limits** to set a conservative quota within the sender's real limits. Keep per-address cooldowns and abuse protection enabled.
6. Test recovery delivery to external Gmail, Outlook and iCloud inboxes. Confirm the message arrives, its link opens the Minglora recovery page, and the password can actually be changed.

Google's published personal Gmail limit is up to 500 messages per day, and Google can temporarily suspend sending when its limits or abuse controls are triggered. Do not treat this as a guaranteed 500-message Minglora quota: Gmail may enforce additional restrictions, and the Supabase SMTP rate limit must remain lower than the sender's practical capacity. This option does not provide a branded Minglora domain or authenticated domain-level SPF/DKIM alignment. It is therefore suitable only as a $0 bridge while usage is small; do not promise reliable high-volume delivery from a consumer Gmail account.

Never put the Gmail password or app password in GitHub, the browser, a public environment file, or chat. Store it only in Supabase's private SMTP configuration. If Google revokes the app password, create a replacement and update the Supabase SMTP setting.

### Required production SMTP setup

1. Create an account with a transactional email provider that supports SMTP (for example Resend, AWS SES, Postmark, SendGrid, ZeptoMail or Brevo).
2. Verify a Minglora sending domain with that provider. Publish its SPF and DKIM records, and add a DMARC policy before sending production authentication email.
3. In Supabase Dashboard, open **Authentication → SMTP Settings** and enable custom SMTP. Enter the provider's SMTP host, port, username, password, sender email and sender name. Keep the SMTP password only in Supabase's private Auth configuration; never commit it to Git or put it in browser-visible environment variables.
4. After custom SMTP is enabled, open **Authentication → Rate Limits** and set the email quota to the value supported by the provider and Minglora's expected traffic. Do not remove reasonable per-address cooldowns.
5. Keep the Site URL set to `https://minglora-social-network.onrender.com` and allow the exact recovery redirect `https://minglora-social-network.onrender.com/?password-recovery=1`.
6. Send real test recovery messages to external Gmail, Outlook and iCloud inboxes. Verify inbox delivery, spam placement, sender authentication, link destination, token validation and password update before opening registration widely.

Supabase also supports configuring custom SMTP through its Management API at `PATCH /v1/projects/{project_ref}/config/auth`; that requires a Supabase personal access token and the SMTP provider credentials. Those credentials are not present in this repository or the connected project tools, so the live sender cannot safely be switched until the owner supplies/configures them.

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

## Production persistence architecture

Minglora's live Render service uses its dedicated Supabase project through the HTTPS Edge Function gateway. It does **not** open a direct PostgreSQL connection from Node.

- Render uses `PERSISTENCE_DRIVER=supabase`.
- `SUPABASE_STATE_API_URL` points to the Minglora-only `minglora-runtime-state` Edge Function.
- `SUPABASE_STATE_API_KEY` is a private Render-to-Edge-Function credential. The Edge Function validates it against a SHA-256 digest in `public.minglora_runtime_api_secrets`.
- The Edge Function's server-only Supabase secret key remains inside the Supabase function environment. Never copy it into Render, GitHub, a browser bundle or chat.
- The gateway reads and revision-checks writes to `public.minglora_runtime_state`. The application uses this protected JSONB compatibility store for durable persistence.

**Do not configure `DATABASE_URL`, `PGSSLMODE`, `PG_POOL_MAX`, or enable the old `minglora_runtime` database login.** The current application does not use a direct PostgreSQL pool. The connected Render service should remain at one instance while the single-row compatibility adapter is in use; do not add independent writers or horizontally scale it.

The production Render startup logs on 2026-11-03 reported `persistenceDriver=supabase`, `persistenceDurable=true`, and `persistenceReady=true`. The `/api/ready` endpoint derives readiness from the live Supabase gateway health check and configured Auth provider.

## Application integration status

The normalized relational schema, RLS policies, storage buckets and domain tables are deployed. However, the Node route layer still serializes its in-memory application model into the single `public.minglora_runtime_state` JSONB row; the normalized domain tables are **not yet the active repository adapter for every application route**. This is durable persistence, but it is not yet a normalized, transaction-oriented route/data layer. Migrate route domains incrementally to the relational tables and transactional RPCs before adding multiple API instances or independent writers.

The generated database types are maintained at `database/types/database.types.ts`.