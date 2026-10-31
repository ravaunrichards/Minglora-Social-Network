# Marketplace Commerce and Jobs

## Product boundary

Minglora Marketplace is a social-commerce and services platform, not merely a listings page. It connects seller onboarding, catalogues, discovery, checkout preparation, orders, fulfilment, buyer protection, returns, accounting and payouts. The Jobs area is a separate employer-to-candidate workflow and never uses the commerce payment ledger.

## Implemented in this change

- Seller application validation and a persisted application workflow. New applications start as pending; a seller cannot approve themselves or submit payout account details through a public profile endpoint.
- Server-calculated, short-lived checkout quotes for physical products. Quantities and prices are re-read from listings, self-purchases and overselling are rejected, mixed-currency carts are rejected, and delivery or shipping requires a seller-side rate rather than a client-supplied amount.
- Quotes are informational only. Checkout is blocked while provider marketplace approval, tax/duty calculation and a supported seller settlement arrangement are unavailable. No buyer payment, seller balance or payout is invented.
- Service booking requests with seller acceptance/decline, buyer cancellation and buyer confirmation after provider completion.
- Employer job-posting submissions, moderation before publication, applicant submissions, employer review decisions and applicant withdrawal.
- A normalized Supabase schema for seller verification, carts, orders, seller sub-orders, immutable payment evidence, webhook idempotency, double-entry ledger, fulfilment, service bookings, disputes, returns, payouts, verified reviews and job applications.

## Transaction lifecycle (target)

1. Seller applies; platform checks identity/business details, prohibited goods, policies and payout eligibility.
2. Approved seller publishes an offer with truthful stock, currency, condition, service terms and fulfilment options.
3. Buyer discovers an offer, checks seller/profile/reviews, adds items and receives a server-calculated quote.
4. Before a live order can be created, the marketplace must have an approved provider contract, an enabled payment method, tax/duty rules, seller settlement rules and a server-side shipping/collection quote.
5. Payment is confirmed through a verified provider event. Browser redirects are not payment evidence. Provider event IDs and order idempotency keys are unique.
6. Inventory is reserved transactionally. Each seller receives a seller sub-order with its own fulfilment and financial breakdown.
7. Seller accepts, prepares and dispatches or provides the service. Tracking, collection proof or service completion is recorded.
8. Buyer confirms receipt or raises a return/dispute. Support can review evidence, make a reasoned decision and trigger a provider-supported full/partial refund.
9. A balanced journal records gross, processor fee, marketplace fee, seller payable and refund adjustments. Seller payable becomes payout-eligible only under the approved provider and marketplace terms.
10. A payout is sent using an approved provider route, reconciled against its provider reference and recorded with success/failure reason. Retries use idempotency and never duplicate a transfer.
11. A review can be published only against a completed, verified purchase or service.

## Payment and custody safeguards

A checkout quote is not an order, an authorization, a capture or a promise that tax and delivery have been calculated. Current public application persistence is a JSONB compatibility document and is not suitable for concurrent stock reservations, a financial ledger, multiple independent workers or horizontal scaling. The normalized migration is a schema foundation; the present Node route layer still needs a transactional repository/RPC adapter before production commerce writes are enabled.

The existing PayPal API utility used by other Minglora flows is not evidence of an approved marketplace split-settlement product. Live marketplace processing must stay disabled until the payment provider confirms in writing the platform's marketplace model, merchant onboarding, buyer countries/currencies, seller payouts, fees, refunds, disputes, chargebacks, settlement timing and permitted custody/hold arrangements. Never call the feature escrow unless the provider and legal structure explicitly support escrow.

## Fulfilment and tax safeguards

Pickup can be quoted without a delivery fee. Local delivery and shipping require a server-maintained seller rate. Taxes, customs, shipping insurance and cross-border restrictions must be calculated from buyer/seller jurisdictions and item classifications by approved rules or a trusted service. The server must not accept totals, fees, tax amounts, shipping amounts, seller status or payment status supplied by the browser.

## Jobs lifecycle

Employer submissions start in moderation review. Published roles can be filtered by category, location, work arrangement and employment type. Candidates submit a cover letter and Minglora profile; employers can review, shortlist, reject or hire. Candidates can withdraw. CV upload, employer identity verification, interview scheduling, offer documents and payroll are separate workstreams and are not represented as complete in this first vertical slice.

## Required production gates

- Transactional Postgres repository and migration verification on a disposable project.
- Provider marketplace approval and sandbox/production certification.
- Distributed idempotency, inventory locking, webhook signature verification and reconciliation.
- Seller KYC/business checks and secure verification-document storage.
- Tax/duty and carrier-rate integrations for each launch jurisdiction.
- Return/dispute operations, support SLAs, financial audit and backup/restore tests.
- Abuse controls, prohibited-product rules, privacy checks and accessibility testing.
