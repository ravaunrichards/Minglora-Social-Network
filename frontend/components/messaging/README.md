# Minglora Messenger components

The Messenger UI extends the current social-network navigation and existing right-side pinned chat panel. Keep it responsive and non-overlapping across desktop and mobile; do not cover page content, hide controls behind fixed regions, or add a maximize control.

## Current member-facing experience

- Messenger panel with All/Unread/Groups/Communities filters, people search for new conversations, new group creation, message requests, archives, restrictions and notification/privacy options.
- Direct and group chat windows, up to five open windows, minimize/close controls, phone/video actions for direct chats, group-member management and right-side docking.
- Message composer for text, image/video/file attachments, voice notes, emoji, stickers and Tenor GIF search.
- Per-message reply, edit, delete-for-me, unsend-for-everyone and reactions.
- Direct and group read states, typing indicators, Active now presence and unread counts.
- Per-conversation Search messages and Shared media tools for actual photos, videos, audio, files and links.
- WebSocket realtime events with an API refresh fallback; online/typing indicators are only shown from authenticated realtime signals.
- Existing pinned Messenger panel, 3D navigation icons and current call lifecycle remain in place.

Do not invent conversations, message counts, delivery states, presence or shared media. Use the API response for each displayed item and show explicit loading, empty and error states.
