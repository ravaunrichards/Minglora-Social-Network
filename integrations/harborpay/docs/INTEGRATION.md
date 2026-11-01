# HarborPay inside Minglora — integration and release boundaries

## Independence model

HarborPay is a first-class Minglora feature, but it is a separate financial system. Its React application, Express API, Supabase Auth project, Postgres database, provider credentials, financial records, operational tools, webhook handlers, release lifecycle, and regulatory gates are independently managed.

Minglora supplies its signed-in social-network session and presents the feature in its own navigation. HarborPay does not use the Minglora database, MailHarbor tables, Minglora Coins ledger, creator payout records, or Marketplace checkout records.

## User activation and data sharing

1. A signed-in Minglora member opens HarborPay.
2. Minglora displays a notice naming the exact data fields: Minglora account UUID, email address, and display name.
3. Nothing is sent until the member checks the approval box and presses Continue.
4. Minglora's server signs the exact JSON request body with HMAC-SHA256, a timestamp and a unique request ID. No secret is sent to the browser.
5. HarborPay checks the signature and timestamp, rejects requests older than 90 seconds, and stores only a hash of a randomly generated 256-bit single-use handoff code.
6. The one-time URL expires after ten minutes. HarborPay exchanges the code once and uses the name/email only to prefill registration; it does not automatically create a financial account.
7. The member registers/signs in to HarborPay using HarborPay Auth and confirms the HarborPay email.
8. HarborPay links the identities only if the verified HarborPay email matches the email in the consented handoff. Both external IDs are stored in HarborPay's database, with uniqueness constraints. A mismatch, expired code, duplicate link or replay fails closed.

The bridge never passes passwords, Minglora access/refresh tokens, social profile fields beyond the listed values, phone number, address, date of birth, identity documents, business ownership evidence, card details or bank credentials. No Minglora profile field is accepted as KYC or KYB evidence.

## Service endpoints

- Minglora browser calls its own authenticated POST /api/harborpay/launch.
- Minglora's server calls HarborPay POST /api/integrations/minglora/launch with the signed request.
- HarborPay web client exchanges POST /api/integrations/minglora/exchange with the single-use code.
- After HarborPay email confirmation, HarborPay calls its own POST /api/integrations/minglora/link with its HarborPay access token and the handoff token.
- HarborPay can inspect its own relationship using authenticated GET /api/integrations/minglora/status.

## Required deployment configuration

### Minglora server

- HARBORPAY_API_URL: HarborPay API origin, for example https://minglora-harborpay-api.onrender.com.
- HARBORPAY_WEB_URL: HarborPay web origin, for example https://minglora-harborpay-web.onrender.com.
- HARBORPAY_SSO_SECRET: a distinct random secret with at least 32 bytes.

### HarborPay API server

- MINGLORA_SSO_SECRET: exactly the same value as Minglora's HARBORPAY_SSO_SECRET.
- HARBORPAY_WEB_URL: exact HarborPay web origin used when creating the single-use launch URL.
- Its own SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, from HarborPay's dedicated Supabase project only.

### HarborPay web

- VITE_API_URL: HarborPay API origin; this is a build-time Vite variable.
- VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY: public values from HarborPay's own Supabase project only.

Do not reuse Minglora's project URL/key, MailHarbor database credentials, SESSION_SECRET, PayPal secrets, or marketplace partner credentials.

## Deployment and framing

The HarborPay web app is a separately hosted React/Vite SPA. For an embedded view, its static-site response headers must explicitly allow only the actual Minglora website origin in Content-Security-Policy: frame-ancestors. The Render Blueprint includes the current Render-hosted Minglora origin; change it to the actual production custom domain before production. Do not add a broad wildcard origin. Do not add X-Frame-Options: DENY or SAMEORIGIN while embedding. The Minglora page provides a new-tab fallback for browsers that partition/block embedded origin storage.

## Account types and feature scope

Personal, business, merchant and enterprise account categories are product scope. Each legal entity needs its own identity and ownership checks, account state, permissions, approval policies and financial limits. A Minglora creator/business badge does not create a verified HarborPay business.

Planned capabilities include person-to-person transfers, payment requests, receive money, bank/card funding, wallet accounts, withdrawals, merchant checkout and payment links, invoices, subscriptions, refunds, disputes, FX, supported international corridors, enterprise payment operations, tax/report exports, developer APIs and reconciliation. These must be delivered via real authorized providers and partner arrangements; listing them in scope does not mean they are currently active.

The implemented HarborPay client and API provide independent Supabase Auth sign-up/sign-in/password recovery, customer PayPal Orders checkout/capture, payment history, signed PayPal webhooks, a restricted admin payout endpoint, personal profile management, clickable Business/Merchant/Enterprise application flows saved to `account_applications`, distinct owner-controlled organization workspaces, merchant customer records, order records, payment-link records, refund/dispute record structures and the consent-based Minglora handoff/link flow. The Minglora page now checks the remote HarborPay health endpoint before enabling activation and reports whether the API is unreachable, the SSO bridge is unset or the database is missing. Merchant payment-link records can be created and disabled, but they are not public payable checkout URLs yet because merchant-specific PayPal onboarding/settlement has not been implemented. There is no customer-held stored-value ledger or P2P wallet transfer service.

## Verification required before release

- Test HMAC tampering, old timestamps, invalid secret, duplicate request IDs, expired links, replayed exchanges, cross-user email mismatch and duplicate identity linking.
- Verify all new HarborPay tables have RLS enabled and no direct client write grant; RPCs are service-role-only.
- Confirm HarborPay migrations are applied only to the dedicated HarborPay project.
- Run the HarborPay API tests, Web build, Minglora test suite, security/advisor checks and real browser iframe/new-tab tests.
- Test account signup, email confirmation, first-time account link and an existing HarborPay account link.
- Verify no data-sharing request can be triggered without the Minglora consent checkbox and server-side user session.
- Do not enable production money movement until relevant providers approve the merchant, the country/corridor operating model is legally reviewed, and all production controls are signed off.
