const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const STATE_API_URL = String(process.env.SUPABASE_STATE_API_URL || "").trim().replace(/\/+$/, "");
const API_KEY = String(process.env.SUPABASE_STATE_API_KEY || "").trim();
const PUBLISHABLE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
const MAX_ATTEMPTS = 3;
const RETRYABLE = new Set([408,425,429,500,502,503,504,520,522,524]);
const DELAYS = [200,600];
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));

export function helpCenterEndpoint(env=process.env) {
  const explicit=String(env.SUPABASE_HELP_CENTER_API_URL||"").trim().replace(/\/+$/,"");
  if (explicit) return explicit;
  const base=String(env.SUPABASE_URL||env.VITE_SUPABASE_URL||"").trim().replace(/\/+$/,"");
  if (base) return base + "/functions/v1/minglora-help-center";
  const state=String(env.SUPABASE_STATE_API_URL||"").trim().replace(/\/+$/,"");
  return state.replace(/\/minglora-runtime-state\/?$/,"/minglora-help-center");
}

export async function requestHelpCenter(action,payload={}) {
  const endpoint=helpCenterEndpoint();
  if (!endpoint || !API_KEY || !PUBLISHABLE_KEY) {
    throw Object.assign(new Error("The Minglora Help Center service is not configured on this application server."),{status:503});
  }
  for (let attempt=1;attempt<=MAX_ATTEMPTS;attempt+=1) {
    let response;
    try {
      response=await fetch(endpoint,{
        method:"POST",
        headers:{
          apikey:PUBLISHABLE_KEY,
          "x-minglora-api-key":API_KEY,
          "Content-Type":"application/json",
          Accept:"application/json"
        },
        body:JSON.stringify({action,...payload}),
        signal:AbortSignal.timeout(15000)
      });
    } catch(cause) {
      if (attempt<MAX_ATTEMPTS) { await wait(DELAYS[attempt-1]||600); continue; }
      throw Object.assign(new Error("Minglora could not reach Help Center storage after bounded retries."),{status:503,cause});
    }
    const result=await response.json().catch(()=>({}));
    if (response.ok) return result;
    if (RETRYABLE.has(response.status)&&attempt<MAX_ATTEMPTS) {
      await wait(DELAYS[attempt-1]||600);
      continue;
    }
    throw Object.assign(new Error(String(result.error||"The Help Center request could not be completed.").slice(0,240)),{
      status:response.status>=500?503:response.status,
      code:result.code||null
    });
  }
  throw Object.assign(new Error("Minglora Help Center request retry policy was exhausted."),{status:503});
}
