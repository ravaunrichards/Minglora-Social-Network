# Realtime transport

**Current:** messaging uses request/response APIs.

Authenticate each connection, authorize channel/conversation membership, validate events, enforce limits, and revoke access on logout/blocking. Persist messages before broadcasting them and support recovery of missed events after reconnect.