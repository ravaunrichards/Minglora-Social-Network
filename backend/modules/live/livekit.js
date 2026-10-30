import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

function config() {
  const rawUrl=String(process.env.LIVEKIT_URL||'').trim();
  let serverUrl='',clientUrl='';
  try{
    const parsed=new URL(rawUrl);
    if(parsed.protocol==='https:'||parsed.protocol==='wss:'){
      serverUrl='https://'+parsed.host;
      clientUrl='wss://'+parsed.host;
    }else if(parsed.protocol==='http:'||parsed.protocol==='ws:'){
      serverUrl='http://'+parsed.host;
      clientUrl='ws://'+parsed.host;
    }
  }catch{}
  return {
    serverUrl,
    clientUrl,
    apiKey: String(process.env.LIVEKIT_API_KEY || '').trim(),
    apiSecret: String(process.env.LIVEKIT_API_SECRET || '').trim()
  };
}

export function isLiveKitConfigured() {
  const settings = config();
  return Boolean(settings.serverUrl && settings.clientUrl && settings.apiKey && settings.apiSecret);
}

export async function createLiveKitToken({ identity, name, roomName, canPublish = false }) {
  const settings = config();
  if (!settings.serverUrl || !settings.clientUrl || !settings.apiKey || !settings.apiSecret) {
    const error = new Error('LiveKit is not configured for Minglora.');
    error.status = 503;
    throw error;
  }
  if (!identity || !roomName || !/^[a-zA-Z0-9_-]{1,128}$/.test(roomName)) {
    const error = new Error('A valid participant identity and room name are required.');
    error.status = 400;
    throw error;
  }

  const accessToken = new AccessToken(settings.apiKey, settings.apiSecret, {
    identity: String(identity),
    name: String(name || identity).slice(0, 64),
    ttl: '2h'
  });
  accessToken.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: Boolean(canPublish),
    canSubscribe: true,
    canPublishData: Boolean(canPublish)
  });

  return {
    url: settings.clientUrl,
    token: await accessToken.toJwt()
  };
}

export async function listLiveKitParticipants(roomName) {
  const settings = config();
  if (!settings.url || !settings.apiKey || !settings.apiSecret) {
    const error = new Error('LiveKit is not configured for Minglora.');
    error.status = 503;
    throw error;
  }
  if (!roomName || !/^[a-zA-Z0-9_-]{1,128}$/.test(roomName)) {
    const error = new Error('A valid LIVE room name is required.');
    error.status = 400;
    throw error;
  }
  const service = new RoomServiceClient(settings.serverUrl, settings.apiKey, settings.apiSecret);
  const participants = await service.listParticipants(roomName);
  return participants.map(participant => ({
    identity: participant.identity,
    name: participant.name || participant.identity,
    joinedAt: participant.joinedAt ? new Date(Number(participant.joinedAt) * 1000).toISOString() : null
  }));
}
