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
  heartbeatIntervalMs = Math.max(5000, Math.floor(leaseSeconds * 1000 / 3)),
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
  if (!Number.isInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1000 ||
      heartbeatIntervalMs >= leaseSeconds * 1000 / 2) {
    throw new RangeError('Worker heartbeat interval must be at least one second and less than half the lease duration.');
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
    let heartbeatTimer = null;
    let heartbeatInFlight = null;
    let heartbeatError = null;
    let leaseLost = false;
    const leaseAbortController = new AbortController();

    const stopLeaseHeartbeat = async () => {
      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (heartbeatInFlight) await heartbeatInFlight;
    };

    const renewLease = () => {
      if (heartbeatError) return Promise.resolve(false);
      if (heartbeatInFlight) return heartbeatInFlight;
      heartbeatInFlight = (async () => {
        try {
          const renewed = await heartbeatTask({
            ...leasedTask,
            workerId: id,
            leaseSeconds
          });
          if (renewed !== true) {
            leaseLost = true;
            throw Object.assign(new Error('The task lease was lost while the provider was generating.'), {
              code: 'AI_TASK_LEASE_LOST',
              retryable: false
            });
          }
          return true;
        } catch (error) {
          heartbeatError = error;
          if (!leaseAbortController.signal.aborted) leaseAbortController.abort(error);
          return false;
        } finally {
          heartbeatInFlight = null;
        }
      })();
      return heartbeatInFlight;
    };

    const recordTaskFailure = async payload => {
      try {
        const result = await failTask(payload);
        if (result === false || result?.ok === false) return { recorded: false, leaseLost: true };
        return { recorded: true };
      } catch (error) {
        return { recorded: false, error };
      }
    };

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
        const failure = await recordTaskFailure({
          ...leasedTask,
          workerId: id,
          retryable: false,
          errorCode: 'TASK_POLICY_BLOCKED',
          errorMessage: 'The task is not an approved, low-impact text-generation task.'
        });
        if (!failure.recorded) {
          return {
            status: failure.leaseLost ? 'lease_lost' : 'failure_unrecorded',
            claimed: 1,
            errorCode: failure.leaseLost ? 'AI_TASK_LEASE_LOST' : 'AI_TASK_FAILURE_NOT_RECORDED'
          };
        }
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

      const heartbeatOk = await renewLease();
      if (heartbeatOk !== true) {
        return { status: 'lease_lost', claimed: 1, errorCode: 'AI_TASK_LEASE_LOST' };
      }

      // Keep the lease alive throughout provider execution. The configured
      // lease may be as short as 30 seconds while generation can run for 90.
      // A failed renewal aborts the provider request before another worker can
      // safely reclaim the task.
      heartbeatTimer = setInterval(() => {
        void renewLease();
      }, heartbeatIntervalMs);

      let generated;
      try {
        generated = await adapter.generate({
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
          signal: AbortSignal.any([
            leaseAbortController.signal,
            AbortSignal.timeout(90000)
          ])
        });
      } finally {
        await stopLeaseHeartbeat();
      }

      if (leaseLost) return { status: 'lease_lost', claimed: 1, errorCode: 'AI_TASK_LEASE_LOST' };
      if (heartbeatError) throw heartbeatError;

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
      await stopLeaseHeartbeat();
      if (leaseLost) {
        return { status: 'lease_lost', claimed: 1, errorCode: 'AI_TASK_LEASE_LOST' };
      }

      let failureRecorded = true;
      if (leasedTask) {
        const failure = await recordTaskFailure({
          ...leasedTask,
          workerId: id,
          retryable: error?.retryable !== false,
          errorCode: String(error?.code || 'AI_PROVIDER_EXECUTION_FAILED').slice(0,80),
          errorMessage: String(error?.message || 'The provider could not complete the draft.').slice(0,500)
        });
        failureRecorded = failure.recorded;
        if (!failureRecorded && failure.error) {
          logger.error?.('[Minglora AI Bot Worker] Could not record task failure.', {
            message: String(failure.error?.message || failure.error).slice(0,180)
          });
        }
      }
      if (!failureRecorded) {
        return {
          status: 'failure_unrecorded',
          claimed: leasedTask ? 1 : 0,
          errorCode: 'AI_TASK_FAILURE_NOT_RECORDED'
        };
      }
      return {
        status: 'failed',
        claimed: leasedTask ? 1 : 0,
        errorCode: String(error?.code || 'AI_PROVIDER_EXECUTION_FAILED').slice(0,80)
      };
    } finally {
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
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
