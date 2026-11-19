# Minglora Blockers and Verification Limits

> Current verified state: [.agent-work/EXECUTION_RECOVERY_CHECKPOINT_20261119.md](EXECUTION_RECOVERY_CHECKPOINT_20261119.md). Older checkpoint statements below are preserved for audit but superseded by live verification.

## Active verified blockers / acceptance gates — 2026-11-19

### Admin Center roles and access
- PR #539 is still a draft. Marketplace Manager exists in source as a non-assignable role with `marketplace:read` and `marketplace:manage`; production migration is not applied.
- Server-side permission-scoped authorization has not been implemented across every Admin API route/RPC. Existing owner/MFA guards remain in place and must not be weakened.
- The source scan identified 35 Admin API route clauses in `src/server.js`; six clauses (finance attachments, finance records, RBAC and Admin access) have been inspected. The full route/action permission matrix remains incomplete.
- Recovery-admin controls and configurable second-person approval for high-value financial actions are not implemented.
- Latest RBAC unit coverage: 8/8 passed. The full CI test job still fails only on the same LIVE speaker stage-join and Rankings badge asset-version tests that also fail on current `main`.
- Nine-layout visual QA for the latest PR head was still running at the last check. Do not claim pass before the workflow reports success.

### Mainline CI
- Current `main` commit is `8f0a6a4f65955e5b3da0ac03d960b41b8158f4f4`.
- Main CI run `44457780374` is failed on:
  - `Accepted LIVE speaker requests open the guest panel and require an explicit stage join`
  - `Ranking badge art remains visible around a compact centered member photo on desktop and mobile`
- The same failures occur on the RBAC PR test job. They are outside this Admin Finance/RBAC source change and must remain visible; do not silently modify unrelated functionality.

### Finance and external providers
- Finance implementation is merged, but owner/MFA browser acceptance, the Supabase provider probe through the UI and a first private invoice/receipt upload/download remain unverified.
- Live company finance registers have zero subscriptions, budgets, invoices, expenses and finance audit events. Do not add demo records.
- Provider directory candidates do not prove accounts are registered or connected. No payment, renewal, subscription purchase or provider account action was performed.
- No company bank balance, company payment vault or direct company bill-payment integration is verified. Payment actions must remain manual/provider-hosted until verified integrations exist.

### Live deployment and production
- Render service `minglora-social-network-temp` is LIVE on current main commit `8f0a6a4f65955e5b3da0ac03d960b41b8158f4f4`; deployment `dep-dbv7i67trrvc73bd7jg0`.
- Supabase project `gzycobgbasnqqhnympkr` is ACTIVE_HEALTHY; `minglora-runtime-state` is ACTIVE version 142.
- No Marketplace Manager production migration or Admin RBAC Edge Function deployment has been performed from PR #539.
- No authenticated owner browser acceptance was available for this inspection. Do not simulate or bypass MFA or declare browser-only acceptance complete.

## Progress limits
- Current `MS-ADMIN-RBAC-02` estimate: 55.3% across its eight original work bullets with equal weighting; detailed coverage is in `.agent-work/STAGE_QUEUE.md`.
- Overall Admin Center and repository-wide completion are NOT MEASURABLE without a complete weighted acceptance inventory. Do not invent global percentages.

## Historical blocker snapshot (preserved; not current)

## Access and roles

- The current Admin Centre's sensitive routes remain tied to the designated owner identity and MFA-verified session.
- The staff table contains one active owner and one inactive reviewer. Its legacy constraint allows owner/admin/moderator/reviewer, not the nine distinct roles in the master specification.
- No delegated Finance, Technical, Security, Content, Creator, Marketplace, Support or Auditor roles were activated or assigned.
- Do not weaken current owner/MFA protections before a tested server-side permission catalog, migrations, route/RPC authorization and audit coverage are complete.

## Infrastructure and external providers

- Minglora Supabase project gzycobgbasnqqhnympkr reports ACTIVE_HEALTHY in us-east-1; minglora-runtime-state is ACTIVE at version 129.
- The connected Creator Hub Render workspace tea-dbphlfk9v7es73bu7amg returned an empty services list. No Render service, deployment, deployment URL or live Admin Centre health was verified.
- The empty result only describes the queried connected workspace; it does not prove there are no Render resources in any other workspace or account.
- No minglora.com registration, registrar ownership, DNS nameserver, SSL or renewal state was verified.
- No Cloudflare, Namecheap, LiveKit, PayPal, WiPay, Apple, Google Play, Firebase, email/SMS, AI, analytics, CDN or monitoring provider account was verified as connected by the provider directory.
- Existing repository progress notes have documented hosted LiveKit configuration as not configured; confirm actual current provider configuration before implementing provider-dependent LIVE/calling controls.

## Production and browser verification

- GitHub CI verifies source syntax and automated tests, not the current live Admin Centre browser session.
- PR #333's Playwright layout QA run passed, but it was the existing LIVE/MeetWave layout matrix, not a specific Admin Finance visual test.
- The designated owner's authenticated browser session and MFA code were not available through the repository/database inspection workflow. No owner-session action was simulated or bypassed.
- No production Render deployment or post-deploy browser smoke test was performed.

## Project-wide limits

- Repository-wide completion percentage is not measurable; the entire backlog has not been decomposed and weighted.
- The repository has over 1,000 tracked paths; not every product, client, route and provider has received an exhaustive end-to-end audit in this task.
- Do not claim the entire Admin Center or master specification is complete. Only the bounded Finance audit-history source slice and verified CI/merge steps are complete.
- Preserve retired consumer Marketplace scope. Admin-only Marketplace administration is part of the requested Admin Center scope, but it does not authorize reactivating the consumer marketplace.

## Resolved verification items

- PR #333 was mergeable at its recorded head SHA and merged with an expected-head guard.
- Post-merge branch main points to 4bb3a9360a6e4b5b620560c0b3e65cea37a145fd.
- Post-merge CI run 43638100531 passed.
