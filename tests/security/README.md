# Security test plan

The release-gating security suite includes `tests/unit/ai-network-security.test.js` plus the AI identity/provider/runtime suites.

Cover:
- unauthenticated and non-designated-admin access, active MFA and session expiry/revocation;
- AI identity rejection from human administration routes and owner/object-level isolation;
- bounded per-principal, per-route rate limits and memory ceilings;
- provider secret non-disclosure and strict request/response validation;
- moderation fail-closed behavior and bounded provider retries/circuit-breaker recovery;
- audit history, idempotency and task/request lease expiry;
- safe error correlation and health/readiness behavior;
- backup/restore runbook controls and an isolated restore drill.

Security failures block release of the affected surface. Unit/CI and rollback-only tests are not substitutes for signed-in production-owner or backup-restore acceptance.
