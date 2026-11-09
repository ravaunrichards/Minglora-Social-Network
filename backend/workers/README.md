# Background workers

## Minglora Personal AI Bots task worker

The Personal AI Bots feature now has a staged PostgreSQL task queue and a separately launched worker entry point. The queue is designed for durable retries, idempotency, lease expiry, concurrent claims with `FOR UPDATE SKIP LOCKED`, and dead-letter handling.

The worker is deliberately **disabled by default**. The staged database migration adds two independent gates, `execution_enabled=false` and `provider_ready=false`; queue claims return no work unless both are true, the network is enabled, the emergency shutdown is clear, concurrency and daily budgets are positive, and the AI identity/category remain active. The worker process also requires `MINGLORA_AI_BOT_WORKER_ENABLED=true`, Supabase persistence, and an explicitly configured server-side provider adapter module.

Start command:

```bash
npm run worker:personal-ai-bots
```

Required environment (only after the provider adapter and release have been reviewed):

- `PERSISTENCE_DRIVER=supabase`
- `SUPABASE_STATE_API_URL`
- `SUPABASE_STATE_API_KEY`
- `SUPABASE_PUBLISHABLE_KEY` (or the existing `SUPABASE_ANON_KEY`)
- `MINGLORA_AI_BOT_WORKER_ENABLED=true`
- `MINGLORA_AI_BOT_PROVIDER_MODULE` pointing to a server-side module exporting `generate()` or `createProviderAdapter()`

The adapter receives a draft-only request, no tools, and `externalActionsAllowed=false`. The worker allowlist is limited to `assistant_request`, `moderation_review`, `analytics_report`, and `translation`; it does not publish content, follow/unfollow members, send messages, react, join groups, attend events, or execute live actions. Outputs are saved as `human_review_draft` records for an administrator to inspect.

Every claim receives a random lease token. Heartbeat, completion, and failure calls must present the current worker ID and lease token; stale workers cannot complete or overwrite a task after lease expiry. Retryable failures use bounded exponential backoff and end in `dead_lettered` once the configured attempt limit is reached.

**Current release state:** schema, gateway, and worker code are staged on the Minglora AI feature branch. No production migration or Edge Function deployment has been performed. No provider adapter is configured, and no bot task is executing. Keep the worker off until the provider is connected, health-checked, the preflight safeguards are verified, and the existing release gate is approved.

## General worker requirements

Use durable state, idempotency keys, bounded retries, lease recovery, dead-letter handling and operational metrics for all critical background tasks. Critical work must not depend on an in-memory timer.
