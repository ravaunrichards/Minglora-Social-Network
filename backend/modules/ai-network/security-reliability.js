import { createHash } from 'node:crypto';

const DEFAULT_POLICIES = Object.freeze({
  authenticated: Object.freeze({ limit: 90, windowMs: 60_000 }),
  anonymous: Object.freeze({ limit: 24, windowMs: 60_000 }),
  authenticatedBurst: Object.freeze({ limit: 20, windowMs: 10_000 }),
  anonymousBurst: Object.freeze({ limit: 8, windowMs: 10_000 }),
  chat: Object.freeze({ limit: 6, windowMs: 60_000 }),
  write: Object.freeze({ limit: 30, windowMs: 60_000 }),
  providerProbe: Object.freeze({ limit: 4, windowMs: 5 * 60_000 }),
  webhook: Object.freeze({ limit: 120, windowMs: 60_000 })
});

const ROUTE_GROUPS = new Set(['read', 'write', 'chat', 'provider', 'webhook', 'other']);
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}

export function classifyAIRequestRoute(pathname, method = 'GET') {
  const path = String(pathname || '');
  const verb = String(method || 'GET').toUpperCase();
  if (path.endsWith('/email/webhook')) return 'webhook';
  if (path.endsWith('/provider-health')) return 'provider';
  if (verb === 'POST' && /\/bots\/[^/]+\/chat$/.test(path)) return 'chat';
  if (!READ_METHODS.has(verb)) return 'write';
  return 'read';
}

/**
 * Process-local abuse guard for the single-instance AI admin API.
 * Principal identifiers are hashed before entering the bounded in-memory map.
 * Reverse-proxy forwarding headers are intentionally not trusted.
 */
export function createAIRequestSecurityGuard({
  now = Date.now,
  maxEntries = 10_000,
  policies = DEFAULT_POLICIES
} = {}) {
  const buckets = new Map();
  const capacity = Math.max(32, Math.min(100_000, Math.trunc(Number(maxEntries) || 10_000)));
  let checks = 0;

  function prune(at) {
    for (const [key, bucket] of buckets) {
      if (bucket.expiresAt <= at) buckets.delete(key);
    }
    while (buckets.size > capacity) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }

  function consume(key, policy, at) {
    let bucket = buckets.get(key);
    if (!bucket || at < bucket.startedAt || at >= bucket.expiresAt) {
      if (!buckets.has(key) && buckets.size >= capacity) {
        prune(at);
        while (buckets.size >= capacity) {
          const oldest = buckets.keys().next().value;
          if (oldest === undefined) break;
          buckets.delete(oldest);
        }
      }
      bucket = { startedAt: at, expiresAt: at + policy.windowMs, count: 1 };
      buckets.delete(key);
      buckets.set(key, bucket);
      return { allowed: true };
    }

    buckets.delete(key);
    buckets.set(key, bucket);
    if (bucket.count >= policy.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.expiresAt - at) / 1000)),
        limit: policy.limit,
        windowMs: policy.windowMs
      };
    }
    bucket.count += 1;
    return { allowed: true };
  }

  function check({ actorId = null, clientAddress = '', pathname = '', method = 'GET' } = {}) {
    const atValue = Number(now());
    const at = Number.isFinite(atValue) && atValue >= 0 ? atValue : Date.now();
    checks += 1;
    if (checks % 64 === 0 || buckets.size >= capacity) prune(at);

    const authenticated = typeof actorId === 'string' && actorId.trim().length > 0;
    const principal = authenticated
      ? 'user:' + digest(actorId.trim())
      : 'ip:' + digest(String(clientAddress || 'unknown').slice(0, 160));
    const routeGroup = classifyAIRequestRoute(pathname, method);
    const base = authenticated ? policies.authenticated : policies.anonymous;
    const burst = authenticated ? policies.authenticatedBurst : policies.anonymousBurst;

    const limits = routeGroup === 'webhook'
      ? [['webhook', policies.webhook]]
      : routeGroup === 'chat'
        ? [['principal', base], ['burst', burst], ['chat', policies.chat]]
        : routeGroup === 'provider'
          ? [['principal', base], ['burst', burst], ['providerProbe', policies.providerProbe]]
          : routeGroup === 'write'
            ? [['principal', base], ['burst', burst], ['write', policies.write]]
            : [['principal', base], ['burst', burst]];

    for (const [name, policy] of limits) {
      if (!policy || !Number.isSafeInteger(policy.limit) || policy.limit < 1 ||
          !Number.isSafeInteger(policy.windowMs) || policy.windowMs < 1) {
        throw new TypeError('AI Network rate-limit policies must have positive integer limits and windows.');
      }
      const result = consume(principal + ':' + name, policy, at);
      if (!result.allowed) {
        return {
          allowed: false,
          routeGroup,
          policy: name,
          retryAfterSeconds: result.retryAfterSeconds,
          limit: result.limit,
          windowMs: result.windowMs
        };
      }
    }
    return { allowed: true, routeGroup };
  }

  return Object.freeze({
    check,
    snapshot: () => Object.freeze({ activeBuckets: buckets.size, maxBuckets: capacity })
  });
}

/**
 * Low-cardinality operational counters. It stores no request bodies, prompts,
 * credentials, identity IDs, user IDs, or query parameters.
 */
export function createAIOperationalMonitor({ now = Date.now, maxLatencySamples = 120 } = {}) {
  const startedAt = Number(now());
  const counters = {
    requests: 0,
    successfulResponses: 0,
    clientErrors: 0,
    serverErrors: 0,
    authorizationDenied: 0,
    rateLimited: 0,
    unexpectedErrors: 0
  };
  const routeCounts = { read: 0, write: 0, chat: 0, provider: 0, webhook: 0, other: 0 };
  const latencies = [];
  const sampleLimit = Math.max(10, Math.min(500, Math.trunc(Number(maxLatencySamples) || 120)));
  let lastErrorAt = null;

  function timestamp() {
    const value = Number(now());
    return new Date(Number.isFinite(value) ? value : Date.now()).toISOString();
  }

  function recordResponse({ routeGroup = 'other', statusCode = 200, durationMs = 0 } = {}) {
    const group = ROUTE_GROUPS.has(routeGroup) ? routeGroup : 'other';
    const status = Math.max(0, Math.min(999, Math.trunc(Number(statusCode) || 0)));
    const duration = Number(durationMs);
    counters.requests += 1;
    routeCounts[group] += 1;
    if (status >= 200 && status < 400) counters.successfulResponses += 1;
    else if (status >= 400 && status < 500) counters.clientErrors += 1;
    else if (status >= 500) {
      counters.serverErrors += 1;
      lastErrorAt = timestamp();
    }
    if (status === 401 || status === 403) counters.authorizationDenied += 1;
    if (status === 429) counters.rateLimited += 1;
    if (Number.isFinite(duration) && duration >= 0) {
      latencies.push(Math.min(duration, 300_000));
      if (latencies.length > sampleLimit) latencies.shift();
    }
  }

  function recordUnexpectedError() {
    counters.unexpectedErrors += 1;
    lastErrorAt = timestamp();
  }

  function percentile(sorted, fraction) {
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
  }

  function snapshot() {
    const sorted = [...latencies].sort((a, b) => a - b);
    return {
      startedAt: new Date(startedAt).toISOString(),
      counters: { ...counters },
      routes: { ...routeCounts },
      latencyMs: {
        sampleCount: sorted.length,
        p50: percentile(sorted, 0.50),
        p95: percentile(sorted, 0.95),
        max: sorted.length ? sorted[sorted.length - 1] : null
      },
      lastErrorAt
    };
  }

  return Object.freeze({ recordResponse, recordUnexpectedError, snapshot });
}

const SAFE_ERROR_CODES = new Set([
  'provider_error', 'timeout', 'network_error', 'invalid_response', 'invalid_endpoint',
  'missing_credentials', 'missing_model', 'provider_not_selected', 'identity_unlinked',
  'invalid_message', 'moderation_blocked', 'moderation_unavailable', 'unauthorized',
  'forbidden', 'model_unavailable', 'rate_limited', 'routing_unavailable', 'circuit_open',
  'budget_exceeded', 'invalid_json', 'invalid_request', 'request_in_progress',
  'idempotency_conflict', 'not_found', 'conflict', 'unavailable'
]);

export function sanitizeAIErrorCode(value) {
  return typeof value === 'string' && SAFE_ERROR_CODES.has(value)
    ? value
    : 'unhandled_error';
}

export const AI_REQUEST_RATE_LIMITS = DEFAULT_POLICIES;
