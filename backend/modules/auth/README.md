# Authentication and accounts

**Current:** new accounts are created through Minglora's trusted Supabase Auth gateway and are confirmed at creation. Email/password sign-in, logout, password recovery, TOTP MFA, signed HttpOnly app sessions, and per-device session listing/revocation are implemented. Every successful device sign-in creates a distinct app session; signing out one device must not sign out another.

**Multi-device invariant:** Supabase Auth's optional **Single session per user** restriction must remain disabled. Keep the app cookie scoped to the Minglora origin, HttpOnly, SameSite=Lax, and Secure in production. Do not share cookies between devices or store passwords/tokens in browser local storage. Keep SESSION_SECRET stable across deployments so valid application sessions are not invalidated by routine restarts.

**Operational limits:** the app's login-attempt map is process-local; Supabase Auth also enforces provider rate limits. Before scaling beyond the currently documented single API instance, move session/account state to transaction-safe per-record storage and use a shared rate limiter. Production password recovery requires working Supabase Auth redirect allow-lists and a configured, verified custom SMTP sender; successful HTTP response alone is not proof of mailbox delivery.

**Ownership:** credentials, identity lifecycle, token/session revocation, account status and security events. Never expose password hashes, refresh tokens or session secrets. Test expiry, refresh-token rotation, independent device sessions, single-device logout, revocation, duplicate identities, invalid credentials, throttling, account-enumeration risks, password recovery and MFA assurance levels.
