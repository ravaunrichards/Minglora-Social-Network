import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixedWindowLimiter } from '../../src/security/fixed-window-limiter.js';

test('allows five failures then blocks until the fixed window expires', () => {
  let timestamp = 1_000;
  const limiter = createFixedWindowLimiter({
    limit: 5,
    windowMs: 900_000,
    maxKeys: 10,
    now: () => timestamp
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(limiter.check('account-ip-hash').allowed, true);
    limiter.recordFailure('account-ip-hash');
  }

  const blocked = limiter.check('account-ip-hash');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 900_000);

  timestamp += 900_000;
  assert.equal(limiter.check('account-ip-hash').allowed, true);
});

test('successful sign-in clearing removes the failed-attempt bucket', () => {
  const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 1_000, maxKeys: 2 });
  limiter.recordFailure('key');
  assert.equal(limiter.check('key').allowed, false);
  limiter.clear('key');
  assert.equal(limiter.check('key').allowed, true);
  assert.equal(limiter.size, 0);
});

test('hard-bounds attacker-controlled unique keys with least-recently-used eviction', () => {
  const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 1_000, maxKeys: 2 });
  limiter.recordFailure('first');
  limiter.recordFailure('second');
  limiter.check('first'); // Touch first; second is now the least recently used.
  limiter.recordFailure('third');

  assert.equal(limiter.size, 2);
  assert.equal(limiter.size <= limiter.maxKeys, true);
  assert.equal(limiter.check('first').allowed, false);
  assert.equal(limiter.check('second').allowed, true);
  assert.equal(limiter.check('third').allowed, false);
});

test('prunes expired entries when capacity is reached', () => {
  let timestamp = 0;
  const limiter = createFixedWindowLimiter({
    limit: 2,
    windowMs: 10,
    maxKeys: 2,
    now: () => timestamp
  });
  limiter.recordFailure('old-one');
  limiter.recordFailure('old-two');
  timestamp = 10;
  limiter.recordFailure('new-one');

  assert.equal(limiter.size, 1);
  assert.equal(limiter.check('new-one').allowed, true);
});

test('rejects invalid limiter configuration and malformed keys', () => {
  assert.throws(() => createFixedWindowLimiter({ limit: 0 }), /limit/);
  assert.throws(() => createFixedWindowLimiter({ windowMs: 0 }), /windowMs/);
  assert.throws(() => createFixedWindowLimiter({ maxKeys: 0 }), /maxKeys/);
  const limiter = createFixedWindowLimiter();
  assert.throws(() => limiter.check(''), /limiter key/);
  assert.throws(() => limiter.recordFailure('x'.repeat(513)), /limiter key/);
});
