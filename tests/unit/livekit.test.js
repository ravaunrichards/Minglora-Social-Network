import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveKitToken, isLiveKitConfigured } from '../../backend/modules/live/livekit.js';

function restoreEnv(original) {
  if (original.url === undefined) delete process.env.LIVEKIT_URL; else process.env.LIVEKIT_URL = original.url;
  if (original.key === undefined) delete process.env.LIVEKIT_API_KEY; else process.env.LIVEKIT_API_KEY = original.key;
  if (original.secret === undefined) delete process.env.LIVEKIT_API_SECRET; else process.env.LIVEKIT_API_SECRET = original.secret;
}

test('LiveKit remains disabled until all Minglora credentials are configured', () => {
  const original = { url: process.env.LIVEKIT_URL, key: process.env.LIVEKIT_API_KEY, secret: process.env.LIVEKIT_API_SECRET };
  delete process.env.LIVEKIT_URL;
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
  try {
    assert.equal(isLiveKitConfigured(), false);
  } finally {
    restoreEnv(original);
  }
});

test('LiveKit signs a host token with publishing permissions using server-only credentials', async () => {
  const original = { url: process.env.LIVEKIT_URL, key: process.env.LIVEKIT_API_KEY, secret: process.env.LIVEKIT_API_SECRET };
  process.env.LIVEKIT_URL = 'wss://minglora-test.livekit.cloud';
  process.env.LIVEKIT_API_KEY = 'APIxxxxxxxxxxxx';
  process.env.LIVEKIT_API_SECRET = 'test-secret-that-is-only-used-by-this-unit-test';
  try {
    const result = await createLiveKitToken({ identity: 'user-test', name: 'Minglora Test', roomName: 'minglora-test-room', canPublish: true });
    const payload = JSON.parse(Buffer.from(result.token.split('.')[1], 'base64url').toString('utf8'));
    assert.equal(result.url, 'wss://minglora-test.livekit.cloud');
    assert.equal(payload.sub, 'user-test');
    assert.equal(payload.video.room, 'minglora-test-room');
    assert.equal(payload.video.roomJoin, true);
    assert.equal(payload.video.canPublish, true);
    assert.equal(payload.video.canSubscribe, true);
  } finally {
    restoreEnv(original);
  }
});

test('LiveKit viewer tokens can subscribe but cannot publish audio, video or data', async () => {
  const original = { url: process.env.LIVEKIT_URL, key: process.env.LIVEKIT_API_KEY, secret: process.env.LIVEKIT_API_SECRET };
  process.env.LIVEKIT_URL = 'wss://minglora-test.livekit.cloud';
  process.env.LIVEKIT_API_KEY = 'APIxxxxxxxxxxxx';
  process.env.LIVEKIT_API_SECRET = 'test-secret-that-is-only-used-by-this-unit-test';
  try {
    const result = await createLiveKitToken({ identity: 'viewer-test', name: 'Viewer Test', roomName: 'minglora-test-room', canPublish: false });
    const payload = JSON.parse(Buffer.from(result.token.split('.')[1], 'base64url').toString('utf8'));
    assert.equal(payload.video.canPublish, false);
    assert.equal(payload.video.canSubscribe, true);
    assert.equal(payload.video.canPublishData, false);
  } finally {
    restoreEnv(original);
  }
});
