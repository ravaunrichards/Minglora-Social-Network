# Feature implementation status

This document distinguishes working code from unfinished product requirements. An empty collection is a valid state; it must be shown as an honest empty state, never filled with fabricated records.

| Area | Implemented now | Not implemented / limitation |
|---|---|---|
| Account access | Registration, login, logout, salted scrypt password hashes, signed HttpOnly session cookie | Email verification, password reset, MFA, login rate limiting, account recovery |
| Feed | Authenticated chronological feed, optional cursor pagination, post creation, text and HTTPS image URL attachment, recent/oldest ordering | Media upload/storage, feed ranking, following-based feed, privacy/audience controls, edit/delete, reporting |
| Reactions | Like toggle in browser; API accepts like, love, care, haha, wow, sad and angry | Full reaction picker and reaction analytics |
| Comments | Add comments; comments display on post cards | Edit/delete, threaded replies, moderation and reporting |
| Profiles | View profiles and posts; edit name, bio, location, avatar URL and cover URL | Profile privacy, verified accounts, profile themes and granular visibility settings |
| Friends | Send and accept friend requests; list accepted friends and incoming requests | Unfriend, block, mute, report, request cancellation |
| Groups | Create, browse and join groups | Group posts, roles, events, invitations, private groups and moderation |
| Messages | Direct text messages and conversation history | Real-time delivery, attachments, read receipts, message deletion and blocking |
| Notifications | In-app notifications for supported reactions, comments, friend requests and messages; mark all read | Push/email delivery, per-notification read state and notification preferences |
| Search | Basic substring search across users, posts and groups | Search indexing, relevance ranking, filters and privacy-aware discovery |
| Responsive interface | Desktop three-column layout, tablet adaptation and mobile bottom navigation | Formal device/browser accessibility and cross-platform QA |
| Operations | Node runtime, health endpoint, isolated API tests, Docker packaging and CI workflow | Production database, migrations, backup/restore automation, observability and deployment hardening |

## Empty-state rules

- A new account sees an empty feed until real posts exist.
- No user cards or counts are fabricated to fill empty panels.
- Groups appear only after a real account creates them.
- Conversation lists appear only after real messages exist.
- No story feature is displayed as available until story storage, publishing, viewing, expiry and moderation are implemented.
- Any future test fixture must use a temporary test database and be removed when the test finishes.
