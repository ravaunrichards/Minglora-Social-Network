import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAssignGroupRole, canDeleteGroupPost, canDiscoverGroup, canLeaveGroup,
  canManageGroupEvents, canManageGroupSettings, canModerateGroup,
  canPublishGroupPost, canRequestGroupMembership, canViewGroup,
  getGroupRole, groupPermissionSet, isGroupMember
} from '../../backend/modules/groups/service.js';

const group = {
  id: 'g1', ownerId: 'owner', members: ['owner', 'member'],
  memberships: [
    { userId: 'owner', role: 'owner', status: 'active' },
    { userId: 'member', role: 'member', status: 'active' },
    { userId: 'mod', role: 'moderator', status: 'active' },
    { userId: 'events', role: 'event_manager', status: 'active' },
    { userId: 'admin', role: 'admin', status: 'active' }
  ],
  visibility: 'public', status: 'active'
};
const post = { id: 'post1', groupId: 'g1', userId: 'member' };

test('membership and post publishing require active membership', () => {
  assert.equal(isGroupMember(group, 'member'), true);
  assert.equal(canPublishGroupPost(group, 'member'), true);
  assert.equal(canPublishGroupPost(group, 'outsider'), false);
});
test('group post deletion is restricted to author or trusted moderators', () => {
  assert.equal(canDeleteGroupPost(group, post, 'member'), true);
  assert.equal(canDeleteGroupPost(group, post, 'owner'), true);
  assert.equal(canDeleteGroupPost(group, post, 'mod'), true);
  assert.equal(canDeleteGroupPost(group, post, 'outsider'), false);
  assert.equal(canDeleteGroupPost(group, { ...post, groupId: 'another' }, 'owner'), false);
});
test('group owners cannot leave without transferring ownership', () => {
  assert.equal(canLeaveGroup(group, 'member'), true);
  assert.equal(canLeaveGroup(group, 'owner'), false);
  assert.equal(canLeaveGroup(group, 'outsider'), false);
});
test('public, private-visible and private-hidden discovery rules are distinct', () => {
  assert.equal(canDiscoverGroup(group), true);
  assert.equal(canViewGroup(group, 'outsider'), true);
  const privateVisible = { ...group, visibility: 'private' };
  assert.equal(canDiscoverGroup(privateVisible), true);
  assert.equal(canViewGroup(privateVisible, 'outsider'), true);
  assert.equal(canViewGroup(privateVisible, 'member'), true);
  const hidden = { ...privateVisible, discoverable: false };
  assert.equal(canDiscoverGroup(hidden), false);
  assert.equal(canViewGroup(hidden, 'outsider'), false);
  assert.equal(canViewGroup(hidden, 'member'), true);
});
test('membership requests respect visibility and approval settings', () => {
  assert.equal(canRequestGroupMembership(group, 'outsider'), true);
  assert.equal(canRequestGroupMembership({ ...group, visibility: 'private', joinApproval: false }, 'outsider'), false);
  assert.equal(canRequestGroupMembership({ ...group, visibility: 'private' }, 'outsider'), true);
  assert.equal(canRequestGroupMembership(group, 'member'), false);
});
test('role permissions separate moderation, settings and event management', () => {
  assert.equal(getGroupRole(group, 'mod'), 'moderator');
  assert.equal(canModerateGroup(group, 'mod'), true);
  assert.equal(canManageGroupSettings(group, 'mod'), false);
  assert.equal(canManageGroupEvents(group, 'events'), true);
  assert.equal(canManageGroupSettings(group, 'admin'), true);
  assert.equal(canAssignGroupRole(group, 'admin', 'moderator'), true);
  assert.equal(canAssignGroupRole(group, 'admin', 'admin'), false);
  assert.equal(groupPermissionSet('member').includes('delete_group'), false);
  assert.equal(groupPermissionSet('owner').includes('transfer_ownership'), true);
});
test('archived and deleted groups are not visible to outsiders', () => {
  assert.equal(canViewGroup({ ...group, status: 'archived' }, 'outsider'), false);
  assert.equal(canViewGroup({ ...group, status: 'deleted' }, 'member'), false);
});
