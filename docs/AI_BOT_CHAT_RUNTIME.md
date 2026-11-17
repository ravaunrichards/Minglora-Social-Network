# Minglora AI Bot Conversation Runtime

**Status:** Owner-initiated chat code is merged to main. The additive relational chat migration is applied to the existing Minglora Supabase project as migration `20261117101442_minglora_ai_bot_conversations`; all six chat tables and the service-role-only RPC are live. The existing `minglora-runtime-state` Edge Function is ACTIVE at version 132 with its prior custom API-key authentication and `verify_jwt=false` preserved. The Render-backed Node API release, signed-in owner/MFA acceptance, a real provider credential and production inference remain unverified.

## Scope and safety

The conversation path is restricted to the designated Minglora administrator with a verified reviewer/MFA session. It operates only against a bot already linked to a canonical record in the existing ai_network identity system. It does not create a new human Supabase Auth user or invent an AI identity.

The OpenAI-only adapter reads credentials and model selection from the private server environment. Browser requests cannot submit credentials, provider overrides or model overrides. Input and output are moderated; Responses generation uses store:false and tools:[]. Assistant messages disclose that the speaker is AI and are marked for human review. The model has no tools or permission to publish, message other people, schedule, spend, change security settings or execute administrative actions.

## Relational persistence design

The additive migration supabase/migrations/20261117070000_minglora_ai_bot_conversations.sql defines six private tables in the existing ai_network schema:

- ai_bot_conversations and ai_bot_conversation_messages for owner-scoped conversation history.
- ai_bot_chat_requests for UUID idempotency, message hashes, attempt counters and five-minute recovery leases.
- ai_bot_usage_events for measured successful and billable failed provider usage.
- ai_bot_daily_token_budgets and ai_bot_daily_token_reservations for daily chat-budget rows and row-locked reservations.

All six tables enable RLS, revoke direct access from public, anon and authenticated, and grant required backend table access only to service_role. The public.minglora_ai_bot_chat_command(text,uuid,jsonb) RPC is SECURITY INVOKER with an empty search path and service-role-only EXECUTE. It validates the signed-in Minglora profile and AI identity owner, locks the owner/date budget row to serialize concurrent bot-chat reservations, enforces request/attempt idempotency, persists the user/assistant pair only after output moderation, records provider usage and settles/releases reservations in the same transaction.

The private runtime Edge Function exposes only get_conversation, get_usage, begin_request, complete_request and fail_request. It is deployed to the existing project as ACTIVE version 132; the existing custom API-key guard and `verify_jwt=false` setting were preserved. The Node server source uses this RPC path when Supabase persistence is configured, but its current Render deployment has not yet been verified or updated. Local JSON-mode unit tests keep the existing in-memory service path. Production does not silently fall back to JSONB when the relational command is unavailable.

The daily reservation ledger serializes concurrent bot-chat attempts. Creator Studio usage is still reported as a baseline from the existing runtime-state store; cross-feature atomic reservations between Creator Studio and bot chat remain a follow-up before simultaneous multi-feature traffic. The new tables are indexed but not time-partitioned, and no 10-billion or multi-region capacity is claimed.

## API behavior

- GET /api/ai-network/bots/:botId/conversation reads the latest open relational owner-scoped conversation after verifying the bot's canonical identity.
- POST /api/ai-network/bots/:botId/chat accepts only message, optional conversationId and requestId.
- Both endpoints remain behind the designated-admin and verified-MFA gate.
- Failed or unmoderated output is not saved as a conversation message. Billable failures still enter the usage ledger.

## Explicitly not verified or deployed

- The migration is applied in production as `20261117101442_minglora_ai_bot_conversations`. Live verification confirms six RLS-enabled tables, zero direct browser-role SELECT privileges, service-role table access, and a SECURITY INVOKER RPC with an empty search path and service-role-only EXECUTE. All 19 foreign keys across the six tables have valid covering indexes. The six chat tables currently contain zero rows.
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

## Acceptance still required

1. Verify the existing Render workspace/service and deploy the current `src/server.js` backend from merged `main` without creating another service; this deployment is not yet confirmed.
2. Use the designated Minglora owner session with verified reviewer/MFA state to test the real create/get conversation and POST chat API routes on desktop and mobile.
3. Run deployed RPC integration tests using disposable, transaction-rolled-back fixtures for request idempotency, concurrency, lease expiry/recovery, owner isolation, daily budget limits, billable failures and rollback.
4. Configure an actual private OpenAI credential/model, verify provider health, perform moderated inference and confirm measured usage. No credential is currently claimed as present.
5. Migrate Creator Studio usage into the shared relational budget ledger before claiming cross-feature atomic budgets or enabling multi-instance/public traffic.
6. Verify consent-gated memory recall with memory disabled, short-term enabled, long-term enabled only by its separate opt-in, expiry cleanup, owner isolation and credential-like summary exclusion.
7. Benchmark identity and chat storage, query/write throughput, concurrency, backups, recovery and regional failover before making any 10-billion or multi-region capacity claim.
