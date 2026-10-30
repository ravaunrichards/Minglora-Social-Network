# Feature implementation status

This document distinguishes working code from unfinished product requirements. An empty collection is a valid state; it must be shown as an honest empty state, never filled with fabricated records.

| Area | Implemented now | Not implemented / limitation |
|---|---|---|
| Account access | Registration, login, logout, salted scrypt password hashes, signed HttpOnly session cookie | Email verification, password reset, MFA, login rate limiting, account recovery |
| Feed | Authenticated All/Following/Friends scopes, optional cursor pagination, post create/edit/delete by owner, text and HTTPS image URL, saved posts UI/API, recent/oldest ordering | Native post-media uploads, personalized ranking, post audience controls, reporting |
| Reactions | Like toggle in browser; API accepts like, love, care, haha, wow, sad and angry | Full reaction picker and reaction analytics |
| Comments | Add comments and delete comments as the comment author or post author | Edit, threaded replies, reaction lifecycle, moderation and reporting |
| Profiles | View profiles/posts, edit name/bio/location, select avatar and cover images from the device gallery or file browser, preview before saving, upload to Supabase Storage with MIME/signature validation and an 8 MB limit; public/friends-only/private visibility is enforced for profile discovery, feed, search and profile reads | Verified accounts, granular per-post audiences, albums and privacy-aware follower/following management |
| Friends and follows | Send/accept/decline/retry friend requests, accepted friend lists, unfriend/cancel request, directed follow/unfollow, block/unblock and followers/following lists | Mute/restrict, report flows and advanced relationship controls |
| Groups | Create/browse public groups, join/leave, group detail pages, member-only text discussions, post deletion by author/group owner | Group roles, private groups, invitations, group event integration, rich media and moderation queue |
| Pages | Create public Pages with unique handles, view details/posts, follow/unfollow, creator-owned publishing and owner deletion | Page role assignment, additional admins/editors, Page insights, scheduling, Page privacy and reporting |
| Stories | Create text/HTTPS-image stories, public/friends/followers/private audiences, 24-hour expiry, unique view tracking and author-only deletion | Media uploads, video processing, reports/moderation, mute controls, and scheduled cleanup independent of requests |
| Messages | Direct text messages and conversation history; blocked pairs cannot start messages and are filtered from conversation lists | Real-time delivery, attachments, read receipts, message deletion and full conversation authorization lifecycle |
| Notifications | In-app notifications for supported reactions, comments, friend requests and messages; mark all read; saved preferences for master, friend-request, message and interaction notifications | Push/email delivery, per-notification read state and external device notifications |
| Search | Basic substring search across users, posts, groups and Pages; block-aware filtering for people/posts/Pages | Search indexing, relevance ranking, advanced filters and complete privacy-aware discovery |
| Settings & privacy | Dedicated Settings & Privacy hub; account identity display; persisted profile visibility, friend-request, new-message, in-app notification, theme, feed-sort and reduced-motion preferences; privacy controls enforced by relevant API routes | Password changes, MFA, session/device management, email changes, data export/deletion, per-post audiences and support/appeals workflows |
| Responsive interface | Desktop three-column layout, tablet adaptation and mobile bottom navigation | Formal device/browser accessibility and cross-platform QA |
| Operations | Node runtime, health endpoint, isolated API tests, Docker packaging and CI workflow | Production database, migrations, backup/restore automation, observability and deployment hardening |

## Empty-state rules

- A new account sees an empty feed until real posts exist.
- No user cards or counts are fabricated to fill empty panels.
- Groups appear only after a real account creates them.
- Conversation lists appear only after real messages exist.
- Stories are shown only from real stored records. Story reporting/moderation and media upload validation are still not implemented.
- Any future test fixture must use a temporary test database and be removed when the test finishes.
