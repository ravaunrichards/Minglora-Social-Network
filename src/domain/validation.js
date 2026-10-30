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
const ABOUT_VISIBILITY_KEYS = ['bio','location','country','county','parish','city','gender','relationshipStatus','contactPhone'];

export function normalizeContactPhone(value) {
  return String(value ?? '').trim().replace(/[\\s().-]/g,'');
}

export function validateContactPhone(value) {
  const phone=normalizeContactPhone(value);
  return {valid:!phone || /^\\+[1-9]\\d{7,14}$/.test(phone),value:phone};
}

export function validateProfilePatch(input = {}) {
  const limits = {
    name:120, username:30, bio:500, location:120, contactPhone:24,
    country:120, county:120, parish:120, city:120, gender:60, relationshipStatus:80
  };
  const value = {};
  const errors = [];
  const allowedKeys=new Set([...Object.keys(limits),'aboutVisibility']);
  for(const key of Object.keys(input||{}))if(!allowedKeys.has(key))errors.push(key+' cannot be edited through profile details. Choose a file from your device for profile media.');
  for (const [key, limit] of Object.entries(limits)) {
    if (input[key] === undefined) continue;
    const normalized = key==='contactPhone'?normalizeContactPhone(input[key]):String(input[key] ?? '').trim();
    if (normalized.length > limit) errors.push(`${key} must be ${limit} characters or fewer.`);
    value[key] = normalized;
  }
  if (Object.hasOwn(value,'contactPhone') && !validateContactPhone(value.contactPhone).valid) {
    errors.push('Enter a phone number in international format, including + and country code (for example +18765551234).');
  }
  if (Object.hasOwn(value, 'name') && value.name.length < 2) errors.push('name must contain at least 2 characters.');
  if (Object.hasOwn(value, 'username')) { const normalized=normalizeUsername(value.username); if (!validateUsername(normalized).valid) errors.push('username must contain 3–30 letters, numbers or underscores.'); value.username=normalized; }
  if (input.aboutVisibility !== undefined) {
    if (!input.aboutVisibility || typeof input.aboutVisibility !== 'object' || Array.isArray(input.aboutVisibility)) {
      errors.push('About visibility must be a set of show/hide choices.');
    } else {
      const visibility={};
      for(const [key,flag] of Object.entries(input.aboutVisibility)) {
        if(!ABOUT_VISIBILITY_KEYS.includes(key)){errors.push('Unsupported About visibility field: '+key);continue;}
        if(typeof flag!=='boolean'){errors.push('About visibility choices must be enabled or disabled.');continue;}
        visibility[key]=flag;
      }
      value.aboutVisibility=visibility;
    }
  }
  return { valid: errors.length === 0, errors, value };
}
