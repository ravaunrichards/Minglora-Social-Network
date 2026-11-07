# Minglora LIVE multi-recipient gifting

Minglora LIVE supports gifts between different connected participants in the same active room.

## Recipient directions

- Audience viewers can send gifts to the host and approved guests/co-hosts.
- The host can send gifts to connected guests and co-hosts, but not to themselves.
- Guests and co-hosts can send gifts to the host and other approved guests/co-hosts, but not to themselves.
- Ordinary viewers are senders only; they are not listed as creator-earning LIVE recipients.
- A person who leaves the room is removed from the picker and cannot receive another gift in that LIVE.

## Runtime guarantees

1. The recipient picker is populated by the authenticated server from the current LiveKit room roster.
2. Before charging Coins, the server verifies that the sender, host, and chosen recipient are still connected.
3. The database validates the active broadcast, sender and recipient participant state, self-gifting prohibition, block relationships, active gift catalogue entry, and source-backed wallet debit.
4. The LIVE transaction receiver and creator-earnings ledger are credited to the selected recipient, not always the host.
5. Confirmed gift events are broadcast to the full room and identify the selected recipient in the 3D gift notification.
6. Cash-backed LIVE gifts use the LIVE gift transaction RPC. The promotional gift wallet uses its existing direct-recipient path for a non-host recipient, then publishes the confirmed in-room gift event.

Eligible cash-backed and marketing-backed Coin value continues to be split 50% to the selected recipient and 50% to Minglora. Ordinary promo Coins do not create cash earnings.

This change is not production-verified until the migration is applied to Minglora Supabase, automated tests pass, and a real two-device host/guest/viewer gifting test succeeds.
