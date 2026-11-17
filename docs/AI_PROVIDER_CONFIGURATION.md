# Minglora AI provider and environment configuration

**Scope:** Minglora Social Network AI Bot Network only.  
**Configuration template:** .env.example  
**Credential storage:** private server environment / approved secrets manager only.  
**Current implementation status:** OpenAI text inference code now supports owner/MFA-initiated AI bot chat and a per-assignment moderated execution-verification test on `feat/minglora-ai-provider-model-execution-20261117`. The additive verification migration and runtime gateway change remain source-only; no production provider credential, model account, assignment or inference has been verified.

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

The OpenAI entry also advertises a **read-only model-access probe**. The designated-admin-only `POST /api/ai-network/provider-health` endpoint reads the key and selected model from the private server environment and calls OpenAI's model-retrieval endpoint. It rejects browser-supplied credential fields. A successful retrieval confirms API model access only; it does not establish that generation and moderation work.

The feature branch adds a distinct **per-assignment execution verification** action: `POST /api/ai-network/provider-assignments/{assignmentId}/verify`. The server looks up the assignment and model in the owner's saved provider catalogue; browser requests cannot supply a model identifier, provider override or credential. The first adapter supports OpenAI text models only. After a fresh selected-model access probe, Minglora submits a fixed technical marker prompt, requires input moderation, calls the Responses API with `store:false`, no tools and a small output cap, requires the exact marker response, and performs output moderation. This test is real provider inference and may incur API charges. The Provider Center asks for explicit confirmation before running it. The test sends no AI profile, conversation, personal data or memory context.

Only a successful, moderated inference test can mark the saved provider account healthy/configured and the assignment active/healthy. Failure records a sanitized status and usage event, leaves the assignment pending or restricts a previously active assignment, and never stores an API key. The new `ai_provider_health_events` table and service-role-only `minglora_ai_provider_execution_command` RPC provide the audit ledger. This migration is source-only pending review and production approval; the current production schema does not yet contain this new health table/RPC.

The owner/MFA bot chat route now resolves the model strictly from that AI identity's active, healthy database assignment, checks the private server provider credential and the selected model, and uses the assigned model instead of a global model override. A configured fallback model is tried only for retryable provider/network/model errors; content moderation failures, missing credentials, invalid settings and safety failures do not trigger fallback. The chat adapter still uses input/output moderation, `store:false`, and `tools:[]`. There are no tools, external side effects, posting, messaging other users, spending, admin actions or autonomous worker execution.

This first execution adapter is **OpenAI text only**. Anthropic, Gemini, xAI and other catalogue entries remain integration metadata/configuration slots until their own adapters, health checks, safety tests and production acceptance are implemented. Credential-variable presence never means a provider is connected. The generic MINGLORA_AI_PROVIDER/MINGLORA_AI_MODEL/MINGLORA_AI_API_KEY values remain compatibility settings, but do not override a valid saved per-identity assignment.

All autonomous task workers remain globally paused, execution-disabled and at zero workers. This implementation adds manual administrator verification and assignment-routed owner chat; it does not enable the durable task queue or scheduler.

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


## Provider account ownership boundary

The first executable adapter is the Minglora-managed OpenAI account path. Its private server environment key must not be used to verify or execute a user-managed account reference. The API route, provider route resolver and service-role activation function all reject accounts whose persisted account_type is not `managed`. User-managed account references remain registrable but are not executable until an approved secrets-manager integration resolves their individual credential reference. Assigned-model chat calls also ignore the legacy global `MINGLORA_AI_API_KEY`; they require `OPENAI_API_KEY` for a managed assignment.

