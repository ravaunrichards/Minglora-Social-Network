const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 15000;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;

const checkedAtIso = now => {
  try { return new Date(now()).toISOString(); }
  catch { return new Date().toISOString(); }
};

const result = (status, note, fields = {}) => ({
  providerId: 'openai',
  status,
  connected: false,
  healthStatus: 'unknown',
  healthProbeAvailable: true,
  inferenceAdapterAvailable: false,
  executionEnabled: false,
  checkedAt: fields.checkedAt || null,
  model: fields.model || null,
  httpStatus: fields.httpStatus || null,
  note
});

/**
 * Read-only OpenAI API/model connectivity probe.
 * This does not send prompts, generate content, mutate provider assignments,
 * store credentials, or enable AI workers.
 */
export async function probeOpenAIProvider({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  timeoutMs,
  modelIdentifier = null
} = {}) {
  const checkedAt = checkedAtIso(now);
  const selectedProvider = String(env.MINGLORA_AI_PROVIDER || '').trim().toLowerCase();
  if (selectedProvider && selectedProvider !== 'openai') {
    return result('provider_not_selected', 'OpenAI is not the selected provider in this server environment. No provider request was sent.', { checkedAt });
  }
  const apiKey = String(
    env.OPENAI_API_KEY ||
    (selectedProvider === 'openai' ? env.MINGLORA_AI_API_KEY : '') ||
    ''
  ).trim();
  const model = String(modelIdentifier != null ? modelIdentifier : (env.OPENAI_DEFAULT_MODEL || env.MINGLORA_AI_MODEL || '')).trim();

  if (!apiKey) {
    return result('missing_credentials', 'Add OPENAI_API_KEY to the private Minglora server environment. No provider request was sent.', { checkedAt, model });
  }
  if (!model || !MODEL_ID_PATTERN.test(model)) {
    return result('missing_model', 'Set OPENAI_DEFAULT_MODEL or the selected MINGLORA_AI_MODEL to a valid model identifier. No provider request was sent.', { checkedAt });
  }
  if (typeof fetchImpl !== 'function') {
    return result('adapter_unavailable', 'This server runtime does not provide an HTTP fetch implementation.', { checkedAt, model });
  }

  const baseUrl = String(env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).trim().replace(/\/+$/, '');
  let endpoint;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('invalid endpoint');
    }
    endpoint = parsed.toString().replace(/\/+$/, '') + '/models/' + encodeURIComponent(model);
  } catch {
    return result('invalid_endpoint', 'OPENAI_BASE_URL must be a valid HTTPS API base URL without embedded credentials, query parameters or fragments.', { checkedAt, model });
  }

  const configuredTimeout = Number(timeoutMs ?? env.MINGLORA_AI_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const requestTimeoutMs = Number.isFinite(configuredTimeout)
    ? Math.min(Math.max(Math.trunc(configuredTimeout), 1000), MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        Accept: 'application/json'
      },
      redirect: 'error',
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return result(
      timedOut ? 'timeout' : 'network_error',
      timedOut
        ? 'The OpenAI model-access probe timed out. Check the private server network and timeout configuration.'
        : 'The OpenAI model-access request could not be completed. Check server networking and the configured API endpoint.',
      { checkedAt, model }
    );
  }

  if (!response || typeof response.status !== 'number') {
    return result('invalid_response', 'The OpenAI endpoint returned an invalid HTTP response.', { checkedAt, model });
  }
  if (!response.ok) {
    const status = response.status === 401 ? 'unauthorized'
      : response.status === 403 ? 'forbidden'
        : response.status === 404 ? 'model_unavailable'
          : 'provider_error';
    const note = response.status === 401
      ? 'OpenAI rejected the configured credential. Check that the API key is valid and active.'
      : response.status === 403
        ? 'The configured OpenAI credential is not permitted to retrieve this model.'
        : response.status === 404
          ? 'The configured model was not found or is not available to this API project.'
          : 'OpenAI returned an unsuccessful model-access response. No response body or credential was exposed.';
    return result(status, note, { checkedAt, model, httpStatus: response.status });
  }

  let modelRecord;
  try {
    modelRecord = await response.json();
  } catch {
    return result('invalid_response', 'The OpenAI endpoint response was not valid JSON.', { checkedAt, model, httpStatus: response.status });
  }
  if (!modelRecord || modelRecord.object !== 'model' || modelRecord.id !== model) {
    return result('invalid_response', 'The OpenAI endpoint did not return the requested model record.', { checkedAt, model, httpStatus: response.status });
  }

  return {
    ...result('healthy', 'OpenAI authenticated successfully and the selected model is available. This read-only probe does not test text generation or enable AI execution.', {
      checkedAt, model, httpStatus: response.status
    }),
    connected: true,
    healthStatus: 'healthy',
    modelOwner: String(modelRecord.owned_by || '').slice(0, 80) || null
  };
}
