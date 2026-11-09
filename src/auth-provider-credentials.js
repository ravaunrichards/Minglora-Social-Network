export function buildSupabaseProviderCredentialPatch({
  definition,
  credentials = {},
  current = {},
  smsProviders = {},
  fieldLabel = key => key
}) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('A provider definition is required.');
  }
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
    throw Object.assign(new Error('Provider credentials must be an object.'), { status: 400 });
  }

  const patch = {};
  if (definition.id === 'phone') {
    const smsProvider = String(credentials.sms_provider || current.sms_provider || '').trim().toLowerCase();
    const fields = smsProviders[smsProvider];
    if (!fields) {
      throw Object.assign(new Error('Choose a supported SMS gateway before enabling phone sign-in.'), { status: 400 });
    }
    patch.sms_provider = smsProvider;
    for (const key of [...(fields.required || []), ...(fields.optional || [])]) {
      const value = String(credentials[key] || '').trim();
      if (!value) continue;
      if (value.length > 4096) {
        throw Object.assign(new Error(fieldLabel(key) + ' is too long.'), { status: 400 });
      }
      patch[key] = value;
    }
    return patch;
  }

  for (const key of [...(definition.keys || []), ...(definition.optionalKeys || [])]) {
    const value = String(credentials[key] || '').trim();
    if (!value) continue;
    if (value.length > 4096) {
      throw Object.assign(new Error(fieldLabel(key) + ' is too long.'), { status: 400 });
    }
    if (key.endsWith('_url')) {
      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        throw Object.assign(new Error(fieldLabel(key) + ' must be a valid HTTPS URL.'), { status: 400 });
      }
      if (parsed.protocol !== 'https:') {
        throw Object.assign(new Error(fieldLabel(key) + ' must use HTTPS.'), { status: 400 });
      }
    }
    patch[key] = value;
  }
  return patch;
}
