import { generateAITaskOutput } from './task-provider.js';

const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000;
const MAX_WORKER_CONCURRENCY = 8;

const safeError = error => ({
  code: String(error?.code || 'task_execution_failed').slice(0, 100),
  message: String(error?.safeForClient === true ? error.message : 'The AI task execution failed. No unverified output was saved.').slice(0, 900),
  retryable: error?.retryable === true,
  retryAfterSeconds: Number.isFinite(Number(error?.retryAfterSeconds))
    ? Math.max(5, Math.min(3600, Math.ceil(Number(error.retryAfterSeconds))))
    : 10
});

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Process one authenticated lease. A task is successful only after the database
 * confirms complete_task; all provider/lease errors are recorded through fail_task.
 */
export async function processClaimedAITask(claim, {
  callWorker,
  executeTask = generateAITaskOutput,
  heartbeatMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  logger = console,
  parentSignal
} = {}) {
  if (!claim?.claimed || !claim.task?.task_id || !claim.lease_token || !claim.route?.route_id) {
    throw new TypeError('A complete claimed task lease and route are required.');
  }
  if (typeof callWorker !== 'function' || typeof executeTask !== 'function') {
    throw new TypeError('Worker command and task executor functions are required.');
  }

  const taskId = String(claim.task.task_id);
  const leaseToken = String(claim.lease_token);
  const controller = new AbortController();
  let heartbeatTimer = null;
  let heartbeatPending = false;
  let leaseError = null;

  const abortFromParent = () => controller.abort(Object.assign(new Error('Worker is shutting down; task will be retried when allowed.'), {
    code: 'worker_shutdown',
    safeForClient: true,
    retryable: true
  }));
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  if (Number(heartbeatMs) > 0) {
    heartbeatTimer = setInterval(async () => {
      if (heartbeatPending || controller.signal.aborted) return;
      heartbeatPending = true;
      try {
        const result = await callWorker('heartbeat_task', { task_id: taskId, lease_token: leaseToken });
        if (result?.renewed !== true) throw new Error('The task lease heartbeat was not confirmed.');
      } catch {
        leaseError = Object.assign(new Error('Task lease was lost; provider work was aborted.'), {
          code: 'lease_lost',
          retryable: false
        });
        controller.abort(leaseError);
      } finally {
        heartbeatPending = false;
      }
    }, Math.max(1000, Number(heartbeatMs) || DEFAULT_HEARTBEAT_INTERVAL_MS));
    heartbeatTimer.unref?.();
  }

  try {
    if (controller.signal.aborted) throw leaseError || controller.signal.reason;
    const generated = await executeTask({
      task: claim.task,
      route: claim.route,
      signal: controller.signal,
      identityContext: claim.identity_context || {}
    });
    if (controller.signal.aborted) throw leaseError || controller.signal.reason || new Error('Task execution was cancelled.');
    if (!generated || typeof generated.output !== 'string' || !generated.output.trim()) {
      throw Object.assign(new Error('The provider returned no usable output.'), {
        code: 'empty_provider_result',
        safeForClient: true,
        retryable: true
      });
    }
    if (generated.provider !== claim.route.provider || generated.model !== claim.route.model) {
      throw Object.assign(new Error('The provider result did not match the reserved execution route.'), {
        code: 'execution_route_mismatch',
        safeForClient: true,
        retryable: false
      });
    }
    if (generated.moderation?.input_flagged !== false || generated.moderation?.output_flagged !== false) {
      throw Object.assign(new Error('Both input and output moderation must pass before task completion.'), {
        code: 'moderation_not_confirmed',
        safeForClient: true,
        retryable: false
      });
    }

    const taskResult = {
      output: generated.output.slice(0, 12000),
      provider: String(generated.provider).slice(0, 80),
      model: String(generated.model).slice(0, 180),
      moderation: generated.moderation,
      provider_routing: generated.provider_routing || {},
      external_action_taken: generated.external_action_taken === true
    };
    if (taskResult.external_action_taken) {
      throw Object.assign(new Error('Text workers are not permitted to take external actions.'), {
        code: 'external_action_blocked',
        safeForClient: true,
        retryable: false
      });
    }

    const completed = await callWorker('complete_task', {
      task_id: taskId,
      lease_token: leaseToken,
      task_result: taskResult,
      usage: generated.usage || {},
      provider_request_id: generated.provider_request_id || ''
    });
    if (completed?.completed !== true || completed?.status !== 'succeeded') {
      throw Object.assign(new Error('The database did not confirm successful task completion.'), {
        code: 'completion_not_confirmed',
        safeForClient: true,
        retryable: true
      });
    }
    return { status: 'succeeded', taskId, routeId: claim.route.route_id };
  } catch (caught) {
    const error = leaseError || caught || new Error('Task execution failed.');
    const failure = safeError(error);
    try {
      const recorded = await callWorker('fail_task', {
        task_id: taskId,
        lease_token: leaseToken,
        error_code: failure.code,
        failure_reason: failure.message,
        retryable: failure.retryable,
        retry_after_seconds: failure.retryAfterSeconds
      });
      return {
        status: recorded?.status === 'queued' ? 'retry_scheduled' : 'failed',
        taskId,
        errorCode: failure.code
      };
    } catch (recordError) {
      logger.error?.('[Minglora AI worker] Failure could not be recorded; the database lease will expire and recover.', {
        taskId,
        errorCode: failure.code,
        message: String(recordError?.message || 'worker gateway unavailable').slice(0, 180)
      });
      return { status: 'lease_lost', taskId, errorCode: failure.code };
    }
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

/**
 * Start the optional in-process worker. It is opt-in and still obeys database
 * global pause, per-owner, per-worker and per-provider limits.
 */
export function startAITaskWorker({
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  executeTask = generateOpenAITaskOutput
} = {}) {
  if (String(env.MINGLORA_AI_WORKER_ENABLED || '').trim().toLowerCase() !== 'true') {
    return { enabled: false, stop: async () => {} };
  }

  const token = String(env.MINGLORA_AI_WORKER_TOKEN || '').trim();
  const supabaseUrl = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token) || !/^https:\/\//i.test(supabaseUrl) || !publishableKey || typeof fetchImpl !== 'function') {
    logger.error?.('[Minglora AI worker] Worker was not started: configure SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and a registered MINGLORA_AI_WORKER_TOKEN.');
    return { enabled: false, reason: 'worker_configuration_missing', stop: async () => {} };
  }

  const gatewayUrl = supabaseUrl + '/functions/v1/minglora-ai-worker';
  const pollInterval = Math.max(500, Math.min(15000, Number(env.MINGLORA_AI_WORKER_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS));
  const heartbeatInterval = Math.max(5000, Math.min(60000, Number(env.MINGLORA_AI_WORKER_HEARTBEAT_INTERVAL_MS) || DEFAULT_HEARTBEAT_INTERVAL_MS));
  const concurrency = Math.max(1, Math.min(MAX_WORKER_CONCURRENCY, Math.floor(Number(env.MINGLORA_AI_WORKER_CONCURRENCY) || 1)));
  const abortController = new AbortController();
  let stopped = false;
  let lastWarningAt = 0;

  const callWorker = async (action, payload = {}) => {
    const response = await fetchImpl(gatewayUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        apikey: publishableKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ action, payload }),
      redirect: 'error',
      signal: AbortSignal.timeout(15000)
    });
    let body;
    try { body = await response.json(); }
    catch { throw new Error('AI worker gateway returned an invalid response.'); }
    if (!response.ok) {
      throw Object.assign(new Error(String(body?.error || 'AI worker gateway request failed.').slice(0, 200)), {
        status: response.status,
        retryable: response.status === 408 || response.status === 429 || response.status >= 500
      });
    }
    return body?.result;
  };

  async function loop(workerIndex) {
    while (!stopped && !abortController.signal.aborted) {
      try {
        const claim = await callWorker('claim_next_task', {});
        if (!claim?.claimed) {
          await pause(pollInterval);
          continue;
        }
        const outcome = await processClaimedAITask(claim, {
          callWorker,
          executeTask,
          heartbeatMs: heartbeatInterval,
          logger,
          parentSignal: abortController.signal
        });
        if (outcome.status !== 'succeeded' && outcome.status !== 'retry_scheduled') {
          logger.warn?.('[Minglora AI worker] Task ended without success.', {
            taskId: outcome.taskId,
            status: outcome.status,
            errorCode: outcome.errorCode
          });
        }
      } catch (error) {
        const now = Date.now();
        if (now - lastWarningAt > 60000) {
          lastWarningAt = now;
          logger.warn?.('[Minglora AI worker] Polling paused after a gateway error.', {
            workerIndex,
            message: String(error?.message || 'worker gateway unavailable').slice(0, 180)
          });
        }
        await pause(Math.max(pollInterval, 5000));
      }
    }
  }

  const loops = Array.from({ length: concurrency }, (_, index) => loop(index + 1));
  logger.info?.('[Minglora AI worker] Started with bounded local concurrency.', { concurrency, pollInterval });

  return {
    enabled: true,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      abortController.abort(new Error('Worker shutdown requested.'));
      await Promise.allSettled(loops);
    }
  };
}
