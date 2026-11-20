const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 15000;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;

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
 * Read-only Gemini model-access probe. It sends no prompt and does not enable workers.
 */
export async function probeGeminiProvider({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  timeoutMs
} = {}) {
  const checkedAt = (() => {
    try { return new Date(now()).toISOString(); }
    catch { return new Date().toISOString(); }
  })();
  const apiKey = String(env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY || '').trim();
  const model = String(env.GEMINI_DEFAULT_MODEL || env.MINGLORA_AI_MODEL || '').trim();

  if (!apiKey) return result('missing_credentials', 'Add GEMINI_API_KEY to the private Minglora server environment. No provider request was sent.', { checkedAt, model });
  if (!model || !MODEL_ID_PATTERN.test(model)) return result('missing_model', 'Set GEMINI_DEFAULT_MODEL or MINGLORA_AI_MODEL to a valid Gemini model identifier. No provider request was sent.', { checkedAt });
  if (typeof fetchImpl !== 'function') return result('adapter_unavailable', 'This server runtime does not provide HTTP fetch.', { checkedAt, model });

  let endpoint;
  try {
    const base = new URL(String(env.GEMINI_BASE_URL || DEFAULT_BASE_URL).trim());
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('invalid endpoint');
    endpoint = base.toString().replace(/\/+$/, '') + '/models/' + encodeURIComponent(model);
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
      headers: { 'x-goog-api-key': apiKey, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return result(timedOut ? 'timeout' : 'network_error',
      timedOut ? 'The Gemini model-access probe timed out.' : 'The Gemini model-access request could not be completed. Check server networking and the configured API endpoint.',
      { checkedAt, model });
  }

  if (!response || typeof response.status !== 'number') return result('invalid_response', 'Gemini returned an invalid HTTP response.', { checkedAt, model });
  if (!response.ok) {
    const status = response.status === 401 ? 'unauthorized'
      : response.status === 403 ? 'forbidden'
        : response.status === 404 ? 'model_unavailable'
          : response.status === 429 ? 'rate_limited'
            : 'provider_error';
    const note = response.status === 401
      ? 'Gemini rejected the configured credential.'
      : response.status === 403
        ? 'The configured Gemini credential is not permitted to access this model.'
        : response.status === 404
          ? 'The selected Gemini model was not found or is not available to this API project.'
          : 'Gemini returned an unsuccessful model-access response. No response body or credential was exposed.';
    return result(status, note, { checkedAt, model, httpStatus: response.status });
  }

  let record;
  try { record = await response.json(); }
  catch { return result('invalid_response', 'The Gemini model response was not valid JSON.', { checkedAt, model, httpStatus: response.status }); }
  const expectedName = 'models/' + model;
  if (!record || record.name !== expectedName ||
      !Array.isArray(record.supportedGenerationMethods) ||
      !record.supportedGenerationMethods.includes('generateContent')) {
    return result('model_unavailable', 'Gemini did not confirm generateContent support for the selected model.', { checkedAt, model, httpStatus: response.status });
  }

  return {
    ...result('healthy', 'Gemini authenticated successfully and the selected model reports generateContent support. This read-only probe does not send a prompt or enable AI execution.', { checkedAt, model, httpStatus: response.status }),
    connected: true,
    healthStatus: 'healthy',
    modelDisplayName: String(record.displayName || '').slice(0, 120) || null
  };
}
