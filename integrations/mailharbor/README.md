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

MailHarbor uses Resend for verified external Internet email. Outbound messages are queued in Minglora state and sent by the native delivery loop; provider acceptance is shown as sent, and signed email.delivered / email.bounced / email.complained events update the final delivery state. Inbound email is accepted only through the signed /api/mailharbor/webhooks/resend route and Resend's Receiving API. Gmail, Yahoo Mail, Outlook and iCloud mailbox sync remain independent OAuth connections and are shown as disconnected until their own authorization flows are configured. The status endpoint reports actual capabilities and never fakes a connected badge.

To enable external Internet email, set MAILHARBOR_RESEND_API_KEY, MAILHARBOR_MAIL_DOMAIN, MAILHARBOR_DOMAIN_VERIFIED=true and MAILHARBOR_FROM_EMAIL in the Minglora Render environment only after the domain is verified in Resend and its exact SPF/DKIM records have been published. For inbound email, also set MAILHARBOR_RESEND_WEBHOOK_SECRET and MAILHARBOR_INBOUND_ENABLED=true, add a Resend webhook to https://minglora-social-network.onrender.com/api/mailharbor/webhooks/resend for email.received, email.delivered, email.bounced and email.complained, and configure MX using the exact receiving record supplied by Resend. The app verifies Svix signatures against the raw request body. Keep credentials server-side.

Until a public mail domain is verified, internal member addresses use the reserved members.minglora.invalid domain. That namespace is internal-only and not publicly routable. Internal send and receive are persisted in Minglora's state store; sender-side Sent items are marked delivered only after recipient mailbox writes are saved. The mailbox client refreshes over the authenticated API on each member's selected interval.

## $0 external email path

The intended zero-cost provider is Resend's Free plan. Its published limits currently show 3,000 transactional emails per month, 100 per day, up to three custom sending domains, and three inbound inboxes. Inbound email is supported by Resend's receiving API and webhook flow. Check the live plan limits before enabling production traffic:
- Pricing: https://resend.com/pricing
- Receiving: https://resend.com/features/inbound

Minglora does not enable paid overages or automatically move to a paid plan. Keep sending within the Free plan quota. Do not add a paid email add-on, dedicated IP, or paid Cloudflare Workers email sending.

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

tests/mailharbor.test.js verifies mailbox provisioning, internal send/receive delivery status, external-recipient rejection, ownership checks, per-member mailbox settings, message state changes, rollback on failed persistence, and draft create/edit/send behavior. tests/unit/navigation-3d-icons.test.js verifies native MailHarbor navigation and its shared SVG icon artwork. A live deployment is only considered active when an authenticated /api/mailharbor/status and mailbox request succeed in the deployed service.
