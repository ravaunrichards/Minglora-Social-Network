# Minglora AI provider and environment configuration

**Scope:** Minglora Social Network AI Bot Network only.  
**Configuration template:** .env.example  
**Credential storage:** private server environment / approved secrets manager only.  
**Current runtime status:** a moderated OpenAI adapter for owner-initiated AI bot conversations and Creator Studio drafts is implemented and deployed. It remains unavailable in production until a real private API key/model passes the live provider probe and inference acceptance.

## ChatGPT guest versus OpenAI API

This ChatGPT conversation is an **interactive guest session**, not an API endpoint that the Minglora server can call. The provider catalogue includes chatgpt_guest so the requested guest option is visible and accurately classified, but it is deliberately non-routable and has no credential slot.

For Minglora server-side OpenAI inference, use the separate **OpenAI Platform API** provider and configure OPENAI_API_KEY in the private Minglora server environment. A ChatGPT app subscription or the current conversation does not automatically provide Minglora with an API key, API billing, or permission to call this session.

## Provider catalogue

The provider inventory covers the following integration families. These are configuration targets, not claims that the adapters or accounts are already connected.

| Family | Provider IDs |
|---|---|
| Language and multimodal models | openai, anthropic, google_gemini, xai, mistral, cohere, groq, together_ai, fireworks_ai, deepseek, openrouter, perplexity, huggingface, replicate |
| Enterprise model platforms | azure_openai, aws_bedrock, google_vertex |
| Self-hosted / OpenAI-compatible | ollama, vllm, lm_studio, openai_compatible |
| Interactive guest session | chatgpt_guest — visible only; not callable by Minglora |
| Voice and speech | elevenlabs, deepgram, assemblyai, cartesia, azure_speech, google_cloud_speech |
| Image and video generation | stability_ai, fal_ai, runway, luma_ai, replicate |
| Web search | tavily, brave_search, serpapi |
| Vector storage / retrieval | pinecone, qdrant, weaviate |
| Transactional email | smtp, resend, sendgrid, postmark, mailgun, amazon_ses |

The matching provider credential variable names are defined in backend/modules/ai-network/provider-config.js and have blank entries in .env.example. Optional endpoint, deployment, model and region fields are included beside each provider's credential slots.

## Runtime truth and safety gates

Minglora deliberately separates these states:

1. **Placeholder exists:** a variable name is present in .env.example.
2. **Credential present:** a private environment variable contains a non-empty value.
3. **Provider connected:** a real server-side adapter has authenticated successfully with the provider.
4. **Provider healthy:** a real health/probe request has succeeded and is recent.
5. **Inference enabled:** an approved adapter, request validation, safety filtering, timeouts, retries, rate limits, usage metering, owner budget and operational controls have passed acceptance.
6. **Identity assigned:** a database assignment references a model/provider account; new assignments still start pending with unknown health.

The OpenAI catalogue entry includes server-side adapters for **human-initiated, owner-scoped AI bot conversations and Creator Studio drafts**. It requires `OPENAI_API_KEY` and `OPENAI_DEFAULT_MODEL` (or the explicitly selected legacy `MINGLORA_AI_PROVIDER=openai`, `MINGLORA_AI_API_KEY`, and `MINGLORA_AI_MODEL` combination). The designated-admin-only `POST /api/ai-network/creator-jobs/{jobId}/generate` route first performs a fresh model-access probe, moderates the submitted brief, calls the Responses API with `store:false` and no tools, then moderates the generated output. If provider health, generation, or either moderation step fails, no draft output is saved. Token usage and provider/model references are recorded with the draft and included in AI performance totals. Before generation, Minglora reserves an estimated prompt allowance plus the bounded output tokens against the owner's daily AI token budget and refuses requests without enough remaining allowance. This is token-budget enforcement, not a dollar-cost estimate; exact spend reconciliation requires a verified model-price schedule and is not yet implemented. The returned text stays in the existing Creator Studio draft record with AI disclosure and human-review requirements; no publishing, scheduling, public posting, messaging or background worker is invoked. Stale in-progress jobs become retryable after the five-minute generation lease expires.

The Bot Personality Lab conversation route is also implemented: `GET /api/ai-network/bots/:botId/conversation` and `POST /api/ai-network/bots/:botId/chat`. It uses the private `OPENAI_API_KEY` and `OPENAI_DEFAULT_MODEL`, performs a fresh model-access probe, moderates the user input and generated output, calls Responses with `store:false` and no tools, and records the exchange and measured token usage in the owner-scoped relational conversation store. It is an explicit human request, not an autonomous worker. For this first chat path, provider-account metadata rows and model-assignment rows are not prerequisites; the private key/model and successful probe are.

The OpenAI entry also advertises a **read-only model-access health probe**. The designated-admin-only `POST /api/ai-network/provider-health` endpoint reads the key and model from the private server environment and calls OpenAI's model retrieval endpoint. It accepts only the provider identifier in the request body; it rejects browser-supplied credential fields. A successful probe confirms that the configured API key can retrieve the selected model, but it does **not** verify text generation, moderation, cost metering, routing, or worker execution. The result is not persisted as a connected state; a fresh probe is required to confirm current provider health.

## Phase 4.2 — server-side provider adapter registry

The backend now has a shared adapter interface for **OpenAI, Anthropic Claude, and Google Gemini** in `backend/modules/ai-network/provider-adapters.js`. For each of these three providers it supports:

- Authenticated model discovery from the provider's native model-list endpoint.
- A read-only connection probe that reports whether authentication and model listing succeeded.
- A server-side text-generation transport with bounded timeouts and output-token limits.
- Provider-specific response parsing and normalized token-usage fields.
- Sanitized errors; response bodies, API keys and authorization headers are not returned in adapter results or error messages.

The adapter contracts follow the providers' current API references: [OpenAI model listing and Responses API](https://developers.openai.com/api/reference/resources/models/methods/list), [Anthropic Models API and Messages API](https://platform.claude.com/docs/en/api/overview), and [Gemini Models API and generateContent API](https://aistudio.google.com/api-reference/models). OpenAI and Anthropic use bearer authorization; Gemini sends its API key in the `x-goog-api-key` header. All configurable provider base URLs are restricted to HTTPS and cannot include embedded credentials, query strings or fragments. Requests reject redirects and have bounded timeouts.

**Important boundary:** these are backend transport adapters, not a declaration that the providers are connected or approved for production execution. Anthropic and Gemini are not yet wired to customer-facing Minglora routes. The shared generation function does not itself perform Minglora content moderation, user authorization, identity scoping, budget reservation, usage persistence or publishing controls. Any caller must pass those gates before returning generated text. The existing OpenAI human-initiated routes keep their separate moderation and owner-control protections.

A successful model-list probe confirms API authentication and the ability to list models; it does not prove that a selected model can generate content, that quota is available, or that inference is production-ready. The adapter contract tests use simulated HTTP responses and do not consume provider credits. A live connection check still requires private credentials and must be run from the server environment.

## Phase 4.3 — provider connection management

The provider registry now has an explicit connection-management layer.

### Provider health checks

POST /api/ai-network/provider-health accepts only:

- provider
- optional provider_account_id
- optional model

It never accepts an API key, token, password or secret reference. The server selects the credential from its private environment and calls the implemented provider adapter. OpenAI, Anthropic and Google Gemini can therefore be checked through the same route. A successful model-list request proves current authentication/model-list access; it does not enable inference.

Persisting a health event to an account requires an owner-scoped **managed** account reference because provider checks use the Minglora platform's private environment credentials. User-managed account references are not connected to separate secret values yet; they can still be recorded as metadata, but cannot be reported as verified by the platform key. A disabled managed account may be probed and, after a successful fresh check, explicitly re-enabled. Revoked accounts cannot be probed or reactivated.

When a provider account ID is supplied, the sanitized health result is persisted to ai_network.ai_provider_health_events, the account's health_status and last_checked_at are updated, and linked model assignments receive the same health state. The persisted record contains status, model identifier, response time, sanitized error code/reason and non-secret metadata only.

### Provider enable / disable

Provider account references now support these administrative states:

- unconfigured — initial account reference; no successful health verification recorded.
- enabled — administrator explicitly enabled the account after a recent successful health check.
- disabled — administrator explicitly disabled the account; no inference should route through it.
- revoked — permanently disabled and cannot be reactivated through this control.

An account cannot be changed to enabled unless its health is healthy and its last successful health check is no more than 15 minutes old. A health check never auto-enables an account.

The admin Provider & Model Assignment Center now exposes provider selection, account selection, connection checks, and account status controls. It still does not expose credentials.

### Health history

GET /api/ai-network/provider-accounts/:accountId/health returns the recent sanitized health events for an owner-scoped provider account. This creates an auditable connection history without storing provider secrets.

The database function remains restricted to the server runtime and continues to reject raw credentials. Supabase's current security guidance recommends keeping elevated database access server-side and explicitly controlling function execution privileges; the new health-event table is RLS-enabled and granted only to service_role. citeturn345135search0turn345135search9

**Deployment boundary:** the Phase 4.3 migration is included in the feature branch but is not applied to the live Supabase project until the PR is reviewed/merged. This avoids schema drift between the deployed application and the migration history. Supabase's migration guidance likewise recommends versioning schema changes and deploying them through the migration workflow. citeturn345135search2

## Phase 4.4 — model discovery and verified model selection

Minglora now discovers models through each implemented provider's authenticated native model-list API and imports the returned model IDs into the existing provider model catalogue.

### Provider discovery behavior

- **OpenAI:** GET /v1/models. Model shutdown metadata is retained for selection checks. The endpoint does not declare whether every returned model is a text-generation model, so the catalogue does not automatically claim text-generation capability for OpenAI models.
- **Anthropic:** GET /v1/models with a maximum page size of 1000 and after_id cursor pagination. Only models in the active lifecycle are imported and selectable; deprecated and retired entries are not selected.
- **Google Gemini:** GET /v1beta/models with pageSize up to 1000 and nextPageToken pagination. Only models advertising generateContent are imported as text-generation candidates.

Discovery follows up to five pages per provider request and processes up to 250 models into the catalogue per synchronization. Repeated synchronization reuses existing provider/model/version catalogue records instead of duplicating the same record.

### Model synchronization

POST /api/ai-network/provider-models/sync accepts only a provider ID and an optional owner-scoped provider account ID. Credentials are always read from the private server environment. If an account ID is supplied, Minglora checks that the account belongs to the current administrator and matches the selected provider. Disabled and revoked accounts cannot be used for discovery.

The response reports how many models were discovered, inserted, reused or failed. When a provider account is supplied, a successful authenticated model-list request also records a sanitized provider health event with its response time and model count. This is a discovery check only; it never automatically enables the provider account.

### Verified model selection

Before an administrator creates a primary or fallback assignment for OpenAI, Anthropic or Gemini, Minglora checks the chosen model against the current provider model-list response. Inactive catalogue records, missing provider model IDs, OpenAI models past their shutdown date, and Anthropic models that are not in the active lifecycle are rejected. Bulk assignment performs the same live check.

A model returned by a provider's list API is **provider-listed**, not inference-tested. This stage does not send test prompts, establish that a model can generate content under the current account's quota, confirm all modalities, or enable inference. All newly created identity assignments remain pending; autonomous execution and provider workers remain disabled.

Phase 4.4 reuses the existing provider-model catalogue and database command. It adds no live database schema migration. Phase 4.3's health-event schema migration remains in the feature branch pending review and coordinated deployment.

Owner-control behavior: the Resume action performs a fresh OpenAI model-access probe before clearing the owner's global pause. Enabling a bot for owner-initiated use also performs a fresh probe and remains subject to the global pause. This changes only owner-controlled AI availability; it does not start durable queue workers or autonomous schedules. Schedule activation stays unavailable until the separate worker claim/lease/heartbeat/completion runtime is deployed and accepted. Pause, resume and bot status controls call their server routes; provider failure is returned as an actionable API error rather than silently marking the provider connected.

The provider helper reports only credential-variable presence and adapter/probe availability; it never returns secret values. The adapter registry now implements OpenAI, Anthropic and Google Gemini, but the presence of an adapter or a non-empty credential does not mark a provider connected. Only a successful server-side probe can report current model-list connectivity, and no such result is persisted by this stage. Anthropic and Gemini generation are not connected to user-facing routes. Existing OpenAI owner-initiated inference continues to use its separate moderation and owner-scope gates. Autonomous worker execution remains disabled independently.

The existing generic MINGLORA_AI_PROVIDER, MINGLORA_AI_MODEL, and MINGLORA_AI_API_KEY triplet is retained for backwards compatibility. The generic triplet is not proof of a working adapter. Provider-specific variables are prepared for future adapters and do not independently unpause workers.

## Environment groups

### Core provider selection

- MINGLORA_AI_PROVIDER
- MINGLORA_AI_MODEL
- MINGLORA_AI_API_KEY (legacy generic credential slot)
- MINGLORA_AI_FALLBACK_PROVIDER
- MINGLORA_AI_FALLBACK_MODEL
- MINGLORA_AI_REQUEST_TIMEOUT_MS
- MINGLORA_AI_MAX_RETRIES
- MINGLORA_AI_MAX_OUTPUT_TOKENS
- MINGLORA_AI_GUEST_PROVIDER_ENABLED (must remain false; it cannot expose this ChatGPT session to the server)

### Language and multimodal providers

- OpenAI: OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_ORGANIZATION_ID, OPENAI_PROJECT_ID, OPENAI_DEFAULT_MODEL
- Anthropic: ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_DEFAULT_MODEL
- Google Gemini: GEMINI_API_KEY or GOOGLE_AI_API_KEY, plus optional base URL/model
- xAI, Mistral, Cohere, Groq, Together AI, Fireworks AI, DeepSeek, OpenRouter, Perplexity, Hugging Face and Replicate: each has a dedicated API token and optional model/endpoint fields.
- Azure OpenAI: API key, endpoint, API version and deployment name are all required.
- AWS Bedrock: region plus a supported AWS credential chain (environment key pair, profile or web-identity token); prefer IAM roles instead of long-lived access keys.
- Google Vertex AI: project and location; prefer workload identity / Application Default Credentials. A credentials-file path is an optional deployment setting and must never point to a committed file.
- Ollama, vLLM and LM Studio: private base URL and model; keep local inference endpoints network-restricted.
- Custom OpenAI-compatible endpoint: base URL, optional API key and model.

### Media, search and retrieval

- Voice/speech: ElevenLabs, Deepgram, AssemblyAI, Cartesia, Azure Speech and Google Cloud Speech.
- Image/video: Stability AI, fal.ai, Runway, Luma AI and Replicate.
- Search: Tavily, Brave Search and SerpAPI.
- Vector stores: Pinecone, Qdrant and Weaviate.

These slots do not imply that those services are required for the first release. Add only the providers needed for enabled capabilities and configure provider-specific budgets and retention policies.

### Email provider preparation

SMTP, Resend, SendGrid, Postmark, Mailgun and Amazon SES are represented in the provider catalogue. The existing SMTP, Resend and SendGrid settings remain intact; the newer Postmark, Mailgun and SES environment slots are blank placeholders. SMTP expects a host, username, password and sender address; Mailgun expects its API key and sending domain; Amazon SES uses the AWS region plus an IAM credential chain. An email address record is not an inbox; mailbox creation, delivery and bounce/verification handling need a real email adapter and provider-side verification.

## Safe setup procedure

1. Copy .env.example to an untracked private .env for local development, or add the selected values directly to the Minglora server's private deployment environment.
2. Keep every key out of browser bundles, public Git files, database profile/provider columns, logs, screenshots and chat messages.
3. Use separate keys for development, staging and production. Apply least-privilege scopes, quotas, spend limits and rotation.
4. Do not paste credentials into the provider-account API. It accepts provider metadata only; it must not receive raw keys or secret references.
5. Store the first OpenAI key and model in the existing Render service's private environment (or an approved secret manager). The Node API reads them server-side; never store raw credentials in provider metadata or browser forms.
6. After an adapter exists, verify its authentication, model access, capability claims, region, quotas, cost meter, moderation, timeout and fallback behavior before changing any connection or execution status.
7. Keep the AI worker control row paused and execution disabled until every operational gate has passed.

### Current deployment boundary

The existing Render service `minglora-social-network-temp` is the user-confirmed production target and is attached to `main` with automatic deploy-on-commit enabled. Its private environment currently has no OpenAI credential/model, as confirmed by the live readiness log. Provider values must be entered privately in Render; no API key is required in this repository or browser.

A ChatGPT app subscription or this chat session cannot be used as Minglora's model API key. Never invent a key, infer one from another integration or weaken the server-side credential boundary.

### Existing credentials are preserved

This documentation update does not edit any Render service environment, Supabase Edge Function secret, provider account, user credential, live API key, mailbox or running service. Do not paste credentials into the repository or chat to populate the template.
