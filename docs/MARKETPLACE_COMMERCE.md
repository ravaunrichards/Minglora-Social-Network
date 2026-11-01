# Marketplace Commerce and Jobs

## Product boundary

Minglora Marketplace is a social-commerce and services platform. Jobs is a separate employer-to-candidate workflow and never uses the commerce payment ledger.

## Implemented runtime and database workflows

- Seller applications start pending. Moderators can review seller status and identity status with an audit reason; an application cannot approve itself.
- Product/service listings, discovery, saved listings and Inbox enquiries are part of the current browser/API workflow.
- Checkout quotes are calculated server-side from database-held listing prices, quantity, currency and seller-maintained fulfilment rates. Quotes are short-lived and informational only; the quote route does not reserve stock or take payment.
- Relational Supabase tables and database functions exist for carts, quote records, orders, seller sub-orders, idempotency keys and atomic inventory reservations. Order reads are available to buyer/seller participants. The order-creation function enforces provider, checkout, seller-payout, verified-seller and tax gates.
- The checkout-status API currently reports `orderCreationEnabled: false`. Thus the presence of order tables, an order RPC or buyer/seller order screens must not be represented as live checkout or completed order settlement.
- Service booking requests support seller acceptance/decline, buyer cancellation and participant confirmation after seller completion. They do not collect payment.
- Employer job-posting submissions are moderated before publication. Published roles can be searched; candidates can apply; employers can review, shortlist, reject or hire; candidates can withdraw or view their applications.

## Target transaction lifecycle

1. Seller applies; the platform verifies identity/business details, prohibited-goods compliance and payout eligibility.
2. Approved seller publishes an offer with truthful stock, currency, condition, service terms and fulfilment options.
3. Buyer discovers an offer, reviews seller/profile information and receives a server-calculated quote.
4. Before a live order can be created, the marketplace needs an approved provider contract, enabled buyer payment, a verified seller settlement route, supported shipping/collection rates and tax/duty rules.
5. Payment must be confirmed through a verified provider event. Browser redirects are never payment evidence. Provider event IDs and order idempotency keys must be unique.
6. Inventory is reserved transactionally and each seller receives a seller sub-order with its own fulfilment and financial breakdown.
7. Seller accepts, prepares and dispatches or provides the service. Tracking, collection proof or service completion is recorded.
8. Buyer confirms receipt or raises a return/dispute. Support reviews evidence and can trigger a provider-supported full/partial refund only after that capability is approved.
9. Balanced financial journals record gross, processor fee, marketplace fee, seller payable and refund adjustments.
10. Payouts are sent only through an approved provider route and reconciled against provider references. Retries must never duplicate transfers.
11. Reviews are limited to completed, verified purchases or services.

## Payment and custody safeguards

A quote is not an order, authorization, capture, proof of delivery or a promise that tax and delivery are final. Database code contains order creation and atomic inventory reservation primitives, but the application checkout-status response currently disables order creation. No buyer payment, seller balance, earnings or payout may be invented. Never call the feature escrow unless the provider and legal structure explicitly support escrow.

Marketplace-specific seller, quote, order, booking and Jobs actions use the Supabase Edge Function with normalized Postgres tables/RPCs. The general social-domain runtime still uses a durable single-row JSONB compatibility adapter; that legacy path is not suitable for independent high-concurrency writes or horizontal scaling. Migrations 029–038 are source-controlled; migrations 035–038 are applied to the active Minglora Supabase project and `minglora-runtime-state` is deployed at version 18.

## Fulfilment and tax safeguards

Pickup can be quoted without a delivery fee. Local delivery and shipping require a server-maintained seller rate. Taxes, customs, shipping insurance and cross-border restrictions must be calculated from buyer/seller jurisdictions and item classifications by approved rules or a trusted service. The server must not accept totals, fees, tax amounts, shipping amounts, seller status or payment status supplied by the browser.

## Jobs lifecycle

Employer submissions start in moderation review. Published roles can be filtered by category, location, work arrangement and employment type. Candidates submit a cover letter and Minglora profile; employers can review, shortlist, reject or hire. Candidates can withdraw. CV/resume upload, employer verification, interview scheduling, offer documents and payroll are separate workstreams and are not complete.

## Required production gates

- Migrations 029–038 and the corresponding Supabase Edge Function version 18 are verified in the active Minglora project.
- Complete provider marketplace approval and sandbox/production certification.
- Complete tax/duty and carrier-rate integrations for each launch jurisdiction.
- Verify seller KYC/business checks and secure verification-document storage.
- Implement provider webhook verification and end-to-end payment/payout reconciliation before enabling money movement.
- Validate returns/disputes, support SLAs, financial audit and backup/restore.
- Complete prohibited-product rules, abuse controls, privacy checks and accessibility testing.
