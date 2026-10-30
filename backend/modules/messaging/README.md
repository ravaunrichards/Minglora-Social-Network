# Messaging

**Current:** Direct one-to-one conversations with text, authorized photo/video/audio/document attachments, browser-recorded voice notes (WebM), a curated sticker set and Tenor GIF search/send when the private `TENOR_API_KEY` is configured. Profile Message actions open a compact popup immediately; an empty popup is ephemeral and does not create an Inbox conversation until the first message is sent. Inbox lists only actual conversations. Read receipts, unread counts and blocked-pair checks are enforced by the API.

**Composer:** photo/video/file attachment picker, voice recording, emoji panel, stickers, Tenor GIF search, message text and send action. Voice notes upload through the signed media pipeline as private message attachments. Voice recording needs microphone permission and a secure browser context.

**API:** `GET /api/messages`, `GET /api/messages/gifs?q=...`, `POST /api/messages`, and `POST /api/messages/:peerId/read`. GIF search is server-side; the Tenor API key is never exposed to the browser. Only HTTPS GIF URLs returned from `media.tenor.com` are accepted for sending.

**Token reliability:** Supabase refresh-token rotation is serialized per application session so concurrent API requests cannot consume the same one-time refresh token. Expired/reused refresh tokens invalidate only that session; transient provider outages do not erase it.

**Remaining:** WebSocket/Supabase Realtime delivery, group conversations, message edit/delete/retention, typing/presence, and normalized transactional conversation repositories are not implemented. Five-second refresh remains polling, not realtime.
