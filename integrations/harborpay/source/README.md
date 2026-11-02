# HarborPay source snapshot — shared Minglora database

This folder contains the HarborPay React client and Express API source. It is deployed as a feature module of Minglora and **must use the existing Minglora Supabase project**.

## Shared Supabase configuration

- API: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must match the existing Minglora backend project.
- Web: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must match the Minglora client public configuration.
- Auth: use the same Minglora `auth.users` identities. When launched from Minglora, sign in with the existing Minglora email and password; do not create a second account.
- Profiles: HarborPay maps its personal profile view to Minglora's `public.profiles` table. Do not create a second profiles table.

The canonical HarborPay database objects are provisioned by the Minglora database migrations and live alongside Minglora's social, creator and marketplace tables. The historical migrations in this source snapshot describe the original standalone HarborPay development database only; **do not apply them to the shared Minglora project**.

## Operational boundaries

PayPal provider secrets and the Supabase service-role key remain server-only. The web client receives only the shared public Supabase URL and publishable/anon key. RLS is enabled on HarborPay domain tables; server routes must continue checking the authenticated user and merchant role before privileged operations.

The feature does not claim to be a licensed stored-value wallet, does not create fake balances, and does not enable P2P transfers or international remittance. PayPal checkout/capture and webhook reconciliation require configured provider credentials and verified webhook setup. Payouts remain disabled until explicitly approved and enabled.
