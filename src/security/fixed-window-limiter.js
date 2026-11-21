/**
 * Bounded in-process fixed-window limiter.
 *
 * This protects a single Node process from unbounded key growth. It is not a
 * distributed limiter; hosted deployments must still use provider-side or
 * shared-store throttling before horizontal scaling.
 */
export function createFixedWindowLimiter({
  limit = 5,
  windowMs = 15 * 60 * 1000,
  maxKeys = 20_000,
  now = Date.now
} = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('limit must be a positive integer');
  if (!Number.isInteger(windowMs) || windowMs < 1) throw new TypeError('windowMs must be a positive integer');
  if (!Number.isInteger(maxKeys) || maxKeys < 1) throw new TypeError('maxKeys must be a positive integer');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const entries = new Map();

  function normalizeKey(key) {
    const normalized = String(key ?? '');
    if (!normalized || normalized.length > 512) {
      throw new TypeError('limiter key must contain between 1 and 512 characters');
    }
    return normalized;
  }

  function check(key) {
    const normalized = normalizeKey(key);
    const timestamp = now();
    const entry = entries.get(normalized);
    if (!entry) return { allowed: true, key: normalized };

    if (entry.resetAt <= timestamp) {
      entries.delete(normalized);
      return { allowed: true, key: normalized };
    }

    // Touch the entry so eviction removes the least recently used key first.
    entries.delete(normalized);
    entries.set(normalized, entry);
    return {
      allowed: entry.count < limit,
      key: normalized,
      retryAfterMs: Math.max(0, entry.resetAt - timestamp)
    };
  }

  function recordFailure(key) {
    const normalized = normalizeKey(key);
    const timestamp = now();
    const current = entries.get(normalized);

    if (current && current.resetAt > timestamp) {
      current.count = Math.min(limit, current.count + 1);
      entries.delete(normalized);
      entries.set(normalized, current);
      return;
    }

    if (current) entries.delete(normalized);

    // Purge expired entries when capacity is reached, then evict only enough
    // least-recently-used entries to preserve a strict upper bound.
    if (entries.size >= maxKeys) {
      for (const [candidate, entry] of entries) {
        if (entry.resetAt <= timestamp) entries.delete(candidate);
      }
    }
    while (entries.size >= maxKeys) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }

    entries.set(normalized, {
      count: 1,
      resetAt: timestamp + windowMs
    });
  }

  function clear(key) {
    entries.delete(normalizeKey(key));
  }

  function pruneExpired() {
    const timestamp = now();
    let removed = 0;
    for (const [key, entry] of entries) {
      if (entry.resetAt <= timestamp) {
        entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  return Object.freeze({
    check,
    recordFailure,
    clear,
    pruneExpired,
    get size() { return entries.size; },
    get maxKeys() { return maxKeys; }
  });
}
