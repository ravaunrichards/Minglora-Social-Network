# Minglora platform expansion roadmap

## Product rule

Minglora is one integrated social network with clearly separated product centres. Shared accounts, identity, safety, notifications, media storage and billing may be reused; each centre owns its navigation, permission checks, workflows and data model. Build original Minglora interfaces and implementations inspired by capabilities—not copied source code, protected screens, branding, content, or proprietary assets from other services.

Never manufacture members, posts, video views, followers, likes, gifts, earnings, or transaction history. Counts must come from verified records or measured events.

## Current implementation baseline

This is a repository planning document, not a claim that every listed system is already implemented. The current-runtime inventory in `README.md` is the source of truth for existing working capabilities.

| Centre | Baseline |
|---|---|
| Social network | Existing runtime includes profiles, feeds, posts, relationships, Stories, Groups, Pages, profile privacy and saved posts |
| Messenger | Existing runtime includes direct/group chats, attachments, voice notes, message controls and real-time signals |
| LIVE | Existing runtime includes LiveKit rooms, audio/video modes, guest participation, moderation and gifts |
| MeetWave | Existing distinct meeting feature with rooms, invitations, chat and LiveKit provider integration |
| Creator | Existing Creator Studio, subscriptions, gifts, earnings records and 50/50 eligible gift split |
| Video / Reels / Watch | Partial only: video may be attached to posts and played in the feed; standalone video discovery, processing and channel systems are not complete |
| Audio | Original user-published sounds exist; licensed music catalogue is not included |
| Marketplace / TV / dating / federation | Treat as future work unless a live runtime implementation is verified; do not revive retired standalone products or migrations blindly |

## Centre ownership and scope

### 1. Social Network
Profiles and covers; About sections; friend requests; follow/friend relationship rules; home, Following, Friends and For You feeds; text/photo/video posts; stories and highlights; albums; reactions; threaded comments; repost/share; saved collections; profile status; events; memories; profile activity; search; privacy audiences; blocks; restrictions; reports.

### 2. LIVE
Vertical and landscape broadcasting; audio-only and audio/video rooms; host/co-host/moderator/guest/viewer roles; guest invitations; configurable guest layouts; multi-guest rooms; gaming/screen share; live chat; questions; polls; reactions; battles; gift animation; subscriber rooms; scheduled broadcasts; recording/replay; clip creation; live analytics and moderation.

### 3. Messenger
Direct and group messaging; voice/video calls; call invitations and participant controls; voice/video notes; media/document attachments; stickers, GIFs and emoji; replies, reactions, edit/delete/unsend; disappearing/view-once media; read states; typing and presence; message search; shared media; channels and announcements; device/session synchronization; privacy and encryption boundaries.

### 4. Video, Reels and Watch
A video library and separate vertical Reels experience; creator video profiles/channels; long-form and short-form uploads; upload resumability; MIME/size validation; server-side media inspection; malware scanning; transcoding; thumbnails; adaptive bitrate playback; captions/subtitles; playback quality; playlists/series; watch history; continue watching; watch-later; real view/playback/completion events; recommendations; privacy and rights metadata; reporting; clips/highlights; creator analytics.

### 5. TV and media
A TV-style discovery guide; programme and channel metadata; live and on-demand schedules; favourites; watchlists; multi-view where supported; parental controls; accessibility captions/audio descriptions; playback resume. Broadcaster, sports, film, music and television catalogues require rights and distribution agreements. Do not scrape or rebroadcast protected programming.

### 6. Audio and music
Original audio publishing; podcasts; episodes and seasons; playlists; creator profiles; listening history; follows; comments; audio rooms; radio-style programming; audio discovery. Commercial music requires licensing, territory restrictions, reporting and royalty accounting. User-uploaded recordings need rights confirmation and takedown handling.

### 7. MeetWave
Keep meetings separate from Messenger calls and public LIVE: instant/scheduled/reusable rooms; invitation and access policies; host/co-host controls; participant management; screen sharing; whiteboards; chat; polls/Q&A; breakout rooms; waiting room; recording consent; attendance and meeting reports; all nine established host/guest layouts.

### 8. Creator Studio and memberships
Creator dashboard; profile/channel management; publishing calendar; drafts; moderation; content insights; audience and subscriber management; tiered recurring subscriptions; exclusive posts/media; paid messages and pay-per-view where permitted; tips and virtual gifts; promotions; creator statements; payout history; dispute handling; account eligibility and tax/compliance settings.

### 9. Marketplace and live shopping
Separate buyer, seller and merchant workflows; business verification; catalogue; variants and stock; product media; carts; checkout; taxes/shipping; order lifecycle; refunds/returns; seller statements; marketplace fees; payout reconciliation; reviews; fraud controls; live product tagging and shopping events. This requires deliberate review of the currently active database migrations and payment integration before restoring any retired marketplace functionality.

### 10. Discover, friendship and dating
People discovery; interests and matching; friendship and dating modes; consent-based matching; profile prompts; filters; mutual matches; chat only after applicable match/permission rules; location privacy; identity/age checks where required; harassment, impersonation and safety reporting. Avoid exposing exact user location.

### 11. Communities and gaming
Public/private groups; forum channels and topics; admin/moderator roles; roles and permissions; community rules; scheduled discussions; stage/audio rooms; gaming communities; tournaments; leaderboards; achievements; game integrations; bots with scoped permissions; anti-spam and appeal workflows.

### 12. Professional and business
Professional profiles and resumes; work and education history; skills; company Pages; job posts and applications; recruiting tools; business messaging; professional groups; learning; webinars; business analytics. Employment and qualification claims must not be fabricated.

### 13. Events
Public/private events; invitations; RSVP; ticketing where enabled; calendars; reminders; host tools; attendee privacy; livestream/meeting links; attendance reporting; cancellations and refunds where ticketing applies.

### 14. Creative publishing and discovery
Photo portfolios; albums; visual boards; blogs; long-form writing; GIFs; art portfolios; tags; reblogs/resharing; collaborative collections; visual search; attribution and copyright tools.

### 15. Administration, safety and trust
Platform operations dashboard; moderation queue; user reports; policy enforcement; appeals; account verification; age gating; impersonation and fraud detection; audit logs; content rights/takedowns; crisis escalation; abuse rate limits; data export/deletion; retention controls; privacy/accessibility testing.

### 16. Shared platform services
Single identity and session management; multi-device account security; global search; notifications/preferences; recommendation infrastructure; upload/storage lifecycle; media processing; feature flags; API contracts; billing ledger; coins/gifts; creator payouts; payments reconciliation; analytics; observability; backups/disaster recovery; accessibility; localization; admin audit trails.

## Delivery sequence

1. **Foundation and mobile parity:** preserve and verify current social runtime, navigation, Android/WebView integration, responsive behavior, account/auth and existing privacy rules. Do not label a WebView wrapper as a fully native client.
2. **Video centre:** begin with real video attachments already published by members, then implement separate short-video and long-form publishing, media processing, playback events, channels and playlists.
3. **Creator and audio:** extend existing Creator Studio and subscriptions only after verifying entitlement, ledger and payout flows; keep licensed audio separate from original recordings.
4. **Community and events:** expand groups/forums, event tools, creator communities and gaming.
5. **Marketplace and professional:** implement only after schema, payment-provider and compliance review; avoid reactivating retired database state by accident.
6. **Discovery and connected media:** add friendship/dating safeguards, TV rights integrations, federation and external service integrations where technically and legally supported.
7. **Verification:** tests for authorization, data integrity, accessibility, device sizes, performance, abuse controls, migration rollback and production provider readiness.

## Release acceptance

A feature is not complete because it has a screen or navigation item. It must have working API paths, persisted data, access control, real uploads/events, error/empty/loading states, responsive behavior, automated tests and observability. Production-only features remain disabled until their required provider credentials, licensing, legal controls and operational checks are in place.
