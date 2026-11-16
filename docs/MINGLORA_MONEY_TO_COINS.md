# Minglora money-to-Coins exchange

The Recharge page has two separate actions:

- **Recharge:** purchase Minglora Coins through the existing PayPal checkout.
- **Exchange:** convert the member's available money balance into Minglora Coins. This is not a PayPal payout and cannot convert Coins back into cash.

## Rate

The current Recharge custom-amount pricing is USD $0.01 per Coin. Exchange uses the same rate: USD $1.00 = 100 Minglora Coins. The amount is stored as integer USD cents and the Coin amount is the same integer, so calculations do not depend on floating-point arithmetic.

## Money balance source

The available money balance is the member's eligible creator earnings from confirmed LIVE gifts and subscriptions, less reserved/paid PayPal payouts and previous money-to-Coin exchanges. The database calculates the authoritative available amount; the browser preview is informational only.

## Transaction safety

Each conversion uses a unique request UUID. The database procedure serializes money exchanges and creator PayPal payouts on the member profile row, verifies the available money balance inside the same transaction, locks the Coin wallet, credits Coins, records the Coin ledger entry and stores the exchange history row atomically. Retries with the same request UUID return the original exchange rather than crediting Coins twice.

The exchange history is kept in `public.creator_coin_exchanges`; the matching Coin credit is recorded in `public.coin_ledger` with entry type `exchange`. The table is protected by RLS and is readable only by the trusted server runtime through its service role. No client-side direct write is granted.

Creator PayPal cash-outs remain separate from the Recharge Exchange tab.

Creator Studio's lifetime eligible-share total remains separate from the spendable amount: the balance RPC preserves the lifetime total, while `availableMinor` counts only available creator earnings plus net subscription earnings, less payout reservations and exchanges.
