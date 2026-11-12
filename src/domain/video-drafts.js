const AUDIENCES = new Set(['public', 'friends', 'close_friends', 'followers', 'private']);
const FORMATS = new Set(['video', 'reel']);
const REMIX_POLICIES = new Set(['off', 'everyone', 'followers', 'friends']);

export function validateVideoDraftInput(input = {}, existing = null) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const previous = existing && typeof existing === 'object' ? existing : {};
  const errors = [];

  const text = source.text === undefined
    ? String(previous.text || '')
    : String(source.text ?? '').trim();
  if (text.length > 5000) errors.push('Video captions must be 5000 characters or fewer.');

  const audience = source.audience === undefined
    ? (previous.audience || 'public')
    : String(source.audience || '');
  if (!AUDIENCES.has(audience)) errors.push('Choose a supported video audience.');

  const videoFormat = source.videoFormat === undefined
    ? (previous.videoFormat || 'video')
    : String(source.videoFormat || '');
  if (!FORMATS.has(videoFormat)) errors.push('Choose video or Reel format.');

  const remixPolicy = source.remixPolicy === undefined
    ? (previous.remixPolicy || 'off')
    : String(source.remixPolicy || '');
  if (!REMIX_POLICIES.has(remixPolicy)) errors.push('Choose a supported remix permission.');

  const mediaValues = source.mediaIds === undefined
    ? (Array.isArray(previous.mediaIds) ? previous.mediaIds : [])
    : source.mediaIds;
  if (!Array.isArray(mediaValues)) {
    errors.push('A video draft must reference one uploaded video file.');
  }
  const mediaIds = Array.isArray(mediaValues)
    ? [...new Set(mediaValues.map(value => String(value || '').trim()).filter(Boolean))]
    : [];
  if (mediaIds.length !== 1 || mediaIds.some(id => id.length > 80)) {
    errors.push('A video draft must contain exactly one valid uploaded video file.');
  }

  const remixOfPostId = source.remixOfPostId === undefined
    ? (previous.remixOfPostId || null)
    : (String(source.remixOfPostId || '').trim() || null);
  if (remixOfPostId && remixOfPostId.length > 80) errors.push('The source video reference is invalid.');

  return {
    valid: errors.length === 0,
    errors,
    value: { text, audience, videoFormat, remixPolicy, mediaIds, remixOfPostId }
  };
}
