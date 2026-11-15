# AI HR disciplinary-case contract checkpoint

**Checkpoint:** 2026-11-14 Jamaica local / 2026-11-15 UTC  
**Repository:** `ravaunrichards/Minglora-Social-Network`  
**Feature branch:** `feat/ai-hr-disciplinary-cases`  
**Pull request:** #353 — remains DRAFT  
**Inspected PR head:** `6a09065ad5a69a9c173f8ff44878ef7035d2b401`  
**Existing Supabase project:** `gzycobgbasnqqhnympkr`

## Release gate 1 — SQL contract: VERIFIED PASS

Inspected the additive migration `supabase/migrations/20261115033000_minglora_ai_hr_disciplinary_cases.sql` and its API/runtime/UI integration before executing a rollback-only contract.

The contract ran inside an explicit transaction against the existing Minglora project. Temporary test fixtures used an already-existing `public.profiles` actor and second profile, plus a temporary organization, identity, department, position and employment record. No profile, Auth user, or retained AI/HR record was created.

Assertions that completed without a database error:

1. Create one confidential disciplinary case.
2. Retry the identical create request using the same organization-scoped idempotency key; return the same case with `reused=true`.
3. Reject reusing that key with different case details.
4. Reject a future incident date.
5. Reject an incident date before the employment start date.
6. Reject an incident date after the employment end date.
7. Reject listing with a valid but non-owner profile.
8. Append an investigation note to history.
9. Accept `open → under_review → awaiting_response → resolved`.
10. Reject reopening a resolved case.
11. List exactly one case with five ordered history events.
12. Verify no direct SELECT for `anon` or `authenticated`, and no UPDATE/DELETE/TRUNCATE privilege on the history table for `service_role`.

Post-rollback verification confirms:
- Both proposed disciplinary tables do **not** exist.
- The proposed `public.minglora_ai_hr_disciplinary_command(text,uuid,jsonb)` function does **not** exist.
- Migration ledger remains unchanged; version `20261115033000` is absent.
- `ai_network.ai_organizations` = 0.
- `ai_network.ai_employment_records` = 0.
- `ai_network.ai_identities` = 0.
- `ai_network.ai_names` = 0.
- `ai_network.ai_profiles` = 0.

Therefore the SQL contract is validated, but the proposed migration and feature remain **not deployed**.

## Current code/CI verification on inspected PR head

- Full Minglora CI run #43678592601: **1,182 passed / 0 failed / 0 skipped**; all three jobs succeeded.
- Focused Minglora AI Network checks run #43678592591: **137 passed / 0 failed / 0 skipped**.
- AI Network Chromium browser acceptance run #43678592639: passed against disposable local fixtures, not production owner sessions.
- LIVE/MeetWave seven-plus-two layout visual QA run #43678592624: passed.
- No Edge Function deployment, Supabase migration application, Render deployment or production HR record creation occurred for this feature.
- Existing worker runtime remains paused/disabled with zero concurrent workers.

## Remaining PR release gates

- **Gate 1 — SQL migration/rollback contract:** VERIFIED COMPLETE.
- **Gate 2 — signed-in platform-owner acceptance:** BLOCKED until an authorized owner session can exercise the confidential HR API against a real owner-controlled organization/employee.
- **Gate 3 — migration and gateway rollout:** NOT STARTED; do not apply or deploy until owner acceptance and the normal release approval path are complete.
- **Gate 4 — desktop/mobile device acceptance:** NOT STARTED.

Keep PR #353 **DRAFT**. Do not merge or deploy this feature while gates 2–4 remain open.

## Scope and safety

This checkpoint belongs only to Minglora Social Network and its existing Supabase project. It does not enable AI workers, create email inboxes, connect providers, create retained AI identities, modify unrelated Minglora features, or claim full AI HR lifecycle completion.
