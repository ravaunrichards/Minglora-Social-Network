# Minglora Coin funding sources and creator earnings

Minglora keeps one visible Coin total per member, but each wallet is backed by a source ledger. The visible balance must always equal the sum of the three source balances.

## Funding categories

| Source | How Coins enter a wallet | Can generate creator earnings? |
|---|---|---|
| Cash-backed | PayPal coin purchase after a completed capture, or exchange of eligible creator USD earnings | Yes |
| Marketing-funded | Granted from the separately funded Minglora marketing budget | Yes, up to the amount reserved and funded by that budget |
| Ordinary promotional | Owner issuance, admin member credit and non-cash reward/refund credits | No |

The current rate is USD $0.01 per Coin (100 Coins = USD $1.00). Amounts are recorded as integer USD cents / whole Coins; do not use floating-point arithmetic for ledger amounts.

## Gift accounting

LIVE and direct profile gifts debit the source buckets atomically. The debit order is cash-backed, then marketing-funded, then ordinary promotional. The gift transaction stores the source breakdown and funding source.

Only cash-backed plus marketing-funded Coins count as eligible gift gross. Creator and platform shares are each 50% of that eligible gross. A gift paid entirely with ordinary promotional Coins can still display and be enjoyed, but it does not create a withdrawable creator-earnings entry.

Marketing-backed gift spend converts the matching amount from the marketing budget's reserved cents to spent cents. It cannot be spent twice: wallet source balances, budget reservations, gift transactions and ledger entries are written in one database transaction.

## Marketing budget

The marketing budget starts at USD $0.00. A grant is allowed only when the budget has enough unreserved confirmed funds. The designated Creator Hub administrator records funds only after they have actually been received and matched to an external transfer/settlement reference. The database stores that reference and makes it unique to prevent duplicate funding records.

This is a controlled manual reconciliation step, not a bank or PayPal feed. An admin should never record pending, expected or unverified funds.

A marketing Coin grant reserves one cent per Coin and credits the member's marketing source balance. When the member later spends those Coins on a gift, the matching reserved amount moves to spent. If the Coins are won through Goody Bags or Treasure Boxes, the source designation follows the award or refund; it remains reserved until later qualifying gift spend.

## Goody Bags and Treasure Boxes

Reward pools retain their cash, marketing and ordinary promotional source amounts while escrowed. Claims, random awards, unused-pool refunds and settlement restore the corresponding source buckets. Reward drops do not directly create creator earnings; creator earnings arise only when backed Coins are later spent on an eligible gift.

## Access and account separation

The funding and grant actions are server-only and require the verified, MFA-authorized Creator Hub administrative account `CreatorHubCreatorNetwork@gmail.com` with the active platform-owner permission. The owner issuance and admin member-credit procedures continue to credit the ordinary promotional bucket, not the cash or marketing buckets.

The personal testing account `Larryjones2019ersky@gmail.com` does not receive owner/admin privileges through this change. The wallet's source breakdown is visible to its owner; the marketing budget ledger and budget tables are restricted to the trusted server runtime.

## Verification before describing the system as fully live

- Confirm PayPal sandbox and live credentials, webhook registration and payout account readiness in the deployment environment.
- Run a successful PayPal coin purchase and verify its completed capture ID, Coin ledger credit and cash source balance.
- Run a creator gift with cash-backed Coins, a gift with marketing-funded Coins, and a gift with ordinary promotional Coins; verify 50/50 earnings only for the first two.
- Run reward-pool award and refund scenarios and verify the source buckets remain balanced.
- Complete a real creator payout and confirm its signed PayPal webhook before marking the payout paid.

A code deployment alone is not proof that a live PayPal transaction or payout has succeeded.
