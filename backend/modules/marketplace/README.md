# Minglora Marketplace

## Current implementation

The Marketplace is a social-commerce, services and jobs platform. Its current runtime includes:

- Product and service listings, seller-owned listing controls, discovery filters, saved listings and Inbox enquiries.
- Seller application and moderation workflows, identity/business review audit records and a separate PayPal Business onboarding flow with explicit data-sharing consent.
- Persistent buyer carts with quantity and fulfilment selection, same-currency validation, live listing/stock checks, per-seller cart grouping and server-calculated short-lived quotes.
- Buyer/seller orders and seller sub-orders, idempotent order creation, transactional inventory reservation, unpaid-order cancellation/expiry, fulfilment and participant order views.
- Hosted PayPal Checkout order preparation and buyer return/capture endpoints, with server-side order creation/capture, seller-specific Auth Assertions, capture amount/currency/fee checks and partial-capture reconciliation primitives.
- Signature-verified Marketplace PayPal webhooks for seller consent changes, onboarding completion, capture completion, refunds and seller payout status; event records support deduplication, retries and stale-worker recovery.
- Seller payout queue/status views and a release request after seller-order delivery/completion. The system marks a payout paid only after PayPal success is confirmed by provider response or a verified webhook.
- Refund request, moderator approval, PayPal refund submission/confirmation and refund-related seller payable/payout journal adjustments.
- Immutable balanced financial journals, deferred debit/credit and currency checks, capture/payout/refund ledger posting, per-currency internal snapshots and moderator-triggered PayPal transaction/payout-item reconciliation.
- Verified-purchase reviews, seller public profiles, services/appointment requests and the separate moderated Jobs workflow.

## Payment status: implemented flow, production gated

The application contains public buyer and seller routes and browser controls for checkout, seller onboarding, refunds and payout requests. Those routes do not make the production Marketplace live by themselves.

The active Minglora database still has:
- marketplace_approval_status = pending
- checkout_enabled = false
- payouts_enabled = false
- tax_calculation_enabled = false
- delayed_disbursement_enabled = false
- card_payments_enabled = false

The checkout quote function deliberately returns an informational quote with blockers until tax/duty, seller payout onboarding, provider approval and currency requirements are met. It does not reserve stock, authorize or capture funds. Buyer checkout and seller disbursements remain disabled. No real payment or payout has been claimed as completed.

## Database and Edge Function

The Marketplace relational migrations 029–058 are source-controlled. Migrations 046–058 are forward-only financial hardening and commerce additions; do not replay earlier migrations against an already-migrated database. The active Minglora Supabase project has migrations through 058 applied.

The deployed minglora-runtime-state Edge Function is version 39. It has its own request authentication for the Minglora server-to-function gateway. Its public webhook branch verifies PayPal signatures with the Marketplace-specific webhook ID before persisting or applying a provider event.

Critical database safeguards include:
- Journal headers and entries are immutable; corrections use reversing journals.
- Deferred constraint triggers require at least two entries, one currency per journal and equal debit/credit totals.
- A capture posts seller payable and platform/processor fee allocations. A capture never marks a seller payout paid.
- A payout can become paid only with a provider disbursement ID and an explicit successful provider status.
- Refund finalization rebalances/reholds seller payouts and creates the corresponding journal adjustments.
- Financial tables are restricted to the service role except narrow owner-read policies such as seller-owned payout visibility. Buyer carts are private and accessed through authenticated Marketplace routes.

## PayPal onboarding, checkout and settlement

Marketplace PayPal credentials are separate from creator PayPal credentials. Set these as server-side Edge Function secrets and the matching private Render server environment variables only after PayPal provides partner credentials:

- MARKETPLACE_PAYPAL_MODE (sandbox or live)
- MARKETPLACE_PAYPAL_API_BASE_URL (normally blank; the base URL follows the mode)
- MARKETPLACE_PAYPAL_CLIENT_ID
- MARKETPLACE_PAYPAL_CLIENT_SECRET
- MARKETPLACE_PAYPAL_PARTNER_MERCHANT_ID
- MARKETPLACE_PAYPAL_ATTRIBUTION_ID
- MARKETPLACE_PAYPAL_WEBHOOK_ID
- MARKETPLACE_PAYPAL_ENABLED
- MARKETPLACE_PAYPAL_PARTNER_APPROVED
- MARKETPLACE_PAYPAL_DELAYED_DISBURSEMENT_APPROVED
- MARKETPLACE_PAYPAL_LIVE_APPROVED (live only)
- MARKETPLACE_PAYPAL_ADVANCED_CARDS_APPROVED (only if separately underwritten and country eligible)

All enable/approval flags in .env.example default to false. Do not reuse the creator integration's PayPal credentials.

Minglora seller approval and identity/business verification are independent of PayPal onboarding. PayPal onboarding verifies the seller's merchant integration, permissions, confirmed email and payment-receivable status; it does not replace Minglora's own seller review.

For every seller, PayPal must grant the PAYMENT, REFUND, PARTNER_FEE and DELAY_FUNDS_DISBURSEMENT features used by the current flow. The buyer order is created with delayed disbursement and the platform fee. The seller's funds can be automatically disbursed by PayPal after 28 days; the seller dashboard must not promise immediate payout. A manual referenced-payout request is made only after the platform's delivery/completion gate passes. Minglora reconciles the PayPal response and webhook before recording paid.

Jamaica is eligible for PayPal Business sellers using standard PayPal Checkout and for PayPal payouts. Jamaica is not listed for Expanded Checkout. Standard Checkout can display PayPal-supported basic card options where eligible; custom branded advanced card fields are not the launch assumption. See PayPal seller onboarding eligibility, PayPal delayed disbursement and PayPal supported payout countries:
https://developer.paypal.com/platforms/seller-onboarding
https://developer.paypal.com/platforms/checkout/delayed-disbursement/
https://developer.paypal.com/payouts/supported-features/

JMD is not included in the current PayPal Orders REST currency allow-list used by this integration. A Jamaican-dollar listing cannot be charged as JMD through this path. A trusted, timestamped FX quote into a PayPal-supported transaction currency, clear buyer-facing JMD equivalent and expiry/rate-lock rules are required before that order can be made payable. Do not invent an exchange rate or silently round a conversion.

The present checkout flow splits a mixed-seller cart into individual seller orders. Combined multi-merchant delayed settlement remains disabled until PayPal explicitly approves and the exact multi-merchant delayed payout/identity workflow has been tested end to end.

## Webhook and reconciliation operations

Register the exact public endpoint: POST /api/webhooks/marketplace-paypal

Configure its Marketplace-specific webhook ID and subscribe to seller partner-consent revocation/onboarding completion, capture completion/refund, and payout item success/failure/block/return/unclaimed/held events. PayPal signature verification must succeed before an event is stored or used.

The moderator desk provides:
- Internal ledger reconciliation by currency (journal balance, capture-journal presence, payout-journal presence and unconfirmed paid payout states).
- Provider record reconciliation for a selected date range up to 31 days, querying PayPal capture and payout item details by provider reference.
- Exception details when provider and ledger records disagree.

Provider API lookups are not a downloaded PayPal balance statement or bank statement. A full external settlement/bank statement reconciliation remains an operational finance task. The live database currently has no real Marketplace captures or payouts, so the present clean result is a zero-activity internal check, not proof of historical provider settlement.

## Required production activation checklist

1. Obtain written PayPal Marketplace partner approval and approval for PARTNER_FEE and delayed disbursement.
2. Confirm Jamaican Business seller eligibility and PayPal seller-onboarding certification; keep Casual sellers blocked for the Jamaica launch.
3. Add Marketplace-only credentials, attribution ID and webhook ID as secrets in both Edge Function and server environments.
4. Register and verify the Marketplace webhook endpoint; test signature failure, duplicate event, transient provider error, retry and stale processing lease recovery.
5. Configure a lawful tax/duty rules engine and approved shipping/fulfilment rates for launch jurisdictions. The tax gate is intentionally false today.
6. Implement and approve a supported-currency/FX workflow for JMD listings; do not present an unpayable JMD amount as a payable PayPal total.
7. Run PayPal sandbox positive/negative tests for seller onboarding, single-seller hosted checkout, basic-card availability where PayPal offers it, partial capture, cancelled order, capture timeout, webhook retry, refund, seller delivery gate and payout success/failure/hold.
8. Independently reconcile provider transaction IDs and payout item IDs; complete backup/restore, financial controls, privacy/accessibility and operational incident reviews.
9. Only then enable marketplace approval, tax, delayed-disbursement, checkout and payout DB flags and the corresponding provider secrets. Live mode requires separate live approval.

## Competitor-inspired adaptation roadmap

The current Marketplace keeps original Minglora branding and code. The benchmark concepts are features to implement, not copied proprietary UI or assets:

- Amazon/Walmart: trusted seller stores, verified reviews, shipment/collection tracking, returns and clear buyer protection.
- Temu/Wish: deals, vouchers and personalized discovery with truthful prices/stock and no fake countdowns or scarcity.
- AliExpress/Alibaba: international supplier discovery, wholesale tiers and transparent customs/landed-cost estimates.
- eBay: Make Offer, auctions and authenticated resale categories.
- Etsy: handmade/custom products, personalized orders and digital goods.
- Depop/Vinted/Mercari: ReLoved second-hand listings, condition grading and combined same-seller bundles.
- SHEIN: style collections, customer media reviews, trending discovery and transparent rewards.
- TikTok Shop/Whatnot: shoppable short video, creator affiliate links, live product demonstrations and live auctions.
- Shopify: richer seller store controls, order analytics, catalog imports and fulfilment integrations.
- Rakuten: clearly disclosed cashback/referral rewards.

Suggested delivery order: P0 payments/orders/tax/refunds/inventory/security; P1 bundles/offers/shipping/reviews/returns/rewards; P2 shoppable video/LIVE/auctions/affiliates/ads; P3 AI recommendations/visual search/global wholesale. These future items are not complete merely because they appear in the roadmap.
