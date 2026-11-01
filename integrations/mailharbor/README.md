# MailHarbor inside Minglora

MailHarbor is a native Minglora application module, not a separate website or static link. Signed-in members open it from the desktop top navigation, mobile navigation or utility rail. Minglora's mailharbor route mounts the mailbox UI inside the existing app shell at /mailharbor/index.html?embedded=1. The embedded client uses the same-origin Minglora HttpOnly session cookie.

## Active architecture

- Minglora remains the only public application service.
- The active UI is public/mailharbor/; its requests go to /api/mailharbor/*.
- The active API is backend/modules/mailharbor/service.js, mounted by src/server.js.
- The authenticated Minglora member ID owns each mailbox, message, draft and mutation.
- Mailbox and message state are persisted by Minglora's current state persistence adapter. No separate public MailHarbor deployment is needed.
- The shared dimensional icon artwork is public/assets/icons/navigation-3d.svg; MailHarbor's folder and action controls use its original vector 3D symbols.
- public/mailharbor/ is a full in-app client. Its route is not a static card; the UI reads live API status and member mailbox data.

## Available in the current module

- Automatic mailbox provisioning from the signed-in Minglora identity.
- Internal address aliases based on the member's Minglora username.
- Inbox, Starred, Sent, Drafts, Spam, Trash and Archive views.
- Search across the currently selected mailbox view.
- Compose with To, Cc and Bcc.
- Save, reopen, edit and send drafts.
- Bulk mark-read, archive, report-spam, move-to-trash and restore-to-inbox actions.
- Per-message star toggling and message detail view.
- Member-to-member delivery to existing Minglora mailboxes.
- Connected Accounts view that reports the real state of external provider setup.
- Per-member MailHarbor settings for sender display name, signature, refresh interval, read-on-open, previews and compact rows.
- Authenticated automatic mailbox refresh when a realtime socket is not configured.
- External Resend outbox processing with idempotency, bounded retries and provider message IDs.
- Signed inbound Resend webhooks, received-email retrieval, recipient mailbox routing and delivery/bounce/complaint receipts.
- Address alias changes with ownership and uniqueness checks.
- Server-side owner scoping and persistence rollback on a failed save.

## External accounts and Internet email

MailHarbor supports three external-email routes with accurate provider capabilities. Outlook uses user-approved Microsoft OAuth and Microsoft Graph delegated `Mail.Read` and `Mail.Send` permissions to import incoming messages and send from the member's Outlook address. Gmail uses user-approved OAuth with the narrower `gmail.send` scope for sending only. Gmail inbox-reading scopes are deliberately not requested in the $0 server-side setup because Google classifies them as restricted and requires an additional security assessment when the app handles restricted mail data on its server. Yahoo Mail and iCloud are not integrated in this version. The optional Resend route sends from a verified domain controlled by Minglora and supports signed inbound webhook routing. Connecting Outlook or Gmail for external sending does not require Minglora to buy a separate mail domain.

To enable external Internet email, set MAILHARBOR_RESEND_API_KEY, MAILHARBOR_MAIL_DOMAIN, MAILHARBOR_DOMAIN_VERIFIED=true and MAILHARBOR_FROM_EMAIL in the Minglora Render environment only after the domain is verified in Resend and its exact SPF/DKIM records have been published. For inbound email, also set MAILHARBOR_RESEND_WEBHOOK_SECRET and MAILHARBOR_INBOUND_ENABLED=true, add a Resend webhook to https://minglora-social-network.onrender.com/api/mailharbor/webhooks/resend for email.received, email.delivered, email.bounced and email.complained, and configure MX using the exact receiving record supplied by Resend. The app verifies Svix signatures against the raw request body. Keep credentials server-side.

## Gmail and Outlook setup (no domain purchase required)

OAuth is active only after Minglora's app credentials are privately configured. Register web OAuth applications with Google Cloud and Microsoft Entra ID. Use these exact authorized redirect URIs:
- Google: `https://minglora-social-network.onrender.com/api/mailharbor/oauth/gmail/callback`
- Microsoft: `https://minglora-social-network.onrender.com/api/mailharbor/oauth/outlook/callback`

For Google, enable the Gmail API and configure the OAuth consent screen. The app requests OpenID profile/email plus the sensitive `gmail.send` scope only. Google requires OAuth app verification for broad public use of sensitive scopes; unverified/testing apps can be limited to listed test users, and Google documents a seven-day refresh-token lifetime for many testing-mode external apps. Gmail inbox-reading scopes such as `gmail.readonly` and `gmail.modify` are restricted; do not add them to this zero-cost build because server-side handling of restricted Gmail data triggers additional security-assessment requirements. References: [Gmail API scope classifications](https://developers.google.com/workspace/gmail/api/auth/scopes), [Google restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), and [Google refresh-token behaviour](https://developers.google.com/identity/protocols/oauth2).

For Microsoft, register a Web application and add the Outlook callback URI. Configure delegated permissions `User.Read`, `Mail.Read`, `Mail.Send`, `openid`, `profile`, `email` and `offline_access`. The app uses `Mail.Read` rather than broader `Mail.ReadWrite`; Microsoft documents delegated `Mail.Read` and `Mail.Send` as available for personal Microsoft accounts without admin consent in the general case. Set the tenant to `common` to allow supported personal and work/school Microsoft accounts, subject to the user's organization consent policy. References: [Microsoft Graph permissions](https://learn.microsoft.com/graph/permissions-reference), [Microsoft app registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), and [delegated user consent](https://learn.microsoft.com/en-us/entra/identity-platform/consent-types-developer).

Set the following server-only variables in Render's existing Minglora service:
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and optionally `MICROSOFT_TENANT_ID=common`
- Optional `MAILHARBOR_OAUTH_ENCRYPTION_KEY`; when omitted, the existing server-side `SESSION_SECRET` is used as the key source.

Never put OAuth secrets in GitHub, frontend code, or chat. MailHarbor's OAuth callback checks a one-time, member-bound state, uses PKCE, stores access/refresh tokens with AES-256-GCM encryption, and does not return tokens to the browser. The mailbox owner can sync or disconnect each account. New external messages use the chosen connected account; Outlook incoming messages are imported from the provider inbox on sync. Gmail accounts are send-only in this $0 path. Members can add up to five attachments per message (1.5 MB per file, 4 MB total), download supported incoming Outlook attachments, and reply to or forward messages.

Until a public mail domain is verified, internal member addresses use the reserved members.minglora.invalid domain. That namespace is internal-only and not publicly routable. Internal send and receive are persisted in Minglora's state store; sender-side Sent items are marked delivered only after recipient mailbox writes are saved. The mailbox client refreshes over the authenticated API on each member's selected interval.

## $0 external email path

Resend's published Free tier currently costs $0 and includes 3,000 transactional emails per month, a 100-per-day cap, three custom domains, three inboxes, one webhook endpoint and 30-day data retention. Each received email counts against the transactional quota. Resend says accounts that exceed the Free quota without paid overages enabled are notified and offered an upgrade; pay-as-you-go overages are for paid subscriptions. Keep Minglora on Free, do not add billing details or enable pay-as-you-go, and stop external delivery at the free quota rather than upgrading. Free-tier limits can change under Resend's terms, so check the official current pages before activating it:
- Pricing: https://resend.com/pricing
- Receiving: https://resend.com/features/inbound

Minglora's code does not enable paid overages or upgrade a provider account. Keep Resend pay-as-you-go disabled and do not add a paid email add-on, dedicated IP, or paid Cloudflare Workers email sending. If the free quota is exhausted, leave external delivery paused until the next free period; do not upgrade.

For the requested `@minglora.com` member addresses, the domain must be controlled by Minglora's owner and its DNS records must be editable. A domain that is already registered cannot be newly registered again, and a public DNS lookup cannot grant permission to edit it. Once the owner has DNS access, verify `minglora.com` in Resend and publish only the exact SPF, DKIM and receiving MX records supplied by Resend. Do not replace existing MX records without checking the current mail service first.

After verification, set these Render environment variables privately:
- `MAILHARBOR_RESEND_API_KEY`: Resend Free API key.
- `MAILHARBOR_MAIL_DOMAIN=minglora.com`.
- `MAILHARBOR_DOMAIN_VERIFIED=true`: only after the provider confirms verification.
- `MAILHARBOR_FROM_EMAIL=no-reply@minglora.com`.
- `MAILHARBOR_RESEND_WEBHOOK_SECRET`: the signing secret for the Minglora webhook.
- `MAILHARBOR_INBOUND_ENABLED=true`: only after inbound MX routing and the signed webhook are active.

Never commit API keys or webhook secrets. Until all domain/provider checks are complete, keep the reserved internal-only mailbox domain and Minglora member-to-member delivery unchanged. Do not advertise an `.invalid` address as an Internet email address, and do not substitute another domain without the owner's approval.

## Legacy source mirror

The older standalone Express/Postgres source and migrations remain under source/ for reference and possible future transport expansion. They are not started by Minglora's active production server. Do not treat the source mirror's SMTP/IMAP/realtime features as enabled in the current Minglora deployment.

## Verification

tests/mailharbor.test.js verifies mailbox provisioning, internal send/receive delivery status, external-recipient rejection, ownership checks, per-member mailbox settings, attachment validation and delivery, rollback on failed persistence, and draft create/edit/send behavior. tests/mailharbor-oauth.test.js verifies OAuth state/PKCE, encrypted tokens, Gmail send-only behaviour, Outlook inbox sync and external sending. tests/unit/mailharbor-in-app.test.js verifies the integrated client, account actions, attachment UI, and reply/forward controls. tests/unit/navigation-3d-icons.test.js verifies native MailHarbor navigation and its shared SVG icon artwork. A live deployment is only considered active when an authenticated /api/mailharbor/status and mailbox request succeed in the deployed service.
