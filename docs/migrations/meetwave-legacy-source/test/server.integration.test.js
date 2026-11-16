'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { server, rooms } = require('../server');
const { WebSocket } = require('ws');

function waitForMessage(socket, type, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for WebSocket message: ${type}`));
    }, timeoutMs);

    function onMessage(raw) {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type !== type) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(message);
    }

    socket.on('message', onMessage);
  });
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

test('health, room validation, room presence and chat work end-to-end', async (t) => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const wsUrl = `ws://127.0.0.1:${address.port}`;
  const clients = [];

  t.after(async () => {
    for (const socket of clients) {
      if (socket.readyState === WebSocket.OPEN) {
        await new Promise((resolve) => {
          socket.once('close', resolve);
          socket.close();
        });
      }
    }
    rooms.clear();
    await new Promise((resolve) => server.close(resolve));
  });

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.ok, true);
  assert.equal(health.service, 'MeetWave');

  const invalidRoom = await fetch(`${baseUrl}/api/room/INVALID%21`);
  assert.equal(invalidRoom.status, 400);

  const first = await openSocket(wsUrl);
  clients.push(first);
  const firstJoinedWait = waitForMessage(first, 'joined');
  first.send(JSON.stringify({ type: 'join', roomId: 'SYNC-TEST', name: 'First' }));
  const firstJoined = await firstJoinedWait;
  assert.equal(firstJoined.roomId, 'SYNC-TEST');

  const second = await openSocket(wsUrl);
  clients.push(second);
  const secondJoinedWait = waitForMessage(second, 'joined');
  const peerJoinedWait = waitForMessage(first, 'peer-joined');
  second.send(JSON.stringify({ type: 'join', roomId: 'SYNC-TEST', name: 'Second' }));

  const [secondJoined, peerJoined] = await Promise.all([
    secondJoinedWait,
    peerJoinedWait
  ]);
  assert.equal(secondJoined.peers.length, 1);
  assert.equal(peerJoined.peer.name, 'Second');

  const chatWait = waitForMessage(second, 'chat');
  first.send(JSON.stringify({ type: 'chat', text: 'synchronization test' }));
  const chat = await chatWait;
  assert.equal(chat.text, 'synchronization test');
  assert.equal(chat.name, 'First');

  const roomResponse = await fetch(`${baseUrl}/api/room/SYNC-TEST`);
  assert.equal(roomResponse.status, 200);
  const room = await roomResponse.json();
  assert.equal(room.participants, 2);
});
