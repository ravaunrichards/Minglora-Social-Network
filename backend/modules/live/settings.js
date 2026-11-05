export const LIVE_MODES = Object.freeze(['video_audio', 'audio_only', 'mobile_gaming', 'live_studio']);
export const LIVE_BOARDS = Object.freeze(['general', 'gaming', 'music', 'talk', 'education', 'beauty', 'sports', 'business', 'lifestyle']);
export const LIVE_QUALITIES = Object.freeze(['auto', '720p', '1080p']);

export const DEFAULT_LIVE_SETTINGS = Object.freeze({
  board: 'general',
  aboutMe: '',
  practiceMode: false,
  liveQuality: 'auto',
  noiseSuppression: true,
  optimizeForStability: true,
  markViewers: true,
  communitySafety: true,
  groupChatEnabled: true,
  liveGifts: true,
  audienceControl: true,
  contentDisclosure: 'none',
  clientAcquisitionEnabled: false,
  clientCtaLabel: '',
  clientCtaUrl: '',
  allowGuestRequests: true,
  guestCamera: true,
  autoAcceptRequests: false,
  prioritizeGifters: false,
  allowCoHost: true,
  manageModerators: true,
  voiceRings: true,
  multiGuestExtraRewards: false,
  shareRecordingsWithGuests: false
});

export function broadcastTypeForLiveMode(liveMode) {
  return liveMode === 'audio_only' ? 'audio_only' : 'video_audio';
}

export function normalizeLiveSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, error: 'LIVE settings must be an object.' };
  }

  const allowed = new Set(Object.keys(DEFAULT_LIVE_SETTINGS));
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return { valid: false, error: 'Unsupported LIVE setting: ' + key };
  }

  const next = { ...DEFAULT_LIVE_SETTINGS, ...value };
  if (!LIVE_BOARDS.includes(next.board)) return { valid: false, error: 'Choose a supported LIVE board.' };
  if (!LIVE_QUALITIES.includes(next.liveQuality)) return { valid: false, error: 'Choose Auto, 720p or 1080p LIVE quality.' };
  for (const key of ['practiceMode', 'noiseSuppression', 'optimizeForStability', 'markViewers', 'communitySafety', 'groupChatEnabled', 'liveGifts', 'audienceControl', 'clientAcquisitionEnabled', 'allowGuestRequests', 'guestCamera', 'autoAcceptRequests', 'prioritizeGifters', 'allowCoHost', 'manageModerators', 'voiceRings', 'multiGuestExtraRewards', 'shareRecordingsWithGuests']) {
    if (typeof next[key] !== 'boolean') return { valid: false, error: key + ' must be true or false.' };
  }
  if (!['none', 'branded', 'sponsored'].includes(next.contentDisclosure)) {
    return { valid: false, error: 'Choose a valid content disclosure setting.' };
  }

  next.aboutMe = String(next.aboutMe || '').trim();
  next.clientCtaLabel = String(next.clientCtaLabel || '').trim();
  next.clientCtaUrl = String(next.clientCtaUrl || '').trim();
  if (next.aboutMe.length > 500) return { valid: false, error: 'LIVE About me must be 500 characters or fewer.' };
  if (next.clientCtaLabel.length > 48) return { valid: false, error: 'The client call-to-action label must be 48 characters or fewer.' };
  if (next.clientCtaUrl.length > 2048) return { valid: false, error: 'The client call-to-action link is too long.' };

  if (next.clientAcquisitionEnabled) {
    if (!next.clientCtaLabel || !next.clientCtaUrl) {
      return { valid: false, error: 'Add a button label and HTTPS link to enable the client call-to-action.' };
    }
    let url;
    try { url = new URL(next.clientCtaUrl); } catch {
      return { valid: false, error: 'Enter a valid HTTPS client call-to-action link.' };
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      return { valid: false, error: 'Client call-to-action links must use HTTPS and cannot contain embedded credentials.' };
    }
    next.clientCtaUrl = url.toString();
  } else {
    next.clientCtaLabel = '';
    next.clientCtaUrl = '';
  }

  // A practice broadcast is always private and cannot accept paid gifts or reward drops.
  if (next.practiceMode) next.liveGifts = false;

  return { valid: true, settings: next };
}

/**
 * Resolve least-privilege LiveKit publishing tracks for an established role.
 * Mobile Gaming host streams the captured screen; approved guests can only
 * contribute microphone audio. Audio-only rooms never receive camera access.
 */
export function getLivePublishSourceNames(liveMode, role, broadcastType = 'video_audio', liveSettings = {}) {
  if (!['host', 'guest'].includes(role)) return null;
  const mode = LIVE_MODES.includes(liveMode)
    ? liveMode
    : broadcastType === 'audio_only' ? 'audio_only' : 'video_audio';
  if (mode === 'audio_only') return ['MICROPHONE'];
  if (mode === 'mobile_gaming') {
    return role === 'host' ? ['MICROPHONE', 'SCREEN_SHARE'] : ['MICROPHONE'];
  }
  return role === 'host'
    ? ['MICROPHONE', 'CAMERA', 'SCREEN_SHARE']
    : liveSettings?.guestCamera === false ? ['MICROPHONE'] : ['MICROPHONE', 'CAMERA'];
}
