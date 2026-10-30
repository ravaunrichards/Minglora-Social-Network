const trimSlash = value => String(value || '').trim().replace(/\/+$/, '');

function supabaseConfig() {
  const pairs = [
    [process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY],
    [process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY],
    [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY],
    [process.env.PUBLIC_SUPABASE_URL, process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY],
    // Backward compatibility: the legacy anon key is paired only with SUPABASE_URL.
    [process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY]
  ];

  const pair = pairs.find(([url, key]) =>
    String(url || '').trim() && String(key || '').trim()
  );

  return pair
    ? { url: trimSlash(pair[0]), key: String(pair[1]).trim() }
    : { url: '', key: '' };
}

export function supabaseAuthConfigured() {
  const { url: rawUrl, key } = supabaseConfig();
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
    throw Object.assign(new Error("Minglora Supabase Auth is not configured. Set Minglora's project URL and matching publishable key on the API service. Supported pairs are SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY, or NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Both values must come from the same Minglora project; a key without its matching project URL cannot connect."), { status: 503 });
  }
}

async function authRequest(path, payload) {
  requireConfig();
  const { url: baseUrl, key: apiKey } = supabaseConfig();
  const redirectTo = String(process.env.SUPABASE_AUTH_REDIRECT_URL || '').trim();
  const target = new URL(baseUrl + '/auth/v1/' + path);
  if (redirectTo && path === 'signup') target.searchParams.set('redirect_to', redirectTo);

  let response;
  try {
    response = await fetch(target, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: 'Bearer ' + apiKey,
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

function requireAccessToken(accessToken) {
  if (!accessToken || typeof accessToken !== 'string' || accessToken.length < 20) {
    throw Object.assign(new Error('Your sign-in session is no longer valid. Please log in again.'), { status:401 });
  }
}
async function authenticatedRequest(path, accessToken, method='GET', payload) {
  requireConfig();
  requireAccessToken(accessToken);
  const { url:baseUrl, key:apiKey } = supabaseConfig();
  let response;
  try {
    response=await fetch(baseUrl+'/auth/v1/'+path,{
      method,
      headers:{apikey:apiKey,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
      ...(payload===undefined?{}:{body:JSON.stringify(payload)})
    });
  } catch {
    throw Object.assign(new Error('Could not reach Minglora Supabase Auth.'),{status:503});
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(String(data.msg||data.message||data.error_description||data.error||'Supabase Auth request failed.'));
    error.status=response.status===429?429:response.status>=500?503:response.status;
    throw error;
  }
  return data;
}
export function supabaseUpdatePassword(accessToken,password) {
  return authenticatedRequest('user',accessToken,'PUT',{password});
}
export function supabaseUpdateEmail(accessToken,email) {
  return authenticatedRequest('user',accessToken,'PUT',{email});
}
async function rpcRequest(functionName,accessToken,payload={}) {
  requireConfig();
  requireAccessToken(accessToken);
  const {url:baseUrl,key:apiKey}=supabaseConfig();
  const target=baseUrl+'/rest/v1/rpc/'+encodeURIComponent(functionName);
  let response;
  try {
    response=await fetch(target,{
      method:'POST',
      headers:{apikey:apiKey,Authorization:'Bearer '+accessToken,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(payload)
    });
  } catch {
    throw Object.assign(new Error('Could not reach Minglora Supabase data API.'),{status:503});
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(String(data.message||data.details||data.hint||data.error||'Minglora Supabase request failed.'));
    error.status=response.status===429?429:response.status>=500?503:response.status;
    error.code=data.code||null;
    throw error;
  }
  return data;
}

// Supabase Auth deliberately has no GET /auth/v1/factors collection route.
// Query only the current user's factors through Minglora's SECURITY DEFINER RPC.
export async function supabaseListFactors(accessToken) {
  const result=await rpcRequest('minglora_list_my_mfa_factors',accessToken,{});
  return {factors:Array.isArray(result)?result:Array.isArray(result?.factors)?result.factors:[]};
}
export function supabaseUpdateUserMetadata(accessToken,metadata) {
  return authenticatedRequest('user',accessToken,'PUT',{data:metadata});
}
export async function supabaseUpdateProfile(accessToken,userId,profile) {
  requireConfig();
  requireAccessToken(accessToken);
  if(!/^[0-9a-f-]{36}$/i.test(String(userId||''))) throw Object.assign(new Error('Invalid Minglora profile identifier.'),{status:400});
  const {url:baseUrl,key:apiKey}=supabaseConfig();
  const target=new URL(baseUrl+'/rest/v1/profiles');
  target.searchParams.set('id','eq.'+userId);
  let response;
  try {
    response=await fetch(target,{
      method:'PATCH',
      headers:{apikey:apiKey,Authorization:'Bearer '+accessToken,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify(profile)
    });
  } catch {
    throw Object.assign(new Error('Could not reach Minglora profile storage.'),{status:503});
  }
  const data=await response.json().catch(()=>null);
  if(!response.ok){
    const error=new Error(String(data?.message||data?.details||data?.hint||data?.error||'Minglora profile could not be saved.'));
    error.status=response.status===429?429:response.status>=500?503:response.status;
    error.code=data?.code||null;
    throw error;
  }
  return {ok:true};
}
export function supabaseEnrollTotp(accessToken,friendlyName='Minglora authenticator') {
  return authenticatedRequest('factors',accessToken,'POST',{factor_type:'totp',friendly_name:friendlyName});
}
export function supabaseChallengeFactor(accessToken,factorId) {
  return authenticatedRequest('factors/'+encodeURIComponent(factorId)+'/challenge',accessToken,'POST',{});
}
export function supabaseVerifyFactor(accessToken,factorId,challengeId,code) {
  return authenticatedRequest('factors/'+encodeURIComponent(factorId)+'/verify',accessToken,'POST',{challenge_id:challengeId,code});
}
export function supabaseUnenrollFactor(accessToken,factorId) {
  return authenticatedRequest('factors/'+encodeURIComponent(factorId),accessToken,'DELETE');
}
export function supabaseRefreshSession(refreshToken) {
  return authRequest('token?grant_type=refresh_token',{refresh_token:refreshToken});
}
export function supabaseRequestPasswordReset(email,redirectTo) {
  requireConfig();
  const {url:baseUrl,key:apiKey}=supabaseConfig();
  const target=new URL(baseUrl+'/auth/v1/recover');
  if(redirectTo)target.searchParams.set('redirect_to',redirectTo);
  return fetch(target,{method:'POST',headers:{apikey:apiKey,Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({email})})
    .then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(String(data.msg||data.message||data.error_description||data.error||'Password reset request failed.'));error.status=response.status===429?429:response.status>=500?503:response.status;throw error;}return data;});
}
export function supabaseCompletePasswordReset(accessToken,password) {
  return supabaseUpdatePassword(accessToken,password);
}
