# Minglora Coin value, funding sources and creator earnings

Minglora has one Coin currency and one visible Main Coin balance per member. Purchased, credited, promotional, marketing-funded, bonus and admin-issued Coins all have the same face value, catalogue prices, gifting functionality and reward progression. Funding-source labels are retained for accounting and audit; they do not create different Coin values or spending rules.

The visible Main Coin balance is reconciled to the three internal source balances: cash-backed, marketing-backed and promotional. This source split is never shown as a different spendable currency. The separate Admin Promotional Gift Wallet remains an independent campaign wallet and ledger; it is not merged, debited, synchronized or overwritten by the Main Coin wallet.

## Coin value and funding categories

| Coin source | How Coins enter the Main Coin wallet | Spending and gifting | Creator earnings when gifted |
|---|---|---|---|
| Purchased / cash-backed | Completed PayPal Coin purchase | Same value and gift access | Same 50% creator / 50% Minglora split |
| Credit / admin-issued | An authorized admin credits a specified member | Same value and gift access | Same 50% creator / 50% Minglora split |
| Promotional / reward | Promotional credits and qualifying rewards/refunds | Same value and gift access | Same 50% creator / 50% Minglora split |
| Marketing-funded | Granted from a verified, separately funded marketing reserve | Same value and gift access | Same 50% creator / 50% Minglora split |

The base accounting conversion is 1 Coin = USD $0.01 (100 Coins = USD $1.00). Coin and USD ledger values are whole integers / integer cents. Do not use floating-point arithmetic for stored financial values.

## Gift accounting and creator earnings

LIVE gifts and social/profile gifts debit the member's one Main Coin balance atomically. The backend retains the source breakdown in the ledger, but gift prices and creator earnings are based on the full number of Coins spent, regardless of whether they were bought, credited or issued as a promotion.

- Each eligible gift records full Coin spend as USD-cent gross at 1 Coin = USD $0.01.
- The creator receives 50% of that gross as USD earnings.
- Minglora records the remaining 50%.
- The gift transaction and creator earnings ledger retain the funding-source label (cash, marketing, promo or mixed) for reconciliation.
- Admin/owner-issued Main Coin credits enter the Main Coin wallet's promotional source bucket without deducting from the administrator's or member's existing balance.
- Marketing-funded grants continue to consume the optional marketing reserve when spent, so the same reserve cannot be reused twice.

For example, a 1,000-Coin gift records USD $10.00 gross: USD $5.00 creator earnings and USD $5.00 Minglora share, regardless of Coin source.

## Creator real-money balance, exchange and payouts

Eligible gifts post USD-cent earnings to the creator earnings ledger. The creator's available USD balance is derived from that ledger, not from an editable profile field or the Coin balance.

The existing exchange action converts eligible creator USD earnings to Main Coins at 100 Coins per USD $1.00, debits the USD earnings, and credits the Main Coin wallet. This is an exchange of earned value, not a free Coin mint.

Creators may request a real USD payout to their configured PayPal payout account. The payout request reserves the eligible earnings through the existing payout flow. A request is not proof of payment: the payout remains pending/processing until PayPal confirms its final status. Actual withdrawals require Minglora's PayPal business account to be configured, eligible and funded; the software cannot create cash or guarantee a provider transfer from an empty PayPal balance.

## Optional marketing reserve

The marketing reserve is an optional funding pool for marketing-specific campaigns. It starts at USD $0.00. New funding is recorded only after a PayPal order capture is confirmed for the exact amount. An external reference, pending payment or expected transfer cannot create funds.

A marketing grant reserves one cent per Coin and credits the member's marketing source balance. Spending those Coins on a gift moves the matching amount from reserved to spent. Ordinary admin/bonus Coins do not require this reserve and remain fully spendable as Main Coins.

## Separate Admin Promotional Gift Wallet

The Admin Promotional Gift Wallet retains its own campaign allocation, funding reserve, recipient wallet, transaction history and gift flow. It never synchronizes its balance into Main Coins or changes an owner/member Main Coin balance. Its existing cash-backing and payout rules remain separate.

## LIVE Goody Bags and Treasure Boxes

Reward pools retain their source breakdown while escrowed. Claims, random awards, unused-pool refunds and settlement preserve source balances. A reward drop itself does not create creator earnings; the awarded Coins have the same gift functionality and generate the standard 50/50 USD earnings when later used to send a gift.

## Access, audit and account separation

Funding and admin/owner credit actions are server-only and require the designated, MFA-verified Creator Hub administrative account with active platform-owner permission. The personal testing account does not receive owner/admin privileges through this change.

Funding references, Coin credits, PayPal capture IDs, gifts, creator earnings, exchanges and payouts remain traceable in the ledger. Member credit transactions are idempotent and preserve the admin note and recipient identity.

## Verification before describing the system as fully live

- Confirm PayPal live credentials, merchant configuration, payout entitlement and webhook registration in the deployment environment.
- Verify a PayPal Coin purchase credits the cash source exactly once.
- Verify an admin-issued bonus credits only the selected member's Main Coin wallet and does not debit another wallet.
- Verify gifts funded by purchased, admin-issued, credited, promotional and marketing-funded Coins use the same gift price and 50/50 creator earnings.
- Verify USD earnings appear in creator balance, the USD-to-Coin exchange debits USD and credits Coins, and payout status changes only after provider confirmation.
- Verify the separate Admin Promotional Gift Wallet remains isolated.

A code or database deployment is not proof that a real PayPal payment or payout has succeeded.
