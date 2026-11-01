# Social-network feature catalog

This is a scope checklist, not a claim of Facebook parity.

| Domain | Current state |
|---|---|
| Accounts | Supabase Auth sign-up/sign-in; login rate limiting, password reset/change, email-change verification, server-sealed auth tokens, session revoke and TOTP MFA when provider configured | Passkeys, push login alerts and account deletion |
| Profiles | All, About, Friends, Photos, Reels and More tabs; View as, Search, Add highlights, Profile status, Archive, Story archive, Activity log and Manage Sections; photo gallery from uploaded posts | Verified profiles, profile themes, dedicated albums and photo tagging |
| Feed/posts | Posts accept device-uploaded photos, videos, audio and GLB 3D attachments; zoom/crop/rotation tools for images; edit and delete own posts | Automated video transcoding, chunked large uploads, personalized ranking and per-post audiences |
| Reactions/comments | Basic reaction and comment APIs; threaded replies and lifecycle controls incomplete |
| Relationships | Follow/unfollow, clickable follower/following lists, automatic friendship on reciprocal follow, friend requests/acceptance and block/unblock | Mute/restrict and other advanced relationship controls |
| Groups | Public groups with join/leave, details and member posts supporting uploaded images, video, audio and 3D media; report posts and author/owner deletion | Roles, private groups, invitations, transcoding and automated moderation incomplete |
| Pages | Create, follow, detail and owner publishing workflows; role management and insights incomplete |
| Stories | Text, uploaded photo/video, audience rules, 24-hour expiry and view tracking | Story scheduling, transcoding and advanced moderation |
| Profile image upload | Device gallery/file-picker uploads for avatar and cover, saved to the existing Minglora avatar/cover Storage buckets | Crop editor, old-media cleanup and gallery/albums are incomplete |
| Photos and albums | Profile Photos gallery displays uploaded post photos | Dedicated named albums, tagging and collaboration remain incomplete |
| Reels/short-form video | Reels-format posts support 1–3 uploaded videos and appear in the profile Reels tab | Automated transcoding, advanced editor, recommendations and analytics remain incomplete |
| Watch/long-form video | Not implemented |
| Voice/video calls | Not implemented |
| Check-ins/places | Place check-ins with optional note and public/friends/followers/private audience | GPS/maps and place discovery remain incomplete |
| Memories/fundraisers | Story archive, profile Highlights, short-lived profile status, post archive/restore and owner-only activity log | Memories auto-recaps, fundraisers and donations remain unimplemented |
| Messaging | Basic direct text messaging; realtime, attachments and read receipts incomplete |
| Notifications | Basic in-app notifications; preference and external delivery incomplete |
| Search | Basic substring search across people, posts, groups and Pages; indexing and advanced privacy-aware discovery incomplete |
| Events | Create events with date/time and visibility; profile Events list; Going/Interested RSVP | Invitations, reminders, recurring events and group-calendar integration remain incomplete |
| Marketplace | Not implemented |
| Live video | Not implemented |
| Account recovery/verification | Supabase password recovery link flow and email-change verification request; recovery password update; TOTP login challenge | Email verification onboarding, identity recovery support and passkeys |
| Notification preferences | Persisted in-app, friend-request, message and interaction controls; push/email/device delivery not implemented |
| Account settings | Dedicated Settings & Privacy with saved privacy/notification/appearance preferences, blocked-member management, account export, password/email, MFA and session management, support tickets and member reports | Account deletion and advanced recovery options |
| Data export/deletion | Authenticated JSON download of the member's profile, content, relationships and account activity; secrets and sessions excluded | Verified deletion requests and coordinated erasure/retention workflows are not implemented |
| Safety/privacy | Reports for members, posts, comments, stories, groups, Pages and messages; moderator queue and supported actions; audit records; support ticket/reply workflow | Human moderator allow-list configuration, appeals automation, automated media scanning and comprehensive safety policies |
| Operations | Node, JSON store, basic tests, Docker and CI exist; durable database and production operations incomplete |

A feature is complete only after end-to-end integration and tests. A document, SQL table, or empty UI does not count.
