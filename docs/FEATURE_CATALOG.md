# Minglora social-network feature catalog

**Audit date:** 2026-11-10  
This is a concise status index, not a claim of Facebook parity. The detailed comparison, verified evidence, gaps and prioritized completion order are in [FACEBOOK_PARITY_AUDIT.md](FACEBOOK_PARITY_AUDIT.md). The implementation-specific status is maintained in [FEATURES.md](FEATURES.md).

## Current runtime status

| Domain | Status | Summary |
|---|---|---|
| Accounts and security | Present / Partial | Supabase Auth, registration/sign-in, OAuth, session lifecycle, password recovery, MFA and account switching; passkeys, login alerts and complete deletion/erasure remain gaps. |
| Profiles | Present / Partial | Profile details, About sections, avatar/cover uploads and crop, profile status, activity, archive and Highlights; photo tagging and stronger identity verification remain gaps. |
| Feed and posts | Present / Partial | All/Following/Friends/For You scopes, post creation/edit/delete, uploaded media, saved posts and reactions; post audience controls, advanced ranking and full comment lifecycle remain incomplete. |
| Friends and follows | Present / Partial | Friend requests/lists, custom lists, follows, reciprocal-follow friendship and block/unblock; mute/restrict and advanced relationship controls remain incomplete. |
| Stories | Present / Partial | Stories with audience enforcement, expiry and view tracking; Highlights and archive exist; scheduling, interactive tools and advanced moderation remain incomplete. |
| Photos and albums | Partial | Avatar/cover media and profile album API/editor are present; full Photos destination, tagging and shared albums remain incomplete. |
| Reels and video | Present / Partial | Reels-format posts, For You video feed, Video Centre, sound tools, Watch Later and account-synced playlists with owner controls and privacy-aware sharing; full channel subscriptions, automated transcoding and advanced creator analytics remain incomplete. |
| Messenger | Present / Partial | Direct/group chats, attachments, voice notes, GIFs/stickers, reactions, read state, WebSocket updates and call entry points; end-to-end encryption and robust multi-instance delivery remain incomplete. |
| Voice/video calls and LIVE | Blocked / Partial | Substantial LiveKit calling and LIVE code exists, but the inspected Render runtime reports LiveKit credentials are not configured. |
| Groups | Partial | Public groups and member discussions exist; private groups, role hierarchy, invitations, events and advanced moderation remain incomplete. |
| Pages | Partial | Page discovery, follows, publishing, team roles and basic insights exist; Page inbox, complete engagement tools and advanced analytics remain incomplete. |
| Events and check-ins | Partial | Calendar/events, RSVP and profile check-ins exist; Local discovery, ticketing and advanced event management remain incomplete. |
| Notifications | Present / Partial | In-app notification centre and preferences exist; Web Push is supported but provider/device delivery needs configuration verification. |
| Creator Studio and monetization | Present / Partial | Creator workspace, subscriptions, gifts, coins, earnings and PayPal payout paths exist; analytics, drafts and some payout operations remain incomplete/configuration-dependent. |
| Search and recommendations | Partial | Basic search, people discovery and video recommendations exist; indexed relevance search, advanced filters and full interest controls are missing. |
| Marketplace | Retired | Migrations 072 and 073 remove Marketplace schema and runtime-state records; current menu marks it coming soon. |
| Jobs | Retired | Migrations 072 and 073 remove job-related records and runtime-state collections. |
| Dating, Memories, Fundraisers | Missing | No end-to-end implementations were found in the current runtime. |
| Ads Manager and ad preferences | Missing | Existing menu items are placeholders; no active end-to-end advertiser or ad-preference product was verified. |
| Games / Instant Games | Missing / Partial | Creator Leagues and LIVE mobile-gaming mode exist; no game catalogue or playable instant-games product was verified. |
| AI assistant and AI creation | Missing | No integrated AI Mode, Creator Assistant, AI comment summaries, Group Ask or AI listing/creation tool was verified. |
| Native platform clients | Partial / Missing | Browser UI is implemented; Android is a WebView shell/update workflow; iOS, desktop and TV clients remain planned. |
| Data, privacy and operations | Partial | Supabase-backed durable state, reports, moderation, export and privacy controls exist; route-wide privacy review, normalized transactional repositories, backup/restore and multi-instance readiness remain incomplete. |

## Empty-state and completion rules

- A new account must have honest empty states. Never invent users, posts, reactions, messages, products, ratings, sales, views or engagement counts.
- A README, placeholder screen, historical migration or SQL table is not proof of a working feature.
- A capability becomes Present only after its responsive UI, server authorization, privacy enforcement, durable persistence, tests and deployed configuration are verified.
- Do not reapply retired Marketplace/Jobs migrations or run destructive data changes as part of a feature-parity review.
