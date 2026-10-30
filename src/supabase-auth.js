const trimSlash = value => String(value || '').trim().replace(/\/+$/, '');
const configuredValue = (...values) => values.find(value => String(value || '').trim()) || '';
const supabaseUrl = () => trimSlash(configuredValue(
  process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.PUBLIC_SUPABASE_URL
));
const supabasePublishableKey = () => String(configuredValue(
  process.env.SUPABASE_PUBLISHABLE_KEY,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  process.env.SUPABASE_ANON_KEY
)).trim();

export function supabaseAuthConfigured() {
  const rawUrl = supabaseUrl();
  const key = supabasePublishableKey();
  if (!rawUrl || !key || /YOUR_PROJECT_REF|REPLACE_ME|placeholder/i.test(rawUrl + key)) return false;
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && Boolean(url.host);
  } catch {
    return false;
  }
}

function requireConfig() {
  if (!supabaseAuthConfigured()) {
    throw Object.assign(new Error("Minglora Supabase Auth is not configured. Set Minglora's project URL and publishable key on the API service. Supported names are SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY, or NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Both values must come from the same Minglora project; a key without its matching project URL cannot connect."), { status: 503 });
  }
}

async function authRequest(path, payload) {
  requireConfig();
  const baseUrl = supabaseUrl();
  const apiKey = supabasePublishableKey();
  const redirectTo = String(process.env.SUPABASE_AUTH_REDIRECT_URL || '').trim();
  const target = new URL(`${baseUrl}/auth/v1/${path}`);
  if (redirectTo && path === 'signup') target.searchParams.set('redirect_to', redirectTo);

  let response;
  try {
    response = await fetch(target, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw Object.assign(new Error('Could not reach Minglora Supabase Auth. Check the project URL and network settings.'), { status: 503 });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.msg || data.message || data.error_description || data.error || 'Supabase Auth request failed.';
    const error = new Error(String(message));
    error.status = response.status === 429 ? 429 : response.status >= 500 ? 503 : response.status;
    error.code = data.code || data.error || null;
    throw error;
  }
  return data;
}

export function supabaseSignUp({ email, password, name, username }) {
  return authRequest('signup', {
    email,
    password,
    data: { name, username }
  });
}

export function supabaseSignIn({ email, password }) {
  return authRequest('token?grant_type=password', { email, password });
}
