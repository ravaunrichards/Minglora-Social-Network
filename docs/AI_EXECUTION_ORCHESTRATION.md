# Minglora AI execution and orchestration (Phase 6)

## Current execution boundary

The Phase 6 worker is opt-in and remains disabled by default. The worker does not unpause the AI network, activate identities, activate provider assignments, approve tasks, or create credentials. A task is executable only after all of the following have been independently configured:

1. The runtime control row has `global_paused = false`, `execution_enabled = true`, and `max_concurrent_workers >= 1`.
2. The AI identity is owned by the task owner, active and enabled, and is not in restricted-observation mode.
3. The identity has an enabled `task_execution` capability and a non-expired `allow` permission for `execute_task` (or the matching task-specific permission/scope). A matching deny permission takes precedence.
4. Any required human approval is recorded as approved.
5. A delegated task has a live delegation grant for the grantee identity, exact task type and action class, and its token/cost limits.
6. The identity has an active, healthy provider assignment, configured and healthy owner-matched provider account, and active text-capable model. The account health check must be no older than 15 minutes.
7. A supported low-impact text task has a token budget. Current execution deliberately rejects non-zero cost-limit tasks because a verified per-model price ledger is not yet present.
8. The worker has a separately issued credential and the supported provider secret is present in the server environment.

The only task adapter enabled by this release is OpenAI text generation. Other provider catalogue entries remain non-routable until they have their own tested authentication, moderation, usage, timeout, and failure contracts.

## Worker authentication and configuration

The worker does not use the normal `render_runtime` key. It authenticates through `x-minglora-worker-token`; the database stores only the token's SHA-256 hash in `ai_network.ai_worker_credentials`. The worker ID and owner scope are resolved by the service-role-only `minglora_ai_worker_authenticate` function. A worker credential can call only the dedicated worker action allowlist.

Provision a random secret using a trusted secret manager. Store the plaintext only as the Render environment variable `MINGLORA_AI_WORKER_TOKEN`, and insert its lowercase SHA-256 digest into `ai_network.ai_worker_credentials` with an owner-scoped worker ID and `credential_status = 'active'`. Do not commit the token or put it in task payloads, provider metadata, SQL migration files, logs, or support messages. Rotate by issuing a new credential, updating the server secret, and revoking the old database row.

Required worker environment:

- `MINGLORA_AI_WORKER_ENABLED=true` only after the full readiness checklist is satisfied.
- `MINGLORA_AI_WORKER_TOKEN` — the private worker credential.
- `SUPABASE_URL` or `MINGLORA_AI_WORKER_GATEWAY_URL` — the Supabase function gateway.
- `OPENAI_API_KEY` and, optionally, `OPENAI_BASE_URL`.
- `MINGLORA_AI_WORKER_POLL_MS`, `MINGLORA_AI_HEARTBEAT_MS`, `MINGLORA_AI_MAX_REQUESTS_PER_MINUTE`, and `MINGLORA_AI_MAX_TOKENS_PER_MINUTE` — bounded worker controls.

The example environment keeps the worker disabled. The web process starts the worker loop only when the explicit enable flag is true. Worker polling does not override the database runtime pause.

## Task lifecycle and recovery

- Tasks remain in the existing durable queue and use its owner-scoped idempotency key, priority, scheduled time, approval state, token budget, attempt ceiling, lease, result and failure fields.
- Claims are transactional, use `FOR UPDATE SKIP LOCKED`, enforce the configured worker concurrency and recover expired leases.
- Every claim records the selected assignment/provider/model route as an append-only task event.
- Provider request/token reservations are persisted per provider/model/minute, so separate worker instances share the same rate-limit bucket.
- OpenAI input and output moderation are fail-closed. Generation uses no tools and cannot publish, message other people, modify accounts, spend money, or perform administrative actions.
- Provider network failures, timeouts, rate limits and transient 5xx errors can be retried with a bounded provider retry policy and a separately bounded task retry schedule.
- A completed task requires a live worker lease, non-empty output, and explicit route/provider/model metadata. Failure paths write a failure event and never set `succeeded`.
- Owners can cancel queued or running tasks. Cancelling a running task invalidates its lease; the worker heartbeat sees the lost lease and refuses to commit a result.
- Task event history is available at `GET /api/ai-network/tasks/:taskId/events`; task state and runtime controls remain available at `GET /api/ai-network/tasks`.

## Scheduling and AI-to-AI delegation

The existing Supabase Cron job `minglora_ai_schedule_dispatch` dispatches due schedules every minute. Schedule dispatch creates durable tasks that still require human approval; it does not bypass the task queue or start a provider call.

AI-to-AI task delegation reuses the existing grant and team subsystem. Worker claims revalidate the delegation grant, owner, grantor/grantee identities, allowed task types, action classes, expiry and budgets. A successful or failed delegated execution writes a delegation event. This is internal task delegation only; it does not grant external tools or social-network publishing access.

## Operational acceptance

Unit tests cover worker authentication boundaries, lease/cancellation outcomes, task success/failure semantics, rate reservations, moderation, provider routing, bounded retries and fail-closed defaults. They are not a substitute for live-provider acceptance. A real end-to-end provider test must be run only after the worker credential is provisioned, the OpenAI secret is configured, provider health/assignment and identity capabilities/permissions are active, a human-approved low-risk task is queued, and database runtime controls are intentionally enabled. Record each real provider response and failure against its task ID and route; never label a mocked adapter test as a live provider test.
