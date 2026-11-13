# Minglora global platform capability matrix

**Prepared:** 2026-11-11  
**Scope:** The 40 entries in the user's reference list (39 unique services; Twitch appears twice), consolidated into one Minglora product with cross-device support.

> This is a requirements and audit document. It does not claim that every referenced capability is implemented. The live-runtime baseline remains the current `README.md`, `FEATURES.md`, and `FEATURE_CATALOG.md`. A listed reference app, a folder, a route, or a screen is not evidence of production completion.

## 1. Product and implementation rules

1. Build one integrated Minglora ecosystem with separately owned product centres. Share identity, account security, notification preferences, media storage, search infrastructure, billing ledgers, accessibility primitives and device-session services where appropriate.
2. Give each centre its own navigation, workflows, permissions, data boundaries, abuse controls and acceptance tests. Reuse shared foundations; do not merge unrelated experiences into one overloaded screen.
3. Implement original Minglora code, visual design, naming and assets. Reference other products for user needs and capability patterns only. Do not copy their source code, protected screen designs, logos, trademarks, copyrighted media or proprietary assets.
4. Use official APIs and user-authorized interoperability for external integrations. Do not scrape private data, bypass access controls, mirror protected catalogues or imply affiliation with a reference provider.
5. Streaming television, commercial music, sports, films, creator music libraries and other protected content require the applicable licensing, territory controls, reporting and royalty arrangements. Build rights-aware provider integrations; do not rebroadcast protected content without authorization.
6. Never invent users, posts, comments, reactions, messages, streams, viewers, followers, watch time, ratings, gifts, earnings, sales or transaction records. Every displayed count must come from real persisted records or measured events.
7. Preserve existing working features and user data. Use additive migrations, feature flags, staged releases, backups and tested rollback plans. No destructive cleanup or broad schema replacement as part of feature expansion.
8. Do not mark a domain complete because it has a menu item, static screen, README, SQL table, mock response or unconfigured provider integration.

## 2. Reference services supplied

The following is the complete reference list in the order supplied. The duplicate Twitch entry is retained so the audit preserves the user's list, but it is one platform, not two separate integrations.

| # | Reference service | Primary capability lens | Minglora centre(s) |
|---:|---|---|---|
| 1 | Twitch | Creator and gaming livestreams, live chat, channel communities, clips and subscriptions | LIVE, Gaming Communities, Creator Studio |
| 2 | YouTube Live | Channel livestreams, live chat, scheduled broadcasts and replay workflows | LIVE, Video / Watch, Creator Studio |
| 3 | TikTok Live | Mobile-first live broadcasting, guest participation and real-time creator engagement | LIVE, Creator Studio |
| 4 | Facebook Live | Social-graph broadcasts, group/page broadcasts and event-linked streams | LIVE, Social Network, Events |
| 5 | Instagram Live | Mobile creator broadcasting, guest sessions and story-connected discovery | LIVE, Stories, Creator Studio |
| 6 | Kick | Creator channels, live chat, moderation and channel communities | LIVE, Creator Studio, Communities |
| 7 | LinkedIn Live | Professional broadcasts, business events and professional audiences | LIVE, Professional Network, Events |
| 8 | Bigo Live | Social livestreaming, guest/co-host sessions, virtual gifts and fan communities | LIVE, Gifting, Fan Clubs |
| 9 | Trovo Live | Gaming livestreams, creator communities and audience engagement | LIVE, Gaming Communities |
| 10 | YouNow | Interactive creator livestreams and audience participation | LIVE, Creator Studio |
| 11 | Tango Live | Social creator broadcasts, gifts and creator memberships | LIVE, Gifting, Creator Studio |
| 12 | Vimeo Livestream | Professional/event broadcasting, production workflows and replay delivery | LIVE, MeetWave / Events, Video Centre |
| 13 | YouTube TV | Licensed linear-TV discovery, channel guide and TV playback experience | TV & Media |
| 14 | Zoom | Scheduled/instant meetings, webinars, screen sharing and participant controls | MeetWave |
| 15 | Clubhouse | Live audio rooms, stages, speakers, audience hand-raise and room moderation | Audio Rooms, Communities |
| 16 | Facebook | Profiles, social feeds, friends/followers, groups, pages, stories and events | Social Network, Communities, Events |
| 17 | YouTube | Long-form video, channels, subscriptions, playlists, search and recommendations | Video Centre, Watch, Creator Studio |
| 18 | WhatsApp | Private messaging, group conversations, voice notes, calls and status updates | Messenger, Calls, Stories |
| 19 | Instagram | Photo/video sharing, profiles, stories, short video and direct messaging | Social Network, Reels, Stories, Messenger |
| 20 | TikTok | Vertical short-video creation, discovery feeds, creator profiles and live entry points | Reels, Video Centre, LIVE |
| 21 | WeChat | Messaging, social sharing, official-account and service integrations | Messenger, Social Network, Integration Centre |
| 22 | Telegram | Private/public messaging, channels, large groups, media sharing and scoped bots | Messenger, Channels, Communities, Bot Platform |
| 23 | Snapchat | Ephemeral messaging, stories, camera effects and private sharing | Messenger, Stories, Camera Studio |
| 24 | Reddit | Topic-based communities, threaded discussions, voting and moderator tools | Communities, Forums, Search |
| 25 | X (formerly Twitter) | Real-time public posts, replies, reposts, topic discovery and live audio | Social Network, Audio Rooms, Search |
| 26 | Pinterest | Visual discovery, saved collections, boards and curated inspiration | Visual Discovery, Albums, Saved Collections |
| 27 | LinkedIn | Professional identity, company pages, career content, business networks and events | Professional Network, Pages, Events |
| 28 | Threads | Text-first social conversations, replies, reposts and topic-based discovery | Social Network, Search |
| 29 | Twitch (repeat in supplied list) | Duplicate reference to entry 1; include once in implementation and test counts | LIVE, Gaming Communities, Creator Studio |
| 30 | Discord | Servers, text/voice channels, member roles, events and community moderation | Communities, Audio Rooms, Messenger |
| 31 | Tumblr | Blogs, long-form posts, tags, reblogs and creative communities | Publishing, Social Network, Visual Discovery |
| 32 | Bluesky | Federated/decentralized social feeds, custom feeds and portable identity concepts | Social Network, Federation Gateway |
| 33 | Mastodon | Federated communities, remote follows, timelines and instance moderation | Social Network, Federation Gateway, Communities |
| 34 | Sina Weibo | Public microblogging, trending topics, media posts and public conversations | Social Network, Search, Trends |
| 35 | QQ | Messaging, group communication, media and file sharing | Messenger, Communities |
| 36 | LINE | Direct/group chat, stickers, calls and official-account experiences | Messenger, Calls, Creator / Business Channels |
| 37 | KakaoTalk | Direct/group messaging, media sharing, calls and channel experiences | Messenger, Calls, Creator / Business Channels |
| 38 | VK (VKontakte) | Social profiles, communities, media sharing and messaging | Social Network, Communities, Messenger |
| 39 | Kuaishou | Short-form video, creator communities, livestreaming and commerce patterns | Reels, Video Centre, LIVE, Creator Studio |
| 40 | Douyin | Short-form video discovery, creator tools, livestreaming and commerce patterns | Reels, Video Centre, LIVE, Creator Studio |

## 3. Minglora product-centre capability requirements

### A. Social Network

- Member profiles, profile and cover media, About sections, privacy audiences, follows, reciprocal-follow friendships, friend requests, blocks and relationship controls.
- Home, Following, Friends and discovery feeds; text, image and video posts; comments and replies; reactions; repost/share; bookmarks and saved collections.
- Stories, Highlights, archives, albums, profile media, events, Pages and Groups.
- Topic/hashtag discovery, trends, profile search, privacy-aware people search and user-controlled recommendations.
- Per-post and per-profile audience controls enforced on the server, not only hidden in the client.

### B. LIVE

- Video + audio, audio-only, gaming/screen broadcast and studio-style sessions, subject to device and provider support.
- Host, co-host, guest, moderator and viewer roles; invites, guest requests, seat management and host-controlled permissions.
- Portrait and landscape presentation; switchable room layouts; camera/microphone controls; screen share where supported.
- Live chat, reactions, questions, polls, moderation, reporting, blocks and rate limits.
- Gifts, coins, fan clubs and creator earnings only when backed by verified ledger transactions and configured payment/gift rules.
- Scheduled broadcasts, clips, recordings/replays, content controls, analytics and creator tools.
- Provider webhooks and server-side participant verification; never trust client-supplied viewer or gift totals.

### C. Video, Reels and Watch

- Separate short-form vertical and long-form video experiences with creator profiles/channels.
- Upload progress, resumable transfer, media validation, malware inspection, transcoding, thumbnails and adaptive-bitrate playback.
- Real playback metrics: qualified views, watch duration, completion, replay and retention events with documented definitions.
- Captions/subtitles, accessible controls, playback speed/quality, playlists, series, watch history, continue watching and Watch Later.
- Recommendations with controls such as Not interested, followed creators and content-topic preferences.
- Upload rights declarations, copyright complaints, takedowns, privacy controls and moderation workflows.

### D. Messenger and Calls

- Direct and group messaging; voice notes; photo/video/document sharing; replies, reactions, edits, delete-for-me and unsend-for-everyone.
- Stickers, GIFs and emoji; read states; typing and presence controls; conversation search and shared-media browsing.
- Voice/video calls, incoming/outgoing call states, invite/accept/decline, room membership and participant controls.
- Device/session synchronization, delivery retries, message retention controls, block/report tools and attachment access checks.
- Explicitly distinguish encrypted conversations from ordinary server-readable messages. End-to-end encryption requires a reviewed protocol, secure key management, device lifecycle and recovery model; do not label a chat encrypted unless verified.
- Channels and announcement feeds must have separate subscriber, posting and moderation permissions from ordinary direct messages.

### E. Communities, Forums and Audio Rooms

- Public/private communities, servers, channels, topics, threads, pinned content and searchable discussions.
- Owner/admin/moderator/member roles, granular permissions, invitations, onboarding, community rules, member removal and appeal paths.
- Reactions and voting with anti-manipulation controls; polls and scheduled discussions.
- Live audio rooms/stages with speaker requests, host controls, moderation, room privacy and accessible participation.
- Bots/integrations must use scoped permissions, visible identity, usage limits, audit logs and a revocation path.

### F. MeetWave

- Keep MeetWave separate from Messenger calls and public LIVE.
- Instant, scheduled and reusable rooms; invite-only/friends/public access; waiting room and admission controls.
- Host/co-host controls, participant management, screen sharing, meeting chat, polls/Q&A, breakout rooms and attendance.
- Recording consent, retention controls, meeting reports and accessibility support including captions where available.
- Keep the seven screen layouts separate from two guest-box arrangements: Full Screen, Fluid Panel, Fluid Grid, Fixed Grid, Fixed Panel, Side by Side and Spotlight are screen layouts; Roundtable 1 and Roundtable 2 are guest-box layouts inside the MeetWave panel/grid.

### G. Professional Network and Publishing

- Professional profiles, verified work/education history, skills, company Pages, business communities and professional events.
- Long-form writing, blogs, tags, reblogs/resharing, portfolios, visual boards and curated collections.
- Job listings and recruitment must remain unavailable until a separate, reviewed implementation is built; do not re-enable retired Jobs data or migrations as a shortcut.
- Support business/official channels without implying that a third-party official-account verification has been granted.

### H. TV and licensed media

- TV-first navigation, remote-control focus states, programme/channel guide, favourites, watchlist, playback resume and parental controls.
- Support legal provider integrations, subscriptions and territory restrictions only after contracts and rights are confirmed.
- Do not assume a YouTube TV-like experience grants access to television channels or programme catalogues.

### I. Shared platform services

- Account identity, sessions, device registration, login security, recovery and account switching.
- Cross-device sync for messages, profile settings, saved content, drafts, subscriptions and playback progress.
- Unified notification preferences with per-device delivery, mute controls and delivery status.
- Global search, recommendation services, media pipeline, storage lifecycle and rights metadata.
- Server-authoritative permissions, audit logs, fraud/abuse controls, report/appeal workflows and age-appropriate safeguards.
- Billing ledger, Coin transactions, gift accounting, subscriptions, refunds and creator payouts with reconciliation and clear separation between balances.
- Observability, backups, disaster recovery, data export/deletion, rate limits and documented incident recovery.

## 4. Device and client coverage

The target is one consistent account and service ecosystem across all supported device classes. A feature may have a different interaction pattern on each device, but its server-side permissions and user data must remain consistent.

| Device / environment | Required experience | Current repository baseline |
|---|---|---|
| Desktop browser | Full responsive web application, keyboard access, camera/mic and screen-share support where available | Current browser app is in `public/` |
| Mobile browser / PWA | Responsive touch UI, upload recovery, push support where available and installable shell where supported | Responsive web baseline; full PWA parity requires verification |
| Android phone | Touch-first application, Android permissions, sharing, upload/background behavior, notifications and device back navigation | Native WebView shell and update workflow; not yet a feature-complete native client |
| Android tablet | Adaptive tablet layouts, split view where useful, camera/mic and keyboard support | Requires device-specific QA |
| iPhone | iOS app with native permissions, camera/media picker, share sheet, push and background behavior | Planned |
| iPad | Tablet-adaptive iOS experience, multitasking and external keyboard support | Planned |
| Windows / macOS / Linux | Desktop app or supported browser experience, keyboard/shortcuts, notifications and secure media handling | Desktop client planned; browser remains the available client |
| Smart TV / streaming device | Ten-foot UI, remote focus/navigation, playback controls, captions and parental settings | TV client planned |
| Smartwatch / wearables | Optional companion notifications and lightweight controls only where platform APIs support them | Not a launch-critical client; evaluate separately |

### Cross-device consistency rules

- One account identity and server-authoritative authorization model across clients.
- Sync read/unread status, conversation state, saved items, settings, drafts and playback progress where the user has enabled sync.
- Device-specific sessions must be visible and revocable by the account holder.
- Do not promise background calling, uploads, recording, push delivery or screen sharing where the operating system/browser does not support it.
- Media quality, upload size and data consumption must adapt to device capability and connection quality.
- Respect reduced motion, text scaling, screen readers, keyboard navigation, captions and contrast preferences.
- Provide stable deep links and session recovery without exposing authentication tokens in URLs.

## 5. Implementation and audit status vocabulary

Use these exact status labels in the feature tracker:

- **REFERENCE LISTED** — source product is recorded as a capability reference.
- **REQUIREMENTS MAPPED** — Minglora workflows and acceptance criteria are documented.
- **IMPLEMENTED — UNVERIFIED** — code exists, but the complete end-to-end acceptance suite has not passed.
- **INTEGRATION VERIFIED** — API, persistence, authorization, user interface and required provider connection have passed their tests in a named environment.
- **DEVICE VERIFIED** — the specified device/client test matrix has passed.
- **PRODUCTION READY** — operational, security, privacy, licensing, accessibility, recovery and monitoring gates have been reviewed and passed.

A status must be assigned per capability and per supported client where applicable. Do not infer that all devices are covered because one responsive web screen works. Keep evidence links, test IDs, tested build/commit, environment and date with every verified status.

## 6. Safe delivery order

1. **Inventory and protect the baseline:** record current main-branch commit, active runtime routes, schema/migration state, existing provider requirements and known production limitations. Run current tests before changing active behavior.
2. **Cross-device foundation:** define shared API contracts, session/device lifecycle, responsive design tokens, navigation rules, upload pipeline requirements and device QA matrix. Keep the current browser application working while extracting or adding clients incrementally.
3. **Complete core social and privacy:** verify profiles, relationships, feed audiences, posts, stories, groups, pages, search, blocks and account controls end-to-end.
4. **Complete communication:** verify Messenger, calls and MeetWave as separate experiences; test real-time reconnection, cross-device delivery, authorization and media permissions.
5. **Complete LIVE and creator systems:** verify provider connectivity, host/guest roles, room moderation, gifts, ledger entries, earnings and withdrawal reconciliation before enabling public monetization.
6. **Complete Video / Reels / Watch:** implement safe media processing, reliable playback, content rights, measured engagement events, playlists and creator analytics.
7. **Add communities, audio, professional and visual publishing:** build each centre with distinct roles, navigation, data contracts and moderation.
8. **Add TV and external federation/integrations:** only after provider access, supported protocols, user consent, privacy rules and commercial rights have been confirmed.
9. **Device-by-device release:** pass browser, Android, iOS, desktop and TV acceptance tests separately. A planned client remains planned until a testable release exists.
10. **Scale and operational readiness:** migrate away from the current single-row JSONB compatibility adapter through reviewed, reversible, transactional repository changes; verify backups/restore, concurrency, monitoring, security and incident recovery before multi-instance scale.

## 7. Mandatory release gate for every feature

A feature is eligible for **INTEGRATION VERIFIED** only after all applicable checks pass:

- User-facing workflow is implemented with loading, success, empty, offline, permission-denied and recoverable-error states.
- API contracts validate inputs and enforce authorization on the server.
- Data persists correctly with transaction and concurrency behavior appropriate to the feature.
- Database constraints, row-level security, storage policies and migration/rollback behavior are tested where applicable.
- Real-time events, retries, duplicate delivery and reconnect behavior are tested where applicable.
- Upload, playback, calling, notification and external provider flows work with real configured services; no fake success path is used.
- Responsive layout, accessibility, performance and device-specific behaviors are tested on the declared targets.
- Moderation, abuse prevention, privacy, retention, reporting and data-rights controls are covered.
- Automated tests pass, and the result records test evidence, commit, environment and date.
- Existing authentication, profiles, messaging, LIVE, MeetWave, Creator Studio, payment ledger and user data have passed relevant regression tests.

## 8. Current baseline references

Use these repository documents as the evidence sources and reconcile their differences before changing a runtime status:

- `README.md` — current runtime capabilities and known infrastructure limitations.
- `docs/FEATURES.md` — feature-by-feature implementation status and gaps.
- `docs/FEATURE_CATALOG.md` — concise capability audit and status index.
- `docs/PLATFORM_COVERAGE.md` — client/device coverage baseline.
- `docs/PLATFORM-EXPANSION-ROADMAP.md` — product-centre scope and delivery principles.
- `docs/ARCHITECTURE.md` — actual runtime architecture and target architecture boundaries.

This matrix supplements those documents. It does not override them or assert that the complete global platform expansion is finished.
