# Phase 6 — AI task execution and orchestration

## Implemented execution boundary

Phase 6 adds a separate worker principal and an isolated Supabase Edge Function. A worker credential is a random 256-bit value returned once by the designated-admin/MFA-protected registration route. The database stores only its SHA-256 digest. The worker credential is not a Supabase service-role key, Supabase user JWT, provider API key, or browser credential.

Execution remains fail-closed. The database runtime row defaults to global_paused=true, execution_enabled=false, and max_concurrent_workers=0. The worker process defaults to disabled and will not start unless MINGLORA_AI_WORKER_ENABLED=true, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY), and a registered MINGLORA_AI_WORKER_TOKEN are provided in the private server environment.

## Supported worker adapter

The first background adapter supports only:
- text.generate and text.summarize
- read_only and content action classes
- A healthy, configured OpenAI account/model assignment
- Identity capability text_generation enabled
- An unexpired identity permission allowing task.execute, ai.task.execute, or the exact task type (and no matching deny permission)
- A valid active delegation grant for delegated tasks

The adapter performs input and output moderation with omni-moderation-latest, calls the Responses API with store=false and tools=[], uses request timeouts, and discards output when either moderation step is not confirmed. External actions, publishing, messaging, financial, security, moderation, email, voice, image, and arbitrary provider tools are not part of this worker's execution authority.

The worker uses only the exact database-reserved provider/model route. It does not silently route to a different model. Alternate models need their own verified assignment and provider quota route before they can be considered for task failover.

## Task lifecycle and operational limits

A due and authorized task is atomically claimed with FOR UPDATE SKIP LOCKED. Claiming creates a unique route_id and one immutable attempt row. A bounded lease is renewed by heartbeats. The worker reports success only after the database confirms complete_task; failures are recorded through fail_task and retried with bounded exponential backoff only when marked retryable and the task has remaining attempts. Expired leases are recovered to retry or terminal failure. Cancellation invalidates the current lease and marks the active attempt cancelled.

The database enforces:
- Global execution pause and concurrency cap
- Per-worker concurrency and requests/minute caps
- Per-provider/model concurrency, requests/minute and estimated token/minute caps
- Identity capability and permission checks
- Delegation scope, expiry, action-class, task-type and budget checks
- Maximum task attempts and lease expiry
- Result size and credential-field filtering

Schedules are already handled by the existing durable scheduler. Its cron dispatcher materializes due occurrences into the human-approval task queue; the worker only claims due queue rows and never bypasses the schedule's approval policy.

## Protected API routes

All management routes remain behind the existing designated-admin/MFA gate:
- GET /api/ai-network/workers — list registered workers
- POST /api/ai-network/workers — register a worker; the raw token is returned once with Cache-Control: no-store
- POST /api/ai-network/workers/:workerId/revoke — revoke a worker and cancel its active leases
- GET /api/ai-network/tasks/:taskId/history — read event and attempt history
- POST /api/ai-network/runtime-controls — pause/resume execution and set bounded concurrency/lease settings; enabling requires a fresh provider probe, a worker heartbeat, and a healthy authorized identity route
- Existing task create/list/approve/reject/cancel routes remain available

Worker traffic goes directly to POST /functions/v1/minglora-ai-worker using Authorization: Bearer [worker-token]. The endpoint must be deployed with Supabase JWT verification disabled because it performs its own strict bearer-token authentication and SHA-256 lookup. Do not disable JWT verification on unrelated functions.

## Private environment

Set the following on the backend service only:

| Variable | Initial value | Purpose |
|---|---|---|
| MINGLORA_AI_WORKER_ENABLED | false | Explicitly opt in to starting the worker process |
| MINGLORA_AI_WORKER_TOKEN | empty | One-time registered worker credential |
| SUPABASE_PUBLISHABLE_KEY | existing private-server setting | Supabase API gateway key; it is not a secret substitute for the worker bearer credential |
| MINGLORA_AI_WORKER_CONCURRENCY | 1 | Local polling loops; database caps still apply |
| MINGLORA_AI_WORKER_POLL_INTERVAL_MS | 1500 | Queue polling interval |
| MINGLORA_AI_WORKER_HEARTBEAT_INTERVAL_MS | 30000 | Lease renewal interval |

SUPABASE_URL, OPENAI_API_KEY, OPENAI_DEFAULT_MODEL, the existing Supabase runtime gateway key, and all other secrets remain private server/Edge Function secrets. Never put credentials in task payloads, source control, client-side JavaScript, or logs.

## Deployment and acceptance sequence

1. Review the migration, then apply it with `supabase db push` against the intended project. The Phase 6 PostgreSQL 17 integration test is `tests/integration/ai-task-execution-orchestration.test.js`.
2. Deploy the worker endpoint with its custom bearer authentication enabled and Supabase JWT verification disabled: `supabase functions deploy minglora-ai-worker --no-verify-jwt`. Do not disable JWT verification for other functions.
3. Deploy the updated runtime-state function: `supabase functions deploy minglora-runtime-state`.
4. Restore the Render backend service and confirm it is healthy before adding any worker environment variables.
5. Configure and live-probe OpenAI, then create a healthy provider account/model assignment.
6. Enable text_generation and grant a narrowly scoped task.execute permission to a test identity. For AI-to-AI delegation, use a valid active delegation grant that matches the task type/action class/budget.
7. Register a worker through the protected API, store the returned token as MINGLORA_AI_WORKER_TOKEN, start with the worker still disabled at the database runtime-control row, and confirm its last_seen_at heartbeat.
8. Only after all prior checks pass should an administrator unpause execution and choose a small concurrency ceiling. Start with one worker/task.
9. Run real provider-backed acceptance cases for a success, a moderated-input rejection, a transient provider failure/retry, timeout/lease recovery, and cancellation. Verify the task record, execution-attempt row, route ID, event log, and actual provider/model usage.

## Verification status at implementation time

The Phase 6 implementation is staged in draft PR #547 and is not merged or deployed. The following code/database checks passed on the feature branch:
- AI Network syntax and regression workflow: TypeScript parse/transpile, backend JavaScript syntax, workspace syntax and AI unit tests all passed.
- Repository CI test job: dependency audit, syntax checks and automated test suite passed.
- Dedicated PostgreSQL 17 Phase 6 acceptance: 1 test passed, 0 failed. It executed the migration and exercised authenticated worker registration, paused-by-default activation, identity permission denial, assignment/model routing, personality context, concurrency, heartbeat, provider rate-limit rejection, valid AI-to-AI delegation, success/history, retry exhaustion, cancellation, and timeout/lease recovery.

Production was not activated or represented as accepted: the Render backend was suspended for billing, the production provider connection/assignment was not configured and healthy, runtime controls remained paused with concurrency zero, and there were no enabled identity capabilities/permissions or registered workers. Therefore no genuine end-to-end request to a configured live model provider was possible during this implementation. After the production prerequisites are restored, deploy the migration and functions, configure and probe the desired provider (including Gemini if selected), register a worker, then run live provider success/failure acceptance before enabling normal task execution.
