# Minglora AI Network — Task 3 live database contract checkpoint

Date: 2026-11-15
Project: `ravaunrichards/Minglora-Social-Network`
Base: `main` at `6125afeb5c5aca430bef921418edacbf87bef0f0`
Supabase project: `gzycobgbasnqqhnympkr`
Task: `3 — Individual AI identity creation, names, profile and safe lifecycle`
Status: **IN PROGRESS — LIVE DATABASE CONTRACT VERIFIED; SIGNED-IN OWNER ACCEPTANCE BLOCKED**

## Scope and safety

- Read-only inspection confirmed the existing AI Network relational foundation remains in the existing Minglora Supabase project.
- A rollback-only transaction ran the live `service_role` identity RPC path using the actual designated owner profile already present in Minglora. It created one temporary identity only inside the transaction, then rolled the transaction back.
- The transaction validated separate first/middle/last names, username, private profile defaults, gender, country fields, language/location persistence, disabled-by-default status, truthful email metadata (`unverified` / `not_requested`), idempotent retry, profile update/version history, owner-scoped get and list.
- After rollback, live readback confirmed zero retained AI identities, names, profiles or emails for the designated owner.
- The test did not create or retain a Supabase Auth account, mailbox, provider credential, public profile, media object, or production AI identity.
- The initial test attempt tried to read `auth.users` after switching to `service_role` and was rejected by PostgreSQL privileges. The owner record was instead validated as `postgres` before switching to `service_role`; the corrected rollback-only contract then completed without error. No privilege was broadened.

## Live security/runtime readback

- `ai_network` contains 54 base tables; all 54 have RLS enabled.
- `anon` and `authenticated` have no `ai_network` schema USAGE; `service_role` has the required private access.
- 21 public `minglora_ai_%` RPCs inspected are SECURITY INVOKER with a locked empty search path; EXECUTE is unavailable to `anon` and `authenticated`, and available to `service_role`.
- Existing `minglora-runtime-state` Edge Function is ACTIVE at version 131, `verify_jwt=false` as previously configured, with the AI identity command, profile registry/update and private-media access actions present. Its custom `x-minglora-api-key` hash check remains in place.
- AI runtime controls remain `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`.

## Not accepted / outstanding

- The Minglora owner browser session with active MFA/reviewer authorization is not available in this execution context. Therefore the complete HTTP path guarded by designated-owner, moderator and active-reviewer checks has not been exercised as a signed-in owner.
- No real private avatar/cover upload or Storage readback was performed; the AI profile media bucket remains lazily provisioned at first authorized upload.
- This checkpoint does not complete Task 3, does not increase the master verified-task count, and is not a 10-billion capacity benchmark.
- No code, production migration, Edge Function deployment, Render environment, worker control or user data was changed.

## Exact next action

Complete the signed-in designated-owner API/browser acceptance and one genuine private avatar/cover upload using the owner's active MFA-verified Minglora session. Verify create/list/get/edit, profile media authorization, private Storage behavior, then close Task 3 only after device/API tests pass.


## Additional live contracts — 2026-11-15

### Discovery (rollback-only live database contract)
- Verified discover using ten combined multi-select dimensions: category, population, gender, countries, nationality, language, interests, skills, capabilities and regions; also applied profession and recent-day filters.
- Verified bounded result shape and pagination fields against the current empty public AI dataset (0 results, accurately represented).
- Invalid country code `JAM` was rejected because country inputs must use ISO alpha-2 codes.
- Saved discovery group create/list/readback/delete passed. Entire transaction rolled back.

### Provider/model (rollback-only live database contract)
- Created a temporary `rollback_test` account and model only inside the transaction. Account reported `unconfigured` / `unknown`; no credentials or secrets were accepted or stored.
- Created a temporary identity, assigned the test model within declared text capability and English language limits, and verified assignment starts `pending` / `unknown`.
- Duplicate assignment returned the existing assignment; premature activation to `active` was rejected until a real provider health verifier exists.
- Owner-scoped account/model/assignment list operations returned the temporary records while the transaction was active. Entire transaction rolled back.

### Post-rollback verification
- Zero retained AI identities/names/profiles/emails, provider accounts/assignments, rollback-test models or saved discovery test groups.
- Runtime remains globally paused, execution disabled and max workers zero.
- These contracts strengthen Task 3/5/6 database evidence but do not close owner-authenticated HTTP/UI/device acceptance or prove any real provider is connected. Master acceptance remains 2/19 (10.53%).

A test pre-check that tried to read `auth.users` as `service_role` was denied by PostgreSQL as expected. The owner was validated before switching roles on the successful retry; no database privileges were changed.
