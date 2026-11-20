# Minglora AI Execution Worker

This worker is a dedicated Node.js process. It never receives the Supabase service-role key or the Render runtime API secret. It authenticates only with a per-worker `MINGLORA_AI_WORKER_TOKEN`, which the Edge Function hashes and validates against `ai_network.ai_worker_credentials`.

## Required environment

- `MINGLORA_RUNTIME_URL`: full URL of the deployed `minglora-runtime-state` Edge Function.
- `MINGLORA_AI_WORKER_TOKEN`: one-time worker secret; store only in the worker service secret manager. The database stores its SHA-256 hash, never the raw token.
- `OPENAI_API_KEY`: provider key for the assigned OpenAI account.
- `OPENAI_DEFAULT_MODEL`: not used to override database routing; model selection comes from the authorized identity assignment.

Optional controls: `MINGLORA_AI_TASK_TIMEOUT_MS` (5–120 seconds), `MINGLORA_AI_WORKER_POLL_MS` (1–30 seconds), `OPENAI_MAX_REQUESTS_PER_MINUTE` and `OPENAI_MAX_TOKENS_PER_MINUTE`.

## Runtime behavior

- Claims only tasks authorized by the database worker RPC.
- Uses the selected OpenAI model and its configured same-provider fallback.
- Reserves shared provider capacity before each inference request.
- Sends `store:false` to the Responses API.
- Renews task leases while inference is running.
- Completes only with non-empty output and the selected provider/model route.
- Records provider failures through the worker RPC; retry eligibility and maximum attempts are enforced by the database.
- Stops new claims on SIGTERM/SIGINT. The runtime lease remains the recovery mechanism for a process killed mid-task.

## Local checks

```sh
node --test tests/unit/ai-execution-worker.test.js
```

## Deployment

Deploy as a separate Render Background Worker using `node backend/workers/ai-execution/worker.mjs`. Do not convert the Minglora web service into a worker. Keep production execution paused until the owner has supplied the provider secret, registered the worker token hash, verified a healthy provider route, and explicitly enabled a nonzero worker concurrency limit.
