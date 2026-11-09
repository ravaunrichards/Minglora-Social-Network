import test from 'node:test';
import assert from 'node:assert/strict';
import { accountStatusLabel, isActiveRelationshipAccount, normalizeAccountStatus } from '../../backend/modules/moderation/account-status.js';

test('only active accounts qualify for active relationship totals', () => {
  assert.equal(isActiveRelationshipAccount({ status: 'active' }), true);
  for (const status of ['banned', 'restricted', 'suspended', 'deactivated', 'deleted']) {
    assert.equal(isActiveRelationshipAccount({ status }), false, status);
  }
});
test('public status labels are normalized and safe', () => {
  assert.equal(normalizeAccountStatus(' RESTRICTED '), 'restricted');
  assert.equal(accountStatusLabel('banned'), 'Banned');
  assert.equal(accountStatusLabel('restricted'), 'Restricted');
  assert.equal(accountStatusLabel('unknown-untrusted-state'), 'Active');
});
