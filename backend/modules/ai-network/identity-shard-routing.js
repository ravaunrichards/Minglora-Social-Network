import { createHash } from 'node:crypto';

export const DEFAULT_LOGICAL_PARTITION_COUNT = 4096;

const SHARD_STATUSES = new Set(['active', 'draining', 'offline', 'disabled']);
const LIFECYCLE_STATUSES = new Set([
  'proposed', 'created', 'under_review', 'approved', 'active',
  'restricted', 'suspended', 'archived', 'retired'
]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;
const SHARD_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const REGION_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;
const PARTITION_ID_PATTERN = /^lp-[1-9][0-9]{0,6}-[0-9]{1,6}$/;
const TWO_POW_52 = 2 ** 52;

export class AIIdentityShardRoutingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AIIdentityShardRoutingError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new AIIdentityShardRoutingError(code, message);
}

function normalizeId(value, field) {
  const normalized = String(value ?? '').trim();
  if (!ID_PATTERN.test(normalized)) {
    reject('invalid_' + field, 'A valid ' + field + ' is required for AI identity routing.');
  }
  return normalized;
}

function normalizeShardCatalog(shards) {
  if (!Array.isArray(shards) || shards.length < 1 || shards.length > 4096) {
    reject('invalid_shard_catalog', 'The shard catalog must contain between 1 and 4096 entries.');
  }

  const seen = new Set();
  return shards.map(shard => {
    const shardId = String(shard?.shardId ?? '').trim().toLowerCase();
    const region = String(shard?.region ?? '').trim().toLowerCase();
    const status = String(shard?.status ?? '').trim().toLowerCase();
    const weight = Number(shard?.weight);

    if (!SHARD_ID_PATTERN.test(shardId) || seen.has(shardId)) {
      reject('invalid_shard_catalog', 'Shard identifiers must be valid and unique.');
    }
    if (!REGION_PATTERN.test(region)) {
      reject('invalid_shard_catalog', 'Every shard must declare a valid home region.');
    }
    if (!SHARD_STATUSES.has(status)) {
      reject('invalid_shard_catalog', 'Every shard must declare a supported lifecycle status.');
    }
    if (!Number.isFinite(weight) || weight <= 0 || weight > 1000000) {
      reject('invalid_shard_catalog', 'Every shard weight must be greater than zero and no more than 1000000.');
    }
    seen.add(shardId);
    return { shardId, region, status, weight };
  });
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function getLogicalPartitionId(tenantId, identityId, partitionCount) {
  if (!Number.isInteger(partitionCount) || partitionCount < 1 || partitionCount > 1000000) {
    reject('invalid_partition_count', 'logicalPartitionCount must be an integer from 1 through 1000000.');
  }
  const digest = createHash('sha256')
    .update(tenantId, 'utf8')
    .update('\u0000', 'utf8')
    .update(identityId, 'utf8')
    .digest();
  const bucket = Number(digest.readBigUInt64BE(0) % BigInt(partitionCount));
  return 'lp-' + partitionCount + '-' + String(bucket).padStart(6, '0');
}

function rendezvousScore(partitionId, shard) {
  const digest = sha256(partitionId + '\u0000' + shard.shardId);
  const sample = Number.parseInt(digest.slice(0, 13), 16);
  const uniform = (sample + 1) / (TWO_POW_52 + 1);
  return -Math.log(uniform) / shard.weight;
}

function choosePhysicalShard(partitionId, shards) {
  const eligible = shards.filter(shard => shard.status === 'active');
  if (eligible.length === 0) {
    reject('no_active_shards', 'No active physical shard is available for a new AI identity.');
  }

  let selected = eligible[0];
  let selectedScore = rendezvousScore(partitionId, selected);
  for (let index = 1; index < eligible.length; index += 1) {
    const candidate = eligible[index];
    const score = rendezvousScore(partitionId, candidate);
    if (score < selectedScore || (score === selectedScore && candidate.shardId < selected.shardId)) {
      selected = candidate;
      selectedScore = score;
    }
  }
  return selected;
}

/**
 * Plans placement for a new identity.
 *
 * This is a deterministic planner, not a durable reservation. The caller must
 * persist the returned mapping in a strongly consistent identity directory
 * under the same idempotency/registration transaction before accepting it.
 * Existing identities must always resolve from their persisted directory row.
 */
export function planNewIdentityRoute({
  tenantId,
  identityId,
  shards,
  logicalPartitionCount = DEFAULT_LOGICAL_PARTITION_COUNT
} = {}) {
  const normalizedTenantId = normalizeId(tenantId, 'tenant_id');
  const normalizedIdentityId = normalizeId(identityId, 'identity_id');
  const catalog = normalizeShardCatalog(shards);
  const logicalPartitionId = getLogicalPartitionId(
    normalizedTenantId,
    normalizedIdentityId,
    logicalPartitionCount
  );
  const shard = choosePhysicalShard(logicalPartitionId, catalog);

  return Object.freeze({
    identityId: normalizedIdentityId,
    tenantId: normalizedTenantId,
    homeRegion: shard.region,
    logicalPartitionId,
    physicalShardId: shard.shardId,
    directoryVersion: 1
  });
}

function readField(record, camelName, snakeName) {
  return record?.[camelName] ?? record?.[snakeName];
}

/**
 * Resolves an existing identity only from its persisted directory mapping.
 * Unknown, stale, cross-tenant and unavailable mappings fail closed.
 * A draining shard may serve reads but cannot accept new writes.
 */
export function resolveIdentityRoute({
  tenantId,
  identityId,
  directoryRecord,
  shards,
  operation = 'read',
  expectedDirectoryVersion
} = {}) {
  const normalizedTenantId = normalizeId(tenantId, 'tenant_id');
  const normalizedIdentityId = normalizeId(identityId, 'identity_id');
  if (operation !== 'read' && operation !== 'write') {
    reject('invalid_operation', 'Identity route operation must be read or write.');
  }
  if (!directoryRecord || typeof directoryRecord !== 'object' || Array.isArray(directoryRecord)) {
    reject('directory_mapping_missing', 'No persisted directory mapping exists for this AI identity.');
  }

  const storedIdentityId = normalizeId(
    readField(directoryRecord, 'identityId', 'identity_id'),
    'directory_identity_id'
  );
  const storedTenantId = normalizeId(
    readField(directoryRecord, 'tenantId', 'tenant_id'),
    'directory_tenant_id'
  );
  const physicalShardId = String(
    readField(directoryRecord, 'physicalShardId', 'physical_shard_id') ?? ''
  ).trim().toLowerCase();
  const homeRegion = String(
    readField(directoryRecord, 'homeRegion', 'home_region') ?? ''
  ).trim().toLowerCase();
  const logicalPartitionId = String(
    readField(directoryRecord, 'logicalPartitionId', 'logical_partition_id') ?? ''
  ).trim();
  const directoryVersion = Number(
    readField(directoryRecord, 'directoryVersion', 'directory_version')
  );
  const lifecycleStatus = String(
    readField(directoryRecord, 'lifecycleStatus', 'lifecycle_status') ?? ''
  ).trim().toLowerCase();

  if (storedIdentityId !== normalizedIdentityId || storedTenantId !== normalizedTenantId) {
    reject('directory_scope_mismatch', 'The persisted identity directory mapping does not match the requested tenant and identity.');
  }
  if (!SHARD_ID_PATTERN.test(physicalShardId) ||
      !REGION_PATTERN.test(homeRegion) ||
      !PARTITION_ID_PATTERN.test(logicalPartitionId) ||
      !Number.isSafeInteger(directoryVersion) || directoryVersion < 1 ||
      !LIFECYCLE_STATUSES.has(lifecycleStatus)) {
    reject('invalid_directory_mapping', 'The persisted identity directory mapping is incomplete or invalid.');
  }
  if (expectedDirectoryVersion !== undefined &&
      (!Number.isSafeInteger(expectedDirectoryVersion) || expectedDirectoryVersion < 1 ||
       directoryVersion !== expectedDirectoryVersion)) {
    reject('stale_directory_mapping', 'The identity directory version is stale; refresh the authoritative mapping.');
  }

  const catalog = normalizeShardCatalog(shards);
  const shard = catalog.find(candidate => candidate.shardId === physicalShardId);
  if (!shard) {
    reject('unknown_physical_shard', 'The persisted identity mapping references an unknown physical shard.');
  }
  if (shard.region !== homeRegion) {
    reject('directory_region_mismatch', 'The persisted home region does not match the physical shard catalog.');
  }
  if (shard.status === 'offline' || shard.status === 'disabled') {
    reject('shard_unavailable', 'The physical shard is unavailable; identity routing is blocked.');
  }
  if (operation === 'write' && shard.status !== 'active') {
    reject('shard_write_blocked', 'Writes are blocked while the physical shard is draining or unavailable.');
  }

  return Object.freeze({
    identityId: normalizedIdentityId,
    tenantId: normalizedTenantId,
    homeRegion,
    logicalPartitionId,
    physicalShardId,
    directoryVersion,
    lifecycleStatus,
    operation,
    shardStatus: shard.status
  });
}
