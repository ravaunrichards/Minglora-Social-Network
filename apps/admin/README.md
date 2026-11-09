# Minglora Admin Control Centre

The private admin workspace is implemented in `public/admin-centre.html`, `public/admin-centre.js` and `public/admin-centre.css`.

Owner-only controls include:
- MFA-protected account search and Supabase Auth ban/unban actions.
- Account ban duration, moderation reason and restoration of the pre-ban status.
- A dedicated audit history for account bans and restores, searchable by reason, user ID and action type.
- Audit entries showing the acting administrator, affected account, timestamp, ban duration, expiry and reported session-revocation outcome.
- Existing live internal activity journal, moderation reports, support inbox and operational controls.

Account-management and audit APIs check the designated owner identity and MFA-verified session on the server. The audit-history query returns selected audit metadata and profile labels only; it does not expose passwords, access tokens, private messages or payment credentials.


## Complete platform overview

The owner-only overview includes a live inventory of all 77 active runtime collections grouped into accounts and relationships, publishing and media, messaging and communities, pages and events, LIVE, calls and MeetWave, creator economy, moderation and support, and sounds. It reports counts only; private message bodies, credentials, tokens, media URLs and payment secrets are not exposed by the inventory. The internal activity feed also reports active sessions and platform record totals. The Supabase runtime gateway supports the owner audit-log action consumed by the dashboard.

## Supabase-style user and service management

The User Management workspace reads directly from Minglora Supabase Auth and the matching `public.profiles` records. It provides paginated account search, account details and identity-provider metadata, account creation, profile/contact edits, email and phone confirmation, password replacement, session revocation, account bans/restores, and an audited permanent-delete action. The designated Creator Hub owner account is read-only and protected from ban, edit, session-revoke, and delete operations. New account passwords are write-only and never returned to the browser or written to audit metadata.

Member list, detail, create, update, delete, and session-revocation requests are protected by the designated owner check, moderator authorization, an active MFA-verified reviewer session, and same-origin write validation. Auth administration is performed inside the Supabase Edge Function using its server-only privileged client; privileged Supabase credentials are not sent to Render's browser responses. Account changes write metadata-only entries to `public.audit_log`.

The Service Connections workspace reports Minglora's actual services: Supabase, Render, GitHub, LiveKit, PayPal, Tenor, SIX Group's ISO currency directory, Frankfurter exchange rates, browser Web Push, and Supabase Auth email delivery. It shows direct provider dashboards where available. Runtime health checks do not return provider API keys, client secrets, passwords, or session tokens. Email delivery is managed in Supabase Auth; the current app does not expose a separate SMTP provider's health check.

Automated coverage for owner protections, the CRUD gateway, account form controls, and the service registry lives in `tests/unit/admin-user-and-service-centre.test.js`.