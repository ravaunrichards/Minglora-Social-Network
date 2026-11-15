# Minglora AI provider and environment configuration

**Scope:** Minglora Social Network AI Bot Network only.  
**Configuration template:** .env.example  
**Credential storage:** private server environment / approved secrets manager only.  
**Current runtime status:** provider catalogue and credential inventory only; no AI inference adapter is certified or enabled.

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

The OpenAI catalogue entry now also includes a server-side text-generation adapter for **human-triggered Creator Studio drafts only**. It requires `OPENAI_API_KEY` and `OPENAI_DEFAULT_MODEL` (or the explicitly selected legacy `MINGLORA_AI_PROVIDER=openai`, `MINGLORA_AI_API_KEY`, and `MINGLORA_AI_MODEL` combination). The designated-admin-only `POST /api/ai-network/creator-jobs/{jobId}/generate` route first performs a fresh model-access probe, moderates the submitted brief, calls the Responses API with `store:false` and no tools, then moderates the generated output. If provider health, generation, or either moderation step fails, no draft output is saved. Token usage and provider/model references are recorded with the draft and included in AI performance totals. Before generation, Minglora reserves an estimated prompt allowance plus the bounded output tokens against the owner's daily AI token budget and refuses requests without enough remaining allowance. This is token-budget enforcement, not a dollar-cost estimate; exact spend reconciliation requires a verified model-price schedule and is not yet implemented. The returned text stays in the existing Creator Studio draft record with AI disclosure and human-review requirements; no publishing, scheduling, public posting, messaging or background worker is invoked. Stale in-progress jobs become retryable after the five-minute generation lease expires.

The OpenAI entry also advertises a **read-only model-access health probe**. The designated-admin-only `POST /api/ai-network/provider-health` endpoint reads the key and model from the private server environment and calls OpenAI's model retrieval endpoint. It accepts only the provider identifier in the request body; it rejects browser-supplied credential fields. A successful probe confirms that the configured API key can retrieve the selected model, but it does **not** verify text generation, moderation, cost metering, routing, or worker execution. The result is not persisted as a connected state; a fresh probe is required to confirm current provider health.

The provider helper may report only credential-variable presence. It never returns secret values. It always reports adapterAvailable=false, connected=false and executionEnabled=false until a real adapter and health verifier are implemented and independently accepted.

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
5. Use an approved secret manager for production. Store only opaque secret references in database metadata.
6. After an adapter exists, verify its authentication, model access, capability claims, region, quotas, cost meter, moderation, timeout and fallback behavior before changing any connection or execution status.
7. Keep the AI worker control row paused and execution disabled until every operational gate has passed.

### Existing credentials are preserved

This change adds blank template fields only. It does not edit any local .env, Render service environment, Supabase Edge Function secret, provider account, user credential, live API key, mailbox or running service. Do not paste existing credentials into the repository to populate the template.
