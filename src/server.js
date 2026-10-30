import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { db, saveStore, uid, now, persistenceHealth } from './store.js';
import { createLiveKitToken, isLiveKitConfigured } from '../backend/modules/live/livekit.js';
import { normalizeEmail, normalizeUsername, validateEmail, validateUsername, validatePostInput, validateProfilePatch } from './domain/validation.js';
import { paginateDescending } from './domain/pagination.js';
import { canViewStory as canViewStoryPolicy, removeExpiredStories } from '../backend/modules/stories/service.js';
import { canPublishGroupPost, canDeleteGroupPost, canLeaveGroup } from '../backend/modules/groups/service.js';
import { validatePageInput, canManagePage as canManagePagePolicy, canDeletePagePost, canDeletePage } from '../backend/modules/pages/service.js';
import { supabaseAuthConfigured, supabaseSignUp, supabaseSignIn, supabaseUpdatePassword, supabaseListFactors, supabaseEnrollTotp, supabaseChallengeFactor, supabaseVerifyFactor, supabaseUnenrollFactor, supabaseRefreshSession, supabaseRequestPasswordReset, supabaseCompletePasswordReset, supabaseUpdateEmail } from './supabase-auth.js';
const scrypt = promisify(crypto.scrypt);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV === 'production' &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Production startup requires SESSION_SECRET to contain at least 32 characters.');
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const AUTH_PROVIDER = String(process.env.AUTH_PROVIDER || (process.env.NODE_ENV === 'production' || supabaseAuthConfigured() ? 'supabase' : 'legacy')).trim().toLowerCase();
if (!['supabase', 'legacy'].includes(AUTH_PROVIDER)) throw new Error('AUTH_PROVIDER must be supabase or legacy.');
if (process.env.NODE_ENV === 'production' && AUTH_PROVIDER !== 'supabase') throw new Error('Production startup requires AUTH_PROVIDER=supabase. When Minglora Supabase credentials are missing, authentication routes fail closed with HTTP 503 instead of writing accounts to local storage.');
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp' };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()'
};
const safeUser = u => u && ({ id:u.id, name:u.name, username:u.username, bio:u.bio || '', location:u.location || '', avatar:u.avatar || '', cover:u.cover || '', createdAt:u.createdAt });
const DEFAULT_SETTINGS={privacy:{profileVisibility:'public',allowFriendRequests:true,messageAudience:'everyone'},notifications:{inApp:true,friendRequests:true,messages:true,interactions:true},preferences:{theme:'system',feedSort:'recent',reducedMotion:false}};
function getUserSettings(user){const saved=user?.settings||{};return {privacy:{...DEFAULT_SETTINGS.privacy,...(saved.privacy||{})},notifications:{...DEFAULT_SETTINGS.notifications,...(saved.notifications||{})},preferences:{...DEFAULT_SETTINGS.preferences,...(saved.preferences||{})}};}
function isFriend(firstId,secondId){return (db.friendships||[]).some(item=>item.status==='accepted'&&((item.from===firstId&&item.to===secondId)||(item.from===secondId&&item.to===firstId)));}
function canViewProfile(viewerId,target){if(!target||viewerId===target.id)return true;const visibility=getUserSettings(target).privacy.profileVisibility;if(visibility==='public')return true;if(visibility==='friends')return isFriend(viewerId,target.id);return false;}
function validateSettingsPatch(input,user){
  if(!input||typeof input!=='object'||Array.isArray(input))return {valid:false,error:'Settings must be an object.'};
  const next=getUserSettings(user);const allowed={privacy:['profileVisibility','allowFriendRequests','messageAudience'],notifications:['inApp','friendRequests','messages','interactions'],preferences:['theme','feedSort','reducedMotion']};
  for(const [section,values] of Object.entries(input)){
    if(!allowed[section]||!values||typeof values!=='object'||Array.isArray(values))return {valid:false,error:'Unsupported settings section.'};
    for(const [key,value] of Object.entries(values)){
      if(!allowed[section].includes(key))return {valid:false,error:'Unsupported setting: '+key};
      if(section==='privacy'&&key==='profileVisibility'&&!['public','friends','private'].includes(value))return {valid:false,error:'Profile visibility must be public, friends or private.'};
      if(section==='privacy'&&key==='messageAudience'&&!['everyone','friends','nobody'].includes(value))return {valid:false,error:'Message audience must be everyone, friends or nobody.'};
      if(section==='privacy'&&key==='allowFriendRequests'&&typeof value!=='boolean')return {valid:false,error:'Allow friend requests must be true or false.'};
      if(section==='notifications'&&typeof value!=='boolean')return {valid:false,error:'Notification preferences must be true or false.'};
      if(section==='preferences'&&key==='theme'&&!['system','light','dark'].includes(value))return {valid:false,error:'Theme must be system, light or dark.'};
      if(section==='preferences'&&key==='feedSort'&&!['recent','oldest'].includes(value))return {valid:false,error:'Feed sort must be recent or oldest.'};
      if(section==='preferences'&&key==='reducedMotion'&&typeof value!=='boolean')return {valid:false,error:'Reduced motion must be true or false.'};
      next[section][key]=value;
    }
  }
  return {valid:true,settings:next};
}
const json = (res, status, body, headers={}) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...SECURITY_HEADERS, ...headers }); res.end(JSON.stringify(body)); };
const cookie = (req, name) => (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
const sign = value => crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
const sessionCipherKey=crypto.createHash('sha256').update(SESSION_SECRET+'|minglora-session-vault-v1').digest();
function sealSessionAuth(value){if(!value?.access_token)return null;const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',sessionCipherKey,iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify({access_token:value.access_token,refresh_token:value.refresh_token||'',expires_in:Number(value.expires_in||3600),token_type:value.token_type||'bearer'}),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');}
function openSessionAuth(sealed){if(!sealed)return null;try{const bytes=Buffer.from(sealed,'base64url');const iv=bytes.subarray(0,12),tag=bytes.subarray(12,28),encrypted=bytes.subarray(28);const decipher=crypto.createDecipheriv('aes-256-gcm',sessionCipherKey,iv);decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8'));}catch{return null;}}
function sessionFromRequest(req){const raw=cookie(req,'sid');if(!raw)return null;let decoded;try{decoded=decodeURIComponent(raw);}catch{return null;}const parts=decoded.split('.');if(parts.length!==2)return null;const [id,sig]=parts;if(!id||!sig)return null;const expected=Buffer.from(sign(id),'utf8'),supplied=Buffer.from(sig,'utf8');if(supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))return null;return db.sessions.find(item=>item.id===id&&new Date(item.expiresAt)>new Date())||null;}
function isModerator(user){const ids=String(process.env.MODERATOR_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);return Boolean(user&&(user.role==='admin'||user.role==='moderator'||ids.includes(user.id)));}
const loginFailures=new Map();
function loginRateLimitKey(req,email){const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();return crypto.createHash('sha256').update(ip+'|'+email).digest('hex');}
function checkLoginRateLimit(req,email){const key=loginRateLimitKey(req,email),entry=loginFailures.get(key);if(!entry)return {allowed:true,key};if(entry.resetAt<Date.now()){loginFailures.delete(key);return {allowed:true,key};}return {allowed:entry.count<5,key,retryAfterMs:Math.max(0,entry.resetAt-Date.now())};}
function recordLoginFailure(key){const current=loginFailures.get(key);if(!current||current.resetAt<Date.now())loginFailures.set(key,{count:1,resetAt:Date.now()+15*60*1000});else current.count++;}
function clearLoginFailures(key){loginFailures.delete(key);}
function tokenAal(accessToken){try{const segment=String(accessToken).split('.')[1];const claims=JSON.parse(Buffer.from(segment,'base64url').toString('utf8'));return claims.aal||'aal1';}catch{return 'aal1';}}
function isSameOriginApiWrite(req) {
  if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return false;
  const suppliedOrigin = req.headers.origin;
  if (!suppliedOrigin) return true;
  try {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http')).split(',')[0].trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const expectedOrigin = process.env.APP_ORIGIN
      ? new URL(process.env.APP_ORIGIN).origin
      : new URL(`${forwardedProto}://${forwardedHost}`).origin;
    const origin = new URL(String(suppliedOrigin));
    return ['http:', 'https:'].includes(origin.protocol) && origin.origin === expectedOrigin;
  } catch {
    return false;
  }
}
function appSessionCookie(sid) {
  return `sid=${encodeURIComponent(sid+'.'+sign(sid))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`;
}
async function createAppSession(user,authTokens=null,req=null) {
  const sid=uid();const createdAt=now();
  db.sessions.push({id:sid,userId:user.id,createdAt,lastSeenAt:createdAt,expiresAt:new Date(Date.now()+7*86400000).toISOString(),authSealed:sealSessionAuth(authTokens),authExpiresAt:authTokens?.access_token?new Date(Date.now()+Math.max(60,Number(authTokens.expires_in||3600))*1000).toISOString():null,userAgent:String(req?.headers?.['user-agent']||'Unknown device').slice(0,240),mfaVerified:true});
  await saveStore();return appSessionCookie(sid);
}
function ensureLocalUser(authUser, fallback = {}) {
  if (!authUser?.id || !authUser?.email) throw Object.assign(new Error('Supabase Auth returned an incomplete user record.'), { status:502 });
  const metadata = authUser.user_metadata || authUser.raw_user_meta_data || {};
  const email = normalizeEmail(authUser.email);
  const name = String(metadata.name || metadata.full_name || fallback.name || email.split('@')[0] || 'Minglora Member').trim();
  const username = normalizeUsername(metadata.username || fallback.username || `member_${String(authUser.id).replace(/-/g,'').slice(0,12)}`);
  if (!validateUsername(username).valid) throw Object.assign(new Error('The username on this account is invalid. Contact Minglora support.'), { status:409 });
  let user = db.users.find(item => item.id === authUser.id) || db.users.find(item => normalizeEmail(item.email) === email);
  const usernameOwner = db.users.find(item => item.username === username && item.id !== user?.id);
  if (usernameOwner) throw Object.assign(new Error('That username is already in use on Minglora.'), { status:409 });
  if (!user) {
    user = { id:authUser.id, name, username, email, passwordHash:null, bio:'', location:'', avatar:'', cover:'', createdAt:authUser.created_at || now() };
    db.users.push(user);
  } else {
    user.name = name || user.name;
    user.username = username || user.username;
    user.email = email;
  }
  return user;
}
function sessionUser(req) {const session=sessionFromRequest(req);const account=session?db.users.find(item=>item.id===session.userId)||null:null;return account?.status==='suspended'?null:account;}
async function sessionAuth(session){if(!session?.authSealed)return null;let tokens=openSessionAuth(session.authSealed);if(!tokens?.access_token)return null;if(session.authExpiresAt&&new Date(session.authExpiresAt).getTime()<Date.now()+60000&&tokens.refresh_token){const refreshed=await supabaseRefreshSession(tokens.refresh_token);tokens={...tokens,...refreshed};session.authSealed=sealSessionAuth(tokens);session.authExpiresAt=new Date(Date.now()+Math.max(60,Number(tokens.expires_in||3600))*1000).toISOString();await saveStore();}return tokens;}
async function body(req, maxBytes=1_000_000) {
  let raw=''; for await (const chunk of req) { raw += chunk; if (raw.length > maxBytes) throw Object.assign(new Error('Request body too large'), {status:413}); }
  if (!raw) return {}; try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON body'), {status:400}); }
}
const requireAuth = user => { if (!user) throw Object.assign(new Error('Sign in to continue.'), {status:401}); };
const notify = (userId, actorId, type, text) => {const recipient=db.users.find(item=>item.id===userId);if(!recipient)return;const prefs=getUserSettings(recipient).notifications;if(!prefs.inApp||(type==='friend'&&!prefs.friendRequests)||(type==='message'&&!prefs.messages)||(['reaction','comment','follow'].includes(type)&&!prefs.interactions))return;db.notifications.unshift({id:uid(),userId,actorId,type,text,createdAt:now(),read:false});};
const blockedBetween = (firstId, secondId) => firstId !== secondId && (db.blocks || []).some(b => (b.blockerId === firstId && b.blockedId === secondId) || (b.blockerId === secondId && b.blockedId === firstId));
const pageRole = (pageId, userId) => (db.pageRoles || []).find(role => role.pageId === pageId && role.userId === userId)?.role || null;
const canManagePage = (pageId, userId) => canManagePagePolicy(db.pageRoles || [], pageId, userId);
const canViewStory = (viewerId, story) => canViewStoryPolicy({
  viewerId, story, friendships:db.friendships, follows:db.follows || [], blocks:db.blocks || []
});
async function pruneExpiredStories() {
  const current = Date.now();
  const cleaned = removeExpiredStories({ stories:db.stories || [], views:db.storyViews || [], now:current });
  if (!cleaned.removedCount) return;
  db.stories = cleaned.stories;
  db.storyViews = cleaned.views;
  await saveStore();
}
async function mediaGateway(action,payload) {
  const stateApiUrl=String(process.env.SUPABASE_STATE_API_URL||'').trim();
  const stateApiKey=String(process.env.SUPABASE_STATE_API_KEY||'').trim();
  const publishableKey=String(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'').trim();
  if(!stateApiUrl||!stateApiKey||!publishableKey)throw Object.assign(new Error('Minglora media storage is not configured.'),{status:503});
  let response;try{response=await fetch(stateApiUrl,{method:'POST',headers:{apikey:publishableKey,'x-minglora-api-key':stateApiKey,'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});}catch{throw Object.assign(new Error('Minglora media storage is unavailable.'),{status:503});}
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||'Minglora media storage request failed.'),{status:response.status});
  return data;
}
async function resolveAssetUrl(asset) {
  if(!asset)return null;
  if(asset.url)return asset.url;
  const result=await mediaGateway('media_sign',{ownerId:asset.ownerId,bucket:asset.bucket,path:asset.path});
  return result.url||null;
}
async function publicPost(p,viewerId) {
  const author=db.users.find(u=>u.id===p.userId);
  const media=await Promise.all((p.mediaIds||[]).map(async id=>{
    const asset=(db.mediaAssets||[]).find(item=>item.id===id&&item.ownerId===p.userId&&item.slot==='post');
    if(!asset||asset.status==='deleted')return null;
    try{return {id:asset.id,mimeType:asset.mimeType,mediaType:asset.mediaType,url:await resolveAssetUrl(asset),byteSize:asset.byteSize};}catch{return null;}
  }));
  return {...p,media:media.filter(item=>item?.url),author:safeUser(author),reactions:p.reactions||{},reactionCount:Object.values(p.reactions||{}).length,myReaction:(p.reactions||{})[viewerId]||null,
    isSaved:(db.savedPosts||[]).some(saved=>saved.userId===viewerId&&saved.postId===p.id),
    comments:(p.comments||[]).map(c=>({...c,author:safeUser(db.users.find(u=>u.id===c.userId))}))};
}
async function publicPagePost(post) {
  const media=await Promise.all((post.mediaIds||[]).map(async id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id&&item.ownerId===post.publishedBy&&item.slot==='post');if(!asset||asset.status==='deleted')return null;try{return {id:asset.id,mimeType:asset.mimeType,mediaType:asset.mediaType,url:await resolveAssetUrl(asset),byteSize:asset.byteSize};}catch{return null;}}));
  return {...post,media:media.filter(item=>item?.url),author:safeUser(db.users.find(u=>u.id===post.publishedBy))};
}
async function publicStory(story,viewerId,includeViews=false) {
  const asset=story.mediaId?(db.mediaAssets||[]).find(item=>item.id===story.mediaId&&item.ownerId===story.userId&&item.slot==='story'):null;
  let media=null;if(asset){try{media={mimeType:asset.mimeType,mediaType:asset.mediaType,url:await resolveAssetUrl(asset)};}catch{}}
  const views=(db.storyViews||[]).filter(view=>view.storyId===story.id);
  return {...story,media,author:safeUser(db.users.find(u=>u.id===story.userId)),viewedByMe:story.userId===viewerId||views.some(view=>view.viewerId===viewerId),viewCount:views.length,
    viewers:includeViews&&story.userId===viewerId?views.map(view=>({...view,user:safeUser(db.users.find(u=>u.id===view.viewerId))})):undefined};
}
async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); const p = url.pathname; const method = req.method;
  if (method === 'GET' && p === '/api/health') return json(res,200,{ok:true,service:'minglora-social-network',timestamp:now()});
  if (method === 'GET' && p === '/api/ready') {
    const persistence = await persistenceHealth();
    const auth = {
      provider: AUTH_PROVIDER,
      configured: AUTH_PROVIDER === 'legacy' || supabaseAuthConfigured()
    };
    const ready = persistence.ready && auth.configured;
    return json(res, ready ? 200 : 503, {
      ok: ready,
      service: 'minglora-social-network',
      timestamp: now(),
      components: { persistence, auth }
    });
  }
  if (p.startsWith('/api/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
      p !== '/api/auth/logout') {
    const persistence = await persistenceHealth();
    if (!persistence.ready) {
      return json(res, 503, {
        error: 'Minglora cannot save changes yet because durable production database storage is not configured or is unavailable. Connect Minglora to its own PostgreSQL database before registering or changing account data.'
      });
    }
  }
  if (p.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method) && !isSameOriginApiWrite(req)) {
    return json(res, 403, { error: 'Cross-origin API writes are not allowed.' });
  }
  if (p.startsWith('/api/')) {
    let input; try { if (!['GET','HEAD'].includes(method)) input=await body(req,p==='/api/media/upload'?12*1024*1024:1_000_000); } catch(e) { return json(res,e.status||400,{error:e.message}); }
    const user = sessionUser(req);
    try {
      if (method==='POST' && p==='/api/auth/register') {
        const name=String(input.name||'').trim(), username=normalizeUsername(input.username), email=normalizeEmail(input.email), password=String(input.password||'');
        if (name.length<2 || !validateUsername(username).valid || !validateEmail(email).valid || password.length<10 || password.length>1024) return json(res,400,{error:'Enter a name, username (3+ letters/numbers/underscores), valid email, and password of at least 10 characters.'});
        if (db.users.some(u=>normalizeEmail(u.email)===email || u.username===username)) return json(res,409,{error:'That email or username is already registered. Log in instead.'});
        if (AUTH_PROVIDER === 'supabase') {
          const result = await supabaseSignUp({ email, password, name, username });
          if (!result.user) return json(res,502,{error:'Minglora Supabase Auth did not return a user record.'});
          const hasIdentity = !Array.isArray(result.user.identities) || result.user.identities.length > 0;
          if (!result.session) {
            if (hasIdentity) {
              ensureLocalUser(result.user, { name, username });
              await saveStore();
            }
            return json(res,202,{confirmationRequired:true,message:'Check your email for a confirmation link. After confirming your address, return here and log in.'});
          }
          const created = ensureLocalUser(result.user, { name, username });
          const sessionCookie = await createAppSession(created);
          return json(res,201,{user:safeUser(created)},{'Set-Cookie':sessionCookie});
        }
        const salt=crypto.randomBytes(16).toString('hex'); const hash=(await scrypt(password,salt,64)).toString('hex'); const created={id:uid(),name,username,email,passwordHash:`${salt}:${hash}`,bio:'',location:'',avatar:'',cover:'',createdAt:now()}; db.users.push(created);
        const sessionCookie = await createAppSession(created);
        return json(res,201,{user:safeUser(created)},{'Set-Cookie':sessionCookie});
      }
      if(method==='POST'&&p==='/api/auth/password/reset/request'){
        const email=normalizeEmail(input.email);
        if(!validateEmail(email).valid)return json(res,400,{error:'Enter a valid email address.'});
        if(AUTH_PROVIDER!=='supabase')return json(res,503,{error:'Password recovery is not configured for this account provider.'});
        const origin=String(process.env.APP_ORIGIN||process.env.SUPABASE_AUTH_REDIRECT_URL||'').trim();
        const redirectTo=origin?new URL('/?password-recovery=1',origin).toString():undefined;
        try{await supabaseRequestPasswordReset(email,redirectTo);}catch(error){if(error.status===429)return json(res,429,{error:'Too many recovery requests. Please wait before trying again.'});}
        return json(res,200,{ok:true,message:'If that account exists, Minglora has requested a password recovery email.'});
      }
      if(method==='POST'&&p==='/api/auth/password/reset/complete'){
        const accessToken=String(input.accessToken||''),password=String(input.password||'');
        if(password.length<10||password.length>1024)return json(res,400,{error:'Your new password must contain at least 10 characters.'});
        if(AUTH_PROVIDER!=='supabase')return json(res,503,{error:'Password recovery is not configured for this account provider.'});
        await supabaseCompletePasswordReset(accessToken,password);
        return json(res,200,{ok:true,message:'Your password has been updated. Please log in.'});
      }
      if(method==='POST'&&p==='/api/auth/login'){
        const email=normalizeEmail(input.email),password=String(input.password||''),rate=checkLoginRateLimit(req,email);
        if(!validateEmail(email).valid||!password)return json(res,400,{error:'Enter your email address and password.'});
        if(!rate.allowed)return json(res,429,{error:'Too many unsuccessful login attempts. Try again in 15 minutes.'},{'Retry-After':String(Math.ceil(rate.retryAfterMs/1000))});
        if(AUTH_PROVIDER==='supabase'){
          let authenticated=null;
          try{
            authenticated=await supabaseSignIn({email,password});
          }catch(authError){
            const legacyUser=db.users.find(item=>normalizeEmail(item.email)===email);
            if(/invalid login credentials|invalid email or password/i.test(authError.message)&&legacyUser?.passwordHash){
              const [salt,expected]=legacyUser.passwordHash.split(':');
              const actual=(await scrypt(password,salt,64)).toString('hex');
              if(actual.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected))){recordLoginFailure(rate.key);return json(res,401,{error:'Email or password is incorrect.'});}
              const migrated=await supabaseSignUp({email,password,name:legacyUser.name,username:legacyUser.username});
              if(!migrated.user)return json(res,502,{error:'Minglora could not migrate this account into Supabase Auth.'});
              authenticated=migrated;
            }else{
              if(/invalid login credentials|invalid email or password/i.test(authError.message))recordLoginFailure(rate.key);
              throw authError;
            }
          }
          const signedInUser=ensureLocalUser(authenticated.user);
          if(signedInUser.status==='suspended')return json(res,403,{error:'This Minglora account is suspended. Contact support to appeal.'});
          const accessToken=authenticated.access_token;
          if(accessToken){
            const factors=await supabaseListFactors(accessToken).catch(()=>({factors:[]}));
            const verifiedTotp=(factors.factors||[]).find(factor=>factor.factor_type==='totp'&&factor.status==='verified');
            if(verifiedTotp&&tokenAal(accessToken)!=='aal2'){
              const pendingId=uid();
              db.pendingAuth.push({id:pendingId,userId:signedInUser.id,factorId:verifiedTotp.id,authSealed:sealSessionAuth(authenticated),createdAt:now(),expiresAt:new Date(Date.now()+5*60*1000).toISOString(),userAgent:String(req.headers['user-agent']||'').slice(0,240)});
              await saveStore();clearLoginFailures(rate.key);
              return json(res,200,{mfaRequired:true,challengeId:pendingId,message:'Enter the code from your authenticator app to finish signing in.'});
            }
          }
          const sessionCookie=await createAppSession(signedInUser,authenticated,req);clearLoginFailures(rate.key);
          return json(res,200,{user:safeUser(signedInUser)},{'Set-Cookie':sessionCookie});
        }
        const found=db.users.find(item=>normalizeEmail(item.email)===email);
        if(!found?.passwordHash){recordLoginFailure(rate.key);return json(res,401,{error:'Email or password is incorrect.'});}
        if(found.status==='suspended')return json(res,403,{error:'This Minglora account is suspended. Contact support to appeal.'});
        const [salt,expected]=found.passwordHash.split(':');
        const actual=(await scrypt(password,salt,64)).toString('hex');
        if(actual.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected))){recordLoginFailure(rate.key);return json(res,401,{error:'Email or password is incorrect.'});}
        const sessionCookie=await createAppSession(found,null,req);clearLoginFailures(rate.key);
        return json(res,200,{user:safeUser(found)},{'Set-Cookie':sessionCookie});
      }
      if(method==='POST'&&p==='/api/auth/mfa/login'){
        const pending=(db.pendingAuth||[]).find(item=>item.id===String(input.challengeId||'')&&new Date(item.expiresAt)>new Date());
        const code=String(input.code||'').replace(/\s/g,'');
        if(!pending)return json(res,401,{error:'Your sign-in verification expired. Please log in again.'});
        if(!/^\d{6,8}$/.test(code))return json(res,400,{error:'Enter the current code from your authenticator app.'});
        const tokens=openSessionAuth(pending.authSealed);
        if(!tokens?.access_token)return json(res,401,{error:'Your sign-in verification expired. Please log in again.'});
        const challenge=await supabaseChallengeFactor(tokens.access_token,pending.factorId);
        const verified=await supabaseVerifyFactor(tokens.access_token,pending.factorId,challenge.id,code);
        const account=db.users.find(item=>item.id===pending.userId);
        if(!account)return json(res,401,{error:'Account not found.'});
        db.pendingAuth=db.pendingAuth.filter(item=>item.id!==pending.id);
        const sessionCookie=await createAppSession(account,verified,req);
        await saveStore();
        return json(res,200,{user:safeUser(account)},{'Set-Cookie':sessionCookie});
      }
      if (method==='POST' && p==='/api/auth/logout') { const sid=cookie(req,'sid'); if(sid){const id=decodeURIComponent(sid).split('.')[0]; db.sessions=db.sessions.filter(s=>s.id!==id); await saveStore();} return json(res,200,{ok:true},{'Set-Cookie':'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'}); }
      if (method==='GET' && p==='/api/auth/me') return json(res,200,{user:safeUser(user)});
      requireAuth(user);
      if(method==='POST'&&p==='/api/media/upload'){
        const slot=String(input.slot||''),mimeType=String(input.mimeType||'').toLowerCase(),base64=String(input.base64||'');
        const maxBytes=8*1024*1024;
        const mimeKinds={
          'image/jpeg':'image','image/png':'image','image/webp':'image','image/avif':'image',
          'video/mp4':'video','video/webm':'video','audio/mpeg':'audio','audio/mp4':'audio','model/gltf-binary':'model3d'
        };
        const allowedSlots={
          avatar:['image/jpeg','image/png','image/webp','image/avif'],
          cover:['image/jpeg','image/png','image/webp','image/avif'],
          post:Object.keys(mimeKinds),
          story:['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm']
        };
        if(!allowedSlots[slot]||!allowedSlots[slot].includes(mimeType)||!base64||base64.length>Math.ceil(maxBytes*4/3)+8||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))return json(res,400,{error:'Choose a supported image, video, audio or GLB file.'});
        const bytes=Buffer.from(base64,'base64');
        if(!bytes.length||bytes.length>maxBytes||bytes.toString('base64')!==base64)return json(res,413,{error:'Each media file must be valid and 8 MB or smaller.'});
        const ascii=(start,end)=>bytes.toString('ascii',start,end);
        const signatureValid=
          (mimeType==='image/jpeg'&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)||
          (mimeType==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))||
          (mimeType==='image/webp'&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')||
          (mimeType==='image/avif'&&ascii(4,8)==='ftyp'&&['avif','avis','mif1'].includes(ascii(8,12)))||
          (mimeType==='video/mp4'&&ascii(4,8)==='ftyp')||
          (mimeType==='video/webm'&&bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))||
          (mimeType==='audio/mpeg'&&ascii(0,3)==='ID3')||
          (mimeType==='audio/mp4'&&ascii(4,8)==='ftyp')||
          (mimeType==='model/gltf-binary'&&ascii(0,4)==='glTF');
        if(!signatureValid)return json(res,415,{error:'The selected file contents do not match its media type.'});
        const uploaded=await mediaGateway('media_upload',{ownerId:user.id,slot,mimeType,base64});
        if(slot==='avatar'||slot==='cover'){
          if(typeof uploaded.url!=='string'||!uploaded.url.startsWith('https://'))return json(res,502,{error:'Minglora could not store this profile image.'});
          user[slot]=uploaded.url;await saveStore();return json(res,201,{slot,url:uploaded.url,user:safeUser(user),byteSize:bytes.length});
        }
        const asset={id:uid(),ownerId:user.id,slot,bucket:uploaded.bucket,path:uploaded.path,mimeType,mediaType:mimeKinds[mimeType],byteSize:bytes.length,status:'uploaded',createdAt:now()};
        db.mediaAssets.push(asset);await saveStore();
        return json(res,201,{asset:{id:asset.id,slot,mediaType:asset.mediaType,mimeType,byteSize:asset.byteSize,previewUrl:uploaded.signedUrl||uploaded.url}});
      }
      if(method==='GET'&&p==='/api/account/export'){
        const ownedPosts=db.posts.filter(item=>item.userId===user.id);
        const ownedPostIds=new Set(ownedPosts.map(item=>item.id));
        const ownedStories=db.stories.filter(item=>item.userId===user.id);
        const ownedStoryIds=new Set(ownedStories.map(item=>item.id));
        const ownedPages=db.pages.filter(item=>item.createdBy===user.id);
        const ownedPageIds=new Set(ownedPages.map(item=>item.id));
        const ownedGroups=db.groups.filter(item=>item.ownerId===user.id||(item.members||[]).includes(user.id));
        const ownedGroupIds=new Set(ownedGroups.map(item=>item.id));
        const exportData={
          format:'minglora-account-export',
          schemaVersion:1,
          exportedAt:now(),
          profile:{...safeUser(user),email:user.email||''},
          settings:getUserSettings(user),
          posts:ownedPosts,
          comments:db.posts.flatMap(post=>(post.comments||[]).filter(comment=>comment.userId===user.id).map(comment=>({postId:post.id,...comment}))),
          friendships:(db.friendships||[]).filter(item=>item.from===user.id||item.to===user.id),
          follows:(db.follows||[]).filter(item=>item.followerId===user.id||item.followedId===user.id),
          blocks:(db.blocks||[]).filter(item=>item.blockerId===user.id||item.blockedId===user.id),
          savedPosts:(db.savedPosts||[]).filter(item=>item.userId===user.id),
          groups:ownedGroups,
          groupPosts:(db.groupPosts||[]).filter(item=>item.userId===user.id||ownedGroupIds.has(item.groupId)),
          stories:ownedStories,
          storyViews:(db.storyViews||[]).filter(item=>item.viewerId===user.id||ownedStoryIds.has(item.storyId)),
          pages:ownedPages,
          pageRoles:(db.pageRoles||[]).filter(item=>item.userId===user.id||ownedPageIds.has(item.pageId)),
          pageFollows:(db.pageFollows||[]).filter(item=>item.userId===user.id||ownedPageIds.has(item.pageId)),
          pagePosts:(db.pagePosts||[]).filter(item=>item.publishedBy===user.id||ownedPageIds.has(item.pageId)),
          messages:(db.messages||[]).filter(item=>item.from===user.id||item.to===user.id),
          notifications:(db.notifications||[]).filter(item=>item.userId===user.id)
        };
        return json(res,200,exportData,{'Content-Disposition':'attachment; filename="minglora-account-export.json"','Cache-Control':'no-store'});
      }
      if(method==='GET'&&p==='/api/settings')return json(res,200,{settings:getUserSettings(user),account:{name:user.name,username:user.username,email:user.email||''}});
      if(method==='PATCH'&&p==='/api/settings'){
        const validation=validateSettingsPatch(input,user);if(!validation.valid)return json(res,400,{error:validation.error});
        user.settings=validation.settings;await saveStore();return json(res,200,{settings:getUserSettings(user)});
      }
      const currentSession=sessionFromRequest(req);
      if(method==='POST'&&p==='/api/security/email'){
        const email=normalizeEmail(input.email);
        if(!validateEmail(email).valid)return json(res,400,{error:'Enter a valid new email address.'});
        if(db.users.some(item=>item.id!==user.id&&normalizeEmail(item.email)===email))return json(res,409,{error:'That email address is already registered.'});
        if(AUTH_PROVIDER!=='supabase')return json(res,503,{error:'Email changes require the authenticated email provider.'});
        const auth=await sessionAuth(currentSession);if(!auth?.access_token)return json(res,401,{error:'Your secure session has expired. Log in again.'});
        const result=await supabaseUpdateEmail(auth.access_token,email);
        currentSession.pendingEmail=email;await saveStore();
        return json(res,200,{ok:true,verificationRequired:true,message:result?.message||'Check your new email address for a verification link. Your login email changes after confirmation.'});
      }
      if(method==='GET'&&p==='/api/moderation/access')return json(res,200,{canModerate:isModerator(user)});
      if(method==='GET'&&p==='/api/security/sessions'){
        const sessions=(db.sessions||[]).filter(item=>item.userId===user.id&&new Date(item.expiresAt)>new Date()).map(item=>({
          id:item.id,current:item.id===currentSession?.id,createdAt:item.createdAt||item.expiresAt,lastSeenAt:item.lastSeenAt||item.createdAt||item.expiresAt,expiresAt:item.expiresAt,userAgent:item.userAgent||'Unknown device'
        }));
        return json(res,200,{sessions});
      }
      if(method==='DELETE'&&p.startsWith('/api/security/sessions/')){
        const sessionId=decodeURIComponent(p.slice('/api/security/sessions/'.length));
        const target=(db.sessions||[]).find(item=>item.id===sessionId&&item.userId===user.id);
        if(!target)return json(res,404,{error:'Session not found.'});
        db.sessions=db.sessions.filter(item=>item.id!==sessionId);await saveStore();
        return json(res,200,{ok:true,current:target.id===currentSession?.id},target.id===currentSession?.id?{'Set-Cookie':'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'}:{});
      }
      if(method==='POST'&&p==='/api/security/sessions/revoke-others'){
        db.sessions=db.sessions.filter(item=>item.userId!==user.id||item.id===currentSession?.id);
        await saveStore();return json(res,200,{ok:true});
      }
      if(method==='POST'&&p==='/api/security/password'){
        const currentPassword=String(input.currentPassword||''),newPassword=String(input.newPassword||'');
        if(newPassword.length<10||newPassword.length>1024)return json(res,400,{error:'Your new password must contain at least 10 characters.'});
        if(AUTH_PROVIDER==='supabase'){
          if(!currentPassword)return json(res,400,{error:'Enter your current password to confirm this change.'});
          await supabaseSignIn({email:user.email,password:currentPassword});
          const auth=await sessionAuth(currentSession);if(!auth?.access_token)return json(res,401,{error:'Your secure session has expired. Log in again.'});
          await supabaseUpdatePassword(auth.access_token,newPassword);
        }else{
          const [salt,expected]=String(user.passwordHash||':').split(':');
          if(!salt||!expected)return json(res,400,{error:'This account does not have a local password to update.'});
          const actual=(await scrypt(currentPassword,salt,64)).toString('hex');
          if(actual.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return json(res,401,{error:'Your current password is incorrect.'});
          const newSalt=crypto.randomBytes(16).toString('hex');
          user.passwordHash=newSalt+':'+(await scrypt(newPassword,newSalt,64)).toString('hex');
        }
        await saveStore();return json(res,200,{ok:true,message:'Your password has been updated.'});
      }
      if(method==='GET'&&p==='/api/security/mfa'){
        if(AUTH_PROVIDER!=='supabase')return json(res,200,{enabled:false,available:false,factors:[]});
        const auth=await sessionAuth(currentSession);if(!auth?.access_token)return json(res,401,{error:'Your secure session has expired. Log in again.'});
        const result=await supabaseListFactors(auth.access_token);
        const factors=(result.factors||[]).map(factor=>({id:factor.id,type:factor.factor_type,status:factor.status,friendlyName:factor.friendly_name,createdAt:factor.created_at,updatedAt:factor.updated_at}));
        return json(res,200,{enabled:factors.some(item=>item.type==='totp'&&item.status==='verified'),available:true,factors});
      }
      if(method==='POST'&&p==='/api/security/mfa/totp/enroll'){
        if(AUTH_PROVIDER!=='supabase')return json(res,503,{error:'Authenticator-based MFA requires Minglora Supabase Auth.'});
        const auth=await sessionAuth(currentSession);if(!auth?.access_token)return json(res,401,{error:'Your secure session has expired. Log in again.'});
        const result=await supabaseEnrollTotp(auth.access_token,'Minglora authenticator');
        return json(res,201,{factor:{id:result.id,type:result.type||'totp',status:result.status||'unverified',friendlyName:result.friendly_name},totp:result.totp||null});
      }
      if(method==='POST'&&p==='/api/security/mfa/totp/verify'){
        const factorId=String(input.factorId||''),code=String(input.code||'').replace(/\s/g,'');
        if(!factorId||! /^\d{6,8}$/.test(code))return json(res,400,{error:'Enter the authenticator code.'});
        const auth=await sessionAuth(currentSession);if(!auth?.access_token)return json(res,401,{error:'Your secure session has expired. Log in again.'});
        const challenge=await supabaseChallengeFactor(auth.access_token,factorId);
        const verified=await supabaseVerifyFactor(auth.access_token,factorId,challenge.id,code);
        currentSession.mfaVerified=true;await saveStore();
        return json(res,200,{ok:true,factor:{id:verified.id,status:verified.status||'verified'}});
      }
      const securityFactorMatch=p.match(/^\/api\/security\/mfa\/factors\/([^/]+)$/);
      if(method==='DELETE'&&securityFactorMatch){
        const auth=await sessionAuth(currentSession);if(!auth?.access_token)return json(res,401,{error:'Your secure session has expired. Log in again.'});
        await supabaseUnenrollFactor(auth.access_token,securityFactorMatch[1]);return json(res,200,{ok:true});
      }
      if(method==='POST'&&p==='/api/reports'){
        const targetType=String(input.targetType||''),targetId=String(input.targetId||''),category=String(input.category||''),details=String(input.details||'').trim();
        const allowedTypes=['user','post','comment','story','group','page','message'];
        const allowedCategories=['spam','harassment','hate','nudity','violence','scam','impersonation','copyright','privacy','other'];
        if(!allowedTypes.includes(targetType)||!targetId||!allowedCategories.includes(category)||details.length>2000)return json(res,400,{error:'Choose a report type, reason and optional details (maximum 2000 characters).'});
        let exists=false;
        if(targetType==='user')exists=db.users.some(item=>item.id===targetId&&item.id!==user.id);
        if(targetType==='post')exists=db.posts.some(item=>item.id===targetId);
        if(targetType==='comment')exists=db.posts.some(post=>(post.comments||[]).some(comment=>comment.id===targetId));
        if(targetType==='story')exists=(db.stories||[]).some(item=>item.id===targetId);
        if(targetType==='group')exists=(db.groups||[]).some(item=>item.id===targetId);
        if(targetType==='page')exists=(db.pages||[]).some(item=>item.id===targetId);
        if(targetType==='message')exists=(db.messages||[]).some(item=>item.id===targetId&&(item.from===user.id||item.to===user.id));
        if(!exists)return json(res,404,{error:'The content you are reporting could not be found.'});
        const duplicate=(db.reports||[]).find(item=>item.reporterId===user.id&&item.targetType===targetType&&item.targetId===targetId&&['open','triaged'].includes(item.status));
        if(duplicate)return json(res,409,{error:'You have already reported this content. You can follow up through Help & support.'});
        const report={id:uid(),reporterId:user.id,targetType,targetId,category,details,status:'open',createdAt:now(),reviewedAt:null,reviewedBy:null};
        db.reports.unshift(report);await saveStore();
        return json(res,201,{report:{id:report.id,targetType,category,status:report.status,createdAt:report.createdAt}});
      }
      if(method==='GET'&&p==='/api/reports/mine'){
        return json(res,200,{reports:(db.reports||[]).filter(item=>item.reporterId===user.id).map(item=>({...item,reviewedBy:undefined}))});
      }
      if(method==='GET'&&p==='/api/moderation/reports'){
        if(!isModerator(user))return json(res,403,{error:'Moderator access is required.'});
        const status=String(url.searchParams.get('status')||'open');
        const reports=(db.reports||[]).filter(item=>status==='all'||item.status===status).map(item=>({
          ...item,reporter:safeUser(db.users.find(u=>u.id===item.reporterId)),
          targetOwner:safeUser((item.targetType==='user'?db.users.find(u=>u.id===item.targetId):item.targetType==='post'?db.users.find(u=>u.id===db.posts.find(post=>post.id===item.targetId)?.userId):item.targetType==='story'?db.users.find(u=>u.id===(db.stories||[]).find(story=>story.id===item.targetId)?.userId):null))
        }));
        return json(res,200,{reports});
      }
      const moderationReportMatch=p.match(/^\/api\/moderation\/reports\/([^/]+)$/);
      if((method==='PATCH'||method==='DELETE')&&moderationReportMatch){
        if(!isModerator(user))return json(res,403,{error:'Moderator access is required.'});
        const report=(db.reports||[]).find(item=>item.id===moderationReportMatch[1]);if(!report)return json(res,404,{error:'Report not found.'});
        if(method==='DELETE')report.status='dismissed';
        else{
          const status=String(input.status||''),allowed=['open','triaged','actioned','dismissed','appealed'];
          if(!allowed.includes(status))return json(res,400,{error:'Choose a valid moderation status.'});
          report.status=status;
        }
        report.reviewedAt=now();report.reviewedBy=user.id;
        if(input.action&&['hide_post','remove_post','remove_story','suspend_account'].includes(input.action)){
          const action=String(input.action);
          if(action==='hide_post'&&report.targetType==='post'){const post=db.posts.find(item=>item.id===report.targetId);if(post){post.status='hidden';post.hiddenAt=now();}}
          if(action==='remove_post'&&report.targetType==='post'){const post=db.posts.find(item=>item.id===report.targetId);if(post){db.posts=db.posts.filter(item=>item.id!==post.id);(post.mediaIds||[]).forEach(id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id);if(asset){asset.status='deleted';asset.deletedAt=now();}});}}
          if(action==='remove_story'&&report.targetType==='story'){const story=(db.stories||[]).find(item=>item.id===report.targetId);if(story){db.stories=db.stories.filter(item=>item.id!==story.id);db.storyViews=(db.storyViews||[]).filter(item=>item.storyId!==story.id);}}
          if(action==='suspend_account'&&report.targetType==='user'){const target=db.users.find(item=>item.id===report.targetId);if(target){target.status='suspended';target.suspendedAt=now();target.suspendedBy=user.id;db.sessions=db.sessions.filter(session=>session.userId!==target.id);}}
          (db.moderationActions||[]).unshift({id:uid(),moderatorId:user.id,reportId:report.id,action,targetType:report.targetType,targetId:report.targetId,createdAt:now()});
          (db.auditLog||[]).unshift({id:uid(),actorId:user.id,event:'moderation.action',targetType:report.targetType,targetId:report.targetId,createdAt:now()});
        }
        await saveStore();return json(res,200,{report});
      }
      if(method==='GET'&&p==='/api/support/tickets'){
        if(isModerator(user)&&url.searchParams.get('scope')==='all'){
          const tickets=(db.supportTickets||[]).map(ticket=>({...ticket,requester:safeUser(db.users.find(u=>u.id===ticket.userId)),messages:(db.supportMessages||[]).filter(message=>message.ticketId===ticket.id)}));
          return json(res,200,{tickets});
        }
        const tickets=(db.supportTickets||[]).filter(ticket=>ticket.userId===user.id).map(ticket=>({...ticket,messages:(db.supportMessages||[]).filter(message=>message.ticketId===ticket.id)}));
        return json(res,200,{tickets});
      }
      if(method==='POST'&&p==='/api/support/tickets'){
        const subject=String(input.subject||'').trim(),category=String(input.category||'general'),message=String(input.message||'').trim();
        if(subject.length<4||subject.length>120||message.length<2||message.length>5000||!['general','account','security','bug','abuse','billing','privacy'].includes(category))return json(res,400,{error:'Enter a subject, category and message for support.'});
        const ticket={id:uid(),userId:user.id,subject,category,status:'open',createdAt:now(),updatedAt:now()};
        const first={id:uid(),ticketId:ticket.id,senderId:user.id,message,createdAt:now(),sender:safeUser(user)};
        db.supportTickets.unshift(ticket);db.supportMessages.push(first);await saveStore();
        return json(res,201,{ticket:{...ticket,messages:[first]}});
      }
      const supportMessageMatch=p.match(/^\/api\/support\/tickets\/([^/]+)\/messages$/);
      if(method==='POST'&&supportMessageMatch){
        const ticket=(db.supportTickets||[]).find(item=>item.id===supportMessageMatch[1]);if(!ticket)return json(res,404,{error:'Support ticket not found.'});
        if(ticket.userId!==user.id&&!isModerator(user))return json(res,403,{error:'This support conversation belongs to another member.'});
        const message=String(input.message||'').trim();if(message.length<1||message.length>5000)return json(res,400,{error:'Support message must contain 1–5000 characters.'});
        if(ticket.status==='closed'&&!isModerator(user))return json(res,409,{error:'This ticket is closed. Create a new ticket to contact support.'});
        const item={id:uid(),ticketId:ticket.id,senderId:user.id,message,createdAt:now(),sender:safeUser(user)};
        db.supportMessages.push(item);ticket.updatedAt=now();if(isModerator(user))ticket.status='waiting_for_member';else ticket.status='open';await saveStore();
        return json(res,201,{message:item,ticket});
      }
      const supportTicketMatch=p.match(/^\/api\/support\/tickets\/([^/]+)$/);
      if(method==='PATCH'&&supportTicketMatch){
        const ticket=(db.supportTickets||[]).find(item=>item.id===supportTicketMatch[1]);if(!ticket)return json(res,404,{error:'Support ticket not found.'});
        if(ticket.userId!==user.id&&!isModerator(user))return json(res,403,{error:'This support ticket belongs to another member.'});
        const status=String(input.status||'');
        if(isModerator(user)&&['open','waiting_for_member','in_progress','closed'].includes(status))ticket.status=status;
        else if(ticket.userId===user.id&&status==='closed')ticket.status='closed';
        else return json(res,403,{error:'You cannot set this support ticket status.'});
        ticket.updatedAt=now();await saveStore();return json(res,200,{ticket});
      }
      if(method==='GET'&&p==='/api/support/ticket-categories'){
        return json(res,200,{categories:['general','account','security','bug','abuse','billing','privacy']});
      }
      if (method === 'GET' && p === '/api/live/status') {
        return json(res, 200, { provider: 'livekit', configured: isLiveKitConfigured() });
      }
      if (method === 'GET' && p === '/api/live/sessions') {
        const canView = session => {
          if (session.hostId === user.id || session.visibility === 'public') return true;
          if (session.visibility !== 'friends') return false;
          return (db.friendships || []).some(friendship =>
            friendship.status === 'accepted' &&
            ((friendship.from === user.id && friendship.to === session.hostId) ||
             (friendship.to === user.id && friendship.from === session.hostId))
          );
        };
        const sessions = (db.liveSessions || [])
          .filter(session => session.status === 'live' && !blockedBetween(user.id, session.hostId) && canView(session))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .map(session => ({
            ...session,
            host: safeUser(db.users.find(member => member.id === session.hostId)),
            viewerCount: (db.liveParticipants || []).filter(participant =>
              participant.sessionId === session.id && !participant.leftAt
            ).length
          }));
        return json(res, 200, { sessions });
      }
      if (method === 'POST' && p === '/api/live/sessions') {
        if (!isLiveKitConfigured()) return json(res, 503, { error: 'Live video is not configured. Add Minglora LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to the server environment.' });
        const title = String(input.title || '').trim();
        const visibility = String(input.visibility || 'public');
        if (!title || title.length > 120 || !['public', 'friends', 'private'].includes(visibility)) {
          return json(res, 400, { error: 'Enter a live title (1–120 characters) and choose public, friends or private visibility.' });
        }
        const id = uid();
        const roomName = 'minglora-' + id.replace(/-/g, '');
        const liveKit = await createLiveKitToken({
          identity: user.id,
          name: user.name,
          roomName,
          canPublish: true
        });
        const session = { id, roomName, hostId: user.id, title, visibility, status: 'live', createdAt: now(), endedAt: null };
        db.liveSessions = db.liveSessions || [];
        db.liveParticipants = db.liveParticipants || [];
        db.liveSessions.unshift(session);
        db.liveParticipants.push({ id: uid(), sessionId: id, userId: user.id, role: 'host', joinedAt: now(), leftAt: null });
        await saveStore();
        return json(res, 201, { session, liveKit: { ...liveKit, role: 'host' } });
      }
      let liveMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/join$/);
      if (method === 'POST' && liveMatch) {
        if (!isLiveKitConfigured()) return json(res, 503, { error: 'Live video is not configured for Minglora.' });
        const session = (db.liveSessions || []).find(item => item.id === liveMatch[1] && item.status === 'live');
        if (!session || blockedBetween(user.id, session.hostId)) return json(res, 404, { error: 'Live session not found.' });
        const isFriend = (db.friendships || []).some(friendship =>
          friendship.status === 'accepted' &&
          ((friendship.from === user.id && friendship.to === session.hostId) ||
           (friendship.to === user.id && friendship.from === session.hostId))
        );
        const allowed = session.hostId === user.id ||
          session.visibility === 'public' ||
          (session.visibility === 'friends' && isFriend);
        if (!allowed) return json(res, 404, { error: 'Live session not found.' });
        const role = session.hostId === user.id ? 'host' : 'viewer';
        const liveKit = await createLiveKitToken({
          identity: user.id,
          name: user.name,
          roomName: session.roomName,
          canPublish: role === 'host'
        });
        db.liveParticipants = db.liveParticipants || [];
        const existing = db.liveParticipants.find(participant =>
          participant.sessionId === session.id && participant.userId === user.id && !participant.leftAt
        );
        if (existing) {
          existing.joinedAt = now();
          existing.role = role;
        } else {
          db.liveParticipants.push({ id: uid(), sessionId: session.id, userId: user.id, role, joinedAt: now(), leftAt: null });
        }
        await saveStore();
        return json(res, 200, { session, liveKit: { ...liveKit, role } });
      }
      liveMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/leave$/);
      if (method === 'POST' && liveMatch) {
        const session = (db.liveSessions || []).find(item => item.id === liveMatch[1]);
        if (!session) return json(res, 404, { error: 'Live session not found.' });
        const participant = (db.liveParticipants || []).find(item =>
          item.sessionId === session.id && item.userId === user.id && !item.leftAt
        );
        if (!participant) return json(res, 404, { error: 'You are not an active participant in this live session.' });
        participant.leftAt = now();
        await saveStore();
        return json(res, 200, { ok: true });
      }
      liveMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/end$/);
      if (method === 'POST' && liveMatch) {
        const session = (db.liveSessions || []).find(item => item.id === liveMatch[1]);
        if (!session) return json(res, 404, { error: 'Live session not found.' });
        if (session.hostId !== user.id) return json(res, 403, { error: 'Only the host can end this live session.' });
        if (session.status !== 'ended') {
          session.status = 'ended';
          session.endedAt = now();
          (db.liveParticipants || []).filter(item => item.sessionId === session.id && !item.leftAt)
            .forEach(item => { item.leftAt = session.endedAt; });
          await saveStore();
        }
        return json(res, 200, { ok: true, session });
      }
      if (method==='GET' && p==='/api/feed') {
        const scope=String(url.searchParams.get('scope')||'all');
        if(!['all','following','friends'].includes(scope))return json(res,400,{error:'Feed scope must be all, following, or friends.'});
        let eligibleIds=null;
        if(scope==='following'){
          eligibleIds=new Set([user.id,...(db.follows||[]).filter(f=>f.followerId===user.id).map(f=>f.followedId)]);
        } else if(scope==='friends'){
          eligibleIds=new Set([user.id,...db.friendships.filter(f=>f.status==='accepted'&&(f.from===user.id||f.to===user.id)).map(f=>f.from===user.id?f.to:f.from)]);
        }
        const posts=await Promise.all(db.posts.filter(x=>!blockedBetween(user.id,x.userId)&&canViewProfile(user.id,db.users.find(profile=>profile.id===x.userId))&&(!eligibleIds||eligibleIds.has(x.userId)))
          .slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(x=>publicPost(x,user.id)));
        if (!url.searchParams.has('limit') && !url.searchParams.has('cursor')) return json(res,200,{posts,scope});
        try {
          const page=paginateDescending(posts,{limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):20,cursor:url.searchParams.get('cursor')});
          return json(res,200,{posts:page.items,nextCursor:page.nextCursor,hasMore:page.hasMore,scope});
        } catch (e) { return json(res,400,{error:e.message}); }
      }
      if(method==='POST'&&p==='/api/posts'){
        const validation=validatePostInput(input);if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')});
        const {text,mediaIds}=validation.value;const ids=[...new Set(mediaIds)];
        const assets=ids.map(id=>(db.mediaAssets||[]).find(asset=>asset.id===id&&asset.ownerId===user.id&&asset.slot==='post'&&asset.status==='uploaded'));
        if(assets.some(asset=>!asset))return json(res,400,{error:'One or more selected media files are no longer available. Upload them again.'});
        const post={id:uid(),userId:user.id,text,mediaIds:ids,createdAt:now(),reactions:{},comments:[]};
        assets.forEach(asset=>{asset.status='attached';asset.attachedTo=post.id;});db.posts.unshift(post);await saveStore();return json(res,201,{post:await publicPost(post,user.id)});
      }
      let m=p.match(/^\/api\/posts\/([^/]+)$/);
      if(method==='PATCH'&&m){
        const post=db.posts.find(x=>x.id===m[1]);
        if(!post)return json(res,404,{error:'Post not found.'});
        if(post.userId!==user.id)return json(res,403,{error:'Only the post author can edit this post.'});
        const validation=validatePostInput({text:input.text===undefined?post.text:input.text,mediaIds:input.mediaIds===undefined?(post.mediaIds||[]):input.mediaIds,imageUrl:input.imageUrl});
        if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')});
        const ids=[...new Set(validation.value.mediaIds)],assets=ids.map(id=>(db.mediaAssets||[]).find(asset=>asset.id===id&&asset.ownerId===user.id&&asset.slot==='post'&&(asset.status==='uploaded'||asset.attachedTo===post.id)));
        if(assets.some(asset=>!asset))return json(res,400,{error:'One or more selected media files are not available to this post.'});
        (db.mediaAssets||[]).filter(asset=>asset.attachedTo===post.id&&!ids.includes(asset.id)).forEach(asset=>{asset.status='uploaded';delete asset.attachedTo;});
        assets.forEach(asset=>{asset.status='attached';asset.attachedTo=post.id;});
        post.text=validation.value.text;post.mediaIds=ids;post.updatedAt=now();await saveStore();return json(res,200,{post:await publicPost(post,user.id)});
      }
      if(method==='DELETE'&&m){
        const post=db.posts.find(x=>x.id===m[1]);
        if(!post)return json(res,404,{error:'Post not found.'});
        if(post.userId!==user.id)return json(res,403,{error:'Only the post author can delete this post.'});
        db.posts=db.posts.filter(x=>x.id!==post.id);
        db.savedPosts=(db.savedPosts||[]).filter(saved=>saved.postId!==post.id);
        await saveStore();return json(res,200,{ok:true,id:post.id});
      }
      if(method==='GET'&&p==='/api/saved-posts'){
        const posts=await Promise.all((db.savedPosts||[]).filter(saved=>saved.userId===user.id).map(saved=>db.posts.find(post=>post.id===saved.postId)).filter(post=>post&&!blockedBetween(user.id,post.userId)).map(post=>publicPost(post,user.id)));
        return json(res,200,{posts});
      }
      m=p.match(/^\/api\/posts\/([^/]+)\/save$/);
      if((method==='POST'||method==='DELETE')&&m){
        const post=db.posts.find(x=>x.id===m[1]);
        if(!post||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});
        const exists=(db.savedPosts||[]).some(saved=>saved.userId===user.id&&saved.postId===post.id);
        if(method==='POST'&&!exists)db.savedPosts.push({id:uid(),userId:user.id,postId:post.id,createdAt:now()});
        if(method==='DELETE'&&exists)db.savedPosts=db.savedPosts.filter(saved=>!(saved.userId===user.id&&saved.postId===post.id));
        await saveStore();return json(res,200,{saved:method==='POST'});
      }
      m=p.match(/^\/api\/posts\/([^/]+)\/reactions$/);
      if(method==='POST'&&m){const post=db.posts.find(x=>x.id===m[1]);if(!post||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});post.reactions ||= {};const reaction=String(input.reaction||'like');if(!['like','love','care','haha','wow','sad','angry'].includes(reaction))return json(res,400,{error:'Unsupported reaction.'});if(post.reactions[user.id]===reaction)delete post.reactions[user.id];else post.reactions[user.id]=reaction;if(post.userId!==user.id)notify(post.userId,user.id,'reaction',`${user.name} reacted to your post.`);await saveStore();return json(res,200,{post:await publicPost(post,user.id)});}
      m=p.match(/^\/api\/posts\/([^/]+)\/comments\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const post=db.posts.find(x=>x.id===m[1]);
        if(!post||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});
        const comment=(post.comments||[]).find(x=>x.id===m[2]);
        if(!comment)return json(res,404,{error:'Comment not found.'});
        if(comment.userId!==user.id&&post.userId!==user.id)return json(res,403,{error:'Only the comment author or post author can delete this comment.'});
        post.comments=post.comments.filter(x=>x.id!==comment.id);
        await saveStore();return json(res,200,{ok:true,id:comment.id});
      }
      m=p.match(/^\/api\/posts\/([^/]+)\/comments$/);
      if(method==='POST'&&m){const post=db.posts.find(x=>x.id===m[1]);const text=String(input.text||'').trim();if(!post||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});if(!text||text.length>2000)return json(res,400,{error:'Comment must contain 1–2000 characters.'});const comment={id:uid(),userId:user.id,text,createdAt:now()};post.comments.push(comment);if(post.userId!==user.id)notify(post.userId,user.id,'comment',`${user.name} commented on your post.`);await saveStore();return json(res,201,{comment:{...comment,author:safeUser(user)}});}
      if(method==='GET'&&p==='/api/users')return json(res,200,{users:db.users.filter(u=>u.id!==user.id&&!blockedBetween(user.id,u.id)&&canViewProfile(user.id,u)).map(u=>({...safeUser(u),friendship:db.friendships.find(f=>(f.from===user.id&&f.to===u.id)||(f.to===user.id&&f.from===u.id))?.status||null,following:(db.follows||[]).some(f=>f.followerId===user.id&&f.followedId===u.id)}))});
      m=p.match(/^\/api\/users\/([^/]+)\/follow$/);
      if((method==='POST'||method==='DELETE')&&m){
        const target=db.users.find(u=>u.id===m[1]);
        if(!target||target.id===user.id)return json(res,400,{error:'Choose another valid account.'});
        if(blockedBetween(user.id,target.id))return json(res,403,{error:'This relationship is unavailable.'});
        const exists=(db.follows||[]).some(f=>f.followerId===user.id&&f.followedId===target.id);
        if(method==='POST'&&!exists){db.follows.push({id:uid(),followerId:user.id,followedId:target.id,createdAt:now()});notify(target.id,user.id,'follow',`${user.name} started following you.`);}
        if(method==='DELETE'&&exists)db.follows=db.follows.filter(f=>!(f.followerId===user.id&&f.followedId===target.id));
        const mutual=(db.follows||[]).some(f=>f.followerId===user.id&&f.followedId===target.id)&&(db.follows||[]).some(f=>f.followerId===target.id&&f.followedId===user.id);
        let friendship=db.friendships.find(f=>(f.from===user.id&&f.to===target.id)||(f.from===target.id&&f.to===user.id));
        if(mutual&&!friendship){friendship={id:uid(),from:user.id,to:target.id,status:'accepted',source:'mutual_follow',createdAt:now(),updatedAt:now()};db.friendships.push(friendship);notify(target.id,user.id,'friend',`You and ${user.name} are now friends because you follow each other.`);notify(user.id,target.id,'friend',`You and ${target.name} are now friends because you follow each other.`);}
        else if(mutual&&friendship&&friendship.status!=='accepted'){friendship.status='accepted';friendship.source='mutual_follow';friendship.updatedAt=now();}
        else if(!mutual&&method==='DELETE'&&friendship?.source==='mutual_follow'){db.friendships=db.friendships.filter(item=>item.id!==friendship.id);}
        await saveStore();return json(res,200,{following:method==='POST',friends:mutual,friendship:friendship?.status||null});
      }
      m=p.match(/^\/api\/users\/([^/]+)\/block$/);
      if((method==='POST'||method==='DELETE')&&m){
        const target=db.users.find(u=>u.id===m[1]);
        if(!target||target.id===user.id)return json(res,400,{error:'Choose another valid account.'});
        const exists=(db.blocks||[]).some(b=>b.blockerId===user.id&&b.blockedId===target.id);
        if(method==='POST'&&!exists){
          db.blocks.push({id:uid(),blockerId:user.id,blockedId:target.id,createdAt:now()});
          db.follows=(db.follows||[]).filter(f=>!((f.followerId===user.id&&f.followedId===target.id)||(f.followerId===target.id&&f.followedId===user.id)));
          db.friendships=db.friendships.filter(f=>!((f.from===user.id&&f.to===target.id)||(f.from===target.id&&f.to===user.id)));
        }
        if(method==='DELETE'&&exists)db.blocks=db.blocks.filter(b=>!(b.blockerId===user.id&&b.blockedId===target.id));
        await saveStore();return json(res,200,{blocked:method==='POST'});
      }
      if(method==='GET'&&p==='/api/blocks')return json(res,200,{users:(db.blocks||[]).filter(b=>b.blockerId===user.id).map(b=>safeUser(db.users.find(u=>u.id===b.blockedId))).filter(Boolean)});
      m=p.match(/^\/api\/users\/([^/]+)\/(followers|following)$/);
      if(method==='GET'&&m){
        const target=db.users.find(u=>u.id===m[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        const rows=m[2]==='followers'?(db.follows||[]).filter(f=>f.followedId===target.id):(db.follows||[]).filter(f=>f.followerId===target.id);
        const users=rows.map(f=>db.users.find(u=>u.id===(m[2]==='followers'?f.followerId:f.followedId))).filter(u=>u&&!blockedBetween(user.id,u.id)&&canViewProfile(user.id,u)).map(safeUser);
        return json(res,200,{users,count:users.length});
      }
      m=p.match(/^\/api\/users\/([^/]+)$/);
      if(method==='GET'&&m){const target=db.users.find(u=>u.id===m[1]);if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});return json(res,200,{user:safeUser(target),posts:await Promise.all(db.posts.filter(x=>x.userId===target.id&&!blockedBetween(user.id,x.userId)).map(x=>publicPost(x,user.id))),friendship:db.friendships.find(f=>(f.from===user.id&&f.to===target.id)||(f.to===user.id&&f.from===target.id))?.status||null,following:(db.follows||[]).some(f=>f.followerId===user.id&&f.followedId===target.id),followersCount:(db.follows||[]).filter(f=>f.followedId===target.id&&!blockedBetween(user.id,f.followerId)).length,followingCount:(db.follows||[]).filter(f=>f.followerId===target.id&&!blockedBetween(user.id,f.followedId)).length}); }
      if(method==='PATCH'&&p==='/api/users/me'){
        const validation=validateProfilePatch(input);if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')});
        if(validation.value.username&&db.users.some(item=>item.id!==user.id&&normalizeUsername(item.username)===validation.value.username))return json(res,409,{error:'That username is already in use.'});
        Object.assign(user,validation.value);await saveStore();return json(res,200,{user:safeUser(user)});
      }
      m=p.match(/^\/api\/friends\/([^/]+)\/request$/);
      if(method==='POST'&&m){const recipient=db.users.find(u=>u.id===m[1]);if(m[1]===user.id||!recipient)return json(res,400,{error:'Invalid friend.'});if(getUserSettings(recipient).privacy.allowFriendRequests===false)return json(res,403,{error:'This member is not accepting friend requests.'});if(blockedBetween(user.id,m[1]))return json(res,403,{error:'This relationship is unavailable.'});let f=db.friendships.find(x=>(x.from===user.id&&x.to===m[1])||(x.to===user.id&&x.from===m[1]));if(f){if(f.status==='pending'&&f.to===user.id){f.status='accepted';f.updatedAt=now();notify(m[1],user.id,'friend',`${user.name} accepted your friend request.`);}else if(['declined','cancelled'].includes(f.status)){f.from=user.id;f.to=m[1];f.status='pending';f.createdAt=now();f.updatedAt=now();notify(m[1],user.id,'friend',`${user.name} sent you a friend request.`);}else return json(res,409,{error:'A friend request or friendship already exists.'});}else{f={id:uid(),from:user.id,to:m[1],status:'pending',createdAt:now()};db.friendships.push(f);notify(m[1],user.id,'friend',`${user.name} sent you a friend request.`);}await saveStore();return json(res,200,{friendship:f});}
      m=p.match(/^\/api\/friends\/([^/]+)\/accept$/);
      if(method==='POST'&&m){const f=db.friendships.find(x=>x.from===m[1]&&x.to===user.id&&x.status==='pending');if(!f)return json(res,404,{error:'Pending request not found.'});f.status='accepted';notify(m[1],user.id,'friend',`${user.name} accepted your friend request.`);await saveStore();return json(res,200,{friendship:f});}
      m=p.match(/^\/api\/friends\/([^/]+)\/decline$/);
      if(method==='POST'&&m){
        const request=db.friendships.find(f=>f.from===m[1]&&f.to===user.id&&f.status==='pending');
        if(!request)return json(res,404,{error:'Pending friend request not found.'});
        request.status='declined';request.updatedAt=now();
        notify(request.from,user.id,'friend',`${user.name} declined your friend request.`);
        await saveStore();return json(res,200,{friendship:request});
      }
      m=p.match(/^\/api\/friends\/([^/]+)$/);
      if(method==='DELETE'&&m){
        if(blockedBetween(user.id,m[1]))return json(res,404,{error:'Friendship not found.'});
        const friendship=db.friendships.find(f=>(f.from===user.id&&f.to===m[1]||f.from===m[1]&&f.to===user.id)&&['accepted','pending'].includes(f.status));
        if(!friendship)return json(res,404,{error:'Friendship not found.'});
        if(friendship.status==='pending'&&friendship.from!==user.id)return json(res,403,{error:'Only the requester can cancel a pending request. Use decline for incoming requests.'});
        const wasAccepted=friendship.status==='accepted';
        db.friendships=db.friendships.filter(f=>f.id!==friendship.id);
        await saveStore();return json(res,200,{removed:true,wasAccepted});
      }
      if(method==='GET'&&p==='/api/friends'){
        const followed=(db.follows||[]).filter(edge=>edge.followerId===user.id).map(edge=>edge.followedId);
        for(const targetId of followed){
          if(!(db.follows||[]).some(edge=>edge.followerId===targetId&&edge.followedId===user.id)||blockedBetween(user.id,targetId))continue;
          let friendship=db.friendships.find(item=>(item.from===user.id&&item.to===targetId)||(item.to===user.id&&item.from===targetId));
          if(!friendship){friendship={id:uid(),from:user.id,to:targetId,status:'accepted',source:'mutual_follow',createdAt:now(),updatedAt:now()};db.friendships.push(friendship);}
          else if(friendship.status!=='accepted'&&friendship.source!=='manual_request'){friendship.status='accepted';friendship.source='mutual_follow';friendship.updatedAt=now();}
        }
        await saveStore();
        const list=db.friendships.filter(f=>f.status==='accepted'&&(f.from===user.id||f.to===user.id)&&!blockedBetween(user.id,f.from===user.id?f.to:f.from)).map(f=>safeUser(db.users.find(u=>u.id===(f.from===user.id?f.to:f.from))));
        const incoming=db.friendships.filter(f=>f.to===user.id&&f.status==='pending'&&!blockedBetween(user.id,f.from)).map(f=>({...safeUser(db.users.find(u=>u.id===f.from)),requestId:f.id}));
        return json(res,200,{friends:list,incoming});
      }
      if(method==='GET'&&p==='/api/groups')return json(res,200,{groups:db.groups.map(g=>({...g,owner:safeUser(db.users.find(u=>u.id===g.ownerId)),memberCount:g.members.length,isMember:g.members.includes(user.id)}))});
      if(method==='POST'&&p==='/api/groups'){
        const name=String(input.name||'').trim(),description=String(input.description||'').trim();
        if(name.length<3||name.length>80||description.length>500)return json(res,400,{error:'Group name must be 3–80 characters; description max 500.'});
        const g={id:uid(),name,description,ownerId:user.id,members:[user.id],createdAt:now()};db.groups.unshift(g);await saveStore();return json(res,201,{group:g});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/posts$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});
        if(!canPublishGroupPost(group,user.id))return json(res,403,{error:'Join this group before posting.'});
        const text=String(input.text||'').trim();
        if(!text||text.length>5000)return json(res,400,{error:'Group post must contain 1–5000 characters.'});
        const post={id:uid(),groupId:group.id,userId:user.id,text,createdAt:now(),updatedAt:now()};
        db.groupPosts.push(post);await saveStore();return json(res,201,{post:{...post,author:safeUser(user)}});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/posts\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});
        const post=(db.groupPosts||[]).find(x=>x.groupId===group.id&&x.id===m[2]);
        if(!post)return json(res,404,{error:'Group post not found.'});
        if(!canDeleteGroupPost(group,post,user.id))return json(res,403,{error:'Only the post author or group owner can delete this post.'});
        db.groupPosts=db.groupPosts.filter(x=>x.id!==post.id);await saveStore();return json(res,200,{ok:true,id:post.id});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/join$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});
        if(!group.members.includes(user.id))group.members.push(user.id);await saveStore();return json(res,200,{group:{...group,isMember:true}});
      }
      if(method==='DELETE'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});
        if(!canLeaveGroup(group,user.id))return json(res,409,{error:'The group owner cannot leave without transferring ownership or deleting the group.'});
        group.members=group.members.filter(id=>id!==user.id);await saveStore();return json(res,200,{left:!group.members.includes(user.id)});
      }
      m=p.match(/^\/api\/groups\/([^/]+)$/);
      if(method==='GET'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});
        const posts=(db.groupPosts||[]).filter(post=>post.groupId===group.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(post=>({...post,author:safeUser(db.users.find(u=>u.id===post.userId))}));
        return json(res,200,{group:{...group,owner:safeUser(db.users.find(u=>u.id===group.ownerId)),members:group.members.map(id=>safeUser(db.users.find(u=>u.id===id))).filter(Boolean),memberCount:group.members.length,isMember:group.members.includes(user.id)},posts});
      }
      if(method==='GET'&&p==='/api/stories'){
        await pruneExpiredStories();
        const visible=(db.stories||[]).filter(story=>canViewStory(user.id,story)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        const stories=await Promise.all(visible.map(story=>publicStory(story,user.id)));
        return json(res,200,{stories});
      }
      if(method==='POST'&&p==='/api/stories'){
        const text=String(input.text||'').trim(),mediaId=String(input.mediaId||''),audience=String(input.audience||'public');
        if(input.imageUrl!==undefined&&input.imageUrl!=='')return json(res,400,{error:'Image URLs are not accepted. Choose a photo or video from your device.'});
        if(!['public','friends','followers','private'].includes(audience))return json(res,400,{error:'Unsupported story audience.'});
        if(!text&&!mediaId)return json(res,400,{error:'Add text or select a photo/video from your device.'});
        if(text.length>1000)return json(res,400,{error:'Story text must be 1000 characters or fewer.'});
        let asset=null;
        if(mediaId){asset=(db.mediaAssets||[]).find(item=>item.id===mediaId&&item.ownerId===user.id&&item.slot==='story'&&item.status==='uploaded');if(!asset)return json(res,400,{error:'The selected story media is unavailable. Select it again.'});}
        const createdAt=now();
        const story={id:uid(),userId:user.id,text,mediaId:asset?.id||null,audience,createdAt,expiresAt:new Date(Date.now()+24*60*60*1000).toISOString()};
        if(asset){asset.status='attached';asset.attachedTo=story.id;}
        db.stories.push(story);await saveStore();return json(res,201,{story:await publicStory(story,user.id)});
      }
      m=p.match(/^\/api\/stories\/([^/]+)\/view$/);
      if(method==='POST'&&m){
        await pruneExpiredStories();
        const story=db.stories.find(x=>x.id===m[1]);
        if(!story||!canViewStory(user.id,story))return json(res,404,{error:'Story not found.'});
        if(story.userId!==user.id&&!(db.storyViews||[]).some(view=>view.storyId===story.id&&view.viewerId===user.id)){
          db.storyViews.push({storyId:story.id,viewerId:user.id,viewedAt:now()});await saveStore();
        }
        return json(res,200,{story:await publicStory(story,user.id,true)});
      }
      m=p.match(/^\/api\/stories\/([^/]+)$/);
      if(method==='DELETE'&&m){
        await pruneExpiredStories();
        const story=db.stories.find(x=>x.id===m[1]);
        if(!story)return json(res,404,{error:'Story not found.'});
        if(story.userId!==user.id)return json(res,403,{error:'Only the story author can delete this story.'});
        db.stories=db.stories.filter(x=>x.id!==story.id);db.storyViews=(db.storyViews||[]).filter(view=>view.storyId!==story.id);if(story.mediaId){const asset=(db.mediaAssets||[]).find(item=>item.id===story.mediaId);if(asset){asset.status='deleted';asset.deletedAt=now();}}
        await saveStore();return json(res,200,{ok:true,id:story.id});
      }
      if(method==='GET'&&p==='/api/pages'){
        const pages=(db.pages||[]).filter(page=>page.status==='active'&&!blockedBetween(user.id,page.createdBy)).map(page=>({...page,owner:safeUser(db.users.find(u=>u.id===page.createdBy)),followerCount:(db.pageFollows||[]).filter(f=>f.pageId===page.id).length,isFollowing:(db.pageFollows||[]).some(f=>f.pageId===page.id&&f.userId===user.id),myRole:pageRole(page.id,user.id)}));
        return json(res,200,{pages});
      }
      if(method==='POST'&&p==='/api/pages'){
        const validation=validatePageInput(input,db.pages || []);
        if(!validation.valid)return json(res,validation.errors.some(error=>error.includes('already taken'))?409:400,{error:validation.errors.join(' ')});
        const {handle,title,description,category}=validation.value;
        const page={id:uid(),handle,title,description,category,status:'active',createdBy:user.id,createdAt:now()};
        db.pages.push(page);db.pageRoles.push({pageId:page.id,userId:user.id,role:'owner',createdAt:now()});await saveStore();
        return json(res,201,{page:{...page,owner:safeUser(user),followerCount:0,isFollowing:false,myRole:'owner'}});
      }
      m=p.match(/^\/api\/pages\/([^/]+)\/follow$/);
      if((method==='POST'||method==='DELETE')&&m){
        const page=(db.pages||[]).find(item=>item.id===m[1]&&item.status==='active');
        if(!page||blockedBetween(user.id,page.createdBy))return json(res,404,{error:'Page not found.'});
        if(page.createdBy===user.id)return json(res,400,{error:'You already manage this Page.'});
        const exists=(db.pageFollows||[]).some(f=>f.pageId===page.id&&f.userId===user.id);
        if(method==='POST'&&!exists)db.pageFollows.push({pageId:page.id,userId:user.id,createdAt:now()});
        if(method==='DELETE'&&exists)db.pageFollows=db.pageFollows.filter(f=>!(f.pageId===page.id&&f.userId===user.id));
        await saveStore();return json(res,200,{isFollowing:method==='POST'});
      }
      m=p.match(/^\/api\/pages\/([^/]+)\/posts$/);
      if(method==='POST'&&m){
        const page=(db.pages||[]).find(item=>item.id===m[1]&&item.status==='active');
        if(!page||blockedBetween(user.id,page.createdBy))return json(res,404,{error:'Page not found.'});
        if(!canManagePage(page.id,user.id))return json(res,403,{error:'Only Page owners, admins or editors can publish.'});
        const validation=validatePostInput({text:input.text,mediaIds:input.mediaIds,imageUrl:input.imageUrl});
        if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')});
        const ids=[...new Set(validation.value.mediaIds)],assets=ids.map(id=>(db.mediaAssets||[]).find(asset=>asset.id===id&&asset.ownerId===user.id&&asset.slot==='post'&&asset.status==='uploaded'));
        if(assets.some(asset=>!asset))return json(res,400,{error:'One or more selected Page media files are unavailable.'});
        const post={id:uid(),pageId:page.id,publishedBy:user.id,text:validation.value.text,mediaIds:ids,createdAt:now(),updatedAt:now(),status:'published'};
        assets.forEach(asset=>{asset.status='attached';asset.attachedTo=post.id;});
        db.pagePosts.push(post);await saveStore();return json(res,201,{post:{...await publicPagePost(post),page:{id:page.id,title:page.title,handle:page.handle}}});
      }
      m=p.match(/^\/api\/pages\/([^/]+)\/posts\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const page=(db.pages||[]).find(item=>item.id===m[1]);if(!page)return json(res,404,{error:'Page not found.'});
        const post=(db.pagePosts||[]).find(item=>item.id===m[2]&&item.pageId===page.id);
        if(!post)return json(res,404,{error:'Page post not found.'});
        if(!canDeletePagePost(db.pageRoles || [],post,user.id))return json(res,403,{error:'Only the publisher or Page owner/admin can delete this post.'});
        db.pagePosts=db.pagePosts.filter(item=>item.id!==post.id);(post.mediaIds||[]).forEach(id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id);if(asset){asset.status='deleted';asset.deletedAt=now();}});await saveStore();return json(res,200,{ok:true,id:post.id});
      }
      m=p.match(/^\/api\/pages\/([^/]+)$/);
      if(method==='GET'&&m){
        const page=(db.pages||[]).find(item=>item.id===m[1]&&item.status==='active');
        if(!page||blockedBetween(user.id,page.createdBy))return json(res,404,{error:'Page not found.'});
        const posts=await Promise.all((db.pagePosts||[]).filter(post=>post.pageId===page.id&&post.status==='published').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(async post=>({...await publicPagePost(post),page:{id:page.id,title:page.title,handle:page.handle}})));
        return json(res,200,{page:{...page,owner:safeUser(db.users.find(u=>u.id===page.createdBy)),followerCount:(db.pageFollows||[]).filter(f=>f.pageId===page.id).length,isFollowing:(db.pageFollows||[]).some(f=>f.pageId===page.id&&f.userId===user.id),myRole:pageRole(page.id,user.id)},posts});
      }
      m=p.match(/^\/api\/pages\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const page=(db.pages||[]).find(item=>item.id===m[1]);
        if(!page)return json(res,404,{error:'Page not found.'});
        if(!canDeletePage(db.pages || [],page.id,user.id))return json(res,403,{error:'Only the Page owner can delete this Page.'});
        db.pages=db.pages.filter(item=>item.id!==page.id);
        db.pageRoles=db.pageRoles.filter(role=>role.pageId!==page.id);
        db.pageFollows=db.pageFollows.filter(f=>f.pageId!==page.id);
        db.pagePosts=db.pagePosts.filter(post=>post.pageId!==page.id);
        await saveStore();return json(res,200,{ok:true,id:page.id});
      }
      if(method==='GET'&&p==='/api/messages'){const peers=[...new Set(db.messages.filter(x=>x.from===user.id||x.to===user.id).map(x=>x.from===user.id?x.to:x.from))].filter(id=>!blockedBetween(user.id,id));return json(res,200,{conversations:peers.map(id=>({user:safeUser(db.users.find(u=>u.id===id)),messages:db.messages.filter(x=>(x.from===user.id&&x.to===id)||(x.from===id&&x.to===user.id)).map(x=>({...x,author:safeUser(db.users.find(u=>u.id===x.from))})).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt))}))});}
      if(method==='POST'&&p==='/api/messages'){const to=String(input.to||''),text=String(input.text||'').trim(),recipient=db.users.find(u=>u.id===to);if(!recipient||to===user.id||blockedBetween(user.id,to)||!text||text.length>3000)return json(res,400,{error:'Choose a recipient and enter a message (max 3000 characters).'});const audience=getUserSettings(recipient).privacy.messageAudience;if(audience!=='everyone'&&!isFriend(user.id,to))return json(res,403,{error:'This member only accepts new messages from confirmed friends.'});const msg={id:uid(),from:user.id,to,text,createdAt:now(),read:false};db.messages.push(msg);notify(to,user.id,'message',`${user.name} sent you a message.`);await saveStore();return json(res,201,{message:{...msg,author:safeUser(user)}});}
      if(method==='GET'&&p==='/api/notifications'){const prefs=getUserSettings(user).notifications;const notifications=prefs.inApp?db.notifications.filter(n=>n.userId===user.id&&(!n.actorId||!blockedBetween(user.id,n.actorId))&&(n.type==='friend'?prefs.friendRequests:n.type==='message'?prefs.messages:['reaction','comment','follow'].includes(n.type)?prefs.interactions:true)).map(n=>({...n,actor:safeUser(db.users.find(u=>u.id===n.actorId))})):[];return json(res,200,{notifications});}
      if(method==='POST'&&p==='/api/notifications/read'){db.notifications.filter(n=>n.userId===user.id).forEach(n=>n.read=true);await saveStore();return json(res,200,{ok:true});}
      if(method==='GET'&&p==='/api/search'){const q=(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100);if(!q)return json(res,200,{users:[],posts:[],groups:[],pages:[]});return json(res,200,{users:db.users.filter(u=>u.id!==user.id&&!blockedBetween(user.id,u.id)&&canViewProfile(user.id,u)&&(u.name.toLowerCase().includes(q)||u.username.includes(q))).map(safeUser),posts:await Promise.all(db.posts.filter(x=>!blockedBetween(user.id,x.userId)&&x.text.toLowerCase().includes(q)).map(x=>publicPost(x,user.id))),groups:db.groups.filter(g=>(g.name+' '+g.description).toLowerCase().includes(q)),pages:(db.pages||[]).filter(page=>page.status==='active'&&!blockedBetween(user.id,page.createdBy)&&(page.title+' '+page.handle+' '+page.description+' '+page.category).toLowerCase().includes(q)).map(page=>({...page,owner:safeUser(db.users.find(u=>u.id===page.createdBy)),followerCount:(db.pageFollows||[]).filter(f=>f.pageId===page.id).length,isFollowing:(db.pageFollows||[]).some(f=>f.pageId===page.id&&f.userId===user.id)}))});}
      return json(res,404,{error:'API route not found.'});
    } catch(e) { if(process.env.NODE_ENV==='test')return json(res,e.status||500,{error:e.message,stack:e.stack}); console.error('[Minglora API error]',e); return json(res,e.status||500,{error:e.status?e.message:'Internal server error.'}); }
  }
  const rel=p==='/'?'index.html':decodeURIComponent(p.slice(1)); const file=path.resolve(publicDir,rel);
  if(!file.startsWith(publicDir+path.sep)&&file!==path.join(publicDir,'index.html'))return json(res,403,{error:'Forbidden'});
  fs.readFile(file,(err,data)=>{if(err){fs.readFile(path.join(publicDir,'index.html'),(e,d)=>{if(e)return json(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':MIME['.html'],...SECURITY_HEADERS});res.end(d);});return;}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream',...SECURITY_HEADERS});res.end(data);});
}
const server=http.createServer((req,res)=>{route(req,res).catch(()=>json(res,500,{error:'Unexpected server error.'}));});
server.listen(PORT,'0.0.0.0',async()=>{
  console.log(`Minglora listening on port ${PORT}`);
  const persistence = await persistenceHealth();
  console.info('[Minglora readiness]', JSON.stringify({
    authProvider: AUTH_PROVIDER,
    authConfigured: AUTH_PROVIDER === 'legacy' || supabaseAuthConfigured(),
    persistenceDriver: persistence.driver,
    persistenceDurable: persistence.durable,
    persistenceReady: persistence.ready
  }));
});
