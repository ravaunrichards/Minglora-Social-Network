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
- `MINGLORA_AI_BOT_PROVIDER_MODULE` pointing to a server-side module exporting `createProviderAdapter()`
- One environment secret for every configured `credentialSecretReference`, using its exact name after the `env:` prefix (for example, `MINGLORA_AI_PROVIDER_OPENAI_API_KEY`)

Each AI identity can have one or more provider/model assignments in the canonical provider tables. The assignment stores only an environment-secret reference such as `env:MINGLORA_AI_PROVIDER_OPENAI_API_KEY`; the actual credential is read from the worker's environment at runtime and is never written to PostgreSQL or returned to the Admin Centre.

The configured provider module must export `createProviderAdapter({ provider, model, credential, ... })`. It must return an adapter with the exact `providerIdentifier` and `modelIdentifier`, a real `healthCheck({ signal })` method, and a `generate(request, { signal })` method. The worker health-checks assignments and records `healthy`, `degraded`, `unavailable`, or `error` status. A credential reference alone is not a successful health check. Health is rechecked periodically; an assignment recovers after a later successful check.

Only active, healthy, text-capable provider/model assignments with a configured credential reference and no tool permissions are eligible for task claims. The claim RPC chooses the primary healthy assignment, then the lowest routing priority, allowing an available secondary assignment when a primary provider is unhealthy.

The adapter receives a draft-only request, no tools, and `externalActionsAllowed=false`. The worker allowlist is limited to `assistant_request`, `moderation_review`, `analytics_report`, and `translation`; it does not publish content, follow/unfollow members, send messages, react, join groups, attend events, or execute live actions. Outputs are saved as `human_review_draft` records for an administrator to inspect.

Every claim receives a random lease token. Heartbeat, completion, and failure calls must present the current worker ID and lease token; stale workers cannot complete or overwrite a task after lease expiry. Retryable failures use bounded exponential backoff and end in `dead_lettered` once the configured attempt limit is reached.

**Current release state:** schema, gateway, and worker code are staged on the Minglora AI feature branch. No production migration or Edge Function deployment has been performed. No provider adapter is configured, and no bot task is executing. Keep the worker off until the provider is connected, health-checked, the preflight safeguards are verified, and the existing release gate is approved.

## General worker requirements

Use durable state, idempotency keys, bounded retries, lease recovery, dead-letter handling and operational metrics for all critical background tasks. Critical work must not depend on an in-memory timer.
