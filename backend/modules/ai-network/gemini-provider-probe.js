const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 15000;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;

const checkedAtIso = now => {
  try { return new Date(now()).toISOString(); }
  catch { return new Date().toISOString(); }
};

const result = (status, note, fields = {}) => ({
  providerId: 'google_gemini',
  status,
  connected: false,
  healthStatus: 'unknown',
  healthProbeAvailable: true,
  inferenceAdapterAvailable: true,
  executionEnabled: false,
  checkedAt: fields.checkedAt || null,
  model: fields.model || null,
  httpStatus: fields.httpStatus || null,
  note
});

/**
 * Read-only Google Gemini Developer API model-access check.
 * The API key is sent only in x-goog-api-key and is never placed in the URL,
 * stored in the database, or returned to the browser.
 */
export async function probeGeminiProvider({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  timeoutMs
} = {}) {
  const checkedAt = checkedAtIso(now);
  const selectedProvider = String(env.MINGLORA_AI_PROVIDER || '').trim().toLowerCase();
  const apiKey = String(env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY || '').trim();
  const model = String(env.GEMINI_DEFAULT_MODEL ||
    (selectedProvider === 'google_gemini' ? env.MINGLORA_AI_MODEL : '') || '').trim();

  if (!apiKey) {
    return result('missing_credentials', 'Add GEMINI_API_KEY (or GOOGLE_AI_API_KEY) to the private Minglora server environment. No provider request was sent.', { checkedAt, model });
  }
  if (!model || !MODEL_ID_PATTERN.test(model)) {
    return result('missing_model', 'Set GEMINI_DEFAULT_MODEL to a valid Gemini model identifier. No provider request was sent.', { checkedAt });
  }
  if (typeof fetchImpl !== 'function') {
    return result('adapter_unavailable', 'This server runtime does not provide an HTTP fetch implementation.', { checkedAt, model });
  }

  const baseUrl = String(env.GEMINI_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  let endpoint;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('invalid endpoint');
    }
    endpoint = parsed.toString().replace(/\/+$/, '') + '/models/' + encodeURIComponent(model);
  } catch {
    return result('invalid_endpoint', 'GEMINI_BASE_URL must be a valid HTTPS API base URL without embedded credentials, query parameters or fragments.', { checkedAt, model });
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
        'x-goog-api-key': apiKey,
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
        ? 'The Gemini model-access probe timed out. Check private server networking and timeout configuration.'
        : 'The Gemini model-access request could not be completed. Check server networking and the configured API endpoint.',
      { checkedAt, model }
    );
  }

  if (!response || typeof response.status !== 'number') {
    return result('invalid_response', 'The Gemini endpoint returned an invalid HTTP response.', { checkedAt, model });
  }
  if (!response.ok) {
    const status = response.status === 401 ? 'unauthorized'
      : response.status === 403 ? 'forbidden'
        : response.status === 404 ? 'model_unavailable'
          : response.status === 429 ? 'rate_limited'
            : 'provider_error';
    const note = response.status === 401
      ? 'Gemini rejected the configured API credential.'
      : response.status === 403
        ? 'The configured Google AI project is not permitted to access this model.'
        : response.status === 404
          ? 'The configured Gemini model was not found or is unavailable to this API key.'
          : response.status === 429
            ? 'Gemini rate-limited the model-access check. Try again after the provider limit resets.'
            : 'Gemini returned an unsuccessful model-access response. No response body or credential was exposed.';
    return result(status, note, { checkedAt, model, httpStatus: response.status });
  }

  let modelRecord;
  try { modelRecord = await response.json(); }
  catch {
    return result('invalid_response', 'The Gemini model endpoint response was not valid JSON.', { checkedAt, model, httpStatus: response.status });
  }
  const expectedName = 'models/' + model;
  if (!modelRecord || modelRecord.name !== expectedName ||
      !Array.isArray(modelRecord.supportedGenerationMethods) ||
      !modelRecord.supportedGenerationMethods.includes('generateContent')) {
    return result('unsupported_model', 'The selected Gemini model did not confirm support for generateContent. Choose a text-generation model available to this API key.', { checkedAt, model, httpStatus: response.status });
  }

  return {
    ...result('healthy', 'Google Gemini authenticated successfully and the selected model supports generateContent. This read-only probe does not generate a reply or enable AI workers.', {
      checkedAt, model, httpStatus: response.status
    }),
    connected: true,
    healthStatus: 'healthy',
    supportedGenerationMethods: ['generateContent']
  };
}
