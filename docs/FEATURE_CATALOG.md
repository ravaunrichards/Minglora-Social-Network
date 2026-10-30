# Social-network feature catalog

This is a scope checklist, not a claim of Facebook parity.

| Domain | Current state |
|---|---|
| Accounts | Basic registration/login/logout; verification, recovery, MFA and throttling incomplete |
| Profiles | Profile fields editable; avatar and cover selected from device gallery/files and uploaded to Supabase Storage; public/friends-only/private visibility and contact controls enforced | Verified profiles, per-post audiences, albums, photo tagging and profile themes |
| Feed/posts | Chronological feed, text and HTTPS image URL posts; ranking, audience controls, edits/deletes and uploads incomplete |
| Reactions/comments | Basic reaction and comment APIs; threaded replies and lifecycle controls incomplete |
| Relationships | Friend requests/acceptance; follow/unfollow, block, mute and restrict incomplete |
| Groups | Public groups with join/leave, details and member discussion posts; roles/private groups/moderation incomplete |
| Pages | Create, follow, detail and owner publishing workflows; role management and insights incomplete |
| Stories | Text/HTTPS-image stories with audiences, 24-hour expiry and view tracking; moderation/media uploads incomplete |
| Profile image upload | Device gallery/file-picker uploads for avatar and cover, saved to the existing Minglora avatar/cover Storage buckets | Crop editor, old-media cleanup and gallery/albums are incomplete |
| Photos and albums | Not implemented |
| Reels/short-form video | Not implemented |
| Watch/long-form video | Not implemented |
| Voice/video calls | Not implemented |
| Check-ins/places | Not implemented |
| Memories/fundraisers | Not implemented |
| Messaging | Basic direct text messaging; realtime, attachments and read receipts incomplete |
| Notifications | Basic in-app notifications; preference and external delivery incomplete |
| Search | Basic substring search across people, posts, groups and Pages; indexing and advanced privacy-aware discovery incomplete |
| Events | Not implemented |
| Marketplace | Not implemented |
| Live video | Not implemented |
| Account recovery/verification | Not implemented |
| Notification preferences | Persisted in-app, friend-request, message and interaction controls; push/email/device delivery not implemented |
| Account settings | Dedicated Settings & Privacy page with saved privacy and appearance preferences; account email/username shown read-only | Password updates, MFA, session management, email change and account recovery are not yet implemented |
| Data export/deletion | Authenticated JSON download of the member's profile, content, relationships and account activity; secrets and sessions excluded | Verified deletion requests and coordinated erasure/retention workflows are not implemented |
| Safety/privacy | Complete reporting, moderation, export/deletion and audience enforcement not implemented |
| Operations | Node, JSON store, basic tests, Docker and CI exist; durable database and production operations incomplete |

A feature is complete only after end-to-end integration and tests. A document, SQL table, or empty UI does not count.
