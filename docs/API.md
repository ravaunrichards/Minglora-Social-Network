# HTTP API contract

All endpoints are same-origin and use JSON request/response bodies unless noted. Except for health and authentication endpoints, routes require a valid signed session cookie.

## Health and authentication

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Process health |
| POST | `/api/auth/register` | Public | Create an account |
| POST | `/api/auth/login` | Public | Authenticate; returns an MFA challenge when a verified TOTP factor requires verification |
| POST | `/api/auth/logout` | Public | Revoke current session |
| GET | `/api/auth/me` | Public | Return current account or null |
| POST | `/api/auth/password/reset/request` | Public | Request a password-recovery email |
| POST | `/api/auth/password/reset/complete` | Public | Set a new password using the recovery access token |
| POST | `/api/auth/mfa/login` | Public | Complete a pending authenticator sign-in challenge |

## Feed and profiles

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/feed` | Current authenticated feed; `scope=all|following|friends`; optional cursor pagination with `?limit=20&cursor=...` |
| POST | `/api/posts` | Create a text post with uploaded mediaIds only; image URLs are rejected |
| PATCH | `/api/posts/:id` | Edit own post |
| DELETE | `/api/posts/:id` | Delete own post and saved-post references |
| POST | `/api/posts/:id/reactions` | Toggle a supported reaction |
| POST | `/api/posts/:id/comments` | Add a comment |
| DELETE | `/api/posts/:id/comments/:commentId` | Delete a comment as its author or the post author |
| GET | `/api/saved-posts` | List the current account's saved posts |
| POST/DELETE | `/api/posts/:id/save` | Save or unsave a post |
| GET | `/api/users` | Lightweight list of other accounts and friendship status |
| GET | `/api/discovery/people` | Privacy-filtered member previews with real recent posts, currently visible stories, relationship counts and mutual-connection counts; verified LIVE presence is obtained separately from `/api/live/sessions` |
| GET | `/api/users/:id` | Read a profile and its posts; blocked pairs return not found |
| PATCH | `/api/users/me` | Update display name, unique username, bio and location; profile media is uploaded separately |
| POST/DELETE | `/api/users/:id/follow` | Follow or unfollow a member |
| GET | `/api/users/:id/followers` | List visible followers, excluding blocked or privacy-inaccessible profiles; requires a session |
| GET | `/api/users/:id/following` | List visible profiles followed by the member, excluding blocked or privacy-inaccessible profiles; requires a session |
| GET | `/api/users/:id/friends` | List that member's accepted friends; reciprocal follows create an accepted friendship |
| POST | `/api/media/upload/prepare` | Allocate a member-owned media asset and return a signed TUS upload token |
| POST | `/api/media/upload/complete` | Verify the stored object and finalize the member-owned media asset after TUS upload |
| POST/DELETE | `/api/users/:id/block` | Block or unblock a member |
| GET | `/api/blocks` | List accounts currently blocked by the caller |

## Marketplace

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/marketplace/categories` | List supported product/service categories and currencies |
| GET | `/api/marketplace/listings` | Browse active listings with query, type, category, location and sort filters |
| POST | `/api/marketplace/listings` | Publish a seller-owned listing with up to 8 uploaded photos |
| GET | `/api/marketplace/listings/:id` | Read an active listing or the seller's own inactive listing |
| PATCH/DELETE | `/api/marketplace/listings/:id` | Seller-only status management or removal |
| POST/DELETE | `/api/marketplace/listings/:id/save` | Save or unsave an active listing |
| GET | `/api/marketplace/saved` | List saved active listings |
| GET | `/api/marketplace/mine` | List the signed-in seller's listings and statuses |
| POST | `/api/marketplace/listings/:id/enquiries` | Send an enquiry to the seller through Minglora Inbox |
| GET/POST | `/api/marketplace/seller` | Read or submit the signed-in member's seller application |
| GET | `/api/marketplace/admin/sellers?status=pending` | Moderator-only seller application list |
| GET | `/api/marketplace/admin/queue` | Moderator-only seller and job-posting review queue |
| PATCH | `/api/marketplace/admin/sellers/:userId/review` | Moderator seller decision with identity status and audit reason |
| POST | `/api/marketplace/checkout/quote` | Calculate a short-lived informational quote from server-held listing prices and fulfilment rates |
| GET | `/api/marketplace/checkout/status` | Return provider, payout, tax and checkout blockers; order creation is currently reported disabled |
| GET | `/api/marketplace/orders` | List orders where the member is buyer or seller (Supabase-backed path) |
| POST | `/api/marketplace/orders` | Request idempotent order creation from a valid quote; database gates require provider approval, checkout/payout enablement, verified sellers and a completed tax calculation |
| GET | `/api/marketplace/orders/:id` | Read an order visible to the buyer or participating seller |
| POST | `/api/marketplace/orders/:id/cancel` | Request cancellation under the order state rules |
| GET/POST | `/api/marketplace/bookings` | List participant bookings or request a service appointment from a verified seller |
| PATCH | `/api/marketplace/bookings/:id` | Seller accepts/declines or marks provider completion; buyer may cancel or confirm completion |

Marketplace photos use signed upload endpoints with `slot=marketplace`. Checkout quotes are informational; they do not reserve stock or take payment. The SQL order path includes idempotency and atomic inventory reservations, but the public checkout-status response currently reports `orderCreationEnabled: false`. Live payment capture, seller settlement/payouts, refunds, tax/customs and buyer protection remain disabled or unfinished. Service booking requests do not collect payment. Local JSON development mode does not provide the normalized transactional Marketplace store.

## Jobs

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/jobs?q=...&category=...&location=...` | Search published, non-expired vacancies |
| GET | `/api/jobs/mine` | List the signed-in employer's vacancies |
| GET | `/api/jobs/applications/mine` | List the signed-in candidate's applications |
| POST | `/api/jobs` | Submit an employer vacancy for moderator review |
| PATCH | `/api/jobs/:id/review` | Moderator publishes or rejects a pending vacancy with a reason |
| PATCH | `/api/jobs/:id` | Employer pauses or closes an open vacancy |
| POST | `/api/jobs/:id/applications` | Candidate submits an application and cover letter |
| GET | `/api/jobs/:id/applications` | Employer reviews applications for their vacancy |
| PATCH | `/api/jobs/applications/:id` | Employer reviews, shortlists, rejects or hires; candidate may withdraw |

Jobs are separate from Marketplace payments and the commerce ledger. Resume upload, employer verification, interview scheduling, offer documents and payroll are not implemented.

## Friends and groups

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/friends` | Accepted friends and incoming requests; reciprocal follows automatically create friendship records |
| POST | `/api/friends/:id/request` | Send a request, accept a reciprocal pending request, or retry a declined request |
| POST | `/api/friends/:id/accept` | Accept an incoming request |
| POST | `/api/friends/:id/decline` | Decline an incoming request |
| DELETE | `/api/friends/:id` | Cancel own pending request or remove an accepted friendship |
| GET | `/api/groups` | List groups and membership state |
| POST | `/api/groups` | Create a group |
| GET | `/api/groups/:id` | Read public group details and discussion posts |
| POST | `/api/groups/:id/join` | Join a group |
| DELETE | `/api/groups/:id/join` | Leave a group (owner cannot leave without transfer/deletion) |
| POST | `/api/groups/:id/posts` | Publish a post as a group member using text and uploaded mediaIds; pasted image URLs are rejected |
| DELETE | `/api/groups/:id/posts/:postId` | Delete a group post as author or group owner |

## Pages

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/pages` | List active Pages and current follow/role state |
| POST | `/api/pages` | Create a Page with a unique handle; creator becomes owner |
| GET | `/api/pages/:id` | Read a Page and its published posts |
| DELETE | `/api/pages/:id` | Delete a Page as its owner, including its posts and follows |
| POST/DELETE | `/api/pages/:id/follow` | Follow or unfollow a Page |
| POST | `/api/pages/:id/posts` | Publish a Page post with text and uploaded media references as a Page owner/admin/editor; pasted image URLs are rejected |
| DELETE | `/api/pages/:id/posts/:postId` | Delete a Page post as its publisher or Page owner/admin |

The current UI assigns only the creator/owner role; an interface for appointing additional Page admins/editors is not implemented.

## Stories

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/stories` | List active stories the current account may view |
| POST | `/api/stories` | Create a text story and/or one uploaded photo/video using a mediaId; pasted image URLs are rejected |
| POST | `/api/stories/:id/view` | Record a story view; author can inspect viewer list |
| DELETE | `/api/stories/:id` | Delete own story |

Stories expire after 24 hours; expired records and their view records are removed when story endpoints are accessed. Audience values are `public`, `friends`, `followers`, and `private`. Stories accept uploaded image/video assets only; private media is served with expiring signed URLs. Story files are limited to 200 MB each; automated video transcoding is not implemented.

## Account security

| Method | Path | Purpose |
|---|---|---|
| GET | /api/security/sessions | List the signed-in member's active sessions |
| DELETE | /api/security/sessions/:id | Revoke one owned session |
| POST | /api/security/sessions/revoke-others | Revoke every session except the current device |
| POST | /api/security/password | Change the current password after re-authentication |
| POST | /api/security/email | Request an email change with provider confirmation |
| GET | /api/security/mfa | List authenticator factors and status |
| POST | /api/security/mfa/totp/enroll | Start TOTP authenticator enrollment |
| POST | /api/security/mfa/totp/verify | Verify the TOTP challenge and enable the factor |
| DELETE | /api/security/mfa/factors/:id | Remove an owned authenticator factor |

## Reporting, moderation and support

| Method | Path | Purpose |
|---|---|---|
| POST | /api/reports | Submit a member report for a supported target and reason |
| GET | /api/reports/mine | List reports submitted by the current member |
| GET | /api/moderation/access | Indicate whether the current account has moderator access |
| GET | /api/moderation/reports?status=open | Moderator-only report queue |
| PATCH/DELETE | /api/moderation/reports/:id | Moderator review, dismissal or supported content/account action |
| GET | /api/support/tickets | List the member's tickets; moderators may request ?scope=all |
| POST | /api/support/tickets | Create a support ticket and its first message |
| POST | /api/support/tickets/:id/messages | Reply to an owned or moderator-accessible ticket |
| PATCH | /api/support/tickets/:id | Close a member ticket or update its status as moderator |

Moderator access is restricted to MODERATOR_USER_IDS or a trusted account with an explicit admin/moderator role. Do not add arbitrary member IDs to this list.

## Voice and video calls

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/calls/incoming` | List unexpired invitations for the signed-in member; ringing invitations expire after 45 seconds |
| POST | `/api/calls` | Start an audio or video call with one to seven other members; the server provisions an eight-person LiveKit room and checks participant availability/privacy |
| GET | `/api/calls/:id/status` | Read call and participant state for a caller or invited/joined participant |
| POST | `/api/calls/:id/join` | Accept an invitation or reconnect a participant and receive a short-lived LiveKit token |
| POST | `/api/calls/:id/decline` | Decline an invitation |
| POST | `/api/calls/:id/cancel` | Cancel a ringing call as its creator |
| POST | `/api/calls/:id/leave` | Leave a call without ending it for other participants; the room ends when no participant remains |
| POST | `/api/calls/:id/end` | End the call for everyone as its creator |
| POST | `/api/calls/:id/invite` | Invite additional members while joined, subject to the eight-person room limit |
| GET/POST/DELETE | `/api/calls/ringtone` | Read, select or remove the signed-in member's private uploaded ringtone |

Calls require configured and reachable LiveKit credentials. The browser uses LiveKit for encrypted real-time audio/video transport, while Minglora stores invitation and participant lifecycle state. Web Push can display incoming-call notifications in the background when push is configured; custom uploaded songs play while the app is open because browsers do not allow a web service worker to install arbitrary operating-system ringtones. Provider rooms are removed on cancellation, decline, expiry, host end and final participant departure.

## LIVE streaming

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/live/status` | Verify the Minglora LiveKit provider connection without exposing credentials |
| GET | `/api/live/sessions` | List only sessions whose host is currently present in the corresponding LiveKit room; includes provider-verified viewer counts |
| POST | `/api/live/sessions` | Create a live broadcast and issue a host publishing token |
| POST | `/api/live/sessions/:id/join` | Join an allowed live session; hosts can publish and viewers can subscribe only |
| POST | `/api/live/sessions/:id/leave` | Mark the current participant as having left |
| POST | `/api/live/sessions/:id/end` | End a host-owned broadcast and close its LiveKit room |
| GET/PATCH | `/api/live/sessions/:id/theme` | Read or update the host-selected room theme |
| GET/POST | `/api/live/sessions/:id/chat` | Read or send messages in a live chat |

The browser LiveKit client is responsible for connecting to the room and attaching published media tracks. Coins catalogue and wallet services are optional enrichments: a gifting-service failure must not block the LIVE directory or interrupt an established video session.

## Messages, notifications and search

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/messages` | Current account's established direct conversations, history and unread counts |
| GET | `/api/messages/gifs?q=...` | Search Tenor GIFs through Minglora's server (requires private `TENOR_API_KEY`) |
| POST | `/api/messages` | Send text, up to five authorized attachments, a Minglora sticker or verified Tenor GIF |
| POST | `/api/messages/:peerId/read` | Mark incoming messages from the selected conversation member as read; returns the number updated |
| GET | `/api/notifications` | Current account's notifications |
| POST | `/api/notifications/read` | Mark all current account notifications as read |
| GET | `/api/search?q=...` | Search accounts, posts, groups and active Pages; blocked accounts/Pages are filtered |

## General behavior

- JSON API responses use `Cache-Control: no-store`.
- Unauthenticated access to protected routes returns HTTP 401.
- Invalid input returns a 4xx response with an `error` message.
- `GET /api/feed` returns all current posts when no pagination parameters are supplied. If `limit` or `cursor` is supplied, it returns `{ posts, nextCursor, hasMore }`; `limit` must be an integer from 1 to 100 (default 20 when only a cursor is supplied). Treat `nextCursor` as an opaque value.
- Missing resources return HTTP 404.
- The server caps JSON API and upload-control messages at 1 MB. Media bytes upload directly to Supabase Storage through signed TUS resumable uploads in 6 MB chunks, with automatic retry and browser progress reporting. Per-file limits are 10 MB for profile pictures, 20 MB for cover photos, 200 MB for Stories, and 500 MB for post/group/Page attachments. The API verifies ownership, stored size, MIME type and file signatures before finalizing an asset. Private post/story assets use expiring signed viewing URLs.
- Passwords are never returned in public account objects.
- Post updates and deletions are restricted to the post author. Unavailable posts in blocked relationships return not found for read/reaction/comment/save flows. Blocking removes the existing friend and follow edges between the two accounts.
- Current API behavior is defined by `src/server.js`; update this document and tests whenever routes or payloads change.
