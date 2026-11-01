'use strict';
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'MeetWave', rooms: rooms.size }));
app.get('/api/room/:roomId', (req, res) => {
  const roomId = String(req.params.roomId || '').toUpperCase();
  if (!/^[A-Z0-9-]{3,40}$/.test(roomId)) return res.status(400).json({ error: 'Invalid room ID' });
  res.json({ roomId, participants: rooms.get(roomId)?.size || 0 });
});
function send(ws, data) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function broadcast(room, data, except) { for (const peer of room.values()) if (peer !== except) send(peer, data); }
wss.on('connection', ws => {
  ws.id = crypto.randomUUID(); ws.roomId = null; ws.displayName = 'Guest';
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return send(ws, { type: 'error', message: 'Invalid message format.' }); }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'join') {
      if (ws.roomId) return send(ws, { type: 'error', message: 'You already joined a room.' });
      const roomId = String(msg.roomId || '').toUpperCase().trim();
      const name = String(msg.name || '').trim().slice(0, 40);
      if (!/^[A-Z0-9-]{3,40}$/.test(roomId) || !name) return send(ws, { type: 'error', message: 'Enter a valid room ID and display name.' });
      let room = rooms.get(roomId); if (!room) { room = new Map(); rooms.set(roomId, room); }
      if (room.size >= 8) return send(ws, { type: 'error', message: 'This starter supports up to 8 participants per room.' });
      ws.roomId = roomId; ws.displayName = name; room.set(ws.id, ws);
      send(ws, { type: 'joined', id: ws.id, roomId, peers: [...room.values()].filter(p => p !== ws).map(p => ({ id: p.id, name: p.displayName })) });
      broadcast(room, { type: 'peer-joined', peer: { id: ws.id, name: ws.displayName } }, ws);
      broadcast(room, { type: 'participants', participants: [...room.values()].map(p => ({ id: p.id, name: p.displayName })) });
      return;
    }
    if (!ws.roomId) return send(ws, { type: 'error', message: 'Join a meeting first.' });
    const room = rooms.get(ws.roomId); if (!room) return;
    if (msg.type === 'signal') {
      const target = room.get(String(msg.to || ''));
      if (!target || typeof msg.data !== 'object' || msg.data === null) return;
      return send(target, { type: 'signal', from: ws.id, data: msg.data });
    }
    if (msg.type === 'chat') {
      const text = String(msg.text || '').trim().slice(0, 1000); if (!text) return;
      return broadcast(room, { type: 'chat', id: ws.id, name: ws.displayName, text, at: Date.now() });
    }
    if (msg.type === 'media-state') {
      return broadcast(room, { type: 'media-state', id: ws.id, audio: !!msg.audio, video: !!msg.video }, ws);
    }
  });
  ws.on('close', () => {
    if (!ws.roomId) return;
    const room = rooms.get(ws.roomId); if (!room) return;
    room.delete(ws.id); broadcast(room, { type: 'peer-left', id: ws.id });
    broadcast(room, { type: 'participants', participants: [...room.values()].map(p => ({ id: p.id, name: p.displayName })) });
    if (!room.size) rooms.delete(ws.roomId);
  });
});
if (require.main === module) {
  server.listen(PORT, () => console.log(`MeetWave listening on http://localhost:${PORT}`));
}
module.exports = { app, server, rooms };
