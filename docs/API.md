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
| GET | `/api/feed` | Current authenticated feed |
| POST | `/api/posts` | Create a text post and optional HTTPS image URL |
| POST | `/api/posts/:id/reactions` | Toggle a supported reaction |
| POST | `/api/posts/:id/comments` | Add a comment |
| GET | `/api/users` | List other accounts and friendship status |
| GET | `/api/users/:id` | Read a profile and its posts |
| PATCH | `/api/users/me` | Update editable profile fields |

## Friends and groups

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/friends` | Accepted friends and incoming requests |
| POST | `/api/friends/:id/request` | Send a request or accept a reciprocal pending request |
| POST | `/api/friends/:id/accept` | Accept an incoming request |
| GET | `/api/groups` | List groups and membership state |
| POST | `/api/groups` | Create a group |
| POST | `/api/groups/:id/join` | Join a group |

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
- Missing resources return HTTP 404.
- The server caps JSON request bodies at 1 MB.
- Passwords are never returned in public account objects.
- Current API behavior is defined by `src/server.js`; update this document and tests whenever routes or payloads change.
