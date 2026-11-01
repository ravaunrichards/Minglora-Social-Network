# MailHarbor inside Minglora

MailHarbor is a native Minglora mailbox feature. The member-facing client is served by Minglora at `/mailharbor/index.html`, uses the signed-in Minglora session and stores mail data through Minglora's existing durable Supabase state gateway.

## Single-service architecture

- Minglora remains the only public application service.
- MailHarbor routes are handled inside the existing Minglora API; there is no loopback API or separately deployed MailHarbor process.
- Member mailbox records and message records are persisted in Minglora's existing state document through the same Supabase persistence gateway used by the social application.
- Mailbox ownership is tied to the authenticated Minglora member ID. Every inbox, sent, message-detail and mutation query is scoped to that member.
- The native implementation does not require a second Postgres connection string, a new Supabase project, a new database, or a new Render service.

## Available now

- Automatic mailbox creation when a signed-in Minglora member opens MailHarbor.
- A stable internal mailbox address based on the member's Minglora username.
- Inbox, Sent, Starred, Spam, Trash and Archive folders.
- Member-to-member message delivery inside Minglora.
- To, Cc and Bcc recipient handling; Bcc recipients are not exposed in recipient copies.
- Search, read/unread, star, archive, trash and address-alias changes.
- Messages and mailbox changes persisted through Minglora's existing Supabase-backed state store.
- Delivery is confirmed only after the Minglora state save succeeds. A failed persistence save rolls the in-memory change back and returns an error instead of showing a false success.

## Internal and external mail are different

Until Minglora connects an owned, DNS-verified sender domain and a real mail provider, member addresses use the reserved internal domain `members.minglora.invalid`. That domain is not publicly routable. Messages to existing Minglora member mailboxes are delivered inside Minglora; external addresses are rejected without saving or claiming delivery.

External sending and receiving are intentionally not advertised as available. To activate real Internet email later, configure a domain owned by Minglora, provider-issued SMTP credentials, verified SPF/DKIM/DMARC records, inbound MX routing and a signed inbound webhook. Do not mark a domain verified or enable inbound delivery before the provider confirms the setup.

## Legacy MailHarbor source

The earlier standalone-style Express/Postgres source and its SQL migrations are retained under `source/` for reference and future transport expansion. They are not started by Minglora's production server. The active implementation is `backend/modules/mailharbor/service.js` and uses Minglora's native API and persistence path.

## Verification

The main Minglora CI suite includes MailHarbor service tests for mailbox provisioning, internal delivery, external-recipient rejection, ownership checks, message updates, and rollback when persistence fails. A live Render deployment is considered operational only after the service is healthy and a real authenticated mailbox request succeeds.
