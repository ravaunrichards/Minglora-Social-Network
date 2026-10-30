# Feature implementation status

This document distinguishes working code from unfinished product requirements. An empty collection is a valid state; it must be shown as an honest empty state, never filled with fabricated records.

| Area | Implemented now | Not implemented / limitation |
|---|---|---|
| Account access | Supabase Auth registration/login, signed HttpOnly sessions with server-encrypted auth tokens, login throttling, password recovery, password change, verified-email-change requests, session listing/revocation and TOTP MFA enrollment/verification when Supabase Auth is configured | Legacy local auth remains development-only; push login notifications and passkeys are not implemented |
| Feed | Authenticated All/Following/Friends feeds; create/edit/delete posts with device-selected images, videos, audio and GLB 3D files; image zoom/crop/rotation; signed TUS resumable uploads with 6 MB chunks, progress/retry handling, owned asset records and signed media viewing; URL-based media submissions are rejected | Automated video transcoding, post audience controls and personalized ranking are not implemented |
| Reactions | Like toggle in browser; API accepts like, love, care, haha, wow, sad and angry | Full reaction picker and reaction analytics |
| Comments | Add comments and delete comments as the comment author or post author | Edit, threaded replies, reaction lifecycle, moderation and reporting |
| Profiles | View profiles/posts, edit display name and unique username, bio and location; choose avatar/cover from gallery, file browser or camera; zoom/crop/rotate and upload to Supabase Storage; public/friends-only/private visibility enforced | Profile themes, albums, photo tagging and verified accounts are incomplete |
| Friends and follows | Send/accept/decline/retry friend requests, accepted friend lists, unfriend/cancel, follow/unfollow, block/unblock, clickable follower/following/friends profile lists and live counts; reciprocal follows automatically create a friendship | Mute/restrict and advanced relationship controls are not implemented |
| Groups | Create/browse public groups, join/leave, group detail pages, member-only discussions with device-uploaded images, video, audio and GLB media; members can report groups and group posts; post deletion by author/group owner | Group roles, private groups, invitations, group event integration, media transcoding and moderation policy automation |
| Pages | Create public Pages, unique handles, view details/posts, follow/unfollow, owner publishing and deletion; Page publishing supports uploaded media; members can report Pages and Page posts | Page admin/editor assignment UI, insights, scheduling and advanced moderation policies are incomplete |
| Stories | Create text plus a selected photo or video from gallery/files/camera, audience enforcement, 24-hour expiry, real view tracking, report action and author-only deletion | Automated transcoding, story scheduling and advanced moderation controls are incomplete |
| Messages | Direct one-to-one text and uploaded image/video/audio/document attachments; browser-recorded voice notes; curated Minglora stickers; Tenor GIF search/send when private `TENOR_API_KEY` is configured; emoji composer; compact profile-launched Messenger-style popups; Inbox only lists established conversations; unread counts and read receipts | WebSocket/Supabase Realtime delivery, group conversations, message editing/deletion/retention, normalized transactional conversation repositories and full multi-device membership lifecycle; GIF search needs a private Tenor API key |
| Notifications | In-app notifications for supported reactions, comments, friend requests and messages; mark all read; saved preferences for master, friend-request, message and interaction notifications | Push/email delivery, per-notification read state and external device notifications |
| Search | Basic substring search across users, posts, groups and Pages; block-aware filtering for people/posts/Pages | Search indexing, relevance ranking, advanced filters and complete privacy-aware discovery |
| Settings & privacy | Saved profile visibility, friend-request, message, notification and appearance preferences; blocked-member manager; account export; password and email-change requests; TOTP MFA setup/verification; active-session manager and revoke-others | Account deletion, passkeys, external push/email notification delivery and identity recovery workflows beyond Supabase email recovery are incomplete |
| Safety and support | Member reports for profiles, posts, comments, stories, groups, Pages and messages; moderator report queue/status changes; supported hide/remove/suspend actions with audit records; support tickets, replies, statuses and member history | Trusted moderator accounts must be allow-listed in `MODERATOR_USER_IDS`; appeals automation, media scanning and advanced moderation policies are incomplete |
| Responsive interface | Desktop three-column layout, tablet adaptation and mobile bottom navigation | Formal device/browser accessibility and cross-platform QA |
| Operations | Node runtime, health/readiness endpoints, isolated API tests, Docker packaging, Supabase migrations, signed media Storage uploads, durable single-row Supabase compatibility persistence and GitHub Actions CI | Transactional normalized repositories, automated video transcoding pipeline, backup/restore automation, observability and multi-instance scaling are not complete |

## Empty-state rules

- A new account sees an empty feed until real posts exist. Posts and Stories accept uploaded media references only; pasted image URLs are rejected.
- No user cards or counts are fabricated to fill empty panels.
- Groups appear only after a real account creates them.
- Conversation lists appear only after real messages exist.
- Stories are shown only from real stored records. Reports enter a moderator queue; moderation still depends on a trusted moderator allow-list and human review.
- Any future test fixture must use a temporary test database and be removed when the test finishes.
