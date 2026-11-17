# Minglora AI email provisioning

## Architecture

Minglora provisions an **app-managed virtual mailbox** for a public AI identity on a Minglora-controlled email subdomain. The existing \`ai_network.ai_emails\` row remains the canonical address/identity registry. A separate private \`ai_network.ai_email_messages\` table stores inbound and outbound messages.

The provider adapter in \`backend/modules/ai-network/email-service.js\` uses Resend for domain capability checks, outbound delivery, inbound message retrieval and signed inbound webhooks. Resend domain-level receiving plus the Minglora webhook routes incoming messages to the correct AI identity. The local-part alias is derived from the AI username plus an identity UUID suffix, so each address is unique without allocating a human mailbox seat for each identity.

This is **not** a separate Google Workspace/Microsoft 365 mailbox, an IMAP/POP login or a Supabase Auth user. The app-managed inbox is accessed through Minglora. It is intentionally not described as a standalone external mailbox.

## Provider setup

Use the existing Minglora production web service and the existing Resend account/domain. Do not create another Render service, Supabase project, repository or human Auth account for an AI.

Set these values in the existing web service's private environment-variable manager:

| Variable | Value |
|---|---|
| \`MINGLORA_AI_EMAIL_PROVIDER\` | \`resend\` |
| \`MINGLORA_AI_EMAIL_DOMAIN\` | A Minglora-owned subdomain dedicated to AI mail, for example a domain you control under Minglora |
| \`MINGLORA_AI_EMAIL_FROM_NAME\` | \`Minglora AI\` or another approved sender display name |
| \`RESEND_API_KEY\` | A server-only Resend API key with the minimum permissions needed for sending, receiving-email retrieval and domain inspection |
| \`RESEND_WEBHOOK_SECRET\` | The signing secret shown by Resend when creating the inbound webhook |

Do not put secrets in GitHub, source code, \`.env.example\`, browser JavaScript, a public profile, SQL rows or a chat message. The code exposes only booleans indicating whether credentials are present; it never returns key material.

### Resend domain and inbound webhook

1. Add the chosen Minglora-owned subdomain in the existing Resend account.
2. Publish the exact DNS records Resend provides for that domain. The required values are account/domain-specific; copy them from the Resend dashboard rather than guessing.
3. Wait for Resend to report the domain as \`verified\`.
4. Enable both the \`sending\` and \`receiving\` capabilities for the domain.
5. Create a webhook for the \`email.received\` event. Set its URL to \`https://<existing-Minglora-API-host>/api/ai-network/email/webhook\`.
6. Copy the webhook signing secret to \`RESEND_WEBHOOK_SECRET\` in the existing Minglora web service's private environment settings.
7. Deploy the code only after the database migration and server/runtime changes have been reviewed and approved. Restart/redeploy the existing service so the private variables are loaded.
8. In the Minglora AI Network admin center, check Email Provisioning status. It must report \`ready\` before mailbox provisioning is enabled.

The provider domain status endpoint is read-only. It does not add DNS records, create a Resend domain, switch on capabilities or change secrets.

## Mailbox lifecycle

- An AI identity starts with no mailbox unless an address was explicitly recorded as metadata.
- The administrator selects an identity and requests provisioning.
- The backend confirms that the Resend domain is verified, both sending and receiving are enabled, and the exact inbound webhook is enabled for `email.received`, then creates/reuses an owner-scoped email record.
- The address is generated from a sanitized username and the full 128-bit stable AI identity UUID suffix. It is marked `unverified` at the address level: a verified domain proves control of the domain, not individual mailbox ownership.
- The mailbox is an internal Minglora inbox mapped to the verified domain's inbound routing. It is not a provider-issued individual account. Domain verification and address-level verification remain distinct statuses.
- Incoming \`email.received\` webhook events are accepted only after validating the Svix signature over the raw request body and timestamp. Minglora then retrieves the authoritative inbound message from Resend and persists it idempotently.
- Outbound messages are stored first with a stable client idempotency key. Resend sends with a stable provider idempotency key, and the result is written back to the same message row. A retry with the same request key does not intentionally create a second provider send.
- Only the authenticated designated Minglora administrator can provision, read, or send through the admin API. The inbox UI displays sent/received records and allows marking inbound messages as read.
- Message bodies and attachment metadata are private server-side data. No public profile exposes mailbox messages.

## API surface

All management routes below remain behind Minglora's existing designated-owner/MFA admin gate.

- \`GET /api/ai-network/email/status\`
- \`GET /api/ai-network/identities/:identityId/email\`
- \`POST /api/ai-network/identities/:identityId/email/provision\`
- \`GET /api/ai-network/identities/:identityId/email/inbox?email_id=<emailId>&limit=30&offset=0\`
- \`POST /api/ai-network/identities/:identityId/email/send\`
- \`POST /api/ai-network/identities/:identityId/email/messages/:messageId\`

Resend sends inbound \`email.received\` events to the separate public webhook route:

- \`POST /api/ai-network/email/webhook\`

That endpoint does not use an unauthenticated public mailbox identifier. It verifies the provider signature and fetches the full message from Resend before calling the private Supabase runtime. The runtime accepts actorless ingestion only when the server passes its verified-webhook flag through the internal runtime authentication channel.

## Database and security

The additive migration extends the existing \`ai_network.ai_emails\` table and adds \`ai_network.ai_email_messages\`. It enables RLS, revokes direct \`anon\`/\`authenticated\` access and grants database operations only to \`service_role\`. The RPC is \`SECURITY INVOKER\`, uses an empty \`search_path\`, and is executable only by \`service_role\`. Owner-scoped actions verify the AI identity belongs to the requesting Minglora profile. Webhook ingestion requires the verified-webhook contract.

No Supabase Auth user is created for an AI. Provider secrets are never stored in AI profiles, mailbox rows or Git. The deployment environment remains the secret boundary.

## Activation and acceptance gates

The feature branch contains the provider adapter, SQL migration, Edge Function dispatch, API routes, admin UI and automated tests. **The production migration has not been applied and the Edge Function/web service have not been deployed by this change.** No Resend domain has been verified by this code change, and no live email was sent or received.

Before calling the feature production-ready:

1. Review/merge the code and explicitly approve the additive migration.
2. Configure the existing service environment with a real Resend key, a verified Minglora-owned domain and webhook secret.
3. Deploy the updated existing Edge Function and existing web service (no duplicate services).
4. Verify \`/email/status\` returns \`ready\` without exposing secrets.
5. Provision one real test AI identity, confirm the mailbox and email row in the existing Supabase project, send to a controlled test recipient, reply to it, and verify inbound delivery, read state and retry idempotency.
6. Verify failed-domain, bad-signature, duplicate-webhook, provider-timeout and unauthorized owner cases fail closed.
7. Record the evidence and update the implementation tracker only after CI and end-to-end acceptance pass.

Until these gates pass, email provider activation and production mailbox operation remain **blocked / not verified**, even though the branch implementation is present.
