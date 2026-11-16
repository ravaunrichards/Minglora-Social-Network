function jwtExpiryMs(accessToken) {
  const parts=String(accessToken||'').split('.');
  if(parts.length!==3)return null;
  try{
    const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
    const exp=Number(claims.exp);
    return Number.isFinite(exp)&&exp>0?exp*1000:null;
  }catch{return null;}
}
export function getAuthTokenExpiresAt(tokens,now=Date.now()){
  const candidates=[];
  const explicit=Number(tokens?.expires_at);
  if(Number.isFinite(explicit)&&explicit>0)candidates.push(explicit>1e12?explicit:explicit*1000);
  const jwtExpiry=jwtExpiryMs(tokens?.access_token);
  if(jwtExpiry)candidates.push(jwtExpiry);
  const duration=Number(tokens?.expires_in);
  if(Number.isFinite(duration)&&duration>0)candidates.push(now+duration*1000);
  return candidates.length?Math.min(...candidates):now;
}
function invalidRefreshToken(error){
  const status=Number(error?.status||0),detail=String(error?.code||'')+' '+String(error?.message||'');
  return (status===400||status===401)&&/(invalid.*refresh|refresh.*invalid|refresh.*(expired|used|reuse|not found)|invalid grant|refresh_token_(?:not_found|already_used|expired))/i.test(detail);
}
export function createSessionAuthManager({openSession,sealSession,refreshSession,save}){
  if(![openSession,sealSession,refreshSession,save].every(value=>typeof value==='function'))throw new TypeError('Session auth manager requires open, seal, refresh and save functions.');
  const refreshes=new Map();
  async function sessionAuth(session){
    if(!session?.authSealed||session.authInvalidatedAt)return null;
    const tokens=openSession(session.authSealed);
    if(!tokens?.access_token||typeof tokens.access_token!=='string')return null;
    const storedExpiry=Date.parse(session.authExpiresAt||''),jwtExpiry=jwtExpiryMs(tokens.access_token);
    const expiryCandidates=[storedExpiry,jwtExpiry].filter(value=>Number.isFinite(value)&&value>0);
    const expiresAt=expiryCandidates.length?Math.min(...expiryCandidates):0;
    if(expiresAt>Date.now()+90000)return tokens;
    if(!tokens.refresh_token||typeof tokens.refresh_token!=='string')return null;
    const key=String(session.id||session.userId||'session');
    const existing=refreshes.get(key);
    if(existing)return existing;
    const operation=(async()=>{
      try{
        const refreshed=await refreshSession(tokens.refresh_token);
        if(!refreshed?.access_token||typeof refreshed.access_token!=='string'||refreshed.access_token.length<20)throw Object.assign(new Error('Minglora received an invalid access token while refreshing your sign-in.'),{status:502});
        const nextTokens={...tokens,...refreshed,refresh_token:String(refreshed.refresh_token||tokens.refresh_token)};
        const nextExpiry=getAuthTokenExpiresAt(nextTokens);
        if(!Number.isFinite(nextExpiry)||nextExpiry<=Date.now())throw Object.assign(new Error('Minglora received an expired access token while refreshing your sign-in.'),{status:502});
        session.authSealed=sealSession(nextTokens);
        session.authExpiresAt=new Date(nextExpiry).toISOString();
        session.authInvalidatedAt=null;
        await save();
        return nextTokens;
      }catch(error){
        if(invalidRefreshToken(error)){
          session.authSealed=null;
          session.authExpiresAt=null;
          session.authInvalidatedAt=new Date().toISOString();
          await save();
          return null;
        }
        throw error;
      }
    })();
    refreshes.set(key,operation);
    try{return await operation;}
    finally{if(refreshes.get(key)===operation)refreshes.delete(key);}
  }
  return sessionAuth;
}
