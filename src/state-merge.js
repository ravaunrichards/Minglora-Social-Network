import { isDeepStrictEqual } from 'node:util';

const MISSING = Symbol('missing-state-value');

function clone(value) {
  return value === MISSING ? MISSING : structuredClone(value);
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function identityOf(value) {
  if (!isRecord(value)) return null;
  if (value.id !== undefined && value.id !== null) return 'id:' + String(value.id);
  const pairs = [
    ['followerId', 'followedId'], ['from', 'to'], ['userId', 'peerId'],
    ['userId', 'pageId'], ['userId', 'listingId'], ['userId', 'postId'],
    ['storyId', 'viewerId'], ['broadcastId', 'userId'], ['roomId', 'userId'],
    ['targetUserId', 'viewerUserId']
  ];
  for (const [first, second] of pairs) {
    if (value[first] !== undefined && value[second] !== undefined) {
      return first + ':' + String(value[first]) + '|' + second + ':' + String(value[second]);
    }
  }
  return null;
}

function mergePrimitiveArray(base, local, remote) {
  const candidates = [...local, ...remote, ...base];
  const result = [];
  for (const candidate of candidates) {
    if (result.some(item => isDeepStrictEqual(item, candidate))) continue;
    const existed = base.some(item => isDeepStrictEqual(item, candidate));
    const inLocal = local.some(item => isDeepStrictEqual(item, candidate));
    const inRemote = remote.some(item => isDeepStrictEqual(item, candidate));
    const keep = inLocal === existed ? inRemote : inLocal;
    if (keep) result.push(clone(candidate));
  }
  return result;
}

function mergeKeyedArray(base, local, remote) {
  const baseMap = new Map(base.map(item => [identityOf(item), item]));
  const localMap = new Map(local.map(item => [identityOf(item), item]));
  const remoteMap = new Map(remote.map(item => [identityOf(item), item]));
  const orderedKeys = [...local.map(identityOf), ...remote.map(identityOf), ...base.map(identityOf)];
  const seen = new Set(), result = [];
  for (const key of orderedKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const before = baseMap.has(key) ? baseMap.get(key) : MISSING;
    const ours = localMap.has(key) ? localMap.get(key) : MISSING;
    const theirs = remoteMap.has(key) ? remoteMap.get(key) : MISSING;
    const merged = mergeValue(before, ours, theirs);
    if (merged !== MISSING) result.push(merged);
  }
  return result;
}

function mergeArray(base, local, remote) {
  const all = [...base, ...local, ...remote];
  if (all.every(value => !isRecord(value) && !Array.isArray(value))) {
    return mergePrimitiveArray(base, local, remote);
  }
  if (all.every(value => identityOf(value) !== null)) return mergeKeyedArray(base, local, remote);

  // Conservatively retain unkeyed records from both writers.
  const result = [];
  for (const item of [...local, ...remote]) {
    if (!result.some(existing => isDeepStrictEqual(existing, item))) result.push(clone(item));
  }
  return result;
}

function mergeObject(base, local, remote) {
  const result = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    const before = Object.hasOwn(base, key) ? base[key] : MISSING;
    const ours = Object.hasOwn(local, key) ? local[key] : MISSING;
    const theirs = Object.hasOwn(remote, key) ? remote[key] : MISSING;
    const merged = mergeValue(before, ours, theirs);
    if (merged !== MISSING) result[key] = merged;
  }
  return result;
}

function mergeValue(base, local, remote) {
  if (isDeepStrictEqual(local, base)) return clone(remote);
  if (isDeepStrictEqual(remote, base)) return clone(local);
  if (isDeepStrictEqual(local, remote)) return clone(local);
  if (local === MISSING) return isDeepStrictEqual(remote, base) ? MISSING : clone(remote);
  if (remote === MISSING) return isDeepStrictEqual(local, base) ? MISSING : clone(local);
  if (Array.isArray(local) && Array.isArray(remote) && (base === MISSING || Array.isArray(base))) {
    return mergeArray(base === MISSING ? [] : base, local, remote);
  }
  if (isRecord(local) && isRecord(remote) && (base === MISSING || isRecord(base))) {
    return mergeObject(base === MISSING ? {} : base, local, remote);
  }
  // Same-field conflicts use the writer that is currently retrying its save.
  return clone(local);
}

export function mergeConcurrentState(base, local, remote) {
  if (!isRecord(base) || !isRecord(local) || !isRecord(remote)) {
    throw new TypeError('Concurrent application states must be objects.');
  }
  return mergeObject(base, local, remote);
}

function syncValue(target, source) {
  if (Array.isArray(source)) {
    if (Array.isArray(target)) { syncArray(target, source); return target; }
    return clone(source);
  }
  if (isRecord(source)) {
    if (isRecord(target)) { syncObject(target, source); return target; }
    return clone(source);
  }
  return clone(source);
}

function syncObject(target, source) {
  for (const key of Object.keys(target)) if (!Object.hasOwn(source, key)) delete target[key];
  for (const [key, value] of Object.entries(source)) target[key] = syncValue(target[key], value);
  return target;
}

function syncArray(target, source) {
  const existingByIdentity = new Map();
  for (const item of target) {
    const key = identityOf(item);
    if (key !== null) existingByIdentity.set(key, item);
  }
  const next = source.map((item, index) => {
    const key = identityOf(item);
    const existing = key !== null ? existingByIdentity.get(key) : target[index];
    if (isRecord(item) && isRecord(existing)) { syncObject(existing, item); return existing; }
    if (Array.isArray(item) && Array.isArray(existing)) { syncArray(existing, item); return existing; }
    return clone(item);
  });
  target.splice(0, target.length, ...next);
}

export function reconcileStateInPlace(target, source) {
  if (!isRecord(target) || !isRecord(source)) throw new TypeError('Application state must be an object.');
  return syncObject(target, source);
}
