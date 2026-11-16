# Minglora Promotional Gift Reserve and PayPal Cash-out

## Money-flow rules

- The Admin Promotional Gift Wallet remains a separate token ledger.
- Admin Campaign Coins, member promotional Coins and Main Coins are not cash.
- Promotional gift sending does not debit the sender's Main Coin wallet.
- The promotional gift reserve is a separate USD balance and begins at $0.00.
- A PayPal Checkout capture with exact USD amount is the only event that increases the reserve.
- One promotional Coin represents one cent of reserve value for gift-spend accounting.
- Sending a promotional gift consumes the matching reserve amount atomically.
- Each funded gift records a 50% creator share and 50% platform share in creator earnings.
- Creators use the existing PayPal payout account and Payouts API to withdraw eligible available USD.

## Admin setup

1. Sign in with the designated Creator Hub administrator and complete the required MFA reviewer session.
2. Open Admin Control Centre > Admin Promotional Gift Wallet.
3. Fund the separate USD reserve through the PayPal checkout action.
4. Wait for the callback to verify a completed capture and update the reserve ledger.
5. Only then issue Admin Promotional Gift Wallet Coins to members. The campaign Coin allocation itself does not add USD.

## Member gifting

In Gift Studio or LIVE, select Promotional Gift Wallet as the payment source. The server checks the member's separate promotional wallet and the remaining USD reserve. If either is insufficient, it rejects the gift without creating creator earnings.

## PayPal production prerequisites

Configure these server-only variables on the Minglora Render service:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_MODE=live`
- `PAYPAL_WEBHOOK_ID`

The connected PayPal Business account must be approved for PayPal Payouts, with a sufficient available PayPal balance. Configure the PayPal webhook URL as `https://minglora-social-network.onrender.com/api/webhooks/paypal` and subscribe to payout batch/item success and failure events. Confirm the actual webhook ID is the one stored in Render.

## Operational guardrails

- No test or demo transactions are inserted into production tables.
- No USD reserve is created by admin Coin allocation.
- No creator earnings row is created if the reserve cannot cover the full gift value.
- PayPal capture and payout IDs are persisted for reconciliation.
- Creator payouts remain pending until a PayPal-verified webhook reports completion.
- A missing PayPal credential, disabled Payouts entitlement, or empty PayPal balance blocks cashout rather than faking success.
