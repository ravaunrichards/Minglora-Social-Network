# Minglora Marketplace

## Current implementation

The browser app and server API now cover more than catalogue listings:

- Product and service listings, seller-owned edits/status controls, discovery filters, saves and Inbox enquiries.
- Seller applications with pending/approved/rejected/suspended states, identity-status review and moderator audit reasons.
- Server-calculated, short-lived informational checkout quotes. Listing prices, quantities, ownership, seller status, currencies and seller-maintained fulfilment rates are checked by the database; the browser cannot supply a trusted order total.
- Service appointment requests with seller acceptance/decline, participant cancellation and service-completion confirmation.
- Buyer/seller order list and detail routes, cancellation route, seller-split order tables and an idempotent order-creation database function.
- Relational schema and Supabase Edge Function actions for seller review, checkout quotes, orders, service bookings and saved listings.
- Atomic inventory reservation and guarded unpaid-order inventory expiry database functions.
- A separate Jobs workflow: moderated employer vacancy submissions, searchable published jobs, candidate applications, employer review decisions and candidate withdrawal.

## Payment and order status

A checkout quote is **informational only**. It does not reserve stock, authorize a payment or collect money. The checkout-status API currently reports `orderCreationEnabled: false`. The database order-creation path is present but rejects order creation unless the marketplace provider is approved, checkout and seller payouts are explicitly enabled, the quote has no blockers and includes a verified tax calculation, and every seller remains approved, identity-verified and payout-onboarded.

The latest application does not yet perform production Marketplace payment capture, settlement, seller payouts, refunds or chargeback handling. Never display a fake paid state, balance, seller earning or payout. Do not describe the service-request flow as a paid appointment or the order schema as completed payment processing.

## Safety and operational gates

- Provider marketplace approval and written confirmation of the supported merchant onboarding and seller-settlement model.
- Tax/duty calculation for supported jurisdictions and currencies.
- Approved fulfilment/shipping rates, delivery rules and cross-border restrictions.
- Verified seller identity/business and payout onboarding.
- Payment webhook verification, provider reconciliation, refund/return/dispute operations and financial audit.
- Backup/restore tests, migration verification, privacy/accessibility review and production operational readiness.

The repository contains Marketplace migrations 029–034, including seller and checkout configuration, quote/order data, seller sub-orders, immutable financial evidence, inventory reservations, idempotency, fulfilment, bookings, returns, payouts, reviews and job applications. Marketplace-specific server actions use the Supabase Edge Function and normalized Postgres/RPC path. Verify these migrations and the matching Edge Function are deployed to the active Supabase project; a migration file in GitHub alone does not prove deployment.

General social-domain persistence still has a durable single-row JSONB compatibility adapter and remains a separate scaling constraint. Marketplace's relational path does not make every Minglora data domain horizontally scalable.
