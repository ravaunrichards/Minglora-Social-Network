# Authentication and accounts

**Current:** basic registration/login/logout and signed-cookie session behavior exist. Verification, recovery, MFA, session/device management and rate limiting are incomplete.

**Ownership:** credentials, identity lifecycle, token/session revocation, account status and security events. Never expose password hashes or session secrets. Test expiry, revocation, duplicate identities, invalid credentials, throttling and account-enumeration risks.