import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import webpush from 'web-push';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { db, saveStore, uid, now, persistenceHealth, requestSupabaseState, isSupabasePersistence } from './store.js';
import { createLiveKitToken, deleteLiveKitRoom, ensureLiveKitRoom, isLiveKitConfigured, listLiveKitParticipants, verifyLiveKitConnection, LIVEKIT_TRACK_SOURCE } from '../backend/modules/live/livekit.js';
import { canAccessMeetWaveRoom, canReceiveMeetWaveInvitation, meetWaveRoomJoinAvailability, normalizeMeetWaveMessage, validateMeetWaveRoomInput } from '../backend/modules/meetwave/service.js';
import { CALL_RING_TIMEOUT_MS, CALL_MAX_PARTICIPANTS, CALL_RINGTONE_MIME_TYPES, CALL_RINGTONE_MAX_BYTES, countCallParticipants, expireRingingCall, isCallParticipantBusy, validateCallRingtoneUpload } from '../backend/modules/calls/service.js';
import { normalizeEmail, normalizeUsername, normalizeContactPhone, validateContactPhone, validateEmail, validateUsername, validatePostInput, validateProfilePatch } from './domain/validation.js';
import { createSessionAuthManager, getAuthTokenExpiresAt } from './session-auth.js';
import { paginateDescending } from './domain/pagination.js';
import { canViewStory as canViewStoryPolicy, removeExpiredStories } from '../backend/modules/stories/service.js';
import { canPublishGroupPost, canDeleteGroupPost, canLeaveGroup } from '../backend/modules/groups/service.js';
import { validatePageInput, canManagePage as canManagePagePolicy, canDeletePagePost, canDeletePage } from '../backend/modules/pages/service.js';
import { MARKETPLACE_PRODUCT_CATEGORIES, MARKETPLACE_SERVICE_CATEGORIES, MARKETPLACE_CURRENCIES, validateMarketplaceListingInput, canManageMarketplaceListing, isMarketplaceListingActive } from '../backend/modules/marketplace/service.js';
import { validateMarketplaceSellerApplication, calculateMarketplaceCheckoutQuote, validateMarketplaceServiceBookingInput, transitionMarketplaceBooking } from '../backend/modules/marketplace/commerce.js';
import { validateJobPostingInput, validateJobApplicationInput, transitionJobApplication } from '../backend/modules/jobs/service.js';
import { recordProfileView, touchProfilePresence, getProfileViewStats } from '../backend/modules/profiles/service.js';
import { supabaseAuthConfigured, supabaseSignUp, supabaseSignIn, supabaseUpdatePassword, supabaseListFactors, supabaseEnrollTotp, supabaseChallengeFactor, supabaseVerifyFactor, supabaseUnenrollFactor, supabaseRefreshSession, supabaseRequestPasswordReset, supabaseCompletePasswordReset, supabaseUpdateEmail, supabaseRequestPhoneChange, supabaseVerifyPhoneChange, supabaseUpdateUserMetadata, supabaseUpdateProfile } from './supabase-auth.js';
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
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.gltf':'model/gltf+json; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8' };

let paypalAccessTokenCache=null;
function paypalConfig(){
  const clientId=String(process.env.PAYPAL_CLIENT_ID||'').trim();
  const clientSecret=String(process.env.PAYPAL_CLIENT_SECRET||'').trim();
  const mode=String(process.env.PAYPAL_MODE||process.env.PAYPAL_ENVIRONMENT||(process.env.NODE_ENV==='production'?'live':'sandbox')).trim().toLowerCase();
  let base=String(process.env.PAYPAL_API_BASE_URL||'').trim();
  while(base.endsWith('/'))base=base.slice(0,-1);
  if(!base)base=mode==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
  return {clientId,clientSecret,webhookId:String(process.env.PAYPAL_WEBHOOK_ID||'').trim(),base,configured:Boolean(clientId&&clientSecret)};
}
async function paypalToken(){
  const cfg=paypalConfig();
  if(!cfg.configured)throw Object.assign(new Error('PayPal is not configured for Minglora yet. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to the Minglora server environment.'),{status:503});
  if(paypalAccessTokenCache&&paypalAccessTokenCache.expiresAt>Date.now()+60000)return paypalAccessTokenCache.value;
  let response;
  try{
    response=await fetch(cfg.base+'/v1/oauth2/token',{
      method:'POST',
      headers:{Authorization:'Basic '+Buffer.from(cfg.clientId+':'+cfg.clientSecret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
      body:'grant_type=client_credentials'
    });
  }catch{throw Object.assign(new Error('Could not reach PayPal. Try again shortly.'),{status:503});}
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token){
    throw Object.assign(new Error(String(data.error_description||data.message||'PayPal authentication failed. Check the configured API credentials.')),{status:502,code:data.error||null});
  }
  paypalAccessTokenCache={value:data.access_token,expiresAt:Date.now()+Math.max(60,Number(data.expires_in||300))*1000};
  return data.access_token;
}
async function paypalRequest(path,method='POST',payload={},requestId){
  const cfg=paypalConfig(),token=await paypalToken();
  let response;
  try{
    response=await fetch(cfg.base+path,{
      method,
      headers:{
        Authorization:'Bearer '+token,
        'Content-Type':'application/json',
        ...(requestId?{'PayPal-Request-Id':String(requestId).slice(0,108)}:{})
      },
      ...(payload===undefined?{}:{body:JSON.stringify(payload)})
    });
  }catch{throw Object.assign(new Error('Could not reach PayPal to process this request.'),{status:503});}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const detail=Array.isArray(data.details)?data.details[0]?.description:null;
    throw Object.assign(new Error(String(detail||data.message||data.name||'PayPal could not complete the request.')),{status:502,code:data.name||null});
  }
  return data;
}
function appOrigin(req){
  if(process.env.APP_ORIGIN)return new URL(process.env.APP_ORIGIN).origin;
  const proto=String(req.headers['x-forwarded-proto']||(req.socket?.encrypted?'https':'http')).split(',')[0].trim();
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();
  return new URL(proto+'://'+host).origin;
}
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()'
};
const DEFAULT_ABOUT_VISIBILITY={bio:true,location:true,country:false,county:false,parish:false,city:false,gender:false,relationshipStatus:false,contactPhone:false};
const ABOUT_SECTION_KEYS=['personalDetails','intro','work','education','hobbies','interests','travel','links','contactInfo','names','details','aboutYou'];
const DEFAULT_ABOUT_SECTION_VISIBILITY={
  personalDetails:'friends',intro:'public',work:'public',education:'public',hobbies:'public',
  interests:'public',travel:'public',links:'public',contactInfo:'private',names:'friends',
  details:'friends',aboutYou:'public'
};
function canViewAboutSection(viewerId,target,visibility){
  if(viewerId===target?.id)return true;
  if(visibility==='public')return true;
  if(visibility==='friends')return Boolean(viewerId&&isFriend(viewerId,target.id));
  return false;
}
function safeUser(u,viewerId=null){
  if(!u)return null;
  const visibility={...DEFAULT_ABOUT_VISIBILITY,...(u.aboutVisibility||{})};
  const sectionVisibility={...DEFAULT_ABOUT_SECTION_VISIBILITY,...(u.aboutSectionVisibility||{})};
  const own=viewerId===u.id;
  const result={id:u.id,name:u.name,username:u.username,bio:'',location:'',avatar:u.avatar||'',cover:u.cover||'',createdAt:u.createdAt};
  const legacySection={bio:'intro',location:'personalDetails',country:'personalDetails',county:'personalDetails',parish:'personalDetails',city:'personalDetails',gender:'personalDetails',relationshipStatus:'personalDetails',contactPhone:'contactInfo'};
  const fields=['bio','location','country','county','parish','city','gender','relationshipStatus','contactPhone'];
  for(const key of fields){
    const section=legacySection[key];
    if(own||(visibility[key]===true&&canViewAboutSection(viewerId,u,sectionVisibility[section])))result[key]=u[key]||'';
  }
  const aboutSections={};
  for(const key of ABOUT_SECTION_KEYS){
    if(!canViewAboutSection(viewerId,u,sectionVisibility[key]))continue;
    aboutSections[key]={...(u.aboutSections?.[key]||{})};
  }
  const legacyPersonal={
    currentCity:u.city||u.location||'',country:u.country||'',county:u.county||'',parish:u.parish||'',
    gender:u.gender||'',relationshipStatus:u.relationshipStatus||''
  };
  if(aboutSections.personalDetails){
    for(const [key,value] of Object.entries(legacyPersonal)){
      if(!Object.hasOwn(aboutSections.personalDetails,key))aboutSections.personalDetails[key]=value;
    }
  }
  if(aboutSections.intro&&!Object.hasOwn(aboutSections.intro,'bio'))aboutSections.intro.bio=u.bio||'';
  if(aboutSections.contactInfo&&!Object.hasOwn(aboutSections.contactInfo,'phone'))aboutSections.contactInfo.phone=u.contactPhone||'';
  result.aboutSections=aboutSections;
  if(own){
    result.email=u.email||'';
    result.aboutVisibility=visibility;
    result.aboutSectionVisibility=sectionVisibility;
  }
  return result;
}
const APP_COLOR_THEMES=['minglora','ocean','tropical','royal','emerald','rose','golden','lavender','midnight','graphite'];
const LIVE_ROOM_THEMES=['studio','ocean','tropical','royal','neon','sunset','garden','social'];
const DEFAULT_SETTINGS={privacy:{profileVisibility:'public',allowFriendRequests:true,messageAudience:'everyone',meetWaveAudience:'everyone'},notifications:{inApp:true,friendRequests:true,messages:true,interactions:true,push:true},preferences:{theme:'system',colorTheme:'minglora',liveRoomTheme:'studio',feedSort:'recent',reducedMotion:false}};
function getUserSettings(user){const saved=user?.settings||{};const preferences={...DEFAULT_SETTINGS.preferences,...(saved.preferences||{})};if(!APP_COLOR_THEMES.includes(preferences.colorTheme))preferences.colorTheme=DEFAULT_SETTINGS.preferences.colorTheme;if(!LIVE_ROOM_THEMES.includes(preferences.liveRoomTheme))preferences.liveRoomTheme=DEFAULT_SETTINGS.preferences.liveRoomTheme;return {privacy:{...DEFAULT_SETTINGS.privacy,...(saved.privacy||{})},notifications:{...DEFAULT_SETTINGS.notifications,...(saved.notifications||{})},preferences};}
function isFriend(firstId,secondId){return (db.follows||[]).some(item=>item.followerId===firstId&&item.followedId===secondId)&&(db.follows||[]).some(item=>item.followerId===secondId&&item.followedId===firstId);}
function canViewProfile(viewerId,target){if(!target||viewerId===target.id)return true;const visibility=getUserSettings(target).privacy.profileVisibility;if(visibility==='public')return true;if(visibility==='friends')return isFriend(viewerId,target.id);return false;}
function validateSettingsPatch(input,user){
  if(!input||typeof input!=='object'||Array.isArray(input))return {valid:false,error:'Settings must be an object.'};
  const next=getUserSettings(user);const allowed={privacy:['profileVisibility','allowFriendRequests','messageAudience','meetWaveAudience'],notifications:['inApp','friendRequests','messages','interactions','push'],preferences:['theme','colorTheme','liveRoomTheme','feedSort','reducedMotion']};
  for(const [section,values] of Object.entries(input)){
    if(!allowed[section]||!values||typeof values!=='object'||Array.isArray(values))return {valid:false,error:'Unsupported settings section.'};
    for(const [key,value] of Object.entries(values)){
      if(!allowed[section].includes(key))return {valid:false,error:'Unsupported setting: '+key};
      if(section==='privacy'&&key==='profileVisibility'&&!['public','friends','private'].includes(value))return {valid:false,error:'Profile visibility must be public, friends or private.'};
      if(section==='privacy'&&key==='messageAudience'&&!['everyone','friends','nobody'].includes(value))return {valid:false,error:'Message audience must be everyone, friends or nobody.'};
      if(section==='privacy'&&key==='meetWaveAudience'&&!['everyone','friends','nobody'].includes(value))return {valid:false,error:'MeetWave invitation audience must be everyone, friends or nobody.'};
      if(section==='privacy'&&key==='allowFriendRequests'&&typeof value!=='boolean')return {valid:false,error:'Allow friend requests must be true or false.'};
      if(section==='notifications'&&typeof value!=='boolean')return {valid:false,error:'Notification preferences must be true or false.'};
      if(section==='preferences'&&key==='theme'&&!['system','light','dark'].includes(value))return {valid:false,error:'Theme must be system, light or dark.'};
      if(section==='preferences'&&key==='colorTheme'&&!APP_COLOR_THEMES.includes(value))return {valid:false,error:'Choose a supported Minglora colour theme.'};
      if(section==='preferences'&&key==='liveRoomTheme'&&!LIVE_ROOM_THEMES.includes(value))return {valid:false,error:'Choose a supported LIVE room theme.'};
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
function sealSessionAuth(value){
  if(!value?.access_token)return null;
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',sessionCipherKey,iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify({
    access_token:value.access_token,refresh_token:value.refresh_token||'',
    expires_in:Number(value.expires_in||3600),expires_at:value.expires_at||null,
    token_type:value.token_type||'bearer'
  }),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
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
  db.sessions.push({id:sid,userId:user.id,createdAt,lastSeenAt:createdAt,expiresAt:new Date(Date.now()+7*86400000).toISOString(),authSealed:sealSessionAuth(authTokens),authExpiresAt:authTokens?.access_token?new Date(getAuthTokenExpiresAt(authTokens)).toISOString():null,mfaVerified:!authTokens?.access_token||tokenAal(authTokens.access_token)==='aal2',userAgent:String(req?.headers?.['user-agent']||'Unknown device').slice(0,240),mfaVerified:true});
  await saveStore();return appSessionCookie(sid);
}
function ensureLocalUser(authUser, fallback = {}) {
  if (!authUser?.id || !authUser?.email) throw Object.assign(new Error('Supabase Auth returned an incomplete user record.'), { status:502 });
  const metadata = authUser.user_metadata || authUser.raw_user_meta_data || {};
  const email = normalizeEmail(authUser.email);
  const name = String(metadata.name || metadata.full_name || fallback.name || email.split('@')[0] || 'Minglora Member').trim();
  const username = normalizeUsername(metadata.username || fallback.username || `member_${String(authUser.id).replace(/-/g,'').slice(0,12)}`);
  const contactPhone=normalizeContactPhone(metadata.contact_phone||metadata.phone_number||fallback.phoneNumber||'');
  if (!validateUsername(username).valid) throw Object.assign(new Error('The username on this account is invalid. Contact Minglora support.'), { status:409 });
  if(!validateContactPhone(contactPhone).valid)throw Object.assign(new Error('The contact phone stored on this account is invalid. Update it in your Minglora profile.'),{status:409});
  let user = db.users.find(item => item.id === authUser.id) || db.users.find(item => normalizeEmail(item.email) === email);
  const usernameOwner = db.users.find(item => item.username === username && item.id !== user?.id);
  if (usernameOwner) throw Object.assign(new Error('That username is already in use on Minglora.'), { status:409 });
  if (!user) {
    user = { id:authUser.id, name, username, email, passwordHash:null, bio:String(metadata.bio||''), location:String(metadata.location||''), contactPhone, country:String(metadata.country||''), county:String(metadata.county||''), parish:String(metadata.parish||''), city:String(metadata.city||''), gender:String(metadata.gender||''), relationshipStatus:String(metadata.relationship_status||metadata.relationshipStatus||''), aboutVisibility:metadata.about_visibility||metadata.aboutVisibility||DEFAULT_ABOUT_VISIBILITY, aboutSections:metadata.about_sections||metadata.aboutSections||{}, aboutSectionVisibility:metadata.about_section_visibility||metadata.aboutSectionVisibility||DEFAULT_ABOUT_SECTION_VISIBILITY, avatar:String(metadata.avatar_url||''), cover:String(metadata.cover_url||''), status:String(metadata.account_status||'active'), createdAt:authUser.created_at || now() };
    db.users.push(user);
  } else {
    user.name = name || user.name;
    user.username = username || user.username;
    user.email = email;
    user.contactPhone=contactPhone;
    for(const [key,metaKey] of [['country','country'],['county','county'],['parish','parish'],['city','city'],['gender','gender'],['bio','bio'],['location','location']]){
      if(metadata[metaKey]!==undefined)user[key]=String(metadata[metaKey]||'');
    }
    if(metadata.relationship_status!==undefined||metadata.relationshipStatus!==undefined)user.relationshipStatus=String(metadata.relationship_status||metadata.relationshipStatus||'');
    if(metadata.about_visibility||metadata.aboutVisibility)user.aboutVisibility=metadata.about_visibility||metadata.aboutVisibility;
    if(metadata.about_sections||metadata.aboutSections)user.aboutSections=metadata.about_sections||metadata.aboutSections;
    if(metadata.about_section_visibility||metadata.aboutSectionVisibility)user.aboutSectionVisibility=metadata.about_section_visibility||metadata.aboutSectionVisibility;
    if(metadata.avatar_url!==undefined)user.avatar=String(metadata.avatar_url||'');
    if(metadata.cover_url!==undefined)user.cover=String(metadata.cover_url||'');
    if(metadata.account_status!==undefined)user.status=String(metadata.account_status||'active');
  }
  return user;
}
function sessionUser(req){
  const session=sessionFromRequest(req);
  const account=session?db.users.find(item=>item.id===session.userId)||null:null;
  if(session?.authInvalidatedAt&&AUTH_PROVIDER==='supabase')return null;
  return ['suspended','deactivated'].includes(account?.status)?null:account;
}
const sessionAuth=createSessionAuthManager({
  openSession:openSessionAuth,sealSession:sealSessionAuth,
  refreshSession:supabaseRefreshSession,save:saveStore
});
async function body(req, maxBytes=1_000_000) {
  let raw=''; for await (const chunk of req) { raw += chunk; if (raw.length > maxBytes) throw Object.assign(new Error('Request body too large'), {status:413}); }
  if (!raw) return {}; try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON body'), {status:400}); }
}
const requireAuth = user => { if (!user) throw Object.assign(new Error('Sign in to continue.'), {status:401}); };
function meetWaveRoomInvitation(roomId,userId){
  return (db.meetWaveInvitations||[]).find(item=>item.roomId===roomId&&item.userId===userId&&item.status==='accepted')||null;
}
function canUserAccessMeetWaveRoom(room,userId){
  if(!room||room.status==='ended')return false;
  const invited=Boolean(meetWaveRoomInvitation(room.id,userId));
  const friend=room.visibility==='friends'&&isFriend(userId,room.ownerId);
  return canAccessMeetWaveRoom(room,userId,{isFriend:friend,invited});
}
async function cleanupCallRoom(call,reason='ended'){
  if(!call?.roomName)return;
  try{await deleteLiveKitRoom(call.roomName);}
  catch(error){
    const status=Number(error?.statusCode||error?.status||error?.response?.status||0);
    if(status!==404)console.warn('[Minglora calls] LiveKit room cleanup will need attention.',{callId:call.id,reason,status,message:String(error?.message||'provider cleanup failed').slice(0,160)});
  }
}
function meetWaveRoomView(room,viewerId){
  if(!room)return null;
  const owner=db.users.find(member=>member.id===room.ownerId);
  return {
    id:room.id,title:room.title,description:room.description||'',mode:room.mode,
    visibility:room.visibility,scheduledAt:room.scheduledAt||null,status:room.status,
    createdAt:room.createdAt,startedAt:room.startedAt||null,endedAt:room.endedAt||null,
    participantLimit:room.participantLimit||8,ownerId:room.ownerId,
    owner:safeUser(owner,viewerId),isHost:room.ownerId===viewerId
  };
}
const MESSAGE_STICKERS=Object.freeze({
  heart:'💖',fire:'🔥',celebration:'🎉',crown:'👑',flower:'🌺',
  butterfly:'🦋',laugh:'😂',party:'🥳',clap:'👏',love:'😍'
});
function safeTenorGifUrl(value){
  try{
    const parsed=new URL(String(value||''));
    return parsed.protocol==='https:'&&parsed.hostname.toLowerCase()==='media.tenor.com'&&parsed.pathname.toLowerCase().endsWith('.gif')?parsed.toString():null;
  }catch{return null;}
}

let webPushConfigKey='';
function configureWebPush(){
  const publicKey=String(process.env.WEB_PUSH_PUBLIC_KEY||'').trim();
  const privateKey=String(process.env.WEB_PUSH_PRIVATE_KEY||'').trim();
  if(!publicKey||!privateKey)return false;
  const subject=String(process.env.WEB_PUSH_SUBJECT||'https://minglora-social-network.onrender.com').trim();
  const key=publicKey+':'+privateKey+':'+subject;
  if(webPushConfigKey!==key){webpush.setVapidDetails(subject,publicKey,privateKey);webPushConfigKey=key;}
  return true;
}
async function deliverUserPush(userId,notification){
  if(!configureWebPush())return;
  const subscriptions=(db.pushSubscriptions||[]).filter(item=>item.userId===userId&&item.endpoint&&item.keys?.p256dh&&item.keys?.auth);
  if(!subscriptions.length)return;
  const stale=new Set();
  const payload=JSON.stringify({
    title:notification.type==='live'?'Minglora LIVE':notification.type==='call'?'Incoming Minglora call':notification.type==='message'?'New Minglora message':'Minglora notification',
    body:String(notification.text||'You have a new Minglora notification.').slice(0,240),
    tag:'minglora-'+notification.type+'-'+String(notification.id).slice(0,24),
    data:{type:notification.type,callId:notification.callId||null,liveSessionId:notification.liveSessionId||null,actorId:notification.actorId||null,notificationId:notification.id}
  });
  await Promise.all(subscriptions.map(async subscription=>{
    try{
      await webpush.sendNotification({endpoint:subscription.endpoint,keys:subscription.keys},payload,{
        TTL:60,urgency:notification.type==='call'||notification.type==='live'?'high':'normal',
        topic:String(notification.id||'minglora').replace(/[^A-Za-z0-9_-]/g,'').slice(0,32)||'minglora'
      });
    }catch(error){
      if(error?.statusCode===404||error?.statusCode===410)stale.add(subscription.endpoint);
    }
  }));
  if(stale.size){
    db.pushSubscriptions=(db.pushSubscriptions||[]).filter(item=>!(item.userId===userId&&stale.has(item.endpoint)));
    await saveStore().catch(()=>{});
  }
}
const notify = (userId, actorId, type, text, extra = {}) => {
  const recipient=db.users.find(item=>item.id===userId);if(!recipient)return;
  const prefs=getUserSettings(recipient).notifications;
  if((type==='friend'&&!prefs.friendRequests)||(type==='message'&&!prefs.messages)||(['reaction','comment','follow'].includes(type)&&!prefs.interactions))return;
  const notification={id:uid(),userId,actorId,type,text,...extra,createdAt:now(),read:false};
  if(prefs.inApp)db.notifications.unshift(notification);
  if(prefs.push)void deliverUserPush(userId,notification).catch(()=>{});
};
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
  const {imageUrl,...cleanPost}=p;
  return {...cleanPost,media:media.filter(item=>item?.url),author:safeUser(author),reactions:p.reactions||{},reactionCount:Object.values(p.reactions||{}).length,myReaction:(p.reactions||{})[viewerId]||null,
    isSaved:(db.savedPosts||[]).some(saved=>saved.userId===viewerId&&saved.postId===p.id),
    comments:(p.comments||[]).map(c=>({...c,author:safeUser(db.users.find(u=>u.id===c.userId))}))};
}
async function publicDiscoveryPost(post) {
  const media = await Promise.all((post.mediaIds || []).slice(0, 3).map(async id => {
    const asset = (db.mediaAssets || []).find(item => item.id === id && item.ownerId === post.userId && item.slot === 'post');
    if (!asset || asset.status === 'deleted') return null;
    try {
      return { id: asset.id, mimeType: asset.mimeType, mediaType: asset.mediaType, url: await resolveAssetUrl(asset) };
    } catch {
      return null;
    }
  }));
  return {
    id: post.id,
    text: post.text || '',
    createdAt: post.createdAt,
    media: media.filter(item => item?.url),
    reactionCount: Object.values(post.reactions || {}).length
  };
}

function findReportedPost(targetId){
  const post=(db.posts||[]).find(item=>item.id===targetId);if(post)return {collection:'posts',post,ownerId:post.userId};
  const groupPost=(db.groupPosts||[]).find(item=>item.id===targetId);if(groupPost)return {collection:'groupPosts',post:groupPost,ownerId:groupPost.userId};
  const pagePost=(db.pagePosts||[]).find(item=>item.id===targetId);if(pagePost)return {collection:'pagePosts',post:pagePost,ownerId:pagePost.publishedBy};
  return null;
}
async function publicGroupPost(post) {
  const media=await Promise.all((post.mediaIds||[]).map(async id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id&&item.ownerId===post.userId&&(item.slot==='group'||item.slot==='post'));if(!asset||asset.status==='deleted')return null;try{return {id:asset.id,mimeType:asset.mimeType,mediaType:asset.mediaType,url:await resolveAssetUrl(asset),byteSize:asset.byteSize};}catch{return null;}}));
  const {imageUrl,...cleanPost}=post;
  return {...cleanPost,media:media.filter(item=>item?.url),author:safeUser(db.users.find(u=>u.id===post.userId))};
}
async function publicMarketplaceListing(listing,viewerId){
  const media=await Promise.all((listing.mediaIds||[]).map(async id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id&&item.ownerId===listing.sellerId&&item.slot==='marketplace'&&item.status!=='deleted');if(!asset)return null;try{return {id:asset.id,mimeType:asset.mimeType,mediaType:asset.mediaType,url:await resolveAssetUrl(asset),byteSize:asset.byteSize};}catch{return null;}}));
  const {mediaIds,...safeListing}=listing;
  return {...safeListing,media:Array.isArray(listing.media)?listing.media:media.filter(Boolean),seller:listing.seller||safeUser(db.users.find(member=>member.id===listing.sellerId),viewerId),isSaved:typeof listing.isSaved==='boolean'?listing.isSaved:(db.marketplaceSaved||[]).some(item=>item.userId===viewerId&&item.listingId===listing.id)};
}
async function publicPagePost(post) {
  const media=await Promise.all((post.mediaIds||[]).map(async id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id&&item.ownerId===post.publishedBy&&(item.slot==='page'||item.slot==='post'));if(!asset||asset.status==='deleted')return null;try{return {id:asset.id,mimeType:asset.mimeType,mediaType:asset.mediaType,url:await resolveAssetUrl(asset),byteSize:asset.byteSize};}catch{return null;}}));
  return {...post,media:media.filter(item=>item?.url),author:safeUser(db.users.find(u=>u.id===post.publishedBy))};
}
async function publicStory(story,viewerId,includeViews=false) {
  const asset=story.mediaId?(db.mediaAssets||[]).find(item=>item.id===story.mediaId&&item.ownerId===story.userId&&item.slot==='story'):null;
  let media=null;if(asset){try{media={mimeType:asset.mimeType,mediaType:asset.mediaType,url:await resolveAssetUrl(asset)};}catch{}}
  const views=(db.storyViews||[]).filter(view=>view.storyId===story.id);
  return {...story,media,author:safeUser(db.users.find(u=>u.id===story.userId)),viewedByMe:story.userId===viewerId||views.some(view=>view.viewerId===viewerId),viewCount:views.length,
    viewers:includeViews&&story.userId===viewerId?views.map(view=>({...view,user:safeUser(db.users.find(u=>u.id===view.viewerId))})):undefined};
}

const LIVE_HOST_CONNECT_GRACE_MS = 30_000;
const liveSessionEndOperations = new Map();
let liveSessionCleanupReady = Promise.resolve({ ended: 0, preserved: 0, verified: true });

function isMissingLiveKitRoom(error) {
  const status = Number(error?.statusCode || error?.status || error?.response?.status || 0);
  const message = String(error?.message || '');
  return status === 404 || /requested room does not exist|room not found|no such room/i.test(message);
}

async function endLiveSession(session, { deleteRoom = false } = {}) {
  if (!session?.id) return false;
  const active = liveSessionEndOperations.get(session.id);
  if (active) return active;
  const operation = (async () => {
    const wasLive = session.status === 'live';
    const endedAt = session.endedAt || now();
    if (wasLive) {
      session.status = 'ended';
      session.endedAt = endedAt;
      session.broadcastEndSynced = false;
      (db.liveParticipants || []).filter(item => item.sessionId === session.id && !item.leftAt)
        .forEach(item => { item.leftAt = endedAt; });
      await saveStore();
    }
    if (session.hostId && session.broadcastEndSynced === false) {
      try {
        await requestSupabaseState('live_broadcast_end', { id: session.id, hostId: session.hostId });
        session.broadcastEndSynced = true;
        await saveStore();
      } catch (error) {
        // The local LIVE state is already durably ended. Keep provider sync pending
        // and retry during startup; never turn a successful end action into a client error.
        console.warn('[Minglora LIVE] Broadcast is ended locally; provider sync will be retried.', {
          sessionId: session.id,
          message: String(error?.message || 'provider sync failed').slice(0, 180)
        });
        try { await saveStore(); } catch (saveError) {
          console.error('[Minglora LIVE] Could not persist the pending end-sync marker.', {
            sessionId: session.id,
            message: String(saveError?.message || 'save failed').slice(0, 180)
          });
        }
      }
    }
    if (deleteRoom && session.roomName) {
      try { await deleteLiveKitRoom(session.roomName); }
      catch (error) {
        // A missing room is already stopped; record only the session cleanup failure details.
        const status = Number(error?.statusCode || error?.status || 0);
        if (status !== 404) console.warn('[Minglora LIVE cleanup] Could not delete an inactive LiveKit room.', { sessionId: session.id, status });
      }
    }
    return wasLive;
  })();
  liveSessionEndOperations.set(session.id, operation);
  try { return await operation; }
  finally { liveSessionEndOperations.delete(session.id); }
}

async function cleanupPersistedLiveSessions() {
  for (const endedSession of (db.liveSessions || []).filter(session =>
    session.status === 'ended' && session.broadcastEndSynced === false
  )) {
    try {
      await requestSupabaseState('live_broadcast_end', { id: endedSession.id, hostId: endedSession.hostId });
      endedSession.broadcastEndSynced = true;
      await saveStore();
    } catch (error) {
      console.warn('[Minglora LIVE cleanup] A previously ended broadcast still needs provider sync.', {
        sessionId: endedSession.id,
        message: String(error?.message || 'provider sync failed').slice(0, 180)
      });
    }
  }
  const pending = (db.liveSessions || []).filter(session => session.status === 'live');
  if (!pending.length) return { ended: 0, preserved: 0, verified: true };
  const health = await verifyLiveKitConnection({ force: true });
  if (!health.connected) {
    console.warn('[Minglora LIVE cleanup] LiveKit is not reachable; active rows will stay hidden until room presence can be verified.');
    return { ended: 0, preserved: 0, verified: false };
  }
  let ended = 0, preserved = 0;
  for (const session of pending) {
    try {
      const participants = await listLiveKitParticipants(session.roomName);
      const hostPresent = participants.some(participant => participant.identity === session.hostId);
      if (hostPresent) { preserved++; continue; }
      const startedAt = new Date(session.createdAt || 0).getTime();
      if (Number.isFinite(startedAt) && Date.now() - startedAt < LIVE_HOST_CONNECT_GRACE_MS) continue;
      await endLiveSession(session, { deleteRoom: true });
      ended++;
    } catch (error) {
      const startedAt = new Date(session.createdAt || 0).getTime();
      if (isMissingLiveKitRoom(error) && Number.isFinite(startedAt) && Date.now() - startedAt >= LIVE_HOST_CONNECT_GRACE_MS) {
        try { await endLiveSession(session); ended++; }
        catch (cleanupError) { console.warn('[Minglora LIVE cleanup] Could not close a missing-room session.', { sessionId: session.id, message: String(cleanupError?.message || 'cleanup failed').slice(0, 180) }); }
      } else {
        console.warn('[Minglora LIVE cleanup] Could not reconcile a saved LIVE session.', { sessionId: session.id, message: String(error?.message || 'verification failed').slice(0, 180) });
      }
    }
  }
  return { ended, preserved, verified: true };
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
      components: { persistence, auth, live: { provider: 'livekit', configured: isLiveKitConfigured() } }
    });
  }
  if (p.startsWith('/api/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
      p !== '/api/auth/logout' && p !== '/api/webhooks/paypal') {
    const persistence = await persistenceHealth();
    if (!persistence.ready) {
      return json(res, 503, {
        error: 'Minglora cannot save changes yet because durable production database storage is not configured or is unavailable. Connect Minglora to its own PostgreSQL database before registering or changing account data.'
      });
    }
  }
  if (p.startsWith('/api/') && p !== '/api/webhooks/paypal' && !['GET', 'HEAD', 'OPTIONS'].includes(method) && !isSameOriginApiWrite(req)) {
    return json(res, 403, { error: 'Cross-origin API writes are not allowed.' });
  }
  if (method === 'POST' && p === '/api/webhooks/paypal') {
    let event;
    try { event = await body(req, 1_000_000); }
    catch (error) { return json(res, error.status || 400, { error: error.message }); }
    const paypal = paypalConfig();
    if (!paypal.webhookId || !paypal.configured) {
      return json(res, 503, { error: 'PayPal webhook verification is not configured for Minglora.' });
    }
    const headers = req.headers;
    const verification = await paypalRequest('/v1/notifications/verify-webhook-signature', 'POST', {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: paypal.webhookId,
      webhook_event: event
    });
    if (verification.verification_status !== 'SUCCESS') {
      return json(res, 401, { error: 'PayPal webhook signature could not be verified.' });
    }
    const eventType = String(event.event_type || '');
    const resource = event.resource || {};
    const batchId = String(resource.payout_batch_id || resource.batch_header?.payout_batch_id || '');
    const succeeded = ['PAYMENT.PAYOUTSBATCH.SUCCESS', 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED'].includes(eventType);
    const failed = ['PAYMENT.PAYOUTSBATCH.DENIED', 'PAYMENT.PAYOUTS-ITEM.FAILED', 'PAYMENT.PAYOUTS-ITEM.BLOCKED'].includes(eventType);
    if (batchId && (succeeded || failed)) {
      await requestSupabaseState('economy_payout_webhook', {
        paypalBatchId: batchId,
        status: succeeded ? 'paid' : 'failed'
      });
    }
    return json(res, 200, { received: true });
  }

  if (p.startsWith('/api/')) {
    let input; try { if (!['GET','HEAD'].includes(method)) input=await body(req,1_000_000); } catch(e) { return json(res,e.status||400,{error:e.message}); }
    const user = sessionUser(req);
    try {
      if (method==='POST' && p==='/api/auth/register') {
        const name=String(input.name||'').trim(), username=normalizeUsername(input.username), email=normalizeEmail(input.email), password=String(input.password||''), phoneNumber=normalizeContactPhone(input.phoneNumber||input.contactPhone||'');
        if (name.length<2 || !validateUsername(username).valid || !validateEmail(email).valid || password.length<10 || password.length>1024) return json(res,400,{error:'Enter a name, username (3+ letters/numbers/underscores), valid email, and password of at least 10 characters.'});
        if(phoneNumber&&!validateContactPhone(phoneNumber).valid)return json(res,400,{error:'Enter a valid international phone number, including + and country code.'});
        if (db.users.some(u=>normalizeEmail(u.email)===email || u.username===username)) return json(res,409,{error:'That email or username is already registered. Log in instead.'});
        if (AUTH_PROVIDER === 'supabase') {
          const registration = await requestSupabaseState('auth_register_user', {
            email, password, name, username, phoneNumber
          });
          const authUser = registration.user;
          if (!authUser?.id || !registration.emailConfirmed) {
            return json(res,502,{error:'Minglora could not confirm the new account with its private Auth service.'});
          }
          const authenticated = await supabaseSignIn({ email, password });
          if (!authenticated.user?.id || !authenticated.access_token) {
            return json(res,502,{error:'Your account was created, but Minglora could not start your sign-in session. Please log in with the same email and password.'});
          }
          const created = ensureLocalUser(authenticated.user, { name, username, phoneNumber });
          const sessionCookie = await createAppSession(created,authenticated,req);
          return json(res,201,{user:safeUser(created,created.id)},{'Set-Cookie':sessionCookie});
        }
        const salt=crypto.randomBytes(16).toString('hex'); const hash=(await scrypt(password,salt,64)).toString('hex'); const created={id:uid(),name,username,email,passwordHash:`${salt}:${hash}`,bio:'',location:'',contactPhone:phoneNumber,country:'',county:'',parish:'',city:'',gender:'',relationshipStatus:'',aboutVisibility:DEFAULT_ABOUT_VISIBILITY,avatar:'',cover:'',createdAt:now()}; db.users.push(created);
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
              const migrated=await requestSupabaseState('auth_register_user',{
                email,password,name:legacyUser.name,username:legacyUser.username,phoneNumber:legacyUser.contactPhone||''
              });
              if(!migrated.user?.id||!migrated.emailConfirmed)return json(res,502,{error:'Minglora could not migrate this account into Supabase Auth.'});
              authenticated=await supabaseSignIn({email,password});
            }else{
              if(/invalid login credentials|invalid email or password/i.test(authError.message))recordLoginFailure(rate.key);
              throw authError;
            }
          }
          const signedInUser=ensureLocalUser(authenticated.user);
          if(signedInUser.status==='suspended')return json(res,403,{error:'This Minglora account is suspended. Contact support to appeal.'});
          const accessToken=authenticated.access_token;
          if(accessToken){
            const factors=await supabaseListFactors(accessToken);
            const verifiedTotp=(factors.factors||[]).find(factor=>factor.factor_type==='totp'&&factor.status==='verified');
            if(verifiedTotp&&tokenAal(accessToken)!=='aal2'){
              const pendingId=uid();
              db.pendingAuth.push({id:pendingId,userId:signedInUser.id,factorId:verifiedTotp.id,authSealed:sealSessionAuth(authenticated),createdAt:now(),expiresAt:new Date(Date.now()+5*60*1000).toISOString(),userAgent:String(req.headers['user-agent']||'').slice(0,240)});
              await saveStore();clearLoginFailures(rate.key);
              return json(res,200,{mfaRequired:true,challengeId:pendingId,message:'Enter the code from your authenticator app to finish signing in.'});
            }
          }
          if(signedInUser.status==='deactivated'){signedInUser.status='active';await supabaseUpdateUserMetadata(accessToken,{account_status:'active'});await saveStore();}
          const sessionCookie=await createAppSession(signedInUser,authenticated,req);clearLoginFailures(rate.key);
          return json(res,200,{user:safeUser(signedInUser,signedInUser.id)},{'Set-Cookie':sessionCookie});
        }
        const found=db.users.find(item=>normalizeEmail(item.email)===email);
        if(!found?.passwordHash){recordLoginFailure(rate.key);return json(res,401,{error:'Email or password is incorrect.'});}
        if(found.status==='suspended')return json(res,403,{error:'This Minglora account is suspended. Contact support to appeal.'});
        const [salt,expected]=found.passwordHash.split(':');
        const actual=(await scrypt(password,salt,64)).toString('hex');
        if(actual.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected))){recordLoginFailure(rate.key);return json(res,401,{error:'Email or password is incorrect.'});}
        if(found.status==='deactivated'){found.status='active';await saveStore();}
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
        if(!verified?.access_token||tokenAal(verified.access_token)!=='aal2')return json(res,502,{error:'Supabase did not return a verified multi-factor session. Try the authenticator code again.'});
        const account=db.users.find(item=>item.id===pending.userId);
        if(!account)return json(res,401,{error:'Account not found.'});
        db.pendingAuth=db.pendingAuth.filter(item=>item.id!==pending.id);
        if(account.status==='deactivated'){account.status='active';await supabaseUpdateUserMetadata(verified.access_token,{account_status:'active'});}
        const sessionCookie=await createAppSession(account,verified,req);
        await saveStore();
        return json(res,200,{user:safeUser(account)},{'Set-Cookie':sessionCookie});
      }
      if (method==='POST' && p==='/api/auth/logout') { const sid=cookie(req,'sid'); if(sid){const id=decodeURIComponent(sid).split('.')[0]; db.sessions=db.sessions.filter(s=>s.id!==id); await saveStore();} return json(res,200,{ok:true},{'Set-Cookie':'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'}); }
      if (method==='GET' && p==='/api/auth/me') return json(res,200,{user:user?safeUser(user,user.id):null});
      requireAuth(user);
      if(method==='GET'&&p==='/api/marketplace/seller'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_seller_get',{userId:user.id});return json(res,200,result);}
        const seller=(db.marketplaceSellers||[]).find(item=>item.userId===user.id)||null;
        return json(res,200,{seller:seller?{sellerType:seller.sellerType,storeName:seller.storeName,description:seller.description,countryCode:seller.countryCode,contactEmail:seller.contactEmail,status:seller.status,identityStatus:seller.identityStatus,payoutStatus:seller.payoutStatus,createdAt:seller.createdAt,updatedAt:seller.updatedAt}:null});
      }
      if(method==='POST'&&p==='/api/marketplace/seller'){
        const validation=validateMarketplaceSellerApplication(input);if(!validation.valid)return json(res,400,{error:validation.error});
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_seller_apply',{userId:user.id,...validation.value,acceptTerms:input.acceptTerms===true});return json(res,201,result);}
        db.marketplaceSellers||=[];let seller=db.marketplaceSellers.find(item=>item.userId===user.id);
        if(seller&&seller.status!=='rejected')return json(res,409,{error:'A seller application already exists for this account.',status:seller.status});
        const previousStatus=seller?.status||null,values=validation.value,stamp=now();
        if(seller){Object.assign(seller,values,{status:'pending',identityStatus:'not_started',payoutStatus:'not_connected',reviewedAt:null,reviewedBy:null,reviewReason:'',submittedAt:stamp,updatedAt:stamp});}
        else{seller={userId:user.id,...values,status:'pending',identityStatus:'not_started',payoutStatus:'not_connected',createdAt:stamp,submittedAt:stamp,updatedAt:stamp};db.marketplaceSellers.unshift(seller);}
        db.marketplaceSellerEvents||=[];db.marketplaceSellerEvents.unshift({id:uid(),sellerId:user.id,actorId:user.id,eventType:'submitted',reason:previousStatus?'Resubmitted after rejection':'New application',createdAt:stamp});
        db.auditLog||=[];db.auditLog.unshift({id:uid(),actorId:user.id,action:'marketplace_seller_application_submitted',targetType:'marketplace_seller',targetId:user.id,createdAt:stamp});
        await saveStore();
        return json(res,201,{seller:{storeName:seller.storeName,status:seller.status,identityStatus:seller.identityStatus,payoutStatus:seller.payoutStatus,submittedAt:seller.submittedAt}});
      }
      if(method==='GET'&&p==='/api/marketplace/admin/sellers'){
        if(!isModerator(user))return json(res,403,{error:'Moderator access is required.'});
        const status=String(url.searchParams.get('status')||'pending');
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_seller_admin_list',{status});return json(res,200,result);}
        const sellers=(db.marketplaceSellers||[]).filter(item=>!status||item.status===status).map(item=>({userId:item.userId,sellerType:item.sellerType,storeName:item.storeName,description:item.description,countryCode:item.countryCode,contactEmail:item.contactEmail,status:item.status,identityStatus:item.identityStatus,payoutStatus:item.payoutStatus,submittedAt:item.submittedAt}));
        return json(res,200,{sellers});
      }
      if(method==='GET'&&p==='/api/marketplace/admin/queue'){
        if(!isModerator(user))return json(res,403,{error:'Moderator access is required.'});
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_seller_queue');return json(res,200,result);}
        const sellers=(db.marketplaceSellers||[]).filter(item=>item.status==='pending').map(item=>({userId:item.userId,storeName:item.storeName,sellerType:item.sellerType,countryCode:item.countryCode,contactEmail:item.contactEmail,identityStatus:item.identityStatus,submittedAt:item.submittedAt}));
        const jobs=(db.jobPostings||[]).filter(item=>item.status==='pending_review').map(item=>({id:item.id,employerId:item.employerId,title:item.title,companyName:item.companyName,description:item.description,category:item.category,employmentType:item.employmentType,workplaceType:item.workplaceType,location:item.location,createdAt:item.createdAt}));
        return json(res,200,{sellers,jobs,commerce:{enabled:false,blockers:['Marketplace payment capture and seller payouts remain disabled.','Provider marketplace approval and a transactional order repository are required.']}});
      }
      if(method==='GET'&&p==='/api/marketplace/admin/queue'){
        if(!isModerator(user))return json(res,403,{error:'Moderator access is required.'});
        const sellers=(db.marketplaceSellers||[]).filter(item=>item.status==='pending').map(item=>({userId:item.userId,storeName:item.storeName,sellerType:item.sellerType,countryCode:item.countryCode,contactEmail:item.contactEmail,identityStatus:item.identityStatus,submittedAt:item.submittedAt}));
        const jobs=(db.jobPostings||[]).filter(item=>item.status==='pending_review').map(item=>({id:item.id,employerId:item.employerId,title:item.title,companyName:item.companyName,description:item.description,category:item.category,employmentType:item.employmentType,workplaceType:item.workplaceType,location:item.location,createdAt:item.createdAt}));
        return json(res,200,{sellers,jobs,commerce:{enabled:false,blockers:['Marketplace payment capture and seller payouts remain disabled.','Provider marketplace approval and a transactional order repository are required.']}});
      }
      const sellerReviewMatch=p.match(/^\/api\/marketplace\/admin\/sellers\/([^/]+)\/review$/);
      if(method==='PATCH'&&sellerReviewMatch){
        if(!isModerator(user))return json(res,403,{error:'Moderator access is required.'});
        if(isSupabasePersistence()){const status=String(input.status||''),identityStatus=String(input.identityStatus||''),reason=String(input.reason||'').trim().slice(0,1000);if(!['pending','approved','rejected','suspended'].includes(status)||!['not_started','pending','verified','rejected'].includes(identityStatus)||!reason)return json(res,400,{error:'A valid seller review decision and audit reason are required.'});const result=await requestSupabaseState('marketplace_seller_review',{actorId:user.id,sellerId:sellerReviewMatch[1],status,identityStatus,reason});return json(res,200,result);}
        const seller=(db.marketplaceSellers||[]).find(item=>item.userId===sellerReviewMatch[1]);if(!seller)return json(res,404,{error:'Seller application not found.'});
        const identityStatus=String(input.identityStatus||seller.identityStatus),status=String(input.status||seller.status);
        const reason=String(input.reason||'').trim().slice(0,1000);
        if(!['not_started','pending','verified','rejected'].includes(identityStatus))return json(res,400,{error:'Choose a valid identity verification status.'});
        if(!['pending','approved','rejected','suspended'].includes(status))return json(res,400,{error:'Choose a valid seller application status.'});
        if(status==='approved'&&identityStatus!=='verified')return json(res,409,{error:'Identity or business verification must be completed before approval.'});
        if(status==='approved'&&!reason)return json(res,400,{error:'Record the verification review reason before approving this seller.'});
        const stamp=now();seller.identityStatus=identityStatus;seller.status=status;seller.reviewedAt=stamp;seller.reviewedBy=user.id;seller.reviewReason=reason;seller.updatedAt=stamp;
        db.marketplaceSellerEvents||=[];db.marketplaceSellerEvents.unshift({id:uid(),sellerId:seller.userId,actorId:user.id,eventType:identityStatus==='verified'?'identity_verified':status,reason,createdAt:stamp});
        db.auditLog||=[];db.auditLog.unshift({id:uid(),actorId:user.id,action:'marketplace_seller_reviewed',targetType:'marketplace_seller',targetId:seller.userId,metadata:{status,identityStatus,reason},createdAt:stamp});
        notify(seller.userId,user.id,'system','Your Minglora seller application status changed to '+status+'.',{marketplaceSellerStatus:status,identityStatus});
        await saveStore();return json(res,200,{seller:{userId:seller.userId,status:seller.status,identityStatus:seller.identityStatus,payoutStatus:seller.payoutStatus}});
      }
      if(method==='POST'&&p==='/api/marketplace/checkout/quote'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_checkout_quote',{buyerId:user.id,items:input.items,fulfillmentByListing:input.fulfillmentByListing||{}});return json(res,200,result);}
        const bps=Number(process.env.MARKETPLACE_COMMISSION_BPS||0),quoteId=uid(),created=now(),expires=new Date(Date.now()+10*60*1000).toISOString();
        const result=calculateMarketplaceCheckoutQuote({buyerId:user.id,items:input.items,listings:db.marketplaceListings||[],sellerProfiles:db.marketplaceSellers||[],commissionBps:bps,fulfillmentByListing:input.fulfillmentByListing||{},quoteId,createdAt:created,expiresAt:expires});
        if(!result.valid)return json(res,400,{error:result.error});
        db.marketplaceQuotes||=[];db.marketplaceQuotes.unshift({...result.value,status:'informational'});
        await saveStore();return json(res,200,{quote:result.value,notice:'This is an informational quote only. No stock is reserved and no payment has been taken.'});
      }
      if(method==='GET'&&p==='/api/marketplace/checkout/status'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_checkout_status');return json(res,200,result);}
        return json(res,200,{enabled:false,orderCreationEnabled:false,payoutsEnabled:false,blockers:['Marketplace provider approval and seller settlement route are not verified.','Tax and customs calculation is not configured.','Transactional inventory reservation and order processing are not yet connected to the hosted relational database.']});
      }
      
      if(method==='GET'&&p==='/api/marketplace/orders'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_orders_list',{userId:user.id});return json(res,200,result);}
        return json(res,200,{orders:[]});
      }
      const orderPathParts=p.split('/');
      const marketplaceOrderMatch=orderPathParts.length===5&&orderPathParts[1]==='api'&&orderPathParts[2]==='marketplace'&&orderPathParts[3]==='orders'&&orderPathParts[4]?[p,orderPathParts[4]]:null;
      if(method==='GET'&&marketplaceOrderMatch){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_order_get',{userId:user.id,orderId:marketplaceOrderMatch[1]});return json(res,200,result);}
        return json(res,404,{error:'Order not found.'});
      }
      if(method==='POST'&&p==='/api/marketplace/orders'){
        const quoteId=String(input.quoteId||''),idempotencyKey=String(input.idempotencyKey||'');
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(quoteId)||idempotencyKey.length<8||idempotencyKey.length>128)return json(res,400,{error:'A valid checkout quote and idempotency key are required.'});
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_order_create',{buyerId:user.id,quoteId,idempotencyKey});return json(res,201,result);}
        return json(res,503,{error:'Transactional Marketplace order storage is not available in local JSON mode.'});
      }
      const cancelPathParts=p.split('/');
      const marketplaceOrderCancelMatch=cancelPathParts.length===6&&cancelPathParts[1]==='api'&&cancelPathParts[2]==='marketplace'&&cancelPathParts[3]==='orders'&&cancelPathParts[4]&&cancelPathParts[5]==='cancel'?[p,cancelPathParts[4]]:null;
      if(method==='POST'&&marketplaceOrderCancelMatch){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_order_cancel',{userId:user.id,orderId:marketplaceOrderCancelMatch[1]});return json(res,200,result);}
        return json(res,503,{error:'Transactional Marketplace order storage is not available in local JSON mode.'});
      }
      if(method==='GET'&&p==='/api/marketplace/bookings'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_bookings_list',{userId:user.id});return json(res,200,result);}
        const bookings=(db.marketplaceBookings||[]).filter(item=>item.buyerId===user.id||item.sellerId===user.id).sort((a,b)=>new Date(a.startAt)-new Date(b.startAt)).map(item=>{const listing=(db.marketplaceListings||[]).find(entry=>entry.id===item.listingId);const otherId=item.buyerId===user.id?item.sellerId:item.buyerId;const other=db.users.find(entry=>entry.id===otherId);return {...item,listingTitle:listing?.title||'Service appointment',otherName:other?.name||'Minglora member'};});
        return json(res,200,{bookings});
      }
      if(method==='POST'&&p==='/api/marketplace/bookings'){
        if(isSupabasePersistence()){const validation=validateMarketplaceServiceBookingInput(input);if(!validation.valid)return json(res,400,{error:validation.error});const result=await requestSupabaseState('marketplace_booking_create',{buyerId:user.id,...validation.value});return json(res,201,result);}
        const validation=validateMarketplaceServiceBookingInput(input);if(!validation.valid)return json(res,400,{error:validation.error});
        const listing=(db.marketplaceListings||[]).find(item=>item.id===validation.value.listingId&&item.kind==='service'&&isMarketplaceListingActive(item));
        if(!listing||listing.sellerId===user.id||blockedBetween(user.id,listing.sellerId))return json(res,404,{error:'This service is not available for booking.'});
        const seller=(db.marketplaceSellers||[]).find(item=>item.userId===listing.sellerId);
        if(seller?.status!=='approved'||seller.identityStatus!=='verified')return json(res,409,{error:'This service provider has not completed seller verification.'});
        const collision=(db.marketplaceBookings||[]).some(item=>item.sellerId===listing.sellerId&&['requested','accepted','completed_by_seller'].includes(item.status)&&new Date(validation.value.startAt)<new Date(item.endAt)&&new Date(validation.value.endAt)>new Date(item.startAt));
        if(collision)return json(res,409,{error:'That appointment time is already requested or booked. Choose another time.'});
        const booking={id:uid(),listingId:listing.id,buyerId:user.id,sellerId:listing.sellerId,...validation.value,status:'requested',priceMinor:listing.priceMinor??null,currency:listing.currency,createdAt:now(),updatedAt:now()};
        db.marketplaceBookings||=[];db.marketplaceBookings.unshift(booking);
        notify(listing.sellerId,user.id,'system',user.name+' requested a service appointment for '+listing.title+'.',{marketplaceBookingId:booking.id});
        await saveStore();return json(res,201,{booking});
      }
      const bookingMatch=p.match(/^\/api\/marketplace\/bookings\/([^/]+)$/);
      if(method==='PATCH'&&bookingMatch){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_booking_update',{actorId:user.id,bookingId:bookingMatch[1],status:String(input.status||'')});return json(res,200,result);}
        const booking=(db.marketplaceBookings||[]).find(item=>item.id===bookingMatch[1]);if(!booking)return json(res,404,{error:'Booking not found.'});
        const transition=transitionMarketplaceBooking(booking,user.id,String(input.status||''));if(!transition.valid)return json(res,403,{error:transition.error});
        Object.assign(booking,transition.value);
        const recipient=booking.buyerId===user.id?booking.sellerId:booking.buyerId;
        notify(recipient,user.id,'system','A service booking status changed to '+booking.status+'.',{marketplaceBookingId:booking.id});
        await saveStore();return json(res,200,{booking});
      }
      if(method==='GET'&&p==='/api/jobs'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_jobs_list',{userId:user.id,q:url.searchParams.get('q')||'',category:url.searchParams.get('category')||'',location:url.searchParams.get('location')||''});return json(res,200,result);}
        const query=String(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100),category=String(url.searchParams.get('category')||''),location=String(url.searchParams.get('location')||'').trim().toLowerCase().slice(0,120);
        const jobs=(db.jobPostings||[]).filter(item=>item.status==='open'&&new Date(item.applicationDeadline)>new Date()&&(!query||(item.title+' '+item.companyName+' '+item.description).toLowerCase().includes(query))&&(!category||item.category===category)&&(!location||String(item.location||'').toLowerCase().includes(location))).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        return json(res,200,{jobs});
      }
      if(method==='GET'&&p==='/api/jobs/applications/mine'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_job_applications_mine',{applicantId:user.id});return json(res,200,result);}
        const applications=(db.jobApplications||[]).filter(item=>item.applicantId===user.id).map(item=>({...item,job:(db.jobPostings||[]).find(job=>job.id===item.jobId)||null}));
        return json(res,200,{applications});
      }
      if(method==='GET'&&p==='/api/jobs/mine'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_jobs_mine',{userId:user.id});return json(res,200,result);}
        return json(res,200,{jobs:(db.jobPostings||[]).filter(item=>item.employerId===user.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))});
      }
      if(method==='POST'&&p==='/api/jobs'){
        const validation=validateJobPostingInput(input);if(!validation.valid)return json(res,400,{error:validation.error});
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_jobs_create',{employerId:user.id,job:validation.value});return json(res,201,{...result,notice:'Your job posting was submitted for moderation. It will not appear publicly until approved.'});}
        const job={id:uid(),employerId:user.id,...validation.value,status:'pending_review',createdAt:now(),updatedAt:now()};
        db.jobPostings||=[];db.jobPostings.unshift(job);db.auditLog||=[];db.auditLog.unshift({id:uid(),actorId:user.id,action:'job_posting_submitted',targetType:'job_posting',targetId:job.id,createdAt:now()});
        await saveStore();return json(res,201,{job,notice:'Your job posting was submitted for moderation. It will not appear publicly until approved.'});
      }
      const jobReviewMatch=p.match(/^\/api\/jobs\/([^/]+)\/review$/);
      if(method==='PATCH'&&jobReviewMatch){
        if(!isModerator(user))return json(res,403,{error:'Moderator access is required.'});
        if(isSupabasePersistence()){const status=String(input.status||''),reason=String(input.reason||'').trim().slice(0,1000);if(!['open','rejected'].includes(status)||!reason)return json(res,400,{error:'A valid vacancy moderation decision and reason are required.'});const result=await requestSupabaseState('marketplace_job_review',{actorId:user.id,jobId:jobReviewMatch[1],status,reason});return json(res,200,result);}
        const job=(db.jobPostings||[]).find(item=>item.id===jobReviewMatch[1]);if(!job)return json(res,404,{error:'Job posting not found.'});
        const status=String(input.status||'');if(!['open','rejected'].includes(status))return json(res,400,{error:'Choose open or rejected.'});
        if(status==='open'&&new Date(job.applicationDeadline)<=new Date())return json(res,409,{error:'The application deadline has passed.'});
        job.status=status;job.reviewedBy=user.id;job.reviewedAt=now();job.reviewReason=String(input.reason||'').trim().slice(0,1000);job.updatedAt=now();
        db.auditLog||=[];db.auditLog.unshift({id:uid(),actorId:user.id,action:'job_posting_'+status,targetType:'job_posting',targetId:job.id,createdAt:now()});
        notify(job.employerId,user.id,'system','Your job posting was '+status+'.',{jobId:job.id});
        await saveStore();return json(res,200,{job});
      }
      const jobMatch=p.match(/^\/api\/jobs\/([^/]+)$/);
      if(jobMatch&&method==='PATCH'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_job_update',{userId:user.id,jobId:jobMatch[1],status:String(input.status||'')});return json(res,200,result);}
        const job=(db.jobPostings||[]).find(item=>item.id===jobMatch[1]);if(!job)return json(res,404,{error:'Job posting not found.'});
        if(job.employerId!==user.id)return json(res,403,{error:'Only the employer can manage this posting.'});
        const status=String(input.status||'');if(!['paused','closed'].includes(status)||!['open','paused'].includes(job.status))return json(res,400,{error:'Open job postings can be paused or closed.'});
        job.status=status;job.updatedAt=now();await saveStore();return json(res,200,{job});
      }
      const jobApplyMatch=p.match(/^\/api\/jobs\/([^/]+)\/applications$/);
      if(method==='POST'&&jobApplyMatch){
        if(isSupabasePersistence()){const validation=validateJobApplicationInput(input);if(!validation.valid)return json(res,400,{error:validation.error});const result=await requestSupabaseState('marketplace_job_apply',{applicantId:user.id,jobId:jobApplyMatch[1],coverLetter:validation.value.coverLetter});return json(res,201,result);}
        const job=(db.jobPostings||[]).find(item=>item.id===jobApplyMatch[1]&&item.status==='open'&&new Date(item.applicationDeadline)>new Date());
        if(!job||job.employerId===user.id)return json(res,404,{error:'This vacancy is unavailable for applications.'});
        const validation=validateJobApplicationInput(input);if(!validation.valid)return json(res,400,{error:validation.error});
        db.jobApplications||=[];if(db.jobApplications.some(item=>item.jobId===job.id&&item.applicantId===user.id))return json(res,409,{error:'You have already applied for this vacancy.'});
        const application={id:uid(),jobId:job.id,applicantId:user.id,...validation.value,status:'submitted',createdAt:now(),updatedAt:now()};
        db.jobApplications.unshift(application);notify(job.employerId,user.id,'system',user.name+' submitted a job application for '+job.title+'.',{jobId:job.id,applicationId:application.id});
        await saveStore();return json(res,201,{application});
      }
      const jobApplicationsMatch=p.match(/^\/api\/jobs\/([^/]+)\/applications$/);
      if(jobApplicationsMatch&&method==='GET'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_job_applications_for_job',{viewerId:user.id,jobId:jobApplicationsMatch[1]});return json(res,200,result);}
        const job=(db.jobPostings||[]).find(item=>item.id===jobApplicationsMatch[1]);if(!job)return json(res,404,{error:'Job posting not found.'});
        if(job.employerId!==user.id&&!isModerator(user))return json(res,403,{error:'Only the employer can review applications.'});
        return json(res,200,{applications:(db.jobApplications||[]).filter(item=>item.jobId===job.id).map(item=>({...item,candidate:safeUser(db.users.find(member=>member.id===item.applicantId),user.id)}))});
      }
      const jobApplicationMatch=p.match(/^\/api\/jobs\/applications\/([^/]+)$/);
      if(method==='PATCH'&&jobApplicationMatch){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_job_application_update',{actorId:user.id,applicationId:jobApplicationMatch[1],status:String(input.status||'')});return json(res,200,result);}
        const application=(db.jobApplications||[]).find(item=>item.id===jobApplicationMatch[1]);if(!application)return json(res,404,{error:'Application not found.'});
        const job=(db.jobPostings||[]).find(item=>item.id===application.jobId);
        const transition=transitionJobApplication(application,user.id,job,String(input.status||''));if(!transition.valid)return json(res,403,{error:transition.error});
        Object.assign(application,transition.value);notify(application.applicantId,user.id,'system','Your job application status changed to '+application.status+'.',{jobId:job.id,applicationId:application.id});
        await saveStore();return json(res,200,{application});
      }
      if(method==='GET'&&p==='/api/marketplace/categories')return json(res,200,{productCategories:MARKETPLACE_PRODUCT_CATEGORIES,serviceCategories:MARKETPLACE_SERVICE_CATEGORIES,currencies:MARKETPLACE_CURRENCIES});
      if(method==='GET'&&p==='/api/marketplace/listings'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_listings_list',{userId:user.id,mode:'browse',q:url.searchParams.get('q')||'',kind:url.searchParams.get('kind')||'',category:url.searchParams.get('category')||'',location:url.searchParams.get('location')||'',sort:url.searchParams.get('sort')||'recent',limit:Math.min(60,Math.max(1,Number(url.searchParams.get('limit')||36)||36))});const listings=await Promise.all((result.listings||[]).filter(item=>!blockedBetween(user.id,item.sellerId)).map(item=>publicMarketplaceListing(item,user.id)));return json(res,200,{listings,total:result.total??listings.length});}
        const q=String(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100),kind=String(url.searchParams.get('kind')||''),category=String(url.searchParams.get('category')||''),location=String(url.searchParams.get('location')||'').trim().toLowerCase().slice(0,120),sort=String(url.searchParams.get('sort')||'recent');
        let listings=(db.marketplaceListings||[]).filter(item=>isMarketplaceListingActive(item)&&!blockedBetween(user.id,item.sellerId));
        if(kind==='product'||kind==='service')listings=listings.filter(item=>item.kind===kind);
        if(category)listings=listings.filter(item=>item.category===category);
        if(location)listings=listings.filter(item=>String(item.location||'').toLowerCase().includes(location));
        if(q)listings=listings.filter(item=>(item.title+' '+item.description+' '+item.category+' '+(item.tags||[]).join(' ')+' '+(item.location||'')).toLowerCase().includes(q));
        if(sort==='price_low')listings.sort((a,b)=>(a.priceMinor??Number.MAX_SAFE_INTEGER)-(b.priceMinor??Number.MAX_SAFE_INTEGER));
        else if(sort==='price_high')listings.sort((a,b)=>(b.priceMinor??-1)-(a.priceMinor??-1));
        else listings.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        const total=listings.length,limit=Math.min(60,Math.max(1,Number(url.searchParams.get('limit')||36)||36));
        return json(res,200,{listings:await Promise.all(listings.slice(0,limit).map(item=>publicMarketplaceListing(item,user.id))),total});
      }
      if(method==='GET'&&p==='/api/marketplace/mine'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_listings_list',{userId:user.id,mode:'mine',limit:60});const listings=await Promise.all((result.listings||[]).map(item=>publicMarketplaceListing(item,user.id)));return json(res,200,{listings});}
        const listings=(db.marketplaceListings||[]).filter(item=>item.sellerId===user.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        return json(res,200,{listings:await Promise.all(listings.map(item=>publicMarketplaceListing(item,user.id)))});
      }
      if(method==='GET'&&p==='/api/marketplace/saved'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_listings_list',{userId:user.id,mode:'saved',limit:60});const listings=await Promise.all((result.listings||[]).filter(item=>!blockedBetween(user.id,item.sellerId)).map(item=>publicMarketplaceListing(item,user.id)));return json(res,200,{listings});}
        const saved=(db.marketplaceSaved||[]).filter(item=>item.userId===user.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        const listings=await Promise.all(saved.map(async item=>{const listing=(db.marketplaceListings||[]).find(candidate=>candidate.id===item.listingId);if(!isMarketplaceListingActive(listing)||blockedBetween(user.id,listing.sellerId))return null;return {...await publicMarketplaceListing(listing,user.id),savedAt:item.createdAt};}));
        return json(res,200,{listings:listings.filter(Boolean)});
      }
      if(method==='POST'&&p==='/api/marketplace/listings'){
        const sellerApproval=isSupabasePersistence()?(await requestSupabaseState('marketplace_seller_get',{userId:user.id})).seller:(db.marketplaceSellers||[]).find(item=>item.userId===user.id);
        const testBypass=process.env.NODE_ENV==='test'&&process.env.MARKETPLACE_ALLOW_UNVERIFIED_SELLERS==='true';
        if(!testBypass&&(sellerApproval?.status!=='approved'||sellerApproval?.identityStatus!=='verified'))return json(res,403,{error:'Complete the Minglora seller application and identity or business verification before publishing listings.'});
        if(input.imageUrl!==undefined&&input.imageUrl!=='')return json(res,400,{error:'External image URLs are not accepted. Upload listing photos from your device.'});
        const validation=validateMarketplaceListingInput(input);if(!validation.valid)return json(res,400,{error:validation.error});
        const mediaIds=[...new Set((Array.isArray(input.mediaIds)?input.mediaIds:[]).map(value=>String(value||'')))];
        if(mediaIds.length>8)return json(res,400,{error:'Choose no more than 8 listing photos.'});
        const assets=mediaIds.map(id=>(db.mediaAssets||[]).find(asset=>asset.id===id&&asset.ownerId===user.id&&asset.slot==='marketplace'&&asset.status==='uploaded'&&asset.mediaType==='image'));
        if(assets.some(asset=>!asset))return json(res,400,{error:'One or more listing photos are unavailable. Upload them again.'});
        const listing={id:uid(),sellerId:user.id,...validation.value,mediaIds,status:'active',views:0,createdAt:now(),updatedAt:now()};
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_listing_sync',{userId:user.id,listing});return json(res,201,{listing:await publicMarketplaceListing(result.listing||listing,user.id)});}
        assets.forEach(asset=>{asset.status='attached';asset.attachedTo='marketplace:'+listing.id;});
        db.marketplaceListings||=[];db.marketplaceListings.unshift(listing);await saveStore();
        return json(res,201,{listing:await publicMarketplaceListing(listing,user.id)});
      }
      const marketplaceSaveMatch=p.match(/^\/api\/marketplace\/listings\/([^/]+)\/save$/);
      if((method==='POST'||method==='DELETE')&&marketplaceSaveMatch){
        if(isSupabasePersistence()){const listing=(await requestSupabaseState('marketplace_listing_get',{userId:user.id,listingId:marketplaceSaveMatch[1]})).listing;if(!listing||blockedBetween(user.id,listing.sellerId))return json(res,404,{error:'Marketplace listing not found.'});const result=await requestSupabaseState('marketplace_listing_save',{userId:user.id,listingId:marketplaceSaveMatch[1],save:method==='POST'});return json(res,200,result);}
        const listing=(db.marketplaceListings||[]).find(item=>item.id===marketplaceSaveMatch[1]);
        if(!isMarketplaceListingActive(listing)||blockedBetween(user.id,listing.sellerId))return json(res,404,{error:'Marketplace listing not found.'});
        db.marketplaceSaved||=[];const existing=db.marketplaceSaved.find(item=>item.userId===user.id&&item.listingId===listing.id);
        if(method==='POST'&&!existing)db.marketplaceSaved.unshift({id:uid(),userId:user.id,listingId:listing.id,createdAt:now()});
        if(method==='DELETE'&&existing)db.marketplaceSaved=db.marketplaceSaved.filter(item=>item.id!==existing.id);
        await saveStore();return json(res,200,{saved:method==='POST'});
      }
      const marketplaceEnquiryMatch=p.match(/^\/api\/marketplace\/listings\/([^/]+)\/enquiries$/);
      if(method==='POST'&&marketplaceEnquiryMatch){
        const listing=isSupabasePersistence()?(await requestSupabaseState('marketplace_listing_get',{userId:user.id,listingId:marketplaceEnquiryMatch[1]})).listing:(db.marketplaceListings||[]).find(item=>item.id===marketplaceEnquiryMatch[1]);
        if(!isMarketplaceListingActive(listing)||listing.sellerId===user.id||blockedBetween(user.id,listing.sellerId))return json(res,404,{error:'This listing is unavailable for enquiries.'});
        const seller=db.users.find(member=>member.id===listing.sellerId),text=String(input.text||'').trim();
        if(!seller||text.length<5||text.length>2000)return json(res,400,{error:'Write an enquiry of 5–2000 characters.'});
        const audience=getUserSettings(seller).privacy.messageAudience;
        if(audience!=='everyone'&&!isFriend(user.id,seller.id))return json(res,403,{error:'This seller only accepts new messages from confirmed friends.'});
        const message={id:uid(),from:user.id,to:seller.id,text:'Marketplace enquiry: '+listing.title+'\n\n'+text,marketplaceListingId:listing.id,messageKind:'marketplace_inquiry',createdAt:now(),read:false};
        db.messages.push(message);db.marketplaceInquiries||=[];
        const inquiry={id:uid(),listingId:listing.id,senderId:user.id,sellerId:seller.id,messageId:message.id,status:'sent',createdAt:now()};
        db.marketplaceInquiries.unshift(inquiry);notify(seller.id,user.id,'message',user.name+' sent an enquiry about '+listing.title+'.',{marketplaceListingId:listing.id});
        await saveStore();return json(res,201,{inquiry:{id:inquiry.id,listingId:listing.id,status:inquiry.status,createdAt:inquiry.createdAt},messageId:message.id});
      }
      const marketplaceListingMatch=p.match(/^\/api\/marketplace\/listings\/([^/]+)$/);
      if(marketplaceListingMatch&&method==='GET'){
        const listing=isSupabasePersistence()?(await requestSupabaseState('marketplace_listing_get',{userId:user.id,listingId:marketplaceListingMatch[1]})).listing:(db.marketplaceListings||[]).find(item=>item.id===marketplaceListingMatch[1]);
        if(!listing||blockedBetween(user.id,listing.sellerId)||(!isMarketplaceListingActive(listing)&&!canManageMarketplaceListing(listing,user.id)))return json(res,404,{error:'Marketplace listing not found.'});
        if(listing.sellerId!==user.id){listing.views=Number(listing.views||0)+1;await saveStore();}
        return json(res,200,{listing:await publicMarketplaceListing(listing,user.id)});
      }
      if(marketplaceListingMatch&&method==='PATCH'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_listing_set_status',{userId:user.id,listingId:marketplaceListingMatch[1],status:String(input.status||'')});return json(res,200,{listing:await publicMarketplaceListing(result.listing,user.id)});}
        const listing=(db.marketplaceListings||[]).find(item=>item.id===marketplaceListingMatch[1]);
        if(!listing)return json(res,404,{error:'Marketplace listing not found.'});
        if(!canManageMarketplaceListing(listing,user.id))return json(res,403,{error:'Only the seller can manage this listing.'});
        const status=String(input.status||'');if(!['active','paused','sold'].includes(status))return json(res,400,{error:'Choose Active, Paused or Sold.'});
        if(status==='active'&&listing.kind==='product'&&Number(listing.quantity||0)<1)return json(res,409,{error:'Add available stock before reactivating this product.'});
        listing.status=status;if(status==='sold'&&listing.kind==='product')listing.quantity=0;listing.updatedAt=now();
        await saveStore();return json(res,200,{listing:await publicMarketplaceListing(listing,user.id)});
      }
      if(marketplaceListingMatch&&method==='DELETE'){
        if(isSupabasePersistence()){const result=await requestSupabaseState('marketplace_listing_set_status',{userId:user.id,listingId:marketplaceListingMatch[1],status:'removed'});return json(res,200,{ok:true,id:result.listing.id});}
        const listing=(db.marketplaceListings||[]).find(item=>item.id===marketplaceListingMatch[1]);
        if(!listing)return json(res,404,{error:'Marketplace listing not found.'});
        if(!canManageMarketplaceListing(listing,user.id))return json(res,403,{error:'Only the seller can remove this listing.'});
        listing.status='removed';listing.removedAt=now();listing.updatedAt=now();
        (listing.mediaIds||[]).forEach(id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id&&item.ownerId===user.id);if(asset){asset.status='deleted';asset.deletedAt=now();}});
        await saveStore();return json(res,200,{ok:true,id:listing.id});
      }
      if(method==='POST'&&p==='/api/auth/phone/change'){
        if(AUTH_PROVIDER!=='supabase')return json(res,503,{error:'Verified phone authentication requires Supabase Auth.'});
        const phone=normalizeContactPhone(input.phone||'');
        if(!phone||!validateContactPhone(phone).valid)return json(res,400,{error:'Enter a valid international phone number, including + and country code.'});
        const session=sessionFromRequest(req),auth=await sessionAuth(session);
        if(!auth?.access_token)return json(res,401,{error:'Your secure session has expired. Log in again.'});
        await supabaseRequestPhoneChange(auth.access_token,phone);
        return json(res,202,{verificationRequired:true,phone,message:'A verification code was requested. Enter the code sent to this phone.'});
      }
      if(method==='POST'&&p==='/api/auth/phone/verify'){
        if(AUTH_PROVIDER!=='supabase')return json(res,503,{error:'Verified phone authentication requires Supabase Auth.'});
        const phone=normalizeContactPhone(input.phone||''),token=String(input.token||'').replace(/\s/g,'');
        if(!phone||!validateContactPhone(phone).valid)return json(res,400,{error:'Enter a valid international phone number, including + and country code.'});
        if(!/^\d{6}$/.test(token))return json(res,400,{error:'Enter the six-digit SMS verification code.'});
        const session=sessionFromRequest(req),auth=await sessionAuth(session);
        if(!auth?.access_token)return json(res,401,{error:'Your secure session has expired. Log in again.'});
        const verified=await supabaseVerifyPhoneChange(auth.access_token,phone,token);
        if(verified.access_token&&verified.refresh_token){
          session.authSealed=sealSessionAuth(verified);
          session.authExpiresAt=new Date(Date.now()+Math.max(60,Number(verified.expires_in||3600))*1000).toISOString();
        }
        user.contactPhone=phone;
        await saveStore();
        return json(res,200,{ok:true,phoneVerified:true,phone,message:'Phone number verified and saved to Supabase Auth.'});
      }
      if(method==='POST'&&p==='/api/media/upload/prepare'){
        const slot=String(input.slot||''),mimeType=String(input.mimeType||'').toLowerCase(),byteSize=Number(input.byteSize||0),fileName=String(input.fileName||'').trim().slice(0,255);
        const mimeKinds={
          'image/jpeg':'image','image/png':'image','image/webp':'image','image/avif':'image',
          'video/mp4':'video','video/webm':'video','video/quicktime':'video',
          'audio/mpeg':'audio','audio/mp4':'audio','audio/ogg':'audio','audio/webm':'audio','audio/wav':'audio','audio/x-wav':'audio','audio/flac':'audio','audio/aac':'audio','model/gltf-binary':'model3d','application/pdf':'document',
          'text/plain':'document','text/csv':'document','application/zip':'document','application/x-zip-compressed':'document',
          'application/msword':'document','application/vnd.ms-excel':'document','application/vnd.ms-powerpoint':'document',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'document',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation':'document'
        };
        const allowedSlots={
          avatar:['image/jpeg','image/png','image/webp','image/avif'],
          cover:['image/jpeg','image/png','image/webp','image/avif'],
          post:Object.keys(mimeKinds),
          story:['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','video/quicktime'],
          group:['image/jpeg','image/png','image/webp','video/mp4'],
          page:['image/jpeg','image/png','image/webp','video/mp4'],
          marketplace:['image/jpeg','image/png','image/webp','image/avif'],
          message:['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/ogg','audio/webm','application/pdf','text/plain','text/csv','application/zip','application/x-zip-compressed','application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation'],
          ringtone:Object.keys(CALL_RINGTONE_MIME_TYPES)
        };
        const limits={avatar:10*1024*1024,cover:20*1024*1024,post:500*1024*1024,story:200*1024*1024,group:250*1024*1024,page:250*1024*1024,marketplace:15*1024*1024,message:100*1024*1024,ringtone:CALL_RINGTONE_MAX_BYTES};
        if(!allowedSlots[slot]||!allowedSlots[slot].includes(mimeType)||!Number.isSafeInteger(byteSize)||byteSize<1||byteSize>limits[slot])return json(res,400,{error:'The selected file type or size is not allowed for this media area.'});
        const prepared=await mediaGateway('media_upload_prepare',{ownerId:user.id,slot,mimeType,byteSize});
        const asset={id:uid(),ownerId:user.id,slot,bucket:prepared.bucket,path:prepared.path,mimeType,mediaType:mimeKinds[mimeType],byteSize,originalName:fileName||'Attachment',status:'uploading',createdAt:now()};
        db.mediaAssets.push(asset);await saveStore();
        return json(res,201,{assetId:asset.id,upload:{endpoint:prepared.endpoint,token:prepared.token,signedUrl:prepared.signedUrl||null,bucket:prepared.bucket,path:prepared.path},mimeType,mediaType:asset.mediaType,byteSize});
      }
      if(method==='POST'&&p==='/api/media/upload/complete'){
        const asset=(db.mediaAssets||[]).find(item=>item.id===String(input.assetId||'')&&item.ownerId===user.id);
        if(!asset)return json(res,404,{error:'The media upload record was not found.'});
        if(asset.status!=='uploading')return json(res,409,{error:'This upload has already been completed or retired.'});
        const completed=await mediaGateway('media_upload_complete',{ownerId:user.id,assetId:asset.id,slot:asset.slot,originalName:asset.originalName||'Attachment',bucket:asset.bucket,path:asset.path,mimeType:asset.mimeType,byteSize:asset.byteSize});
        if(asset.slot==='avatar'||asset.slot==='cover'){
          if(typeof completed.url!=='string'||!completed.url.startsWith('https://'))return json(res,502,{error:'Minglora could not finalize this profile image.'});
          const previous=(db.mediaAssets||[]).find(item=>item.ownerId===user.id&&item.slot===asset.slot&&item.status==='attached');
          if(previous){previous.status='deleted';previous.deletedAt=now();}
          user[asset.slot]=completed.url;user[asset.slot+'AssetId']=asset.id;asset.status='attached';asset.attachedTo='profile:'+asset.slot;asset.url=completed.url;
        }else{
          asset.status='uploaded';
        }
        asset.completedAt=now();await saveStore();
        return json(res,200,{asset:{id:asset.id,slot:asset.slot,bucket:asset.bucket,path:asset.path,mimeType:asset.mimeType,mediaType:asset.mediaType,byteSize:asset.byteSize,previewUrl:completed.signedUrl||completed.url||null,url:completed.url||null},user:(asset.slot==='avatar'||asset.slot==='cover')?safeUser(user):undefined});
      }
      if(method==='POST'&&p==='/api/media/upload')return json(res,410,{error:'Direct base64 media uploads have been retired. Use the signed resumable device-media upload flow.'});
      if(method==='POST'&&p==='/api/account/deactivate'){
        const confirmation=String(input.confirmation||'');
        if(confirmation!=='DEACTIVATE')return json(res,400,{error:'Type DEACTIVATE to confirm temporary account deactivation.'});
        const currentSession=sessionFromRequest(req);
        if(AUTH_PROVIDER==='supabase'){
          const auth=await sessionAuth(currentSession);
          if(!auth?.access_token)return json(res,401,{error:'Your secure session has expired. Log in again.'});
          await supabaseUpdateUserMetadata(auth.access_token,{account_status:'deactivated'});
        }
        user.status='deactivated';
        db.sessions=(db.sessions||[]).filter(item=>item.userId!==user.id);
        db.pendingAuth=(db.pendingAuth||[]).filter(item=>item.userId!==user.id);
        await saveStore();
        return json(res,200,{ok:true,message:'Your Minglora account is deactivated. Sign in again to reactivate it.'},{'Set-Cookie':'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});
      }
      if(method==='POST'&&p==='/api/account/deletion-request'){
        const currentPassword=String(input.currentPassword||'');
        if(currentPassword.length<10)return json(res,400,{error:'Enter your current password to confirm this deletion request.'});
        if(AUTH_PROVIDER==='supabase'){
          const reauthenticated=await supabaseSignIn({email:user.email,password:currentPassword});
          if(reauthenticated.user?.id&&reauthenticated.user.id!==user.id)return json(res,401,{error:'Your current password did not authenticate this account.'});
        }else{
          if(!user.passwordHash)return json(res,503,{error:'Account deletion confirmation is unavailable for this account provider.'});
          const [salt,expected]=user.passwordHash.split(':');
          const actual=(await scrypt(currentPassword,salt,64)).toString('hex');
          if(actual.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return json(res,401,{error:'Your current password is incorrect.'});
        }
        let deletionRequest;
        if(AUTH_PROVIDER==='supabase'){
          const requestResult=await requestSupabaseState('account_deletion_request',{userId:user.id});
          deletionRequest=requestResult.request;
        }else{
          db.dataRightsRequests=db.dataRightsRequests||[];
          deletionRequest=db.dataRightsRequests.find(item=>item.userId===user.id&&item.requestType==='deletion'&&['requested','processing'].includes(item.status));
          if(!deletionRequest){
            deletionRequest={id:uid(),userId:user.id,requestType:'deletion',status:'requested',requestedAt:now(),completedAt:null};
            db.dataRightsRequests.push(deletionRequest);
            await saveStore();
          }
        }
        return json(res,202,{ok:true,alreadyRequested:Boolean(deletionRequest?.alreadyRequested),request:deletionRequest,message:'Your permanent deletion request has been recorded for review. Your account remains active until the deletion process is completed.'});
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
        const currentPassword=String(input.currentPassword||'');
        if(!currentPassword)return json(res,400,{error:'Enter your current password to confirm the email change.'});
        const reauthenticated=await supabaseSignIn({email:user.email,password:currentPassword});
        if(reauthenticated.user?.id&&reauthenticated.user.id!==user.id)return json(res,401,{error:'Your current password did not authenticate this account.'});
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
        return json(res,200,{enabled:factors.some(item=>item.type==='totp'&&item.status==='verified'),available:true,aal:tokenAal(auth.access_token),factors});
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
        const enrolled=await supabaseListFactors(auth.access_token);
        const factor=(enrolled.factors||[]).find(item=>item.id===factorId&&item.factor_type==='totp'&&item.status==='unverified');
        if(!factor)return json(res,404,{error:'This pending authenticator enrollment was not found for your account. Start setup again.'});
        const challenge=await supabaseChallengeFactor(auth.access_token,factorId);
        const verified=await supabaseVerifyFactor(auth.access_token,factorId,challenge.id,code);
        if(!verified?.access_token||tokenAal(verified.access_token)!=='aal2')return json(res,502,{error:'Supabase verified the authenticator but did not return an elevated sign-in session. Sign in again and retry.'});
        currentSession.authSealed=sealSessionAuth(verified);
        currentSession.authExpiresAt=new Date(getAuthTokenExpiresAt(verified)).toISOString();
        currentSession.authInvalidatedAt=null;
        currentSession.mfaVerified=true;
        await saveStore();
        return json(res,200,{ok:true,aal:'aal2',factor:{id:verified.id,status:verified.status||'verified'}});
      }
      const securityFactorMatch=p.match(/^\/api\/security\/mfa\/factors\/([^/]+)$/);
      if(method==='DELETE'&&securityFactorMatch){
        const auth=await sessionAuth(currentSession);if(!auth?.access_token)return json(res,401,{error:'Your secure session has expired. Log in again.'});
        const factorId=securityFactorMatch[1];
        const enrolled=await supabaseListFactors(auth.access_token);
        const factor=(enrolled.factors||[]).find(item=>item.id===factorId&&item.factor_type==='totp'&&['verified','unverified'].includes(item.status));
        if(!factor)return json(res,404,{error:'Authenticator not found for this account.'});
        let removalTokens=auth;
        if(factor.status==='verified'&&tokenAal(auth.access_token)!=='aal2'){
          const code=String(input.code||'').replace(/\s/g,'');
          if(!/^\d{6,8}$/.test(code))return json(res,400,{error:'Enter the current authenticator code to confirm removal.'});
          const challenge=await supabaseChallengeFactor(auth.access_token,factorId);
          removalTokens=await supabaseVerifyFactor(auth.access_token,factorId,challenge.id,code);
          if(!removalTokens?.access_token||tokenAal(removalTokens.access_token)!=='aal2')return json(res,401,{error:'The authenticator code could not establish a verified session.'});
        }
        await supabaseUnenrollFactor(removalTokens.access_token,factorId);
        const refreshToken=removalTokens.refresh_token||auth.refresh_token;
        try{
          if(!refreshToken)throw new Error('No refresh token is available.');
          const refreshed=await supabaseRefreshSession(refreshToken);
          if(!refreshed?.access_token)throw new Error('The provider did not return a refreshed session.');
          currentSession.authSealed=sealSessionAuth(refreshed);
          currentSession.authExpiresAt=new Date(getAuthTokenExpiresAt(refreshed)).toISOString();
          currentSession.authInvalidatedAt=null;
          currentSession.mfaVerified=tokenAal(refreshed.access_token)==='aal2';
          await saveStore();
          return json(res,200,{ok:true,reauthenticationRequired:false,aal:tokenAal(refreshed.access_token)});
        }catch{
          currentSession.authSealed=null;currentSession.authExpiresAt=null;currentSession.authInvalidatedAt=now();currentSession.mfaVerified=false;
          await saveStore();
          return json(res,200,{ok:true,reauthenticationRequired:true,message:'Authenticator removed. Sign in again to renew your security session.'},{'Set-Cookie':'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});
        }
      }
      if(method==='POST'&&p==='/api/reports'){
        const targetType=String(input.targetType||''),targetId=String(input.targetId||''),category=String(input.category||''),details=String(input.details||'').trim();
        const allowedTypes=['user','post','comment','story','group','page','message','marketplace_listing'];
        const allowedCategories=['spam','harassment','hate','nudity','violence','scam','impersonation','copyright','privacy','other'];
        if(!allowedTypes.includes(targetType)||!targetId||!allowedCategories.includes(category)||details.length>2000)return json(res,400,{error:'Choose a report type, reason and optional details (maximum 2000 characters).'});
        let exists=false;
        if(targetType==='user')exists=db.users.some(item=>item.id===targetId&&item.id!==user.id);
        if(targetType==='post')exists=Boolean(findReportedPost(targetId));
        if(targetType==='comment')exists=db.posts.some(post=>(post.comments||[]).some(comment=>comment.id===targetId));
        if(targetType==='story')exists=(db.stories||[]).some(item=>item.id===targetId);
        if(targetType==='group')exists=(db.groups||[]).some(item=>item.id===targetId);
        if(targetType==='page')exists=(db.pages||[]).some(item=>item.id===targetId);
        if(targetType==='marketplace_listing')exists=(db.marketplaceListings||[]).some(item=>item.id===targetId&&item.status!=='removed');
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
          targetOwner:safeUser((item.targetType==='user'?db.users.find(u=>u.id===item.targetId):item.targetType==='post'?db.users.find(u=>u.id===findReportedPost(item.targetId)?.ownerId):item.targetType==='story'?db.users.find(u=>u.id===(db.stories||[]).find(story=>story.id===item.targetId)?.userId):item.targetType==='marketplace_listing'?db.users.find(u=>u.id===(db.marketplaceListings||[]).find(listing=>listing.id===item.targetId)?.sellerId):null))
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
          if(action==='hide_post'&&report.targetType==='post'){const found=findReportedPost(report.targetId);if(found){found.post.status='hidden';found.post.hiddenAt=now();}}
          if(action==='remove_post'&&report.targetType==='post'){
            const found=findReportedPost(report.targetId);
            if(found){
              db[found.collection]=db[found.collection].filter(item=>item.id!==found.post.id);
              (found.post.mediaIds||[]).forEach(id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id);if(asset){asset.status='deleted';asset.deletedAt=now();}});
              db.savedPosts=(db.savedPosts||[]).filter(item=>item.postId!==found.post.id);
            }
          }
          if(action==='remove_story'&&report.targetType==='story'){const story=(db.stories||[]).find(item=>item.id===report.targetId);if(story){db.stories=db.stories.filter(item=>item.id!==story.id);db.storyViews=(db.storyViews||[]).filter(item=>item.storyId!==story.id);if(story.mediaId){const asset=(db.mediaAssets||[]).find(item=>item.id===story.mediaId);if(asset){asset.status='deleted';asset.deletedAt=now();}}}}
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
        const health = await verifyLiveKitConnection();
        return json(res, 200, { provider: 'livekit', ...health });
      }
      if (method === 'GET' && p === '/api/live/sessions') {
        await liveSessionCleanupReady;
        const liveHealth = await verifyLiveKitConnection();
        if (!liveHealth.connected) return json(res, 200, { sessions: [] });
        const canView = session => {
          if (session.hostId === user.id || session.visibility === 'public') return true;
          if (session.visibility !== 'friends') return false;
          return isFriend(user.id, session.hostId);
        };
        const activeSessions = (db.liveSessions || [])
          .filter(session => session.status === 'live' && !blockedBetween(user.id, session.hostId) && canView(session))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const sessions = [];
        for (const session of activeSessions) {
          try {
            const participants = await listLiveKitParticipants(session.roomName);
            const hostPresent = participants.some(participant => participant.identity === session.hostId);
            if (!hostPresent) {
              const startedAt = new Date(session.createdAt || 0).getTime();
              if (Number.isFinite(startedAt) && Date.now() - startedAt >= LIVE_HOST_CONNECT_GRACE_MS) {
                try { await endLiveSession(session, { deleteRoom: true }); }
                catch (error) { console.warn('[Minglora LIVE cleanup] Could not persist an ended session.', { sessionId: session.id, message: String(error?.message || 'cleanup failed').slice(0, 180) }); }
              }
              // No creator is connected. Never show this session or substitute stale app-side presence.
              continue;
            }
            sessions.push({
              ...session,
              host: safeUser(db.users.find(member => member.id === session.hostId), user.id),
              viewerCount: participants.filter(participant => participant.identity !== session.hostId).length,
              viewerCountVerified: true
            });
          } catch (error) {
            const startedAt = new Date(session.createdAt || 0).getTime();
            if (isMissingLiveKitRoom(error) && Number.isFinite(startedAt) && Date.now() - startedAt >= LIVE_HOST_CONNECT_GRACE_MS) {
              try { await endLiveSession(session); }
              catch (cleanupError) { console.warn('[Minglora LIVE cleanup] Could not close a missing-room session.', { sessionId: session.id, message: String(cleanupError?.message || 'cleanup failed').slice(0, 180) }); }
            }
            // Fail closed: an unverified room is not advertised as live.
          }
        }
        return json(res, 200, { sessions });
      }
      if (method === 'POST' && p === '/api/live/sessions') {
        if (!isLiveKitConfigured()) return json(res, 503, { error: 'Live video is not configured. Add Minglora LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to the server environment.' });
        const liveHealth = await verifyLiveKitConnection();
        if (!liveHealth.connected) return json(res, 503, { error: liveHealth.error || 'Minglora could not verify its LiveKit connection.' });
        const title = String(input.title || '').trim();
        const visibility = String(input.visibility || 'public');
        const broadcastType = String(input.broadcastType || 'video_audio');
        if (!title || title.length > 120 || !['public', 'friends', 'private'].includes(visibility) ||
            !['video_audio', 'audio_only'].includes(broadcastType)) {
          return json(res, 400, { error: 'Enter a live title, choose an audience and select Video + Audio or Audio Only.' });
        }
        const id = uid();
        const roomName = 'minglora-' + id.replace(/-/g, '');
        const publishSources = broadcastType === 'audio_only' ? [LIVEKIT_TRACK_SOURCE.MICROPHONE] : [LIVEKIT_TRACK_SOURCE.MICROPHONE, LIVEKIT_TRACK_SOURCE.CAMERA];
        const liveKit = await createLiveKitToken({
          identity: user.id,
          name: user.name,
          roomName,
          canPublish: true,
          publishSources
        });
        const requestedLiveTheme = String(input.liveTheme || getUserSettings(user).preferences.liveRoomTheme);
        const liveTheme = LIVE_ROOM_THEMES.includes(requestedLiveTheme) ? requestedLiveTheme : DEFAULT_SETTINGS.preferences.liveRoomTheme;
        const session = { id, roomName, hostId: user.id, title, visibility, broadcastType, liveTheme, status: 'live', createdAt: now(), endedAt: null };
        await requestSupabaseState('live_broadcast_create',{id,hostId:user.id,title,audience:visibility,broadcastType,roomRef:roomName,description:String(input.description||'').slice(0,2000)});
        db.liveSessions = db.liveSessions || [];
        db.liveSessions.unshift(session);
        if(visibility==='public'){
          const followerIds=[...new Set((db.follows||[]).filter(edge=>edge.followedId===user.id).map(edge=>edge.followerId))];
          for(const followerId of followerIds)if(!blockedBetween(followerId,user.id))notify(followerId,user.id,'live',user.name+' is LIVE: '+title,{liveSessionId:id});
        }
        await saveStore();
        return json(res, 201, { session, liveKit: { ...liveKit, role: 'host' } });
      }
      const liveThemeMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/theme$/);
      if (method === 'GET' && liveThemeMatch) {
        const session = (db.liveSessions || []).find(item => item.id === liveThemeMatch[1] && item.status === 'live');
        if (!session || blockedBetween(user.id, session.hostId)) return json(res, 404, { error: 'Live session not found.' });
        const allowed = session.hostId === user.id || session.visibility === 'public' || (session.visibility === 'friends' && isFriend(user.id, session.hostId));
        if (!allowed) return json(res, 404, { error: 'Live session not found.' });
        const liveTheme = LIVE_ROOM_THEMES.includes(session.liveTheme) ? session.liveTheme : DEFAULT_SETTINGS.preferences.liveRoomTheme;
        return json(res, 200, { liveTheme });
      }
      if (method === 'PATCH' && liveThemeMatch) {
        const session = (db.liveSessions || []).find(item => item.id === liveThemeMatch[1] && item.status === 'live');
        if (!session) return json(res, 404, { error: 'Live session not found.' });
        if (session.hostId !== user.id) return json(res, 403, { error: 'Only the LIVE host can change this room theme.' });
        const liveTheme = String(input.liveTheme || '');
        if (!LIVE_ROOM_THEMES.includes(liveTheme)) return json(res, 400, { error: 'Choose a supported LIVE room theme.' });
        session.liveTheme = liveTheme;
        await saveStore();
        return json(res, 200, { liveTheme });
      }
      const liveSpeakerRequestsMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/speaker-requests$/);
      if (liveSpeakerRequestsMatch && method === 'GET') {
        const session = (db.liveSessions || []).find(item => item.id === liveSpeakerRequestsMatch[1] && item.status === 'live');
        if (!session || session.hostId !== user.id) return json(res, 404, { error: 'LIVE host access is required.' });
        const requests = (db.liveSpeakerRequests || [])
          .filter(item => item.sessionId === session.id && ['requested', 'accepted', 'connected'].includes(item.status))
          .map(item => ({ ...item, user: safeUser(db.users.find(member => member.id === item.userId), user.id) }));
        return json(res, 200, { requests });
      }
      if (liveSpeakerRequestsMatch && method === 'POST') {
        const session = (db.liveSessions || []).find(item => item.id === liveSpeakerRequestsMatch[1] && item.status === 'live');
        if (!session || session.hostId === user.id || blockedBetween(user.id, session.hostId)) return json(res, 404, { error: 'LIVE session not found.' });
        const allowed = session.visibility === 'public' || (session.visibility === 'friends' && isFriend(user.id, session.hostId));
        if (!allowed) return json(res, 404, { error: 'LIVE session not found.' });
        const joined = (db.liveParticipants || []).some(item => item.sessionId === session.id && item.userId === user.id && !item.leftAt);
        if (!joined) return json(res, 409, { error: 'Join the LIVE room before requesting a speaker place.' });
        db.liveSpeakerRequests = db.liveSpeakerRequests || [];
        const previous = db.liveSpeakerRequests.find(item => item.sessionId === session.id && item.userId === user.id);
        if (previous && ['requested', 'accepted'].includes(previous.status)) return json(res, 200, { request: previous });
        await requestSupabaseState('live_speaker_request', { broadcastId: session.id, userId: user.id });
        const request = { id: uid(), sessionId: session.id, userId: user.id, role: 'guest', status: 'requested', requestedAt: now(), acceptedAt: null, connectedAt: null, leftAt: null };
        if (previous) Object.assign(previous, request); else db.liveSpeakerRequests.unshift(request);
        await saveStore();
        return json(res, 201, { request });
      }
      const liveSpeakerStatusMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/speaker-request$/);
      if (method === 'GET' && liveSpeakerStatusMatch) {
        const session = (db.liveSessions || []).find(item => item.id === liveSpeakerStatusMatch[1] && item.status === 'live');
        if (!session || blockedBetween(user.id, session.hostId)) return json(res, 404, { error: 'LIVE session not found.' });
        const request = (db.liveSpeakerRequests || []).find(item => item.sessionId === session.id && item.userId === user.id) || null;
        return json(res, 200, { request });
      }
      const liveSpeakerDecisionMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/speaker-requests\/([^/]+)$/);
      if (method === 'PATCH' && liveSpeakerDecisionMatch) {
        const session = (db.liveSessions || []).find(item => item.id === liveSpeakerDecisionMatch[1] && item.status === 'live');
        if (!session || session.hostId !== user.id) return json(res, 404, { error: 'LIVE host access is required.' });
        const speakerId = liveSpeakerDecisionMatch[2], decision = String(input.decision || '');
        if (speakerId === user.id || !['accept', 'reject'].includes(decision)) return json(res, 400, { error: 'Choose a valid speaker request decision.' });
        const request = (db.liveSpeakerRequests || []).find(item => item.sessionId === session.id && item.userId === speakerId && item.status === 'requested');
        if (!request) return json(res, 404, { error: 'This speaker request is no longer pending.' });
        if (decision === 'accept') {
          const activeSpeakers = (db.liveSpeakerRequests || []).filter(item =>
            item.sessionId === session.id && ['accepted', 'connected'].includes(item.status)
          ).length;
          if (activeSpeakers >= 8) return json(res, 409, { error: 'The eight guest speaker places are full.' });
        }
        await requestSupabaseState('live_speaker_request_review', { broadcastId: session.id, hostId: user.id, speakerId, decision });
        request.status = decision === 'accept' ? 'accepted' : 'rejected';
        request.acceptedAt = decision === 'accept' ? now() : null;
        request.reviewedAt = now();
        await saveStore();
        return json(res, 200, { request });
      }
      let liveMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/join$/);
      if (method === 'POST' && liveMatch) {
        if (!isLiveKitConfigured()) return json(res, 503, { error: 'Live video is not configured for Minglora.' });
        const liveHealth = await verifyLiveKitConnection();
        if (!liveHealth.connected) return json(res, 503, { error: liveHealth.error || 'Minglora could not verify its LiveKit connection.' });
        const session = (db.liveSessions || []).find(item => item.id === liveMatch[1] && item.status === 'live');
        if (!session || blockedBetween(user.id, session.hostId)) return json(res, 404, { error: 'Live session not found.' });
        const friendAccess = isFriend(user.id, session.hostId);
        const allowed = session.hostId === user.id ||
          session.visibility === 'public' ||
          (session.visibility === 'friends' && friendAccess);
        if (!allowed) return json(res, 404, { error: 'Live session not found.' });
        const speakerRequest = (db.liveSpeakerRequests || []).find(item =>
          item.sessionId === session.id && item.userId === user.id
        );
        const role = session.hostId === user.id ? 'host' : ['accepted', 'connected'].includes(speakerRequest?.status) ? 'guest' : 'viewer';
        const publishSources = role === 'host'
          ? (session.broadcastType === 'audio_only' ? [LIVEKIT_TRACK_SOURCE.MICROPHONE] : [LIVEKIT_TRACK_SOURCE.MICROPHONE, LIVEKIT_TRACK_SOURCE.CAMERA])
          : role === 'guest' ? [LIVEKIT_TRACK_SOURCE.MICROPHONE] : null;
        const liveKit = await createLiveKitToken({
          identity: user.id,
          name: user.name,
          roomName: session.roomName,
          canPublish: role === 'host' || role === 'guest',
          publishSources
        });
        return json(res, 200, { session, liveKit: { ...liveKit, role } });
      }
      const liveConnectedMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/connected$/);
      if (method === 'POST' && liveConnectedMatch) {
        const session = (db.liveSessions || []).find(item => item.id === liveConnectedMatch[1] && item.status === 'live');
        if (!session || blockedBetween(user.id, session.hostId)) return json(res, 404, { error: 'LIVE session not found.' });
        const canView = session.hostId === user.id || session.visibility === 'public' ||
          (session.visibility === 'friends' && isFriend(user.id, session.hostId));
        if (!canView) return json(res, 404, { error: 'LIVE session not found.' });
        const speakerRequest = (db.liveSpeakerRequests || []).find(item =>
          item.sessionId === session.id && item.userId === user.id
        );
        const role = session.hostId === user.id ? 'host' :
          ['accepted', 'connected'].includes(speakerRequest?.status) ? 'guest' : 'viewer';
        if (role === 'guest' && !speakerRequest) return json(res, 403, { error: 'Host approval is required before joining the speaker stage.' });
        let providerParticipants;
        try {
          providerParticipants = await listLiveKitParticipants(session.roomName);
        } catch {
          return json(res, 503, { error: 'Minglora could not verify the LIVE room connection yet.' });
        }
        if (!providerParticipants.some(participant => participant.identity === user.id)) {
          return json(res, 409, { error: 'LiveKit has not confirmed your connection to this room yet.' });
        }
        await requestSupabaseState('live_participant_mark_connected', {
          broadcastId: session.id, userId: user.id, role
        });
        db.liveParticipants = db.liveParticipants || [];
        const participant = db.liveParticipants.find(item => item.sessionId === session.id && item.userId === user.id);
        const joinedAt = now();
        if (participant) {
          participant.role = role; participant.status = 'connected';
          participant.joinedAt = joinedAt; participant.leftAt = null;
        } else {
          db.liveParticipants.push({ id: uid(), sessionId: session.id, userId: user.id, role, status: 'connected', joinedAt, leftAt: null });
        }
        if (role === 'guest' && speakerRequest) {
          speakerRequest.status = 'connected'; speakerRequest.connectedAt = joinedAt;
        }
        await saveStore();
        return json(res, 200, {
          connected: true, role,
          participant: { userId: user.id, role, name: user.name, joinedAt }
        });
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
        await requestSupabaseState('live_participant_mark_left', { broadcastId: session.id, userId: user.id });
        const speakerRequest = (db.liveSpeakerRequests || []).find(item =>
          item.sessionId === session.id && item.userId === user.id && ['requested', 'accepted', 'connected'].includes(item.status)
        );
        if (speakerRequest) {
          speakerRequest.status = 'left';
          speakerRequest.leftAt = now();
        }
        await saveStore();
        return json(res, 200, { ok: true });
      }
      liveMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/end$/);
      if (method === 'POST' && liveMatch) {
        const session = (db.liveSessions || []).find(item => item.id === liveMatch[1]);
        if (!session) return json(res, 404, { error: 'Live session not found.' });
        if (session.hostId !== user.id) return json(res, 403, { error: 'Only the host can end this live session.' });
        try {
          await endLiveSession(session, { deleteRoom: true });
        } catch (error) {
          console.error('[Minglora LIVE] Could not confirm that the session ended.', { sessionId: session.id, message: String(error?.message || 'cleanup failed').slice(0, 180) });
          return json(res, 503, { error: 'Minglora could not confirm that this LIVE session ended. Try again.' });
        }
        return json(res, 200, { ok: true, session });
      }
      if(method==='GET'&&p==='/api/coins/catalog'){
        return json(res,200,await requestSupabaseState('economy_catalog'));
      }
      if(method==='GET'&&p==='/api/coins/wallet'){
        return json(res,200,await requestSupabaseState('economy_wallet',{userId:user.id}));
      }
      if(method==='POST'&&p==='/api/coins/purchase'){
        const catalogue=await requestSupabaseState('economy_catalog');
        let coinAmount,amountMinor,packageName='Custom Minglora Coins';
        const packageCode=String(input.packageCode||'').trim();
        if(packageCode){
          const selected=(catalogue.packages||[]).find(item=>item.code===packageCode);
          if(!selected)return json(res,400,{error:'Choose an available Minglora coin package.'});
          coinAmount=Number(selected.coin_amount);amountMinor=Number(selected.price_minor);packageName=selected.name;
        }else{
          coinAmount=Number(input.coinAmount);
          if(!Number.isSafeInteger(coinAmount)||coinAmount<100||coinAmount>100000||coinAmount%2!==0){
            return json(res,400,{error:'Enter an even custom amount from 100 to 100,000 Minglora Coins.'});
          }
          amountMinor=coinAmount;
        }
        if(!Number.isSafeInteger(coinAmount)||coinAmount<100||!Number.isSafeInteger(amountMinor)||amountMinor<100){
          return json(res,400,{error:'The selected Minglora coin package is not valid.'});
        }
        const origin=appOrigin(req);
        const order=await paypalRequest('/v2/checkout/orders','POST',{
          intent:'CAPTURE',
          purchase_units:[{
            reference_id:uid(),custom_id:user.id,description:packageName+' · '+coinAmount+' Minglora Coins',
            amount:{currency_code:'USD',value:(amountMinor/100).toFixed(2)}
          }],
          application_context:{
            brand_name:'Minglora',landing_page:'NO_PREFERENCE',user_action:'PAY_NOW',
            shipping_preference:'NO_SHIPPING',
            return_url:origin+'/?paypal=coins',cancel_url:origin+'/?paypal=cancel'
          }
        },'minglora-order-'+uid());
        const approveUrl=(order.links||[]).find(link=>link.rel==='approve')?.href;
        if(!order.id||!approveUrl)return json(res,502,{error:'PayPal did not return a payment approval link.'});
        await requestSupabaseState('economy_purchase_create',{userId:user.id,paypalOrderId:order.id,coinAmount});
        return json(res,201,{orderId:order.id,approveUrl,coinAmount,amountMinor,currency:'USD',coinName:'Minglora Coins'});
      }
      if(method==='POST'&&p==='/api/coins/purchase/capture'){
        const orderId=String(input.orderId||'').trim();
        if(!orderId||orderId.length>160)return json(res,400,{error:'A PayPal order reference is required.'});
        const stored=await requestSupabaseState('economy_purchase_get',{userId:user.id,paypalOrderId:orderId});
        const purchase=stored.purchase;
        if(purchase.status==='captured')return json(res,200,{ok:true,alreadyCaptured:true,coins:purchase.coin_amount,wallet:await requestSupabaseState('economy_wallet',{userId:user.id})});
        if(purchase.status!=='created')return json(res,409,{error:'This Minglora coin purchase cannot be captured.'});
        const captured=await paypalRequest('/v2/checkout/orders/'+encodeURIComponent(orderId)+'/capture','POST',{},'minglora-capture-'+orderId);
        const capture=(captured.purchase_units||[]).flatMap(unit=>unit.payments?.captures||[]).find(item=>item.status==='COMPLETED');
        const paidMinor=Math.round(Number(capture?.amount?.value||0)*100);
        if(!capture?.id||capture.amount?.currency_code!=='USD'||paidMinor!==Number(purchase.amount_minor)){
          return json(res,409,{error:'PayPal has not confirmed the exact USD amount for this coin purchase. No coins were credited.'});
        }
        const settlement=await requestSupabaseState('economy_purchase_settle',{userId:user.id,paypalOrderId:orderId,paypalCaptureId:capture.id});
        const wallet=await requestSupabaseState('economy_wallet',{userId:user.id});
        return json(res,200,{ok:true,settlement:settlement.settlement,wallet});
      }
      if(method==='GET'&&p==='/api/creator/earnings'){
        return json(res,200,await requestSupabaseState('economy_creator_earnings',{creatorId:user.id}));
      }
      if(method==='GET'&&p==='/api/creator/payout-account'){
        return json(res,200,await requestSupabaseState('economy_get_payout_account',{userId:user.id}));
      }
      if(method==='PUT'&&p==='/api/creator/payout-account'){
        const paypalEmail=String(input.paypalEmail||'').trim().toLowerCase();
        const saved=await requestSupabaseState('economy_set_payout_account',{userId:user.id,paypalEmail});
        return json(res,200,saved);
      }
      if(method==='POST'&&p==='/api/creator/payouts'){
        const earnings=await requestSupabaseState('economy_creator_earnings',{creatorId:user.id});
        const payoutEmail=earnings.payoutAccount?.paypal_email;
        if(!payoutEmail)return json(res,400,{error:'Add your PayPal payout email before requesting a withdrawal.'});
        const amountMinor=input.amountMinor===undefined?Number(earnings.availableMinor):Number(input.amountMinor);
        if(!Number.isSafeInteger(amountMinor)||amountMinor<100||amountMinor>Number(earnings.availableMinor)){
          return json(res,400,{error:'Enter an amount up to your available creator earnings (minimum USD 1.00).'});
        }
        const requested=await requestSupabaseState('economy_request_payout',{creatorId:user.id,amountMinor});
        const payoutId=requested.payoutId;
        try{
          const payout=await paypalRequest('/v1/payments/payouts','POST',{
            sender_batch_header:{
              sender_batch_id:'MINGLORA'+String(payoutId).replace(/-/g,'').slice(0,22),
              email_subject:'Your Minglora creator earnings',
              email_message:'Your Minglora creator earnings payout has been submitted.'
            },
            items:[{
              recipient_type:'EMAIL',amount:{value:(amountMinor/100).toFixed(2),currency:'USD'},
              receiver:payoutEmail,note:'Minglora creator earnings · 50% creator share',
              sender_item_id:String(payoutId).replace(/-/g,'').slice(0,30)
            }]
          },'minglora-payout-'+payoutId);
          const batchId=payout.batch_header?.payout_batch_id;
          if(!batchId)throw Object.assign(new Error('PayPal did not return a payout batch reference.'),{status:502});
          await requestSupabaseState('economy_update_payout',{creatorId:user.id,payoutId,status:'processing',paypalBatchId:batchId});
          return json(res,202,{ok:true,payoutId,batchId,status:'processing',amountMinor,currency:'USD'});
        }catch(error){
          // Keep uncertain provider submissions reserved until a verified PayPal event
          // or an administrator reconciliation confirms their final status.
          throw error;
        }
      }
      let liveAction=p.match(/^\/api\/live\/sessions\/([^/]+)\/gifts$/);
      if(method==='POST'&&liveAction){
        const session=(db.liveSessions||[]).find(item=>item.id===liveAction[1]&&item.status==='live');
        if(!session||session.hostId===user.id||blockedBetween(user.id,session.hostId))return json(res,404,{error:'LIVE session is not available for gifting.'});
        const friends=isFriend(user.id,session.hostId);
        const canView=session.visibility==='public'||(session.visibility==='friends'&&friends)||session.hostId===user.id;
        if(!canView)return json(res,404,{error:'LIVE session is not available for gifting.'});
        let hostIsPresent=false;
        try {
          const participants=await listLiveKitParticipants(session.roomName);
          hostIsPresent=participants.some(participant=>participant.identity===session.hostId);
        } catch {
          return json(res,503,{error:'Minglora could not verify that the host is currently LIVE. Try again shortly.'});
        }
        if(!hostIsPresent)return json(res,409,{error:'This host is no longer LIVE. Refresh the LIVE directory.'});
        const result=await requestSupabaseState('economy_send_gift',{senderId:user.id,broadcastId:session.id,giftCode:String(input.giftCode||'')});
        notify(session.hostId,user.id,'gift',user.name+' sent a LIVE gift.');
        await saveStore();
        return json(res,200,{gift:result.gift});
      }
      let liveChat=p.match(/^\/api\/live\/sessions\/([^/]+)\/chat$/);
      if(liveChat&&['GET','POST'].includes(method)){
        const session=(db.liveSessions||[]).find(item=>item.id===liveChat[1]);
        if(!session||session.status!=='live'||blockedBetween(user.id,session.hostId))return json(res,404,{error:'LIVE session not found.'});
        const friends=isFriend(user.id,session.hostId);
        const canView=session.hostId===user.id||session.visibility==='public'||(session.visibility==='friends'&&friends);
        if(!canView)return json(res,404,{error:'LIVE session not found.'});
        if(method==='GET')return json(res,200,await requestSupabaseState('live_chat_list',{broadcastId:session.id}));
        const sent=await requestSupabaseState('live_chat_send',{broadcastId:session.id,userId:user.id,body:String(input.body||'')});
        return json(res,201,sent);
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
        const posts=await Promise.all(db.posts.filter(x=>x.status!=='hidden'&&!blockedBetween(user.id,x.userId)&&canViewProfile(user.id,db.users.find(profile=>profile.id===x.userId))&&(!eligibleIds||eligibleIds.has(x.userId)))
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
        (post.mediaIds||[]).forEach(id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id);if(asset){asset.status='deleted';asset.deletedAt=now();}});
        db.savedPosts=(db.savedPosts||[]).filter(saved=>saved.postId!==post.id);
        await saveStore();return json(res,200,{ok:true,id:post.id});
      }
      if(method==='GET'&&p==='/api/saved-posts'){
        const posts=await Promise.all((db.savedPosts||[]).filter(saved=>saved.userId===user.id).map(saved=>db.posts.find(post=>post.id===saved.postId)).filter(post=>post&&post.status!=='hidden'&&!blockedBetween(user.id,post.userId)).map(post=>publicPost(post,user.id)));
        return json(res,200,{posts});
      }
      m=p.match(/^\/api\/posts\/([^/]+)\/save$/);
      if((method==='POST'||method==='DELETE')&&m){
        const post=db.posts.find(x=>x.id===m[1]);
        if(!post||post.status==='hidden'||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});
        const exists=(db.savedPosts||[]).some(saved=>saved.userId===user.id&&saved.postId===post.id);
        if(method==='POST'&&!exists)db.savedPosts.push({id:uid(),userId:user.id,postId:post.id,createdAt:now()});
        if(method==='DELETE'&&exists)db.savedPosts=db.savedPosts.filter(saved=>!(saved.userId===user.id&&saved.postId===post.id));
        await saveStore();return json(res,200,{saved:method==='POST'});
      }
      m=p.match(/^\/api\/posts\/([^/]+)\/reactions$/);
      if(method==='POST'&&m){const post=db.posts.find(x=>x.id===m[1]);if(!post||post.status==='hidden'||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});post.reactions ||= {};const reaction=String(input.reaction||'like');if(!['like','love','care','haha','wow','sad','angry'].includes(reaction))return json(res,400,{error:'Unsupported reaction.'});if(post.reactions[user.id]===reaction)delete post.reactions[user.id];else post.reactions[user.id]=reaction;if(post.userId!==user.id)notify(post.userId,user.id,'reaction',`${user.name} reacted to your post.`);await saveStore();return json(res,200,{post:await publicPost(post,user.id)});}
      m=p.match(/^\/api\/posts\/([^/]+)\/comments\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const post=db.posts.find(x=>x.id===m[1]);
        if(!post||post.status==='hidden'||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});
        const comment=(post.comments||[]).find(x=>x.id===m[2]);
        if(!comment)return json(res,404,{error:'Comment not found.'});
        if(comment.userId!==user.id&&post.userId!==user.id)return json(res,403,{error:'Only the comment author or post author can delete this comment.'});
        post.comments=post.comments.filter(x=>x.id!==comment.id);
        await saveStore();return json(res,200,{ok:true,id:comment.id});
      }
      m=p.match(/^\/api\/posts\/([^/]+)\/comments$/);
      if(method==='POST'&&m){const post=db.posts.find(x=>x.id===m[1]);const text=String(input.text||'').trim();if(!post||post.status==='hidden'||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});if(!text||text.length>2000)return json(res,400,{error:'Comment must contain 1–2000 characters.'});const comment={id:uid(),userId:user.id,text,createdAt:now()};post.comments.push(comment);if(post.userId!==user.id)notify(post.userId,user.id,'comment',`${user.name} commented on your post.`);await saveStore();return json(res,201,{comment:{...comment,author:safeUser(user)}});}
      if(method==='GET'&&p==='/api/discovery/people'){
        await pruneExpiredStories();
        const follows=db.follows||[];
        const activityAt=new Map();
        for(const post of db.posts||[]){
          if(post.status==='hidden'||blockedBetween(user.id,post.userId))continue;
          const timestamp=Date.parse(post.createdAt)||0;
          if(timestamp>(activityAt.get(post.userId)||0))activityAt.set(post.userId,timestamp);
        }
        for(const story of db.stories||[]){
          if(!canViewStory(user.id,story))continue;
          const timestamp=Date.parse(story.createdAt)||0;
          if(timestamp>(activityAt.get(story.userId)||0))activityAt.set(story.userId,timestamp);
        }
        const candidates=db.users
          .filter(member=>member.id!==user.id&&!blockedBetween(user.id,member.id)&&canViewProfile(user.id,member))
          .sort((first,second)=>Math.max(activityAt.get(second.id)||0,Date.parse(second.createdAt)||0)-Math.max(activityAt.get(first.id)||0,Date.parse(first.createdAt)||0))
          .slice(0,24);
        const users=await Promise.all(candidates.map(async member=>{
          const memberFriendIds=[...new Set(follows
            .filter(edge=>edge.followedId===member.id&&follows.some(reverse=>reverse.followerId===member.id&&reverse.followedId===edge.followerId))
            .map(edge=>edge.followerId)
            .filter(id=>!blockedBetween(user.id,id)))];
          const memberPosts=(db.posts||[])
            .filter(post=>post.userId===member.id&&post.status!=='hidden'&&!blockedBetween(user.id,post.userId))
            .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
          const recentPosts=await Promise.all(memberPosts.slice(0,2).map(publicDiscoveryPost));
          const storyRecord=(db.stories||[])
            .filter(story=>story.userId===member.id&&canViewStory(user.id,story))
            .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0]||null;
          let latestStory=null;
          if(storyRecord){
            const story=await publicStory(storyRecord,user.id);
            latestStory={id:story.id,createdAt:story.createdAt,expiresAt:story.expiresAt,text:story.text||'',media:story.media,viewedByMe:story.viewedByMe};
          }
          return {
            ...safeUser(member,user.id),
            friendship:isFriend(user.id,member.id)?'accepted':null,
            following:follows.some(edge=>edge.followerId===user.id&&edge.followedId===member.id),
            followersCount:follows.filter(edge=>edge.followedId===member.id&&!blockedBetween(user.id,edge.followerId)).length,
            followingCount:follows.filter(edge=>edge.followerId===member.id&&!blockedBetween(user.id,edge.followedId)).length,
            friendsCount:memberFriendIds.length,
            mutualFriendsCount:memberFriendIds.filter(id=>isFriend(user.id,id)).length,
            postsCount:memberPosts.length,
            recentPosts,
            latestStory
          };
        }));
        return json(res,200,{users});
      }
      if(method==='GET'&&p==='/api/users')return json(res,200,{users:db.users.filter(u=>u.id!==user.id&&!blockedBetween(user.id,u.id)&&canViewProfile(user.id,u)).map(u=>({...safeUser(u,user.id),friendship:isFriend(user.id,u.id)?'accepted':null,following:(db.follows||[]).some(f=>f.followerId===user.id&&f.followedId===u.id)}))});

      m=p.match(/^\/api\/users\/([^/]+)\/(followers|following)$/);
      if(method==='GET'&&m){
        const target=db.users.find(member=>member.id===m[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        const relationshipType=m[2];
        const sourceField=relationshipType==='followers'?'followedId':'followerId';
        const resultField=relationshipType==='followers'?'followerId':'followedId';
        const ordered=(db.follows||[])
          .filter(edge=>edge[sourceField]===target.id)
          .sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
        const seen=new Set(),users=[];
        for(const edge of ordered){
          const id=edge[resultField];
          if(!id||seen.has(id))continue;
          seen.add(id);
          const member=db.users.find(item=>item.id===id);
          if(!member||blockedBetween(user.id,member.id)||!canViewProfile(user.id,member))continue;
          users.push(safeUser(member,user.id));
        }
        return json(res,200,{users,count:users.length,relationship:relationshipType});
      }
      m=p.match(/^\/api\/users\/([^/]+)\/follow$/);
      if((method==='POST'||method==='DELETE')&&m){
        const target=db.users.find(u=>u.id===m[1]);
        if(!target||target.id===user.id)return json(res,400,{error:'Choose another valid account.'});
        if(blockedBetween(user.id,target.id))return json(res,403,{error:'This relationship is unavailable.'});
        db.follows ||= [];db.friendships ||= [];
        const exists=db.follows.some(f=>f.followerId===user.id&&f.followedId===target.id);
        if(method==='POST'&&!exists){
          await requestSupabaseState('relationship_follow',{followerId:user.id,followedId:target.id});db.follows.push({id:uid(),followerId:user.id,followedId:target.id,createdAt:now()});notify(target.id,user.id,'follow',`${user.name} started following you.`);}
        if(method==='DELETE'&&exists){
          await requestSupabaseState('relationship_unfollow',{followerId:user.id,followedId:target.id});
          db.follows=db.follows.filter(f=>!(f.followerId===user.id&&f.followedId===target.id));
        }
        const mutual=(db.follows||[]).some(f=>f.followerId===user.id&&f.followedId===target.id)&&(db.follows||[]).some(f=>f.followerId===target.id&&f.followedId===user.id);
        let friendship=(db.friendships||[]).find(f=>(f.from===user.id&&f.to===target.id)||(f.from===target.id&&f.to===user.id))||null;
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
          const outgoingFollow=(db.follows||[]).some(f=>f.followerId===user.id&&f.followedId===target.id);
          const incomingFollow=(db.follows||[]).some(f=>f.followerId===target.id&&f.followedId===user.id);
          if(outgoingFollow)await requestSupabaseState('relationship_unfollow',{followerId:user.id,followedId:target.id});
          if(incomingFollow)await requestSupabaseState('relationship_unfollow',{followerId:target.id,followedId:user.id});
          db.follows=(db.follows||[]).filter(f=>!((f.followerId===user.id&&f.followedId===target.id)||(f.followerId===target.id&&f.followedId===user.id)));
          db.friendships=db.friendships.filter(f=>!((f.from===user.id&&f.to===target.id)||(f.from===target.id&&f.to===user.id)));
        }
        if(method==='DELETE'&&exists)db.blocks=db.blocks.filter(b=>!(b.blockerId===user.id&&b.blockedId===target.id));
        await saveStore();return json(res,200,{blocked:method==='POST'});
      }
      if(method==='GET'&&p==='/api/blocks')return json(res,200,{users:(db.blocks||[]).filter(b=>b.blockerId===user.id).map(b=>safeUser(db.users.find(u=>u.id===b.blockedId))).filter(Boolean)});
      m=p.match(/^\/api\/users\/([^/]+)\/(followers|following|friends)$/);
      if(method==='GET'&&m){
        const target=db.users.find(u=>u.id===m[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        const rows=m[2]==='friends'?(db.follows||[]).filter(f=>f.followedId===target.id&&(db.follows||[]).some(reverse=>reverse.followerId===target.id&&reverse.followedId===f.followerId)):(m[2]==='followers'?(db.follows||[]).filter(f=>f.followedId===target.id):(db.follows||[]).filter(f=>f.followerId===target.id));
        const ids=rows.map(edge=>m[2]==='following'?edge.followedId:edge.followerId);
        const users=[...new Set(ids)].map(id=>db.users.find(u=>u.id===id)).filter(u=>u&&!blockedBetween(user.id,u.id)&&canViewProfile(user.id,u)).map(safeUser);
        return json(res,200,{users,count:users.length});
      }
      m=p.match(/^\/api\/users\/([^/]+)\/profile-presence$/);
      if(method==='POST'&&m){
        const target=db.users.find(member=>member.id===m[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        if(target.id!==user.id){
          db.profileViewPresence ||= [];
          touchProfilePresence(db.profileViewPresence,{targetUserId:target.id,viewerUserId:user.id,at:new Date()});
          await saveStore();
        }
        const profileInsights=target.id===user.id
          ?getProfileViewStats({views:db.profileViews||[],presence:db.profileViewPresence||[],targetUserId:target.id})
          :undefined;
        return json(res,200,{ok:true,...(profileInsights?{profileInsights}:{})});
      }
      if(method==='POST'&&p==='/api/albums'){
        const title=String(input.title||'').trim().slice(0,100),description=String(input.description||'').trim().slice(0,500),visibility=String(input.visibility||'public');
        if(!title)return json(res,400,{error:'Give your album a title.'});
        if(!['public','friends','private'].includes(visibility))return json(res,400,{error:'Choose public, friends or private visibility.'});
        db.albums ||= [];
        const album={id:uid(),ownerId:user.id,title,description,visibility,items:[],createdAt:now(),updatedAt:now()};
        db.albums.unshift(album);await saveStore();return json(res,201,{album});
      }
      m=p.match(/^\/api\/albums\/([^/]+)$/);
      if(m&&method==='PATCH'){
        db.albums ||= [];const album=db.albums.find(item=>item.id===m[1]&&item.ownerId===user.id);
        if(!album)return json(res,404,{error:'Album not found.'});
        if(input.title!==undefined){const title=String(input.title||'').trim().slice(0,100);if(!title)return json(res,400,{error:'Album title cannot be empty.'});album.title=title;}
        if(input.description!==undefined)album.description=String(input.description||'').trim().slice(0,500);
        if(input.visibility!==undefined){if(!['public','friends','private'].includes(input.visibility))return json(res,400,{error:'Invalid album visibility.'});album.visibility=input.visibility;}
        if(input.coverAssetId!==undefined){
          const assetId=String(input.coverAssetId||'');
          if(assetId&&!((album.items||[]).some(item=>item.assetId===assetId)))return json(res,400,{error:'The album cover must be a photo in this album.'});
          album.coverAssetId=assetId||null;
        }
        album.updatedAt=now();await saveStore();return json(res,200,{album});
      }
      if(m&&method==='DELETE'){
        db.albums ||= [];const index=db.albums.findIndex(item=>item.id===m[1]&&item.ownerId===user.id);
        if(index<0)return json(res,404,{error:'Album not found.'});
        db.albums.splice(index,1);await saveStore();return json(res,200,{ok:true});
      }
      m=p.match(/^\/api\/albums\/([^/]+)\/photos$/);
      if(m&&method==='POST'){
        db.albums ||= [];const album=db.albums.find(item=>item.id===m[1]&&item.ownerId===user.id);
        if(!album)return json(res,404,{error:'Album not found.'});
        const ids=[...new Set((Array.isArray(input.mediaIds)?input.mediaIds:[]).map(String))];
        if(!ids.length)return json(res,400,{error:'Select at least one uploaded photo.'});
        if((album.items||[]).length+ids.length>100)return json(res,400,{error:'An album can contain up to 100 photos.'});
        const assets=ids.map(id=>(db.mediaAssets||[]).find(asset=>asset.id===id&&asset.ownerId===user.id&&asset.slot==='post'&&asset.status==='uploaded'&&asset.mediaType==='image'));
        if(assets.some(asset=>!asset))return json(res,400,{error:'One or more photos are unavailable. Upload them again.'});
        album.items ||= [];
        for(const asset of assets)if(!album.items.some(item=>item.assetId===asset.id))album.items.push({assetId:asset.id,caption:'',addedAt:now()});
        if(!album.coverAssetId&&album.items.length)album.coverAssetId=album.items[0].assetId;
        album.updatedAt=now();await saveStore();return json(res,201,{album});
      }
      m=p.match(/^\/api\/albums\/([^/]+)\/photos\/([^/]+)$/);
      if(m&&method==='DELETE'){
        db.albums ||= [];const album=db.albums.find(item=>item.id===m[1]&&item.ownerId===user.id);
        if(!album)return json(res,404,{error:'Album not found.'});
        album.items=(album.items||[]).filter(item=>item.assetId!==m[2]);
        if(album.coverAssetId===m[2])album.coverAssetId=album.items[0]?.assetId||null;
        album.updatedAt=now();await saveStore();return json(res,200,{album});
      }
      m=p.match(/^\/api\/users\/([^/]+)$/);
      if(method==='GET'&&m){
        const target=db.users.find(member=>member.id===m[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        db.profileViews ||= [];
        db.profileViewPresence ||= [];
        if(recordProfileView(db.profileViews,{targetUserId:target.id,viewerUserId:user.id,at:new Date()}))await saveStore();
        const profileInsights=target.id===user.id
          ?getProfileViewStats({views:db.profileViews,presence:db.profileViewPresence,targetUserId:target.id})
          :undefined;
        const profilePosts=await Promise.all(db.posts.filter(post=>post.status!=='hidden'&&post.userId===target.id&&!blockedBetween(user.id,post.userId)).map(post=>publicPost(post,user.id)));
        const viewerIsFriend=isFriend(user.id,target.id);
        const profileAlbums=await Promise.all((db.albums||[]).filter(album=>album.ownerId===target.id&&(user.id===target.id||album.visibility==='public'||(album.visibility==='friends'&&viewerIsFriend))).map(async album=>{
          const ordered=[...(album.items||[])].sort((a,b)=>new Date(a.addedAt||0)-new Date(b.addedAt||0));
          const photos=await Promise.all(ordered.map(async item=>{
            const asset=(db.mediaAssets||[]).find(candidate=>candidate.id===item.assetId&&candidate.ownerId===target.id&&candidate.slot==='post'&&candidate.status==='uploaded'&&candidate.mediaType==='image');
            if(!asset)return null;
            try{return {id:asset.id,url:await resolveAssetUrl(asset),mediaType:'image',mimeType:asset.mimeType,caption:item.caption||'',addedAt:item.addedAt};}catch{return null;}
          }));
          const visiblePhotos=photos.filter(photo=>photo?.url);
          return {id:album.id,title:album.title,description:album.description||'',visibility:album.visibility,coverAssetId:album.coverAssetId||null,createdAt:album.createdAt,updatedAt:album.updatedAt,photos:visiblePhotos};
        }));
        const profileMedia=profilePosts.flatMap(post=>(post.media||[]).map(media=>({...media,postId:post.id,postText:post.text||'',createdAt:post.createdAt}))).filter(media=>media.url);
        const profilePhotos=profileMedia.filter(media=>media.mediaType==='image');
        const profileVideos=profileMedia.filter(media=>media.mediaType==='video');
        const profileFriends=[...new Set((db.follows||[]).filter(edge=>edge.followedId===target.id&&(db.follows||[]).some(reverse=>reverse.followerId===target.id&&reverse.followedId===edge.followerId)).map(edge=>edge.followerId))]
          .map(id=>db.users.find(member=>member.id===id)).filter(member=>member&&!blockedBetween(user.id,member.id)&&canViewProfile(user.id,member)).map(member=>safeUser(member,user.id));

        return json(res,200,{
          user:safeUser(target,user.id),
          posts:profilePosts,
          albums:profileAlbums,
          photos:profilePhotos,
          reels:profileVideos,
          videos:profileVideos,
          friends:profileFriends,
          groups:(db.groups||[]).filter(group=>group.ownerId===target.id||(group.members||[]).includes(target.id)).map(group=>({id:group.id,name:group.name,description:group.description||'',memberCount:(group.members||[]).length,isMember:(group.members||[]).includes(target.id)})),
          friendship:isFriend(user.id,target.id)?'accepted':null,
          following:(db.follows||[]).some(f=>f.followerId===user.id&&f.followedId===target.id),
          followersCount:(db.follows||[]).filter(f=>f.followedId===target.id&&!blockedBetween(user.id,f.followerId)).length,
          followingCount:(db.follows||[]).filter(f=>f.followerId===target.id&&!blockedBetween(user.id,f.followedId)).length,
          friendsCount:[...new Set((db.follows||[]).filter(f=>f.followedId===target.id&&(db.follows||[]).some(reverse=>reverse.followerId===target.id&&reverse.followedId===f.followerId)).map(f=>f.followerId).filter(id=>!blockedBetween(user.id,id)))].length,
          ...(profileInsights?{profileInsights}:{})
        });
      }
      if(method==='PATCH'&&p==='/api/users/me'){
        const validation=validateProfilePatch(input);if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')});
        if(validation.value.username&&db.users.some(item=>item.id!==user.id&&normalizeUsername(item.username)===validation.value.username))return json(res,409,{error:'That username is already in use.'});
        const next={...user,...validation.value,
          aboutVisibility:{...DEFAULT_ABOUT_VISIBILITY,...(user.aboutVisibility||{}),...(validation.value.aboutVisibility||{})},
          aboutSections:{...(user.aboutSections||{}),...(validation.value.aboutSections||{})},
          aboutSectionVisibility:{...DEFAULT_ABOUT_SECTION_VISIBILITY,...(user.aboutSectionVisibility||{}),...(validation.value.aboutSectionVisibility||{})}
        };
        if(AUTH_PROVIDER==='supabase'){
          const currentSession=sessionFromRequest(req),auth=await sessionAuth(currentSession);
          if(!auth?.access_token)return json(res,401,{error:'Your secure session has expired. Log in again.'});
          const metadata={
            name:next.name,username:next.username,avatar_url:next.avatar||'',cover_url:next.cover||'',contact_phone:next.contactPhone||'',phone_number:next.contactPhone||'',
            bio:next.bio||'',location:next.location||'',country:next.country||'',county:next.county||'',parish:next.parish||'',city:next.city||'',
            gender:next.gender||'',relationship_status:next.relationshipStatus||'',about_visibility:next.aboutVisibility,
            about_sections:next.aboutSections,about_section_visibility:next.aboutSectionVisibility
          };
          await supabaseUpdateUserMetadata(auth.access_token,metadata);
          await supabaseUpdateProfile(auth.access_token,user.id,{
            username:next.username,display_name:next.name,bio:next.bio||'',location:next.location||'',
            avatar_url:next.avatar||'',cover_url:next.cover||'',
            contact_phone:next.contactPhone||'',country:next.country||'',county:next.county||'',parish:next.parish||'',city:next.city||'',
            gender:next.gender||'',relationship_status:next.relationshipStatus||'',about_visibility:next.aboutVisibility
          });
        }
        Object.assign(user,next);await saveStore();return json(res,200,{user:safeUser(user,user.id)});
      }
      m=p.match(/^\/api\/friends\/([^/]+)\/(request|accept|decline)$/);
      if(method==='POST'&&m)return json(res,409,{error:'Minglora friendships are automatic. Follow each other to become friends.'});
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
        const list=[...new Set(followed.filter(targetId=>(db.follows||[]).some(edge=>edge.followerId===targetId&&edge.followedId===user.id)&&!blockedBetween(user.id,targetId)))].map(targetId=>safeUser(db.users.find(u=>u.id===targetId),user.id)).filter(Boolean);
        return json(res,200,{friends:list,incoming:[]});
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
        const validation=validatePostInput({text:input.text,mediaIds:input.mediaIds,imageUrl:input.imageUrl});
        if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')});
        const ids=[...new Set(validation.value.mediaIds)],assets=ids.map(id=>(db.mediaAssets||[]).find(asset=>asset.id===id&&asset.ownerId===user.id&&asset.slot==='group'&&asset.status==='uploaded'));
        if(assets.some(asset=>!asset))return json(res,400,{error:'One or more selected group media files are unavailable.'});
        const post={id:uid(),groupId:group.id,userId:user.id,text:validation.value.text,mediaIds:ids,createdAt:now(),updatedAt:now()};
        assets.forEach(asset=>{asset.status='attached';asset.attachedTo=post.id;});
        db.groupPosts.push(post);await saveStore();return json(res,201,{post:await publicGroupPost(post)});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/posts\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});
        const post=(db.groupPosts||[]).find(x=>x.groupId===group.id&&x.id===m[2]);
        if(!post)return json(res,404,{error:'Group post not found.'});
        if(!canDeleteGroupPost(group,post,user.id))return json(res,403,{error:'Only the post author or group owner can delete this post.'});
        db.groupPosts=db.groupPosts.filter(x=>x.id!==post.id);(post.mediaIds||[]).forEach(id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id);if(asset){asset.status='deleted';asset.deletedAt=now();}});await saveStore();return json(res,200,{ok:true,id:post.id});
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
        const posts=await Promise.all((db.groupPosts||[]).filter(post=>post.groupId===group.id&&post.status!=='hidden').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(post=>publicGroupPost(post)));
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
        const ids=[...new Set(validation.value.mediaIds)],assets=ids.map(id=>(db.mediaAssets||[]).find(asset=>asset.id===id&&asset.ownerId===user.id&&asset.slot==='page'&&asset.status==='uploaded'));
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
        db.pagePosts.filter(post=>post.pageId===page.id).forEach(post=>(post.mediaIds||[]).forEach(id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id);if(asset){asset.status='deleted';asset.deletedAt=now();}}));
        db.pageRoles=db.pageRoles.filter(role=>role.pageId!==page.id);
        db.pageFollows=db.pageFollows.filter(f=>f.pageId!==page.id);
        db.pagePosts=db.pagePosts.filter(post=>post.pageId!==page.id);
        await saveStore();return json(res,200,{ok:true,id:page.id});
      }
      if(method==='GET'&&p==='/api/meetwave/status'){
        requireAuth(user);
        const health=await verifyLiveKitConnection();
        return json(res,200,{enabled:true,provider:'LiveKit',configured:health.configured,connected:health.connected,error:health.error||null,maxParticipants:8});
      }
      if(method==='GET'&&p==='/api/meetwave/rooms'){
        requireAuth(user);
        const accessibleRooms=(db.meetWaveRooms||[])
          .filter(room=>room.status!=='ended'&&canUserAccessMeetWaveRoom(room,user.id))
          .sort((a,b)=>new Date(a.scheduledAt||a.createdAt)-new Date(b.scheduledAt||b.createdAt))
          .slice(0,30);
        const rooms=await Promise.all(accessibleRooms.map(async room=>{
          const view=meetWaveRoomView(room,user.id);
          if(room.status!=='active')return {...view,participantCount:0,participantCountVerified:true};
          if(!isLiveKitConfigured())return {...view,participantCount:null,participantCountVerified:false};
          try{
            const participants=await listLiveKitParticipants(room.roomName);
            return {...view,participantCount:participants.length,participantCountVerified:true};
          }catch{
            return {...view,participantCount:null,participantCountVerified:false};
          }
        }));
        return json(res,200,{rooms});
      }
      if(method==='POST'&&p==='/api/meetwave/rooms'){
        requireAuth(user);
        const providerHealth=await verifyLiveKitConnection();
        if(!providerHealth.connected)return json(res,503,{error:providerHealth.configured?'Minglora could not reach LiveKit. MeetWave rooms cannot be created until the media service is connected.':'MeetWave needs the Minglora LiveKit service to be configured before rooms can be created.'});
        const validation=validateMeetWaveRoomInput(input);
        if(!validation.valid)return json(res,400,{error:validation.error});
        db.meetWaveRooms||=[];
        if(validation.value.mode==='personal'){
          const existing=db.meetWaveRooms.find(room=>room.ownerId===user.id&&room.mode==='personal'&&room.status!=='ended');
          if(existing)return json(res,200,{room:meetWaveRoomView(existing,user.id),reused:true});
        }
        let id;
        do{id='MW-'+crypto.randomBytes(4).toString('hex').toUpperCase();}
        while(db.meetWaveRooms.some(room=>room.id===id));
        const room={
          id,roomName:'minglora-meetwave-'+id.toLowerCase().replace(/[^a-z0-9]/g,''),
          ownerId:user.id,title:validation.value.title,description:validation.value.description,
          mode:validation.value.mode,visibility:validation.value.visibility,
          scheduledAt:validation.value.scheduledAt,status:validation.value.mode==='scheduled'?'scheduled':'ready',
          participantLimit:8,createdAt:now(),startedAt:null,endedAt:null
        };
        db.meetWaveRooms.unshift(room);
        await saveStore();
        return json(res,201,{room:meetWaveRoomView(room,user.id),reused:false});
      }
      if(method==='GET'&&p==='/api/meetwave/invitations'){
        requireAuth(user);
        const invitations=(db.meetWaveInvitations||[])
          .filter(item=>item.userId===user.id&&item.status==='pending')
          .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
          .map(item=>({id:item.id,status:item.status,createdAt:item.createdAt,room:meetWaveRoomView((db.meetWaveRooms||[]).find(room=>room.id===item.roomId),user.id)}))
          .filter(item=>item.room);
        return json(res,200,{invitations});
      }
      let meetWaveInvitationMatch=p.match(/^\/api\/meetwave\/invitations\/([^/]+)\/(accept|decline)$/);
      if(meetWaveInvitationMatch&&method==='POST'){
        requireAuth(user);
        const invitation=(db.meetWaveInvitations||[]).find(item=>item.id===meetWaveInvitationMatch[1]&&item.userId===user.id);
        if(!invitation||invitation.status!=='pending')return json(res,404,{error:'This MeetWave invitation is no longer pending.'});
        const room=(db.meetWaveRooms||[]).find(item=>item.id===invitation.roomId);
        if(!room||room.status==='ended')return json(res,410,{error:'This meeting room has ended.'});
        invitation.status=meetWaveInvitationMatch[2]==='accept'?'accepted':'declined';
        invitation.respondedAt=now();
        await saveStore();
        return json(res,200,{invitation:{id:invitation.id,status:invitation.status},room:meetWaveRoomView(room,user.id)});
      }
      let meetWaveRoomMatch=p.match(/^\/api\/meetwave\/rooms\/([^/]+)(?:\/(join|leave|messages|invitations))?$/);
      if(meetWaveRoomMatch){
        requireAuth(user);
        const room=(db.meetWaveRooms||[]).find(item=>item.id===meetWaveRoomMatch[1]);
        const action=meetWaveRoomMatch[2]||'';
        if(!room)return json(res,404,{error:'MeetWave room not found.'});
        if(room.status==='ended')return json(res,410,{error:'This MeetWave meeting has ended.'});
        if(blockedBetween(user.id,room.ownerId)&&room.ownerId!==user.id)return json(res,403,{error:'This meeting room is unavailable.'});
        if(!canUserAccessMeetWaveRoom(room,user.id))return json(res,403,{error:'You do not have access to this MeetWave room.'});
        if(method==='GET'&&!action){
          let participants=[];
          if(room.status==='active'){
            if(!isLiveKitConfigured())return json(res,503,{error:'Minglora cannot verify this active meeting while LiveKit is unavailable.'});
            try{participants=await listLiveKitParticipants(room.roomName);}
            catch(error){return json(res,503,{error:'Minglora could not verify the live participant list for this room.'});}
          }
          return json(res,200,{room:meetWaveRoomView(room,user.id),participants,participantCount:participants.length,participantCountVerified:true});
        }
        if(method==='POST'&&action==='join'){
          if(!isLiveKitConfigured())return json(res,503,{error:'MeetWave cannot connect because Minglora LiveKit is not configured.'});
          const availability=meetWaveRoomJoinAvailability(room);
          if(availability==='ended')return json(res,410,{error:'This meeting has ended.'});
          if(availability==='too-early')return json(res,409,{error:'This scheduled meeting is not open yet. Participants can join 15 minutes before its start time.'});
          let participants=[],liveKit;
          try{
            await ensureLiveKitRoom(room.roomName,room.participantLimit||8);
            participants=await listLiveKitParticipants(room.roomName);
            if(participants.length>=(room.participantLimit||8)&&!participants.some(participant=>participant.identity===user.id)){
              return json(res,409,{error:'This MeetWave room is full. The current limit is eight participants.'});
            }
            liveKit=await createLiveKitToken({identity:user.id,name:user.name,roomName:room.roomName,canPublish:true});
          }catch(error){
            console.warn('[MeetWave] LiveKit join preparation failed.',{roomId:room.id,status:Number(error?.statusCode||error?.status||0)});
            return json(res,503,{error:'Minglora could not prepare the LiveKit meeting connection. Check the media service and try again.'});
          }
          db.meetWaveAttendance||=[];
          let attendance=db.meetWaveAttendance.find(item=>item.roomId===room.id&&item.userId===user.id);
          if(!attendance){attendance={id:uid(),roomId:room.id,userId:user.id,role:room.ownerId===user.id?'host':'participant',status:'joined',joinedAt:now(),leftAt:null};db.meetWaveAttendance.push(attendance);}
          else{attendance.role=room.ownerId===user.id?'host':'participant';attendance.status='joined';attendance.joinedAt=now();attendance.leftAt=null;}
          room.status='active';room.startedAt=room.startedAt||now();room.lastActivityAt=now();
          await saveStore();
          return json(res,200,{room:meetWaveRoomView(room,user.id),role:attendance.role,liveKit:{...liveKit,role:attendance.role}});
        }
        if(method==='POST'&&action==='leave'){
          const attendance=(db.meetWaveAttendance||[]).find(item=>item.roomId===room.id&&item.userId===user.id&&!item.leftAt);
          if(!attendance)return json(res,200,{left:true});
          attendance.status='left';attendance.leftAt=now();await saveStore();
          return json(res,200,{left:true});
        }
        if(method==='POST'&&action==='invitations'){
          if(room.ownerId!==user.id)return json(res,403,{error:'Only the room host can invite members.'});
          const requestedIds=Array.isArray(input.userIds)?input.userIds.map(String):[];
          const requestedUsernames=Array.isArray(input.usernames)?input.usernames.map(value=>normalizeUsername(String(value||''))).filter(Boolean):[];
          const invitees=[...new Map([
            ...requestedIds.map(id=>db.users.find(member=>member.id===id)).filter(Boolean),
            ...requestedUsernames.map(username=>db.users.find(member=>normalizeUsername(member.username)===username)).filter(Boolean)
          ].map(member=>[member.id,member])).values()];
          if(!invitees.length||invitees.length>20)return json(res,400,{error:'Choose between one and twenty existing Minglora members to invite.'});
          if(invitees.some(member=>member.id===user.id||blockedBetween(user.id,member.id)))return json(res,400,{error:'One or more invited members are unavailable.'});
          db.meetWaveInvitations||=[];
          const sent=[];
          for(const member of invitees){
            const memberSettings=getUserSettings(member);
            if(!canReceiveMeetWaveInvitation(memberSettings,{isFriend:isFriend(user.id,member.id)}))continue;
            let invitation=db.meetWaveInvitations.find(item=>item.roomId===room.id&&item.userId===member.id);
            if(invitation&&invitation.status==='accepted')continue;
            if(!invitation){invitation={id:uid(),roomId:room.id,userId:member.id,invitedBy:user.id,status:'pending',createdAt:now(),respondedAt:null};db.meetWaveInvitations.push(invitation);}
            else{invitation.status='pending';invitation.invitedBy=user.id;invitation.createdAt=now();invitation.respondedAt=null;}
            notify(member.id,user.id,'meetwave_invite',user.name+' invited you to a MeetWave room.',{roomId:room.id,roomTitle:room.title,invitationId:invitation.id});
            sent.push({userId:member.id,username:member.username});
          }
          await saveStore();
          return json(res,200,{sent,skipped:invitees.length-sent.length});
        }
        if((method==='GET'||method==='POST')&&action==='messages'){
          const attendance=(db.meetWaveAttendance||[]).find(item=>item.roomId===room.id&&item.userId===user.id&&item.status==='joined'&&!item.leftAt);
          if(room.ownerId!==user.id&&!attendance)return json(res,403,{error:'Join this meeting before accessing its chat.'});
          if(method==='GET'){
            const after=Date.parse(url.searchParams.get('after')||'');
            const messages=(db.meetWaveMessages||[])
              .filter(message=>message.roomId===room.id&&(!Number.isFinite(after)||new Date(message.createdAt).getTime()>after))
              .sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).slice(-100)
              .map(message=>({...message,author:safeUser(db.users.find(member=>member.id===message.userId),user.id)}));
            return json(res,200,{messages});
          }
          const textValue=normalizeMeetWaveMessage(input.text);
          if(!textValue)return json(res,400,{error:'Enter a chat message of up to 1,000 characters.'});
          db.meetWaveMessages||=[];
          const message={id:uid(),roomId:room.id,userId:user.id,text:textValue,createdAt:now()};
          db.meetWaveMessages.push(message);room.lastActivityAt=message.createdAt;
          await saveStore();
          return json(res,201,{message:{...message,author:safeUser(user,user.id)}});
        }
        if(method==='DELETE'&&!action){
          if(room.ownerId!==user.id)return json(res,403,{error:'Only the host can end this meeting for everyone.'});
          if(room.status==='ended')return json(res,200,{ended:true});
          room.status='ended';room.endedAt=now();
          (db.meetWaveAttendance||[]).filter(item=>item.roomId===room.id&&!item.leftAt).forEach(item=>{item.status='left';item.leftAt=room.endedAt;});
          await saveStore();
          try{await deleteLiveKitRoom(room.roomName);}catch(error){const status=Number(error?.statusCode||error?.status||0);if(status!==404)console.warn('[MeetWave] LiveKit room cleanup failed.',{roomId:room.id,status});}
          return json(res,200,{ended:true,room:meetWaveRoomView(room,user.id)});
        }
      }
      if(method==='GET'&&p==='/api/calls/ringtone'){
        const asset=(db.mediaAssets||[]).find(item=>item.id===user.callRingtoneAssetId&&item.ownerId===user.id&&item.slot==='ringtone'&&item.status==='attached');
        if(!asset)return json(res,200,{ringtone:null});
        const url=await resolveAssetUrl(asset);
        return json(res,200,{ringtone:{assetId:asset.id,name:asset.originalName||'Custom ringtone',mimeType:asset.mimeType,url}});
      }
      if(method==='POST'&&p==='/api/calls/ringtone'){
        const asset=(db.mediaAssets||[]).find(item=>item.id===String(input.assetId||'')&&item.ownerId===user.id&&item.slot==='ringtone'&&item.bucket==='minglora-ringtones'&&item.status==='uploaded');
        if(!asset)return json(res,404,{error:'The uploaded ringtone could not be found.'});
        const validation=validateCallRingtoneUpload({mimeType:asset.mimeType,byteSize:asset.byteSize});
        if(!validation.valid)return json(res,400,{error:validation.error});
        const previous=(db.mediaAssets||[]).find(item=>item.id===user.callRingtoneAssetId&&item.ownerId===user.id&&item.slot==='ringtone'&&item.status==='attached');
        if(previous){previous.status='deleted';previous.deletedAt=now();}
        asset.status='attached';asset.attachedTo='account:call-ringtone';asset.completedAt=asset.completedAt||now();
        user.callRingtoneAssetId=asset.id;
        await saveStore();
        if(previous)void mediaGateway('media_delete',{ownerId:user.id,bucket:previous.bucket,path:previous.path}).catch(error=>console.warn('[Minglora ringtone] Previous ringtone cleanup failed.',{message:error.message}));
        const url=await resolveAssetUrl(asset);
        return json(res,200,{ringtone:{assetId:asset.id,name:asset.originalName||'Custom ringtone',mimeType:asset.mimeType,url}});
      }
      if(method==='DELETE'&&p==='/api/calls/ringtone'){
        const previous=(db.mediaAssets||[]).find(item=>item.id===user.callRingtoneAssetId&&item.ownerId===user.id&&item.slot==='ringtone'&&item.status==='attached');
        user.callRingtoneAssetId=null;
        if(previous){previous.status='deleted';previous.deletedAt=now();}
        await saveStore();
        if(previous)await mediaGateway('media_delete',{ownerId:user.id,bucket:previous.bucket,path:previous.path}).catch(error=>console.warn('[Minglora ringtone] Ringtone cleanup failed.',{message:error.message}));
        return json(res,200,{ok:true,ringtone:null});
      }
      if(method==='GET'&&p==='/api/calls/incoming'){
        let changed=false;const stamp=now(),expiredCalls=[];
        for(const call of (db.calls||[]))if(call.status==='ringing'&&expireRingingCall(call,db.callParticipants||[],stamp)){changed=true;expiredCalls.push(call);}
        if(changed)await saveStore();
        await Promise.all(expiredCalls.map(call=>cleanupCallRoom(call,'ring-timeout')));
        const incoming=(db.calls||[]).filter(call=>['ringing','active'].includes(call.status)&&!blockedBetween(user.id,call.createdBy))
          .map(call=>{
            const participant=(db.callParticipants||[]).find(item=>item.callId===call.id&&item.userId===user.id);
            if(!participant||participant.status!=='invited')return null;
            return {id:call.id,kind:call.kind,status:call.status,createdAt:call.createdAt,ringExpiresAt:call.ringExpiresAt,caller:safeUser(db.users.find(member=>member.id===call.createdBy))};
          }).filter(Boolean);
        return json(res,200,{calls:incoming});
      }
      const callStatusMatch=p.match(/^\/api\/calls\/([^/]+)\/status$/);
      if(method==='GET'&&callStatusMatch){
        const call=(db.calls||[]).find(item=>item.id===callStatusMatch[1]);
        const participant=(db.callParticipants||[]).find(item=>item.callId===callStatusMatch[1]&&item.userId===user.id);
        if(!call)return json(res,404,{error:'Call not found.'});
        if(!participant)return json(res,403,{error:'You are not a participant in this call.'});
        if(call.status==='ringing'&&expireRingingCall(call,db.callParticipants||[],now())){await saveStore();await cleanupCallRoom(call,'ring-timeout');}
        return json(res,200,{call:{id:call.id,status:call.status,createdBy:call.createdBy,kind:call.kind,answeredAt:call.answeredAt,endedAt:call.endedAt},participantStatus:participant.status});
      }
      if(method==='POST'&&p==='/api/calls'){
        if(!isLiveKitConfigured())return json(res,503,{error:'Voice and video calls require the Minglora LiveKit service to be configured.'});
        const recipientIds=[...new Set([String(input.to||''),...(Array.isArray(input.participantIds)?input.participantIds.map(String):[])].filter(Boolean))];
        const kind=String(input.kind||'video');
        if(!['audio','video'].includes(kind)||!recipientIds.length||recipientIds.length>CALL_MAX_PARTICIPANTS-1)return json(res,400,{error:'Choose audio or video and invite between one and seven other members.'});
        const recipients=recipientIds.map(id=>db.users.find(member=>member.id===id));
        if(recipients.some(member=>!member||member.id===user.id||blockedBetween(user.id,member.id)))return json(res,400,{error:'One or more call participants are unavailable.'});
        if(recipients.some(member=>getUserSettings(member).privacy.messageAudience==='nobody'||(getUserSettings(member).privacy.messageAudience==='friends'&&!isFriend(user.id,member.id))))return json(res,403,{error:'One or more members only accept calls from friends.'});
        const stamp=now(),expiredCalls=[];
        for(const existing of (db.calls||[]))if(existing.status==='ringing'&&expireRingingCall(existing,db.callParticipants||[],stamp))expiredCalls.push(existing);
        if(expiredCalls.length){await saveStore();await Promise.all(expiredCalls.map(call=>cleanupCallRoom(call,'ring-timeout')));}
        const busyIds=new Set((db.callParticipants||[]).filter(item=>isCallParticipantBusy((db.calls||[]).find(call=>call.id===item.callId),item)).map(item=>item.userId));
        if(busyIds.has(user.id))return json(res,409,{error:'Finish your current Minglora call before starting another.'});
        if(recipients.some(member=>busyIds.has(member.id)))return json(res,409,{error:'One or more members are already in another call.'});
        const id=uid(),roomName='minglora-call-'+id.replace(/-/g,'');
        try{await ensureLiveKitRoom(roomName,CALL_MAX_PARTICIPANTS);}
        catch(error){
          console.warn('[Minglora calls] Could not provision LiveKit room.',{status:Number(error?.statusCode||error?.status||0)});
          return json(res,503,{error:'Minglora could not prepare the call room. Check the LiveKit connection and try again.'});
        }
        const createdAt=now();
        const call={id,roomName,createdBy:user.id,kind,status:'ringing',createdAt,ringExpiresAt:new Date(Date.now()+CALL_RING_TIMEOUT_MS).toISOString(),answeredAt:null,endedAt:null};
        db.calls||=[];db.callParticipants||=[];db.calls.unshift(call);
        db.callParticipants.push({id:uid(),callId:id,userId:user.id,role:'host',status:'calling',joinedAt:null,leftAt:null});
        for(const recipient of recipients){
          db.callParticipants.push({id:uid(),callId:id,userId:recipient.id,role:'participant',status:'invited',joinedAt:null,leftAt:null});
          notify(recipient.id,user.id,'call',user.name+' is calling you ('+kind+').',{callId:id,callKind:kind});
        }
        try{await saveStore();}
        catch(error){
          db.calls=db.calls.filter(item=>item.id!==id);
          db.callParticipants=db.callParticipants.filter(item=>item.callId!==id);
          await cleanupCallRoom(call,'create-persistence-failed');
          throw error;
        }
        return json(res,201,{call});
      }
      let callMatch=p.match(/^\/api\/calls\/([^/]+)\/(join|invite|leave|end|decline|cancel)$/);
      if(callMatch&&method==='POST'){
        if(!isLiveKitConfigured())return json(res,503,{error:'Voice and video calls require the Minglora LiveKit service to be configured.'});
        const call=db.calls.find(item=>item.id===callMatch[1]);
        const participant=(db.callParticipants||[]).find(item=>item.callId===callMatch[1]&&item.userId===user.id);
        const action=callMatch[2];
        if(!call)return json(res,404,{error:'Call not found.'});
        if(action==='join'){
          if(call.status==='ringing'&&expireRingingCall(call,db.callParticipants||[],now())){await saveStore();await cleanupCallRoom(call,'ring-timeout');}
          if(['ended','cancelled','declined','missed'].includes(call.status)||!participant||['declined','left','missed','cancelled'].includes(participant.status))return json(res,404,{error:'This call invitation is no longer active.'});
          if(blockedBetween(user.id,call.createdBy))return json(res,403,{error:'This call is unavailable.'});
          if(participant.status==='calling'&&call.status==='ringing')return json(res,409,{error:'Waiting for the other member to answer.'});
          if(!['ringing','active'].includes(call.status))return json(res,409,{error:'This call is no longer ringing.'});
          let liveKit;
          try{
            await ensureLiveKitRoom(call.roomName,CALL_MAX_PARTICIPANTS);
            liveKit=await createLiveKitToken({identity:user.id,name:user.name,roomName:call.roomName,canPublish:true});
          }catch(error){
            console.warn('[Minglora calls] Could not prepare participant connection.',{callId:call.id,status:Number(error?.statusCode||error?.status||0)});
            return json(res,503,{error:'Minglora could not prepare your call connection. Check LiveKit and try again.'});
          }
          if(participant.status==='invited'&&call.status==='ringing'){call.status='active';call.answeredAt=now();call.answeredById=user.id;}
          participant.status='joined';participant.joinedAt=participant.joinedAt||now();participant.leftAt=null;
          await saveStore();return json(res,200,{call,liveKit:{...liveKit,role:participant.role}});
        }
        if(!participant)return json(res,403,{error:'You are not a participant in this call.'});
        if(action==='decline'){
          if(user.id===call.createdBy||participant.status!=='invited')return json(res,403,{error:'Only an invited recipient can decline this call.'});
          if(!['ringing','active'].includes(call.status))return json(res,409,{error:'This call is no longer available.'});
          participant.status='declined';participant.leftAt=now();
          const stillInvited=(db.callParticipants||[]).some(item=>item.callId===call.id&&item.status==='invited');
          const endedNow=!stillInvited&&call.status==='ringing';
          if(endedNow){call.status='declined';call.endedAt=now();}
          await saveStore();if(endedNow)await cleanupCallRoom(call,'declined');return json(res,200,{ok:true,call});
        }
        if(action==='cancel'){
          if(user.id!==call.createdBy)return json(res,403,{error:'Only the caller can cancel this call.'});
          if(['ended','cancelled','declined','missed'].includes(call.status))return json(res,200,{ok:true,call});
          call.status='cancelled';call.endedAt=now();
          (db.callParticipants||[]).filter(item=>item.callId===call.id&&item.status==='invited').forEach(item=>{item.status='cancelled';item.leftAt=call.endedAt;});
          await saveStore();await cleanupCallRoom(call,'cancelled');return json(res,200,{ok:true,call});
        }
        if(action==='invite'){
          if(['ended','cancelled','declined','missed'].includes(call.status)||participant.status!=='joined')return json(res,409,{error:'Join the call before inviting more people.'});
          const invitedIds=[...new Set((Array.isArray(input.userIds)?input.userIds:[]).map(String).filter(Boolean))];
          if(!invitedIds.length||invitedIds.length>6)return json(res,400,{error:'Choose between one and six additional participants.'});
          const current=countCallParticipants(db.callParticipants||[],call.id);
          const alreadyParticipating=new Set((db.callParticipants||[]).filter(item=>item.callId===call.id&&isCallParticipantBusy(call,item)).map(item=>item.userId));
          const newInviteIds=invitedIds.filter(id=>!alreadyParticipating.has(id));
          if(current+newInviteIds.length>CALL_MAX_PARTICIPANTS)return json(res,409,{error:'Minglora group calls support up to eight participants.'});
          const invited=newInviteIds.map(id=>db.users.find(member=>member.id===id));
          if(invited.some(member=>!member||member.id===user.id||blockedBetween(user.id,member.id)))return json(res,400,{error:'One or more invited members are unavailable.'});
          const newlyInvited=[];
          for(const member of invited){
            if((db.callParticipants||[]).some(item=>item.callId===call.id&&item.userId===member.id&&!['declined','left','missed','cancelled'].includes(item.status)))continue;
            if(getUserSettings(member).privacy.messageAudience==='nobody'||(getUserSettings(member).privacy.messageAudience==='friends'&&!isFriend(user.id,member.id)))continue;
            db.callParticipants.push({id:uid(),callId:call.id,userId:member.id,role:'participant',status:'invited',joinedAt:null,leftAt:null});
            notify(member.id,user.id,'call',user.name+' invited you to a Minglora group call.',{callId:call.id,callKind:call.kind});
            newlyInvited.push(safeUser(member));
          }
          await saveStore();return json(res,200,{invited:newlyInvited,count:newlyInvited.length});
        }
        if(action==='leave'){
          participant.status='left';participant.leftAt=now();
          const joined=(db.callParticipants||[]).filter(item=>item.callId===call.id&&item.status==='joined');
          const stillInvited=(db.callParticipants||[]).some(item=>item.callId===call.id&&item.status==='invited');
          const endedNow=user.id===call.createdBy||(joined.length===0&&!stillInvited);
          if(endedNow){
            call.status='ended';call.endedAt=now();
            (db.callParticipants||[]).filter(item=>item.callId===call.id&&['invited','calling'].includes(item.status)).forEach(item=>{item.status='cancelled';item.leftAt=call.endedAt;});
          }
          await saveStore();if(endedNow)await cleanupCallRoom(call,'last-participant-left');return json(res,200,{ok:true,call});
        }
        if(action==='end'){
          if(user.id!==call.createdBy)return json(res,403,{error:'Only the call creator can end this call for everyone.'});
          call.status='ended';call.endedAt=now();
          (db.callParticipants||[]).filter(item=>item.callId===call.id&&item.status!=='left').forEach(item=>{item.status='left';item.leftAt=call.endedAt;});
          await saveStore();await cleanupCallRoom(call,'ended-by-host');return json(res,200,{ok:true,call});
        }
      }
      if(method==='GET'&&p==='/api/messages/gifs'){
        const apiKey=String(process.env.TENOR_API_KEY||'').trim();
        if(!apiKey)return json(res,503,{error:'GIF search is not configured yet. Add TENOR_API_KEY to Minglora’s private server environment.'});
        const query=String(url.searchParams.get('q')||'').trim().slice(0,80);
        if(!query)return json(res,400,{error:'Enter a word or phrase to search for GIFs.'});
        const target=new URL('https://tenor.googleapis.com/v2/search');
        target.searchParams.set('key',apiKey);target.searchParams.set('q',query);
        target.searchParams.set('client_key','minglora');target.searchParams.set('limit','20');
        target.searchParams.set('media_filter','gif,tinygif');target.searchParams.set('contentfilter','high');
        let response;
        try{response=await fetch(target,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});}
        catch{return json(res,503,{error:'Minglora could not reach GIF search. Try again shortly.'});}
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)return json(res,502,{error:'GIF search rejected its server credential. Check TENOR_API_KEY in Minglora’s private environment.'});
        const gifs=(Array.isArray(payload.results)?payload.results:[]).map(item=>{
          const formats=item.media_formats||{},gifUrl=safeTenorGifUrl(formats.gif?.url||formats.mediumgif?.url);
          const previewUrl=safeTenorGifUrl(formats.tinygif?.url||formats.gif?.url);
          return gifUrl?{id:String(item.id||''),title:String(item.content_description||item.title||'GIF').slice(0,100),url:gifUrl,previewUrl:previewUrl||gifUrl}:null;
        }).filter(Boolean);
        return json(res,200,{gifs});
      }
      if(method==='GET'&&p==='/api/messages'){
        const peers=[...new Set(db.messages.filter(item=>item.from===user.id||item.to===user.id).map(item=>item.from===user.id?item.to:item.from))].filter(id=>!blockedBetween(user.id,id));
        const conversations=await Promise.all(peers.map(async id=>{
          const hide=(db.messageConversationHides||[]).find(item=>item.userId===user.id&&item.peerId===id);
          const visibleMessages=db.messages.filter(item=>
            ((item.from===user.id&&item.to===id)||(item.from===id&&item.to===user.id)) &&
            !(Array.isArray(item.deletedFor)&&item.deletedFor.includes(user.id)) &&
            (!hide||new Date(item.createdAt)>new Date(hide.hiddenAt))
          ).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
          if(!visibleMessages.length)return null;
          const messages=await Promise.all(visibleMessages.map(async item=>{
            const attachments=await Promise.all((item.attachmentIds||[]).map(async assetId=>{
              const asset=(db.mediaAssets||[]).find(entry=>entry.id===assetId&&entry.status==='attached'&&entry.slot==='message');
              if(!asset)return null;
              try{return {id:asset.id,name:asset.originalName||asset.fileName||'Attachment',mimeType:asset.mimeType,mediaType:asset.mediaType,byteSize:asset.byteSize,url:await resolveAssetUrl(asset)};}catch{return null;}
            }));
            return {...item,attachments:attachments.filter(Boolean),author:safeUser(db.users.find(member=>member.id===item.from))};
          }));
          const unreadCount=visibleMessages.filter(item=>item.from===id&&item.to===user.id&&item.read!==true).length;
          return {user:safeUser(db.users.find(member=>member.id===id),user.id),messages,unreadCount};
        }));
        return json(res,200,{conversations:conversations.filter(Boolean)});
      }
      const messageActionMatch=p.match(/^\/api\/messages\/([^/]+)$/);
      if(method==='DELETE'&&messageActionMatch){
        let target;
        try{target=decodeURIComponent(messageActionMatch[1]);}catch{return json(res,400,{error:'The message or conversation identifier is invalid.'});}
        if(!target)return json(res,400,{error:'The message or conversation identifier is invalid.'});
        const message=db.messages.find(item=>item.id===target&&(item.from===user.id||item.to===user.id));
        if(message){
          const scope=String(input.scope||'me');
          if(scope==='everyone'){
            if(message.from!==user.id)return json(res,403,{error:'Only the sender can unsend a message for everyone.'});
            if(message.unsent)return json(res,200,{ok:true,unsent:true});
            const attachmentIds=[...(message.attachmentIds||[])];
            const attachmentAssets=attachmentIds.map(assetId=>(db.mediaAssets||[]).find(item=>item.id===assetId&&item.ownerId===user.id&&item.slot==='message'&&item.attachedTo==='message:'+message.id)).filter(Boolean);
            message.unsent=true;
            message.text='';
            message.stickerId=null;
            message.gifUrl=null;
            message.attachmentIds=[];
            message.unsentAt=now();
            for(const assetId of attachmentIds){
              const asset=attachmentAssets.find(item=>item.id===assetId);
              if(asset){asset.status='deleted';asset.deletedAt=now();}
            }
            await saveStore();
            await Promise.allSettled(attachmentAssets.map(asset=>mediaGateway('media_delete',{ownerId:user.id,bucket:asset.bucket,path:asset.path})));
            return json(res,200,{ok:true,unsent:true});
          }
          if(scope!=='me')return json(res,400,{error:'Choose delete for me or unsend for everyone.'});
          const deletedFor=new Set(Array.isArray(message.deletedFor)?message.deletedFor:[]);
          deletedFor.add(user.id);
          message.deletedFor=[...deletedFor];
          await saveStore();
          return json(res,200,{ok:true,deletedForMe:true});
        }
        const peerId=target;
        const peer=db.users.find(member=>member.id===peerId);
        const hasConversation=peer&&db.messages.some(item=>(item.from===user.id&&item.to===peerId)||(item.from===peerId&&item.to===user.id));
        if(!peer||peerId===user.id||blockedBetween(user.id,peerId)||!hasConversation)return json(res,404,{error:'Conversation not found.'});
        const latest=db.messages.filter(item=>(item.from===user.id&&item.to===peerId)||(item.from===peerId&&item.to===user.id)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
        const hideAt=new Date(Date.now()-1).toISOString();
        let hide=(db.messageConversationHides||[]).find(item=>item.userId===user.id&&item.peerId===peerId);
        if(!hide){hide={userId:user.id,peerId,hiddenAt:hideAt};db.messageConversationHides.push(hide);}
        else hide.hiddenAt=hideAt;
        await saveStore();
        return json(res,200,{ok:true,removed:true,hiddenBefore:latest?.createdAt||null});
      }
      if(method==='PATCH'&&messageActionMatch){
        let messageId;
        try{messageId=decodeURIComponent(messageActionMatch[1]);}catch{return json(res,400,{error:'The message identifier is invalid.'});}
        const message=db.messages.find(item=>item.id===messageId);
        if(!message||(message.from!==user.id&&message.to!==user.id))return json(res,404,{error:'Message not found.'});
        if(message.from!==user.id)return json(res,403,{error:'Only the sender can edit this message.'});
        if(message.unsent||message.stickerId||message.gifUrl)return json(res,409,{error:'This type of message cannot be edited.'});
        const text=String(input.text||'').trim();
        if(!text||text.length>3000)return json(res,400,{error:'Edited messages must contain 1–3000 characters.'});
        message.text=text;
        message.editedAt=now();
        await saveStore();
        return json(res,200,{ok:true,message:{id:message.id,text:message.text,editedAt:message.editedAt}});
      }
      const messageReadMatch=p.match(/^\/api\/messages\/([^/]+)\/read$/);
      if(method==='POST'&&messageReadMatch){
        let peerId;
        try{peerId=decodeURIComponent(messageReadMatch[1]);}
        catch{return json(res,400,{error:'The conversation member identifier is invalid.'});}
        if(!peerId||peerId===user.id)return json(res,400,{error:'Choose another member to mark this conversation as read.'});
        const peer=db.users.find(member=>member.id===peerId);
        const hasConversation=db.messages.some(item=>(item.from===user.id&&item.to===peerId)||(item.from===peerId&&item.to===user.id));
        if(!peer||blockedBetween(user.id,peerId)||!hasConversation)return json(res,404,{error:'Conversation not found.'});
        const readAt=now();
        let updated=0;
        for(const message of db.messages){
          if(message.from===peerId&&message.to===user.id&&message.read!==true){
            message.read=true;
            message.readAt=readAt;
            updated++;
          }
        }
        if(updated)await saveStore();
        return json(res,200,{ok:true,updated,readAt:updated?readAt:null});
      }
      if(method==='POST'&&p==='/api/messages'){
        const to=String(input.to||''),text=String(input.text||'').trim(),recipient=db.users.find(member=>member.id===to);
        const attachmentIds=[...new Set((Array.isArray(input.attachmentIds)?input.attachmentIds:[]).map(value=>String(value||'')))];
        const stickerId=String(input.stickerId||'').trim().toLowerCase(),stickerEmoji=stickerId?MESSAGE_STICKERS[stickerId]||'':'';
        const gifUrl=input.gifUrl?safeTenorGifUrl(input.gifUrl):null;
        if(input.stickerId&&!stickerEmoji)return json(res,400,{error:'That Minglora sticker is not available.'});
        if(input.gifUrl&&!gifUrl)return json(res,400,{error:'Choose a GIF returned by Minglora’s verified GIF search.'});
        if(stickerEmoji&&(text||attachmentIds.length||gifUrl))return json(res,400,{error:'Send a sticker by itself.'});
        if(!recipient||to===user.id||blockedBetween(user.id,to)||text.length>3000||(!text&&!attachmentIds.length&&!stickerEmoji&&!gifUrl)||attachmentIds.length>5)return json(res,400,{error:'Choose a recipient and enter a message, attach a file, or select a sticker or GIF.'});
        const audience=getUserSettings(recipient).privacy.messageAudience;
        if(audience!=='everyone'&&!isFriend(user.id,to))return json(res,403,{error:'This member only accepts new messages from confirmed friends.'});
        const assets=attachmentIds.map(id=>(db.mediaAssets||[]).find(asset=>asset.id===id&&asset.ownerId===user.id&&asset.slot==='message'&&asset.status==='uploaded'));
        if(assets.some(asset=>!asset))return json(res,400,{error:'One or more attachments are unavailable. Upload them again.'});
        const messageText=stickerEmoji||text;
        const msg={id:uid(),from:user.id,to,text:messageText,stickerId:stickerEmoji?stickerId:null,gifUrl:gifUrl||null,attachmentIds,createdAt:now(),read:false};
        db.messageConversationHides=(db.messageConversationHides||[]).filter(item=>!(item.userId===user.id&&item.peerId===to));
        assets.forEach(asset=>{asset.status='attached';asset.attachedTo='message:'+msg.id;});
        db.messages.push(msg);notify(to,user.id,'message',user.name+' sent you a message.');
        await saveStore();
        const attachments=await Promise.all(assets.map(async asset=>({id:asset.id,name:asset.originalName||asset.fileName||'Attachment',mimeType:asset.mimeType,mediaType:asset.mediaType,byteSize:asset.byteSize,url:await resolveAssetUrl(asset)})));
        return json(res,201,{message:{...msg,attachments,author:safeUser(user)}});
      }
      if(method==='GET'&&p==='/api/push/public-key'){
        if(!configureWebPush())return json(res,503,{error:'Minglora device push is not configured yet.'});
        return json(res,200,{publicKey:String(process.env.WEB_PUSH_PUBLIC_KEY).trim()});
      }
      if(method==='POST'&&p==='/api/push/subscriptions'){
        const endpoint=String(input.endpoint||'').trim(),p256dh=String(input.keys?.p256dh||''),auth=String(input.keys?.auth||'');
        let parsed;
        try{parsed=new URL(endpoint);}catch{return json(res,400,{error:'Choose a valid browser push subscription.'});}
        if(parsed.protocol!=='https:'||endpoint.length>2048||p256dh.length<20||p256dh.length>256||auth.length<8||auth.length>128)return json(res,400,{error:'The browser push subscription is invalid.'});
        db.pushSubscriptions=(db.pushSubscriptions||[]).filter(item=>item.endpoint!==endpoint);
        db.pushSubscriptions.push({id:uid(),userId:user.id,endpoint,keys:{p256dh,auth},expirationTime:input.expirationTime||null,userAgent:String(req.headers['user-agent']||'').slice(0,240),createdAt:now(),updatedAt:now()});
        await saveStore();
        return json(res,201,{ok:true,subscriptions:(db.pushSubscriptions||[]).filter(item=>item.userId===user.id).length});
      }
      if(method==='DELETE'&&p==='/api/push/subscriptions'){
        const endpoint=String(input.endpoint||'').trim();
        const before=(db.pushSubscriptions||[]).length;
        db.pushSubscriptions=(db.pushSubscriptions||[]).filter(item=>!(item.userId===user.id&&item.endpoint===endpoint));
        await saveStore();
        return json(res,200,{ok:true,removed:before-(db.pushSubscriptions||[]).length});
      }
      if(method==='GET'&&p==='/api/notifications'){const prefs=getUserSettings(user).notifications;const notifications=prefs.inApp?db.notifications.filter(n=>n.userId===user.id&&(!n.actorId||!blockedBetween(user.id,n.actorId))&&(n.type==='friend'?prefs.friendRequests:n.type==='message'?prefs.messages:['reaction','comment','follow'].includes(n.type)?prefs.interactions:true)).map(n=>({...n,actor:safeUser(db.users.find(u=>u.id===n.actorId))})):[];return json(res,200,{notifications});}
      if(method==='POST'&&p==='/api/notifications/read'){db.notifications.filter(n=>n.userId===user.id).forEach(n=>n.read=true);await saveStore();return json(res,200,{ok:true});}
      if(method==='GET'&&p==='/api/search'){const q=(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100);if(!q)return json(res,200,{users:[],posts:[],groups:[],pages:[]});return json(res,200,{users:db.users.filter(u=>u.id!==user.id&&!blockedBetween(user.id,u.id)&&canViewProfile(user.id,u)&&(u.name.toLowerCase().includes(q)||u.username.includes(q))).map(safeUser),posts:await Promise.all(db.posts.filter(x=>x.status!=='hidden'&&!blockedBetween(user.id,x.userId)&&x.text.toLowerCase().includes(q)).map(x=>publicPost(x,user.id))),groups:db.groups.filter(g=>(g.name+' '+g.description).toLowerCase().includes(q)),pages:(db.pages||[]).filter(page=>page.status==='active'&&!blockedBetween(user.id,page.createdBy)&&(page.title+' '+page.handle+' '+page.description+' '+page.category).toLowerCase().includes(q)).map(page=>({...page,owner:safeUser(db.users.find(u=>u.id===page.createdBy)),followerCount:(db.pageFollows||[]).filter(f=>f.pageId===page.id).length,isFollowing:(db.pageFollows||[]).some(f=>f.pageId===page.id&&f.userId===user.id)}))});}
      return json(res,404,{error:'API route not found.'});
    } catch(e) { if(process.env.NODE_ENV==='test')return json(res,e.status||500,{error:e.message,stack:e.stack}); console.error('[Minglora API error]',e); return json(res,e.status||500,{error:e.status?e.message:'Internal server error.'}); }
  }
  const rel=p==='/'?'index.html':decodeURIComponent(p.slice(1)); const file=path.resolve(publicDir,rel);
  if(!file.startsWith(publicDir+path.sep)&&file!==path.join(publicDir,'index.html'))return json(res,403,{error:'Forbidden'});
  fs.readFile(file,(err,data)=>{if(err){fs.readFile(path.join(publicDir,'index.html'),(e,d)=>{if(e)return json(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':MIME['.html'],'Cache-Control':'no-store',...SECURITY_HEADERS});res.end(d);});return;}const extension=path.extname(file);const cacheHeaders=extension==='.html'?{'Cache-Control':'no-store'}:(['.js','.css','.webmanifest'].includes(extension)||path.basename(file)==='sw.js')?{'Cache-Control':'no-cache, max-age=0, must-revalidate'}:{};res.writeHead(200,{'Content-Type':MIME[extension]||'application/octet-stream',...cacheHeaders,...SECURITY_HEADERS});res.end(data);});
}
const server=http.createServer((req,res)=>{route(req,res).catch(()=>json(res,500,{error:'Unexpected server error.'}));});
server.listen(PORT,'0.0.0.0',async()=>{
  liveSessionCleanupReady = cleanupPersistedLiveSessions();
  const liveCleanup = await liveSessionCleanupReady;
  console.info('[Minglora LIVE cleanup]', JSON.stringify(liveCleanup));
  console.log(`Minglora listening on port ${PORT}`);
  const persistence = await persistenceHealth();
  console.info('[Minglora readiness]', JSON.stringify({
    authProvider: AUTH_PROVIDER,
    authConfigured: AUTH_PROVIDER === 'legacy' || supabaseAuthConfigured(),
    persistenceDriver: persistence.driver,
    persistenceDurable: persistence.durable,
    persistenceReady: persistence.ready,
    liveProvider: 'livekit',
    liveConfigured: isLiveKitConfigured()
  }));
  const liveHealth = await verifyLiveKitConnection({ force: true });
  console.info('[Minglora LiveKit verification]', JSON.stringify(liveHealth));
});
