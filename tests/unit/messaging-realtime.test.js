import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createMessengerRealtimeHub } from '../../backend/modules/messaging/realtime.js';

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
    this.written = '';
    this.destroyed = false;
  }
  send(value) { this.sent.push(JSON.parse(value)); }
  ping() {}
  close() {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.emit('close');
  }
  terminate() { this.close(); }
  write(value) { this.written += value; }
  destroy() { this.destroyed = true; this.readyState = 3; }
  receive(payload) { this.emit('message', Buffer.from(JSON.stringify(payload))); }
}

class FakeWebSocketServer extends EventEmitter {
  static latest;
  constructor() {
    super();
    this.clients = new Set();
    FakeWebSocketServer.latest = this;
  }
  handleUpgrade(req, socket, head, callback) {
    const webSocket = new FakeSocket();
    this.clients.add(webSocket);
    webSocket.on('close', () => this.clients.delete(webSocket));
    callback(webSocket);
  }
  close() {
    for (const socket of [...this.clients]) socket.close();
  }
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function createHub(options = {}) {
  const users = new Map(['alice', 'bob', 'carol'].map(id => [id, { id }]));
  const hub = createMessengerRealtimeHub({
    WebSocketServer: FakeWebSocketServer,
    WebSocket: { OPEN: 1 },
    getUserFromRequest: req => users.get(req.headers['x-user']) || null,
    isOriginAllowed: origin => origin === 'https://minglora.example',
    getPeerIds: id => id === 'alice' ? ['bob', 'carol'] : id === 'bob' ? ['alice', 'carol'] : ['alice', 'bob'],
    getParticipantIds: (conversationId, senderId) => {
      if (conversationId === 'bob' && senderId === 'alice') return ['alice', 'bob'];
      if (conversationId === 'group:g1' && ['alice', 'bob', 'carol'].includes(senderId)) return ['alice', 'bob', 'carol'];
      return [];
    },
    canMessage: (senderId, conversationId) =>
      (senderId === 'alice' && conversationId === 'bob')
      || (conversationId === 'group:g1' && ['alice', 'bob', 'carol'].includes(senderId)),
    isBlocked: (first, second) => [first, second].sort().join(':') === 'alice:carol',
    isPresenceEnabled: () => true,
    heartbeatMs: 60000,
    typingTtlMs: 100,
    ...options
  });
  function connect(userId) {
    const rawSocket = new FakeSocket();
    hub.handleUpgrade({
      headers: {
        origin: 'https://minglora.example',
        'x-user': userId,
        'sec-fetch-site': 'same-origin'
      }
    }, rawSocket, Buffer.alloc(0));
    const connected = [...FakeWebSocketServer.latest.clients].at(-1);
    return { rawSocket, socket: connected };
  }
  return { hub, connect };
}

test('Messenger realtime rejects missing or disallowed origins and unauthenticated upgrades', () => {
  const { hub } = createHub();
  const noOrigin = new FakeSocket();
  hub.handleUpgrade({ headers: { 'x-user': 'alice' } }, noOrigin, Buffer.alloc(0));
  assert.equal(noOrigin.destroyed, true);
  assert.match(noOrigin.written, /403 Forbidden/);

  const wrongOrigin = new FakeSocket();
  hub.handleUpgrade({ headers: { origin: 'https://evil.example', 'x-user': 'alice' } }, wrongOrigin, Buffer.alloc(0));
  assert.equal(wrongOrigin.destroyed, true);

  const anonymous = new FakeSocket();
  hub.handleUpgrade({ headers: { origin: 'https://minglora.example' } }, anonymous, Buffer.alloc(0));
  assert.match(anonymous.written, /401 Unauthorized/);
  hub.close();
});

test('Messenger realtime publishes events only to connected account sessions', () => {
  const { hub, connect } = createHub();
  const alice = connect('alice');
  assert.equal(hub.isConnected('alice'), true);
  assert.equal(hub.publish(['alice', 'bob'], { type: 'message:new', messageId: 'm-1' }), 1);
  assert.deepEqual(alice.socket.sent.at(-1), { type: 'message:new', messageId: 'm-1' });
  assert.equal(hub.isConnected('bob'), false);
  hub.close();
});

test('Messenger presence is limited to conversation peers and disappears after the final device disconnects', () => {
  const { hub, connect } = createHub();
  const alice = connect('alice');
  const bob = connect('bob');
  assert.equal(alice.socket.sent.some(item => item.type === 'presence' && item.userId === 'bob' && item.online), true);
  assert.equal(bob.socket.sent.some(item => item.type === 'presence' && item.userId === 'alice' && item.online), true);

  const bobSecondDevice = connect('bob');
  bob.socket.close();
  assert.equal(alice.socket.sent.some(item => item.type === 'presence' && item.userId === 'bob' && item.online === false), false);
  bobSecondDevice.socket.close();
  assert.equal(alice.socket.sent.some(item => item.type === 'presence' && item.userId === 'bob' && item.online === false), true);
  // A blocked relationship never receives presence broadcasts.
  const carol = connect('carol');
  assert.equal(carol.socket.sent.some(item => item.type === 'presence' && item.userId === 'alice'), false);
  hub.close();
});

test('Messenger typing events require conversation membership and automatically expire', async () => {
  const { hub, connect } = createHub();
  const alice = connect('alice');
  const bob = connect('bob');
  const before = bob.socket.sent.length;

  alice.socket.receive({ type: 'typing', conversationId: 'not-a-conversation', active: true });
  assert.equal(bob.socket.sent.length, before);

  alice.socket.receive({ type: 'typing', conversationId: 'bob', active: true });
  assert.equal(bob.socket.sent.at(-1).type, 'typing');
  assert.equal(bob.socket.sent.at(-1).active, true);
  await delay(160);
  assert.equal(bob.socket.sent.at(-1).active, false);
  hub.close();
});

test('Typing in one device remains active until the last typing device disconnects', () => {
  const { hub, connect } = createHub();
  const aliceFirst = connect('alice');
  const bob = connect('bob');
  const aliceSecond = connect('alice');

  aliceFirst.socket.receive({ type: 'typing', conversationId: 'bob', active: true });
  aliceSecond.socket.receive({ type: 'typing', conversationId: 'bob', active: true });
  aliceFirst.socket.close();
  assert.equal(bob.socket.sent.some(item => item.type === 'typing' && item.active === false), false);

  aliceSecond.socket.close();
  assert.equal(bob.socket.sent.some(item => item.type === 'typing' && item.active === false), true);
  hub.close();
});

test('Messenger realtime enforces a per-account connection limit', () => {
  const { hub, connect } = createHub({ maxConnectionsPerUser: 1 });
  const first = connect('alice');
  const secondRaw = new FakeSocket();
  hub.handleUpgrade({
    headers: { origin: 'https://minglora.example', 'x-user': 'alice' }
  }, secondRaw, Buffer.alloc(0));
  assert.match(secondRaw.written, /429 Too Many Connections/);
  first.socket.close();
  hub.close();
});

test('Messenger realtime closes sockets after the authenticated application session is revoked', async () => {
  let authenticated = true;
  const { hub, connect } = createHub({
    heartbeatMs: 20,
    getUserFromRequest: req => authenticated ? { id: req.headers['x-user'] } : null
  });
  const alice = connect('alice');
  assert.equal(alice.socket.readyState, 1);
  authenticated = false;
  await delay(65);
  assert.equal(alice.socket.readyState, 3);
  assert.equal(hub.isConnected('alice'), false);
  hub.close();
});
