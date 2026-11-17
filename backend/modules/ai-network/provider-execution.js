import { probeOpenAIProvider } from './openai-provider-probe.js';
import { generateOpenAIBotReply } from './openai-bot-chat.js';

const MODEL_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;
const PROVIDER_ADAPTERS = Object.freeze({
  openai: Object.freeze({
    providerId: 'openai',
    credentialEnvironmentVariables: ['OPENAI_API_KEY'],
    probe: probeOpenAIProvider,
    generate: generateOpenAIBotReply
  })
});

const safeProviderName = value => String(value || '').trim().toLowerCase();
const safeModelIdentifier = value => String(value || '').trim();

function unavailable(providerName, modelIdentifier, status, note) {
  return {
    providerId: providerName || null,
    status,
    connected: false,
    healthStatus: 'unavailable',
    healthProbeAvailable: Boolean(PROVIDER_ADAPTERS[providerName]?.probe),
    inferenceAdapterAvailable: Boolean(PROVIDER_ADAPTERS[providerName]?.generate),
    executionEnabled: false,
    model: modelIdentifier || null,
    checkedAt: new Date().toISOString(),
    note
  };
}

/** Lists implemented server adapters, not every provider in the catalogue. */
export function listAIProviderExecutionAdapters() {
  return Object.keys(PROVIDER_ADAPTERS).sort();
}

/**
 * Probes the exact model selected by the owner's persisted provider assignment.
 * The model identifier comes from the database, never from a browser request.
 * This read-only probe does not activate an assignment.
 */
export async function probeAssignedProvider({
  providerName,
  modelIdentifier,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  timeoutMs
} = {}) {
  const provider = safeProviderName(providerName);
  const model = safeModelIdentifier(modelIdentifier);
  const adapter = PROVIDER_ADAPTERS[provider];
  if (!adapter) {
    return unavailable(provider, model, 'adapter_unavailable',
      'No executable provider adapter is installed for this provider. The assignment remains inactive.');
  }
  if (!MODEL_IDENTIFIER_PATTERN.test(model)) {
    return unavailable(provider, model, 'invalid_model',
      'The assigned model identifier is missing or invalid. No provider request was sent.');
  }
  const probe = await adapter.probe({ env, fetchImpl, now, timeoutMs, modelIdentifier: model });
  return {
    ...probe,
    providerId: provider,
    model,
    inferenceAdapterAvailable: true,
    executionEnabled: false
  };
}

/**
 * Executes a single human-initiated chat against a previously resolved,
 * owner-scoped and recently verified assignment. No browser provider/model
 * overrides are accepted; only installed adapters can execute.
 */
export async function generateAIProviderReply({
  assignment,
  bot,
  identity,
  message,
  history = [],
  memoryContext = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs,
  maxOutputTokens
} = {}) {
  const provider = safeProviderName(assignment?.provider_name);
  const model = safeModelIdentifier(assignment?.model_identifier);
  const adapter = PROVIDER_ADAPTERS[provider];
  if (!adapter?.generate) {
    const error = Object.assign(new Error('No executable adapter is installed for the assigned provider.'), {
      code: 'provider_adapter_unavailable', status: 503, safeForClient: true
    });
    throw error;
  }
  if (!MODEL_IDENTIFIER_PATTERN.test(model)) {
    const error = Object.assign(new Error('The persisted provider assignment has an invalid model identifier.'), {
      code: 'invalid_assigned_model', status: 409, safeForClient: true
    });
    throw error;
  }
  if (assignment?.assignment_status !== 'active' ||
      assignment?.provider_health_status !== 'healthy' ||
      assignment?.provider_account_status !== 'configured' ||
      assignment?.provider_account_health_status !== 'healthy' ||
      assignment?.text_capability !== true ||
      !Array.isArray(assignment?.assigned_capabilities) ||
      !assignment.assigned_capabilities.includes('text')) {
    const error = Object.assign(new Error('The AI identity does not have a healthy, active text-model assignment.'), {
      code: 'provider_assignment_inactive', status: 409, safeForClient: true
    });
    throw error;
  }
  return adapter.generate({
    bot, identity, message, history, memoryContext, env, fetchImpl, timeoutMs,
    maxOutputTokens, modelIdentifier: model
  });
}
