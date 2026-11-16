# Minglora Engineering Decisions

## Repository and execution

1. The only code repository in scope is ravaunrichards/Minglora-Social-Network.
2. Use the existing Minglora Supabase project gzycobgbasnqqhnympkr; do not create a duplicate project or duplicate infrastructure.
3. Reverify main before creating each implementation branch. This checkpoint records main commit 4bb3a9360a6e4b5b620560c0b3e65cea37a145fd.
4. Make incremental changes, preserve working behavior and use CI plus targeted acceptance checks before merging.
5. Keep whole-project completion unquantified until the backlog has independently testable, weighted tasks.
6. Never call a stage complete based solely on a page, folder, mock UI or untested provider entry.

## Admin access and security

7. Keep the existing designated-owner and MFA boundary on sensitive Admin Centre and finance operations until a complete server-side role/permission model replaces it safely.
8. The target delegated roles are Super Administrator, Finance Administrator, Technical Administrator, Security Administrator, Content Administrator, Creator Manager, Marketplace Manager, Support Administrator and Read-only Auditor.
9. Do not assign a role to a guessed or unverified account. Assignment and revocation must be authenticated, MFA-protected and audited.
10. Every privileged route, RPC and data read/write must enforce permission server-side. Hiding a menu item is not authorization.
11. Sensitive payment, payout, refund, subscription and infrastructure actions need explicit confirmation and configurable second-person approval thresholds.
12. Store secrets in server-side secret management or encrypted environment configuration. Never place raw API keys, tokens, card numbers, CVV, banking passwords or signing private keys in frontend code or ordinary Admin Centre records.

## Finance and accounting

13. Company operating funds, creator liabilities, seller liabilities, customer refunds, processor fees and tax obligations remain separate.
14. Store original invoice currency and integer minor-unit amounts. Preserve source amount/currency and any separately dated exchange-rate conversion.
15. The Finance tables remain protected by RLS and deny browser roles. Server-side service_role performs approved operations; finance audit history remains append-only.
16. Do not mark a provider connected until its actual supported connection test passes and the provider result is recorded.
17. Do not mark an invoice paid until a verified provider confirmation or webhook is received.
18. Do not claim or perform universal bill payment. Use an official provider billing portal when no approved payment API exists.
19. No auto-renewal, upgrade or paid subscription is enabled without a verified service, approved budget and explicit authorization.
20. Do not count unpaid creator or seller payable balances as company profit.
21. The planned 50% Minglora / 50% eligible creator gift revenue share remains a configurable policy; statements and actual payouts must reconcile against the real ledger and fees.

## Providers and infrastructure

22. The 42 provider-directory entries are candidates, not connected accounts. Preserve not_registered/not_connected until verified.
23. Prefer existing working services; do not subscribe to every candidate or duplicate hosting, database, storage, email or media services.
24. Treat Render service/deployment status as unknown until the actual workspace/service is accessible and its deployment/health is read.
25. Do not create or advertise subdomains until DNS, TLS and route configuration are actually deployed and verified.
26. Domain ownership, provider accounts, pricing, usage, subscription terms and renewal dates must come from verified provider evidence or owner-entered records clearly identified as manual.

## Scope and product behavior

27. Build the Admin Centre as an administration-only workspace. Ordinary members must not see administrative controls, internal service credentials or private finance data.
28. Admin-only Marketplace management is allowed within the explicit Admin Center specification. It does not reactivate the retired consumer-facing Marketplace.
29. Keep user messages private from ordinary administrators. Any exceptional safety/legal access must be narrowly scoped and audited.
30. No new Supabase project, Render service, paid integration, domain purchase or paid plan is created without required authorization and cost review.
31. Preserve existing LIVE, calling, creator and social features; provider-dependent behavior must report genuine connection/configuration state.
