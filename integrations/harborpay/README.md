# HarborPay — Minglora financial-service integration

**Infrastructure decision:** HarborPay uses the existing Minglora Supabase project. Do not create a separate HarborPay Supabase project.

HarborPay remains a distinct financial product area and code module, but its React client and Express API share Minglora's Supabase Auth, user identities, profiles, Postgres database and project quota. Its payment-specific records live in dedicated tables in the same database:

- `payments`, `payouts`, `webhook_events`
- `merchant_accounts`, `merchant_members`, `merchant_customers`
- `orders`, `payment_links`, `account_applications`
- `minglora_link_handoffs`, `minglora_identity_links`

Minglora's existing social profiles and Auth users are the identity source. HarborPay's profile API maps to Minglora's `public.profiles`; it does not create a duplicate HarborPay profile table. Users launched from Minglora sign in with their existing Minglora credentials.

## Security and financial boundaries

- Keep PayPal client secrets, webhook secrets, Supabase service-role key and HMAC signing secret on the API server only.
- The browser uses the same public Minglora Supabase URL and publishable/anon key as the Minglora client.
- HarborPay API uses the same Minglora Supabase URL and service-role key as the Minglora backend.
- RLS is enabled on every HarborPay domain table. The API must enforce merchant membership and role checks because its service role bypasses RLS.
- PayPal payment state is provider-confirmed and webhook-reconciled. Browser redirects are not proof of payment.
- Payouts remain disabled until PayPal Payouts access and administrative approval are verified.
- No customer-held stored-value wallet, P2P transfer, escrow, or remittance is enabled by this integration. Do not show pretend balances or transaction activity.

## Deployment configuration

Set the HarborPay API's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the existing Minglora project's values. Set the HarborPay web build's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the same Minglora public URL/key. The API and web app can remain separate Render services; they must not use a second Supabase project.

See [the integration runbook](docs/INTEGRATION.md) and [source snapshot](source/README.md).
