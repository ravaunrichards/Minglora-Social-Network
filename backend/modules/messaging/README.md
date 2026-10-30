# Messaging

**Current:** Direct one-to-one messaging with text and authorized uploaded attachments; blocked relationships are enforced; inbox unread counts and recipient-confirmed read receipts are persisted. Visible floating chat windows refresh from the authenticated API every five seconds and mark incoming messages read only while the conversation window is open. Desktop windows use a 328 × 455 px Messenger-style footprint and adapt to mobile screens.

**API:** `GET /api/messages`, `POST /api/messages`, and `POST /api/messages/:peerId/read`. The read endpoint only changes messages sent by the selected peer to the authenticated member. It rejects self-targets, unknown peers and blocked pairs.

**Ownership:** conversation membership, message delivery/read state, edits/deletes, attachments, typing/presence, message requests, blocks, abuse reporting and retention. The current implementation is direct one-to-one only and uses the JSONB compatibility state adapter; it is not yet a normalized transactional messaging repository. Five-second polling is not WebSocket or Supabase Realtime delivery.