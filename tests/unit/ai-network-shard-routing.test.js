import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIIdentityShardRoutingError,
  DEFAULT_LOGICAL_PARTITION_COUNT,
  planNewIdentityRoute,
  resolveIdentityRoute
} from '../../backend/modules/ai-network/identity-shard-routing.js';

const shards = [
  { shardId: 'identity-east-1', region: 'us-east-1', status: 'active', weight: 2 },
  { shardId: 'identity-eu-1', region: 'eu-west-1', status: 'active', weight: 1 },
  { shardId: 'identity-dr-1', region: 'us-east-2', status: 'draining', weight: 1 },
  { shardId: 'identity-offline-1', region: 'ap-southeast-1', status: 'offline', weight: 1 }
];

function directoryRecord(route, overrides = {}) {
  return {
    identity_id: route.identityId,
    tenant_id: route.tenantId,
    home_region: route.homeRegion,
    logical_partition_id: route.logicalPartitionId,
    physical_shard_id: route.physicalShardId,
    directory_version: route.directoryVersion,
    lifecycle_status: 'active',
    ...overrides
  };
}

test('new identity placement is deterministic and independent of catalog order', () => {
  const input = {
    tenantId: 'tenant-acme',
    identityId: 'identity-0001',
    shards,
    logicalPartitionCount: 128
  };
  const first = planNewIdentityRoute(input);
  const second = planNewIdentityRoute({ ...input, shards: [...shards].reverse() });

  assert.deepEqual(first, second);
  assert.match(first.logicalPartitionId, /^lp-128-[0-9]{6}$/);
  assert.equal(first.directoryVersion, 1);
  assert.ok(shards.some(shard => shard.shardId === first.physicalShardId && shard.status === 'active'));
});

test('tenant and identity keys produce a stable virtual partition identifier', () => {
  const sameIdentityOtherTenant = planNewIdentityRoute({
    tenantId: 'tenant-other',
    identityId: 'identity-0001',
    shards,
    logicalPartitionCount: 1000000
  });
  const original = planNewIdentityRoute({
    tenantId: 'tenant-acme',
    identityId: 'identity-0001',
    shards,
    logicalPartitionCount: 1000000
  });

  assert.notEqual(original.logicalPartitionId, sameIdentityOtherTenant.logicalPartitionId);
  assert.equal(DEFAULT_LOGICAL_PARTITION_COUNT, 4096);
});

test('new identities are never assigned to draining, offline or disabled shards', () => {
  const onlyNonWritable = [
    { shardId: 'old-east', region: 'us-east-1', status: 'draining', weight: 1 },
    { shardId: 'old-eu', region: 'eu-west-1', status: 'offline', weight: 1 }
  ];

  assert.throws(
    () => planNewIdentityRoute({ tenantId: 'tenant-acme', identityId: 'identity-0002', shards: onlyNonWritable }),
    error => error instanceof AIIdentityShardRoutingError && error.code === 'no_active_shards'
  );
});

test('invalid and duplicate shard catalog entries are rejected', () => {
  const duplicate = [
    { shardId: 'duplicate', region: 'us-east-1', status: 'active', weight: 1 },
    { shardId: 'duplicate', region: 'eu-west-1', status: 'active', weight: 1 }
  ];
  const invalidWeight = [
    { shardId: 'zero-weight', region: 'us-east-1', status: 'active', weight: 0 }
  ];

  assert.throws(
    () => planNewIdentityRoute({ tenantId: 'tenant-acme', identityId: 'identity-0003', shards: duplicate }),
    error => error.code === 'invalid_shard_catalog'
  );
  assert.throws(
    () => planNewIdentityRoute({ tenantId: 'tenant-acme', identityId: 'identity-0003', shards: invalidWeight }),
    error => error.code === 'invalid_shard_catalog'
  );
});

test('existing identity resolution uses its persisted directory mapping, not a fresh placement plan', () => {
  const planned = planNewIdentityRoute({
    tenantId: 'tenant-acme',
    identityId: 'identity-0004',
    shards,
    logicalPartitionCount: 64
  });
  const persisted = directoryRecord(planned, { directory_version: 9 });
  const expandedCatalog = [
    ...shards,
    { shardId: 'new-high-weight-shard', region: 'us-west-2', status: 'active', weight: 1000000 }
  ];
  const resolved = resolveIdentityRoute({
    tenantId: 'tenant-acme',
    identityId: 'identity-0004',
    directoryRecord: persisted,
    shards: expandedCatalog,
    expectedDirectoryVersion: 9
  });

  assert.equal(resolved.physicalShardId, planned.physicalShardId);
  assert.equal(resolved.directoryVersion, 9);
  assert.equal(resolved.operation, 'read');
});

test('draining shards remain readable but reject writes', () => {
  const draining = [
    { shardId: 'identity-east-drain', region: 'us-east-1', status: 'draining', weight: 1 },
    { shardId: 'identity-eu-active', region: 'eu-west-1', status: 'active', weight: 1 }
  ];
  const route = {
    identityId: 'identity-0005',
    tenantId: 'tenant-acme',
    homeRegion: 'us-east-1',
    logicalPartitionId: 'lp-64-000005',
    physicalShardId: 'identity-east-drain',
    directoryVersion: 3
  };
  const read = resolveIdentityRoute({
    tenantId: route.tenantId,
    identityId: route.identityId,
    directoryRecord: directoryRecord(route),
    shards: draining,
    operation: 'read'
  });

  assert.equal(read.shardStatus, 'draining');
  assert.throws(
    () => resolveIdentityRoute({
      tenantId: route.tenantId,
      identityId: route.identityId,
      directoryRecord: directoryRecord(route),
      shards: draining,
      operation: 'write'
    }),
    error => error.code === 'shard_write_blocked'
  );
});

test('offline and disabled shard mappings fail closed', () => {
  for (const status of ['offline', 'disabled']) {
    const route = {
      identityId: 'identity-0006',
      tenantId: 'tenant-acme',
      homeRegion: 'us-east-1',
      logicalPartitionId: 'lp-64-000006',
      physicalShardId: 'identity-east',
      directoryVersion: 1
    };
    assert.throws(
      () => resolveIdentityRoute({
        tenantId: route.tenantId,
        identityId: route.identityId,
        directoryRecord: directoryRecord(route),
        shards: [{ shardId: 'identity-east', region: 'us-east-1', status, weight: 1 }]
      }),
      error => error.code === 'shard_unavailable'
    );
  }
});

test('cross-tenant, cross-identity and stale directory mappings are rejected', () => {
  const route = planNewIdentityRoute({
    tenantId: 'tenant-acme',
    identityId: 'identity-0007',
    shards,
    logicalPartitionCount: 64
  });
  const record = directoryRecord(route, { directory_version: 4 });
  const resolve = (args = {}) => resolveIdentityRoute({
    tenantId: 'tenant-acme',
    identityId: 'identity-0007',
    directoryRecord: record,
    shards,
    ...args
  });

  assert.throws(
    () => resolve({ tenantId: 'tenant-other' }),
    error => error.code === 'directory_scope_mismatch'
  );
  assert.throws(
    () => resolve({ identityId: 'identity-9999' }),
    error => error.code === 'directory_scope_mismatch'
  );
  assert.throws(
    () => resolve({ expectedDirectoryVersion: 3 }),
    error => error.code === 'stale_directory_mapping'
  );
});

test('unknown physical shards and invalid operations are rejected', () => {
  const route = {
    identityId: 'identity-0008',
    tenantId: 'tenant-acme',
    homeRegion: 'us-east-1',
    logicalPartitionId: 'lp-64-000008',
    physicalShardId: 'missing-shard',
    directoryVersion: 1
  };
  assert.throws(
    () => resolveIdentityRoute({
      tenantId: route.tenantId,
      identityId: route.identityId,
      directoryRecord: directoryRecord(route),
      shards
    }),
    error => error.code === 'unknown_physical_shard'
  );
  assert.throws(
    () => resolveIdentityRoute({
      tenantId: route.tenantId,
      identityId: route.identityId,
      directoryRecord: directoryRecord({ ...route, physicalShardId: 'identity-east-1', homeRegion: 'us-east-1' }),
      shards,
      operation: 'delete'
    }),
    error => error.code === 'invalid_operation'
  );
});
