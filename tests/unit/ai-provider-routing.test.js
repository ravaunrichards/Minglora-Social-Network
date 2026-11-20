import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProviderCircuitStore,
  resolveProviderRoute,
  runWithProviderFallback
} from '../../backend/modules/ai-network/provider-routing.js';

const baseEnv = {
  MINGLORA_AI_MAX_RETRIES: '1',
  MINGLORA_AI_FALLBACK_PROVIDER: 'openai',
  MINGLORA_AI_FALLBACK_MODEL: 'backup-model'
};
const route = (env = baseEnv) => resolveProviderRoute({
  primaryProvider: 'openai',
  primaryModel: 'primary-model',
  env
});
const providerFailure = (code, retryable, usage) => Object.assign(
  new Error('safe provider failure'),
  { code, retryable, safeForClient: true, usage }
);

test('routing requires a supported adapter and a complete, distinct fallback configuration', () => {
  assert.throws(
    () => resolveProviderRoute({ primaryProvider: 'anthropic', primaryModel: 'claude-test', env: {} }),
    error => error.code === 'provider_adapter_unavailable'
  );
  assert.throws(
    () => resolveProviderRoute({ primaryProvider: 'openai', primaryModel: 'primary-model', env: { MINGLORA_AI_FALLBACK_PROVIDER: 'openai' } }),
    error => error.code === 'invalid_fallback_config'
  );
  assert.throws(
    () => resolveProviderRoute({ primaryProvider: 'openai', primaryModel: 'primary-model', env: { MINGLORA_AI_FALLBACK_PROVIDER: 'openrouter', MINGLORA_AI_FALLBACK_MODEL: 'backup' } }),
    error => error.code === 'fallback_adapter_unavailable'
  );
  assert.throws(
    () => resolveProviderRoute({ primaryProvider: 'openai', primaryModel: 'primary-model', env: { MINGLORA_AI_FALLBACK_PROVIDER: 'openai', MINGLORA_AI_FALLBACK_MODEL: 'primary-model' } }),
    error => error.code === 'invalid_fallback_config'
  );
  assert.equal(route().fallbackModel, 'backup-model');
  assert.equal(resolveProviderRoute({ primaryProvider: 'openai', primaryModel: 'primary-model', env: {} }).fallbackModel, null);
});

test('transient primary failures receive bounded retries and can recover without fallback', async () => {
  const calls = [];
  const result = await runWithProviderFallback({
    routeConfig: route(),
    circuitStore: createProviderCircuitStore(),
    sleep: async () => {},
    operation: async ({ model, attempt }) => {
      calls.push({ model, attempt });
      if (attempt === 0) throw providerFailure('timeout', true);
      return { text: 'primary recovered', usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
    }
  });
  assert.deepEqual(calls, [
    { model: 'primary-model', attempt: 0 },
    { model: 'primary-model', attempt: 1 }
  ]);
  assert.equal(result.result.text, 'primary recovered');
  assert.equal(result.model, 'primary-model');
  assert.equal(result.providerRouting.fallbackUsed, false);
  assert.equal(result.providerRouting.attempts[0].retries, 1);
});

test('model unavailable fails over to the configured alternate model and records both attempts', async () => {
  const calls = [];
  const result = await runWithProviderFallback({
    routeConfig: route(),
    circuitStore: createProviderCircuitStore(),
    operation: async ({ model }) => {
      calls.push(model);
      if (model === 'primary-model') throw providerFailure('model_unavailable', false, { input_tokens: 4, output_tokens: 0, total_tokens: 4 });
      return { text: 'fallback reply', usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 } };
    }
  });
  assert.deepEqual(calls, ['primary-model', 'backup-model']);
  assert.equal(result.result.text, 'fallback reply');
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'backup-model');
  assert.equal(result.providerRouting.fallbackUsed, true);
  assert.deepEqual(result.providerRouting.attempts.map(item => item.outcome), ['failed', 'succeeded']);
  assert.deepEqual(result.usage, { input_tokens: 16, output_tokens: 8, total_tokens: 24 });
});

test('authentication and permission failures never trigger model fallback', async () => {
  let calls = 0;
  await assert.rejects(runWithProviderFallback({
    routeConfig: route(),
    circuitStore: createProviderCircuitStore(),
    operation: async () => {
      calls += 1;
      throw providerFailure('unauthorized', false);
    }
  }), error => error.code === 'unauthorized' && error.providerRouting.fallbackUsed === false);
  assert.equal(calls, 1);
});

test('failed primary and fallback return safe, secret-free recovery metadata', async () => {
  await assert.rejects(runWithProviderFallback({
    routeConfig: route(),
    circuitStore: createProviderCircuitStore(),
    sleep: async () => {},
    operation: async ({ model }) => {
      throw providerFailure(model === 'primary-model' ? 'rate_limited' : 'provider_error', true, { input_tokens: 3, output_tokens: 0, total_tokens: 3 });
    }
  }), error => {
    assert.equal(error.code, 'provider_error');
    assert.equal(error.provider, 'openai');
    assert.equal(error.model, 'backup-model');
    assert.equal(error.providerRouting.fallbackUsed, true);
    assert.deepEqual(error.providerRouting.attempts.map(item => item.model), ['primary-model', 'backup-model']);
    assert.equal(error.usage.total_tokens, 6);
    assert.equal(JSON.stringify(error).includes('private-key'), false);
    return true;
  });
});

test('the circuit opens after exhausted failures and a configured fallback can carry the next request', async () => {
  const circuitStore = createProviderCircuitStore();
  const routeConfig = resolveProviderRoute({
    primaryProvider: 'openai',
    primaryModel: 'primary-model',
    env: { MINGLORA_AI_MAX_RETRIES: '0', ...baseEnv }
  });
  let callCount = 0;

  await assert.rejects(runWithProviderFallback({
    routeConfig: { ...routeConfig, fallbackProvider: null, fallbackModel: null },
    circuitStore,
    operation: async () => {
      callCount += 1;
      throw providerFailure('network_error', true);
    }
  }), error => error.code === 'network_error');

  // The configured failure threshold is three failed request cycles.
  await assert.rejects(runWithProviderFallback({
    routeConfig: { ...routeConfig, fallbackProvider: null, fallbackModel: null },
    circuitStore,
    operation: async () => {
      callCount += 1;
      throw providerFailure('network_error', true);
    }
  }), error => error.code === 'network_error');
  await assert.rejects(runWithProviderFallback({
    routeConfig: { ...routeConfig, fallbackProvider: null, fallbackModel: null },
    circuitStore,
    operation: async () => {
      callCount += 1;
      throw providerFailure('network_error', true);
    }
  }), error => error.code === 'network_error');

  await assert.doesNotReject(runWithProviderFallback({
    routeConfig,
    circuitStore,
    operation: async ({ model }) => {
      callCount += 1;
      assert.equal(model, 'backup-model', 'open circuit skips primary model and tries configured fallback');
      return { text: 'recovered' };
    }
  }));

  assert.equal(callCount, 4);
});

test('a successful half-open request closes the circuit for subsequent primary traffic', async () => {
  const circuitStore = createProviderCircuitStore();
  const config = { ...route(), maxRetries: 0, fallbackProvider: null, fallbackModel: null };
  let currentTime = 1000;

  for (let index = 0; index < 3; index += 1) {
    await assert.rejects(runWithProviderFallback({
      routeConfig: config,
      circuitStore,
      now: () => currentTime,
      operation: async () => { throw providerFailure('network_error', true); }
    }));
  }

  currentTime += 30001;
  const recovered = await runWithProviderFallback({
    routeConfig: config,
    circuitStore,
    now: () => currentTime,
    operation: async () => ({ text: 'half-open recovery' })
  });
  assert.equal(recovered.result.text, 'half-open recovery');
  assert.equal(circuitStore.has('openai:primary-model'), false);
});

test('fallback stays disabled when no alternate model is configured', async () => {
  let calls = 0;
  const noFallback = resolveProviderRoute({ primaryProvider: 'openai', primaryModel: 'primary-model', env: {} });
  await assert.rejects(runWithProviderFallback({
    routeConfig: noFallback,
    circuitStore: createProviderCircuitStore(),
    operation: async () => {
      calls += 1;
      throw providerFailure('timeout', true);
    }
  }), error => error.code === 'timeout' && error.providerRouting.fallbackUsed === false);
  assert.equal(calls, 3, 'default retry count is bounded to two retries');
});


test('repeated authentication failures do not open the availability circuit or invoke fallback', async () => {
  const circuitStore = createProviderCircuitStore();
  const routeConfig = route();
  let primaryCalls = 0;
  let fallbackCalls = 0;
  for (let index = 0; index < 4; index += 1) {
    await assert.rejects(runWithProviderFallback({
      routeConfig,
      circuitStore,
      operation: async ({ model }) => {
        if (model === 'backup-model') fallbackCalls += 1;
        else primaryCalls += 1;
        throw providerFailure('unauthorized', false);
      }
    }), error => error.code === 'unauthorized');
  }
  assert.equal(primaryCalls, 4);
  assert.equal(fallbackCalls, 0);
  assert.equal(circuitStore.has('openai:primary-model'), false);
});


test('a failed half-open recovery probe reopens the circuit for another cooldown', async () => {
  const circuitStore = createProviderCircuitStore();
  const config = { ...route(), maxRetries: 0, fallbackProvider: null, fallbackModel: null };
  let currentTime = 5000;

  for (let index = 0; index < 3; index += 1) {
    await assert.rejects(runWithProviderFallback({
      routeConfig: config,
      circuitStore,
      now: () => currentTime,
      operation: async () => { throw providerFailure('network_error', true); }
    }));
  }

  currentTime += 30001;
  await assert.rejects(runWithProviderFallback({
    routeConfig: config,
    circuitStore,
    now: () => currentTime,
    operation: async () => { throw providerFailure('network_error', true); }
  }));
  const reopened = circuitStore.get('openai:primary-model');
  assert.equal(reopened.halfOpen, false);
  assert.equal(reopened.openUntil, currentTime + 30000);

  currentTime += 1000;
  let calls = 0;
  await assert.rejects(runWithProviderFallback({
    routeConfig: config,
    circuitStore,
    now: () => currentTime,
    operation: async () => { calls += 1; throw providerFailure('network_error', true); }
  }), error => error.code === 'circuit_open');
  assert.equal(calls, 0, 'requests during the renewed cooldown must not reach the provider');
});


test('missing provider usage remains unknown instead of being converted to zero', async () => {
  await assert.rejects(runWithProviderFallback({
    routeConfig: { ...route(), maxRetries: 0, fallbackProvider: null, fallbackModel: null },
    circuitStore: createProviderCircuitStore(),
    operation: async () => {
      throw providerFailure('network_error', false, {
        input_tokens: null, output_tokens: null, total_tokens: null
      });
    }
  }), error => {
    assert.deepEqual(error.usage, {
      input_tokens: null, output_tokens: null, total_tokens: null
    });
    return true;
  });
});
