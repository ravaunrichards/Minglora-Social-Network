# HTTP API contract

All endpoints are same-origin and use JSON request/response bodies unless noted. Except for health and authentication endpoints, routes require a valid signed session cookie.

## Health and authentication

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Process health |
| POST | `/api/auth/register` | Public | Create an account |
| POST | `/api/auth/login` | Public | Authenticate with email and password |
| POST | `/api/auth/logout` | Public | Revoke current session |
| GET | `/api/auth/me` | Public | Return current account or null |

## Feed and profiles

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/feed` | Current authenticated feed; `scope=all|following|friends`; optional cursor pagination with `?limit=20&cursor=...` |
| POST | `/api/posts` | Create a text post and optional HTTPS image URL |
| PATCH | `/api/posts/:id` | Edit own post |
| DELETE | `/api/posts/:id` | Delete own post and saved-post references |
| POST | `/api/posts/:id/reactions` | Toggle a supported reaction |
| POST | `/api/posts/:id/comments` | Add a comment |
| DELETE | `/api/posts/:id/comments/:commentId` | Delete a comment as its author or the post author |
| GET | `/api/saved-posts` | List the current account's saved posts |
| POST/DELETE | `/api/posts/:id/save` | Save or unsave a post |
| GET | `/api/users` | List other accounts and friendship status |
| GET | `/api/users/:id` | Read a profile and its posts; blocked pairs return not found |
| PATCH | `/api/users/me` | Update editable profile fields |
| POST/DELETE | `/api/users/:id/follow` | Follow or unfollow a member |
| GET | `/api/users/:id/followers` | List that member's followers |
| GET | `/api/users/:id/following` | List that member's follows |
| POST/DELETE | `/api/users/:id/block` | Block or unblock a member |
| GET | `/api/blocks` | List accounts currently blocked by the caller |

## Friends and groups

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/friends` | Accepted friends and incoming requests |
| POST | `/api/friends/:id/request` | Send a request, accept a reciprocal pending request, or retry a declined request |
| POST | `/api/friends/:id/accept` | Accept an incoming request |
| POST | `/api/friends/:id/decline` | Decline an incoming request |
| DELETE | `/api/friends/:id` | Cancel own pending request or remove an accepted friendship |
| GET | `/api/groups` | List groups and membership state |
| POST | `/api/groups` | Create a group |
| GET | `/api/groups/:id` | Read public group details and discussion posts |
| POST | `/api/groups/:id/join` | Join a group |
| DELETE | `/api/groups/:id/join` | Leave a group (owner cannot leave without transfer/deletion) |
| POST | `/api/groups/:id/posts` | Publish a text post as a group member |
| DELETE | `/api/groups/:id/posts/:postId` | Delete a group post as author or group owner |

## Stories

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/stories` | List active stories the current account may view |
| POST | `/api/stories` | Create a text and/or HTTPS-image story with an audience |
| POST | `/api/stories/:id/view` | Record a story view; author can inspect viewer list |
| DELETE | `/api/stories/:id` | Delete own story |

Stories expire after 24 hours; expired records and their view records are removed when story endpoints are accessed. Audience values are `public`, `friends`, `followers`, and `private`. Story image uploads/video processing are not implemented; stories can reference HTTPS image URLs or contain text.

## Messages, notifications and search

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/messages` | Current account's direct conversations |
| POST | `/api/messages` | Send a direct text message |
| GET | `/api/notifications` | Current account's notifications |
| POST | `/api/notifications/read` | Mark all current account notifications as read |
| GET | `/api/search?q=...` | Search accounts, posts and groups |

## General behavior

- JSON API responses use `Cache-Control: no-store`.
- Unauthenticated access to protected routes returns HTTP 401.
- Invalid input returns a 4xx response with an `error` message.
- `GET /api/feed` returns all current posts when no pagination parameters are supplied. If `limit` or `cursor` is supplied, it returns `{ posts, nextCursor, hasMore }`; `limit` must be an integer from 1 to 100 (default 20 when only a cursor is supplied). Treat `nextCursor` as an opaque value.
- Missing resources return HTTP 404.
- The server caps JSON request bodies at 1 MB.
- Passwords are never returned in public account objects.
- Post updates and deletions are restricted to the post author. Unavailable posts in blocked relationships return not found for read/reaction/comment/save flows. Blocking removes the existing friend and follow edges between the two accounts.
- Current API behavior is defined by `src/server.js`; update this document and tests whenever routes or payloads change.
