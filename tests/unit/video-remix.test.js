import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateVideoRemixRequest } from '../../src/domain/video-remix.js';

const source = (extra = {}) => ({
  id: 'source-video',
  userId: 'creator-a',
  allowRemix: true,
  ...extra
});

test('ordinary video creation defaults remix permission to off', () => {
  const result = validateVideoRemixRequest({}, {
    findSource: () => null,
    canViewSource: () => false
  });
  assert.deepEqual(result, {
    valid: true,
    allowRemix: false,
    remixSourcePostId: null,
    remixType: null
  });
});

test('video owner can explicitly enable or disable future responses', () => {
  const enabled = validateVideoRemixRequest({ allowRemix: true });
  const disabled = validateVideoRemixRequest({ allowRemix: false });
  assert.equal(enabled.valid, true);
  assert.equal(enabled.allowRemix, true);
  assert.equal(disabled.valid, true);
  assert.equal(disabled.allowRemix, false);
});

test('remix permission rejects non-boolean values instead of coercing them', () => {
  for (const allowRemix of ['true', 1, null, {}]) {
    const result = validateVideoRemixRequest({ allowRemix });
    assert.equal(result.valid, false);
    assert.equal(result.status, 400);
  }
});

test('response attribution requires an explicitly enabled, viewer-accessible source', () => {
  const original = source();
  const result = validateVideoRemixRequest({
    remixSourcePostId: original.id,
    remixType: 'response',
    allowRemix: true
  }, {
    findSource: id => id === original.id ? original : null,
    canViewSource: candidate => candidate.id === original.id
  });
  assert.deepEqual(result, {
    valid: true,
    allowRemix: true,
    remixSourcePostId: 'source-video',
    remixType: 'response'
  });
});

test('private, blocked, hidden or non-consenting source videos cannot be referenced', () => {
  for (const original of [
    null,
    source({ allowRemix: false }),
    source({ status: 'hidden' }),
    source({ audience: 'private' })
  ]) {
    const result = validateVideoRemixRequest({
      remixSourcePostId: 'source-video',
      remixType: 'response'
    }, {
      findSource: () => original,
      canViewSource: candidate => Boolean(candidate && candidate.status !== 'hidden' && candidate.audience !== 'private')
    });
    assert.equal(result.valid, false);
    assert.equal(result.status, 404);
  }
});

test('response mode cannot be supplied without a source or with another mode', () => {
  const missing = validateVideoRemixRequest({ remixType: 'response' });
  const unsupported = validateVideoRemixRequest({
    remixSourcePostId: 'source-video',
    remixType: 'duet'
  }, {
    findSource: () => source(),
    canViewSource: () => true
  });
  assert.equal(missing.valid, false);
  assert.equal(missing.status, 400);
  assert.equal(unsupported.valid, false);
  assert.equal(unsupported.status, 400);
});

test('Creator Studio and video surfaces expose permission controls and response attribution', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

  assert.match(server, /validateVideoRemixRequest/);
  assert.match(server, /isVisibleVideoPost\(user\.id,source\)/);
  assert.match(server, /remixSourcePostId/);
  assert.match(server, /post\.allowRemix=nextAllowRemix/);
  assert.match(app, /data-post-action=\"toggle-remix\"/);
  assert.match(app, /data-video-response/);
  assert.match(app, /remixSourcePostId:options\.remixSource\.id/);
  assert.match(index, /video-remix\.css/);
  assert.match(worker, /video-remix\.css/);
});
