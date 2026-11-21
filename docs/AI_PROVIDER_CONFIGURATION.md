# Minglora AI provider and environment configuration

**Scope:** Minglora Social Network AI Bot Network only.  
**Configuration template:** .env.example  
**Credential storage:** private server environment / approved secrets manager only.  
**Current runtime status:** the OpenAI adapter supports owner-initiated AI bot conversations and Creator Studio drafts. The Google Gemini adapter supports owner-initiated AI bot conversations only. Production chat remains unavailable until the selected provider's private API key/model passes its live health probe and the first real inference test.

## ChatGPT guest versus OpenAI API

This ChatGPT conversation is an **interactive guest session**, not an API endpoint that the Minglora server can call. The provider catalogue includes chatgpt_guest so the requested guest option is visible and accurately classified, but it is deliberately non-routable and has no credential slot.

For Minglora server-side OpenAI inference, use the separate **OpenAI Platform API** provider and configure OPENAI_API_KEY in the private Minglora server environment. A ChatGPT app subscription or the current conversation does not automatically provide Minglora with an API key, API billing, or permission to call this session.

## Provider catalogue

The provider inventory covers the following integration families. OpenAI and Google Gemini have owner-initiated bot-chat adapters; the other entries remain configuration candidates only. Catalogue presence never means an account is connected or an adapter is active.

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

The provider workspace offers a designated-admin-only, read-only `POST /api/ai-network/provider-health` probe for either `openai` or `google_gemini`. The request accepts only the provider identifier; browser-supplied credentials or extra fields are rejected. OpenAI checks the configured model endpoint using `OPENAI_API_KEY`; Gemini checks `/v1beta/models/{model}` using the `x-goog-api-key` header. A successful probe confirms model access only. It does **not** prove a real generation response, moderation behavior, exact billing, assignment activation, or worker execution. Probe results are process-local observations, not a persisted Connect switch; a fresh check is required when enabling owner-controlled bot use.

## Phase 4.7 — controlled fallback-model routing and provider recovery

Fallback routing is optional and remains on the **same provider** as the primary model so a request never silently switches credential sets or safety behavior. For OpenAI, set `MINGLORA_AI_FALLBACK_PROVIDER=openai` and a distinct `MINGLORA_AI_FALLBACK_MODEL`; for Gemini, use `MINGLORA_AI_FALLBACK_PROVIDER=google_gemini` and a distinct Gemini model accessible to the same API key. Leave both values blank to disable fallback. Cross-provider fallback is rejected.

Bot chat and Creator Studio apply retries only to generation calls. The retry ceiling is two retries (three total attempts) and can be lowered with `MINGLORA_AI_MAX_RETRIES=0` or `1`. Network errors, timeouts, HTTP 408/425/429, 5xx responses and incomplete/invalid generated responses are eligible for bounded retry. A model-unavailable response (404) skips retries and tries the configured fallback model immediately. Authentication (401), permission (403), configuration, input validation and moderation failures do not trigger model fallback. The fallback never runs before input moderation, and generated output is still moderated after the selected model returns. If moderation is unavailable or flags the output, no bot reply or Creator Studio draft is saved.

A process-local circuit breaker is maintained per OpenAI model. Three exhausted transient generation failures open that model's circuit for 30 seconds; a model-unavailable response opens it immediately. After the cooldown, one request is admitted as a half-open recovery attempt. A successful generation closes the circuit. The breaker is process-local, not a distributed/global coordinator; with multiple Node instances each instance may have different observations. It does not claim cross-region failover or durable provider health. Moderation requests are intentionally outside this breaker and remain fail-closed.

Returned routing metadata identifies the selected provider/model, whether fallback was used, bounded attempt outcomes and retries. If the provider returns usage on a failed/incomplete generation, it is included with the eventual successful response usage; failed HTTP requests may provide no usage at all, so exact billing reconciliation is not claimed. No API key, authorization header or raw provider error body is returned.

The existing read-only provider-health endpoint probes the configured primary model. The fallback model is validated against the configured OpenAI project when first selected for generation; configure a model the same project can access. This feature does not mark a provider connected, activate identity assignments, resume autonomous workers, or alter the global execution pause.

See the [Phase 4.7 fallback and recovery runbook](AI_PROVIDER_FALLBACK_RECOVERY.md) for the operator checklist and failure matrix.

Owner-control behavior: Resume and bot enable perform a fresh health probe against the selected supported provider before reopening owner-controlled chat. Bot status remains subject to the owner's global pause. This affects only human-initiated chat; it does not start durable queue workers or autonomous schedules. Schedule activation remains unavailable until the separate worker claim/lease/heartbeat/completion runtime is deployed and accepted. Pause, resume and bot status controls call real server routes; provider failures are returned as actionable API errors rather than marking a provider connected without evidence.

**OpenAI capabilities:** owner-initiated bot conversations and Creator Studio draft generation. Both use the private server API key, token budgets and the OpenAI moderation endpoint before a reply or draft is saved.

**Google Gemini capabilities:** owner-initiated bot conversations only. The adapter uses the Gemini `generateContent` API with server-only `GEMINI_API_KEY` (or `GOOGLE_AI_API_KEY`) and `GEMINI_DEFAULT_MODEL`. It supplies a fixed system instruction, conversation history, and Gemini safety settings for harassment, hate speech, sexually explicit and dangerous content. Requests or candidates blocked by Gemini safety filters are not saved; incomplete candidates are not saved. Token usage is taken from Gemini `usageMetadata`. The adapter has no tools and cannot publish, message third parties, spend money or modify accounts. Creator Studio remains OpenAI-only. Provider safety filters are not equivalent to OpenAI's moderation endpoint and should be evaluated with real acceptance prompts before general rollout.

The provider helper reports only credential-variable presence and adapter/probe availability; it never returns secret values. A successful model-access probe is a prerequisite but not proof that a generation will succeed. The first owner-initiated conversation remains the actual inference acceptance check. Autonomous worker execution, schedule starts and unattended posting remain disabled independently.

The generic `MINGLORA_AI_PROVIDER`, `MINGLORA_AI_MODEL`, and `MINGLORA_AI_API_KEY` triplet is retained for backwards compatibility. For Gemini, explicitly set `MINGLORA_AI_PROVIDER=google_gemini` to select it when OpenAI credentials are also configured.

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

- OpenAI owner chat and Creator Studio drafts: OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_ORGANIZATION_ID, OPENAI_PROJECT_ID, OPENAI_DEFAULT_MODEL
- Google Gemini owner chat: set MINGLORA_AI_PROVIDER=google_gemini, then GEMINI_API_KEY (or GOOGLE_AI_API_KEY), GEMINI_DEFAULT_MODEL, and optionally GEMINI_BASE_URL. Default API base: https://generativelanguage.googleapis.com/v1beta. Creator Studio generation is not yet supported on Gemini.
- Anthropic: ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_DEFAULT_MODEL
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
