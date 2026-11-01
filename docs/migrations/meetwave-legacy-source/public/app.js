'use strict';
const $ = id => document.getElementById(id);
let ws, localStream, screenStream, myId, roomId, myName, audioOn = true, videoOn = true, peers = new Map(), chatOpen = false;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
function toast(message) { const el = $('toast'); el.textContent = message; el.classList.remove('hidden'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add('hidden'), 3500); }
function send(data) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function status(s) { $('meetingStatus').textContent = s; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function makeId() { return 'TEAM-' + Math.random().toString(36).slice(2, 7).toUpperCase(); }
$('newRoom').addEventListener('click', () => { $('roomId').value = makeId(); $('displayName').focus(); });
$('copyInvite').addEventListener('click', async () => { const url = location.origin + '/?room=' + encodeURIComponent(roomId); try { await navigator.clipboard.writeText(url); toast('Meeting invite copied.'); } catch { toast('Room code: ' + roomId); } });
$('joinForm').addEventListener('submit', async e => { e.preventDefault(); myName = $('displayName').value.trim().slice(0, 40); roomId = $('roomId').value.trim().toUpperCase(); if (!myName || !/^[A-Z0-9-]{3,40}$/.test(roomId)) return toast('Enter a name and a valid room code.');
  try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); } catch (err) { try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); toast('Camera unavailable; joining with microphone only.'); } catch { localStream = null; toast('Camera and microphone unavailable. You can still join and chat.'); } }
  $('localNameTag').textContent = myName + ' (You)'; $('localPlaceholder').querySelector('.avatar').textContent = myName.charAt(0).toUpperCase(); $('localVideo').srcObject = localStream; $('localPlaceholder').classList.toggle('hidden', !!(localStream && localStream.getVideoTracks().some(t => t.enabled))); $('lobby').classList.add('hidden'); $('meeting').classList.remove('hidden'); $('copyInvite').classList.remove('hidden'); $('meetingTitle').textContent = 'Room ' + roomId; $('roomCodeBadge').textContent = roomId;
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'; ws = new WebSocket(scheme + '//' + location.host); ws.onopen = () => send({ type: 'join', roomId, name: myName }); ws.onmessage = ev => { let msg; try { msg = JSON.parse(ev.data); } catch { return; } handleMessage(msg); }; ws.onclose = () => status('Disconnected from meeting server. Refresh to reconnect.'); ws.onerror = () => status('Unable to connect to meeting server.');
});
async function handleMessage(m) {
  if (m.type === 'error') return toast(m.message || 'Meeting error');
  if (m.type === 'joined') { myId = m.id; status('Connected. Share the room code with others to invite them.'); for (const p of m.peers) await createPeer(p.id, p.name, true); }
  if (m.type === 'peer-joined') { toast(m.peer.name + ' joined the meeting.'); }
  if (m.type === 'participants') { $('participantCount').textContent = m.participants.length + (m.participants.length === 1 ? ' participant' : ' participants'); }
  if (m.type === 'signal') await onSignal(m.from, m.data);
  if (m.type === 'peer-left') { removePeer(m.id); }
  if (m.type === 'chat') appendChat(m.name, m.text, m.id === myId, m.at);
  if (m.type === 'media-state') { const p = peers.get(m.id); if (p) { p.audio = m.audio; p.video = m.video; const tag = p.tile?.querySelector('.name-tag'); if (tag) tag.textContent = p.name + (m.audio ? '' : ' · muted'); } }
}
async function createPeer(id, name, initiator) {
  if (peers.has(id)) return peers.get(id);
  const pc = new RTCPeerConnection(config); const p = { pc, name, id, audio: true, video: true, tile: null }; peers.set(id, p);
  if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  pc.onicecandidate = e => { if (e.candidate) send({ type: 'signal', to: id, data: { candidate: e.candidate } }); };
  pc.ontrack = e => { if (!p.tile) p.tile = createTile(id, name); const video = p.tile.querySelector('video'); if (video.srcObject !== e.streams[0]) video.srcObject = e.streams[0]; p.tile.querySelector('.video-placeholder').classList.add('hidden'); };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') status('A peer connection failed. A TURN server may be required on restrictive networks.'); };
  if (initiator) { const offer = await pc.createOffer(); await pc.setLocalDescription(offer); send({ type: 'signal', to: id, data: { description: pc.localDescription } }); }
  return p;
}
function createTile(id, name) { const tile = document.createElement('div'); tile.className = 'video-tile'; tile.dataset.peer = id; const video = document.createElement('video'); video.autoplay = true; video.playsInline = true; const placeholder = document.createElement('div'); placeholder.className = 'video-placeholder'; placeholder.innerHTML = '<span class="avatar">' + escapeHtml(name.charAt(0).toUpperCase()) + '</span><span>Camera off or connecting</span>'; const tag = document.createElement('span'); tag.className = 'name-tag'; tag.textContent = name; tile.append(video, placeholder, tag); $('videoGrid').appendChild(tile); return tile; }
async function onSignal(from, data) { const p = await createPeer(from, 'Participant', false); const pc = p.pc; try { if (data.description) { await pc.setRemoteDescription(data.description); if (data.description.type === 'offer') { const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); send({ type: 'signal', to: from, data: { description: pc.localDescription } }); } } else if (data.candidate) { await pc.addIceCandidate(data.candidate); } } catch (e) { console.warn('WebRTC signal error', e); } }
function removePeer(id) { const p = peers.get(id); if (!p) return; p.pc.close(); if (p.tile) p.tile.remove(); peers.delete(id); }
$('toggleMic').addEventListener('click', () => { audioOn = !audioOn; if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = audioOn); $('toggleMic').classList.toggle('off', !audioOn); $('toggleMic').querySelector('small').textContent = audioOn ? 'Mute' : 'Unmute'; send({ type: 'media-state', audio: audioOn, video: videoOn }); });
$('toggleCamera').addEventListener('click', () => { videoOn = !videoOn; if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = videoOn); $('localPlaceholder').classList.toggle('hidden', videoOn && !!localStream?.getVideoTracks().length); $('toggleCamera').classList.toggle('off', !videoOn); $('toggleCamera').querySelector('small').textContent = videoOn ? 'Stop video' : 'Start video'; send({ type: 'media-state', audio: audioOn, video: videoOn }); });
$('shareScreen').addEventListener('click', async () => { if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; $('shareScreen').querySelector('small').textContent = 'Share screen'; toast('Screen sharing stopped.'); return; } try { screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true }); const track = screenStream.getVideoTracks()[0]; for (const p of peers.values()) { const sender = p.pc.getSenders().find(s => s.track?.kind === 'video'); if (sender) await sender.replaceTrack(track); } $('localVideo').srcObject = screenStream; $('shareScreen').querySelector('small').textContent = 'Stop sharing'; track.onended = () => { screenStream = null; $('localVideo').srcObject = localStream; $('shareScreen').querySelector('small').textContent = 'Share screen'; for (const p of peers.values()) { const sender = p.pc.getSenders().find(s => s.track?.kind === 'video'); const cam = localStream?.getVideoTracks()[0]; if (sender && cam) sender.replaceTrack(cam); } }; } catch { toast('Screen sharing was cancelled or is unavailable.'); } });
function setChat(open) { chatOpen = open; $('chatPanel').classList.toggle('hidden', !open); }
$('toggleChat').addEventListener('click', () => setChat(!chatOpen)); $('closeChat').addEventListener('click', () => setChat(false));
$('chatForm').addEventListener('submit', e => { e.preventDefault(); const input = $('chatInput'); const text = input.value.trim(); if (!text) return; send({ type: 'chat', text }); input.value = ''; });
function appendChat(name, text, self, at) { const empty = $('chatMessages').querySelector('.empty-chat'); if (empty) empty.remove(); const el = document.createElement('div'); el.className = 'message' + (self ? ' self' : ''); const strong = document.createElement('strong'); strong.textContent = name + (self ? ' (You)' : ''); const body = document.createElement('span'); body.textContent = text; el.append(strong, body); $('chatMessages').appendChild(el); $('chatMessages').scrollTop = $('chatMessages').scrollHeight; }
$('leaveMeeting').addEventListener('click', () => { if (ws) ws.close(); peers.forEach(p => p.pc.close()); peers.clear(); if (localStream) localStream.getTracks().forEach(t => t.stop()); if (screenStream) screenStream.getTracks().forEach(t => t.stop()); location.href = '/'; });
const params = new URLSearchParams(location.search); if (params.get('room')) $('roomId').value = params.get('room').toUpperCase();
