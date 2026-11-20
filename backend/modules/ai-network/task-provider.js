import { generateOpenAITaskOutput } from './openai-task-provider.js';
import { generateGeminiTaskOutput } from './google-gemini-task-provider.js';

const ADAPTERS = Object.freeze({
  openai: generateOpenAITaskOutput,
  google_gemini: generateGeminiTaskOutput
});

/**
 * Dispatch only to a tested, provider-specific task adapter. A database route
 * without an approved adapter fails closed; it is never silently remapped.
 */
export async function generateAITaskOutput(options = {}) {
  const provider = String(options?.route?.provider || '').trim().toLowerCase();
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    throw Object.assign(new Error('The selected provider has no approved Minglora task execution adapter.'), {
      code: 'provider_adapter_unavailable',
      status: 503,
      safeForClient: true,
      retryable: false
    });
  }
  return adapter(options);
}
