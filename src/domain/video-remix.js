/**
 * Validate opt-in video-response attribution without weakening source post privacy.
 * This links an independently uploaded response video to its source; it does not
 * render a native split-screen Duet or Stitch composition.
 */
export function validateVideoRemixRequest(input = {}, { findSource, canViewSource } = {}) {
  const allowRemix = input.allowRemix === undefined ? false : input.allowRemix;
  if (typeof allowRemix !== 'boolean') {
    return { valid: false, status: 400, error: 'Allow video responses must be true or false.' };
  }

  const sourceId = String(input.remixSourcePostId || '').trim();
  const remixType = String(input.remixType || '').trim();
  if (sourceId.length > 128) {
    return { valid: false, status: 400, error: 'The source video reference is invalid.' };
  }
  if (!sourceId) {
    if (remixType) {
      return { valid: false, status: 400, error: 'A video response must include its source video.' };
    }
    return { valid: true, allowRemix, remixSourcePostId: null, remixType: null };
  }

  if (remixType !== 'response') {
    return { valid: false, status: 400, error: 'Choose a supported video-response type.' };
  }
  const source = typeof findSource === 'function' ? findSource(sourceId) : null;
  const visible = Boolean(source && typeof canViewSource === 'function' && canViewSource(source));
  if (!source || source.allowRemix !== true || !visible) {
    return { valid: false, status: 404, error: 'This video is unavailable for responses.' };
  }

  return { valid: true, allowRemix, remixSourcePostId: sourceId, remixType: 'response' };
}
