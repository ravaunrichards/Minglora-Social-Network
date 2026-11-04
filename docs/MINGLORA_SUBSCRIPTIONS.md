# Minglora Subscriptions

## Approved product rules
- Any member may apply to become a subscription creator.
- Minglora approval is required before paid subscriptions can be enabled. Verification is a review signal, not a bypass for a rejected or suspended account.
- First release: one monthly tier per creator, creator-selected price within server-side limits.
- Fixed revenue split: 50% creator / 50% Minglora, calculated from settled amounts in integer minor currency units.
- Only verified provider webhooks may activate subscriptions or unlock paid content. Browser redirects never grant access.
- Cancellation stops the next renewal; access remains through the paid period. Refunds and chargebacks require reversing ledger entries.

## Member experience
- Creator profile Subscribe button with price, benefits, renewal and cancellation terms.
- Provider-hosted checkout; Minglora never stores card or PayPal credentials.
- My Subscriptions with status, renewal date, cancellation and payment history.
- Optional subscriber badge, subscriber-only posts/photos/videos, subscriber-only LIVE and opt-in subscriber chat. Existing block/report controls remain available.

## Creator Studio
- Application and review status; monthly price, description and benefit editor.
- Enable/disable subscriptions and subscriber features.
- Subscriber list and earnings dashboard showing gross settled, creator share, Minglora share, refunds, pending settlement and payout status.
- Payouts are never marked complete until confirmed by the payout provider.

## Admin and financial safety
- Approve, reject or suspend applications with reviewer and reason audit.
- Idempotent provider event processing; unique event IDs.
- Never trust client-supplied amount, currency, split, subscription status or access claims.
- Audit approvals, price changes, refunds, chargebacks and payouts. Apply tax, age, identity and payout eligibility checks where required.

## Release gate
The migration adds the provider-neutral data model and an RLS baseline. The current repository has no configured recurring-billing provider credentials or verified webhook implementation. Live paid subscriptions must not be advertised as active until a provider (PayPal Subscriptions or Stripe Billing) is configured, webhook signature verification and idempotent processing are implemented, creator payout onboarding is ready, and sandbox end-to-end tests pass. No fake checkout success or client-side entitlement is permitted.

## Remaining implementation sequence
1. Creator application and admin approval endpoints.
2. Creator tier management with server-side price validation.
3. PayPal or Stripe checkout, cancellation, refund and verified webhook adapter.
4. Subscription status, invoice and ledger APIs.
5. Server-side content and LIVE authorization using the active paid period.
6. Profile Subscribe CTA, checkout, My Subscriptions, Creator Studio and admin review UI.
7. Tests for RLS, duplicate webhook delivery, renewals, failed payments, cancellation, refunds, chargebacks and 50/50 calculations.


## PayPal server configuration
Set these variables only in the private Minglora Render service environment (never in browser code or committed files):
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_MODE=sandbox` for testing; switch to `live` only after end-to-end verification
- `PAYPAL_WEBHOOK_ID` for the webhook configured on the same PayPal REST application
- `PAYPAL_API_BASE_URL` only when using a non-default PayPal API base

Register the existing Minglora endpoint `/api/webhooks/paypal` as a webhook for the PayPal REST application. Subscribe to the relevant `BILLING.SUBSCRIPTION.*` events and `PAYMENT.SALE.COMPLETED`, `PAYMENT.SALE.REFUNDED`, and `PAYMENT.SALE.REVERSED`. Copy its webhook ID into the server environment. The endpoint verifies the PayPal transmission signature before forwarding an event to the private Supabase runtime gateway. A browser return to Minglora is not payment confirmation.

Existing creator payout settings continue to use the same PayPal payout integration. Subscription creator share is added to the existing creator earnings balance and uses the existing PayPal payout route.

Before going live, confirm that the PayPal REST app/account is entitled to create and manage Billing Plans and Subscriptions for this platform. PayPal's platform subscription integration documentation describes partner onboarding/eligibility for some platform arrangements; the code does not grant those PayPal account permissions.


## Creator earnings and PayPal payouts
Settled subscription payments enter the same creator earnings view and payout queue used for LIVE gifts. Minglora calculates the subscription creator share at 50% and reserves any requested, processing or paid payout against the combined creator balance. Refunds and reversals reduce subscription net earnings before any later payout request is accepted. Payouts continue through Minglora's existing PayPal payout pipeline.
