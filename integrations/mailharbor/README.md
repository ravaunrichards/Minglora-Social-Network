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
- Address alias changes with ownership and uniqueness checks.
- Server-side owner scoping and persistence rollback on a failed save.

## External accounts and Internet email

Gmail, Yahoo Mail, Outlook and iCloud are shown as not connected until each real provider integration is configured. The current /api/mailharbor/status response explicitly reports their configuration and connection states as false. There are no fake connected badges and no external message is claimed as delivered.

To enable external account sync, add provider-specific OAuth applications, redirect/callback routes, required scopes, token storage/refresh and member consent. For Internet sending and receiving, also configure a Minglora-owned domain, verified SMTP/outbound service, SPF/DKIM/DMARC records, inbound MX routing and a signed inbound webhook. Keep provider credentials server-side. Do not activate connection badges before a real OAuth handshake and mailbox sync succeed.

Until a public mail domain is verified, internal member addresses use the reserved members.minglora.invalid domain. That namespace is internal-only and not publicly routable. Internal send and receive are persisted in Minglora's state store; sender-side Sent items are marked delivered only after recipient mailbox writes are saved. The mailbox client refreshes over the authenticated API on each member's selected interval.

## Legacy source mirror

The older standalone Express/Postgres source and migrations remain under source/ for reference and possible future transport expansion. They are not started by Minglora's active production server. Do not treat the source mirror's SMTP/IMAP/realtime features as enabled in the current Minglora deployment.

## Verification

tests/mailharbor.test.js verifies mailbox provisioning, internal send/receive delivery status, external-recipient rejection, ownership checks, per-member mailbox settings, message state changes, rollback on failed persistence, and draft create/edit/send behavior. tests/unit/navigation-3d-icons.test.js verifies native MailHarbor navigation and its shared SVG icon artwork. A live deployment is only considered active when an authenticated /api/mailharbor/status and mailbox request succeed in the deployed service.
