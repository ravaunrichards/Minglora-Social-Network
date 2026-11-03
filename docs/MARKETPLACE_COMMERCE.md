# Marketplace Commerce, Payments and Jobs

## Product boundary

Minglora Marketplace is a social-commerce and services platform. Jobs is a separate employer-to-candidate workflow and never uses the commerce payment ledger.

## Current implemented workflows

- Product/service listings, seller profiles, seller applications, moderator identity/business review and audit reasons.
- Persistent buyer cart, quantity and fulfilment changes, item removal, same-currency validation, server-side listing/stock checks and per-seller order grouping.
- Server-calculated expiring checkout quotes, buyer/seller order views, seller sub-orders, order idempotency, inventory reservation, unpaid-order cancellation/expiry and fulfilment states.
- PayPal Business seller referral onboarding with explicit data-sharing consent and server-side verification of merchant ID, tracking ID, granted payment/refund/partner-fee/delayed-disbursement permissions, verified email and payment-receivable state.
- Server-side PayPal hosted checkout order creation and capture, single-seller delayed settlement, provider transaction verification and partial-capture reconciliation primitives.
- Signature-verified PayPal webhooks for seller consent/onboarding changes, capture completion/refund and seller payout events. Webhook processing is idempotent, audited and retryable after a five-minute stale-processing lease.
- Seller payout list and release request after delivery/completion. A captured amount is a seller payable, not a confirmed payout.
- Refund requests, moderator approval, provider refund submission/confirmation, seller payable rebalancing and payout re-hold.
- Immutable balanced financial journals, currency-aware snapshots, moderator internal reconciliation and moderator PayPal provider-record reconciliation.
- Verified-purchase reviews, service appointment workflows and the separate moderated Jobs area.

## What is still disabled

The buyer/seller routes and workflow code are present, but production payment activation remains false in the live Minglora database:

| Gate | Current value |
|---|---|
| PayPal Marketplace approval | Pending |
| Buyer checkout | Disabled |
| Seller payouts | Disabled |
| Tax/customs calculation | Disabled |
| PayPal delayed disbursement | Disabled |
| Advanced card fields | Disabled |

A quote is informational until all blockers are satisfied. It does not reserve stock, authorize a buyer, capture funds or prove payment. Order creation rejects quotes with blockers. Browser redirects are never treated as payment evidence.

## Currency and card rules

- PayPal's current Orders REST transaction currency allow-list excludes JMD. A Jamaica-dollar listing is therefore not directly chargeable as JMD on the current integration. A verified FX rate/quote into an allowed currency, a transparent JMD display equivalent and a rate expiry are required before JMD checkout can be opened.
- Standard PayPal Checkout can display PayPal-supported basic card methods where eligible. Jamaica is eligible for Business sellers using standard PayPal Checkout and is listed for PayPal payouts. Jamaica is not listed for Expanded Checkout. Custom branded advanced card fields are not the first-launch card path.
- The app uses a separate Marketplace PayPal integration and never falls back to creator PayPal credentials.

## Seller settlement safeguards

PayPal's delayed-disbursement feature requires approved partner status and seller permissions DELAY_FUNDS_DISBURSEMENT and PARTNER_FEE. Funds can be automatically disbursed after 28 days. Minglora may request a referenced payout after delivery/completion but does not mark it paid until a successful provider response or verified PayPal webhook supplies an accepted provider reference.

Mixed-seller carts are split into individual seller quotes/orders. Combined multi-merchant delayed settlement remains disabled until the whole merchant-specific identity and settlement path is approved and tested with PayPal.

## Database migrations and production deployment

Migrations 029–058 are source-controlled and the live Minglora Supabase database has applied migrations through 058. Migrations 046–058 extend the original Marketplace schema with balanced-journal triggers, separate payout confirmation, partial-capture recovery, tax/currency guards, buyer cart access controls, refund processing and payout rebalancing, currency-aware external reconciliation and webhook retry leases.

The minglora-runtime-state Edge Function is deployed at version 39. It authenticates calls from the Minglora API gateway with its own secret digest. The public webhook is POST /api/webhooks/marketplace-paypal; PayPal transmission headers and payload are verified through PayPal's webhook verification API before processing.

## Financial reconciliation

The moderator desk has two tools:

1. Internal reconciliation: journal/entry counts, equal debit/credit checks, missing capture/payout journals and unconfirmed paid payout states, grouped by currency.
2. Provider-record reconciliation: verifies each PayPal capture and referenced-payout item by ID within a maximum 31-day date range, compares status/currency/amount/fees/net and records a run plus exceptions.

The second check is not a PayPal balance report, downloadable settlement statement or bank reconciliation. The live Marketplace currently has zero captures/payouts; an all-zero internal result is an empty-system integrity check, not a claim of external funds verification.

## Competitor-inspired features: delivery plan

The target adaptations are original Minglora features inspired by established marketplace patterns, not copies of proprietary source, graphics or branding.

- Amazon/Walmart: verified seller stores, reviews, shipment/collection tracking, clear returns and buyer protection.
- Temu/Wish: honest deals/vouchers and personalized discovery (never fake scarcity, countdowns, discounts or sales).
- AliExpress/Alibaba: international suppliers, wholesale tiers, landed-cost estimates and customs disclosures.
- eBay: Make Offer, auctions and authenticated categories.
- Etsy: handmade/custom orders, personalization and digital goods.
- Depop/Vinted/Mercari: ReLoved resale, condition grading, same-seller bundles and combined shipping.
- SHEIN: style collections, customer photo/video reviews, trending discovery and disclosed rewards.
- TikTok Shop/Whatnot: shoppable short video, affiliate attribution, live product demos and live auctions.
- Shopify: advanced seller storefront, catalog import, fulfilment and order analytics.
- Rakuten: transparent cashback/referral rewards.

Priority: P0 payment/tax/refund/inventory/security; P1 bundles/offers/shipping/reviews/returns/rewards; P2 shoppable video/LIVE/auctions/affiliates/ads; P3 AI recommendations/visual search/global wholesale. Future roadmap entries are not represented as implemented.

## Jobs lifecycle

Employer submissions start in moderation review. Published roles can be searched; candidates can apply; employers can review, shortlist, reject or hire; candidates can withdraw. CV upload, employer verification, interview scheduling, offer documents and payroll remain separate workstreams.
