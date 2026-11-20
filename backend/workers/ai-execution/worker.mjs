import {
  executeOpenAITask,
  getTaskRetryDelaySeconds,
  isRetryableTaskProviderError
} from '../../modules/ai-network/openai-task-executor.js';

const DEFAULT_POLL_MS = 5000;
const DEFAULT_HEARTBEAT_MS = 20000;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
}

function sanitizeMessage(value, fallback = 'AI task execution failed.') {
  const message = String(value || fallback)
    .replace(/(?:Bearer\s+)[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/(?:sk-[A-Za-z0-9_-]{12,})/g, '[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
  return (message || fallback).slice(0, 900);
}

export async function callAIWorkerGateway(action, payload, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  signal
} = {}) {
  const token = String(env.MINGLORA_AI_WORKER_TOKEN || '').trim();
  const explicitUrl = String(env.MINGLORA_AI_WORKER_GATEWAY_URL || '').trim();
  const supabaseUrl = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const endpoint = explicitUrl || (supabaseUrl ? supabaseUrl + '/functions/v1/minglora-runtime-state' : '');
  if (token.length < 40) throw new Error('The private Minglora AI worker credential is not configured.');
  if (!endpoint) throw new Error('Set MINGLORA_AI_WORKER_GATEWAY_URL or SUPABASE_URL for the AI worker.');
  if (typeof fetchImpl !== 'function') throw new Error('The AI worker runtime does not provide HTTP fetch.');

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-minglora-worker-token': token,
        accept: 'application/json'
      },
      body: JSON.stringify({ action: 'ai_worker_command', aiAction: action, payload }),
      redirect: 'error',
      signal: signal || AbortSignal.timeout(15000)
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new Error(timedOut
      ? 'The Minglora worker gateway request timed out.'
      : 'The Minglora worker gateway could not be reached.');
  }
  let body;
  try { body = await response.json(); }
  catch { throw new Error('The Minglora worker gateway returned an invalid response.'); }
  if (!response.ok || body?.error) {
    const message = sanitizeMessage(body?.error, 'The Minglora worker gateway rejected the request.');
    const error = new Error(message);
    error.status = response.status;
    error.code = response.status === 401 || response.status === 403 ? 'worker_unauthorized'
      : response.status === 429 ? 'worker_rate_limited' : 'worker_gateway_error';
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  return body?.result ?? body;
}

function taskPromptEstimate(task) {
  const payload = task?.task_payload && typeof task.task_payload === 'object' ? task.task_payload : {};
  const prompt = payload.prompt ?? payload.instruction ?? payload.brief ?? payload.text ?? payload.body ?? '';
  return typeof prompt === 'string' ? prompt.length : JSON.stringify(payload).length;
}

/**
 * Executes at most one durable task. Queue leases and provider rate reservations
 * are database-backed, so separate worker instances cannot bypass the configured
 * global concurrency and per-model limits.
 */
export async function runAIExecutionWorkerOnce({
  env = process.env,
  gatewayCall = (action, payload) => callAIWorkerGateway(action, payload, { env }),
  executeTask = executeOpenAITask,
  logger = console,
  now = () => Date.now(),
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval
} = {}) {
  if (String(env.MINGLORA_AI_WORKER_ENABLED || '').toLowerCase() !== 'true') {
    return { started: false, reason: 'worker_disabled' };
  }
  if (String(env.MINGLORA_AI_WORKER_TOKEN || '').trim().length < 40) {
    return { started: false, reason: 'worker_credential_missing' };
  }

  const claimResponse = await gatewayCall('claim_next_task', {});
  if (claimResponse?.claimed !== true || !claimResponse.task) {
    return { started: true, claimed: false, reason: claimResponse?.reason || 'no_task' };
  }

  const task = claimResponse.task;
  const route = claimResponse.route;
  const identity = claimResponse.identity || {};
  const taskId = String(task.task_id || '');
  const leaseToken = String(task.lease_token || '');
  if (!taskId || !leaseToken || !route?.model_identifier) {
    throw new Error('The worker gateway returned an incomplete task lease or provider route.');
  }

  const providerName = String(route.provider_name || '').trim().toLowerCase().replace(/ api$/, '');
  if (providerName !== 'openai') {
    const error = new Error('No approved execution adapter exists for the selected provider.');
    await gatewayCall('fail_task', {
      task_id: taskId, lease_token: leaseToken, failure_code: 'provider_adapter_unavailable',
      failure_reason: error.message, retryable: false
    });
    return { started: true, claimed: true, succeeded: false, taskId, failure: 'provider_adapter_unavailable' };
  }

  const rpm = boundedInteger(env.MINGLORA_AI_MAX_REQUESTS_PER_MINUTE, 30, 1, 600);
  const tpm = boundedInteger(env.MINGLORA_AI_MAX_TOKENS_PER_MINUTE, 30000, 128, 1000000);
  const estimatedTokens = Math.min(
    Number(task.token_budget),
    Math.max(192, Math.min(50000, Math.ceil(taskPromptEstimate(task) / 4) + 1000))
  );
  if (estimatedTokens > tpm) {
    await gatewayCall('fail_task', {
      task_id: taskId, lease_token: leaseToken, failure_code: 'task_exceeds_provider_rate_budget',
      failure_reason: 'The task token allowance exceeds the worker provider-per-minute limit. Reduce the task budget or raise the server-side provider limit.',
      retryable: false,
      failure_metadata: { provider: providerName, model: route.model_identifier, estimated_tokens: estimatedTokens, provider_token_limit: tpm }
    });
    return { started: true, claimed: true, succeeded: false, taskId, failure: 'task_exceeds_provider_rate_budget' };
  }
  const reservation = await gatewayCall('reserve_provider_capacity', {
    provider_name: providerName,
    model_identifier: route.model_identifier,
    estimated_tokens: estimatedTokens,
    max_requests_per_minute: rpm,
    max_tokens_per_minute: tpm
  });
  if (reservation?.reserved !== true) {
    const retryAfter = boundedInteger(reservation?.retry_after_seconds, 30, 5, 3600);
    await gatewayCall('fail_task', {
      task_id: taskId, lease_token: leaseToken, failure_code: 'provider_rate_limited',
      failure_reason: 'The configured provider request/token budget is temporarily exhausted.',
      retryable: true, retry_after_seconds: retryAfter,
      failure_metadata: { provider: providerName, model: route.model_identifier }
    });
    return { started: true, claimed: true, succeeded: false, taskId, failure: 'provider_rate_limited' };
  }

  const startedAt = now();
  const controller = new AbortController();
  let leaseLost = false;
  let heartbeatBusy = false;
  const heartbeatMs = boundedInteger(env.MINGLORA_AI_HEARTBEAT_MS, DEFAULT_HEARTBEAT_MS, 5000, 60000);
  const heartbeatTimer = setIntervalImpl(async () => {
    if (heartbeatBusy || controller.signal.aborted) return;
    heartbeatBusy = true;
    try {
      const heartbeat = await gatewayCall('heartbeat_task', { task_id: taskId, lease_token: leaseToken });
      if (heartbeat?.renewed !== true) {
        leaseLost = true;
        controller.abort(new Error('AI task lease was lost or the task was cancelled.'));
      }
    } catch {
      // A temporary network failure is not evidence that a task was cancelled.
      // The database lease expiry remains the final recovery mechanism.
    } finally {
      heartbeatBusy = false;
    }
  }, heartbeatMs);
  heartbeatTimer?.unref?.();

  try {
    const taskResult = await executeTask({
      task, route, identity, env, signal: controller.signal
    });
    if (leaseLost || controller.signal.aborted) {
      return { started: true, claimed: true, succeeded: false, taskId, failure: 'lease_lost' };
    }
    if (!taskResult || taskResult.succeeded !== true || !String(taskResult.output || '').trim()) {
      throw Object.assign(new Error('The provider did not return a verified successful task result.'), {
        code: 'invalid_generation', retryable: true, safeForClient: true
      });
    }

    const durationMs = Math.max(0, now() - startedAt);
    const persisted = await gatewayCall('complete_task', {
      task_id: taskId,
      lease_token: leaseToken,
      task_result: { ...taskResult, duration_ms: durationMs }
    });
    if (persisted?.completed !== true) {
      return { started: true, claimed: true, succeeded: false, taskId, failure: persisted?.reason || 'completion_rejected' };
    }
    logger.info?.('[Minglora AI worker] Task completed.', {
      taskId, provider: taskResult.route?.provider, model: taskResult.route?.model,
      durationMs, totalTokens: taskResult.usage?.total_tokens ?? null
    });
    return { started: true, claimed: true, succeeded: true, taskId, durationMs };
  } catch (error) {
    if (leaseLost) {
      return { started: true, claimed: true, succeeded: false, taskId, failure: 'lease_lost' };
    }
    const failureCode = String(error?.code || 'execution_failed').slice(0, 80);
    const retryable = isRetryableTaskProviderError(error);
    const retryAfter = getTaskRetryDelaySeconds(error, task.attempt_count || 1);
    const failureReason = sanitizeMessage(
      error?.safeForClient === true ? error.message : 'AI task execution failed. No provider response or credential was exposed.'
    );
    const failed = await gatewayCall('fail_task', {
      task_id: taskId,
      lease_token: leaseToken,
      failure_code: failureCode,
      failure_reason: failureReason,
      retryable,
      retry_after_seconds: retryAfter,
      failure_metadata: {
        provider: providerName,
        model: String(route.model_identifier || ''),
        duration_ms: Math.max(0, now() - startedAt)
      }
    });
    logger.warn?.('[Minglora AI worker] Task execution failed.', {
      taskId, failureCode, retryable, status: failed?.status || null
    });
    return {
      started: true, claimed: true, succeeded: false, taskId,
      failure: failureCode, status: failed?.status || null
    };
  } finally {
    clearIntervalImpl(heartbeatTimer);
  }
}

export function startAIExecutionWorker({
  env = process.env,
  logger = console,
  gatewayCall,
  executeTask,
  pollMs
} = {}) {
  if (String(env.MINGLORA_AI_WORKER_ENABLED || '').toLowerCase() !== 'true') {
    return { started: false, stop() {} };
  }
  if (String(env.MINGLORA_AI_WORKER_TOKEN || '').trim().length < 40) {
    logger.warn?.('[Minglora AI worker] Worker was not started because its private credential is missing.');
    return { started: false, stop() {} };
  }

  const intervalMs = boundedInteger(pollMs ?? env.MINGLORA_AI_WORKER_POLL_MS, DEFAULT_POLL_MS, 1000, 30000);
  let stopped = false;
  let running = false;
  let timer = null;
  const deps = { env, logger, ...(gatewayCall ? { gatewayCall } : {}), ...(executeTask ? { executeTask } : {}) };

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await runAIExecutionWorkerOnce(deps);
    } catch (error) {
      logger.error?.('[Minglora AI worker] Gateway or orchestration cycle failed.', {
        message: sanitizeMessage(error?.message, 'AI worker cycle failed.')
      });
    } finally {
      running = false;
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
        timer?.unref?.();
      }
    }
  };

  void tick();
  logger.info?.('[Minglora AI worker] Worker loop started.', { pollMs: intervalMs });
  return {
    started: true,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    }
  };
}
