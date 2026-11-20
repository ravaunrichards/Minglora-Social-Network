const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 15000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const MAX_OUTPUT_TOKENS = 4096;
const MAX_PROMPT_CHARACTERS = 12000;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const ANTHROPIC_API_VERSION = '2026-10-21';

const PROVIDERS = Object.freeze({
  openai: Object.freeze({
    baseUrl: 'https://api.openai.com/v1',
    baseUrlEnv: 'OPENAI_BASE_URL',
    credentialEnv: ['OPENAI_API_KEY'],
    modelEnv: 'OPENAI_DEFAULT_MODEL',
    legacyProvider: 'openai',
    legacyCredentialEnv: 'MINGLORA_AI_API_KEY',
    legacyModelEnv: 'MINGLORA_AI_MODEL'
  }),
  anthropic: Object.freeze({
    baseUrl: 'https://api.anthropic.com/v1',
    baseUrlEnv: 'ANTHROPIC_BASE_URL',
    credentialEnv: ['ANTHROPIC_API_KEY'],
    modelEnv: 'ANTHROPIC_DEFAULT_MODEL'
  }),
  google_gemini: Object.freeze({
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    baseUrlEnv: 'GEMINI_BASE_URL',
    credentialEnv: ['GEMINI_API_KEY', 'GOOGLE_AI_API_KEY'],
    modelEnv: 'GEMINI_DEFAULT_MODEL'
  })
});

export const SUPPORTED_AI_PROVIDER_ADAPTERS = Object.freeze(Object.keys(PROVIDERS));

export class AIProviderAdapterError extends Error {
  constructor(providerId, code, message, httpStatus = null) {
    super(message);
    this.name = 'AIProviderAdapterError';
    this.providerId = providerId;
    this.code = code;
    this.httpStatus = Number.isInteger(httpStatus) ? httpStatus : null;
  }
}

const text = value => String(value ?? '').trim();

function getProvider(providerId) {
  const id = text(providerId).toLowerCase();
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new AIProviderAdapterError(id || 'unknown', 'adapter_unavailable', 'No server-side adapter is implemented for this provider.', 501);
  }
  return { id, provider };
}

function getCredential(providerId, provider, env) {
  for (const name of provider.credentialEnv) {
    const value = text(env[name]);
    if (value) return value;
  }
  if (provider.legacyProvider === providerId
      && text(env.MINGLORA_AI_PROVIDER).toLowerCase() === provider.legacyProvider) {
    return text(env[provider.legacyCredentialEnv]);
  }
  return '';
}

function getModel(providerId, provider, env, requestedModel) {
  const configured = text(requestedModel)
    || text(env[provider.modelEnv])
    || (provider.legacyProvider === providerId
      && text(env.MINGLORA_AI_PROVIDER).toLowerCase() === provider.legacyProvider
      ? text(env[provider.legacyModelEnv])
      : '');
  if (!configured) {
    throw new AIProviderAdapterError(providerId, 'missing_model', 'Set a model identifier in the private server environment or provide a model selected from the provider model catalogue.', 503);
  }
  if (!MODEL_ID_PATTERN.test(configured)) {
    throw new AIProviderAdapterError(providerId, 'invalid_model', 'The configured model identifier has an invalid format.', 400);
  }
  return configured;
}

function getBaseUrl(providerId, provider, env) {
  const candidate = text(env[provider.baseUrlEnv]) || provider.baseUrl;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('unsafe endpoint');
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    throw new AIProviderAdapterError(providerId, 'invalid_endpoint', 'The provider base URL must be a valid HTTPS URL without embedded credentials, query parameters or fragments.', 400);
  }
}

function timeoutFor(env, timeoutMs) {
  const configured = Number(timeoutMs ?? env.MINGLORA_AI_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(configured)
    ? Math.min(Math.max(Math.trunc(configured), 1000), MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
}

function requestHeaders(providerId, credential) {
  const common = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (providerId === 'openai') return { ...common, Authorization: 'Bearer ' + credential };
  if (providerId === 'anthropic') {
    return {
      ...common,
      Authorization: 'Bearer ' + credential,
      'anthropic-version': ANTHROPIC_API_VERSION
    };
  }
  return { ...common, 'x-goog-api-key': credential };
}

async function requestJson(providerId, url, { fetchImpl, headers, method = 'GET', body, timeoutMs }) {
  if (typeof fetchImpl !== 'function') {
    throw new AIProviderAdapterError(providerId, 'adapter_unavailable', 'This server runtime does not provide an HTTP fetch implementation.', 503);
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new AIProviderAdapterError(
      providerId,
      timedOut ? 'timeout' : 'network_error',
      timedOut
        ? 'The provider request timed out. Check the private server network and request-timeout configuration.'
        : 'The provider request could not be completed. Check server networking and the provider endpoint.'
    );
  }

  if (!response || typeof response.status !== 'number' || typeof response.ok !== 'boolean') {
    throw new AIProviderAdapterError(providerId, 'invalid_response', 'The provider returned an invalid HTTP response.');
  }
  if (!response.ok) {
    const status = response.status;
    const code = status === 401 ? 'unauthorized'
      : status === 403 ? 'forbidden'
        : status === 404 ? 'model_unavailable'
          : status === 429 ? 'rate_limited'
            : status >= 500 ? 'provider_unavailable'
              : 'provider_error';
    const message = status === 401
      ? 'The provider rejected the configured credential. Verify that the private API key is valid and active.'
      : status === 403
        ? 'The provider credential does not have permission for this request.'
        : status === 404
          ? 'The requested provider endpoint or model was not found or is unavailable to this account.'
          : status === 429
            ? 'The provider rate limit or usage quota was reached.'
            : status >= 500
              ? 'The provider is temporarily unavailable. Retry after checking its status and quota.'
              : 'The provider returned an unsuccessful response. Response details and credentials were withheld.';
    throw new AIProviderAdapterError(providerId, code, message, status);
  }

  try {
    return await response.json();
  } catch {
    throw new AIProviderAdapterError(providerId, 'invalid_response', 'The provider returned a response that was not valid JSON.', response.status);
  }
}

function normalizeModels(providerId, payload) {
  if (providerId === 'openai') {
    if (!Array.isArray(payload?.data)) {
      throw new AIProviderAdapterError(providerId, 'invalid_response', 'The OpenAI model list did not contain a model array.');
    }
    return payload.data
      .filter(model => model && model.object === 'model' && typeof model.id === 'string')
      .map(model => ({ id: model.id, displayName: model.id, ownedBy: text(model.owned_by) || null, shutdownDate: text(model.shutdown_date) || null }));
  }

  if (providerId === 'anthropic') {
    if (!Array.isArray(payload?.data)) {
      throw new AIProviderAdapterError(providerId, 'invalid_response', 'The Anthropic model list did not contain a model array.');
    }
    return payload.data
      .filter(model => model && typeof model.id === 'string')
      .map(model => ({
        id: model.id,
        displayName: text(model.display_name) || model.id,
        lifecycle: text(model.lifecycle) || null,
        capabilities: model.capabilities && typeof model.capabilities === 'object' ? model.capabilities : null
      }));
  }

  if (!Array.isArray(payload?.models)) {
    throw new AIProviderAdapterError(providerId, 'invalid_response', 'The Gemini model list did not contain a model array.');
  }
  return payload.models
    .filter(model => model && typeof model.name === 'string'
      && Array.isArray(model.supportedGenerationMethods)
      && model.supportedGenerationMethods.includes('generateContent'))
    .map(model => ({
      id: text(model.baseModelId) || model.name.replace(/^models\//, ''),
      resourceName: model.name,
      displayName: text(model.displayName) || model.name,
      inputTokenLimit: Number.isFinite(model.inputTokenLimit) ? model.inputTokenLimit : null,
      outputTokenLimit: Number.isFinite(model.outputTokenLimit) ? model.outputTokenLimit : null
    }));
}

function extractOutput(providerId, payload) {
  if (providerId === 'openai') {
    if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
    const blocks = Array.isArray(payload?.output)
      ? payload.output.flatMap(item => Array.isArray(item?.content) ? item.content : [])
      : [];
    return blocks.filter(item => item?.type === 'output_text' && typeof item.text === 'string')
      .map(item => item.text).join('\n').trim();
  }

  if (providerId === 'anthropic') {
    return (Array.isArray(payload?.content) ? payload.content : [])
      .filter(item => item?.type === 'text' && typeof item.text === 'string')
      .map(item => item.text).join('\n').trim();
  }

  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  return candidates.flatMap(candidate => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .filter(part => typeof part?.text === 'string')
    .map(part => part.text).join('\n').trim();
}

function normalizeUsage(providerId, usage) {
  if (!usage || typeof usage !== 'object') return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const input = providerId === 'google_gemini'
    ? Number(usage.promptTokenCount || 0)
    : Number(usage.input_tokens || 0);
  const output = providerId === 'google_gemini'
    ? Number(usage.candidatesTokenCount || 0)
    : Number(usage.output_tokens || 0);
  const total = providerId === 'google_gemini'
    ? Number(usage.totalTokenCount || input + output)
    : Number(usage.total_tokens || input + output);
  return {
    inputTokens: Number.isFinite(input) && input > 0 ? Math.trunc(input) : 0,
    outputTokens: Number.isFinite(output) && output > 0 ? Math.trunc(output) : 0,
    totalTokens: Number.isFinite(total) && total > 0 ? Math.trunc(total) : 0
  };
}

function modelPath(model) {
  const id = text(model).replace(/^models\//, '');
  if (!MODEL_ID_PATTERN.test(id)) {
    throw new AIProviderAdapterError('google_gemini', 'invalid_model', 'The Gemini model identifier has an invalid format.', 400);
  }
  return 'models/' + encodeURIComponent(id);
}

export async function listAIProviderModels(providerId, options = {}) {
  const { id, provider } = getProvider(providerId);
  const env = options.env || process.env;
  const credential = getCredential(id, provider, env);
  if (!credential) {
    throw new AIProviderAdapterError(id, 'missing_credentials', 'Add the provider API key to the private Minglora server environment. No provider request was sent.', 503);
  }
  const baseUrl = getBaseUrl(id, provider, env);
  const headers = requestHeaders(id, credential);
  const timeoutMs = timeoutFor(env, options.timeoutMs);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const models = [];
  const seen = new Set();
  let pageToken = '';
  let hasMore = false;
  let pagesFetched = 0;
  const maxPages = 5;

  for (let page = 0; page < maxPages; page += 1) {
    const url = id === 'anthropic'
      ? baseUrl + '/models?limit=1000' + (pageToken ? '&after_id=' + encodeURIComponent(pageToken) : '')
      : id === 'google_gemini'
        ? baseUrl + '/models?pageSize=1000' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '')
        : baseUrl;
    const payload = await requestJson(id, url, { fetchImpl, headers, timeoutMs });
    const pageModels = normalizeModels(id, payload);
    for (const model of pageModels) {
      if (!model?.id || seen.has(model.id)) continue;
      seen.add(model.id);
      models.push(model);
    }
    pagesFetched += 1;

    if (id === 'anthropic') {
      hasMore = payload.has_more === true;
      const next = text(payload.last_id);
      if (!hasMore || !next || next === pageToken) break;
      pageToken = next;
    } else if (id === 'google_gemini') {
      const next = text(payload.nextPageToken);
      hasMore = Boolean(next);
      if (!next || next === pageToken) break;
      pageToken = next;
    } else {
      hasMore = false;
      break;
    }
  }

  return {
    providerId: id,
    models,
    hasMore,
    pagesFetched,
    truncated: hasMore
  };
}

export async function probeAIProvider(providerId, options = {}) {
  const checkedAt = (() => {
    try { return new Date((options.now || (() => new Date()))()).toISOString(); }
    catch { return new Date().toISOString(); }
  })();
  try {
    const result = await listAIProviderModels(providerId, options);
    const requestedModel = text(options.model);
    if (requestedModel && !result.models.some(model => model.id === requestedModel || model.resourceName === requestedModel)) {
      return {
        providerId: result.providerId,
        status: 'model_unavailable',
        connected: false,
        healthStatus: 'unknown',
        healthProbeAvailable: true,
        inferenceAdapterAvailable: true,
        executionEnabled: false,
        checkedAt,
        model: requestedModel,
        modelCount: result.models.length,
        note: 'Provider authentication succeeded, but the selected model was not present in the available model list. Verify model access and refresh the model selection.'
      };
    }
    return {
      providerId: result.providerId,
      status: 'healthy',
      connected: true,
      healthStatus: 'healthy',
      healthProbeAvailable: true,
      inferenceAdapterAvailable: true,
      executionEnabled: false,
      checkedAt,
      model: requestedModel || null,
      modelCount: result.models.length,
      note: 'Provider authentication and model listing succeeded. This probe does not test text generation, moderation, metering, routing, or worker execution.'
    };
  } catch (error) {
    const knownProvider = text(providerId).toLowerCase();
    const supported = Object.hasOwn(PROVIDERS, knownProvider);
    const code = error instanceof AIProviderAdapterError ? error.code : 'provider_error';
    return {
      providerId: knownProvider,
      status: code,
      connected: false,
      healthStatus: 'unknown',
      healthProbeAvailable: supported,
      inferenceAdapterAvailable: supported,
      executionEnabled: false,
      checkedAt,
      model: text(options.model) || null,
      modelCount: null,
      note: error instanceof AIProviderAdapterError ? error.message : 'The provider request failed. Provider details and credentials were withheld.'
    };
  }
}

/**
 * Low-level provider transport only. Callers must apply the Minglora authorization,
 * input/output moderation, identity scope, budget and usage-recording gates before
 * exposing generated text to users. This module intentionally creates no routes.
 */
export async function generateAIProviderText(providerId, {
  model: requestedModel,
  prompt,
  systemPrompt,
  maxOutputTokens
} = {}, options = {}) {
  const { id, provider } = getProvider(providerId);
  const env = options.env || process.env;
  const credential = getCredential(id, provider, env);
  if (!credential) {
    throw new AIProviderAdapterError(id, 'missing_credentials', 'Add the provider API key to the private Minglora server environment. No provider request was sent.', 503);
  }
  const model = getModel(id, provider, env, requestedModel);
  const normalizedPrompt = text(prompt);
  if (!normalizedPrompt || normalizedPrompt.length > MAX_PROMPT_CHARACTERS) {
    throw new AIProviderAdapterError(id, 'invalid_prompt', 'Prompt text must contain between 1 and 12,000 characters.', 400);
  }
  const timeoutMs = timeoutFor(env, options.timeoutMs);
  const maxTokensValue = Number(maxOutputTokens ?? env.MINGLORA_AI_MAX_OUTPUT_TOKENS ?? DEFAULT_MAX_OUTPUT_TOKENS);
  const boundedOutputTokens = Number.isFinite(maxTokensValue)
    ? Math.min(Math.max(Math.trunc(maxTokensValue), 1), MAX_OUTPUT_TOKENS)
    : DEFAULT_MAX_OUTPUT_TOKENS;
  const baseUrl = getBaseUrl(id, provider, env);
  const headers = requestHeaders(id, credential);
  let url;
  let body;

  if (id === 'openai') {
    url = baseUrl + '/responses';
    body = {
      model,
      input: normalizedPrompt,
      ...(text(systemPrompt) ? { instructions: text(systemPrompt).slice(0, 4000) } : {}),
      max_output_tokens: boundedOutputTokens,
      store: false,
      tools: []
    };
  } else if (id === 'anthropic') {
    url = baseUrl + '/messages';
    body = {
      model,
      max_tokens: boundedOutputTokens,
      ...(text(systemPrompt) ? { system: text(systemPrompt).slice(0, 4000) } : {}),
      messages: [{ role: 'user', content: normalizedPrompt }]
    };
  } else {
    url = baseUrl + '/' + modelPath(model) + ':generateContent';
    body = {
      ...(text(systemPrompt) ? { systemInstruction: { parts: [{ text: text(systemPrompt).slice(0, 4000) }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: normalizedPrompt }] }],
      generationConfig: { maxOutputTokens: boundedOutputTokens }
    };
  }

  const payload = await requestJson(id, url, {
    fetchImpl: options.fetchImpl || globalThis.fetch,
    headers,
    method: 'POST',
    body,
    timeoutMs
  });
  const output = extractOutput(id, payload);
  if (!output || output.length > 32000) {
    throw new AIProviderAdapterError(id, 'invalid_generation', 'The provider did not return a usable text response. No result was accepted.');
  }

  const responseModel = text(payload.model) || model;
  const requestId = text(payload._request_id || payload.request_id || payload.responseId || payload.response_id || payload.id)
    || (typeof options.requestIdFromHeaders === 'function' ? text(options.requestIdFromHeaders()) : '');
  return {
    providerId: id,
    model: responseModel.slice(0, 200),
    output,
    requestId: requestId.slice(0, 200) || null,
    usage: normalizeUsage(id, payload.usage || payload.usageMetadata)
  };
}

export function getAIProviderAdapter(providerId) {
  const id = text(providerId).toLowerCase();
  if (!Object.hasOwn(PROVIDERS, id)) return null;
  return Object.freeze({
    providerId: id,
    listModels: options => listAIProviderModels(id, options),
    probe: options => probeAIProvider(id, options),
    generateText: (input, options) => generateAIProviderText(id, input, options)
  });
}
