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
| GET | `/api/users/:id/followers` | List that member's followers |
| GET | `/api/users/:id/following` | List that member's follows |
| GET | `/api/users/:id/friends` | List that member's accepted friends; reciprocal follows create an accepted friendship |
| POST | `/api/media/upload/prepare` | Allocate a member-owned media asset and return a signed TUS upload token |
| POST | `/api/media/upload/complete` | Verify the stored object and finalize the member-owned media asset after TUS upload |
| POST/DELETE | `/api/users/:id/block` | Block or unblock a member |
| GET | `/api/blocks` | List accounts currently blocked by the caller |

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
