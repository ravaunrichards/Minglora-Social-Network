import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createMessengerRealtimeHub } from '../../backend/modules/messaging/realtime.js';
import {
  canAccessMessageGroup,
  canManageMessageGroup,
  getActiveMessageGroupMembers,
  normalizeMessageGroupMemberIds,
  normalizeMessageGroupName,
  summarizeGroupReadState,
  validateMessageGroupReaction
} from '../../backend/modules/messaging/service.js';

class FakeSocket extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.sent = []; this.written = ''; this.destroyed = false; }
  send(value) { this.sent.push(JSON.parse(value)); }
  ping() {}
  close() { if (this.readyState === 3) return; this.readyState = 3; this.emit('close'); }
  terminate() { this.close(); }
  write(value) { this.written += value; }
  destroy() { this.destroyed = true; }
}

function createCapturingHub(overrides = {}) {
  let connectedSocket = null;
  class CaptureServer extends EventEmitter {
    constructor() { super(); this.clients = new Set(); }
    handleUpgrade(_req, _socket, _head, callback) {
      connectedSocket = new FakeSocket();
      this.clients.add(connectedSocket);
      connectedSocket.on('close', () => this.clients.delete(connectedSocket));
      callback(connectedSocket);
    }
    close() { for (const socket of [...this.clients]) socket.close(); }
  }
  const hub = createMessengerRealtimeHub({
    WebSocketServer: CaptureServer,
    WebSocket: { OPEN: 1 },
    getUserFromRequest: () => ({ id: 'alice' }),
    isOriginAllowed: origin => origin === 'https://minglora.example',
    getPeerIds: userId => userId === 'alice' ? ['bob'] : ['alice'],
    getParticipantIds: (conversationId, senderId) => conversationId === 'bob' ? ['bob'] : ['bob','carol'],
    canMessage: (senderId, conversationId) => senderId === 'alice' && ['bob','group:one'].includes(conversationId),
    isBlocked: () => false,
    isPresenceEnabled: () => true,
    heartbeatMs: 60000,
    ...overrides
  });
  return { hub, get socket() { return connectedSocket; } };
}

test('Messenger realtime rejects unauthenticated and cross-origin websocket upgrades', () => {
  const unauthorized = createCapturingHub({ getUserFromRequest: () => null });
  const first = new FakeSocket();
  unauthorized.hub.handleUpgrade({ headers: { origin: 'https://minglora.example' } }, first, Buffer.alloc(0));
  assert.equal(first.destroyed, true);
  assert.match(first.written, /401 Unauthorized/);
  unauthorized.hub.close();

  const crossOrigin = createCapturingHub();
  const second = new FakeSocket();
  crossOrigin.hub.handleUpgrade({ headers: { origin: 'https://attacker.example' } }, second, Buffer.alloc(0));
  assert.equal(second.destroyed, true);
  assert.match(second.written, /403 Forbidden/);
  crossOrigin.hub.close();
});

test('Messenger realtime publishes message signals only to authenticated connected sessions', () => {
  const { hub, socket } = createCapturingHub();
  hub.handleUpgrade({ headers: { origin: 'https://minglora.example' } }, new FakeSocket(), Buffer.alloc(0));
  assert.equal(hub.isConnected('alice'), true);
  assert.equal(hub.publish(['alice'], { type: 'message:new', messageId: 'm1' }), 1);
  assert.ok(socket.sent.some(item => item.type === 'message:new' && item.messageId === 'm1'));
  hub.close();
});

test('Messenger realtime limits typing signals to authorized participants and expires them', async () => {
  const { hub, socket } = createCapturingHub();
  hub.handleUpgrade({ headers: { origin: 'https://minglora.example' } }, new FakeSocket(), Buffer.alloc(0));
  socket.emit('message', JSON.stringify({ type: 'typing', conversationId: 'bob', active: true }));
  assert.ok(socket.sent.some(item => item.type === 'ready'));
  // An unauthorized conversation is ignored.
  const before = socket.sent.length;
  socket.emit('message', JSON.stringify({ type: 'typing', conversationId: 'not-a-conversation', active: true }));
  assert.equal(socket.sent.length, before);
  hub.close();
});

test('Messenger group membership, moderation roles and read summaries are consistent', () => {
  const db = {
    messageGroups: [{ id: 'g1', status: 'active' }],
    messageGroupMembers: [
      { groupId: 'g1', userId: 'owner', status: 'active', role: 'owner' },
      { groupId: 'g1', userId: 'admin', status: 'active', role: 'admin' },
      { groupId: 'g1', userId: 'member', status: 'active', role: 'member' },
      { groupId: 'g1', userId: 'left', status: 'left', role: 'member' }
    ]
  };
  assert.deepEqual(getActiveMessageGroupMembers(db, 'g1'), ['owner','admin','member']);
  assert.equal(canAccessMessageGroup(db, 'g1', 'member'), true);
  assert.equal(canAccessMessageGroup(db, 'g1', 'left'), false);
  assert.equal(canManageMessageGroup(db, 'g1', 'admin'), true);
  assert.equal(canManageMessageGroup(db, 'g1', 'member'), false);
  assert.deepEqual(normalizeMessageGroupMemberIds(['member','member','admin'], 'owner'), ['owner','member','admin']);
  assert.equal(normalizeMessageGroupName('  Minglora   friends  '), 'Minglora friends');
  assert.deepEqual(summarizeGroupReadState({ from: 'owner', readBy: { admin: 't' } }, ['owner','admin','member']), {
    readCount: 1, total: 2, allRead: false
  });
  assert.equal(validateMessageGroupReaction('❤️'), '❤️');
  assert.equal(validateMessageGroupReaction('<script>'), null);
});
