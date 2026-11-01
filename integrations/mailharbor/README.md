# MailHarbor inside Minglora

MailHarbor is a built-in Minglora feature, not a separately deployed product. The complete source is retained under `source/`; the member-facing client is served by Minglora at `/mailharbor/index.html`.

## Single-service architecture

- Minglora remains the only public web service.
- MailHarbor's Express API starts on `127.0.0.1:3211` inside the Minglora process. It is not exposed as a second Render service.
- The Minglora API authenticates the member using the existing Minglora session, then signs the internal request with HMAC-SHA256. The signature covers the timestamp, HTTP method, exact API path/query, Minglora member ID and request-body hash. Signatures expire after 120 seconds.
- The same private `MAILHARBOR_SSO_SECRET` is used by the Minglora proxy and embedded MailHarbor API. There is only one deployment, so the secret is configured once on the Minglora Render service.
- The MailHarbor delivery worker runs in the same Node process.
- MailHarbor's authenticated WebSocket handler attaches to Minglora's existing public HTTP server at `/ws`.
- MailHarbor owns its mailbox tables (`mail_users`, `mail_messages`, `mail_outbox`, and related tables) in the **existing Minglora Supabase Postgres project**. These tables are separate from Minglora's social-network state and protected from public Supabase roles. No extra Supabase project or Render database is used.

## Existing Minglora Render service settings

Configure these values on the existing `minglora-social-network` service:

| Variable | Value |
|---|---|
| `MAILHARBOR_API_URL` | `http://127.0.0.1:3211` |
| `MAILHARBOR_SSO_SECRET` | Private random secret, minimum 32 bytes |
| `MAILHARBOR_DATABASE_URL` | Minglora's existing Supabase Postgres **session-pooler** connection string for project `gzycobgbasnqqhnympkr` |
| `DATABASE_SSL` | `true` |
| `PG_POOL_MAX` | `5` |
| `MAILHARBOR_INTERNAL_PORT` | Reserved; runtime currently binds to `3211` |

The Postgres connection must point to the existing Minglora project, not another database. Use the Supabase session pooler on port 5432 so the database LISTEN/NOTIFY realtime listener can hold its session. The connection string requires the database password configured for the existing Minglora project; do not put that password in Git or source files.

The main Minglora service already has its own Supabase state gateway for social-network state. MailHarbor uses a direct PostgreSQL connection to the same underlying project because its mail outbox transactions, worker locks and LISTEN/NOTIFY events require Postgres semantics. The two data models remain separate.

## Mail transport and domain activation

The embedded MailHarbor API remains fail-closed until real mail transport is configured.

- `MAILHARBOR_MAIL_DOMAIN`: a domain owned by Minglora and used for member email addresses.
- `MAILHARBOR_DOMAIN_VERIFIED=false`: keep false until the mail provider verifies domain ownership and sender DNS.
- `INBOUND_MAIL_ENABLED=false`: keep false until inbound MX routing and the signed webhook are verified.
- `INBOUND_WEBHOOK_SECRET`: a separate private random webhook HMAC secret.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`: actual outbound provider details.

The mail provider must support outbound delivery and route inbound messages to Minglora's signed webhook endpoint `/api/webhooks/inbound`. Publish only the exact MX, SPF, DKIM and DMARC records issued by that provider. Do not set the verification or inbound flags to true before the provider and DNS checks succeed.

## Implemented capabilities

- Minglora single sign-on and per-member mailbox provisioning.
- Inbox, Sent, Starred, Spam, Trash and Archive folders.
- Search, read/unread and star actions, archive and trash.
- Plain-text compose and delivery-state tracking.
- Transactional SMTP outbox with retry worker.
- Signed, idempotent inbound webhook ingestion.
- PostgreSQL notification events and authenticated realtime WebSocket updates.

Not yet implemented by the copied MailHarbor code: HTML/MIME rendering, attachments and malware scanning, labels, advanced search operators, contacts, filters/rules, forwarding, drafts autosave, IMAP/POP3, mobile push, spam classification and bounce/complaint event workflows. These are not represented as live features.

## Runtime verification

The Minglora Render deployment must show the embedded MailHarbor runtime ready, and the internal API must return healthy status through the authenticated Minglora proxy. Mailbox provisioning and message sending remain disabled until the database, mail domain and actual SMTP credentials are configured. A successful web-service deployment alone is not proof of external mail delivery.
