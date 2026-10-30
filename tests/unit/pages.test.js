import test from 'node:test';
import assert from 'node:assert/strict';
import { canDeletePage, canDeletePagePost, canManagePage, validatePageInput } from '../../backend/modules/pages/service.js';

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
