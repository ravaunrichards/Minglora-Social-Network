const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}
export function validateUsername(value) {
  const username = normalizeUsername(value);
  return { valid: USERNAME_RE.test(username), value: username };
}
export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}
export function validateEmail(value) {
  const email = normalizeEmail(value);
  return { valid: email.length <= 254 && EMAIL_RE.test(email), value: email };
}
export function validatePostInput(input = {}) {
  const text = String(input.text ?? '').trim();
  const imageUrl = String(input.imageUrl ?? '').trim();
  const mediaIds = Array.isArray(input.mediaIds) ? input.mediaIds.map(value => String(value || '').trim()).filter(Boolean) : [];
  const errors = [];
  if (!text && !imageUrl && mediaIds.length === 0) errors.push('Add text or select media from your device.');
  if (text.length > 5000) errors.push('Post text must be 5000 characters or fewer.');
  if (imageUrl) errors.push('Image URLs are no longer accepted. Select media from your device instead.');
  if (mediaIds.length > 10) errors.push('A post can contain up to 10 media attachments.');
  if (mediaIds.some(id => id.length > 80)) errors.push('One or more media references are invalid.');
  return { valid: errors.length === 0, errors, value: { text, mediaIds } };
}
export function validateProfilePatch(input = {}) {
  const limits = { name: 120, username: 30, bio: 500, location: 120 };
  const value = {};
  const errors = [];
  for (const [key, limit] of Object.entries(limits)) {
    if (input[key] === undefined) continue;
    const normalized = String(input[key] ?? '').trim();
    if (normalized.length > limit) errors.push(`${key} must be ${limit} characters or fewer.`);
    if (['avatar', 'cover'].includes(key) && normalized) {
      try { if (new URL(normalized).protocol !== 'https:') errors.push(`${key} must use HTTPS.`); }
      catch { errors.push(`${key} must be a valid absolute URL.`); }
    }
    value[key] = normalized;
  }
  if (Object.hasOwn(value, 'name') && value.name.length < 2) errors.push('name must contain at least 2 characters.');
  if (Object.hasOwn(value, 'username')) { const normalized=normalizeUsername(value.username); if (!validateUsername(normalized).valid) errors.push('username must contain 3–30 letters, numbers or underscores.'); value.username=normalized; }
  return { valid: errors.length === 0, errors, value };
}
