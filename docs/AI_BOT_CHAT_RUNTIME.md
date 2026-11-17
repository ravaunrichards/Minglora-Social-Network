# Minglora AI Bot Conversation Runtime

**Status:** Implemented on `feat/minglora-ai-network-owner-chat-20261116`; automated CI and signed-in production acceptance pending. This is a human-initiated owner/admin conversation path, not an autonomous worker runtime and not a production-scale conversation store.

## Scope

The conversation path is restricted to the designated Minglora administrator with a verified reviewer/MFA session. It operates only against a bot already linked to a canonical record in the existing `ai_network` relational identity system. It does not create a new human Supabase Auth user or invent an AI identity.

The current provider adapter supports OpenAI only. Provider credentials and model selection are read only from the private server environment. Request bodies reject credential and provider-override fields. The adapter uses the OpenAI Moderations endpoint for input and output checks and the Responses endpoint for generation. Responses are requested with `store: false` and `tools: []`. The system prompt identifies the speaker as AI and forbids posts, messages to other members, scheduling, financial actions, security changes and administrative operations.

A reply is saved only after successful generation and output moderation. Failed or unmoderated output is not saved as a conversation message. Actual provider token usage is recorded for both successful generations and billable failures. Daily usage checks include Creator Studio and chat usage. A conservative input reserve is deducted before generation, and one active owner chat is allowed per application process at a time. Request UUIDs, message hashes, owner/bot/identity binding and bounded retry leases provide safe retry behavior within the current persistence model.

## API behavior

- `GET /api/ai-network/bots/:botId/conversation` reads the latest open owner-scoped conversation, after checking the bot's canonical relational AI identity.
- `POST /api/ai-network/bots/:botId/chat` accepts only `message`, optional `conversationId` and `requestId`. Credentials, provider selection and model overrides are rejected.
- Both endpoints remain behind the existing designated-admin and verified-MFA gate.
- The UI labels assistant messages as AI and explains the restricted, non-autonomous action set.

## Persistence boundary and scale blocker

Conversation objects, messages, idempotency requests and usage events currently use the existing Minglora runtime-state compatibility adapter. That adapter persists an application state document through the existing `minglora_runtime_state` JSONB gateway with a revision check and serialized writes in one process. This is durable compatibility storage, but it is not an indexed, independently partitionable conversation/message data plane. The owner lock is process-local and is not a distributed lease or cross-region budget reservation.

Before enabling multi-instance or public AI conversation traffic, move conversations, messages, idempotency keys, token reservations and usage events to dedicated relational structures in the existing Supabase project. Add unique constraints, owner-scoped access, transactional idempotency, atomic budget reservations, partitioning/retention, a distributed job/lease mechanism and concurrency/recovery tests. Do not treat the current compatibility adapter as capable of 10-billion identity or chat scale.

## Explicitly not implemented by this slice

- No live OpenAI credential/model health result has been accepted for production.
- No production provider inference has been performed or claimed.
- This path does not retrieve or write the separate AI memory subsystem; context is limited to the latest bounded conversation history.
- No email mailbox is provisioned.
- No independent AI population, employee or public-facing social activity is created.
- No autonomous worker, schedule, external tool, post, member message, payout, coin action or administrative action is enabled.
- No Supabase migration or production data change is required for this code slice.

## Acceptance still required

1. CI passes on the continuation branch.
2. The designated owner signs in with the required MFA/reviewer session.
3. A real, private server-side OpenAI credential and approved model are configured without exposing them to client requests.
4. Provider probe and a real moderated request succeed; provider/model/usage evidence is recorded.
5. Rejections, provider timeouts, stale leases, retry behavior, owner isolation and daily budget limits pass end-to-end checks.
6. Desktop and mobile owner acceptance passes.
7. Conversation persistence is moved to the normalized, transactionally safe data path before any multi-instance/public rollout.
