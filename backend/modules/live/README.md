# Minglora live video and calls — LiveKit integration

## Provider isolation

Minglora uses its own LiveKit Cloud project named **Minglora**. Do not reuse ZUNO, Zovara, or another product's LiveKit URL, API key, API secret, room names, or credentials.

LiveKit Cloud project creation is performed in the LiveKit Cloud dashboard. The LiveKit CLI's project commands configure local CLI references; they do not create a Cloud project.

## Server integration

The current Node.js API integrates the official \`livekit-server-sdk\` package. API keys and secrets are read only from server environment variables:

- \`LIVEKIT_URL\`
- \`LIVEKIT_API_KEY\`
- \`LIVEKIT_API_SECRET\`

Never expose \`LIVEKIT_API_SECRET\` in browser code, public build variables, API responses, repository files, or logs.

## Implemented API foundation

All routes below require a signed-in Minglora account.

- \`GET /api/live/status\`: reports whether the three server-side LiveKit settings are present; it never returns secrets.
- \`GET /api/live/sessions\`: lists currently live sessions visible to the signed-in member.
- \`POST /api/live/sessions\`: creates a Minglora live session and returns a host access token.
- \`POST /api/live/sessions/:id/join\`: checks session visibility and returns a subscriber-only viewer token, or a publishing token for the host.
- \`POST /api/live/sessions/:id/leave\`: marks the signed-in participant as having left.
- \`POST /api/live/sessions/:id/end\`: lets only the host end the Minglora session.

Session state is persisted with the existing application persistence adapter. Rooms are created by LiveKit when the first authorized client connects. Host tokens can publish; viewer tokens can subscribe but cannot publish audio, video, or data. Tokens have a two-hour expiry. The client must disconnect on leave/end and request a fresh token when reconnecting after expiry.

## Current limitations

This is the server-side LiveKit integration foundation, not a finished livestream product UI. The browser UI does not yet implement LiveKit room connection, camera/microphone controls, guest requests, co-host moderation, stream recording/egress, or a verified LiveKit webhook receiver. Do not advertise those features as complete until implemented and tested. Ended sessions are no longer listed or joinable through Minglora's API; clients should disconnect when the host ends a session.

## Cloud project setup

1. Sign in to [LiveKit Cloud](https://cloud.livekit.io/).
2. Create exactly one Cloud project named **Minglora**.
3. In project Settings, create an API key and secret.
4. Configure the three environment variables above in Minglora's server hosting environment.
5. Do not commit the secret or paste it into source files.

LiveKit's Build plan currently starts at US$0/month with no credit card required. See [LiveKit pricing](https://livekit.com/pricing).
