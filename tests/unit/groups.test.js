import test from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteGroupPost, canLeaveGroup, canPublishGroupPost, isGroupMember } from '../../backend/modules/groups/service.js';

const group = { id: 'g1', ownerId: 'owner', members: ['owner', 'member'] };
const post = { id: 'post1', groupId: 'g1', userId: 'member' };

test('only active members can publish group posts', () => {
  assert.equal(isGroupMember(group, 'member'), true);
  assert.equal(canPublishGroupPost(group, 'member'), true);
  assert.equal(canPublishGroupPost(group, 'outsider'), false);
});

test('group post deletion is restricted to author or group owner', () => {
  assert.equal(canDeleteGroupPost(group, post, 'member'), true);
  assert.equal(canDeleteGroupPost(group, post, 'owner'), true);
  assert.equal(canDeleteGroupPost(group, post, 'outsider'), false);
  assert.equal(canDeleteGroupPost(group, { ...post, groupId: 'another' }, 'owner'), false);
});

test('group owners cannot leave without transferring ownership', () => {
  assert.equal(canLeaveGroup(group, 'member'), true);
  assert.equal(canLeaveGroup(group, 'owner'), false);
  assert.equal(canLeaveGroup(group, 'outsider'), false);
});
