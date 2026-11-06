# Minglora Messenger backend

Messenger is part of the existing Minglora social-network runtime. It uses the authenticated Minglora application session and the current persisted message collections; it does not create demo conversations or synthetic presence.

## Direct and group conversations

- Direct one-to-one chats and private group chats of up to 50 active members.
- Group creation, group details, member invitations/removal, leave rules, owner/admin permissions and membership-aware read states.
- Text, up to five authorized message attachments, photos, videos, audio, documents, browser-recorded WebM voice notes, curated stickers and verified Tenor GIFs when private `TENOR_API_KEY` is configured.
- Replies, sender-only text edits, delete-for-me, sender unsend-for-everyone, and per-message reactions.
- Per-member group read receipts and direct-message sent/seen receipts.
- Message requests, block/restrict checks, archived conversations, notification preferences and privacy-aware message audience enforcement.
- Per-conversation message-history search and a shared media/link listing. Shared file URLs are resolved through the existing private media gateway and remain time-limited.

## Realtime transport

`GET /api/messages/realtime` is an authenticated same-origin WebSocket upgrade. It uses the signed HttpOnly Minglora session cookie, validates the allowed application origin, limits concurrent sockets per account, and revalidates the application session on heartbeat. Revoked or expired sessions are closed.

The WebSocket transports presence, typing and post-commit message/read/update/delete/group-change signals. Message contents and signed attachment URLs are not broadcast in realtime signals: clients reload authorized conversation data through the normal API. Typing events require active membership in the direct or group conversation, are rate-limited and expire automatically. Presence is only shared with existing Messenger conversation peers and follows each member's Active status setting.

While connected, a 30-second API refresh remains as a recovery backstop. When WebSocket is disconnected, the client falls back to five-second refresh and reconnects with bounded exponential backoff. Multiple signed-in devices for the same account are tracked as separate sockets; a device disconnect does not clear the account's presence or typing state while another device remains active.

Realtime delivery currently runs in the same Node.js application process as the route handlers. The current hosted JSONB compatibility-state gateway is single-instance only; do not scale the Render service horizontally until messages, memberships and realtime fan-out have been migrated to transactional relational repositories or a shared realtime broker.

## API

- `GET /api/messages` — established direct and group conversations, authorized history and unread/read-state summaries.
- `GET /api/messages/search?q=...&conversationId=...` — search actual message text within the signed-in member's accessible conversations or one selected conversation.
- `GET /api/messages/shared?conversationId=...` — authorized shared photos, videos, audio, files and links for one direct or group conversation.
- `GET /api/messages/gifs?q=...` — server-side Tenor search; the API key is never exposed to the browser.
- `POST /api/messages` — direct message or group message (supply `groupId` for a group), with the supported message payloads.
- `POST /api/messages/:peerId/read` and `POST /api/message-groups/:id/read` — mark incoming messages as read.
- `PATCH /api/messages/:messageId`, `DELETE /api/messages/:messageId`, and `POST /api/messages/:messageId/reactions` — edit, delete/unsend and toggle supported reactions.
- `GET/POST /api/message-groups`, plus `PATCH/POST/DELETE /api/message-groups/:id...` — group management and membership operations.

## Security and limits

The API enforces message-audience preferences, restrictions, block relationships, active group membership, sender ownership, attachment ownership and supported message types. Group search and shared-media requests are filtered to active members. Per-user deletes are hidden only from that account; unsend requires the sender and removes the original attachment references.

Supabase refresh-token rotation remains serialized per application session. The application currently persists its route model through the JSONB compatibility state adapter; normalized message and conversation tables are not yet the route layer's transactional source of truth.


## Completion update (6 November 2026)

- Messenger direct and group conversations can set a shared disappearing-message timer: off, 30 seconds, 5 minutes, 1 hour, 24 hours or 7 days. Direct-chat participants may change their shared policy; in group chats only an owner or admin can change it.
- The server stamps every new message with its expiry deadline. Expired messages are filtered out of inbox, search and shared-media responses immediately, then background cleanup deletes their private storage objects. Storage failures are retried without making expired content visible again.
- Group chat headers now expose voice and video call actions. Groups with up to seven other members can start directly; larger groups get a member picker capped at the existing eight-person LiveKit room limit. The caller can add more people from the call controls while connected.
- Retention settings apply to new messages only. They do not retroactively change messages sent before the policy was saved.
