import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVideoDraftInput } from '../../src/domain/video-drafts.js';

test('validates a private or public video draft using one uploaded asset reference', () => {
  const result = validateVideoDraftInput({
    text: ' A saved Reel ',
    audience: 'friends',
    videoFormat: 'reel',
    remixPolicy: 'friends',
    mediaIds: ['asset-1']
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    text: 'A saved Reel',
    audience: 'friends',
    videoFormat: 'reel',
    remixPolicy: 'friends',
    mediaIds: ['asset-1'],
    remixOfPostId: null
  });
});

test('rejects invalid audiences, formats, remix permissions and media references', () => {
  for (const input of [
    { mediaIds: ['asset-1'], audience: 'everyone' },
    { mediaIds: ['asset-1'], videoFormat: 'story' },
    { mediaIds: ['asset-1'], remixPolicy: 'anyone' },
    { mediaIds: [] },
    { mediaIds: ['asset-1', 'asset-2'] },
    { mediaIds: ['x'.repeat(81)] },
    { mediaIds: 'asset-1' }
  ]) assert.equal(validateVideoDraftInput(input).valid, false);
});

test('preserves unchanged fields when editing an existing draft', () => {
  const existing = {
    text: 'Original caption',
    audience: 'private',
    videoFormat: 'reel',
    remixPolicy: 'off',
    mediaIds: ['asset-1'],
    remixOfPostId: 'source-video'
  };
  const result = validateVideoDraftInput({ text: 'Updated caption' }, existing);
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    text: 'Updated caption',
    audience: 'private',
    videoFormat: 'reel',
    remixPolicy: 'off',
    mediaIds: ['asset-1'],
    remixOfPostId: 'source-video'
  });
});

test('rejects captions and source references beyond supported lengths', () => {
  assert.equal(validateVideoDraftInput({ text: 'x'.repeat(5001), mediaIds: ['asset-1'] }).valid, false);
  assert.equal(validateVideoDraftInput({ remixOfPostId: 'x'.repeat(81), mediaIds: ['asset-1'] }).valid, false);
});
