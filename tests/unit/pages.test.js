import test from 'node:test';
import assert from 'node:assert/strict';
import { canAssignPageRole, canChangePageRole, canDeletePage, canDeletePagePost, canManagePage, canManagePageTeam, canRemovePageRole, canViewPageInsights, validatePageInput, validatePageUpdate } from '../../backend/modules/pages/service.js';

const roles = [
  { pageId: 'p1', userId: 'owner', role: 'owner' },
  { pageId: 'p1', userId: 'admin', role: 'admin' },
  { pageId: 'p1', userId: 'editor', role: 'editor' },
  { pageId: 'p1', userId: 'analyst', role: 'analyst' }
];
const post = { id: 'post1', pageId: 'p1', publishedBy: 'publisher' };

test('Page creation validates handle, title, optional text and uniqueness', () => {
  assert.equal(validatePageInput({ handle: 'Minglora-Labs', title: 'Minglora Labs' }).valid, true);
  assert.equal(validatePageInput({ handle: 'ab', title: 'Page' }).valid, false);
  assert.equal(validatePageInput({ handle: 'available', title: 'Good Page' }, [{ handle: 'AVAILABLE' }]).valid, false);
  assert.equal(validatePageInput({ handle: 'valid-page', title: 'x' }).valid, false);
});

test('Page management and publishing roles are explicit', () => {
  assert.equal(canManagePage(roles, 'p1', 'owner'), true);
  assert.equal(canManagePage(roles, 'p1', 'admin'), true);
  assert.equal(canManagePage(roles, 'p1', 'editor'), true);
  assert.equal(canManagePage(roles, 'p1', 'analyst'), false);
  assert.equal(canManagePage(roles, 'p1', 'outsider'), false);
});

test('Page post deletion is limited to publisher, owner or admin', () => {
  assert.equal(canDeletePagePost(roles, post, 'publisher'), true);
  assert.equal(canDeletePagePost(roles, post, 'owner'), true);
  assert.equal(canDeletePagePost(roles, post, 'admin'), true);
  assert.equal(canDeletePagePost(roles, post, 'editor'), false);
  assert.equal(canDeletePagePost(roles, post, 'analyst'), false);
});

test('only creator can delete their Page', () => {
  assert.equal(canDeletePage([{ id: 'p1', createdBy: 'owner' }], 'p1', 'owner'), true);
  assert.equal(canDeletePage([{ id: 'p1', createdBy: 'owner' }], 'p1', 'admin'), false);
});


const extendedRoles = [
  { pageId: 'p1', userId: 'owner', role: 'owner' },
  { pageId: 'p1', userId: 'admin', role: 'admin' },
  { pageId: 'p1', userId: 'editor', role: 'editor' },
  { pageId: 'p1', userId: 'analyst', role: 'analyst' }
];

test('Page profile updates validate only supplied fields and preserve unique handles', () => {
  const page = { id: 'p1', handle: 'minglora-labs', title: 'Minglora Labs' };
  const valid = validatePageUpdate({
    title: 'Minglora Labs International',
    website: 'https://minglora.example',
    contactEmail: 'hello@minglora.example',
    actionLabel: 'Visit website',
    actionUrl: 'https://minglora.example'
  }, page, [page, { id: 'p2', handle: 'other-page' }]);
  assert.equal(valid.valid, true);
  assert.equal(valid.value.handle, undefined);
  assert.equal(valid.value.title, 'Minglora Labs International');
  assert.equal(validatePageUpdate({ handle: 'other-page' }, page, [page, { id: 'p2', handle: 'other-page' }]).valid, false);
  assert.equal(validatePageUpdate({ website: 'javascript:alert(1)' }, page, [page]).valid, false);
  assert.equal(validatePageUpdate({ actionLabel: 'Book now' }, page, [page]).valid, false);
  assert.equal(validatePageUpdate({ title: 'x'.repeat(161) }, page, [page]).valid, false);
  assert.equal(validatePageUpdate({ phone: '1'.repeat(51) }, page, [page]).valid, false);
  assert.equal(validatePageUpdate({ actionLabel: 'x'.repeat(41), actionUrl: 'https://minglora.example' }, page, [page]).valid, false);
  assert.equal(validatePageInput({ handle: 'a'.repeat(31), title: 'A valid Page title' }).valid, false);
});

test('Page team and insights permissions are separated by role', () => {
  assert.equal(canManagePageTeam(extendedRoles, 'p1', 'owner'), true);
  assert.equal(canManagePageTeam(extendedRoles, 'p1', 'admin'), true);
  assert.equal(canManagePageTeam(extendedRoles, 'p1', 'editor'), false);
  assert.equal(canViewPageInsights(extendedRoles, 'p1', 'analyst'), true);
  assert.equal(canViewPageInsights(extendedRoles, 'p1', 'editor'), false);
});

test('owners can assign Page team roles; admins can only assign editor and analyst', () => {
  assert.equal(canAssignPageRole(extendedRoles, 'p1', 'owner', 'new-editor', 'editor'), true);
  assert.equal(canAssignPageRole(extendedRoles, 'p1', 'owner', 'new-admin', 'admin'), true);
  assert.equal(canAssignPageRole(extendedRoles, 'p1', 'admin', 'new-editor', 'editor'), true);
  assert.equal(canAssignPageRole(extendedRoles, 'p1', 'admin', 'new-admin', 'admin'), false);
  assert.equal(canAssignPageRole(extendedRoles, 'p1', 'editor', 'new-editor', 'editor'), false);
  assert.equal(canAssignPageRole(extendedRoles, 'p1', 'owner', 'owner', 'admin'), false);
});

test('Page team changes and removals protect the owner and prevent self-lockout', () => {
  assert.equal(canChangePageRole(extendedRoles, 'p1', 'owner', 'editor', 'analyst'), true);
  assert.equal(canChangePageRole(extendedRoles, 'p1', 'admin', 'editor', 'analyst'), true);
  assert.equal(canChangePageRole(extendedRoles, 'p1', 'admin', 'owner', 'editor'), false);
  assert.equal(canChangePageRole(extendedRoles, 'p1', 'admin', 'admin', 'editor'), false);
  assert.equal(canRemovePageRole(extendedRoles, 'p1', 'owner', 'editor'), true);
  assert.equal(canRemovePageRole(extendedRoles, 'p1', 'admin', 'analyst'), true);
  assert.equal(canRemovePageRole(extendedRoles, 'p1', 'admin', 'owner'), false);
  assert.equal(canRemovePageRole(extendedRoles, 'p1', 'admin', 'admin'), false);
});
