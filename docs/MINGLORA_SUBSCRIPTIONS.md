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
