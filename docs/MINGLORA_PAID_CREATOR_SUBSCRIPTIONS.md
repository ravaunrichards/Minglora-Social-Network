# Minglora Paid Creator Subscriptions

## Profile actions
Visitor profile actions remain on one horizontal row in this order: Follow, Subscribe (when the creator has an approved and active offer), Message, Voice Call, Video Call, Report, Block. On phones the row can be swiped horizontally; it must not wrap or become a vertical stack. Follow does not create a paid subscription.

## Member subscription lifecycle
- Monthly creator membership is paid through PayPal-hosted recurring checkout.
- Minglora does not store card or PayPal credentials.
- A browser return is never proof of payment. Only a verified PayPal webhook and a reconciled settled charge activate access.
- Members can view their subscriptions, renewal/paid-through dates and cancel the next renewal. Access remains through the period already paid for.
- Payment failures, cancellation, expiry, refund and reversal events update membership status idempotently.
- A member cannot subscribe to their own creator account or purchase a duplicate active membership to the same creator.

## Creator roles and Creator Studio
- Any eligible member may apply to offer paid subscriptions.
- Minglora moderator approval is required before paid plans can be enabled.
- Approved creators can set a monthly price, description and benefits, enable/disable new subscriptions, and view active subscriber records.
- Existing subscriptions retain the PayPal plan they accepted when the creator later changes a price or pauses new sign-ups.
- Subscriber-only posts and subscriber-only LIVE are checked by the server; client-side labels do not grant access.
- Moderators can approve/reject creator applications and record monthly performance-bonus reviews.

## Revenue sharing
- Creator base share: 70% of the net settled receipt to the creator and 30% to Minglora. This is calculated only after actual provider processing fees and applicable transaction tax are removed.
- Net settled receipt is the gross PayPal charge less the actual provider processing fee. The ledger records gross, provider fee, net creator share, platform share and the percentage used.
- A moderator-verified monthly performance bonus adds 20 percentage points to the creator, for a maximum 90% creator / 10% Minglora split of the net receipt.
- The initial Minglora eligibility review target is at least 10,000 followers, 100,000 qualifying video views in the reviewed month, and 3 subscriber-only videos. A moderator must review and record the metrics. No creator can self-award the bonus.
- Each settled renewal captures the applied split in the ledger. Refund/reversal entries reverse the original share and proportional provider fee rather than recalculating using a later rate.

## Security and release gates
- Subscription tables are RLS-protected and service-role-only; the private Minglora runtime owns the subscription records and ledger.
- PayPal webhook signature verification, unique provider event IDs, and server-side payment amount/currency/fee reconciliation are required.
- Paid entitlement must not be granted by a redirect, request parameter or client-side state.
- Live paid billing must remain off until the existing Render service has PayPal REST client credentials, the webhook ID, and the PayPal account permission for recurring Billing Plans/Subscriptions. Test initial checkout, renewal, cancellation, failure, refund and reversal with PayPal sandbox before enabling live billing.
- The app is not considered production released until this branch is integrated with current main, CI passes, Render deploys the server/client code, and the PayPal sandbox flow is verified end-to-end.
