const SAFE_TEXT_TASK_TYPES = new Set([
  'assistant_request',
  'moderation_review',
  'analytics_report',
  'translation'
]);

const MAX_OUTPUT_CHARACTERS = 20000;

function taskLease(task, workerId) {
  if (!task || typeof task !== 'object') return null;
  const taskId = String(task.id || '');
  const leaseToken = String(task.leaseToken || '');
  if (!taskId || !leaseToken || String(task.workerId || '') !== workerId) return null;
  return { taskId, leaseToken };
}

function normalizeProviderOutput(output, providerAdapter) {
  const content = typeof output === 'string'
    ? output
    : String(output?.text ?? output?.content ?? '');
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > MAX_OUTPUT_CHARACTERS) {
    throw Object.assign(new Error('The provider returned empty or oversized draft content.'), {
      code: 'AI_PROVIDER_OUTPUT_INVALID',
      retryable: false
    });
  }
  return {
    content: trimmed,
    provider: String(output?.provider || providerAdapter.provider || 'configured-provider').slice(0,80),
    model: String(output?.model || providerAdapter.model || 'configured-model').slice(0,160)
  };
}

/**
 * Creates one leased worker for non-side-effecting text tasks.
 *
 * All I/O is injected so the worker can be tested without a live provider.
 * The provider receives no tools and is explicitly instructed to return a
 * draft only. Publishing, following, messaging, reactions and other social
 * actions are never part of this worker's executable task allowlist.
 */
export function createPersonalAiBotWorker({
  workerId,
  claimTasks,
  heartbeatTask,
  completeTask,
  failTask,
  providerAdapter,
  resolveProviderAdapter,
  leaseSeconds = 180,
  logger = console
}) {
  const id = String(workerId || '').trim();
  if (!/^[A-Za-z0-9._:-]{3,80}$/.test(id)) throw new TypeError('A valid worker ID is required.');
  for (const [name, fn] of Object.entries({ claimTasks, heartbeatTask, completeTask, failTask })) {
    if (typeof fn !== 'function') throw new TypeError(name + ' must be a function.');
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 300) {
    throw new RangeError('Worker lease duration must be between 30 and 300 seconds.');
  }

  let stopped = false;
  let running = false;

  async function runOnce() {
    if (stopped) return { status: 'stopped', claimed: 0 };
    if ((!providerAdapter || typeof providerAdapter.generate !== 'function') &&
        typeof resolveProviderAdapter !== 'function') {
      return { status: 'disabled', reason: 'provider_adapter_not_configured', claimed: 0 };
    }
    if (running) return { status: 'busy', claimed: 0 };

    running = true;
    let leasedTask = null;
    try {
      const claimResult = await claimTasks({ workerId: id, limit: 1, leaseSeconds });
      const tasks = Array.isArray(claimResult) ? claimResult : claimResult?.tasks;
      const task = Array.isArray(tasks) ? tasks[0] : null;
      if (!task) return { status: 'idle', claimed: 0 };

      leasedTask = taskLease(task, id);
      if (!leasedTask) return { status: 'lease_invalid', claimed: 1 };

      const permitted = SAFE_TEXT_TASK_TYPES.has(String(task.taskType || '')) &&
        task.highImpact === false &&
        Boolean(task.approvedBy) &&
        Boolean(task.approvedAt);
      if (!permitted) {
        await failTask({
          ...leasedTask,
          workerId: id,
          retryable: false,
          errorCode: 'TASK_POLICY_BLOCKED',
          errorMessage: 'The task is not an approved, low-impact text-generation task.'
        });
        return { status: 'policy_blocked', claimed: 1 };
      }

      const adapter = typeof resolveProviderAdapter === 'function'
        ? await resolveProviderAdapter(task)
        : providerAdapter;
      if (!adapter || typeof adapter.generate !== 'function' ||
          !task.providerAssignmentId ||
          String(adapter.providerIdentifier || '') !== String(task.providerIdentifier || '') ||
          String(adapter.modelIdentifier || '') !== String(task.modelIdentifier || '')) {
        throw Object.assign(new Error('No verified provider adapter matches the claimed AI identity model assignment.'), {
          code: 'AI_PROVIDER_ASSIGNMENT_UNAVAILABLE',
          retryable: false
        });
      }

      const heartbeatOk = await heartbeatTask({
        ...leasedTask,
        workerId: id,
        leaseSeconds
      });
      if (heartbeatOk !== true) return { status: 'lease_lost', claimed: 1 };

      const generated = await adapter.generate({
        task: {
          id: String(task.id),
          botId: String(task.botId || ''),
          type: String(task.taskType),
          instruction: String(task.instruction || ''),
          approvedAt: String(task.approvedAt)
        },
        responseMode: 'draft',
        tools: [],
        toolAccess: 'disabled',
        externalActionsAllowed: false
      }, {
        signal: AbortSignal.timeout(90000)
      });
      const result = normalizeProviderOutput(generated, adapter);
      const completed = await completeTask({
        ...leasedTask,
        workerId: id,
        result: {
          content: result.content,
          provider: result.provider,
          model: result.model,
          outputType: 'human_review_draft'
        }
      });
      if (completed !== true) return { status: 'lease_lost', claimed: 1 };
      return { status: 'completed', claimed: 1, taskId: leasedTask.taskId };
    } catch (error) {
      if (leasedTask) {
        try {
          await failTask({
            ...leasedTask,
            workerId: id,
            retryable: error?.retryable !== false,
            errorCode: String(error?.code || 'AI_PROVIDER_EXECUTION_FAILED').slice(0,80),
            errorMessage: String(error?.message || 'The provider could not complete the draft.').slice(0,500)
          });
        } catch (failureError) {
          logger.error?.('[Minglora AI Bot Worker] Could not record task failure.', {
            message: String(failureError?.message || failureError).slice(0,180)
          });
        }
      }
      return {
        status: 'failed',
        claimed: leasedTask ? 1 : 0,
        errorCode: String(error?.code || 'AI_PROVIDER_EXECUTION_FAILED').slice(0,80)
      };
    } finally {
      running = false;
    }
  }

  return {
    workerId: id,
    runOnce,
    stop() { stopped = true; },
    isStopped() { return stopped; }
  };
}

export const PERSONAL_AI_BOT_WORKER_TASK_TYPES = Object.freeze([...SAFE_TEXT_TASK_TYPES]);
