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
  const errors = [];
  if (!text && !imageUrl) errors.push('Add text or an image URL.');
  if (text.length > 5000) errors.push('Post text must be 5000 characters or fewer.');
  if (imageUrl.length > 2000) errors.push('Image URL must be 2000 characters or fewer.');
  if (imageUrl) {
    try { if (new URL(imageUrl).protocol !== 'https:') errors.push('Image URL must use HTTPS.'); }
    catch { errors.push('Image URL must be a valid absolute URL.'); }
  }
  return { valid: errors.length === 0, errors, value: { text, imageUrl } };
}
export function validateProfilePatch(input = {}) {
  const limits = { name: 120, bio: 500, location: 120, avatar: 2000, cover: 2000 };
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
  return { valid: errors.length === 0, errors, value };
}
