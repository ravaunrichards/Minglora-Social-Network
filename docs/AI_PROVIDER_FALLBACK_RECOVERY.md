# Phase 4.7 — controlled fallback-model routing and provider recovery

## Scope

This release extends the existing moderated OpenAI adapters used for explicit owner-initiated Bot Personality Lab conversations and Creator Studio drafts. It does not enable autonomous workers, publishing, external tools or background execution.

## Configuration

Configure these values only in the private Minglora server environment:

- `OPENAI_API_KEY`: existing primary/fallback credential.
- `OPENAI_DEFAULT_MODEL`: primary model.
- `MINGLORA_AI_FALLBACK_PROVIDER=openai`: explicit opt-in to same-provider fallback.
- `MINGLORA_AI_FALLBACK_MODEL`: a different model accessible to the same OpenAI project.
- `MINGLORA_AI_MAX_RETRIES`: 0, 1 or 2 retries per generation model; default 2.

Both fallback variables must be set together. The fallback model must be syntactically valid and different from the primary. A provider other than `openai` is rejected because the other provider catalogue rows do not yet have approved inference adapters. Do not place keys in the repository, database metadata, browser settings or request bodies.

## Recovery behavior

| Failure | Retry primary | Try configured fallback |
|---|---:|---:|
| Network error / timeout | Yes, bounded | After retries |
| HTTP 408 / 425 / 429 / 5xx | Yes, bounded | After retries |
| Model unavailable (404) | No | Yes, immediately |
| Incomplete / unusable generation | Yes, bounded | After retries |
| Credential rejected (401) | No | No |
| Permission denied (403) | No | No |
| Invalid configuration / input | No | No |
| Input or output moderation failure | No | No |

Moderation remains a prerequisite and a final gate around generation. The routing helper wraps only the Responses API generation operation; it cannot turn a moderation failure into a successful response. No content is saved until output moderation succeeds.

## Circuit breaker

A per-process, per-model circuit opens after three exhausted transient generation failures, or immediately after a 404 model-unavailable response. The cooldown is 30 seconds. One half-open request is admitted after cooldown; success resets the circuit. This is a local resilience measure only. It is not shared across multiple Render instances, regions or restarts and must not be described as a global provider health state.

## Observability and accounting

The generator returns safe routing metadata (selected provider/model, fallback-used flag, attempt outcomes and retry counts). If a failed/incomplete response includes token usage, that usage is aggregated with the successful response usage. Failed HTTP requests may return no usage; dollar-cost reconciliation remains separate and is not implied. Credentials and raw provider response bodies are never copied into routing metadata.

## Operator acceptance checklist

- [ ] Store primary and fallback model identifiers and the API key only in the private service environment.
- [ ] Keep both fallback variables blank until the backup model is selected deliberately and verified for the same OpenAI project.
- [ ] Use a test/staging key to validate primary recovery after a transient timeout/429/5xx and fallback after a primary 404.
- [ ] Verify 401/403, invalid configuration and moderation failures do not fail over.
- [ ] Verify usage and selected-model metadata in both Bot Personality Lab and Creator Studio.
- [ ] Confirm the normal designated-owner/MFA authorization and token budget remain enforced.
- [ ] Keep autonomous execution globally paused until its separate worker identity, lease, heartbeat, completion, failure and recovery gates pass.

## Current implementation boundary

The only currently approved fallback target is a second OpenAI model reached with the same OpenAI adapter and private credential. Cross-provider failover, distributed circuit state, active-active regional recovery, provider spend reconciliation and autonomous-worker recovery are not implemented by this phase. No production secret values are supplied or changed by this repository change.
