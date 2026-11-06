/**
 * Authenticated, same-origin Messenger realtime transport.
 *
 * WebSocket events carry signals only. Messages and receipts are committed to
 * Minglora's durable store first; clients reload the authorized conversation
 * through the existing API after receiving a signal.
 */
export function createMessengerRealtimeHub({
  WebSocketServer,
  WebSocket,
  getUserFromRequest,
  isOriginAllowed,
  getPeerIds,
  getParticipantIds,
  canMessage,
  isBlocked,
  isPresenceEnabled,
  now = () => new Date().toISOString(),
  heartbeatMs = 30000,
  typingTtlMs = 4200,
  maxConnectionsPerUser = 5
} = {}) {
  if (typeof WebSocketServer !== 'function'
    || typeof getUserFromRequest !== 'function'
    || typeof isOriginAllowed !== 'function'
    || typeof getPeerIds !== 'function'
    || typeof getParticipantIds !== 'function'
    || typeof canMessage !== 'function'
    || typeof isBlocked !== 'function'
    || typeof isPresenceEnabled !== 'function') {
    throw new TypeError('Messenger realtime requires an authenticated WebSocket server and authorization callbacks.');
  }

  const OPEN = Number(WebSocket?.OPEN ?? 1);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const socketsByUser = new Map();
  const typingTimers = new Map();
  const typingLastSent = new Map();

  function send(socket, payload) {
    if (!socket || socket.readyState !== OPEN) return false;
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function sendUser(userId, payload) {
    const sockets = socketsByUser.get(String(userId || ''));
    if (!sockets?.size) return 0;
    let sent = 0;
    for (const socket of sockets) if (send(socket, payload)) sent += 1;
    return sent;
  }

  function participantIds(conversationId, senderId) {
    const ids = getParticipantIds(String(conversationId || ''), String(senderId || ''));
    return [...new Set((Array.isArray(ids) ? ids : [])
      .map(value => String(value || ''))
      .filter(value => value && value !== String(senderId || '')
        && !isBlocked(String(senderId || ''), value)))];
  }

  function stopTyping(userId, conversationId) {
    const key = String(userId) + ':' + String(conversationId);
    const timer = typingTimers.get(key);
    if (timer) clearTimeout(timer);
    typingTimers.delete(key);
    typingLastSent.delete(key);
    for (const peerId of participantIds(conversationId, userId)) {
      sendUser(peerId, { type: 'typing', userId: String(userId), conversationId: String(conversationId), active: false });
    }
  }

  function announcePresence(userId, connected) {
    const id = String(userId || '');
    if (!id) return;
    const online = Boolean(connected && isPresenceEnabled(id));
    for (const peerId of getPeerIds(id) || []) {
      const peer = String(peerId || '');
      if (!peer || peer === id || isBlocked(id, peer)) continue;
      sendUser(peer, { type: 'presence', userId: id, online });
    }
  }

  function refreshPresence(userId) {
    const id = String(userId || '');
    announcePresence(id, Boolean(socketsByUser.get(id)?.size));
  }

  function publish(userIds, payload) {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds])
      .map(value => String(value || '')).filter(Boolean))];
    let delivered = 0;
    for (const id of ids) delivered += sendUser(id, payload);
    return delivered;
  }

  function reject(socket, status, label) {
    try {
      socket.write('HTTP/1.1 ' + status + ' ' + label + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    } catch {}
    socket.destroy();
    return true;
  }

  function handleUpgrade(req, socket, head) {
    const origin = String(req?.headers?.origin || '');
    if (!origin || !isOriginAllowed(origin, req)
      || String(req?.headers?.['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
      return reject(socket, 403, 'Forbidden');
    }

    const user = getUserFromRequest(req);
    const userId = String(user?.id || '');
    if (!userId) return reject(socket, 401, 'Unauthorized');

    if ((socketsByUser.get(userId)?.size || 0) >= maxConnectionsPerUser) {
      return reject(socket, 429, 'Too Many Connections');
    }

    try {
      wss.handleUpgrade(req, socket, head, webSocket => {
        wss.emit('connection', webSocket, req, user);
      });
      return true;
    } catch {
      return reject(socket, 400, 'Bad Request');
    }
  }

  wss.on('connection', (socket, _req, user) => {
    const userId = String(user?.id || '');
    if (!userId) {
      socket.close(1008, 'Authentication required');
      return;
    }

    let sockets = socketsByUser.get(userId);
    const firstConnection = !sockets?.size;
    if (!sockets) {
      sockets = new Set();
      socketsByUser.set(userId, sockets);
    }
    sockets.add(socket);
    socket.isAlive = true;
    socket.typingConversations = new Set();
    socket.on('pong', () => { socket.isAlive = true; });

    send(socket, { type: 'ready', connectedAt: now() });

    // Presence is scoped to people with an existing Messenger conversation.
    for (const peerId of getPeerIds(userId) || []) {
      const peer = String(peerId || '');
      if (!peer || peer === userId || isBlocked(userId, peer)) continue;
      send(socket, {
        type: 'presence',
        userId: peer,
        online: Boolean(socketsByUser.get(peer)?.size && isPresenceEnabled(peer))
      });
    }
    if (firstConnection) announcePresence(userId, true);

    socket.on('message', data => {
      let input;
      try {
        const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data || '');
        if (raw.length > 2048) return;
        input = JSON.parse(raw);
      } catch {
        return;
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return;

      if (input.type === 'presence_refresh') {
        refreshPresence(userId);
        return;
      }

      if (input.type !== 'typing') return;
      const conversationId = String(input.conversationId || input.peerId || '').trim().slice(0, 100);
      if (!conversationId || !canMessage(userId, conversationId)) return;

      const key = userId + ':' + conversationId;
      if (input.active !== true) {
        socket.typingConversations.delete(conversationId);
        stopTyping(userId, conversationId);
        return;
      }

      socket.typingConversations.add(conversationId);
      const lastSent = Number(typingLastSent.get(key) || 0);
      const current = Date.now();
      if (current - lastSent >= 500) {
        for (const peerId of participantIds(conversationId, userId)) {
          sendUser(peerId, { type: 'typing', userId, conversationId, active: true });
        }
        typingLastSent.set(key, current);
      }

      const previous = typingTimers.get(key);
      if (previous) clearTimeout(previous);
      const timer = setTimeout(() => {
        stopTyping(userId, conversationId);
      }, typingTtlMs);
      timer.unref?.();
      typingTimers.set(key, timer);
    });

    socket.on('close', () => {
      for (const conversationId of socket.typingConversations || []) stopTyping(userId, conversationId);
      const current = socketsByUser.get(userId);
      current?.delete(socket);
      if (current && current.size === 0) {
        socketsByUser.delete(userId);
        announcePresence(userId, false);
      }
    });

    socket.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients || []) {
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      try { socket.ping(); } catch { socket.terminate(); }
    }
  }, heartbeatMs);
  heartbeat.unref?.();

  function close() {
    clearInterval(heartbeat);
    for (const timer of typingTimers.values()) clearTimeout(timer);
    typingTimers.clear();
    typingLastSent.clear();
    for (const socket of wss.clients || []) {
      try { socket.close(1001, 'Server shutting down'); } catch {}
    }
    wss.close();
    socketsByUser.clear();
  }

  return {
    handleUpgrade,
    publish,
    refreshPresence,
    isConnected: userId => Boolean(socketsByUser.get(String(userId || ''))?.size),
    close
  };
}
