# MailHarbor inside Minglora

MailHarbor is Minglora's built-in email and mailbox product. The complete MailHarbor source repository is mirrored under `source/`; the integrated member-facing webmail client is served from Minglora at `/mailharbor/index.html`.

## Identity and connection

- A member signs into Minglora once with their existing Minglora account. MailHarbor does not ask them for a separate mail password.
- The Minglora API proxies authenticated `/api/mailharbor/*` calls to the isolated MailHarbor service.
- The service-to-service identity is protected by HMAC-SHA256. Signatures cover the exact HTTP method, original API path and query, Minglora member ID, request-body hash and a timestamp with a 120-second acceptance window.
- On first access, MailHarbor creates a mailbox record in its own PostgreSQL database. The initial address is `<Minglora username>@<MAILHARBOR_MAIL_DOMAIN>`; members can request a different available address from the mailbox's Email address control.
- The MailHarbor database owns mailbox accounts, messages, SMTP outbox jobs, inbound idempotency keys and realtime tickets. Mail messages are not stored in Minglora's JSONB social-network state.
- The original SMTP outbox/retry worker, signed inbound webhook and WebSocket notification service are retained.

## Deployment

The root `render.yaml` blueprint defines a separate MailHarbor web service and dedicated PostgreSQL database. It uses paid always-on web/database plans because the mail worker, realtime service and mailbox storage must not depend on an ephemeral development filesystem or sleeping free database. **Review Render's current quote before creating the blueprint resources.** No infrastructure has been created or paid for by this code change.

The blueprint deploys the isolated app from `integrations/mailharbor/source`. Its service uses the source's startup migration runner to apply `001_core.sql`, `002_realtime.sql` and `003_minglora_sso_identity.sql` in order.

## Required private settings

On the existing Minglora web service:

- `MAILHARBOR_API_URL`: the deployed MailHarbor HTTPS origin, without a trailing slash.
- `MAILHARBOR_SSO_SECRET`: a randomly generated secret of at least 32 bytes, kept private.

On the MailHarbor service:

- `MINGLORA_SSO_SECRET`: exactly the same secret as the Minglora setting.
- `MAILHARBOR_MAIL_DOMAIN`: the email domain you control and intend to verify with the mail provider.
- `MAILHARBOR_DOMAIN_VERIFIED=true`: change from `false` only after your mail provider confirms domain ownership and sender DNS records.
- `INBOUND_MAIL_ENABLED=true`: change from `false` only after inbound routing, MX records and the signed webhook have been verified.
- `DATABASE_URL` and `DATABASE_SSL=true`: the new dedicated MailHarbor PostgreSQL database. The Render blueprint injects the URL.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`: the real outbound SMTP credentials and verified sender supplied by the mail provider.
- `INBOUND_WEBHOOK_SECRET`: a separate random webhook HMAC secret also entered at the inbound mail provider.
- `CORS_ORIGINS` and `REALTIME_ALLOWED_ORIGINS`: approved Minglora web origins. The blueprint seeds the current Minglora Render origin.

Do not commit any secret values. Use different secrets for SSO and inbound webhook verification. Keep the MailHarbor database isolated from Minglora's main state.

## Domain and mail-provider activation

MailHarbor is not itself an MX operator or a self-hosted SMTP network. The chosen provider must accept outbound mail for the verified MailHarbor domain and route inbound messages to the signed webhook endpoint `/api/webhooks/inbound`. Publish only the exact MX, SPF, DKIM and DMARC records supplied by that provider. Configure bounce/complaint handling and sender reputation policies before production traffic.

The app deliberately reports sending and receiving as unavailable while those real provider connections are missing. Mailbox provisioning and sending are blocked until `MAILHARBOR_DOMAIN_VERIFIED=true`; inbound webhook ingestion is blocked until `INBOUND_MAIL_ENABLED=true` in addition to its signature secret. It does not fabricate delivered status, inbox messages or mailbox balances.

## Current functionality and remaining Gmail-like scope

Implemented from the MailHarbor source and integrated into Minglora:
- Member-linked mailbox creation and editable address under the configured domain.
- Inbox, Sent, Starred, Spam, Trash and Archive folders.
- Server-side mailbox search, read/unread and star state, archive and trash actions.
- Plain-text message composition and delivery-state tracking.
- Transactional SMTP outbox, retry schedule and delivery worker.
- Signed, idempotent inbound webhook ingestion.
- Database-triggered notifications and authenticated WebSocket mailbox-change events.

Not yet implemented by the copied MailHarbor code: HTML/MIME rendering, attachments and malware scanning, labels, advanced Gmail-style search operators, contact management, filters/rules, forwarding, drafts autosave, IMAP/POP3, mobile push, spam classification and provider bounce/complaint event workflows. Those are not represented as working features in this integration.

## Verification

The repository CI includes a Node 24 job for the MailHarbor API and SSO tests, plus syntax checks for the Minglora proxy and integrated browser client. The successful deployment still depends on the external Render resources, private secrets, verified domain, SMTP and inbound provider setup above. A CI pass is not a production mail-delivery test.
