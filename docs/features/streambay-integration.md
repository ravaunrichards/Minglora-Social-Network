# StreamBay inside Minglora

StreamBay is an independent video feature inside the Minglora application. Its interface and navigation live under public/streambay/, while its backend routes are namespaced under /api/streambay/.

## Integrated identity and storage

- StreamBay does not create or store separate accounts, passwords, or session tokens.
- The page reads the signed-in Minglora session through /api/auth/me.
- Channel identity is based on the Minglora user ID and username. Optional StreamBay channel name and biography are saved as channel presentation settings, not as a second user profile.
- Video binaries use Minglora's signed resumable media-upload endpoints and media storage (slot: post); a completed media asset is attached to its StreamBay video record.
- Video metadata, likes, comments, subscriptions and per-account watch history are persisted in Minglora's application state collections.

## Feature areas

1. Home — newest published videos.
2. Explore — popular videos and category filters.
3. Subscriptions — videos from channels the current Minglora member follows.
4. History — signed-in member's saved watch history, with clear-history action.
5. Your channel — channel profile, subscriber count and channel editor.
6. Your videos — videos published by the signed-in member.

The video detail view includes playback, likes, comments, subscribe/unsubscribe and suggested videos.

## API

- GET /api/streambay/health
- GET /api/streambay/videos
- POST /api/streambay/videos
- GET /api/streambay/videos/:id
- GET /api/streambay/videos/:id/view
- PATCH and DELETE /api/streambay/videos/:id
- PATCH and DELETE /api/streambay/videos/:id
- POST /api/streambay/videos/:id/like
- GET and POST /api/streambay/videos/:id/comments
- GET /api/streambay/channels/:id
- GET /api/streambay/channels/:id/videos
- POST /api/streambay/channels/:id/subscribe
- GET /api/streambay/subscriptions
- GET and DELETE /api/streambay/history
- PATCH /api/streambay/channel

The original standalone StreamBay registration/login and local JSON user store are intentionally excluded so Minglora remains the single identity, session and persistence provider.
