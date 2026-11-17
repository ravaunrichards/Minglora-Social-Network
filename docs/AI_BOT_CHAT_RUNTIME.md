# Minglora AI Bot Conversation Runtime

**Status:** Owner-initiated chat code is merged to main. The additive relational chat migration is applied to the existing Minglora Supabase project as migration `20261117101442_minglora_ai_bot_conversations`; the deterministic message-order repair is applied as `20261117102355_minglora_ai_bot_message_order`; all six chat tables and the service-role-only RPC are live. The existing `minglora-runtime-state` Edge Function is ACTIVE at version 132 with its prior custom API-key authentication and `verify_jwt=false` preserved. The Render-backed Node API release, signed-in owner/MFA acceptance, a real provider credential and production inference remain unverified.

## Scope and safety

The conversation path is restricted to the designated Minglora administrator with a verified reviewer/MFA session. It operates only against a bot already linked to a canonical record in the existing ai_network identity system. It does not create a new human Supabase Auth user or invent an AI identity.

The OpenAI-only adapter reads credentials and model selection from the private server environment. Browser requests cannot submit credentials, provider overrides or model overrides. Input and output are moderated; Responses generation uses store:false and tools:[]. Assistant messages disclose that the speaker is AI and are marked for human review. The model has no tools or permission to publish, message other people, schedule, spend, change security settings or execute administrative actions.

## Relational persistence design

The additive migration supabase/migrations/20261117070000_minglora_ai_bot_conversations.sql defines six private tables in the existing ai_network schema:

- ai_bot_conversations and ai_bot_conversation_messages for owner-scoped conversation history.
- ai_bot_chat_requests for UUID idempotency, message hashes, attempt counters and five-minute recovery leases.
- ai_bot_usage_events for measured successful and billable failed provider usage.
- ai_bot_daily_token_budgets and ai_bot_daily_token_reservations for daily chat-budget rows and row-locked reservations.

Messages carry a monotonic `sequence_no` within each conversation. The completion RPC allocates the user/assistant pair as adjacent sequence positions while holding the conversation row lock, and reads history by sequence rather than timestamps or random UUIDs. Existing messages are backfilled by request and role order.

All six tables enable RLS, revoke direct access from public, anon and authenticated, and grant required backend table access only to service_role. The public.minglora_ai_bot_chat_command(text,uuid,jsonb) RPC is SECURITY INVOKER with an empty search path and service-role-only EXECUTE. It validates the signed-in Minglora profile and AI identity owner, locks the owner/date budget row to serialize concurrent bot-chat reservations, enforces request/attempt idempotency, persists the user/assistant pair only after output moderation, records provider usage and settles/releases reservations in the same transaction.

The private runtime Edge Function exposes only get_conversation, get_usage, begin_request, complete_request and fail_request. It is deployed to the existing project as ACTIVE version 132; the existing custom API-key guard and `verify_jwt=false` setting were preserved. The Node server source uses this RPC path when Supabase persistence is configured, but its current Render deployment has not yet been verified or updated. Local JSON-mode unit tests keep the existing in-memory service path. Production does not silently fall back to JSONB when the relational command is unavailable.

The daily reservation ledger serializes concurrent bot-chat attempts. Creator Studio usage is still reported as a baseline from the existing runtime-state store; cross-feature atomic reservations between Creator Studio and bot chat remain a follow-up before simultaneous multi-feature traffic. The new tables are indexed but not time-partitioned, and no 10-billion or multi-region capacity is claimed.

## API behavior

- GET /api/ai-network/bots/:botId/conversation reads the latest open relational owner-scoped conversation after verifying the bot's canonical identity.
- POST /api/ai-network/bots/:botId/chat accepts only message, optional conversationId and requestId.
- Both endpoints remain behind the designated-admin and verified-MFA gate.
- Failed or unmoderated output is not saved as a conversation message. Billable failures still enter the usage ledger.

## Explicitly not verified or deployed

- The migration is applied in production as `20261117101442_minglora_ai_bot_conversations`.
- The follow-up `20261117102355_minglora_ai_bot_message_order` migration backfilled `sequence_no`, added per-conversation uniqueness and updated the private RPC. A rollback-only 20-exchange database stress test returned sequence positions 21–40 with zero out-of-order pairs; it also verified idempotent completed-request reuse, owner isolation, budget rejection and expired-lease recovery. All fixture writes were rolled back. Live verification confirms six RLS-enabled tables, zero direct browser-role SELECT privileges, service-role table access, and a SECURITY INVOKER RPC with an empty search path and service-role-only EXECUTE. All 19 foreign keys across the six tables have valid covering indexes. The six chat tables currently contain zero rows.
- No live OpenAI credential/model health result or production inference has been verified.
- Chat now performs read-only recall from the separate owner-managed AI memory subsystem only when the identity has an explicit memory opt-in and a recorded consent timestamp. Short-term summaries may be included after that opt-in; long-term summaries are included only after the separate long-term opt-in. The adapter includes at most six bounded summaries, excludes credential-like text, labels them as untrusted context, and reserves token budget for them. The chat path does not automatically create, update or summarize memory entries. Disabling memory continues to clear entries through the existing owner-controlled memory settings RPC.
- No email mailbox, independent AI population, employee or public social activity is created.
- No worker, schedule, external tool, payout, coin action, administrative action or autonomous execution is enabled.
- No AI identity, human Auth user, mailbox, provider credential, conversation, message or usage record was created. No Render service deployment or worker-control change was performed.


## Deployed RPC rollback-only acceptance — 2026-11-17

- Executed the deployed `public.minglora_ai_bot_chat_command` as `service_role` inside one transaction that was explicitly rolled back.
- Verified a reserved request, moderated completion, token settlement, completed-request idempotent reuse, a timed-out lease advancing to attempt 2, release on failure, and rejection of an over-budget reservation with SQLSTATE `54000`.
- Verified a second existing Minglora profile cannot read the first owner's conversation.
- The test identity, requests, conversation, messages, audit records, budget row, reservations and usage events were transaction-scoped fixtures. Post-rollback counts for all of those AI/chat tables were zero.
- This was a sequential database RPC contract test, not a concurrent-session/load test. Billable provider-failure accounting, signed-in HTTP/device acceptance, live provider inference and the Render Node API release remain unverified. The runtime remains globally paused, execution-disabled and at zero workers.


## Shared Creator Studio budget — production migration and runtime rollout

- Added an additive, not-yet-applied migration 20261117104500_minglora_creator_studio_shared_budget to the source branch. It creates separate Creator Studio reservation and usage-event tables; these records reference the owner/day budget row and do not create or depend on synthetic bot or AI identity records.
- The same service-role-only minglora_ai_bot_chat_command RPC now has creator_begin_request, creator_complete_request and creator_fail_request actions. Both Creator Studio and chat reserve against, and settle through, the same locked owner/UTC-day budget row. Each reserve/settle/release path uses bounded leases and idempotent request IDs; provider-measured successful and billable failed usage is recorded, while non-billable failures release the reservation.
- The chat get_usage and begin_request actions include Creator Studio usage and active reservations. This keeps chat from spending tokens already reserved by Creator Studio, and vice versa.
- Creator Studio generation now calls the relational gateway only when Supabase persistence is active; local JSON-mode behavior is retained. Usage already settled in the relational ledger is marked in the legacy job snapshot so the same measured generation is not added twice to the legacy baseline.
- The source branch extends the existing Edge gateway action allowlist, updates src/server.js and the AI Network service, and adds focused unit/contract tests.
- **Production rollout:** PR #485 is merged; migration version 20261117111426 is applied to the existing Minglora Supabase project; both reservation/usage tables are RLS-enabled and service-role-only; the existing minglora-runtime-state Edge Function is ACTIVE v133 with the new actions and its custom API-key guard preserved. The existing Render service auto-deployed merged main, but the linked service is named minglora-social-network-temp in a Creator Hub workspace and is not confirmed as the intended production target.

## Acceptance still required

1. Confirm the intended production Render workspace/service; the currently linked minglora-social-network-temp service is live but is not a confirmed production target.
2. Use the designated Minglora owner session with verified MFA/reviewer state to exercise the real AI identity/chat and Creator Studio flows on desktop and mobile.
3. Configure a real private OpenAI credential/model, verify provider health, perform moderated inference and confirm measured usage. No credential or live inference is claimed as present.
4. Run independent concurrent sessions against the deployed Supabase RPC, followed by owner-isolation, budget/lease, billable failure and recovery checks under production-like traffic.
5. Verify consent-gated memory recall with memory disabled, short-term enabled, long-term enabled only by its separate opt-in, expiry cleanup, owner isolation and credential-like summary exclusion.
6. Benchmark identity and chat storage, query/write throughput, capacity, backup restoration, disaster recovery and regional failover before making any 10-billion or multi-region capacity claim.

## Two-session shared AI budget concurrency — verified CI checkpoint (2026-11-17)

- Status: **VERIFIED — merged source plus real two-session PostgreSQL CI**.
- PR #487 merged into `main` as `75eccd2cf1c3470c1e502e5cec0f180e616330a6`.
- Added a reusable GitHub Actions workflow using a disposable PostgreSQL 17 service. It applies the actual Minglora relational chat, message-order and Creator Studio shared-budget migrations in the isolated CI database and uses two independent PostgreSQL sessions.
- All 3 concurrency tests passed, 0 failed: competing Creator Studio reservations serialize on the same owner/UTC-day budget row; a Creator Studio hold blocks an over-budget bot-chat request; a bot-chat hold blocks an over-budget Creator Studio request. Each case verified the second backend was genuinely waiting on a database lock before the first transaction committed, then received SQLSTATE `54000`.
- Post-merge main CI completed: full repository suite **1,331 passed / 0 failed**; two-session PostgreSQL tests **3 passed / 0 failed**; Supabase Auth provider acceptance passed; For You navigation passed. Pre-merge nine-layout LIVE/MeetWave visual matrix also passed.
- This verifies database locking in disposable PostgreSQL using the actual merged migrations. It is not a production Supabase concurrency test, provider inference test, or capacity/load benchmark.
- Production state remains unchanged: migration `20261117104500_minglora_creator_studio_shared_budget` is merged but **not applied**; Creator Studio reservation and usage tables remain absent; deployed Edge Function remains ACTIVE v132 and has not been updated with the Creator Studio RPC actions; Node API/Render deployment not performed.
- Runtime safety remains `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`. No identities, Auth users, messages, budget rows, reservations or usage events were added to production.
- Remaining release gates: signed-in owner/MFA desktop and mobile acceptance; actual provider credential, provider health and inference; confirm the correct existing Minglora Render workspace/service (the currently connected Render workspace is named Creator Hub and is not assumed to be Minglora); approved, coordinated production migration and Edge/Node deployment; production verification; capacity, recovery and regional scaling benchmarks. No 10-billion identity or simultaneous execution capacity has been claimed.
- **Next execution step:** complete owner/MFA and provider readiness, establish the approved Minglora deployment target, then prepare a coordinated release plan for the merged migration and source changes. Do not enable workers or apply production migrations without the appropriate release authorization.


## Production Creator Studio shared-budget acceptance — 2026-11-17

- Applied Supabase migration 20261117111426 / minglora_creator_studio_shared_budget to the existing project.
- Verified RLS, browser-role privilege denial, service_role CRUD, SECURITY INVOKER RPC, empty search_path and service_role-only EXECUTE.
- Deployed minglora-runtime-state as ACTIVE v133; retained verify_jwt=false because the existing custom API-key guard authenticates runtime requests.
- Rollback-only live RPC acceptance passed reserve/reuse, measured settle/idempotency, non-billable release, billable failure usage, shared daily usage, over-budget rejection and cross-owner denial. Post-rollback identity, budget and Creator Studio rows remain zero.
- The Render auto-deploy to minglora-social-network-temp is live and durable Supabase persistence is ready; this temporary service is not verified as the correct production target.
- Workers remain globally paused, execution disabled and max workers zero.


## Provider/model routing — implementation update (2026-11-17)

Bot chat resolves the selected AI identity's database-owned provider assignment before starting a token reservation. The browser cannot specify or override a provider or model. The resolver requires an enabled, owner-owned active AI identity, an active text assignment, a configured and healthy provider account, a healthy assignment and model, and health evidence from the last 15 minutes. The server dispatches to an installed adapter only. OpenAI is the sole installed inference adapter in this release; unsupported providers fail closed.

An authorized platform administrator can verify a pending assignment from the Provider & Model Assignment Center. The Node server probes the exact assigned model through the private server environment, then calls a service-role-only database function to record health and activate it. Failed health probes are audited and cannot activate an assignment. No credentials are accepted from the browser or persisted in profile/provider assignment fields. The existing database assignment-activation trigger remains enabled.

The new database migration and Edge Function changes are source-only on the feature branch. The production schema and Edge Function have not been updated; no production AI provider assignment has been activated. No live provider inference is claimed until production deployment and an owner-initiated end-to-end test succeed.


The administrator verification path also performs a short, moderated generation request with no tools against the exact assigned model. The assignment remains inactive if model retrieval or inference fails. Only platform-managed accounts can use the server's OPENAI_API_KEY; user-managed provider references require a separate approved secrets-manager integration.