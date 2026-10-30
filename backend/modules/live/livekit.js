import { AccessToken } from 'livekit-server-sdk';

function config() {
  return {
    url: String(process.env.LIVEKIT_URL || '').trim(),
    apiKey: String(process.env.LIVEKIT_API_KEY || '').trim(),
    apiSecret: String(process.env.LIVEKIT_API_SECRET || '').trim()
  };
}

export function isLiveKitConfigured() {
  const settings = config();
  return Boolean(settings.url && settings.apiKey && settings.apiSecret);
}

export async function createLiveKitToken({ identity, name, roomName, canPublish = false }) {
  const settings = config();
  if (!settings.url || !settings.apiKey || !settings.apiSecret) {
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
    url: settings.url,
    token: await accessToken.toJwt()
  };
}
