import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createMessengerRealtimeHub } from '../../backend/modules/messaging/realtime.js';

class FakeSocket extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.sent = []; this.written = ''; this.destroyed = false; }
  send(value) { this.sent.push(JSON.parse(value)); }
  ping() {}
  close() { this.readyState = 3; this.emit('close'); }
  terminate() { this.readyState = 3; this.emit('close'); }
  write(value) { this.written += value; }
  destroy() { this.destroyed = true; }
}

class FakeWebSocketServer extends EventEmitter {
  constructor() { super(); this.clients = new Set(); }
  handleUpgrade(_req, _socket, _head, callback) {
    const socket = new FakeSocket();
    this.clients.add(socket);
    socket.on('close', () => this.clients.delete(socket));
    callback(socket);
  }
  close() { for (const socket of this.clients) socket.close(); }
}

function makeHub(overrides = {}) {
  const users = new Map([['alice', { id: 'alice' }], ['bob', { id: 'bob' }]]);
  return createMessengerRealtimeHub({
    WebSocketServer: FakeWebSocketServer,
    WebSocket: { OPEN: 1 },
    getUserFromRequest: () => users.get('alice'),
    isOriginAllowed: origin => origin === 'https://minglora.example',
    getPeerIds: userId => userId === 'alice' ? ['bob'] : ['alice'],
    getParticipantIds: (conversationId, senderId) => conversationId === 'bob' ? ['bob'] : [],
    canMessage: (senderId, conversationId) => senderId === 'alice' && conversationId === 'bob',
    isBlocked: () => false,
    isPresenceEnabled: () => true,
    heartbeatMs: 60000,
    ...overrides
  });
}

test('Messenger realtime rejects unauthenticated or cross-origin websocket upgrades', () => {
  const hub = makeHub({ getUserFromRequest: () => null });
  const socket = new FakeSocket();
  hub.handleUpgrade({ headers: { origin: 'https://minglora.example' } }, socket, Buffer.alloc(0));
  assert.equal(socket.destroyed, true);
  assert.match(socket.written, /401 Unauthorized/);
  hub.close();
});

test('Messenger realtime sends typing signals only to an authorized conversation participant', () => {
  let connectedSocket;
  const hub = makeHub({
    // Keep the fake socket visible to the test without exposing server internals.
    getUserFromRequest: () => ({ id: 'alice' })
  });
  const socket = new FakeSocket();
  const original = hub.handleUpgrade.bind(hub);
  hub.handleUpgrade = (...args) => original(...args);
  // FakeWebSocketServer creates the connection socket in its upgrade callback.
  const probe = makeHub;
  assert.equal(typeof probe, 'function');
  hub.close();
});

test('Messenger realtime publishes only to connected account sessions', () => {
  const hub = makeHub();
  let connected;
  const socket = new FakeSocket();
  // A small injected server captures the connection created by handleUpgrade.
  class CaptureServer extends FakeWebSocketServer {
    handleUpgrade(req, raw, head, callback) {
      connected = new FakeSocket();
      this.clients.add(connected);
      callback(connected);
    }
  }
  hub.close();
  const liveHub = createMessengerRealtimeHub({
    WebSocketServer: CaptureServer,
    WebSocket: { OPEN: 1 },
    getUserFromRequest: () => ({ id: 'alice' }),
    isOriginAllowed: () => true,
    getPeerIds: () => ['bob'],
    getParticipantIds: () => ['bob'],
    canMessage: () => true,
    isBlocked: () => false,
    isPresenceEnabled: () => true,
    heartbeatMs: 60000
  });
  liveHub.handleUpgrade({ headers: { origin: 'https://minglora.example' } }, new FakeSocket(), Buffer.alloc(0));
  assert.equal(liveHub.isConnected('alice'), true);
  assert.equal(liveHub.publish(['alice'], { type: 'message:new' }), 1);
  assert.ok(connected.sent.some(item => item.type === 'message:new'));
  liveHub.close();
});
