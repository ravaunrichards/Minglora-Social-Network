const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;
const FALLBACK_CODES = new Set(['model_unavailable', 'circuit_open']);
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRIES = 2;
const FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30000;
const DEFAULT_CIRCUIT_STORE = new Map();

const routeError = (code, message, status = 503, metadata = {}) => Object.assign(
  new Error(message),
  { code, status, safeForClient: true, ...metadata }
);

const normalize = value => String(value ?? '').trim().toLowerCase();

function readRetryCount(value) {
  const parsed = Number(value ?? DEFAULT_MAX_RETRIES);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_RETRIES;
  return Math.min(Math.max(Math.trunc(parsed), 0), MAX_RETRIES);
}

/**
 * Resolves the only currently supported safe route. The production catalogue
 * contains other providers, but they remain non-routable until an adapter and
 * its authentication, moderation and usage contracts are independently tested.
 */
export function resolveProviderRoute({ primaryProvider = 'openai', primaryModel, env = process.env } = {}) {
  const primary = normalize(primaryProvider);
  const model = String(primaryModel ?? '').trim();
  if (primary !== 'openai') {
    throw routeError('provider_adapter_unavailable', 'The selected primary provider does not have an approved Minglora inference adapter.', 503);
  }
  if (!MODEL_ID_PATTERN.test(model)) {
    throw routeError('invalid_primary_model', 'The primary provider model identifier is invalid.', 503);
  }

  const fallbackProvider = normalize(env.MINGLORA_AI_FALLBACK_PROVIDER);
  const fallbackModel = String(env.MINGLORA_AI_FALLBACK_MODEL ?? '').trim();
  if (Boolean(fallbackProvider) !== Boolean(fallbackModel)) {
    throw routeError(
      'invalid_fallback_config',
      'Configure both MINGLORA_AI_FALLBACK_PROVIDER and MINGLORA_AI_FALLBACK_MODEL, or leave both empty.',
      503
    );
  }
  if (fallbackProvider && fallbackProvider !== 'openai') {
    throw routeError(
      'fallback_adapter_unavailable',
      'The configured fallback provider has no approved Minglora inference adapter. Only an alternate OpenAI model can currently be used as fallback.',
      503
    );
  }
  if (fallbackModel && !MODEL_ID_PATTERN.test(fallbackModel)) {
    throw routeError('invalid_fallback_config', 'The fallback model identifier is invalid.', 503);
  }
  if (fallbackModel && fallbackModel === model) {
    throw routeError('invalid_fallback_config', 'The fallback model must differ from the primary model.', 503);
  }

  return Object.freeze({
    primaryProvider: primary,
    primaryModel: model,
    fallbackProvider: fallbackProvider || null,
    fallbackModel: fallbackModel || null,
    maxRetries: readRetryCount(env.MINGLORA_AI_MAX_RETRIES)
  });
}

function numericUsage(usage, field) {
  const raw = usage?.[field];
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function aggregateUsage(entries) {
  const fields = ['input_tokens', 'output_tokens', 'total_tokens'];
  const totals = {};
  for (const field of fields) {
    const values = entries.map(entry => numericUsage(entry, field)).filter(value => value !== null);
    totals[field] = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  return totals;
}

function getCircuitKey(providerId, model) {
  return providerId + ':' + model;
}

function acquireCircuit(store, key, currentTime) {
  const state = store.get(key);
  if (!state || !state.openUntil) return { allowed: true, halfOpen: false };
  if (state.openUntil > currentTime) return { allowed: false, halfOpen: false };
  if (state.halfOpen) return { allowed: false, halfOpen: false };
  state.halfOpen = true;
  store.set(key, state);
  return { allowed: true, halfOpen: true };
}

function recordFailure(store, key, currentTime, error, threshold, cooldownMs) {
  // Credential, permission and configuration errors are not transient availability
  // failures; they must not open a circuit or later cause an automatic failover.
  if (error?.retryable !== true && error?.code !== 'model_unavailable') {
    store.delete(key);
    return;
  }
  const previous = store.get(key) || { failures: 0, openUntil: 0, halfOpen: false };
  const failures = previous.failures + 1;
  // A failed half-open probe must reopen the circuit for a fresh cooldown.
  const shouldOpen = previous.halfOpen === true
    || error?.code === 'model_unavailable'
    || failures >= threshold;
  store.set(key, {
    failures,
    openUntil: shouldOpen ? currentTime + cooldownMs : 0,
    halfOpen: false
  });
}

function makeSafeProviderError(error) {
  if (error?.safeForClient === true && typeof error.code === 'string') return error;
  return routeError('provider_error', 'The configured AI provider request failed. No provider response body or credential was exposed.', 502);
}

const defaultSleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/**
 * Executes generation against the primary model with bounded transient retries.
 * A configured alternate OpenAI model is attempted only for retryable provider
 * failures, model-not-found responses or an open circuit. Moderation is outside
 * this helper and therefore remains fail-closed with no model failover.
 */
export async function runWithProviderFallback({
  routeConfig,
  operation,
  circuitStore = DEFAULT_CIRCUIT_STORE,
  now = () => Date.now(),
  sleep = defaultSleep,
  failureThreshold = FAILURE_THRESHOLD,
  cooldownMs = CIRCUIT_COOLDOWN_MS
} = {}) {
  if (!routeConfig || typeof operation !== 'function') {
    throw routeError('routing_unavailable', 'Provider routing is not configured for this request.', 503);
  }

  const attemptHistory = [];
  const usageEntries = [];

  async function executeModel(providerId, model, isFallback) {
    const key = getCircuitKey(providerId, model);
    const admissionTime = Number(now());
    const admission = acquireCircuit(circuitStore, key, admissionTime);
    if (!admission.allowed) {
      const error = routeError('circuit_open', 'The provider model is temporarily unavailable while its recovery window is open.', 503, {
        retryable: false,
        provider: providerId,
        model
      });
      attemptHistory.push({ providerId, model, outcome: 'circuit_open', retries: 0 });
      throw error;
    }

    let lastError;
    let retriesUsed = 0;
    for (let attempt = 0; attempt <= routeConfig.maxRetries; attempt += 1) {
      retriesUsed = attempt;
      try {
        const result = await operation({ providerId, model, isFallback, attempt });
        if (result?.usage && typeof result.usage === 'object') usageEntries.push(result.usage);
        circuitStore.delete(key);
        attemptHistory.push({ providerId, model, outcome: 'succeeded', retries: attempt });
        return result;
      } catch (caught) {
        const error = makeSafeProviderError(caught);
        if (error.usage && typeof error.usage === 'object') usageEntries.push(error.usage);
        lastError = error;
        if (error.retryable !== true || attempt >= routeConfig.maxRetries) break;
        await sleep(Math.min(150 * (2 ** attempt), 600));
      }
    }

    recordFailure(circuitStore, key, Number(now()), lastError, failureThreshold, cooldownMs);
    attemptHistory.push({
      providerId,
      model,
      outcome: 'failed',
      code: lastError?.code || 'provider_error',
      retries: retriesUsed
    });
    throw lastError || routeError('provider_error', 'The provider request failed.', 502);
  }

  let generation;
  let selectedProvider = routeConfig.primaryProvider;
  let selectedModel = routeConfig.primaryModel;
  let fallbackUsed = false;

  try {
    generation = await executeModel(routeConfig.primaryProvider, routeConfig.primaryModel, false);
  } catch (primaryError) {
    const safePrimaryError = makeSafeProviderError(primaryError);
    const mayFallback = routeConfig.fallbackProvider
      && routeConfig.fallbackModel
      && (safePrimaryError.retryable === true || FALLBACK_CODES.has(safePrimaryError.code));
    if (!mayFallback) {
      safePrimaryError.provider = safePrimaryError.provider || routeConfig.primaryProvider;
      safePrimaryError.model = safePrimaryError.model || routeConfig.primaryModel;
      safePrimaryError.usage = aggregateUsage(usageEntries);
      safePrimaryError.providerRouting = {
        selectedProvider: null,
        selectedModel: null,
        fallbackUsed: false,
        attempts: attemptHistory
      };
      throw safePrimaryError;
    }

    fallbackUsed = true;
    selectedProvider = routeConfig.fallbackProvider;
    selectedModel = routeConfig.fallbackModel;
    try {
      generation = await executeModel(selectedProvider, selectedModel, true);
    } catch (fallbackError) {
      const safeFallbackError = makeSafeProviderError(fallbackError);
      safeFallbackError.provider = safeFallbackError.provider || selectedProvider;
      safeFallbackError.model = safeFallbackError.model || selectedModel;
      safeFallbackError.usage = aggregateUsage(usageEntries);
      safeFallbackError.providerRouting = {
        selectedProvider: null,
        selectedModel: null,
        fallbackUsed: true,
        attempts: attemptHistory
      };
      throw safeFallbackError;
    }
  }

  return {
    result: generation,
    provider: selectedProvider,
    model: selectedModel,
    usage: aggregateUsage(usageEntries),
    providerRouting: {
      selectedProvider,
      selectedModel,
      fallbackUsed,
      attempts: attemptHistory
    }
  };
}

/** Test helper: return a fresh, isolated circuit store. */
export function createProviderCircuitStore() {
  return new Map();
}
