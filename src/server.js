import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import webpush from 'web-push';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { appOrigin, isAllowedAppOrigin } from './app-origin.js';
import { db, saveStore, uid, now, persistenceHealth, requestSupabaseState, isSupabasePersistence } from './store.js';
import { broadcastLiveKitData, createLiveKitToken, deleteLiveKitRoom, ensureLiveKitRoom, isLiveKitConfigured, listLiveKitParticipants, removeLiveKitParticipant, verifyLiveKitConnection, LIVEKIT_TRACK_SOURCE } from '../backend/modules/live/livekit.js';
import { LIVE_MODES, broadcastTypeForLiveMode, getLivePublishSourceNames, normalizeLiveSettings } from '../backend/modules/live/settings.js';
import { canAccessMeetWaveRoom, canReceiveMeetWaveInvitation, meetWaveRoomJoinAvailability, normalizeMeetWaveMessage, validateMeetWaveRoomInput } from '../backend/modules/meetwave/service.js';
import { CALL_RING_TIMEOUT_MS, CALL_MAX_PARTICIPANTS, CALL_RINGTONE_MIME_TYPES, CALL_RINGTONE_MAX_BYTES, countCallParticipants, expireRingingCall, isCallParticipantBusy, reconcileCallPresence, validateCallRingtoneUpload } from '../backend/modules/calls/service.js';
import { normalizeEmail, normalizeUsername, normalizeContactPhone, validateContactPhone, validateEmail, validateUsername, validatePostInput, validateProfilePatch } from './domain/validation.js';
import { createSessionAuthManager, getAuthTokenExpiresAt } from './session-auth.js';
import { paginateDescending } from './domain/pagination.js';
import { rankForYouFeed } from './domain/feed-ranking.js';
import { canViewStory as canViewStoryPolicy, removeExpiredStories } from '../backend/modules/stories/service.js';
import { canPublishGroupPost, canDeleteGroupPost, canLeaveGroup, canViewGroup, canDiscoverGroup, canRequestGroupMembership, canModerateGroup, canManageGroupSettings, canManageGroupEvents, canAssignGroupRole, canTransferGroupOwnership, getGroupRole } from '../backend/modules/groups/service.js';
import { validatePageInput, canManagePage as canManagePagePolicy, canDeletePagePost, canDeletePage } from '../backend/modules/pages/service.js';
import { recordProfileView, touchProfilePresence, getProfileViewStats } from '../backend/modules/profiles/service.js';
import { getPlatformAdminBadge, getProfileVerificationBadge } from './platform-badges.js';
import { listActiveCreatorSubscriptions } from '../backend/modules/subscriptions/service.js';
import { SOUND_AUDIO_MIME_TYPES, validateSoundInput, normalizeSoundtrackInput, canUseSound, soundUsageCounts } from '../backend/modules/sounds/service.js';
import { getGiftGallery, giftGalleryTimeZone, recordGiftGalleryEvent, updateGiftGallerySettings } from '../backend/modules/gift-gallery/service.js';
import { CREATOR_LEAGUE_CLASSES, recordLiveGiftForLeagues, refundCreatorLeagueGift, getCreatorLeagueOverview, createCreatorLeagueMatch, acceptCreatorLeagueMatch, supportCreatorLeagueMatch, useCreatorLeaguePowerup, listCreatorLeagueMatches, settleExpiredLeagueMatches, settleScheduledCreatorLeagueDays } from '../backend/modules/leagues/service.js';
import { recordGifterGift, refundGifterGift, getGifterProgressionOverview, getGifterBadgeSummary, getNewGifterIdentity } from '../backend/modules/gifter-progression/service.js';
import { LIVE_FAN_CLUB_GIFT_CODES, LIVE_FAN_CLUB_JOIN_GIFT_CODE, LIVE_FAN_CLUB_JOIN_COIN_COST, ensureLiveFanClubCollections, getLiveFanClubMembership, countActiveLiveFanClubMembers, joinLiveFanClub, awardLiveFanClubPoints, publicLiveFanClubMembership } from '../backend/modules/live/fan-club.js';
import { supabaseAuthConfigured, supabaseSignUp, supabaseSignIn, supabaseUpdatePassword, supabaseListFactors, supabaseEnrollTotp, supabaseChallengeFactor, supabaseVerifyFactor, supabaseUnenrollFactor, supabaseRefreshSession, supabaseRequestPasswordReset, supabaseRequestMagicLink, supabaseCompletePasswordReset, supabaseGetUser, supabaseUpdateEmail, supabaseRequestPhoneChange, supabaseVerifyPhoneChange, supabaseUpdateUserMetadata, supabaseUpdateProfile } from './supabase-auth.js';
const scrypt = promisify(crypto.scrypt);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);
const liveLikeRateLimits = new Map();
const liveFanClubJoinInProgress = new Set();
if (process.env.NODE_ENV === 'production' &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Production startup requires SESSION_SECRET to contain at least 32 characters.');
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const AUTH_PROVIDER = String(process.env.AUTH_PROVIDER || (process.env.NODE_ENV === 'production' || supabaseAuthConfigured() ? 'supabase' : 'legacy')).trim().toLowerCase();
if (!['supabase', 'legacy'].includes(AUTH_PROVIDER)) throw new Error('AUTH_PROVIDER must be supabase or legacy.');
if (process.env.NODE_ENV === 'production' && AUTH_PROVIDER !== 'supabase') throw new Error('Production startup requires AUTH_PROVIDER=supabase. When Minglora Supabase credentials are missing, authentication routes fail closed with HTTP 503 instead of writing accounts to local storage.');
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.gltf':'model/gltf+json; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8' };

let refundedGiftSyncAt = 0;
let refundedGiftSyncPromise = null;

/**
 * Reconcile refunds recorded by the authoritative Coin ledger into the
 * persisted application projections. The original transaction remains intact
 * for audit, while every public-facing projection stops counting it.
 */
async function syncRefundedGiftActivity() {
  if (!isSupabasePersistence()) return { updated: 0 };
  if (refundedGiftSyncPromise) return refundedGiftSyncPromise;
  if (Date.now() - refundedGiftSyncAt < 4000) return { updated: 0 };
  refundedGiftSyncAt = Date.now();

  refundedGiftSyncPromise = (async () => {
    const payload = await requestSupabaseState("economy_refunded_gift_ids");
    const giftIds = [...new Set((Array.isArray(payload?.giftIds) ? payload.giftIds : [])
      .map(value => String(value || "").trim())
      .filter(Boolean))];
    if (!giftIds.length) return { updated: 0 };

    let changed = 0;
    const timestamp = new Date();
    for (const giftId of giftIds) {
      const galleryEvent = (db.giftGalleryEvents || []).find(item => item.giftId === giftId);
      const leagueEvent = (db.creatorLeagueGiftLedger || []).find(item => item.giftId === giftId);
      const progressionEvent = (db.gifterProgressionLedger || []).find(item => item.giftId === giftId);
      const sourceEvent = progressionEvent || galleryEvent || leagueEvent;
      const refundTime = sourceEvent?.createdAt ? new Date(sourceEvent.createdAt) : timestamp;

      const leagueResult = refundCreatorLeagueGift(db, giftId, timestamp);
      const gifterResult = refundGifterGift(db, giftId, timestamp);
      let itemChanged = Boolean(leagueResult.reversed || gifterResult.reversed);

      for (const item of db.giftGalleryEvents || []) {
        if (item.giftId !== giftId || item.refundedAt || item.status === "refunded") continue;
        item.refundedAt = timestamp.toISOString();
        item.status = "refunded";
        itemChanged = true;
      }

      const recipientId = galleryEvent?.creatorId || leagueEvent?.userId || progressionEvent?.recipientId;
      const senderId = galleryEvent?.senderId || progressionEvent?.senderId;
      if (recipientId && senderId && Number.isFinite(refundTime.getTime())) {
        const before = (db.notifications || []).length;
        db.notifications = (db.notifications || []).filter(item => {
          if (item.type !== "gift" || item.userId !== recipientId || item.actorId !== senderId) return true;
          const notificationTime = Date.parse(item.createdAt || "");
          return !Number.isFinite(notificationTime) || Math.abs(notificationTime - refundTime.getTime()) > 15000;
        });
        if (db.notifications.length !== before) itemChanged = true;
      }

      if (itemChanged) changed += 1;
    }
    if (changed) await saveStore();
    return { updated: changed };
  })().catch(error => {
    console.error("[Minglora refunds] Could not reconcile refunded gift projections:", String(error?.message || error).slice(0, 200));
    return { updated: 0, error: true };
  }).finally(() => {
    refundedGiftSyncPromise = null;
  });
  return refundedGiftSyncPromise;
}

let paypalAccessTokenCache=null;
function paypalConfig(){
  const clientId=String(process.env.PAYPAL_CLIENT_ID||'').trim();
  const clientSecret=String(process.env.PAYPAL_CLIENT_SECRET||'').trim();
  const production=process.env.NODE_ENV==='production';
  const mode=String(process.env.PAYPAL_MODE||process.env.PAYPAL_ENVIRONMENT||(production?'live':'sandbox')).trim().toLowerCase();
  let base=String(process.env.PAYPAL_API_BASE_URL||'').trim();
  while(base.endsWith('/'))base=base.slice(0,-1);
  if(!base)base=mode==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
  const productionBlocked=production&&(mode!=='live'||base!=='https://api-m.paypal.com');
  return {clientId,clientSecret,webhookId:String(process.env.PAYPAL_WEBHOOK_ID||'').trim(),base,mode,productionBlocked,configured:Boolean(clientId&&clientSecret)&&!productionBlocked};
}
async function paypalToken(){
  const cfg=paypalConfig();
  if(cfg.productionBlocked)throw Object.assign(new Error('Production Minglora payments require PAYPAL_MODE=live and the official PayPal live API endpoint. Sandbox mode is blocked in production.'),{status:503,paypalNoSubmission:true});
  if(!cfg.configured)throw Object.assign(new Error('PayPal is not configured for Minglora yet. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to the Minglora server environment.'),{status:503,paypalNoSubmission:true});
  if(paypalAccessTokenCache&&paypalAccessTokenCache.expiresAt>Date.now()+60000)return paypalAccessTokenCache.value;
  let response;
  try{
    response=await fetch(cfg.base+'/v1/oauth2/token',{
      method:'POST',
      headers:{Authorization:'Basic '+Buffer.from(cfg.clientId+':'+cfg.clientSecret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
      body:'grant_type=client_credentials'
    });
  }catch{throw Object.assign(new Error('Could not reach PayPal to obtain an access token. No payout request was sent.'),{status:503,paypalNoSubmission:true});}
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token){
    throw Object.assign(new Error(String(data.error_description||data.message||'PayPal authentication failed. Check the configured API credentials.')),{status:502,code:data.error||null,paypalNoSubmission:true});
  }
  paypalAccessTokenCache={value:data.access_token,scope:String(data.scope||''),expiresAt:Date.now()+Math.max(60,Number(data.expires_in||300))*1000};
  return data.access_token;
}
async function paypalRequest(path,method='POST',payload={},requestId){
  const cfg=paypalConfig(),token=await paypalToken();
  if(path==='/v1/payments/payouts'&&!String(paypalAccessTokenCache?.scope||'').split(/\s+/).includes('https://uri.paypal.com/payments/payouts')){
    throw Object.assign(new Error('The PayPal live REST app token does not include the Payouts permission. Enable Payouts for this app in PayPal Developer Dashboard before retrying.'),{status:503,code:'PAYPAL_PAYOUTS_SCOPE_MISSING',paypalNoSubmission:true});
  }
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
    const providerStatus=Number(response.status||0);
    throw Object.assign(new Error(String(detail||data.message||data.name||'PayPal could not complete the request.')),{status:502,code:data.name||null,paypalHttpStatus:providerStatus,paypalDebugId:String(data.debug_id||'').slice(0,80),paypalNoSubmission:[400,401,403,422].includes(providerStatus)});
  }
  return data;
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
  const result={id:u.id,name:u.name,username:u.username,bio:'',location:'',avatar:u.avatar||'',cover:u.cover||'',createdAt:u.createdAt,verificationBadge:getProfileVerificationBadge(u),platformBadge:getPlatformAdminBadge(u,viewerId),verificationStatus:u.verificationStatus||'not_submitted'};
  const profileThought=typeof viewerId==='string'?(db.profileStatuses||[]).filter(item=>item.userId===u.id&&Date.parse(item.expiresAt)>Date.now()&&canViewProfileAudience(viewerId,u.id,item.audience)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0]:null;
  if(profileThought)result.profileThought={text:profileThought.text,mood:profileThought.mood||'',audience:profileThought.audience,createdAt:profileThought.createdAt,expiresAt:profileThought.expiresAt};
  const gifterBadge=getGifterBadgeSummary(db,u.id);
  if(gifterBadge)result.gifterBadge=gifterBadge;
  const newGifterIdentity=getNewGifterIdentity(db,u.id);
  if(newGifterIdentity)result.newGifterIdentity=newGifterIdentity;
  const creatorLeagueProfile=(db.creatorLeagueProfiles||[]).find(item=>item.userId===u.id);
  if(creatorLeagueProfile){
    const leagueClass=CREATOR_LEAGUE_CLASSES.includes(creatorLeagueProfile.leagueClass)?creatorLeagueProfile.leagueClass:'D5';
    result.creatorLeague={
      leagueClass,
      region:String(creatorLeagueProfile.region||'GLOBAL').trim().toUpperCase()||'GLOBAL',
      fragments:Math.max(0,Math.min(3,Math.floor(Number(creatorLeagueProfile.fragments)||0))),
      fragmentsNeeded:4,
      leagueShields:Math.max(0,Math.floor(Number(creatorLeagueProfile.leagueShields)||0)),
      seasonPoints:Math.max(0,Number(creatorLeagueProfile.seasonPoints)||0),
      lifetimeGiftPoints:Math.max(0,Number(creatorLeagueProfile.lifetimeGiftPoints)||0),
      seasonKey:creatorLeagueProfile.seasonKey||null,
      updatedAt:creatorLeagueProfile.updatedAt||null
    };
  }
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
    currentCity:own?(u.city||u.location||''):visibility.city===true?(u.city||''):visibility.location===true?(u.location||''):'',
    country:(own||visibility.country===true)?(u.country||''):'',
    county:(own||visibility.county===true)?(u.county||''):'',
    parish:(own||visibility.parish===true)?(u.parish||''):'',
    gender:(own||visibility.gender===true)?(u.gender||''):'',
    relationshipStatus:(own||visibility.relationshipStatus===true)?(u.relationshipStatus||''):''
  };
  if(aboutSections.personalDetails){
    for(const [key,value] of Object.entries(legacyPersonal)){
      if(!Object.hasOwn(aboutSections.personalDetails,key))aboutSections.personalDetails[key]=value;
    }
  }
  if(aboutSections.intro&&!Object.hasOwn(aboutSections.intro,'bio')&&(own||visibility.bio===true))aboutSections.intro.bio=u.bio||'';
  if(aboutSections.contactInfo&&!Object.hasOwn(aboutSections.contactInfo,'phone')&&(own||visibility.contactPhone===true))aboutSections.contactInfo.phone=u.contactPhone||'';
  result.aboutSections=aboutSections;
  if(own){
    result.email=u.email||'';
    result.platformRole=u.role||null;
    result.aboutVisibility=visibility;
    result.aboutSectionVisibility=sectionVisibility;
  }
  return result;
}
const APP_COLOR_THEMES=['minglora','ocean','tropical','royal','emerald','rose','golden','lavender','midnight','graphite'];
const LIVE_ROOM_THEMES=['studio','ocean','tropical','royal','neon','sunset','garden','social'];
const LIVE_SCREEN_LAYOUTS=['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'];
const DEFAULT_SETTINGS={privacy:{profileVisibility:'public',allowFriendRequests:true,messageAudience:'everyone',meetWaveAudience:'everyone',friendsListAudience:'public',followersListAudience:'public',followingListAudience:'public',subscribersListAudience:'public',commentAudience:'everyone'},notifications:{inApp:true,friendRequests:true,messages:true,interactions:true,groups:true,push:true,profileViews:false},preferences:{theme:'system',colorTheme:'minglora',liveRoomTheme:'studio',feedSort:'recent',reducedMotion:false,liteMode:false,displayCurrency:'USD',messengerIncomingCallSounds:true,messengerMessageSounds:true,messengerAutoOpenNewMessages:false,messengerActiveStatus:true,messengerArchivedConversationIds:[],messengerRestrictedUserIds:[]}};
function getUserSettings(user){const saved=user?.settings||{};const preferences={...DEFAULT_SETTINGS.preferences,...(saved.preferences||{})};if(!APP_COLOR_THEMES.includes(preferences.colorTheme))preferences.colorTheme=DEFAULT_SETTINGS.preferences.colorTheme;if(!LIVE_ROOM_THEMES.includes(preferences.liveRoomTheme))preferences.liveRoomTheme=DEFAULT_SETTINGS.preferences.liveRoomTheme;for(const key of ['messengerArchivedConversationIds','messengerRestrictedUserIds'])if(!Array.isArray(preferences[key]))preferences[key]=[];return {privacy:{...DEFAULT_SETTINGS.privacy,...(saved.privacy||{})},notifications:{...DEFAULT_SETTINGS.notifications,...(saved.notifications||{})},preferences};}
function isFriend(firstId,secondId){return (db.follows||[]).some(item=>item.followerId===firstId&&item.followedId===secondId)&&(db.follows||[]).some(item=>item.followerId===secondId&&item.followedId===firstId);}
function canViewProfile(viewerId,target){if(!target||viewerId===target.id)return true;const visibility=getUserSettings(target).privacy.profileVisibility;if(visibility==='public')return true;if(visibility==='friends')return isFriend(viewerId,target.id);return false;}
const DEFAULT_PROFILE_SECTIONS={about:true,friends:true,photos:true,reels:true,groups:true,events:true,checkIns:true,highlights:true};
function readProfileSections(userId){
  const saved=(db.profileSections||[]).find(item=>item.userId===userId);
  return {...DEFAULT_PROFILE_SECTIONS,...(saved?.sections||{})};
}
function canViewProfileAudience(viewerId,ownerId,audience='public'){
  if(viewerId===ownerId)return true;
  if(blockedBetween(viewerId,ownerId))return false;
  if(audience==='public')return true;
  if(audience==='friends')return isFriend(viewerId,ownerId);
  if(audience==='followers')return (db.follows||[]).some(edge=>edge.followerId===viewerId&&edge.followedId===ownerId);
  return false;
}
function recordProfileActivity(userId,action,summary,targetType='profile',targetId=userId){
  db.profileActivity ||= [];
  db.profileActivity.unshift({id:uid(),userId,actorId:userId,action:String(action||'activity').slice(0,64),summary:String(summary||'').slice(0,240),targetType:String(targetType||'profile').slice(0,64),targetId:String(targetId||userId).slice(0,128),createdAt:now()});
  if(db.profileActivity.length>500)db.profileActivity.length=500;
}

function validateSettingsPatch(input,user){
  if(!input||typeof input!=='object'||Array.isArray(input))return {valid:false,error:'Settings must be an object.'};
  const next=getUserSettings(user);const allowed={privacy:['profileVisibility','allowFriendRequests','messageAudience','meetWaveAudience','friendsListAudience','followersListAudience','followingListAudience','subscribersListAudience','commentAudience'],notifications:['inApp','friendRequests','messages','interactions','groups','push','profileViews'],preferences:['theme','colorTheme','liveRoomTheme','feedSort','reducedMotion','liteMode','displayCurrency','messengerIncomingCallSounds','messengerMessageSounds','messengerAutoOpenNewMessages','messengerActiveStatus','messengerArchivedConversationIds','messengerRestrictedUserIds']};
  for(const [section,values] of Object.entries(input)){
    if(!allowed[section]||!values||typeof values!=='object'||Array.isArray(values))return {valid:false,error:'Unsupported settings section.'};
    for(const [key,value] of Object.entries(values)){
      if(!allowed[section].includes(key))return {valid:false,error:'Unsupported setting: '+key};
      if(section==='privacy'&&key==='profileVisibility'&&!['public','friends','private'].includes(value))return {valid:false,error:'Profile visibility must be public, friends or private.'};
      if(section==='privacy'&&key==='messageAudience'&&!['everyone','friends','nobody'].includes(value))return {valid:false,error:'Message audience must be everyone, friends or nobody.'};
      if(section==='privacy'&&key==='meetWaveAudience'&&!['everyone','friends','nobody'].includes(value))return {valid:false,error:'MeetWave invitation audience must be everyone, friends or nobody.'};
      if(section==='privacy'&&['friendsListAudience','followersListAudience','followingListAudience','subscribersListAudience'].includes(key)&&!['public','friends','followers','private'].includes(value))return {valid:false,error:'Choose a valid audience for this relationship list.'};
      if(section==='privacy'&&key==='commentAudience'&&!['everyone','friends','nobody'].includes(value))return {valid:false,error:'Comment audience must be everyone, friends or nobody.'};
      if(section==='privacy'&&key==='allowFriendRequests'&&typeof value!=='boolean')return {valid:false,error:'Allow friend requests must be true or false.'};
      if(section==='notifications'&&typeof value!=='boolean')return {valid:false,error:'Notification preferences must be true or false.'};
      if(section==='preferences'&&key==='theme'&&!['system','light','dark'].includes(value))return {valid:false,error:'Theme must be system, light or dark.'};
      if(section==='preferences'&&key==='colorTheme'&&!APP_COLOR_THEMES.includes(value))return {valid:false,error:'Choose a supported Minglora colour theme.'};
      if(section==='preferences'&&key==='liveRoomTheme'&&!LIVE_ROOM_THEMES.includes(value))return {valid:false,error:'Choose a supported LIVE room theme.'};
      if(section==='preferences'&&key==='feedSort'&&!['recent','oldest'].includes(value))return {valid:false,error:'Feed sort must be recent or oldest.'};
      if(section==='preferences'&&key==='displayCurrency'&&!['USD','JMD','CAD','GBP','EUR','TTD','BBD','XCD','GYD','AUD','JPY','INR','NGN','ZAR','KES'].includes(value))return {valid:false,error:'Choose a supported display currency.'};
      if(section==='preferences'&&['reducedMotion','liteMode','messengerIncomingCallSounds','messengerMessageSounds','messengerAutoOpenNewMessages','messengerActiveStatus'].includes(key)&&typeof value!=='boolean')return {valid:false,error:'Messenger and motion preferences must be true or false.'};
      if(section==='preferences'&&['messengerArchivedConversationIds','messengerRestrictedUserIds'].includes(key)&&(!Array.isArray(value)||value.length>500||value.some(id=>typeof id!=='string'||!id.trim()||id.length>128)))return {valid:false,error:'Messenger account lists must contain valid account identifiers.'};
      if(section==='preferences'&&['messengerArchivedConversationIds','messengerRestrictedUserIds'].includes(key))next[section][key]=[...new Set(value)];
      else next[section][key]=value;
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
const PLATFORM_OWNER_USER_IDS=new Set(['5b998c21-86b5-4621-ab37-e0808a2657b1']);
const CREATOR_HUB_ADMIN_EMAIL='creatorhubcreatornetwork@gmail.com';
const CREATOR_HUB_ADMIN_USER_ID='5b998c21-86b5-4621-ab37-e0808a2657b1';
function isDesignatedCreatorHubAdmin(user){
  return Boolean(user&&String(user.id||'')===CREATOR_HUB_ADMIN_USER_ID&&normalizeEmail(user.email)===CREATOR_HUB_ADMIN_EMAIL&&user.role==='platform_owner');
}
const SECONDARY_CREATOR_HUB_USER_ID='28e1df97-3fe1-488e-bb84-bdc353c58653';
const SECONDARY_CREATOR_HUB_EMAIL='larryjones2019ersky@gmail.com';
function isPlatformStaffIdentity(user){
  if(!user)return false;
  const email=String(user.email||'').trim().toLowerCase();
  if(String(user.id||'')===SECONDARY_CREATOR_HUB_USER_ID||email===SECONDARY_CREATOR_HUB_EMAIL)return false;
  const ids=String(process.env.MODERATOR_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  return ['platform_owner','admin','moderator'].includes(user.role)||ids.includes(user.id);
}
function isModerator(user,req=null){
  if(!isPlatformStaffIdentity(user))return false;
  if(PLATFORM_OWNER_USER_IDS.has(user.id)){
    const session=req?sessionFromRequest(req):null;
    return user.role==='platform_owner'&&Boolean(session?.mfaVerified);
  }
  return true;
}
function hasActiveReviewerSession(user){
  if(!user||!isPlatformStaffIdentity(user))return false;
  if(!PLATFORM_OWNER_USER_IDS.has(user.id))return true;
  return (db.sessions||[]).some(session=>session.userId===user.id&&session.mfaVerified&&new Date(session.expiresAt)>new Date());
}
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
  return isAllowedAppOrigin(suppliedOrigin, req);
}
function appSessionCookie(sid) {
  return `sid=${encodeURIComponent(sid+'.'+sign(sid))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`;
}
function clearAppSessionCookie() {
  return `sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`;
}
async function createAppSession(user,authTokens=null,req=null) {
  const sid=uid();const createdAt=now();
  db.sessions.push({id:sid,userId:user.id,createdAt,lastSeenAt:createdAt,expiresAt:new Date(Date.now()+7*86400000).toISOString(),authSealed:sealSessionAuth(authTokens),authExpiresAt:authTokens?.access_token?new Date(getAuthTokenExpiresAt(authTokens)).toISOString():null,mfaVerified:!authTokens?.access_token||tokenAal(authTokens.access_token)==='aal2',userAgent:String(req?.headers?.['user-agent']||'Unknown device').slice(0,240)});
  await saveStore();return appSessionCookie(sid);
}
function ensureLocalUser(authUser, fallback = {}) {
  if (!authUser?.id || !authUser?.email) throw Object.assign(new Error('Supabase Auth returned an incomplete user record.'), { status:502 });
  const metadata = authUser.user_metadata || authUser.raw_user_meta_data || {};
  const appMetadata = authUser.app_metadata || {};
  const email = normalizeEmail(authUser.email);
  const isSecondaryCreatorHubTestAccount =
    String(authUser.id||'')===SECONDARY_CREATOR_HUB_USER_ID || email===SECONDARY_CREATOR_HUB_EMAIL;
  const trustedRole = !isSecondaryCreatorHubTestAccount && ['platform_owner','admin','moderator'].includes(String(appMetadata.role||''))?String(appMetadata.role):null;
  const verificationBadge = appMetadata.verification_badge==='blue'?'blue':'none';
  const verificationStatus = ['pending','needs_information','verified','rejected','suspended'].includes(String(appMetadata.verification_status||''))?String(appMetadata.verification_status):'not_submitted';
  const name = String(metadata.name || metadata.full_name || fallback.name || email.split('@')[0] || 'Minglora Member').trim();
  const username = normalizeUsername(metadata.username || fallback.username || `member_${String(authUser.id).replace(/-/g,'').slice(0,12)}`);
  const contactPhone=normalizeContactPhone(metadata.contact_phone||metadata.phone_number||fallback.phoneNumber||'');
  if (!validateUsername(username).valid) throw Object.assign(new Error('The username on this account is invalid. Contact Minglora support.'), { status:409 });
  if(!validateContactPhone(contactPhone).valid)throw Object.assign(new Error('The contact phone stored on this account is invalid. Update it in your Minglora profile.'),{status:409});
  let user = db.users.find(item => item.id === authUser.id) || db.users.find(item => normalizeEmail(item.email) === email);
  const usernameOwner = db.users.find(item => item.username === username && item.id !== user?.id);
  if (usernameOwner) throw Object.assign(new Error('That username is already in use on Minglora.'), { status:409 });
  if (!user) {
    user = { id:authUser.id, name, username, email, passwordHash:null, bio:String(metadata.bio||''), location:String(metadata.location||''), contactPhone, country:String(metadata.country||''), county:String(metadata.county||''), parish:String(metadata.parish||''), city:String(metadata.city||''), gender:String(metadata.gender||''), relationshipStatus:String(metadata.relationship_status||metadata.relationshipStatus||''), aboutVisibility:metadata.about_visibility||metadata.aboutVisibility||DEFAULT_ABOUT_VISIBILITY, aboutSections:metadata.about_sections||metadata.aboutSections||{}, aboutSectionVisibility:metadata.about_section_visibility||metadata.aboutSectionVisibility||DEFAULT_ABOUT_SECTION_VISIBILITY, avatar:String(metadata.avatar_url||''), cover:String(metadata.cover_url||''), status:String(metadata.account_status||'active'), role:trustedRole||undefined, verificationBadge, verificationStatus, createdAt:authUser.created_at || now() };
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
    if(Object.hasOwn(authUser,'app_metadata')){
      if(trustedRole)user.role=trustedRole;
      else delete user.role;
      user.verificationBadge=verificationBadge;
      user.verificationStatus=verificationStatus;
    }
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
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw Object.assign(new Error('Request body too large'), {status:413});
    chunks.push(buffer);
  }
  req.rawBody = Buffer.concat(chunks);
  if (!req.rawBody.length) return {};
  try { return JSON.parse(req.rawBody.toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON body'), {status:400}); }
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
const CALL_PRESENCE_REFRESH_INTERVAL_MS=2500;
const callPresenceLastCheckedAt=new Map();
let callPresenceRefreshQueue=Promise.resolve();
const callCreationReservations=new Set();
let callSessionCleanupReady=Promise.resolve({ended:0,expired:0,verified:true});

async function reconcileCallPresenceForUsers(userIds,{force=false}={}){
  let release;
  const previous=callPresenceRefreshQueue;
  callPresenceRefreshQueue=new Promise(resolve=>{release=resolve;});
  await previous;
  try{
    const allUsers=!Array.isArray(userIds)||userIds.length===0;
    const selectedUsers=new Set((userIds||[]).map(String));
    const stamp=now(),nowMs=Date.now();
    let changed=false,expired=0,ended=0;
    const expiredCalls=[];
    for(const call of (db.calls||[])){
      if(call.status==='ringing'&&expireRingingCall(call,db.callParticipants||[],stamp,nowMs)){
        changed=true;expired++;expiredCalls.push(call);
      }
    }
    const activeCalls=(db.calls||[]).filter(call=>call.status==='active'&&(
      allUsers||(db.callParticipants||[]).some(item=>item.callId===call.id&&selectedUsers.has(String(item.userId)))
    ));
    const toCheck=activeCalls.filter(call=>force||nowMs-(callPresenceLastCheckedAt.get(call.id)||0)>=CALL_PRESENCE_REFRESH_INTERVAL_MS);
    if(toCheck.length){
      if(!isLiveKitConfigured()){
        const error=new Error('Minglora cannot verify whether an earlier call is still connected. Check the LiveKit service and refresh call availability.');
        error.status=503;throw error;
      }
      const health=await verifyLiveKitConnection({force:true});
      if(!health.connected){
        const error=new Error(health.error||'Minglora could not verify call availability with LiveKit. Try again shortly.');
        error.status=503;throw error;
      }
      for(const call of toCheck){
        let providerParticipants=[];
        try{providerParticipants=await listLiveKitParticipants(call.roomName);}
        catch(error){
          if(!isMissingLiveKitRoom(error)) {
            const unavailable=new Error('Minglora could not refresh the call connection. Try again shortly.');
            unavailable.status=503;throw unavailable;
          }
        }
        const result=reconcileCallPresence(call,db.callParticipants||[],providerParticipants,stamp,nowMs);
        if(result.changed)changed=true;
        if(result.ended){ended++;expiredCalls.push(call);}
        callPresenceLastCheckedAt.set(call.id,nowMs);
      }
    }
    if(changed)await saveStore();
    await Promise.all(expiredCalls.map(call=>cleanupCallRoom(call,call.status==='missed'?'ring-timeout':'presence-ended')));
    return {ended,expired,verified:true};
  }finally{
    release();
  }
}
async function cleanupPersistedCalls(){
  try{
    const result=await reconcileCallPresenceForUsers(null,{force:true});
    console.info('[Minglora calls cleanup]',JSON.stringify(result));
    return result;
  }catch(error){
    console.warn('[Minglora calls cleanup] Active call presence could not be verified; saved call records were preserved.',String(error?.message||error).slice(0,180));
    return {ended:0,expired:0,verified:false};
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
    title:notification.type==='live'?'Minglora LIVE':notification.type==='call'?'Incoming Minglora call':notification.type==='message'?'New Minglora message':notification.type==='profile_view'?'Profile view':'Minglora notification',
    body:String(notification.text||'You have a new Minglora notification.').slice(0,240),
    tag:'minglora-'+notification.type+'-'+String(notification.id).slice(0,24),
    data:{type:notification.type,callId:notification.callId||null,liveSessionId:notification.liveSessionId||null,actorId:notification.actorId||null,notificationId:notification.id,sellerId:notification.sellerId||null}
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
  if((type==='friend'&&!prefs.friendRequests)||(type==='message'&&!prefs.messages)||(type==='profile_view'&&!prefs.profileViews)||(String(type||'').startsWith('group_')&&!prefs.groups)||(['reaction','comment','follow'].includes(type)&&!prefs.interactions))return;
  const notification={id:uid(),userId,actorId,type,text,...extra,createdAt:now(),read:false};
  if(prefs.inApp)db.notifications.unshift(notification);
  if(prefs.push)void deliverUserPush(userId,notification).catch(()=>{});
};
function notifyPlatformReviewers(type,applicantId,actorId,text,extra={}){
  for(const reviewer of (db.users||[])){
    if(reviewer.id===applicantId||!hasActiveReviewerSession(reviewer))continue;
    notify(reviewer.id,actorId,type,text,{applicantId,...extra});
  }
}
const blockedBetween = (firstId, secondId) => firstId !== secondId && (db.blocks || []).some(b => (b.blockerId === firstId && b.blockedId === secondId) || (b.blockerId === secondId && b.blockedId === firstId));
const pageRole = (pageId, userId) => (db.pageRoles || []).find(role => role.pageId === pageId && role.userId === userId)?.role || null;
const canManagePage = (pageId, userId) => canManagePagePolicy(db.pageRoles || [], pageId, userId);
const canViewStory = (viewerId, story) => canViewStoryPolicy({
  viewerId, story, friendships:db.friendships, follows:db.follows || [], blocks:db.blocks || []
});
async function pruneExpiredStories() {
  const current = Date.now();
  const activeStories=db.stories||[];
  const cleaned = removeExpiredStories({ stories:activeStories, views:db.storyViews || [], now:current });
  if (!cleaned.removedCount) return;
  const retainedIds=new Set(cleaned.stories.map(story=>story.id));
  const expired=activeStories.filter(story=>!retainedIds.has(story.id));
  db.storyArchives ||= [];
  const archivedIds=new Set(db.storyArchives.map(story=>story.id));
  for(const story of expired){
    if(!archivedIds.has(story.id))db.storyArchives.unshift({...story,archivedAt:now()});
  }
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
function resolveSoundtrackForUser(userId, raw) {
  const validation=normalizeSoundtrackInput(raw);
  if(!validation.valid)throw Object.assign(new Error(validation.errors.join(" ")),{status:400});
  if(!validation.value)return null;
  const sound=(db.sounds||[]).find(item=>item.id===validation.value.soundId);
  if(!sound||!canUseSound(sound,userId)||blockedBetween(userId,sound.ownerId)){
    throw Object.assign(new Error("That sound is unavailable or its creator has not allowed reuse."),{status:404});
  }
  if(sound.durationMs>0){
    const effectiveEnd=validation.value.endMs||sound.durationMs;
    if(validation.value.startMs>=sound.durationMs||effectiveEnd>sound.durationMs){
      throw Object.assign(new Error("The selected sound trim must stay within the recording."),{status:400});
    }
    if(validation.value.fadeInMs+validation.value.fadeOutMs>effectiveEnd-validation.value.startMs){
      throw Object.assign(new Error("Fade durations cannot exceed the selected sound clip."),{status:400});
    }
  }
  return validation.value;
}
async function publicSoundCard(sound,viewerId,usageCounts=soundUsageCounts(db)) {
  const asset=(db.mediaAssets||[]).find(item=>item.id===sound.assetId&&item.ownerId===sound.ownerId&&item.slot==="sound"&&item.status!=="deleted");
  if(!asset)return null;
  let url=null;
  try{url=await resolveAssetUrl(asset);}catch{return null;}
  if(!url)return null;
  return {
    id:sound.id,title:sound.title,attribution:sound.attribution||"",
    durationMs:Number(sound.durationMs||0),allowReuse:Boolean(sound.allowReuse),
    createdAt:sound.createdAt,usageCount:Number(usageCounts.get(sound.id)||0),
    isFavorite:(db.soundFavorites||[]).some(item=>item.userId===viewerId&&item.soundId===sound.id),
    mediaType:"audio",mimeType:asset.mimeType,url,
    author:safeUser(db.users.find(item=>item.id===sound.ownerId))
  };
}
async function publicSoundtrack(track,viewerId) {
  if(!track?.soundId)return null;
  const sound=(db.sounds||[]).find(item=>item.id===track.soundId);
  if(!sound)return null;
  const card=await publicSoundCard(sound,viewerId);
  return card?{...track,sound:card}:null;
}
async function publicPost(p,viewerId) {
  const author=db.users.find(u=>u.id===p.userId);
  const media=await Promise.all((p.mediaIds||[]).map(async id=>{
    const asset=(db.mediaAssets||[]).find(item=>item.id===id&&item.ownerId===p.userId&&item.slot==='post');
    if(!asset||asset.status==='deleted')return null;
    try{return {id:asset.id,mimeType:asset.mimeType,mediaType:asset.mediaType,url:await resolveAssetUrl(asset),byteSize:asset.byteSize};}catch{return null;}
  }));
  const {imageUrl,...cleanPost}=p;
  return {...cleanPost,media:media.filter(item=>item?.url),soundtrack:await publicSoundtrack(p.soundtrack,viewerId),author:safeUser(author),reactions:p.reactions||{},reactionCount:Object.values(p.reactions||{}).length,myReaction:(p.reactions||{})[viewerId]||null,
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
async function publicPagePost(post) {
  const media=await Promise.all((post.mediaIds||[]).map(async id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id&&item.ownerId===post.publishedBy&&(item.slot==='page'||item.slot==='post'));if(!asset||asset.status==='deleted')return null;try{return {id:asset.id,mimeType:asset.mimeType,mediaType:asset.mediaType,url:await resolveAssetUrl(asset),byteSize:asset.byteSize};}catch{return null;}}));
  return {...post,media:media.filter(item=>item?.url),author:safeUser(db.users.find(u=>u.id===post.publishedBy))};
}
async function publicStory(story,viewerId,includeViews=false) {
  const mediaIds=Array.isArray(story.mediaIds)&&story.mediaIds.length?story.mediaIds:(story.mediaId?[story.mediaId]:[]);
  const mediaItems=await Promise.all(mediaIds.map(async id=>{
    const asset=(db.mediaAssets||[]).find(item=>item.id===id&&item.ownerId===story.userId&&item.slot==='story'&&item.status!=='deleted');
    if(!asset)return null;
    try{
      const url=await resolveAssetUrl(asset);
      return url?{id:asset.id,mimeType:asset.mimeType,mediaType:asset.mediaType,url,byteSize:asset.byteSize}:null;
    }catch{return null;}
  }));
  const visibleMedia=mediaItems.filter(Boolean),media=visibleMedia[0]||null;
  const views=(db.storyViews||[]).filter(view=>view.storyId===story.id);
  return {...story,media,mediaItems:visibleMedia,soundtrack:await publicSoundtrack(story.soundtrack,viewerId),author:safeUser(db.users.find(u=>u.id===story.userId)),viewedByMe:story.userId===viewerId||views.some(view=>view.viewerId===viewerId),viewCount:views.length,
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
    if (user) await syncRefundedGiftActivity();
    try {
      if (method==='POST' && p==='/api/auth/register') {
        const name=String(input.name||'').trim(), username=normalizeUsername(input.username), email=normalizeEmail(input.email), password=String(input.password||''), phoneNumber=normalizeContactPhone(input.phoneNumber||input.contactPhone||'');
        if (name.length<2 || !validateUsername(username).valid || !validateEmail(email).valid || password.length<10 || password.length>1024) return json(res,400,{error:'Enter a name, username (3+ letters/numbers/underscores), valid email, and password of at least 10 characters.'});
        if(phoneNumber&&!validateContactPhone(phoneNumber).valid)return json(res,400,{error:'Enter a valid international phone number, including + and country code.'});
        if (AUTH_PROVIDER !== 'supabase') {
          if (db.users.some(u=>normalizeEmail(u.email)===email)) return json(res,409,{error:'An account with this email already exists. Log in instead.',code:'email_already_registered'});
          if (db.users.some(u=>u.username===username)) return json(res,409,{error:'That username is already taken. Choose another username.',code:'username_already_taken'});
        }
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

      if(method==='POST'&&p==='/api/auth/magic-link/request'){
        const email=normalizeEmail(input.email);
        if(!validateEmail(email).valid)return json(res,400,{error:'Enter a valid email address.'});
        if(AUTH_PROVIDER!=='supabase')return json(res,503,{error:'Email sign-in links are not configured for this account provider.'});
        const redirectTo=new URL('/',appOrigin(req)).toString();
        try{
          await supabaseRequestMagicLink(email,redirectTo);
        }catch(error){
          if(error.status===429){
            const retryAfterSeconds=Number(error.retryAfterSeconds)||60;
            return json(res,429,{
              error:'Please wait '+retryAfterSeconds+' seconds before requesting another sign-in link.',
              code:'email_rate_limited',retryAfterSeconds
            },{'Retry-After':String(retryAfterSeconds)});
          }
          if(error.status>=500||!error.status)return json(res,503,{error:'Minglora could not send a sign-in link right now. Please try again shortly.'});
          return json(res,502,{error:'Minglora could not request a sign-in link. Please try again.'});
        }
        return json(res,200,{ok:true,message:'If that email belongs to a Minglora account, a secure sign-in link has been requested.'});
      }
      if(method==='POST'&&p==='/api/auth/password/reset/request'){
        const email=normalizeEmail(input.email);
        if(!validateEmail(email).valid)return json(res,400,{error:'Enter a valid email address.'});
        if(AUTH_PROVIDER!=='supabase')return json(res,503,{error:'Password recovery is not configured for this account provider.'});
        const redirectTo=new URL('/?password-recovery=1',appOrigin(req)).toString();
        try{
          await supabaseRequestPasswordReset(email,redirectTo);
        }catch(error){
          if(error.status===429){
            const retryAfterSeconds=Number(error.retryAfterSeconds)||0;
            const projectEmailQuota=/email rate limit exceeded/i.test(error.message);
            const message=projectEmailQuota
              ? "Minglora's email provider has reached its project sending limit. Reliable password recovery requires custom SMTP to be configured."
              : retryAfterSeconds>0
                ? `Please wait ${retryAfterSeconds} seconds before requesting another recovery email.`
                : 'Minglora is temporarily limiting recovery-email requests. Please try again later.';
            return json(res,429,{
              error:message,
              code:projectEmailQuota?'email_provider_quota_exceeded':'email_rate_limited',
              retryAfterSeconds:retryAfterSeconds||null
            },retryAfterSeconds>0?{'Retry-After':String(retryAfterSeconds)}:{});
          }
          if(error.status>=500||!error.status)return json(res,503,{error:'Password recovery is temporarily unavailable. Please try again shortly.'});
          return json(res,502,{error:'Minglora could not hand off the recovery email. Please try again or contact support.'});
        }
        return json(res,200,{ok:true,message:'If that account exists, Minglora has requested a password recovery email.'});
      }
      if(method==='POST'&&p==='/api/auth/password/reset/complete'){
        const accessToken=String(input.accessToken||''),password=String(input.password||'');
        if(password.length<10||password.length>1024)return json(res,400,{error:'Your new password must contain at least 10 characters.'});
        if(AUTH_PROVIDER!=='supabase')return json(res,503,{error:'Password recovery is not configured for this account provider.'});
        await supabaseCompletePasswordReset(accessToken,password);
        return json(res,200,{ok:true,message:'Your password has been updated. Please log in.'});
      }
      if(method==='POST'&&p==='/api/auth/magic-link/complete'){
        const accessToken=String(input.accessToken||'');
        const refreshToken=String(input.refreshToken||'');
        const expiresIn=Number(input.expiresIn)||3600;
        if(accessToken.length<20||accessToken.length>8192||refreshToken.length<10||refreshToken.length>4096){
          return json(res,400,{error:'This sign-in link is incomplete or has expired. Request a new Minglora sign-in link.'});
        }
        if(AUTH_PROVIDER!=='supabase')return json(res,503,{error:'Magic-link sign-in is not configured for this account provider.'});
        const verifiedUser=await supabaseGetUser(accessToken);
        if(!verifiedUser?.id||!verifiedUser?.email)return json(res,401,{error:'Supabase could not validate this sign-in link. Request a new one.'});
        if(!verifiedUser.email_confirmed_at)return json(res,403,{error:'Confirm your email address before signing in with a magic link.'});
        const account=ensureLocalUser(verifiedUser);
        if(account.status==='suspended')return json(res,403,{error:'This Minglora account is suspended. Contact support to appeal.'});
        const authenticated={
          user:verifiedUser,access_token:accessToken,refresh_token:refreshToken,
          expires_in:Number.isFinite(expiresIn)&&expiresIn>0&&expiresIn<=86400?expiresIn:3600,
          token_type:'bearer'
        };
        const factors=await supabaseListFactors(accessToken);
        const verifiedTotp=(factors.factors||[]).find(factor=>factor.factor_type==='totp'&&factor.status==='verified');
        if(verifiedTotp&&tokenAal(accessToken)!=='aal2'){
          const pendingId=uid();
          db.pendingAuth.push({
            id:pendingId,userId:account.id,factorId:verifiedTotp.id,
            authSealed:sealSessionAuth(authenticated),createdAt:now(),
            expiresAt:new Date(Date.now()+5*60*1000).toISOString(),
            userAgent:String(req.headers['user-agent']||'').slice(0,240)
          });
          await saveStore();
          return json(res,200,{mfaRequired:true,challengeId:pendingId,message:'Enter the code from your authenticator app to finish signing in.'});
        }
        if(account.status==='deactivated'){
          account.status='active';
          await supabaseUpdateUserMetadata(accessToken,{account_status:'active'});
        }
        const sessionCookie=await createAppSession(account,authenticated,req);
        await saveStore();
        return json(res,200,{
          user:safeUser(account,account.id),
          mfaEnrollmentRequired:isDesignatedCreatorHubAdmin(account)&&!verifiedTotp
        },{'Set-Cookie':sessionCookie});
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
          let verifiedTotp=null;
          if(accessToken){
            const factors=await supabaseListFactors(accessToken);
            verifiedTotp=(factors.factors||[]).find(factor=>factor.factor_type==='totp'&&factor.status==='verified')||null;
            if(verifiedTotp&&tokenAal(accessToken)!=='aal2'){
              const pendingId=uid();
              db.pendingAuth.push({id:pendingId,userId:signedInUser.id,factorId:verifiedTotp.id,authSealed:sealSessionAuth(authenticated),createdAt:now(),expiresAt:new Date(Date.now()+5*60*1000).toISOString(),userAgent:String(req.headers['user-agent']||'').slice(0,240)});
              await saveStore();clearLoginFailures(rate.key);
              return json(res,200,{mfaRequired:true,challengeId:pendingId,message:'Enter the code from your authenticator app to finish signing in.'});
            }
          }
          if(signedInUser.status==='deactivated'){signedInUser.status='active';await supabaseUpdateUserMetadata(accessToken,{account_status:'active'});await saveStore();}
          const sessionCookie=await createAppSession(signedInUser,authenticated,req);clearLoginFailures(rate.key);
          return json(res,200,{
            user:safeUser(signedInUser,signedInUser.id),
            mfaEnrollmentRequired:isDesignatedCreatorHubAdmin(signedInUser)&&!verifiedTotp
          },{'Set-Cookie':sessionCookie});
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
      if (method==='POST' && p==='/api/auth/logout') { const sid=cookie(req,'sid'); if(sid){const id=decodeURIComponent(sid).split('.')[0]; db.sessions=db.sessions.filter(s=>s.id!==id); await saveStore();} return json(res,200,{ok:true},{'Set-Cookie':clearAppSessionCookie()}); }
      if (method==='GET' && p==='/api/auth/me') return json(res,200,{user:user?safeUser(user,user.id):null});
      requireAuth(user);
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
          sound:SOUND_AUDIO_MIME_TYPES,
          story:['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','video/quicktime'],
          group:['image/jpeg','image/png','image/webp','video/mp4'],
          page:['image/jpeg','image/png','image/webp','video/mp4'],
          message:['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/ogg','audio/webm','application/pdf','text/plain','text/csv','application/zip','application/x-zip-compressed','application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation'],
          ringtone:Object.keys(CALL_RINGTONE_MIME_TYPES)
        };
        const limits={avatar:10*1024*1024,cover:20*1024*1024,post:500*1024*1024,sound:50*1024*1024,story:200*1024*1024,group:250*1024*1024,page:250*1024*1024,message:100*1024*1024,ringtone:CALL_RINGTONE_MAX_BYTES};
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
        return json(res,200,{ok:true,message:'Your Minglora account is deactivated. Sign in again to reactivate it.'},{'Set-Cookie':clearAppSessionCookie()});
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
      if(method==='GET'&&p==='/api/settings')return json(res,200,{settings:getUserSettings(user),account:{id:user.id,name:user.name,username:user.username,email:user.email||''}});
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
      if(method==='GET'&&p==='/api/admin/access'){
        const designatedCreatorHubAdmin = isDesignatedCreatorHubAdmin(user);
        const canAccess = designatedCreatorHubAdmin && isModerator(user,req) && hasActiveReviewerSession(user);
        return json(res,200,{
          canAccess,
          setupRequired: designatedCreatorHubAdmin && !canAccess,
          mfaVerified: canAccess
        });
      }

      if(method==='GET'&&p==='/api/admin/creator-earnings'){
        const adminEmail=normalizeEmail(user?.email||'');
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(!user||user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified Creator Hub administrator can view creator gift revenue.'});
        }
        const report=await requestSupabaseState('economy_admin_creator_earnings',{
          adminUserId:user.id,adminEmail
        });
        return json(res,200,report);
      }
      if(method==='PUT'&&p==='/api/admin/platform-payout-account'){
        const adminEmail=normalizeEmail(user?.email||'');
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(!user||user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified Creator Hub administrator can change the platform PayPal destination.'});
        }
        const paypalEmail=String(input.paypalEmail||'').trim().toLowerCase();
        const paypalEmailPattern=/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$/i;
        if(paypalEmail.length>127||!paypalEmailPattern.test(paypalEmail)){
          return json(res,400,{error:'Enter a valid PayPal receiving email address (127 characters or fewer).'});
        }
        const account=await requestSupabaseState('economy_admin_platform_payout_account_set',{
          adminUserId:user.id,adminEmail,paypalEmail
        });
        return json(res,200,account);
      }

      if(method==='POST'&&p==='/api/admin/platform-payouts'){
        const adminEmail=normalizeEmail(user?.email||'');
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(!user||user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified Creator Hub administrator can withdraw Minglora platform earnings.'});
        }
        const amountMinor=Number(input.amountMinor);
        if(!Number.isSafeInteger(amountMinor)||amountMinor<100||amountMinor>2000000){
          return json(res,400,{error:'Enter a withdrawal from USD 1.00 to USD 20,000.00 per PayPal payout.'});
        }
        const requestId=String(input.requestId||'').trim();
        const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if(!uuidPattern.test(requestId)){
          return json(res,400,{error:'A valid unique withdrawal request reference is required. Retry from the withdrawal form.'});
        }
        const reservation=await requestSupabaseState('economy_admin_platform_payout_request',{
          adminUserId:user.id,adminEmail,amountMinor,requestId
        });
        const reservedPayout=reservation?.payout||{};
        const payoutId=String(reservedPayout.payoutId||'');
        if(!uuidPattern.test(payoutId)){
          return json(res,503,{error:'Minglora reserved the withdrawal but did not return its payout reference. Do not submit it again; contact the owner administrator for reconciliation.'});
        }
        if(reservedPayout.status==='failed'){
          return json(res,409,{error:'This withdrawal request was previously marked Failed. No payment was sent; start a new withdrawal after reviewing the history.'});
        }
        if(reservedPayout.status==='paid'){
          return json(res,200,{ok:true,alreadyCompleted:true,payoutId,status:'paid',amountMinor,currency:'USD'});
        }
        if(reservedPayout.status==='processing'&&reservedPayout.paypalBatchId){
          return json(res,202,{ok:true,alreadySubmitted:true,payoutId,batchId:reservedPayout.paypalBatchId,status:'processing',amountMinor,currency:'USD',paypalEmail:reservedPayout.paypalEmail});
        }
        try{
          const payout=await paypalRequest('/v1/payments/payouts','POST',{
            sender_batch_header:{
              sender_batch_id:'MGLPLT'+payoutId.replace(/-/g,'').slice(0,24),
              email_subject:'Your Minglora platform share withdrawal',
              email_message:'Minglora has submitted your platform share withdrawal to PayPal.'
            },
            items:[{
              recipient_type:'EMAIL',
              amount:{value:(amountMinor/100).toFixed(2),currency:'USD'},
              receiver:String(reservation.payout.paypalEmail||''),
              note:'Minglora platform earnings · 50% platform share',
              sender_item_id:payoutId.replace(/-/g,'').slice(0,30)
            }]
          },'minglora-platform-payout-'+payoutId);
          const batchId=String(payout.batch_header?.payout_batch_id||'');
          if(!batchId){
            throw Object.assign(new Error('PayPal did not return a payout batch reference. The amount remains reserved until this submission is reconciled; do not retry it.'),{status:503,code:'PLATFORM_PAYOUT_BATCH_UNCONFIRMED'});
          }
          await requestSupabaseState('economy_admin_platform_payout_update',{
            adminUserId:user.id,adminEmail,payoutId,status:'processing',paypalBatchId:batchId
          });
          return json(res,202,{
            ok:true,payoutId,batchId,status:'processing',amountMinor,currency:'USD',
            paypalEmail:reservation.payout.paypalEmail
          });
        }catch(error){
          if(error?.paypalNoSubmission===true){
            try{
              await requestSupabaseState('economy_admin_platform_payout_update',{
                adminUserId:user.id,adminEmail,payoutId,status:'failed',
                failureCode:error.code||'PAYPAL_REJECTED',
                failureMessage:String(error.message||'PayPal rejected the withdrawal.').slice(0,500)
              });
            }catch(releaseError){
              console.error('[Minglora platform payouts] PayPal rejected withdrawal but reservation release failed.',{
                payoutId,providerCode:error.code||null,
                releaseMessage:String(releaseError?.message||releaseError).slice(0,160)
              });
              throw Object.assign(new Error('PayPal rejected the withdrawal, but Minglora could not release its reservation. Do not retry; contact the owner administrator.'),{status:503,code:'PLATFORM_PAYOUT_RESERVATION_RELEASE_FAILED'});
            }
            throw Object.assign(new Error('PayPal did not submit this withdrawal. Minglora marked it Failed and released the reserved amount. Check the receiving PayPal email and Payouts permission before trying again.'),{status:502,code:'PAYPAL_PLATFORM_PAYOUT_REJECTED'});
          }
          throw error;
        }
      }

      const canManageLivePro = () => isDesignatedCreatorHubAdmin(user) && isModerator(user,req) && hasActiveReviewerSession(user);
      const liveProGrantFor = memberId => (db.liveProGrants || []).find(grant =>
        grant.userId === memberId && grant.status === 'active' &&
        (!grant.expiresAt || new Date(grant.expiresAt).getTime() > Date.now())
      ) || null;
      const hasLivePro = () => Boolean(canManageLivePro() || liveProGrantFor(user.id));
      if (method === 'GET' && p === '/api/live-pro/access') {
        const adminAccess = canManageLivePro();
        const grant = adminAccess ? null : liveProGrantFor(user.id);
        return json(res,200,{
          hasAccess: adminAccess || Boolean(grant),
          source: adminAccess ? 'designated_admin' : grant ? 'admin_grant' : 'none',
          grantedAt: grant?.grantedAt || null,
          expiresAt: grant?.expiresAt || null,
          canManageAccess: adminAccess,
          capabilities: [
            {id:'live-studio',label:'LIVE Studio',description:'Camera, microphone and host screen sharing.'},
            {id:'multi-guest',label:'Multi-guest stage',description:'Host-approved guest stage with up to eight guest seats.'},
            {id:'room-moderators',label:'Room moderators',description:'Assign up to ten room-scoped chat moderators.'},
            {id:'live-chat',label:'LIVE chat controls',description:'Group chat, pinned comments and host moderation.'},
            {id:'broadcast-modes',label:'Broadcast modes',description:'Video + Audio, Audio Only, Mobile Gaming and LIVE Studio.'},
            {id:'creator-engagement',label:'Creator engagement',description:'LIVE gifts, room themes and Fan Club tools.'}
          ]
        });
      }
      if (method === 'GET' && p === '/api/live-pro/dashboard') {
        if (!hasLivePro()) return json(res,403,{error:'LIVE Pro access is required for this creator dashboard.'});
        const sessions = (db.liveSessions || []).filter(session => session.hostId === user.id)
          .sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        const durationOf = session => {
          const start = new Date(session.createdAt || session.startedAt || 0).getTime();
          const end = session.status === 'live' ? Date.now() : new Date(session.endedAt || session.updatedAt || session.createdAt || 0).getTime();
          return Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start ? Math.round((end-start)/60000) : 0;
        };
        const participantRows = db.liveParticipants || [];
        return json(res,200,{
          stats:{
            totalBroadcasts:sessions.length,
            activeBroadcasts:sessions.filter(session => session.status === 'live').length,
            totalMinutes:sessions.reduce((sum,session) => sum + durationOf(session),0),
            recordedParticipantJoins:participantRows.filter(participant => sessions.some(session => session.id === participant.sessionId)).length
          },
          history:sessions.slice(0,20).map(session => ({
            id:session.id,title:session.title || 'Untitled LIVE',status:session.status,
            mode:session.liveMode || (session.broadcastType === 'audio_only' ? 'audio_only' : 'video_audio'),
            startedAt:session.createdAt || session.startedAt || null,endedAt:session.endedAt || null,
            durationMinutes:durationOf(session),
            participantJoins:participantRows.filter(participant => participant.sessionId === session.id).length
          }))
        });
      }
      if (p.startsWith('/api/admin/live-pro/')) {
        if (!canManageLivePro()) return json(res,403,{error:'The designated Creator Hub administrator must verify the authenticator session before managing LIVE Pro access.'});
        if (method === 'GET' && p === '/api/admin/live-pro/members') {
          const search = String(url.searchParams.get('search') || '').trim().toLowerCase();
          const members = (db.users || [])
            .filter(member => !['banned','suspended','deactivated','deleted'].includes(String(member.status || '').toLowerCase()))
            .filter(member => !search || [member.username,member.name,member.displayName,member.email].some(value => String(value || '').toLowerCase().includes(search)))
            .sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .slice(0,50)
            .map(member => ({
              id:member.id,displayName:member.name || member.displayName || member.username || 'Minglora member',
              username:member.username || '',email:member.email || '',
              hasLivePro:Boolean(liveProGrantFor(member.id) || (isDesignatedCreatorHubAdmin(member) && member.id === user.id))
            }));
          return json(res,200,{members});
        }
        if (method === 'GET' && p === '/api/admin/live-pro/grants') {
          const grants = (db.liveProGrants || [])
            .filter(grant => grant.status === 'active' && (!grant.expiresAt || new Date(grant.expiresAt).getTime() > Date.now()))
            .map(grant => {
              const member = (db.users || []).find(item => item.id === grant.userId);
              return {
                id:grant.id,userId:grant.userId,status:grant.status,grantedAt:grant.grantedAt,
                expiresAt:grant.expiresAt || null,durationDays:grant.durationDays,
                displayName:member?.name || member?.displayName || member?.username || 'Unavailable account',
                username:member?.username || '',email:member?.email || ''
              };
            })
            .sort((a,b) => new Date(b.grantedAt || 0) - new Date(a.grantedAt || 0));
          return json(res,200,{grants});
        }
        if (method === 'POST' && p === '/api/admin/live-pro/grants') {
          const memberId = String(input.userId || '').trim();
          const durationDays = Number(input.durationDays);
          if (!memberId || !Number.isInteger(durationDays) || ![0,30,90,365].includes(durationDays)) {
            return json(res,400,{error:'Choose a real member account and a valid LIVE Pro duration.'});
          }
          const member = (db.users || []).find(item => item.id === memberId);
          if (!member || ['banned','suspended','deactivated','deleted'].includes(String(member.status || '').toLowerCase())) {
            return json(res,404,{error:'That active Minglora member account could not be found.'});
          }
          db.liveProGrants = db.liveProGrants || [];
          db.liveProGrants.filter(grant => grant.userId === memberId && grant.status === 'active').forEach(grant => {
            grant.status = 'replaced';grant.revokedAt = now();grant.revokedBy = user.id;
          });
          const grantedAt = now();
          const expiresAt = durationDays ? new Date(Date.now() + durationDays * 86400000).toISOString() : null;
          const grant = {
            id:uid(),userId:memberId,status:'active',grantedBy:user.id,grantedAt,expiresAt,durationDays,
            reason:String(input.reason || '').trim().slice(0,500)
          };
          db.liveProGrants.push(grant);
          db.liveProAudit = db.liveProAudit || [];
          db.liveProAudit.push({id:uid(),action:'grant',userId:memberId,actorId:user.id,grantId:grant.id,createdAt:grantedAt,expiresAt});
          await saveStore();
          return json(res,201,{
            ok:true,
            grant:{
              id:grant.id,userId:grant.userId,status:grant.status,grantedAt:grant.grantedAt,
              expiresAt:grant.expiresAt,durationDays:grant.durationDays,
              displayName:member.name || member.displayName || member.username || 'Minglora member',
              username:member.username || '',email:member.email || ''
            }
          });
        }
        const revokeMatch = p.match(/^\/api\/admin\/live-pro\/grants\/([^/]+)$/);
        if (method === 'DELETE' && revokeMatch) {
          const memberId = decodeURIComponent(revokeMatch[1]);
          const active = (db.liveProGrants || []).filter(grant => grant.userId === memberId && grant.status === 'active');
          if (!active.length) return json(res,404,{error:'No active LIVE Pro grant was found for that account.'});
          const revokedAt = now();
          active.forEach(grant => {grant.status = 'revoked';grant.revokedAt = revokedAt;grant.revokedBy = user.id;});
          db.liveProAudit = db.liveProAudit || [];
          db.liveProAudit.push({id:uid(),action:'revoke',userId:memberId,actorId:user.id,createdAt:revokedAt});
          await saveStore();
          return json(res,200,{ok:true,revoked:active.length});
        }
        return json(res,404,{error:'LIVE Pro administration route not found.'});
      }

      if(method==='GET'&&p==='/api/moderation/access')return json(res,200,{canModerate:isModerator(user,req)});
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
        return json(res,200,{ok:true,current:target.id===currentSession?.id},target.id===currentSession?.id?{'Set-Cookie':clearAppSessionCookie()}:{});
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
        const existingFactors=await supabaseListFactors(auth.access_token);for(const factor of existingFactors.factors||[]){if(factor.factor_type==='totp'&&factor.status==='unverified'&&factor.friendly_name==='Minglora authenticator')await supabaseUnenrollFactor(auth.access_token,factor.id);}const result=await supabaseEnrollTotp(auth.access_token,'Minglora authenticator');
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
          return json(res,200,{ok:true,reauthenticationRequired:true,message:'Authenticator removed. Sign in again to renew your security session.'},{'Set-Cookie':clearAppSessionCookie()});
        }
      }
      if(method==='POST'&&p==='/api/reports'){
        const targetType=String(input.targetType||''),targetId=String(input.targetId||''),category=String(input.category||''),details=String(input.details||'').trim();
        const allowedTypes=['user','post','comment','story','group','page','message'];
        const allowedCategories=['spam','harassment','hate','nudity','violence','scam','impersonation','copyright','privacy','other'];
        if(!allowedTypes.includes(targetType)||!targetId||!allowedCategories.includes(category)||details.length>2000)return json(res,400,{error:'Choose a report type, reason and optional details (maximum 2000 characters).'});
        let exists=false;
        if(targetType==='user')exists=db.users.some(item=>item.id===targetId&&item.id!==user.id);
        if(targetType==='post')exists=Boolean(findReportedPost(targetId));
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
        if(!isModerator(user,req))return json(res,403,{error:'Moderator access is required.'});
        const status=String(url.searchParams.get('status')||'open');
        const reports=(db.reports||[]).filter(item=>status==='all'||item.status===status).map(item=>({
          ...item,reporter:safeUser(db.users.find(u=>u.id===item.reporterId)),
          targetOwner:safeUser((item.targetType==='user'?db.users.find(u=>u.id===item.targetId):item.targetType==='post'?db.users.find(u=>u.id===findReportedPost(item.targetId)?.ownerId):item.targetType==='story'?db.users.find(u=>u.id===(db.stories||[]).find(story=>story.id===item.targetId)?.userId):null))
        }));
        return json(res,200,{reports});
      }
      const moderationReportMatch=p.match(/^\/api\/moderation\/reports\/([^/]+)$/);
      if((method==='PATCH'||method==='DELETE')&&moderationReportMatch){
        if(!isModerator(user,req))return json(res,403,{error:'Moderator access is required.'});
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
        if(isModerator(user,req)&&url.searchParams.get('scope')==='all'){
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
        if(ticket.userId!==user.id&&!isModerator(user,req))return json(res,403,{error:'This support conversation belongs to another member.'});
        const message=String(input.message||'').trim();if(message.length<1||message.length>5000)return json(res,400,{error:'Support message must contain 1–5000 characters.'});
        if(ticket.status==='closed'&&!isModerator(user,req))return json(res,409,{error:'This ticket is closed. Create a new ticket to contact support.'});
        const item={id:uid(),ticketId:ticket.id,senderId:user.id,message,createdAt:now(),sender:safeUser(user)};
        db.supportMessages.push(item);ticket.updatedAt=now();if(isModerator(user,req))ticket.status='waiting_for_member';else ticket.status='open';await saveStore();
        return json(res,201,{message:item,ticket});
      }
      const supportTicketMatch=p.match(/^\/api\/support\/tickets\/([^/]+)$/);
      if(method==='PATCH'&&supportTicketMatch){
        const ticket=(db.supportTickets||[]).find(item=>item.id===supportTicketMatch[1]);if(!ticket)return json(res,404,{error:'Support ticket not found.'});
        if(ticket.userId!==user.id&&!isModerator(user,req))return json(res,403,{error:'This support ticket belongs to another member.'});
        const status=String(input.status||'');
        if(isModerator(user,req)&&['open','waiting_for_member','in_progress','closed'].includes(status))ticket.status=status;
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
              host: { ...safeUser(db.users.find(member => member.id === session.hostId), user.id), following: (db.follows || []).some(edge => edge.followerId === user.id && edge.followedId === session.hostId) },
              viewerCount: participants.filter(participant => participant.identity !== session.hostId).length,
              viewerCountVerified: true,
              likeCount: Math.max(0, Number(session.likeCount) || 0),
              fanClubMemberCount: countActiveLiveFanClubMembers(db, session.hostId)
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
        const selectedVisibility = String(input.visibility || 'public');
        const liveMode = String(input.liveMode || (input.broadcastType === 'audio_only' ? 'audio_only' : 'video_audio'));
        const broadcastType = broadcastTypeForLiveMode(liveMode);
        const setupResult = normalizeLiveSettings(input.liveSettings || {});
        if (!title || title.length > 120 || !['public', 'friends', 'private'].includes(selectedVisibility) ||
            !LIVE_MODES.includes(liveMode) || !setupResult.valid) {
          return json(res, 400, { error: !setupResult.valid ? setupResult.error : 'Enter a LIVE title, choose an audience and select a supported LIVE mode.' });
        }
        const liveSettings = setupResult.settings;
        const visibility = liveSettings.practiceMode
          ? 'private'
          : liveSettings.audienceControl ? selectedVisibility : 'public';
        const id = uid();
        const roomName = 'minglora-' + id.replace(/-/g, '');
        const publishSources = getLivePublishSourceNames(liveMode, 'host', broadcastType)
          .map(source => LIVEKIT_TRACK_SOURCE[source]);
        const liveKit = await createLiveKitToken({
          identity: user.id,
          name: user.name,
          roomName,
          canPublish: true,
          publishSources
        });
        const requestedLiveTheme = String(input.liveTheme || getUserSettings(user).preferences.liveRoomTheme);
        const liveTheme = LIVE_ROOM_THEMES.includes(requestedLiveTheme) ? requestedLiveTheme : DEFAULT_SETTINGS.preferences.liveRoomTheme;
        ensureLiveFanClubCollections(db);
        const session = {
          id, roomName, hostId: user.id, title, visibility, broadcastType, liveMode, liveSettings, liveLayout: 'full-screen',
          description: liveSettings.aboutMe, liveTheme, likeCount: 0, status: 'live', createdAt: now(), endedAt: null
        };
        await requestSupabaseState('live_broadcast_create',{
          id,hostId:user.id,title,audience:visibility,broadcastType,roomRef:roomName,
          description:liveSettings.aboutMe.slice(0,2000)
        });
        db.liveSessions = db.liveSessions || [];
        db.liveSessions.unshift(session);
        if(visibility==='public'){
          const followerIds=[...new Set((db.follows||[]).filter(edge=>edge.followedId===user.id).map(edge=>edge.followerId))];
          for(const followerId of followerIds)if(!blockedBetween(followerId,user.id))notify(followerId,user.id,'live',user.name+' is LIVE: '+title,{liveSessionId:id});
        }
        await saveStore();
        return json(res, 201, { session, liveKit: { ...liveKit, role: 'host' } });
      }
      const liveRoomSettingsMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/settings$/);
      if (method === 'PATCH' && liveRoomSettingsMatch) {
        const session = (db.liveSessions || []).find(item => item.id === liveRoomSettingsMatch[1] && item.status === 'live');
        if (!session || session.hostId !== user.id) return json(res, 403, { error: 'Only the LIVE host can change room settings.' });
        const patch = input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings) ? input.settings : null;
        if (!patch) return json(res, 400, { error: 'Send LIVE settings as an object.' });
        const normalized = normalizeLiveSettings({ ...(session.liveSettings || {}), ...patch });
        if (!normalized.valid) return json(res, 400, { error: normalized.error });

        let guestStageRemoved = 0;
        let guestStageRemovalFailures = 0;
        const disablingGuestStage = patch.guestStageEnabled === false && session.liveSettings?.guestStageEnabled !== false;
        if (disablingGuestStage) {
          const requests = (db.liveSpeakerRequests || []).filter(item =>
            item.sessionId === session.id && ['requested', 'accepted', 'connected'].includes(item.status)
          );
          for (const request of requests) {
            if (request.status === 'requested') {
              await requestSupabaseState('live_speaker_request_review', {
                broadcastId: session.id, hostId: user.id, speakerId: request.userId, decision: 'reject'
              });
              request.status = 'rejected';
              request.reviewedAt = now();
              continue;
            }

            // An approved speaker who has not connected does not need a LiveKit kick.
            // Mark every approved request as left so reconnecting clients are returned
            // to the audience role instead of being stuck with an obsolete approval.
            let liveKitRemovalFailed = false;
            if (request.status === 'connected') {
              try {
                await removeLiveKitParticipant(session.roomName, request.userId);
              } catch (error) {
                liveKitRemovalFailed = true;
                guestStageRemovalFailures++;
                console.error('[Minglora LIVE] Guest-stage shutdown could not immediately disconnect one speaker.', {
                  sessionId: session.id, message: String(error?.message || 'LiveKit removal failed').slice(0, 180)
                });
              }
            }

            await requestSupabaseState('live_speaker_mark_left', { broadcastId: session.id, userId: request.userId });
            const leftAt = now();
            request.status = 'left';
            request.leftAt = leftAt;
            const participant = (db.liveParticipants || []).find(item => item.sessionId === session.id && item.userId === request.userId);
            if (participant) { participant.status = 'left'; participant.leftAt = leftAt; }
            guestStageRemoved++;
            if (liveKitRemovalFailed) {
              console.warn('[Minglora LIVE] Guest state is closed; the client will be instructed to disconnect.', {
                sessionId: session.id, userId: request.userId
              });
            }
          }
        }

        session.liveSettings = normalized.settings;
        if (normalized.settings.practiceMode) session.visibility = 'private';
        else if (normalized.settings.audienceControl === false) session.visibility = 'public';
        await saveStore();
        return json(res, 200, {
          liveSettings: session.liveSettings,
          visibility: session.visibility,
          guestStage: disablingGuestStage ? {
            enabled: false, removed: guestStageRemoved, removalFailures: guestStageRemovalFailures
          } : undefined
        });
      }
      const liveLayoutMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/layout$/);
      if (liveLayoutMatch) {
        if (method !== 'PATCH') return json(res, 405, { error: 'Use PATCH to update the LIVE screen layout.' });
        const session = (db.liveSessions || []).find(item => item.id === liveLayoutMatch[1] && item.status === 'live');
        if (!session || blockedBetween(user.id, session.hostId)) return json(res, 404, { error: 'LIVE session not found.' });
        if (session.hostId !== user.id) return json(res, 403, { error: 'Only the LIVE host can change the screen layout.' });
        const layout = String(input.layout || '');
        if (!LIVE_SCREEN_LAYOUTS.includes(layout)) return json(res, 400, { error: 'Choose a supported LIVE screen layout.' });
        session.liveLayout = layout;
        await saveStore();
        return json(res, 200, { ok: true, liveLayout: session.liveLayout });
      }
      const liveModeratorsMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/moderators(?:\/([^/]+))?$/);
      if (liveModeratorsMatch) {
        const session = (db.liveSessions || []).find(item => item.id === liveModeratorsMatch[1] && item.status === 'live');
        if (!session || blockedBetween(user.id, session.hostId)) return json(res, 404, { error: 'LIVE session not found.' });
        if (session.liveSettings?.manageModerators === false) return json(res, 403, { error: 'The LIVE host has disabled moderator management for this room.' });
        const roomModerators = () => Array.isArray(session.liveModerators) ? session.liveModerators : [];
        if (method === 'GET') {
          if (session.hostId !== user.id && !roomModerators().includes(user.id)) {
            return json(res, 403, { error: 'Only the LIVE host or an assigned moderator can view room moderators.' });
          }
          const moderators = roomModerators().map(id => db.users.find(member => member.id === id))
            .filter(Boolean).map(member => safeUser(member, user.id));
          return json(res, 200, { moderators, count: moderators.length, limit: 10 });
        }
        if (method === 'POST') {
          if (session.hostId !== user.id) return json(res, 403, { error: 'Only the LIVE host can assign moderators.' });
          const requestedUsername = normalizeUsername(input.username || input.memberUsername || '');
          const requestedId = String(input.userId || '').trim();
          const target = db.users.find(member =>
            (requestedId && member.id === requestedId) ||
            (requestedUsername && normalizeUsername(member.username) === requestedUsername)
          );
          if (!target || target.status === 'suspended') return json(res, 404, { error: 'Choose an active Minglora member to moderate this LIVE.' });
          if (target.id === session.hostId) return json(res, 400, { error: 'The LIVE host already controls this room.' });
          if (blockedBetween(user.id, target.id)) return json(res, 409, { error: 'This member cannot be assigned because the accounts are blocked.' });
          session.liveModerators = roomModerators();
          if (session.liveModerators.includes(target.id)) {
            return json(res, 200, { moderator: safeUser(target, user.id), moderators: session.liveModerators.map(id => safeUser(db.users.find(member => member.id === id), user.id)).filter(Boolean) });
          }
          if (session.liveModerators.length >= 10) return json(res, 409, { error: 'This LIVE already has the maximum of 10 moderators.' });
          session.liveModerators.push(target.id);
          await saveStore();
          notify(target.id, user.id, 'live_moderator', 'You were assigned as a moderator for ' + String(session.title || 'a Minglora LIVE').slice(0, 120) + '.');
          return json(res, 201, {
            moderator: safeUser(target, user.id),
            moderators: session.liveModerators.map(id => safeUser(db.users.find(member => member.id === id), user.id)).filter(Boolean),
            count: session.liveModerators.length
          });
        }
        if (method === 'DELETE' && liveModeratorsMatch[2]) {
          if (session.hostId !== user.id) return json(res, 403, { error: 'Only the LIVE host can remove assigned moderators.' });
          const memberId = decodeURIComponent(liveModeratorsMatch[2]);
          if (!roomModerators().includes(memberId)) return json(res, 404, { error: 'This member is not an assigned LIVE moderator.' });
          session.liveModerators = roomModerators().filter(id => id !== memberId);
          await saveStore();
          return json(res, 200, {
            removed: true,
            moderators: session.liveModerators.map(id => safeUser(db.users.find(member => member.id === id), user.id)).filter(Boolean),
            count: session.liveModerators.length
          });
        }
        return json(res, 405, { error: 'This LIVE moderator action is not supported.' });
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
          .filter(item => item.sessionId === session.id && item.role === 'guest')
          .map(item => ({ ...item, user: safeUser(db.users.find(member => member.id === item.userId), user.id) }));
        if (session.liveSettings?.prioritizeGifters === true) requests.sort((a, b) =>
          Number(b.user?.gifterBadge?.level || 0) - Number(a.user?.gifterBadge?.level || 0) ||
          new Date(a.requestedAt || 0) - new Date(b.requestedAt || 0)
        );
        return json(res, 200, { requests });
      }
      if (liveSpeakerRequestsMatch && method === 'POST') {
        const session = (db.liveSessions || []).find(item => item.id === liveSpeakerRequestsMatch[1] && item.status === 'live');
        if (!session || session.hostId === user.id || blockedBetween(user.id, session.hostId)) return json(res, 404, { error: 'LIVE session not found.' });
        const allowed = session.visibility === 'public' || (session.visibility === 'friends' && isFriend(user.id, session.hostId));
        if (!allowed) return json(res, 404, { error: 'LIVE session not found.' });
        if (session.liveSettings?.guestStageEnabled === false) return json(res, 403, { error: 'The host has disabled the guest stage for this LIVE.' });
        if (session.liveSettings?.allowGuestRequests === false) return json(res, 403, { error: 'The host is not accepting guest speaker requests right now.' });
        if (session.liveSettings?.allowCoHost === false) return json(res, 403, { error: 'The host has disabled co-host and guest stage requests for this LIVE.' });
        const joined = (db.liveParticipants || []).some(item => item.sessionId === session.id && item.userId === user.id && !item.leftAt);
        if (!joined) return json(res, 409, { error: 'Join the LIVE room before requesting a speaker place.' });
        db.liveSpeakerRequests = db.liveSpeakerRequests || [];
        const previous = db.liveSpeakerRequests.find(item => item.sessionId === session.id && item.userId === user.id);
        if (previous && ['requested', 'accepted'].includes(previous.status)) return json(res, 200, { request: previous });
        const autoAccepted = session.liveSettings?.autoAcceptRequests === true;
        if (autoAccepted) {
          const activeSpeakers = db.liveSpeakerRequests.filter(item => item.sessionId === session.id && ['accepted', 'connected'].includes(item.status)).length;
          if (activeSpeakers >= 8) return json(res, 409, { error: 'The eight guest speaker places are full.' });
        }
        await requestSupabaseState('live_speaker_request', { broadcastId: session.id, userId: user.id });
        const requestedAt = now();
        const request = { id: uid(), sessionId: session.id, userId: user.id, role: 'guest', status: autoAccepted ? 'accepted' : 'requested', requestedAt, acceptedAt: autoAccepted ? requestedAt : null, connectedAt: null, leftAt: null };
        if (previous) Object.assign(previous, request); else db.liveSpeakerRequests.unshift(request);
        await saveStore();
        return json(res, 201, { request, autoAccepted });
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
        if (speakerId === user.id || !['accept', 'reject', 'remove'].includes(decision)) return json(res, 400, { error: 'Choose a valid speaker stage action.' });
        const request = (db.liveSpeakerRequests || []).find(item => item.sessionId === session.id && item.userId === speakerId &&
          (decision === 'remove' ? ['accepted', 'connected'].includes(item.status) : item.status === 'requested'));
        if (!request) return json(res, 404, { error: decision === 'remove' ? 'This member is not an active approved speaker.' : 'This speaker request is no longer pending.' });
        if (decision === 'remove') {
          let removal;
          try {
            removal = await removeLiveKitParticipant(session.roomName, speakerId);
          } catch (error) {
            console.error('[Minglora LIVE] Could not remove an approved guest from the stage.', {
              sessionId: session.id, message: String(error?.message || 'LiveKit removal failed').slice(0, 180)
            });
            return json(res, 503, { error: 'Minglora could not remove this guest from the LIVE stage. Try again.' });
          }
          await requestSupabaseState('live_speaker_mark_left', { broadcastId: session.id, userId: speakerId });
          const leftAt = now();
          request.status = 'left';
          request.leftAt = leftAt;
          const participant = (db.liveParticipants || []).find(item => item.sessionId === session.id && item.userId === speakerId);
          if (participant) { participant.status = 'left'; participant.leftAt = leftAt; }
          await saveStore();
          return json(res, 200, { request, removed: true, wasConnected: Boolean(removal?.wasConnected) });
        }
        if (decision === 'accept') {
          if (session.liveSettings?.guestStageEnabled === false) return json(res, 403, { error: 'The host has disabled the guest stage for this LIVE.' });
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
        if (role === 'guest' && session.liveSettings?.guestStageEnabled === false) return json(res, 403, { error: 'The host has disabled the guest stage for this LIVE.' });
        const publishSourceNames = getLivePublishSourceNames(session.liveMode, role, session.broadcastType, session.liveSettings || {});
        const publishSources = publishSourceNames
          ? publishSourceNames.map(source => LIVEKIT_TRACK_SOURCE[source])
          : null;
        const liveKit = await createLiveKitToken({
          identity: user.id,
          name: user.name,
          roomName: session.roomName,
          canPublish: role === 'host' || role === 'guest',
          canPublishData: true,
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
        if (role === 'guest' && session.liveSettings?.guestStageEnabled === false) return json(res, 403, { error: 'The host has disabled the guest stage for this LIVE.' });
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
      if(method==='GET'&&p==='/api/coins/promotional-gift-wallet'){
        return json(res,200,await requestSupabaseState('economy_promotional_gift_wallet',{userId:user.id}));
      }
      if(method==='GET'&&p==='/api/coins/wallet'){
        return json(res,200,await requestSupabaseState('economy_wallet',{userId:user.id}));
      }
      if(method==='POST'&&p==='/api/admin/coins/owner-issuance'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrative account can issue owner Coins.'});
        }
        const amountCoins=Number(input.amountCoins);
        const requestId=String(input.requestId||'').trim();
        const note=String(input.note||'Creator Hub administrative owner Coin issuance').trim().slice(0,240);
        const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if(!Number.isSafeInteger(amountCoins)||amountCoins<1){
          return json(res,400,{error:'Enter a positive whole-number amount up to 9,007,199,254,740,991 Coins.'});
        }
        if(!uuidPattern.test(requestId)){
          return json(res,400,{error:'A valid issuance request reference is required. Retry the request.'});
        }
        const issuance=await requestSupabaseState('economy_owner_issuance',{
          ownerId:user.id,ownerEmail:adminEmail,amountCoins,requestId,note
        });
        const wallet=await requestSupabaseState('economy_wallet',{userId:user.id});
        return json(res,200,{ok:true,recipientEmail:adminEmail,issuance,wallet});
      }
      if(method==='GET'&&p==='/api/admin/paypal-readiness'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrator can view PayPal readiness.'});
        }
        const cfg=paypalConfig();
        let oauthAuthenticated=false,oauthError=null;
        if(cfg.configured){
          try{await paypalToken();oauthAuthenticated=true;}
          catch(error){oauthError=String(error?.message||'PayPal authentication failed.').slice(0,180);}
        }
        return json(res,200,{
          mode:cfg.mode,production:process.env.NODE_ENV==='production',
          productionBlocked:cfg.productionBlocked,
          credentialsConfigured:Boolean(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET),
          oauthAuthenticated,webhookConfigured:Boolean(cfg.webhookId),
          payoutsEntitlement:'not_verified',oauthError
        });
      }
      if(method==='GET'&&p==='/api/admin/promotional-gift-fund'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrator can view the promotional gift cash reserve.'});
        }
        return json(res,200,await requestSupabaseState('economy_admin_promotional_fund_status',{
          adminUserId:user.id,adminEmail
        }));
      }
      if(method==='POST'&&p==='/api/admin/promotional-gift-fund/orders'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrator can fund the promotional gift cash reserve.'});
        }
        const amountMinor=Number(input.amountMinor);
        if(!Number.isSafeInteger(amountMinor)||amountMinor<100||amountMinor>50000000){
          return json(res,400,{error:'Fund at least USD 1.00 and no more than USD 500000.00.'});
        }
        const requestId=uid(),origin=appOrigin(req);
        const order=await paypalRequest('/v2/checkout/orders','POST',{
          intent:'CAPTURE',
          purchase_units:[{
            reference_id:requestId,custom_id:user.id,
            description:'Minglora Promotional Gift USD Reserve',
            amount:{currency_code:'USD',value:(amountMinor/100).toFixed(2)}
          }],
          application_context:{
            brand_name:'Minglora',landing_page:'NO_PREFERENCE',user_action:'PAY_NOW',
            shipping_preference:'NO_SHIPPING',
            return_url:origin+'/promotional-fund-return.html',
            cancel_url:origin+'/?paypal=cancel'
          }
        },'minglora-promo-fund-order-'+requestId);
        const approveUrl=(order.links||[]).find(link=>link.rel==='approve')?.href;
        if(!order.id||!approveUrl)return json(res,502,{error:'PayPal did not return a promotional funding approval link.'});
        await requestSupabaseState('economy_admin_promotional_fund_order_create',{
          adminUserId:user.id,adminEmail,paypalOrderId:order.id,amountMinor,requestId
        });
        return json(res,201,{ok:true,orderId:order.id,approveUrl,amountMinor,currency:'USD'});
      }
      if(method==='GET'&&p==='/api/admin/promotional-gift-fund/capture'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrator can confirm promotional gift funding.'});
        }
        const orderId=String(url.searchParams.get('token')||'').trim();
        if(orderId.length<5||orderId.length>160)return json(res,400,{error:'PayPal funding order reference is missing.'});
        const stored=await requestSupabaseState('economy_admin_promotional_fund_order_get',{
          adminUserId:user.id,adminEmail,paypalOrderId:orderId
        });
        const fundingOrder=stored.order||{};
        if(fundingOrder.status==='captured'){
          res.writeHead(303,{Location:appOrigin(req)+'/?promoGiftFunding=success'});res.end();return;
        }
        const details=await paypalRequest('/v2/checkout/orders/'+encodeURIComponent(orderId),'GET',undefined);
        const units=details.purchase_units||[];
        const ownerUnit=units.find(unit=>unit.custom_id===user.id);
        const expectedMinor=Number(fundingOrder.amount_minor);
        if(!ownerUnit||details.id!==orderId||details.intent!=='CAPTURE'||
           !Number.isSafeInteger(expectedMinor)||expectedMinor<100){
          return json(res,409,{error:'PayPal order does not match the recorded Minglora funding request.'});
        }
        let capture=units.flatMap(unit=>unit.payments?.captures||[]).find(item=>item.status==='COMPLETED');
        if(!capture&&details.status==='APPROVED'){
          const captured=await paypalRequest('/v2/checkout/orders/'+encodeURIComponent(orderId)+'/capture','POST',{},'minglora-promo-fund-capture-'+orderId);
          capture=(captured.purchase_units||[]).flatMap(unit=>unit.payments?.captures||[]).find(item=>item.status==='COMPLETED');
        }
        const paidMinor=Math.round(Number(capture?.amount?.value||0)*100);
        if(!capture?.id||capture.amount?.currency_code!=='USD'||paidMinor!==expectedMinor){
          return json(res,409,{error:'PayPal has not confirmed the exact USD funding amount. No promotional gift reserve was credited.'});
        }
        await requestSupabaseState('economy_admin_promotional_fund_order_settle',{
          adminUserId:user.id,adminEmail,paypalOrderId:orderId,paypalCaptureId:capture.id,
          amountMinor:paidMinor,requestId:uid()
        });
        res.writeHead(303,{Location:appOrigin(req)+'/?promoGiftFunding=success'});res.end();return;
      }
      if(method==='GET'&&p==='/api/admin/coins/campaign-wallet'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrator can view the campaign wallet.'});
        }
        return json(res,200,await requestSupabaseState('economy_admin_campaign_wallet',{
          adminUserId:user.id,adminEmail
        }));
      }
      if(method==='POST'&&p==='/api/admin/coins/member-promotions'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrative account can send member promotional Coins.'});
        }
        const memberUsername=normalizeUsername(input.memberUsername||input.memberLookup);
        const amountCoins=Number(input.amountCoins);
        const requestId=String(input.requestId||'').trim();
        const note=String(input.note||'Minglora member promotional Coins').trim().slice(0,240);
        const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if(!validateUsername(memberUsername).valid||!Number.isSafeInteger(amountCoins)||amountCoins<1||
           amountCoins>Number.MAX_SAFE_INTEGER||!uuidPattern.test(requestId)){
          return json(res,400,{error:'Enter a valid Minglora username, a positive whole-number Coin amount and a secure request reference.'});
        }
        const result=await requestSupabaseState('economy_admin_campaign_allocate',{
          adminUserId:user.id,adminEmail,memberLookup:memberUsername,amountCoins,requestId,
          campaignName:'Minglora Admin Promotional Gift Campaign',note
        });
        const allocation=result.allocation?.allocation||result.allocation||result;
        const memberWallet=allocation.member_promotional_wallet||{};
        return json(res,200,{ok:true,credit:{
          alreadyCredited:Boolean(allocation.already_processed),
          amountCoins,memberUsername,
          balanceAfter:Number(memberWallet.available_coins||0)
        },allocation});
      }
      if(method==='GET'&&p==='/api/admin/coins/member-promotions/history'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrative account can view member promotional Coin history.'});
        }
        const result=await requestSupabaseState('economy_admin_campaign_history',{
          adminUserId:user.id,adminEmail
        });
        return json(res,200,{items:Array.isArray(result.items)?result.items:[]});
      }
      if(method==='GET'&&p==='/api/admin/coins/member-promotions/members'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrative account can search members for promotional Coins.'});
        }
        const search=new URL(req.url,'http://localhost').searchParams.get('search')||'';
        const result=await requestSupabaseState('economy_admin_member_search',{
          adminUserId:user.id,adminEmail,search
        });
        return json(res,200,{members:Array.isArray(result.members)?result.members:[]});
      }
      if(method==='GET'&&p==='/api/admin/marketing/budget'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrative account can view the marketing budget.'});
        }
        const result=await requestSupabaseState('economy_marketing_budget');
        return json(res,200,result.budget||{});
      }
      if(method==='POST'&&p==='/api/admin/marketing/funding'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrative account can record marketing funds.'});
        }
        const amountMinor=Number(input.amountMinor);
        const requestId=String(input.requestId||'').trim();
        const fundingReference=String(input.fundingReference||'').trim();
        const note=String(input.note||'').trim().slice(0,240);
        const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if(!Number.isSafeInteger(amountMinor)||amountMinor<100||!uuidPattern.test(requestId)||
           fundingReference.length<6||fundingReference.length>160){
          return json(res,400,{error:'Enter a valid amount of at least USD $1.00 and the external funding transaction reference.'});
        }
        const result=await requestSupabaseState('economy_marketing_funding',{
          adminUserId:user.id,adminEmail,amountMinor,requestId,fundingReference,note
        });
        return json(res,200,result.funding||result);
      }
      if(method==='POST'&&p==='/api/admin/marketing/grants'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrative account can issue marketing-funded Coins.'});
        }
        const memberUsername=normalizeUsername(input.memberUsername||input.memberLookup);
        const amountCoins=Number(input.amountCoins);
        const requestId=String(input.requestId||'').trim();
        const note=String(input.note||'').trim().slice(0,240);
        const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if(!validateUsername(memberUsername).valid||!Number.isSafeInteger(amountCoins)||amountCoins<1||!uuidPattern.test(requestId)){
          return json(res,400,{error:'Enter a valid Minglora username, whole-number Coin amount and request reference.'});
        }
        const result=await requestSupabaseState('economy_marketing_grant',{
          adminUserId:user.id,adminEmail,memberUsername,amountCoins,requestId,note
        });
        return json(res,200,result.grant||result);
      }
      if(method==='POST'&&p==='/api/coins/exchange'){
        const amountMinor=Number(input.amountMinor);
        const requestId=String(input.requestId||'').trim();
        const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if(!Number.isSafeInteger(amountMinor)||amountMinor<100){
          return json(res,400,{error:'Exchange at least USD $1.00 from your available money balance.'});
        }
        if(!uuidPattern.test(requestId)){
          return json(res,400,{error:'A valid exchange request reference is required. Please retry.'});
        }
        const result=await requestSupabaseState('economy_exchange_creator_earnings',{
          creatorId:user.id,amountMinor,requestId
        });
        const wallet=await requestSupabaseState('economy_wallet',{userId:user.id});
        return json(res,200,{ok:true,exchange:result.exchange||result,wallet});
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
        if(!user?.id)return json(res,401,{error:'Sign in to view your creator earnings.'});
        const result=await requestSupabaseState('economy_creator_earnings',{creatorId:user.id});
        const pick=(row,fields)=>Object.fromEntries(fields
          .filter(field=>row&&Object.prototype.hasOwnProperty.call(row,field))
          .map(field=>[field,row[field]]));
        const giftBalance=result?.giftBalance||{};
        const safeGiftFields=[
          'giftCount','receivedCoins','cashBackedCoins','marketingBackedCoins',
          'promotionalCoins','adminPromotionalCoins','cashBackedPromotionalCoins',
          'cashBackedPromotionalGrossMinor','cashBackedPromotionalCreatorShareMinor',
          'eligibleGrossMinor','creatorShareMinor','platformShareMinor'
        ];
        return json(res,200,{
          ledger:(Array.isArray(result?.ledger)?result.ledger:[]).map(item=>pick(item,[
            'id','gross_minor','creator_share_minor','currency','status','created_at','funding_source'
          ])),
          giftBalance:{
            ...pick(giftBalance,safeGiftFields),
            recent:(Array.isArray(giftBalance.recent)?giftBalance.recent:[]).map(item=>pick(item,[
              'id','giftCode','giftName','giftEmoji','coinAmount','grossMinor','creatorShareMinor',
              'cashBackedCoins','marketingBackedCoins','promotionalCoins','adminPromotionalCoins',
              'cashBackingMinor','cashBackingCreatorShareMinor','cashBackingCreatedAt',
              'fundingSource','senderUsername','senderDisplayName','createdAt'
            ]))
          },
          payouts:(Array.isArray(result?.payouts)?result.payouts:[]).map(item=>pick(item,[
            'id','amount_minor','currency','status','created_at','paid_at'
          ])),
          exchanges:(Array.isArray(result?.exchanges)?result.exchanges:[]).map(item=>pick(item,[
            'id','amount_minor','coin_amount','currency','created_at'
          ])),
          payoutAccount:result?.payoutAccount?pick(result.payoutAccount,['paypal_email','updated_at']):null,
          earnedMinor:Number(result?.earnedMinor||0),
          eligibleGiftEarningsMinor:Number(result?.eligibleGiftEarningsMinor||0),
          promotionalGiftEarningsExcludedMinor:Number(result?.promotionalGiftEarningsExcludedMinor||0),
          reservedMinor:Number(result?.reservedMinor||0),
          exchangedMinor:Number(result?.exchangedMinor||0),
          availableMinor:Number(result?.availableMinor||0),
          currency:'USD',
          creatorSharePercent:50,
          coinPerCent:1
        });
      }
      if(method==='GET'&&p==='/api/creator/payout-account'){
        return json(res,200,await requestSupabaseState('economy_get_payout_account',{userId:user.id}));
      }
      if(method==='PUT'&&p==='/api/creator/payout-account'){
        const paypalEmail=String(input.paypalEmail||'').trim().toLowerCase();
        const saved=await requestSupabaseState('economy_set_payout_account',{userId:user.id,paypalEmail});
        return json(res,200,saved);
      }
      if(method==='DELETE'&&p==='/api/creator/payout-account'){
        const unlinked=await requestSupabaseState('economy_unlink_payout_account',{userId:user.id});
        return json(res,200,unlinked);
      }
      if(method==='POST'&&p==='/api/creator/payouts'){
        const earnings=await requestSupabaseState('economy_creator_earnings',{creatorId:user.id});
        const payoutEmail=earnings.payoutAccount?.paypal_email;
        if(!payoutEmail)return json(res,400,{error:'Add your PayPal payout email before requesting a withdrawal.'});
        const amountMinor=input.amountMinor===undefined?Math.floor(Number(earnings.availableMinor)):Number(input.amountMinor);
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
          // A provider 4xx response or a failed OAuth/scope check proves that no payout
          // batch was created. Release that reservation instead of leaving it stuck as
          // Requested. Network failures and provider 5xx responses remain reserved
          // because PayPal may have accepted the request before the connection failed.
          if(error?.paypalNoSubmission===true){
            try{
              await requestSupabaseState('economy_update_payout',{creatorId:user.id,payoutId,status:'failed'});
            }catch(releaseError){
              console.error('[Minglora payouts] PayPal rejected payout but reservation release failed.',{
                payoutId,providerCode:error.code||null,providerStatus:error.paypalHttpStatus||null,
                paypalDebugId:error.paypalDebugId||null,releaseMessage:String(releaseError?.message||releaseError).slice(0,160)
              });
              throw Object.assign(new Error('PayPal rejected the payout, but Minglora could not release its reservation. Contact Minglora administration before retrying.'),{status:503,code:'PAYOUT_RESERVATION_RELEASE_FAILED'});
            }
            console.warn('[Minglora payouts] Definitively rejected payout marked failed; creator earnings reservation released.',{
              payoutId,providerCode:error.code||null,providerStatus:error.paypalHttpStatus||null,
              paypalDebugId:error.paypalDebugId||null
            });
            throw Object.assign(new Error('PayPal rejected this payout request. No payment was sent. Minglora marked it Failed and released the reserved creator earnings. Enable the Payouts permission on the PayPal live app before trying again.'),{status:502,code:'PAYPAL_PAYOUT_REJECTED'});
          }
          // Keep uncertain provider submissions reserved until a verified PayPal event
          // or an administrator reconciliation confirms their final status.
          throw error;
        }
      }
      if(method==='POST'&&p==='/api/gifts/send'){
        const recipientUsername=String(input.username||'').trim().replace(/^@/,'').toLowerCase();
        const giftCode=String(input.giftCode||'').trim();
        // Social gifts in Minglora are always sent directly to a member.
        // Ignore legacy content-destination fields from older clients.
        const contextType='user';
        const contextId=null;
        if(!/^[a-z0-9_]{3,30}$/.test(recipientUsername)||
           !/^[a-z0-9_-]{1,60}$/.test(giftCode)){
          return json(res,400,{error:'Enter a valid @username and gift.'});
        }
        const fundingSource=String(input.fundingSource||'cash');
        if(!['cash','admin_promotional'].includes(fundingSource)){
          return json(res,400,{error:'Choose a supported Minglora gift wallet.'});
        }
        const result=fundingSource==='admin_promotional'
          ?await requestSupabaseState('economy_send_admin_promotional_gift',{
            senderId:user.id,recipientUsername,giftCode,broadcastId:null
          })
          :await requestSupabaseState('economy_send_social_gift',{
            senderId:user.id,recipientUsername,giftCode,contextType,contextId
          });
        const gift=result.gift;
        if(!gift?.receiverId)return json(res,502,{error:'Minglora could not confirm the gift transaction.'});
        const directGiftId=gift.giftTransactionId||gift.transactionId||gift.transaction_id||gift.id;
        const directCoinAmount=Number(gift.coinAmount??gift.coin_amount??gift.coins??0);
        if(directGiftId&&Number.isSafeInteger(directCoinAmount)&&directCoinAmount>0){
          try{recordGifterGift(db,{giftId:String(directGiftId),senderId:user.id,recipientId:gift.receiverId,recipientUsername:gift.recipientUsername||recipientUsername,giftCode:String(gift.giftCode||giftCode),giftName:gift.giftName||gift.gift_name||'',coinAmount:directCoinAmount,contextType:'member',now:new Date()});}
          catch(error){console.error('[Minglora Gifter Progression] Confirmed member gift could not be recorded.',{giftId:String(directGiftId),message:String(error?.message||'progression update failed').slice(0,160)});}
        }
        notify(gift.receiverId,user.id,'gift',user.name+' sent you a gift.');
        await saveStore();
        return json(res,201,{gift,fundingSource});
      }
      const rewardDropCollection=p.match(/^\/api\/live\/sessions\/([^/]+)\/reward-drops$/);
      const rewardDropEntry=p.match(/^\/api\/live\/sessions\/([^/]+)\/reward-drops\/([^/]+)\/(join|claim)$/);
      if((method==='GET'||method==='POST')&&rewardDropCollection){
        const session=(db.liveSessions||[]).find(item=>item.id===rewardDropCollection[1]&&item.status==='live');
        if(session&&(session.liveSettings?.practiceMode||session.liveSettings?.liveGifts===false))return json(res,403,{error:'LIVE reward drops are disabled for this broadcast.'});
        if(!session||blockedBetween(user.id,session.hostId))return json(res,404,{error:'LIVE reward room is not available.'});
        const canViewRewardRoom=session.hostId===user.id||session.visibility==='public'||
          (session.visibility==='friends'&&isFriend(user.id,session.hostId));
        if(!canViewRewardRoom)return json(res,404,{error:'LIVE reward room is not available.'});
        if(method==='GET'){
          const result=await requestSupabaseState('economy_live_reward_list',{userId:user.id,broadcastId:session.id});
          return json(res,200,result);
        }
        if(session.hostId!==user.id)return json(res,403,{error:'Only the LIVE host can launch a Goody Bag or Treasure Box.'});
        const requestId=String(input.requestId||uid());
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)){
          return json(res,400,{error:'Invalid reward request reference.'});
        }
        const kind=String(input.kind||'');
        const totalCoins=Number(input.totalCoins);
        const winnerCount=Number(input.winnerCount);
        const countdownSeconds=Number(input.countdownSeconds);
        const participationMethod=String(input.participationMethod||'tap');
        const keyword=String(input.keyword||'').trim().toLowerCase();
        if(!['goody_bag','treasure_box'].includes(kind)||
           !Number.isSafeInteger(totalCoins)||totalCoins<1||totalCoins>1000000||
           !Number.isSafeInteger(winnerCount)||winnerCount<1||winnerCount>100||winnerCount>totalCoins||
           !Number.isSafeInteger(countdownSeconds)||countdownSeconds<30||countdownSeconds>600||
           !['tap','comment'].includes(participationMethod)||
           (participationMethod==='comment'&&(keyword.length<1||keyword.length>40))||keyword.length>40){
          return json(res,400,{error:'Check the reward type, coin pool, winners, countdown and entry condition.'});
        }
        try{
          const participants=await listLiveKitParticipants(session.roomName);
          if(!participants.some(participant=>participant.identity===session.hostId)){
            return json(res,409,{error:'Your LIVE room must be connected before launching a reward drop.'});
          }
        }catch{
          return json(res,503,{error:'Minglora could not verify your LIVE room. Try again shortly.'});
        }
        const result=await requestSupabaseState('economy_live_reward_create',{
          creatorId:user.id,broadcastId:session.id,requestId,kind,totalCoins,winnerCount,
          countdownSeconds,participationMethod,keyword
        });
        return json(res,201,result);
      }
      if(method==='POST'&&rewardDropEntry){
        const session=(db.liveSessions||[]).find(item=>item.id===rewardDropEntry[1]&&item.status==='live');
        if(!session||session.hostId===user.id||blockedBetween(user.id,session.hostId))return json(res,404,{error:'LIVE reward room is not available.'});
        const canViewRewardRoom=session.visibility==='public'||
          (session.visibility==='friends'&&isFriend(user.id,session.hostId));
        if(!canViewRewardRoom)return json(res,404,{error:'LIVE reward room is not available.'});
        try{
          const participants=await listLiveKitParticipants(session.roomName);
          if(!participants.some(participant=>participant.identity===user.id)){
            return json(res,403,{error:'Join this LIVE room before entering or claiming its rewards.'});
          }
        }catch{
          return json(res,503,{error:'Minglora could not verify your LIVE presence. Try again shortly.'});
        }
        const dropId=String(rewardDropEntry[2]||'');
        if(!/^[0-9a-f-]{36}$/i.test(dropId))return json(res,400,{error:'Invalid reward drop reference.'});
        const action=rewardDropEntry[3]==='join'?'economy_live_reward_join':'economy_live_reward_claim';
        const result=await requestSupabaseState(action,{userId:user.id,dropId,broadcastId:session.id,keyword:String(input.keyword||'')});
        return json(res,200,result);
      }
      const liveViewerRosterMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/viewers$/);
      if (method === 'GET' && liveViewerRosterMatch) {
        const session = (db.liveSessions || []).find(item => item.id === liveViewerRosterMatch[1] && item.status === 'live');
        if (!session || session.hostId !== user.id) return json(res, 403, { error: 'Only the LIVE host can view the detailed viewer roster.' });
        let participants;
        try {
          participants = await listLiveKitParticipants(session.roomName);
        } catch {
          return json(res, 503, { error: 'Minglora could not refresh the LIVE viewer roster.' });
        }
        const viewers = participants.filter(participant => participant.identity !== session.hostId)
          .map(participant => {
            const member = db.users.find(candidate => candidate.id === participant.identity);
            if (!member || blockedBetween(user.id, member.id)) return null;
            const gifterBadge = getGifterBadgeSummary(db, member.id);
            return {
              user: safeUser(member, user.id),
              gifterBadge,
              fanClubMembership: publicLiveFanClubMembership(db, session.hostId, member.id),
              role: (db.liveParticipants || []).find(item => item.sessionId === session.id && item.userId === member.id && !item.leftAt)?.role || 'viewer',
              joinedAt: (db.liveParticipants || []).find(item => item.sessionId === session.id && item.userId === member.id && !item.leftAt)?.joinedAt || null,
              isGifter: Boolean(gifterBadge)
            };
          }).filter(Boolean);
        if (session.liveSettings?.prioritizeGifters === true) {
          viewers.sort((a, b) =>
            Number(b.gifterBadge?.level || 0) - Number(a.gifterBadge?.level || 0) ||
            Number(b.fanClubMembership?.points || 0) - Number(a.fanClubMembership?.points || 0) ||
            String(a.joinedAt || '').localeCompare(String(b.joinedAt || ''))
          );
        }
        await saveStore();
        return json(res, 200, {
          viewers,
          viewerCount: participants.filter(participant => participant.identity !== session.hostId).length,
          prioritized: session.liveSettings?.prioritizeGifters === true
        });
      }
      const liveFanClubMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/fan-club(?:\/(join|watch))?$/);
      if (liveFanClubMatch && ['GET', 'POST'].includes(method)) {
        const session = (db.liveSessions || []).find(item => item.id === liveFanClubMatch[1] && item.status === 'live');
        if (!session || blockedBetween(user.id, session.hostId)) return json(res, 404, { error: 'LIVE session not found.' });
        const friends = isFriend(user.id, session.hostId);
        const canView = session.hostId === user.id || session.visibility === 'public' ||
          (session.visibility === 'friends' && friends);
        if (!canView) return json(res, 404, { error: 'LIVE session not found.' });
        const action = liveFanClubMatch[2] || '';
        ensureLiveFanClubCollections(db);
        if (method === 'GET' && !action) {
          const membership = getLiveFanClubMembership(db, session.hostId, user.id);
          const following = (db.follows || []).some(edge => edge.followerId === user.id && edge.followedId === session.hostId);
          const status = publicLiveFanClubMembership(db, session.hostId, user.id);
          await saveStore();
          return json(res, 200, {
            membership: status,
            isMember: membership?.status === 'active',
            following,
            joinCost: LIVE_FAN_CLUB_JOIN_COIN_COST,
            joinGiftCode: LIVE_FAN_CLUB_JOIN_GIFT_CODE,
            teamGiftCodes: LIVE_FAN_CLUB_GIFT_CODES,
            fanClubMemberCount: countActiveLiveFanClubMembers(db, session.hostId)
          });
        }
        if (method !== 'POST' || !['join', 'watch'].includes(action)) {
          return json(res, 405, { error: 'Use GET for Fan Club status or POST for join/watch activity.' });
        }
        if (session.hostId === user.id) return json(res, 403, { error: 'The host cannot join their own Fan Club.' });
        if (action === 'join' && (session.liveSettings?.practiceMode || session.liveSettings?.liveGifts === false)) {
          return json(res, 403, { error: 'Fan Club purchases are unavailable in this LIVE room.' });
        }
        let participants;
        try {
          participants = await listLiveKitParticipants(session.roomName);
        } catch {
          return json(res, 503, { error: 'Minglora could not verify the LIVE room connection. Try again.' });
        }
        if (!participants.some(participant => participant.identity === user.id)) {
          return json(res, 409, { error: 'Join the LIVE room before using Fan Club features.' });
        }
        if (action === 'watch') {
          const result = awardLiveFanClubPoints(db, {
            hostId: session.hostId, fanId: user.id, source: 'watch', points: 1, sourceId: uid(), now: new Date()
          });
          if (result.awarded) await saveStore();
          return json(res, 200, {
            awarded: result.awarded,
            pointsAwarded: result.points,
            membership: publicLiveFanClubMembership(db, session.hostId, user.id),
            fanClubMemberCount: countActiveLiveFanClubMembers(db, session.hostId)
          });
        }
        const existing = getLiveFanClubMembership(db, session.hostId, user.id);
        if (existing?.status === 'active') {
          return json(res, 200, {
            alreadyMember: true,
            charged: false,
            membership: publicLiveFanClubMembership(db, session.hostId, user.id),
            fanClubMemberCount: countActiveLiveFanClubMembers(db, session.hostId)
          });
        }
        const following = (db.follows || []).some(edge => edge.followerId === user.id && edge.followedId === session.hostId);
        if (!following) {
          return json(res, 409, { error: 'Follow the LIVE host before joining their Fan Club.', code: 'follow_required' });
        }
        const joinKey = session.id + ':' + user.id;
        if (liveFanClubJoinInProgress.has(joinKey)) {
          return json(res, 409, { error: 'Your Fan Club join is already being processed. Please check your membership status.' });
        }
        liveFanClubJoinInProgress.add(joinKey);
        try {
          const catalogue = await requestSupabaseState('economy_catalog');
          const joinGift = (catalogue.gifts || []).find(item =>
            item.code === LIVE_FAN_CLUB_JOIN_GIFT_CODE && item.active !== false
          );
          if (!joinGift || Number(joinGift.coin_price) !== LIVE_FAN_CLUB_JOIN_COIN_COST) {
            return json(res, 503, { error: 'The verified 1-Coin Heart Me gift is unavailable. No Fan Club charge was attempted.' });
          }
          const result = await requestSupabaseState('economy_send_gift', {
            senderId: user.id, broadcastId: session.id, giftCode: LIVE_FAN_CLUB_JOIN_GIFT_CODE
          });
          const gift = result.gift || {};
          const transactionId = gift.giftTransactionId || gift.id || gift.transactionId || gift.transaction_id;
          const coinAmount = Number(gift.coinAmount ?? gift.coin_amount ?? gift.coins ?? gift.coinPrice ?? gift.coin_price ?? joinGift.coin_price);
          if (!transactionId || coinAmount !== LIVE_FAN_CLUB_JOIN_COIN_COST) {
            return json(res, 502, { error: 'Minglora received an unverified Heart Me transaction response. Check your Coin ledger before retrying.' });
          }
          const timestamp = new Date();
          const host = db.users.find(member => member.id === session.hostId);
          try {
            recordGifterGift(db, {
              giftId: String(transactionId), senderId: user.id, recipientId: session.hostId,
              recipientUsername: host?.username || '', giftCode: LIVE_FAN_CLUB_JOIN_GIFT_CODE,
              giftName: gift.giftName || joinGift.name || 'Heart Me', coinAmount,
              contextType: 'live', now: timestamp
            });
          } catch (error) {
            console.error('[Minglora Fan Club] Confirmed Heart Me gift could not update gifter progression.', String(error?.message || error).slice(0, 160));
          }
          try {
            recordLiveGiftForLeagues(db, {
              giftId: transactionId, recipientId: session.hostId, broadcastId: session.id,
              giftCode: LIVE_FAN_CLUB_JOIN_GIFT_CODE, coinAmount,
              region: host?.country || 'GLOBAL'
            });
          } catch (error) {
            console.error('[Minglora Fan Club] Confirmed Heart Me gift could not update Creator League points.', String(error?.message || error).slice(0, 160));
          }
          try {
            recordGiftGalleryEvent(db, {
              giftId: String(transactionId), creatorId: session.hostId, senderId: user.id,
              broadcastId: session.id, giftCode: LIVE_FAN_CLUB_JOIN_GIFT_CODE,
              coinAmount, giftName: gift.giftName || joinGift.name || 'Heart Me',
              emoji: gift.emoji || joinGift.emoji || '💖',
              imageUrl: gift.imageUrl || joinGift.image_url || '',
              modelUrl: gift.modelUrl || joinGift.model_url || '',
              timeZone: giftGalleryTimeZone(host), now: timestamp
            });
          } catch (error) {
            console.error('[Minglora Fan Club] Confirmed Heart Me gift could not update the gift gallery.', String(error?.message || error).slice(0, 160));
          }
          const joined = joinLiveFanClub(db, {
            hostId: session.hostId, fanId: user.id, giftTransactionId: String(transactionId), now: timestamp
          });
          awardLiveFanClubPoints(db, {
            hostId: session.hostId, fanId: user.id, source: 'gift', points: LIVE_FAN_CLUB_JOIN_COIN_COST,
            sourceId: 'fanclub-join:' + String(transactionId), now: timestamp
          });
          notify(session.hostId, user.id, 'fan_club', user.name + ' joined your Fan Club.', { liveSessionId: session.id });
          await saveStore();
          return json(res, 201, {
            alreadyMember: joined.alreadyMember,
            charged: !joined.alreadyMember,
            membership: publicLiveFanClubMembership(db, session.hostId, user.id, timestamp),
            gift: result.gift,
            fanClubMemberCount: countActiveLiveFanClubMembers(db, session.hostId, timestamp)
          });
        } finally {
          liveFanClubJoinInProgress.delete(joinKey);
        }
      }
      let liveLikeMatch = p.match(/^\/api\/live\/sessions\/([^/]+)\/likes$/);
      if (method === 'POST' && liveLikeMatch) {
        const session = (db.liveSessions || []).find(item => item.id === liveLikeMatch[1] && item.status === 'live');
        if (!session || blockedBetween(user.id, session.hostId)) return json(res, 404, { error: 'LIVE session not found.' });
        const friends = isFriend(user.id, session.hostId);
        const canView = session.hostId === user.id || session.visibility === 'public' ||
          (session.visibility === 'friends' && friends);
        if (!canView) return json(res, 404, { error: 'LIVE session not found.' });
        let participants;
        try {
          participants = await listLiveKitParticipants(session.roomName);
        } catch {
          return json(res, 503, { error: 'Minglora could not verify the LIVE room connection. Try again.' });
        }
        if (!participants.some(participant => participant.identity === user.id)) {
          return json(res, 409, { error: 'Join the LIVE room before sending a like.' });
        }
        const nowMs = Date.now();
        const rateKey = session.id + ':' + user.id;
        const previousAt = liveLikeRateLimits.get(rateKey) || 0;
        if (nowMs - previousAt < 120) {
          return json(res, 200, { accepted: false, likeCount: Math.max(0, Number(session.likeCount) || 0) });
        }
        liveLikeRateLimits.set(rateKey, nowMs);
        if (liveLikeRateLimits.size > 50000) {
          for (const [key, timestamp] of liveLikeRateLimits) if (nowMs - timestamp > 60 * 60 * 1000) liveLikeRateLimits.delete(key);
        }
        session.likeCount = Math.max(0, Number(session.likeCount) || 0) + 1;
        await saveStore();
        return json(res, 200, { accepted: true, likeCount: session.likeCount });
      }
      let liveAction=p.match(/^\/api\/live\/sessions\/([^/]+)\/gifts$/);
      if(method==='GET'&&liveAction){
        const session=(db.liveSessions||[]).find(item=>item.id===liveAction[1]&&item.status==='live');
        if(!session||blockedBetween(user.id,session.hostId))return json(res,404,{error:'LIVE session is not available.'});
        const canView=session.hostId===user.id||session.visibility==='public'||
          (session.visibility==='friends'&&isFriend(user.id,session.hostId));
        if(!canView)return json(res,404,{error:'LIVE session is not available.'});
        const sinceValue=String(url.searchParams.get('since')||'').trim();
        const sinceMs=sinceValue?Date.parse(sinceValue):0;
        if(sinceValue&&!Number.isFinite(sinceMs))return json(res,400,{error:'Use a valid timestamp when checking LIVE gift activity.'});
        const events=(db.giftGalleryEvents||[])
          .filter(event=>!event.refundedAt&&event.status!=='refunded'&&event.broadcastId===session.id&&event.creatorId===session.hostId&&
            (!sinceValue||Date.parse(event.createdAt)>=sinceMs))
          .sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')))
          .slice(-60)
          .map(event=>{
            const sender=db.users.find(member=>member.id===event.senderId);
            return {
              id:String(event.giftId||event.id||''),
              giftCode:String(event.giftCode||''),
              giftName:String(event.giftName||'Gift'),
              coinAmount:Number(event.coinAmount||0),
              emoji:String(event.emoji||'🎁'),
              imageUrl:String(event.imageUrl||''),
              modelUrl:String(event.modelUrl||''),
              createdAt:String(event.createdAt||''),
              broadcastId:String(event.broadcastId||session.id),
              sender:sender?safeUser(sender,user.id):{id:String(event.senderId||''),name:'Minglora member',username:'member'},
              recipient:(()=>{const host=db.users.find(member=>member.id===session.hostId);return host?{id:host.id,name:host.name||'LIVE host',username:host.username||''}:{id:session.hostId,name:'LIVE host',username:''};})()
            };
          });
        return json(res,200,{events});
      }
      if(method==='POST'&&liveAction){
        const session=(db.liveSessions||[]).find(item=>item.id===liveAction[1]&&item.status==='live');
        if(session&&(session.liveSettings?.practiceMode||session.liveSettings?.liveGifts===false))return json(res,403,{error:'LIVE gifts are disabled for this broadcast.'});
        if(!session||session.hostId===user.id||blockedBetween(user.id,session.hostId))return json(res,404,{error:'LIVE session is not available for gifting.'});
        const friends=isFriend(user.id,session.hostId);
        const canView=session.visibility==='public'||(session.visibility==='friends'&&friends)||session.hostId===user.id;
        if(!canView)return json(res,404,{error:'LIVE session is not available for gifting.'});
        const requestedGiftCode=String(input.giftCode||'');
        if(LIVE_FAN_CLUB_GIFT_CODES.includes(requestedGiftCode)){
          const fanMembership=getLiveFanClubMembership(db,session.hostId,user.id);
          if(fanMembership?.status!=='active')return json(res,403,{error:'Join this host’s Fan Club before sending Team Gifts.',code:'fan_club_required'});
        }
        let hostIsPresent=false;
        try {
          const participants=await listLiveKitParticipants(session.roomName);
          hostIsPresent=participants.some(participant=>participant.identity===session.hostId);
        } catch {
          return json(res,503,{error:'Minglora could not verify that the host is currently LIVE. Try again shortly.'});
        }
        if(!hostIsPresent)return json(res,409,{error:'This host is no longer LIVE. Refresh the LIVE directory.'});
        const fundingSource=String(input.fundingSource||'cash');
        if(!['cash','admin_promotional'].includes(fundingSource))return json(res,400,{error:'Choose a supported Minglora gift wallet.'});
        const result=fundingSource==='admin_promotional'
          ?await requestSupabaseState('economy_send_admin_promotional_gift',{senderId:user.id,broadcastId:session.id,giftCode:String(input.giftCode||''),recipientUsername:null})
          :await requestSupabaseState('economy_send_gift',{senderId:user.id,broadcastId:session.id,giftCode:String(input.giftCode||'')});
        const confirmedGift=result.gift||{};
        const confirmedGiftId=confirmedGift.giftTransactionId||confirmedGift.id||confirmedGift.transactionId||confirmedGift.transaction_id;
        const confirmedCoinAmount=Number(confirmedGift.coinAmount??confirmedGift.coin_amount??confirmedGift.coins??0);
        const confirmedAt=new Date();
        if(confirmedGiftId&&Number.isSafeInteger(confirmedCoinAmount)&&confirmedCoinAmount>0){
          try{
            const recipient=db.users.find(member=>member.id===session.hostId);
            recordGifterGift(db,{giftId:String(confirmedGiftId),senderId:user.id,recipientId:session.hostId,recipientUsername:recipient?.username||'',giftCode:String(input.giftCode||''),giftName:confirmedGift.giftName||confirmedGift.name||'',coinAmount:confirmedCoinAmount,contextType:'live',now:confirmedAt});
          }catch(error){console.error('[Minglora Gifter Progression] Confirmed LIVE gift could not be recorded.',{giftId:String(confirmedGiftId),message:String(error?.message||'progression update failed').slice(0,160)});}
          try{
            recordLiveGiftForLeagues(db,{
              giftId:confirmedGiftId,recipientId:session.hostId,broadcastId:session.id,
              giftCode:String(input.giftCode||''),coinAmount:confirmedCoinAmount,
              region:db.users.find(member=>member.id===session.hostId)?.country||'GLOBAL'
            });
          }catch(error){
            console.error('[Minglora League] A confirmed LIVE Gift could not be added to League totals.',{giftId:String(confirmedGiftId),message:String(error?.message||'league update failed').slice(0,160)});
          }
        }
        if(confirmedGiftId&&Number.isSafeInteger(confirmedCoinAmount)&&confirmedCoinAmount>0){
          try{
            const creator=db.users.find(member=>member.id===session.hostId);
            recordGiftGalleryEvent(db,{
              giftId:String(confirmedGiftId),creatorId:session.hostId,senderId:user.id,
              broadcastId:session.id,giftCode:String(input.giftCode||''),coinAmount:confirmedCoinAmount,
              giftName:confirmedGift.giftName||confirmedGift.name||'',emoji:confirmedGift.emoji||'🎁',
              imageUrl:confirmedGift.imageUrl||confirmedGift.image_url||'',
              modelUrl:confirmedGift.modelUrl||confirmedGift.model_url||'',
              timeZone:giftGalleryTimeZone(creator),now:confirmedAt
            });
          }catch(error){
            console.error('[Minglora Gift Gallery] A confirmed LIVE Gift could not be added to the weekly gallery.',{giftId:String(confirmedGiftId),message:String(error?.message||'gallery update failed').slice(0,160)});
          }
        }
        if(confirmedGiftId&&Number.isSafeInteger(confirmedCoinAmount)&&confirmedCoinAmount>0){
          awardLiveFanClubPoints(db,{hostId:session.hostId,fanId:user.id,source:'gift',points:confirmedCoinAmount,sourceId:String(confirmedGiftId),now:confirmedAt});
        }
        notify(session.hostId,user.id,'gift',user.name+' sent a LIVE gift.');
        await saveStore();
        const liveGiftEvent=confirmedGiftId&&Number.isSafeInteger(confirmedCoinAmount)&&confirmedCoinAmount>0?(()=>{
          const creator=db.users.find(member=>member.id===session.hostId);
          return {
            id:String(confirmedGiftId),
            broadcastId:String(session.id),
            giftCode:String(confirmedGift.giftCode||input.giftCode||''),
            giftName:String(confirmedGift.giftName||confirmedGift.name||input.giftCode||'Minglora Gift'),
            coinAmount:confirmedCoinAmount,
            emoji:String(confirmedGift.emoji||'🎁'),
            imageUrl:String(confirmedGift.imageUrl||confirmedGift.image_url||''),
            modelUrl:String(confirmedGift.modelUrl||confirmedGift.model_url||''),
            createdAt:confirmedAt.toISOString(),
            sender:{id:String(user.id),name:String(user.name||user.username||'Minglora member'),username:String(user.username||'')},
            recipient:{id:String(session.hostId),name:String(creator?.name||'LIVE host'),username:String(creator?.username||'')}
          };
        })():null;
        if(liveGiftEvent){
          try{
            await broadcastLiveKitData(session.roomName,{type:'minglora.live.gift',version:1,event:liveGiftEvent},'minglora-live-gift');
          }catch(error){
            console.warn('[Minglora LIVE gifts] Room-wide gift broadcast failed; polling remains the recovery path.',{
              broadcastId:session.id,giftId:String(confirmedGiftId),message:String(error?.message||'broadcast failed').slice(0,180)
            });
          }
        }
        return json(res,200,{gift:result.gift,event:liveGiftEvent,giftEventId:liveGiftEvent?.id||null});
      }
      if(method==='GET'&&p==='/api/admin/badge-controls/members'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrator can manage profile verification and gifter badges.'});
        }
        const search=new URL(req.url,'http://localhost').searchParams.get('search')||'';
        const result=await requestSupabaseState('profile_verification_admin_members',{
          adminUserId:user.id,adminEmail,search:String(search).slice(0,80)
        });
        const members=Array.isArray(result.members)?result.members:[];
        return json(res,200,{members});
      }
      if(method==='POST'&&p==='/api/admin/profile-verification/set'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrator can change profile verification.'});
        }
        const targetUserId=String(input.targetUserId||'').trim();
        const verificationStatus=String(input.verificationStatus||'');
        const note=String(input.note||'').trim().slice(0,1000);
        const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const allowedStatuses=['not_submitted','pending','needs_information','verified','rejected','suspended'];
        if(!uuidPattern.test(targetUserId)||!allowedStatuses.includes(verificationStatus)||note.length<5){
          return json(res,400,{error:'Choose a member, a valid verification status and a note of at least five characters.'});
        }
        const result=await requestSupabaseState('profile_verification_admin_set',{
          adminUserId:user.id,adminEmail,targetUserId,verificationStatus,note
        });
        const member=result.member||{};
        const localMember=db.users.find(item=>item.id===targetUserId);
        if(localMember){
          localMember.verificationStatus=member.verificationStatus||verificationStatus;
          localMember.verificationBadge=member.verificationBadge||'none';
          await saveStore();
        }
        return json(res,200,{ok:true,member,audit:result.audit||null});
      }
      if(method==='GET'&&p==='/api/admin/gifter-badges/status'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrator can inspect gifter badge controls.'});
        }
        const targetUserId=String(new URL(req.url,'http://localhost').searchParams.get('userId')||'').trim();
        const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if(!uuidPattern.test(targetUserId))return json(res,400,{error:'Choose a valid Minglora member account.'});
        const memberResult=await requestSupabaseState('profile_verification_admin_members',{
          adminUserId:user.id,adminEmail,search:targetUserId
        });
        const member=(memberResult.members||[]).find(item=>item.id===targetUserId);
        if(!member)return json(res,404,{error:'Minglora member account was not found.'});
        const override=(db.gifterBadgeAdminOverrides||[]).find(item=>item.userId===targetUserId)||null;
        return json(res,200,{
          member,
          badge:getGifterBadgeSummary(db,targetUserId),
          current:getGifterProgressionOverview(db,targetUserId).current,
          override:override?{
            grantedLevel:Number(override.grantedLevel||0),
            progressionResetAt:override.progressionResetAt||null,
            grantedAt:override.grantedAt||null,
            note:override.note||''
          }:null
        });
      }
      if(method==='POST'&&p==='/api/admin/gifter-badges/manage'){
        const adminEmail=normalizeEmail(user.email);
        const creatorHubAdminId='5b998c21-86b5-4621-ab37-e0808a2657b1';
        if(user.id!==creatorHubAdminId||adminEmail!=='creatorhubcreatornetwork@gmail.com'||
           user.role!=='platform_owner'||!isModerator(user,req)||!hasActiveReviewerSession(user)){
          return json(res,403,{error:'Only the MFA-verified CreatorHub administrator can grant or reset gifter badges.'});
        }
        const targetUserId=String(input.targetUserId||'').trim();
        const mode=String(input.mode||'');
        const level=Number(input.level);
        const note=String(input.note||'').trim().slice(0,240);
        const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if(!uuidPattern.test(targetUserId)||!['grant_level','unlock_all','reset'].includes(mode)||
           (mode==='grant_level'&&(!Number.isSafeInteger(level)||level<1||level>50))||note.length<5){
          return json(res,400,{error:'Choose a member, a level from 1–50 (when granting), an action and a note of at least five characters.'});
        }
        const memberResult=await requestSupabaseState('profile_verification_admin_members',{
          adminUserId:user.id,adminEmail,search:targetUserId
        });
        const target=(memberResult.members||[]).find(item=>item.id===targetUserId);
        if(!target)return json(res,404,{error:'Minglora member account was not found.'});

        db.gifterBadgeAdminOverrides ||= [];
        db.gifterBadgeAdminAudit ||= [];
        let override=db.gifterBadgeAdminOverrides.find(item=>item.userId===targetUserId);
        const previousGrantedLevel=Math.max(0,Math.min(50,Math.floor(Number(override?.grantedLevel)||0)));
        const previousResetAt=override?.progressionResetAt||null;
        if(!override){
          override={id:uid(),userId:targetUserId,grantedLevel:0,progressionResetAt:null,createdAt:now()};
          db.gifterBadgeAdminOverrides.push(override);
        }
        if(mode==='reset'){
          override.grantedLevel=0;
          override.grantedAt=null;
          override.grantedBy=null;
          override.progressionResetAt=now();
          override.resetBy=user.id;
          override.resetNote=note;
          override.note=note;
          override.updatedAt=now();
        }else{
          override.grantedLevel=mode==='unlock_all'?50:level;
          override.grantedAt=now();
          override.grantedBy=user.id;
          override.note=note;
          override.updatedAt=now();
          override.resetNote='';
        }
        const newGrantedLevel=Math.max(0,Math.min(50,Math.floor(Number(override.grantedLevel)||0)));
        const audit={
          id:uid(),targetUserId,targetEmail:target.email||'',targetUsername:target.username||'',
          actorUserId:user.id,actorEmail:adminEmail,action:mode,
          previousGrantedLevel,newGrantedLevel,previousResetAt,
          progressionResetAt:override.progressionResetAt||null,note,createdAt:now()
        };
        db.gifterBadgeAdminAudit.unshift(audit);
        if(db.gifterBadgeAdminAudit.length>1000)db.gifterBadgeAdminAudit.length=1000;
        await saveStore();
        const progression=getGifterProgressionOverview(db,targetUserId);
        return json(res,200,{
          ok:true,action:mode,member:target,
          badge:getGifterBadgeSummary(db,targetUserId),
          current:progression.current,
          override:{
            grantedLevel:newGrantedLevel,
            progressionResetAt:override.progressionResetAt||null,
            grantedAt:override.grantedAt||null,
            note:override.note||''
          },
          audit
        });
      }
      if(method==='GET'&&p==='/api/gifter-progression/overview'){
        await syncRefundedGiftActivity();
        return json(res,200,{viewerId:user.id,badge:getGifterBadgeSummary(db,user.id),...getGifterProgressionOverview(db,user.id)});
      }
      if(method==='GET'&&p==='/api/live/rankings/daily'){
        await syncRefundedGiftActivity();
        const dayKey=new Date().toISOString().slice(0,10);
        const totals=new Map();
        for(const event of (db.gifterProgressionLedger||[])){
          if(!event?.senderId||event.refundedAt||event.status==='refunded'||!String(event.createdAt||'').startsWith(dayKey))continue;
          const amount=Number(event.coinAmount);
          if(!Number.isSafeInteger(amount)||amount<=0)continue;
          const current=totals.get(event.senderId)||{points:0,giftsSent:0,lastGiftAt:event.createdAt};
          current.points+=amount;current.giftsSent++;
          if(String(event.createdAt)>String(current.lastGiftAt))current.lastGiftAt=event.createdAt;
          totals.set(event.senderId,current);
        }
        const leaderboard=[...totals.entries()]
          .sort((a,b)=>b[1].points-a[1].points||b[1].giftsSent-a[1].giftsSent)
          .slice(0,50)
          .map(([userId,score],index)=>{
            const member=db.users.find(candidate=>candidate.id===userId);
            return member&&!blockedBetween(user.id,member.id)?{
              position:index+1,user:safeUser(member,user.id),points:score.points,
              giftsSent:score.giftsSent,lastGiftAt:score.lastGiftAt,dayKey,
              gifterBadge:getGifterBadgeSummary(db,userId)
            }:null;
          }).filter(Boolean);
        return json(res,200,{dayKey,leaderboard,scoring:'confirmed LIVE Coin gifts sent'});
      }
      if(method==='GET'&&p==='/api/leagues/overview'){
        await syncRefundedGiftActivity();
        const overview=getCreatorLeagueOverview(db,user);
        await saveStore();
        return json(res,200,{viewerId:user.id,...overview});
      }
      if(method==='GET'&&p==='/api/leagues/matches'){
        await syncRefundedGiftActivity();
        const matches=listCreatorLeagueMatches(db,db.users,user.id);
        await saveStore();
        return json(res,200,{matches});
      }
      if(method==='POST'&&p==='/api/leagues/matches'){
        const ownSessionId=String(input.ownSessionId||'');
        const opponentSessionId=String(input.opponentSessionId||'');
        const ownSession=(db.liveSessions||[]).find(item=>item.id===ownSessionId&&item.status==='live');
        const opponentSession=(db.liveSessions||[]).find(item=>item.id===opponentSessionId&&item.status==='live');
        if(!ownSession||ownSession.hostId!==user.id)return json(res,409,{error:'Start your own LIVE broadcast before sending a League Match challenge.'});
        if(!opponentSession||opponentSession.hostId===user.id||blockedBetween(user.id,opponentSession.hostId))return json(res,404,{error:'Choose another available creator who is currently LIVE.'});
        const canViewOpponent=opponentSession.visibility==='public'||(opponentSession.visibility==='friends'&&isFriend(user.id,opponentSession.hostId));
        if(!canViewOpponent)return json(res,404,{error:'That LIVE session is not available to you.'});
        try{
          const [ownParticipants,opponentParticipants]=await Promise.all([
            listLiveKitParticipants(ownSession.roomName),
            listLiveKitParticipants(opponentSession.roomName)
          ]);
          if(!ownParticipants.some(participant=>participant.identity===user.id))return json(res,409,{error:'Your LIVE room must be connected before starting a League Match.'});
          if(!opponentParticipants.some(participant=>participant.identity===opponentSession.hostId))return json(res,409,{error:'The other creator is no longer connected to LIVE.'});
        }catch{
          return json(res,503,{error:'Minglora could not verify both LIVE rooms. Try again shortly.'});
        }
        try{
          const match=createCreatorLeagueMatch(db,{
            challengerId:user.id,opponentId:opponentSession.hostId,
            challengerSessionId:ownSession.id,opponentSessionId:opponentSession.id,
            giftMode:input.giftMode==='specific'?'specific':'all',
            selectedGiftCode:String(input.selectedGiftCode||'')
          });
          notify(opponentSession.hostId,user.id,'league_match',user.name+' challenged you to a Minglora League Match.');
          await saveStore();
          return json(res,201,{match});
        }catch(error){
          return json(res,error.status||400,{error:error.message||'The League Match challenge could not be created.'});
        }
      }
      let leagueMatchAction=p.match(/^\/api\/leagues\/matches\/([^/]+)\/(accept|support|powerups)$/);
      if(method==='POST'&&leagueMatchAction){
        let match=(db.creatorLeagueMatches||[]).find(item=>item.id===leagueMatchAction[1]);
        if(!match)return json(res,404,{error:'League Match not found.'});
        const action=leagueMatchAction[2];
        try{
          if(action==='accept'){
            if(match.status!=='pending')return json(res,409,{error:'This League Match invitation is no longer available.'});
            const sessions=[match.challengerSessionId,match.opponentSessionId].map(id=>(db.liveSessions||[]).find(item=>item.id===id&&item.status==='live'));
            if(sessions.some(item=>!item))return json(res,409,{error:'Both creators must still be LIVE to begin this match.'});
            const participantLists=await Promise.all(sessions.map(item=>listLiveKitParticipants(item.roomName)));
            if(!participantLists[0].some(item=>item.identity===match.challengerId)||!participantLists[1].some(item=>item.identity===match.opponentId))return json(res,409,{error:'Both creators must be connected to their LIVE rooms before accepting.'});
            acceptCreatorLeagueMatch(db,match,user.id);
            notify(match.challengerId,user.id,'league_match','Your League Match challenge was accepted.');
          }else if(action==='support'){
            supportCreatorLeagueMatch(db,match,user.id,String(input.side||''));
          }else{
            useCreatorLeaguePowerup(db,match,user.id,String(input.powerupId||''));
          }
          match=(db.creatorLeagueMatches||[]).find(item=>item.id===match.id)||match;
          await saveStore();
          return json(res,200,{match});
        }catch(error){
          return json(res,error.status||400,{error:error.message||'The League Match action could not be completed.'});
        }
      }
      let liveChat=p.match(/^\/api\/live\/sessions\/([^/]+)\/chat$/);
      if(liveChat&&['GET','POST'].includes(method)){
        const session=(db.liveSessions||[]).find(item=>item.id===liveChat[1]);
        if(!session||session.status!=='live'||blockedBetween(user.id,session.hostId))return json(res,404,{error:'LIVE session not found.'});
        if(session.liveSettings?.groupChatEnabled===false)return json(res,403,{error:'The host has disabled group LIVE chat for this broadcast.'});
        const friends=isFriend(user.id,session.hostId);
        const canView=session.hostId===user.id||session.visibility==='public'||(session.visibility==='friends'&&friends);
        if(!canView)return json(res,404,{error:'LIVE session not found.'});
        if(method==='GET')return json(res,200,await requestSupabaseState('live_chat_list',{broadcastId:session.id}));
        const sent=await requestSupabaseState('live_chat_send',{broadcastId:session.id,userId:user.id,body:String(input.body||'')});
        const fanPoint=awardLiveFanClubPoints(db,{hostId:session.hostId,fanId:user.id,source:'chat',points:1,sourceId:uid(),now:new Date()});
        if(fanPoint.awarded)await saveStore();
        return json(res,201,sent);
      }
      const liveChatDelete=p.match(/^\/api\/live\/sessions\/([^/]+)\/chat\/([^/]+)$/);
      if(method==='DELETE'&&liveChatDelete){
        const session=(db.liveSessions||[]).find(item=>item.id===liveChatDelete[1]&&item.status==='live');
        const canModerateLiveChat=Boolean(session&&(session.hostId===user.id||(session.liveModerators||[]).includes(user.id)));
        if(!session||!canModerateLiveChat)return json(res,403,{error:'Only the LIVE host or an assigned room moderator can remove comments.'});
        const result=await requestSupabaseState('live_chat_delete',{
          broadcastId:session.id,hostId:session.hostId,messageId:liveChatDelete[2]
        });
        return json(res,200,result);
      }
      if (method==='GET' && p==='/api/feed') {
        const scope=String(url.searchParams.get('scope')||'all');
        if(!['all','following','friends','for-you'].includes(scope))return json(res,400,{error:'Feed scope must be all, following, friends, or for-you.'});
        let eligibleIds=null;
        if(scope==='following'){
          eligibleIds=new Set([user.id,...(db.follows||[]).filter(f=>f.followerId===user.id).map(f=>f.followedId)]);
        } else if(scope==='friends'){
          eligibleIds=new Set([user.id,...db.friendships.filter(f=>f.status==='accepted'&&(f.from===user.id||f.to===user.id)).map(f=>f.from===user.id?f.to:f.from)]);
        }
        const visiblePosts=db.posts.filter(x=>x.status!=='hidden'&&!x.archivedAt&&!blockedBetween(user.id,x.userId)&&canViewProfile(user.id,db.users.find(profile=>profile.id===x.userId))&&(!eligibleIds||eligibleIds.has(x.userId)));
        const orderedPosts=scope==='for-you'
          ?rankForYouFeed(visiblePosts,user.id,db.follows||[],db.savedPosts||[])
          :visiblePosts.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        const posts=await Promise.all(orderedPosts.map(x=>publicPost(x,user.id)));
        if(!url.searchParams.has('limit')&&!url.searchParams.has('cursor'))return json(res,200,{posts,scope});
        if(scope==='for-you'){
          const limit=url.searchParams.has('limit')?Number(url.searchParams.get('limit')):20;
          const cursor=url.searchParams.get('cursor');
          const offset=cursor===null?0:Number(cursor);
          if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)return json(res,400,{error:'Invalid For You feed pagination.'});
          const page=posts.slice(offset,offset+limit+1);
          const hasMore=page.length>limit;
          const items=page.slice(0,limit);
          return json(res,200,{posts:items,nextCursor:hasMore?String(offset+limit):null,hasMore,scope});
        }
        try {
          const page=paginateDescending(posts,{limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):20,cursor:url.searchParams.get('cursor')});
          return json(res,200,{posts:page.items,nextCursor:page.nextCursor,hasMore:page.hasMore,scope});
        } catch (e) { return json(res,400,{error:e.message}); }
      }
      if(method==='GET'&&p==='/api/sounds'){
        const query=String(url.searchParams.get('q')||'').trim().toLowerCase();
        const sort=String(url.searchParams.get('sort')||'trending');
        const favorites=new Set((db.soundFavorites||[]).filter(item=>item.userId===user.id).map(item=>item.soundId));
        const usageCounts=soundUsageCounts(db);
        let sounds=(db.sounds||[]).filter(sound=>
          sound.status==='active'&&(sound.allowReuse===true||sound.ownerId===user.id)&&
          !blockedBetween(user.id,sound.ownerId)&&
          (!query||[sound.title,sound.attribution,db.users.find(item=>item.id===sound.ownerId)?.username].some(value=>String(value||'').toLowerCase().includes(query)))
        );
        if(sort==='mine')sounds=sounds.filter(sound=>sound.ownerId===user.id);
        if(sort==='saved')sounds=sounds.filter(sound=>favorites.has(sound.id));
        if(sort==='new')sounds.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        else if(sort==='mine')sounds.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        else sounds.sort((a,b)=>(usageCounts.get(b.id)||0)-(usageCounts.get(a.id)||0)||new Date(b.createdAt)-new Date(a.createdAt));
        const cards=await Promise.all(sounds.slice(0,60).map(sound=>publicSoundCard(sound,user.id,usageCounts)));
        return json(res,200,{sounds:cards.filter(Boolean),sort,hasLicensedCatalogue:false});
      }
      if(method==='POST'&&p==='/api/sounds'){
        const validation=validateSoundInput(input);
        if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')});
        const asset=(db.mediaAssets||[]).find(item=>item.id===String(input.assetId||'')&&item.ownerId===user.id&&item.slot==='sound'&&item.status==='uploaded');
        if(!asset||asset.mediaType!=='audio'||!SOUND_AUDIO_MIME_TYPES.includes(asset.mimeType)){
          return json(res,400,{error:'Upload a supported audio recording before publishing your original sound.'});
        }
        if((db.sounds||[]).some(sound=>sound.assetId===asset.id))return json(res,409,{error:'This recording has already been added to Minglora Sounds.'});
        const sound={id:uid(),ownerId:user.id,assetId:asset.id,...validation.value,status:'active',createdAt:now()};
        db.sounds.push(sound);asset.status='attached';asset.attachedTo='sound:'+sound.id;
        await saveStore();
        const card=await publicSoundCard(sound,user.id);
        return json(res,201,{sound:card});
      }
      let soundFavorite=p.match(/^\/api\/sounds\/([^/]+)\/favorite$/);
      if(soundFavorite&&(method==='POST'||method==='DELETE')){
        const sound=(db.sounds||[]).find(item=>item.id===soundFavorite[1]);
        if(!sound||!canUseSound(sound,user.id)||blockedBetween(user.id,sound.ownerId))return json(res,404,{error:'Sound not found or unavailable for reuse.'});
        const exists=(db.soundFavorites||[]).some(item=>item.userId===user.id&&item.soundId===sound.id);
        if(method==='POST'&&!exists)db.soundFavorites.push({id:uid(),userId:user.id,soundId:sound.id,createdAt:now()});
        if(method==='DELETE'&&exists)db.soundFavorites=db.soundFavorites.filter(item=>!(item.userId===user.id&&item.soundId===sound.id));
        await saveStore();
        return json(res,200,{favorite:method==='POST',soundId:sound.id});
      }
      let soundRoute=p.match(/^\/api\/sounds\/([^/]+)$/);
      if(method==='DELETE'&&soundRoute){
        const sound=(db.sounds||[]).find(item=>item.id===soundRoute[1]);
        if(!sound)return json(res,404,{error:'Sound not found.'});
        if(sound.ownerId!==user.id)return json(res,403,{error:'Only the sound creator can remove it from the library.'});
        sound.status='archived';sound.archivedAt=now();
        await saveStore();
        return json(res,200,{ok:true,id:sound.id});
      }
      if(method==='POST'&&p==='/api/posts'){
        const validation=validatePostInput(input);if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')});
        const {text,mediaIds}=validation.value;const ids=[...new Set(mediaIds)];
        let soundtrack=null;try{soundtrack=resolveSoundtrackForUser(user.id,input.soundtrack);}catch(error){return json(res,error.status||400,{error:error.message});}
        const assets=ids.map(id=>(db.mediaAssets||[]).find(asset=>asset.id===id&&asset.ownerId===user.id&&asset.slot==='post'&&asset.status==='uploaded'));
        if(assets.some(asset=>!asset))return json(res,400,{error:'One or more selected media files are no longer available. Upload them again.'});
        const post={id:uid(),userId:user.id,text,mediaIds:ids,soundtrack,createdAt:now(),reactions:{},comments:[]};
        assets.forEach(asset=>{asset.status='attached';asset.attachedTo=post.id;});db.posts.unshift(post);await saveStore();return json(res,201,{post:await publicPost(post,user.id)});
      }
      let m=p.match(/^\/api\/posts\/([^/]+)$/);
      if(method==='PATCH'&&m){
        const post=db.posts.find(x=>x.id===m[1]);
        if(!post)return json(res,404,{error:'Post not found.'});
        if(post.userId!==user.id)return json(res,403,{error:'Only the post author can edit this post.'});
        const validation=validatePostInput({text:input.text===undefined?post.text:input.text,mediaIds:input.mediaIds===undefined?(post.mediaIds||[]):input.mediaIds,imageUrl:input.imageUrl});
        if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')});
        let nextSoundtrack=post.soundtrack||null;
        if(Object.prototype.hasOwnProperty.call(input,'soundtrack')){try{nextSoundtrack=resolveSoundtrackForUser(user.id,input.soundtrack);}catch(error){return json(res,error.status||400,{error:error.message});}}
        const ids=[...new Set(validation.value.mediaIds)],assets=ids.map(id=>(db.mediaAssets||[]).find(asset=>asset.id===id&&asset.ownerId===user.id&&asset.slot==='post'&&(asset.status==='uploaded'||asset.attachedTo===post.id)));
        if(assets.some(asset=>!asset))return json(res,400,{error:'One or more selected media files are not available to this post.'});
        (db.mediaAssets||[]).filter(asset=>asset.attachedTo===post.id&&!ids.includes(asset.id)).forEach(asset=>{asset.status='uploaded';delete asset.attachedTo;});
        assets.forEach(asset=>{asset.status='attached';asset.attachedTo=post.id;});
        post.text=validation.value.text;post.mediaIds=ids;post.soundtrack=nextSoundtrack;post.updatedAt=now();await saveStore();return json(res,200,{post:await publicPost(post,user.id)});
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
        const posts=await Promise.all((db.savedPosts||[]).filter(saved=>saved.userId===user.id).map(saved=>db.posts.find(post=>post.id===saved.postId)).filter(post=>post&&post.status!=='hidden'&&!post.archivedAt&&!blockedBetween(user.id,post.userId)).map(post=>publicPost(post,user.id)));
        return json(res,200,{posts});
      }
      m=p.match(/^\/api\/posts\/([^/]+)\/save$/);
      if((method==='POST'||method==='DELETE')&&m){
        const post=db.posts.find(x=>x.id===m[1]);
        if(!post||post.status==='hidden'||post.archivedAt||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});
        const exists=(db.savedPosts||[]).some(saved=>saved.userId===user.id&&saved.postId===post.id);
        if(method==='POST'&&!exists)db.savedPosts.push({id:uid(),userId:user.id,postId:post.id,createdAt:now()});
        if(method==='DELETE'&&exists)db.savedPosts=db.savedPosts.filter(saved=>!(saved.userId===user.id&&saved.postId===post.id));
        await saveStore();return json(res,200,{saved:method==='POST'});
      }
      m=p.match(/^\/api\/posts\/([^/]+)\/reactions$/);
      if(method==='POST'&&m){const post=db.posts.find(x=>x.id===m[1]);if(!post||post.status==='hidden'||post.archivedAt||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});post.reactions ||= {};const reaction=String(input.reaction||'like');if(!['like','love','care','haha','wow','sad','angry'].includes(reaction))return json(res,400,{error:'Unsupported reaction.'});if(post.reactions[user.id]===reaction)delete post.reactions[user.id];else post.reactions[user.id]=reaction;if(post.userId!==user.id)notify(post.userId,user.id,'reaction',`${user.name} reacted to your post.`);await saveStore();return json(res,200,{post:await publicPost(post,user.id)});}
      m=p.match(/^\/api\/posts\/([^/]+)\/comments\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const post=db.posts.find(x=>x.id===m[1]);
        if(!post||post.status==='hidden'||post.archivedAt||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});
        const comment=(post.comments||[]).find(x=>x.id===m[2]);
        if(!comment)return json(res,404,{error:'Comment not found.'});
        if(comment.userId!==user.id&&post.userId!==user.id)return json(res,403,{error:'Only the comment author or post author can delete this comment.'});
        post.comments=post.comments.filter(x=>x.id!==comment.id);
        await saveStore();return json(res,200,{ok:true,id:comment.id});
      }
      m=p.match(/^\/api\/posts\/([^/]+)\/comments$/);
      if(method==='POST'&&m){const post=db.posts.find(x=>x.id===m[1]);const text=String(input.text||'').trim();if(!post||post.status==='hidden'||post.archivedAt||blockedBetween(user.id,post.userId))return json(res,404,{error:'Post not found.'});if(!text||text.length>2000)return json(res,400,{error:'Comment must contain 1–2000 characters.'});const postOwner=db.users.find(member=>member.id===post.userId);const commentAudience=getUserSettings(postOwner).privacy.commentAudience||'everyone';if(user.id!==post.userId&&(commentAudience==='nobody'||(commentAudience==='friends'&&!isFriend(user.id,post.userId))))return json(res,403,{error:'This creator has limited who can comment on their posts.'});const comment={id:uid(),userId:user.id,text,createdAt:now()};post.comments.push(comment);if(post.userId!==user.id)notify(post.userId,user.id,'comment',`${user.name} commented on your post.`);await saveStore();return json(res,201,{comment:{...comment,author:safeUser(user)}});}
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

      m=p.match(/^\/api\/users\/([^/]+)\/(followers|following|subscribers)$/);
      if(method==='GET'&&m){
        await syncRefundedGiftActivity();
        const target=db.users.find(member=>member.id===m[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        const relationshipType=m[2];
        const listPrivacyKey={followers:'followersListAudience',following:'followingListAudience',subscribers:'subscribersListAudience'}[relationshipType];
        const listAudience=getUserSettings(target).privacy[listPrivacyKey]||'public';
        if(!canViewProfileAudience(user.id,target.id,listAudience))return json(res,404,{error:'This relationship list is not available.'});
        if(relationshipType==='subscribers'){
          const subscriptions=listActiveCreatorSubscriptions(db.creatorSubscriptions,target.id);
          const seen=new Set(),users=[];
          for(const subscription of subscriptions){
            const id=subscription.subscriberId;
            if(!id||seen.has(id))continue;
            seen.add(id);
            const member=db.users.find(item=>item.id===id);
            if(!member||blockedBetween(user.id,member.id)||!canViewProfile(user.id,member))continue;
            users.push(safeUser(member,user.id));
          }
          return json(res,200,{users,count:users.length,totalCount:subscriptions.length,relationship:relationshipType});
        }
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
      if(method==='GET'&&p==='/api/profile-views'){
        const enabled=getUserSettings(user).notifications.profileViews===true;
        if(!enabled)return json(res,200,{enabled:false,viewers:[]});
        const cutoff=Date.now()-30*24*60*60*1000;
        const recent=(db.profileViews||[]).filter(view=>
          view.targetUserId===user.id&&view.historyEligible===true&&view.viewerUserId!==user.id&&
          Number.isFinite(new Date(view.viewedAt).getTime())&&new Date(view.viewedAt).getTime()>=cutoff
        ).sort((a,b)=>new Date(b.viewedAt)-new Date(a.viewedAt));
        const latestByViewer=new Map();
        for(const view of recent){
          const viewer=db.users.find(member=>member.id===view.viewerUserId);
          if(!viewer||blockedBetween(user.id,viewer.id)||!canViewProfile(user.id,viewer)||getUserSettings(viewer).notifications.profileViews!==true)continue;
          const current=latestByViewer.get(view.viewerUserId);
          if(current)current.visitCount+=1;
          else latestByViewer.set(view.viewerUserId,{user:safeUser(viewer,user.id),lastViewedAt:view.viewedAt,visitCount:1});
        }
        return json(res,200,{enabled:true,windowDays:30,viewers:[...latestByViewer.values()]});
      }
      m=p.match(/^\/api\/users\/([^/]+)\/(followers|following|friends)$/);
      if(method==='GET'&&m){
        const target=db.users.find(u=>u.id===m[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        const listAudience=getUserSettings(target).privacy.friendsListAudience||'public';
        if(!canViewProfileAudience(user.id,target.id,listAudience))return json(res,404,{error:'This friends list is not available.'});
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
      const profileSectionsMatch=p.match(/^\/api\/users\/([^/]+)\/profile-sections$/);
      if(method==='GET'&&profileSectionsMatch){
        const target=db.users.find(member=>member.id===profileSectionsMatch[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        return json(res,200,{sections:readProfileSections(target.id)});
      }
      if(method==='PATCH'&&p==='/api/profile-sections'){
        if(!input.sections||typeof input.sections!=='object'||Array.isArray(input.sections))return json(res,400,{error:'Profile sections must be an object.'});
        const allowed=Object.keys(DEFAULT_PROFILE_SECTIONS);
        for(const [key,value] of Object.entries(input.sections)){
          if(!allowed.includes(key)||typeof value!=='boolean')return json(res,400,{error:'Unsupported profile section preference.'});
        }
        db.profileSections ||= [];
        let saved=db.profileSections.find(item=>item.userId===user.id);
        if(!saved){saved={userId:user.id,sections:{...DEFAULT_PROFILE_SECTIONS},updatedAt:now()};db.profileSections.push(saved);}
        saved.sections={...DEFAULT_PROFILE_SECTIONS,...saved.sections,...input.sections};saved.updatedAt=now();
        recordProfileActivity(user.id,'profile_sections_updated','Updated profile section visibility.');
        await saveStore();return json(res,200,{sections:saved.sections});
      }
      const profileStatusMatch=p.match(/^\/api\/users\/([^/]+)\/profile-status$/);
      if(method==='GET'&&profileStatusMatch){
        const target=db.users.find(member=>member.id===profileStatusMatch[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        const status=(db.profileStatuses||[]).filter(item=>item.userId===target.id&&Date.parse(item.expiresAt)>Date.now()&&canViewProfileAudience(user.id,target.id,item.audience)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0]||null;
        return json(res,200,{status:status?{text:status.text,mood:status.mood,audience:status.audience,expiresAt:status.expiresAt,createdAt:status.createdAt}:null});
      }
      if(method==='DELETE'&&p==='/api/profile-status'){
        const previous=(db.profileStatuses||[]).filter(item=>item.userId===user.id).length;
        db.profileStatuses=(db.profileStatuses||[]).filter(item=>item.userId!==user.id);
        if(previous)recordProfileActivity(user.id,'profile_thought_deleted','Removed profile thought.');
        await saveStore();return json(res,200,{ok:true,status:null});
      }
      if(method==='POST'&&p==='/api/profile-status'){
        const text=String(input.text||'').trim(),mood=String(input.mood||'').trim().slice(0,24),audience=String(input.audience||'public');
        if(!text||text.length>120)return json(res,400,{error:'Profile status must contain 1–120 characters.'});
        if(!['public','friends','followers','private'].includes(audience))return json(res,400,{error:'Unsupported profile status audience.'});
        const expiresInHours=Math.max(1,Math.min(168,Number(input.expiresInHours)||24));
        db.profileStatuses ||= [];
        db.profileStatuses=db.profileStatuses.filter(item=>item.userId!==user.id);
        const status={id:uid(),userId:user.id,text,mood,audience,createdAt:now(),expiresAt:new Date(Date.now()+expiresInHours*60*60*1000).toISOString()};
        db.profileStatuses.unshift(status);recordProfileActivity(user.id,'profile_status_updated','Updated profile status.');
        await saveStore();return json(res,201,{status});
      }
      const checkInsMatch=p.match(/^\/api\/users\/([^/]+)\/check-ins$/);
      if(method==='GET'&&checkInsMatch){
        const target=db.users.find(member=>member.id===checkInsMatch[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        const checkIns=(db.checkIns||[]).filter(item=>item.userId===target.id&&canViewProfileAudience(user.id,target.id,item.visibility)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,100);
        return json(res,200,{checkIns});
      }
      if(method==='POST'&&p==='/api/check-ins'){
        const place=String(input.place||'').trim(),note=String(input.note||'').trim(),visibility=String(input.visibility||'public');
        if(place.length<2||place.length>120||note.length>500)return json(res,400,{error:'Place must be 2–120 characters and the note must be 500 characters or fewer.'});
        if(!['public','friends','followers','private'].includes(visibility))return json(res,400,{error:'Unsupported check-in audience.'});
        db.checkIns ||= [];
        const checkIn={id:uid(),userId:user.id,place,note,visibility,createdAt:now()};
        db.checkIns.unshift(checkIn);recordProfileActivity(user.id,'check_in_created','Checked in at '+place+'.','check_in',checkIn.id);
        await saveStore();return json(res,201,{checkIn});
      }
      const profileEventsMatch=p.match(/^\/api\/users\/([^/]+)\/events$/);
      if(method==='GET'&&profileEventsMatch){
        const target=db.users.find(member=>member.id===profileEventsMatch[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        const events=(db.events||[]).filter(event=>(event.hostId===target.id||(db.eventRsvps||[]).some(rsvp=>rsvp.eventId===event.id&&rsvp.userId===target.id))&&canViewProfileAudience(user.id,event.hostId,event.visibility)).map(event=>({...event,host:safeUser(db.users.find(member=>member.id===event.hostId),user.id),rsvpCount:(db.eventRsvps||[]).filter(rsvp=>rsvp.eventId===event.id&&rsvp.status==='going').length,myRsvp:(db.eventRsvps||[]).find(rsvp=>rsvp.eventId===event.id&&rsvp.userId===user.id)?.status||null})).sort((a,b)=>new Date(a.startAt)-new Date(b.startAt)).slice(0,100);
        return json(res,200,{events});
      }
      if(method==='POST'&&p==='/api/events'){
        const title=String(input.title||'').trim(),description=String(input.description||'').trim(),location=String(input.location||'').trim(),visibility=String(input.visibility||'public');
        const startTime=Date.parse(input.startAt||''),endTime=input.endAt?Date.parse(input.endAt):null;
        if(title.length<3||title.length>100||description.length>2000||location.length>160||!Number.isFinite(startTime)||startTime<Date.now()-60000||(endTime!==null&&(!Number.isFinite(endTime)||endTime<=startTime)))return json(res,400,{error:'Enter an event title, valid future start time, optional later end time, and valid details.'});
        if(!['public','friends','private'].includes(visibility))return json(res,400,{error:'Unsupported event audience.'});
        db.events ||= [];db.eventRsvps ||= [];
        const event={id:uid(),hostId:user.id,title,description,location,visibility,startAt:new Date(startTime).toISOString(),endAt:endTime?new Date(endTime).toISOString():null,createdAt:now()};
        db.events.unshift(event);db.eventRsvps.unshift({id:uid(),eventId:event.id,userId:user.id,status:'going',createdAt:now()});
        recordProfileActivity(user.id,'event_created','Created event: '+title+'.','event',event.id);
        await saveStore();return json(res,201,{event});
      }
      const eventRsvpMatch=p.match(/^\/api\/events\/([^/]+)\/rsvp$/);
      if(eventRsvpMatch&&(method==='POST'||method==='DELETE')){
        const event=(db.events||[]).find(item=>item.id===eventRsvpMatch[1]);
        if(!event)return json(res,404,{error:'Event not found.'});
        if(!canViewProfileAudience(user.id,event.hostId,event.visibility))return json(res,404,{error:'Event not found.'});
        db.eventRsvps ||= [];
        if(method==='DELETE'){
          db.eventRsvps=db.eventRsvps.filter(item=>!(item.eventId===event.id&&item.userId===user.id));
          await saveStore();return json(res,200,{rsvp:null});
        }
        const status=String(input.status||'going');
        if(!['going','interested'].includes(status))return json(res,400,{error:'RSVP must be going or interested.'});
        let rsvp=db.eventRsvps.find(item=>item.eventId===event.id&&item.userId===user.id);
        if(!rsvp){rsvp={id:uid(),eventId:event.id,userId:user.id,status,createdAt:now()};db.eventRsvps.unshift(rsvp);}else rsvp.status=status;
        recordProfileActivity(user.id,'event_rsvp_updated','Responded '+status+' to '+event.title+'.','event',event.id);
        await saveStore();return json(res,200,{rsvp});
      }
      const profileHighlightsMatch=p.match(/^\/api\/users\/([^/]+)\/highlights$/);
      if(method==='GET'&&profileHighlightsMatch){
        const target=db.users.find(member=>member.id===profileHighlightsMatch[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        const highlights=await Promise.all((db.profileHighlights||[]).filter(item=>item.userId===target.id).map(async item=>{
          const source=(item.storyIds||[]).map(id=>(db.stories||[]).find(story=>story.id===id)||(db.storyArchives||[]).find(story=>story.id===id)).filter(story=>story&&canViewStory(user.id,story));
          if(!source.length)return null;
          const first=source[0],asset=first?.mediaId?(db.mediaAssets||[]).find(media=>media.id===first.mediaId&&media.ownerId===target.id):null;
          let coverUrl=null;if(asset){try{coverUrl=await resolveAssetUrl(asset);}catch{}}
          return {id:item.id,title:item.title,storyCount:source.length,createdAt:item.createdAt,coverUrl};
        }));
        return json(res,200,{highlights:highlights.filter(Boolean)});
      }
      if(method==='POST'&&p==='/api/highlights'){
        const title=String(input.title||'').trim(),storyIds=Array.isArray(input.storyIds)?[...new Set(input.storyIds.map(String))]:[];
        if(title.length<1||title.length>50||storyIds.length<1||storyIds.length>20)return json(res,400,{error:'A highlight needs a title and 1–20 of your stories.'});
        const ownedIds=new Set([...(db.stories||[]),...(db.storyArchives||[])].filter(story=>story.userId===user.id).map(story=>story.id));
        if(storyIds.some(id=>!ownedIds.has(id)))return json(res,400,{error:'Choose only stories from your own story archive.'});
        db.profileHighlights ||= [];
        const highlight={id:uid(),userId:user.id,title,storyIds,createdAt:now()};
        db.profileHighlights.unshift(highlight);recordProfileActivity(user.id,'profile_highlight_created','Added profile highlight: '+title+'.','highlight',highlight.id);
        await saveStore();return json(res,201,{highlight});
      }
      const highlightDeleteMatch=p.match(/^\/api\/highlights\/([^/]+)$/);
      if(method==='DELETE'&&highlightDeleteMatch){
        const highlight=(db.profileHighlights||[]).find(item=>item.id===highlightDeleteMatch[1]);
        if(!highlight)return json(res,404,{error:'Highlight not found.'});
        if(highlight.userId!==user.id)return json(res,403,{error:'Only the profile owner can remove this highlight.'});
        db.profileHighlights=db.profileHighlights.filter(item=>item.id!==highlight.id);
        recordProfileActivity(user.id,'profile_highlight_deleted','Removed profile highlight: '+highlight.title+'.','highlight',highlight.id);
        await saveStore();return json(res,200,{ok:true});
      }
      const storyArchiveMatch=p.match(/^\/api\/users\/([^/]+)\/story-archive$/);
      if(method==='GET'&&storyArchiveMatch){
        await pruneExpiredStories();
        const target=db.users.find(member=>member.id===storyArchiveMatch[1]);
        if(!target||target.id!==user.id)return json(res,404,{error:'Story archive is private to its owner.'});
        const archived=await Promise.all((db.storyArchives||[]).filter(story=>story.userId===user.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(async story=>{
          const asset=story.mediaId?(db.mediaAssets||[]).find(item=>item.id===story.mediaId&&item.ownerId===user.id):null;
          let media=null;if(asset){try{media={mediaType:asset.mediaType,url:await resolveAssetUrl(asset)};}catch{}}
          return {id:story.id,text:story.text||'',createdAt:story.createdAt,archivedAt:story.archivedAt||story.expiresAt,media};
        }));
        return json(res,200,{stories:archived});
      }
      if(method==='GET'&&p==='/api/profile/archive'){
        const posts=await Promise.all((db.posts||[]).filter(post=>post.userId===user.id&&post.archivedAt).sort((a,b)=>new Date(b.archivedAt)-new Date(a.archivedAt)).map(post=>publicPost(post,user.id)));
        return json(res,200,{posts});
      }
      if(method==='POST'&&p==='/api/profile/archive'){
        const post=(db.posts||[]).find(item=>item.id===String(input.postId||''));
        if(!post)return json(res,404,{error:'Post not found.'});
        if(post.userId!==user.id)return json(res,403,{error:'Only your own posts can be archived.'});
        if(post.archivedAt)return json(res,409,{error:'This post is already archived.'});
        post.archivedAt=now();recordProfileActivity(user.id,'post_archived','Archived a post.','post',post.id);
        await saveStore();return json(res,200,{ok:true});
      }
      const restoreArchiveMatch=p.match(/^\/api\/profile\/archive\/([^/]+)$/);
      if(method==='DELETE'&&restoreArchiveMatch){
        const post=(db.posts||[]).find(item=>item.id===restoreArchiveMatch[1]&&item.userId===user.id);
        if(!post||!post.archivedAt)return json(res,404,{error:'Archived post not found.'});
        delete post.archivedAt;recordProfileActivity(user.id,'post_restored','Restored an archived post.','post',post.id);
        await saveStore();return json(res,200,{ok:true});
      }
      const profileActivityMatch=p.match(/^\/api\/users\/([^/]+)\/activity$/);
      if(method==='GET'&&profileActivityMatch){
        const target=db.users.find(member=>member.id===profileActivityMatch[1]);
        if(!target||target.id!==user.id)return json(res,404,{error:'Activity log is private to its owner.'});
        const activity=[
          ...(db.profileActivity||[]).filter(item=>item.userId===user.id),
          ...(db.auditLog||[]).filter(item=>item.actorId===user.id).map(item=>({id:item.id,userId:user.id,action:item.action,summary:item.action.replace(/_/g,' '),targetType:item.targetType,targetId:item.targetId,createdAt:item.createdAt}))
        ].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,250);
        return json(res,200,{activity});
      }
      m=p.match(/^\/api\/users\/([^/]+)\/gift-gallery$/);
      if(method==='GET'&&m){
        const target=db.users.find(member=>member.id===m[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        const gallery=getGiftGallery(db,target);
        const entries=gallery.entries.map(entry=>{
          const leader=entry.leadingGifterId?db.users.find(member=>member.id===entry.leadingGifterId):null;
          return {...entry,leadingGifter:leader?safeUser(leader,user.id):null};
        });
        const response={...gallery,entries};
        if(user.id===target.id){
          const settings=(db.giftGallerySettings||[]).find(item=>item.userId===user.id)||{enabled:true,targets:{}};
          const preference=(db.giftGalleryPreferences||[]).find(item=>item.userId===user.id)||{showInGalleries:true};
          response.ownerSettings={enabled:settings.enabled!==false,targets:{...(settings.targets||{})}};
          response.viewerPreference={showInGalleries:preference.showInGalleries!==false};
        }
        return json(res,200,response);
      }
      if(method==='PATCH'&&p==='/api/gift-gallery/settings'){
        if(input.enabled!==undefined&&typeof input.enabled!=='boolean')return json(res,400,{error:'Gift Gallery visibility must be enabled or disabled.'});
        if(input.showInGalleries!==undefined&&typeof input.showInGalleries!=='boolean')return json(res,400,{error:'Gift Gallery privacy must be enabled or disabled.'});
        try{
          const result=updateGiftGallerySettings(db,{
            userId:user.id,enabled:input.enabled,showInGalleries:input.showInGalleries,
            giftCode:input.giftCode,targetCount:input.targetCount
          });
          await saveStore();
          return json(res,200,result);
        }catch(error){
          return json(res,400,{error:error.message||'Gift Gallery settings could not be saved.'});
        }
      }
      m=p.match(/^\/api\/users\/([^/]+)\/creator-league$/);
      if(method==='GET'&&m){
        const target=db.users.find(member=>member.id===m[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        const leagueUser=safeUser(target,user.id);
        return json(res,200,{creatorLeague:leagueUser?.creatorLeague||null});
      }
      m=p.match(/^\/api\/users\/([^/]+)$/);
      if(method==='GET'&&m){
        const target=db.users.find(member=>member.id===m[1]);
        if(!target||blockedBetween(user.id,target.id)||!canViewProfile(user.id,target))return json(res,404,{error:'Profile not found.'});
        db.profileViews ||= [];
        db.profileViewPresence ||= [];
        const mayRecordProfileView=target.id!==user.id&&getUserSettings(user).notifications.profileViews===true&&getUserSettings(target).notifications.profileViews===true;
        if(mayRecordProfileView&&recordProfileView(db.profileViews,{targetUserId:target.id,viewerUserId:user.id,at:new Date()})){
          const recordedView=db.profileViews.at(-1);
          recordedView.historyEligible=true;
          notify(target.id,user.id,'profile_view',(user.name||'A Minglora member')+' viewed your profile',{profileViewAt:recordedView.viewedAt});
          await saveStore();
        }
        const profileInsights=target.id===user.id
          ?getProfileViewStats({views:db.profileViews.filter(view=>view.historyEligible===true),presence:db.profileViewPresence,targetUserId:target.id})
          :undefined;
        const profilePosts=await Promise.all(db.posts.filter(post=>post.status!=='hidden'&&!post.archivedAt&&post.userId===target.id&&!blockedBetween(user.id,post.userId)).map(post=>publicPost(post,user.id)));
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
          profileSections:readProfileSections(target.id),
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
          subscribersCount:listActiveCreatorSubscriptions(db.creatorSubscriptions,target.id).filter(subscription=>!blockedBetween(user.id,subscription.subscriberId)).length,
          likesCount:profilePosts.reduce((total,post)=>total+Object.values(post.reactions||{}).filter(reaction=>reaction==='like').length,0),
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
      db.groups ||= [];
      db.groupMembershipRequests ||= [];
      db.groupInvitations ||= [];
      db.groupModerationActions ||= [];
      db.groupAuditLogs ||= [];
      db.groupAnnouncements ||= [];
      db.groupRules ||= [];
      db.groupEvents ||= [];
      const recordGroupAudit=(group,action,targetType=null,targetId=null,details={})=>{
        db.groupAuditLogs.unshift({id:uid(),groupId:group.id,actorId:user.id,action,targetType,targetId,details,createdAt:now()});
        if(db.groupAuditLogs.length>5000)db.groupAuditLogs.length=5000;
      };
      const ensureGroupRoles=group=>{
        group.members ||= [];
        group.memberships ||= [];
        if(group.ownerId&&!group.members.includes(group.ownerId))group.members.unshift(group.ownerId);
        if(group.ownerId&&!group.memberships.some(item=>item.userId===group.ownerId)){
          group.memberships.push({userId:group.ownerId,role:'owner',status:'active',joinedAt:group.createdAt||now()});
        }
        for(const id of group.members){
          if(!group.memberships.some(item=>item.userId===id&&item.status==='active')){
            group.memberships.push({userId:id,role:'member',status:'active',joinedAt:group.createdAt||now()});
          }
        }
        return group;
      };
      const setGroupMembership=(group,targetId,role='member',status='active')=>{
        ensureGroupRoles(group);
        let record=group.memberships.find(item=>item.userId===targetId);
        if(!record){record={userId:targetId,role,status,joinedAt:now()};group.memberships.push(record);}
        const wasActive=record.status==='active';
        record.role=role;record.status=status;record.updatedAt=now();
        if(status==='active'&&!wasActive)record.joinedAt=now();
        if(status==='active'&&!group.members.includes(targetId))group.members.push(targetId);
        if(status!=='active')group.members=group.members.filter(id=>id!==targetId);
        return record;
      };
      const safeGroupSummary=(group)=>{
        ensureGroupRoles(group);
        const role=getGroupRole(group,user.id);
        return {
          id:group.id,name:group.name,description:group.description||'',category:group.category||'',
          topics:Array.isArray(group.topics)?group.topics:[],visibility:group.visibility||'public',
          discoverable:group.discoverable!==false,status:group.status||'active',
          ownerId:group.ownerId,owner:safeUser(db.users.find(u=>u.id===group.ownerId),user.id),
          memberCount:group.members.length,isMember:!!role,role,
          hasPendingRequest:db.groupMembershipRequests.some(r=>r.groupId===group.id&&r.userId===user.id&&r.status==='pending'),
          createdAt:group.createdAt,updatedAt:group.updatedAt||group.createdAt
        };
      };
      const notifyGroupStaff=(group,actorId,type,message,extra={})=>{
        ensureGroupRoles(group);
        const recipients=new Set([group.ownerId,...group.memberships.filter(item=>item.status==='active'&&['owner','admin','moderator'].includes(item.role)).map(item=>item.userId)]);
        for(const recipientId of recipients)if(recipientId&&recipientId!==actorId)notify(recipientId,actorId,type,message,{groupId:group.id,groupName:group.name,...extra});
      };
      const notifyGroupMembers=(group,actorId,type,message,extra={})=>{
        ensureGroupRoles(group);
        for(const memberId of new Set(group.members))if(memberId&&memberId!==actorId&&!blockedBetween(memberId,actorId))notify(memberId,actorId,type,message,{groupId:group.id,groupName:group.name,...extra});
      };
      if(method==='GET'&&p==='/api/groups'){
        const query=String(url.searchParams.get('q')||'').trim().toLowerCase();
        const category=String(url.searchParams.get('category')||'').trim().toLowerCase();
        const scope=String(url.searchParams.get('scope')||'discover');
        const groups=db.groups.filter(group=>{
          ensureGroupRoles(group);
          const member=!!getGroupRole(group,user.id);
          if(scope==='mine'&&!member)return false;
          if(!member&&!canDiscoverGroup(group))return false;
          if(query&&!((group.name+' '+(group.description||'')+' '+(group.category||'')+' '+(group.topics||[]).join(' ')).toLowerCase().includes(query)))return false;
          if(category&&String(group.category||'').toLowerCase()!==category)return false;
          return group.status!=='deleted'&&group.status!=='archived';
        }).map(safeGroupSummary);
        return json(res,200,{groups});
      }
      if(method==='POST'&&p==='/api/groups'){
        const name=String(input.name||'').trim(),description=String(input.description||'').trim();
        const visibility=String(input.visibility||'public');
        const category=String(input.category||'').trim().slice(0,80);
        const topics=Array.isArray(input.topics)?[...new Set(input.topics.map(x=>String(x).trim().slice(0,40)).filter(Boolean))].slice(0,12):String(input.topics||'').split(',').map(x=>x.trim().slice(0,40)).filter(Boolean).slice(0,12);
        if(name.length<3||name.length>80||description.length>500)return json(res,400,{error:'Group name must be 3–80 characters; description max 500.'});
        if(!['public','private','hidden'].includes(visibility))return json(res,400,{error:'Choose public, private-visible or private-hidden privacy.'});
        const g={id:uid(),name,description,category,topics,visibility,discoverable:visibility!=='hidden'&&input.discoverable!==false,joinApproval:input.joinApproval===true||input.joinApproval==='true'||visibility!=='public',postApproval:input.postApproval===true||input.postApproval==='true',allowMemberInvites:input.allowMemberInvites!==false&&input.allowMemberInvites!=='false',status:'active',ownerId:user.id,members:[user.id],memberships:[{userId:user.id,role:'owner',status:'active',joinedAt:now()}],createdAt:now(),updatedAt:now()};
        db.groups.unshift(g);recordGroupAudit(g,'group_created','group',g.id,{visibility,category});await saveStore();
        return json(res,201,{group:safeGroupSummary(g)});
      }
      if(method==='GET'&&p==='/api/group-invitations'){
        const invitations=db.groupInvitations.filter(invite=>invite.inviteeId===user.id&&invite.status==='pending').map(invite=>({...invite,group:(db.groups.find(g=>g.id===invite.groupId)?{id:db.groups.find(g=>g.id===invite.groupId).id,name:db.groups.find(g=>g.id===invite.groupId).name}:null),inviter:safeUser(db.users.find(u=>u.id===invite.inviterId),user.id)}));
        return json(res,200,{invitations});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/posts$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});
        ensureGroupRoles(group);
        if(!canPublishGroupPost(group,user.id))return json(res,403,{error:'Join this group before posting.'});
        const validation=validatePostInput({text:input.text,mediaIds:input.mediaIds,imageUrl:input.imageUrl});
        if(!validation.valid)return json(res,400,{error:validation.errors.join(' ')});
        const ids=[...new Set(validation.value.mediaIds)],assets=ids.map(id=>(db.mediaAssets||[]).find(asset=>asset.id===id&&asset.ownerId===user.id&&asset.slot==='group'&&asset.status==='uploaded'));
        if(assets.some(asset=>!asset))return json(res,400,{error:'One or more selected group media files are unavailable.'});
        const post={id:uid(),groupId:group.id,userId:user.id,text:validation.value.text,mediaIds:ids,status:group.postApproval?'pending':'published',createdAt:now(),updatedAt:now()};
        assets.forEach(asset=>{asset.status='attached';asset.attachedTo=post.id;});
        db.groupPosts.push(post);recordGroupAudit(group,'group_post_created','post',post.id);await saveStore();return json(res,201,{post:await publicGroupPost(post)});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/posts\/([^/]+)\/comments$/);
      if(['GET','POST'].includes(method)&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        const post=(db.groupPosts||[]).find(item=>item.id===m[2]&&item.groupId===group.id&&item.status==='published');
        if(!post)return json(res,404,{error:'Group post not found.'});
        if(!getGroupRole(group,user.id))return json(res,403,{error:'Join this group to participate in its discussions.'});
        if(method==='GET'){
          const comments=await Promise.all(db.groupPostComments.filter(item=>item.postId===post.id&&item.status!=='deleted'&&!blockedBetween(user.id,item.userId)).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).map(async item=>({...item,author:safeUser(db.users.find(member=>member.id===item.userId),user.id)})));
          return json(res,200,{comments});
        }
        const body=String(input.body||'').trim(),parentId=input.parentId?String(input.parentId):null;
        if(body.length<1||body.length>2000)return json(res,400,{error:'Group comments must contain 1–2000 characters.'});
        if(parentId&&!db.groupPostComments.some(item=>item.id===parentId&&item.postId===post.id&&item.status!=='deleted'))return json(res,400,{error:'The reply target is not part of this discussion.'});
        const comment={id:uid(),groupId:group.id,postId:post.id,userId:user.id,parentId,body,status:'visible',createdAt:now(),updatedAt:now()};
        db.groupPostComments.push(comment);recordGroupAudit(group,'group_comment_created','comment',comment.id);if(post.userId!==user.id)notify(post.userId,user.id,'group_comment',`${user.name||'A member'} commented on your post in ${group.name}.`,{groupId:group.id,groupName:group.name,postId:post.id,commentId:comment.id});await saveStore();
        return json(res,201,{comment:{...comment,author:safeUser(user)}});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/posts\/([^/]+)\/comments\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        const comment=db.groupPostComments.find(item=>item.id===m[3]&&item.postId===m[2]&&item.groupId===group.id&&item.status!=='deleted');
        if(!comment)return json(res,404,{error:'Group comment not found.'});
        if(comment.userId!==user.id&&!canModerateGroup(group,user.id))return json(res,403,{error:'Only the comment author or group moderators can delete this comment.'});
        comment.status='deleted';comment.deletedAt=now();recordGroupAudit(group,'group_comment_deleted','comment',comment.id);await saveStore();
        return json(res,200,{deleted:true});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/posts\/([^/]+)\/reactions$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        const post=(db.groupPosts||[]).find(item=>item.id===m[2]&&item.groupId===group.id&&item.status==='published');
        if(!post)return json(res,404,{error:'Group post not found.'});
        if(!getGroupRole(group,user.id))return json(res,403,{error:'Join this group to react to posts.'});
        const reactionType=String(input.reactionType||'like');
        if(!['like','love','care','haha','wow','sad','angry'].includes(reactionType))return json(res,400,{error:'Choose a supported reaction.'});
        let reaction=db.groupPostReactions.find(item=>item.postId===post.id&&item.userId===user.id);
        if(reaction&&reaction.reactionType===reactionType){db.groupPostReactions=db.groupPostReactions.filter(item=>item!==reaction);reaction=null;}
        else if(reaction)reaction.reactionType=reactionType;
        else {reaction={id:uid(),groupId:group.id,postId:post.id,userId:user.id,reactionType,createdAt:now()};db.groupPostReactions.push(reaction);}
        if(reaction&&post.userId!==user.id)notify(post.userId,user.id,'group_reaction',`${user.name||'A member'} reacted to your post in ${group.name}.`,{groupId:group.id,groupName:group.name,postId:post.id});await saveStore();return json(res,200,{reaction:reaction||null});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/posts\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        const post=(db.groupPosts||[]).find(x=>x.groupId===group.id&&x.id===m[2]);
        if(!post)return json(res,404,{error:'Group post not found.'});
        if(!canDeleteGroupPost(group,post,user.id))return json(res,403,{error:'Only the post author or an authorized group moderator can delete this post.'});
        db.groupPosts=db.groupPosts.filter(x=>x.id!==post.id);(post.mediaIds||[]).forEach(id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id);if(asset){asset.status='deleted';asset.deletedAt=now();}});recordGroupAudit(group,'group_post_deleted','post',post.id);await saveStore();return json(res,200,{ok:true,id:post.id});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/join$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(group.status!=='active')return json(res,409,{error:'This group is not accepting members.'});
        if(group.memberships.some(item=>item.userId===user.id&&item.status==='banned'))return json(res,403,{error:'You are banned from this group. Contact a group administrator for review.'});
        if(getGroupRole(group,user.id))return json(res,200,{group:safeGroupSummary(group),joined:true});
        const invitation=db.groupInvitations.find(item=>item.groupId===group.id&&item.inviteeId===user.id&&item.status==='pending');
        if(group.visibility==='hidden'&&!invitation)return json(res,404,{error:'This group is invitation-only.'});
        if(!['public','private'].includes(group.visibility)||group.discoverable===false&&!invitation)return json(res,404,{error:'This group is not accepting public membership requests.'});
        if((group.joinApproval===true||(group.visibility==='private'&&group.joinApproval!==false))&&!invitation){
          let request=db.groupMembershipRequests.find(item=>item.groupId===group.id&&item.userId===user.id&&item.status==='pending');
          if(!request){request={id:uid(),groupId:group.id,userId:user.id,status:'pending',createdAt:now()};db.groupMembershipRequests.unshift(request);recordGroupAudit(group,'membership_requested','member',user.id);notifyGroupStaff(group,user.id,'group_request',`${user.name||'A member'} requested to join ${group.name}.`,{requestId:request.id});}
          await saveStore();return json(res,202,{requested:true,message:'Your request was sent to the group administrators.'});
        }
        setGroupMembership(group,user.id,'member','active');
        if(invitation)invitation.status='accepted',invitation.respondedAt=now();
        recordGroupAudit(group,'member_joined','member',user.id);await saveStore();
        return json(res,200,{group:safeGroupSummary(group),joined:true});
      }
      if(method==='DELETE'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!canLeaveGroup(group,user.id))return json(res,409,{error:'The group owner cannot leave without transferring ownership.'});
        setGroupMembership(group,user.id,'member','left');recordGroupAudit(group,'member_left','member',user.id);await saveStore();return json(res,200,{left:true});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/pending-posts$/);
      if(method==='GET'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!canModerateGroup(group,user.id))return json(res,403,{error:'Only group moderators can review pending posts.'});
        const posts=await Promise.all((db.groupPosts||[]).filter(post=>post.groupId===group.id&&post.status==='pending').sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).map(post=>publicGroupPost(post)));
        return json(res,200,{posts});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/posts\/([^/]+)\/approval$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!canModerateGroup(group,user.id))return json(res,403,{error:'Only group moderators can review pending posts.'});
        const post=(db.groupPosts||[]).find(item=>item.groupId===group.id&&item.id===m[2]&&item.status==='pending');
        if(!post)return json(res,404,{error:'Pending group post not found.'});
        const action=String(input.action||'');
        if(!['approve','reject'].includes(action))return json(res,400,{error:'Choose approve or reject.'});
        post.status=action==='approve'?'published':'hidden';post.reviewedBy=user.id;post.reviewedAt=now();post.updatedAt=now();
        recordGroupAudit(group,'group_post_'+post.status,'post',post.id);await saveStore();
        return json(res,200,{post:await publicGroupPost(post)});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/requests$/);
      if(method==='GET'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!canModerateGroup(group,user.id))return json(res,403,{error:'Only group moderators can review membership requests.'});
        const requests=db.groupMembershipRequests.filter(item=>item.groupId===group.id&&item.status==='pending').map(item=>({...item,user:safeUser(db.users.find(u=>u.id===item.userId),user.id)}));
        return json(res,200,{requests});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/requests\/([^/]+)$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!canModerateGroup(group,user.id))return json(res,403,{error:'Only group moderators can review membership requests.'});
        const request=db.groupMembershipRequests.find(item=>item.id===m[2]&&item.groupId===group.id&&item.status==='pending');
        if(!request)return json(res,404,{error:'Membership request not found.'});
        const action=String(input.action||'');
        if(!['approve','decline'].includes(action))return json(res,400,{error:'Choose approve or decline.'});
        request.status=action==='approve'?'approved':'declined';request.reviewedBy=user.id;request.reviewedAt=now();
        if(action==='approve')setGroupMembership(group,request.userId,'member','active');
        notify(request.userId,user.id,'group_request_update',action==='approve'?`Your request to join ${group.name} was approved.`:`Your request to join ${group.name} was declined.`,{groupId:group.id,groupName:group.name});
        recordGroupAudit(group,'membership_'+request.status,'member',request.userId);await saveStore();
        return json(res,200,{request});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/invitations$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        const role=getGroupRole(group,user.id);
        if(!role||(!canManageGroupSettings(group,user.id)&&group.allowMemberInvites===false))return json(res,403,{error:'You do not have permission to invite members.'});
        const inviteeId=String(input.inviteeId||'');
        if(!inviteeId||inviteeId===user.id||!db.users.some(u=>u.id===inviteeId))return json(res,400,{error:'Choose a valid Minglora member to invite.'});
        if(blockedBetween(user.id,inviteeId))return json(res,403,{error:'This invitation cannot be sent.'});
        if(getGroupRole(group,inviteeId))return json(res,409,{error:'This member already belongs to the group.'});
        if(group.memberships.some(item=>item.userId===inviteeId&&item.status==='banned'))return json(res,403,{error:'This member must be unbanned before receiving a group invitation.'});
        let invitation=db.groupInvitations.find(item=>item.groupId===group.id&&item.inviteeId===inviteeId&&item.status==='pending');
        if(!invitation){invitation={id:uid(),groupId:group.id,inviterId:user.id,inviteeId,status:'pending',createdAt:now()};db.groupInvitations.unshift(invitation);}
        recordGroupAudit(group,'member_invited','member',inviteeId);notify(inviteeId,user.id,'group_invite',`${user.name||'A member'} invited you to join ${group.name}.`,{groupId:group.id,groupName:group.name,invitationId:invitation.id});await saveStore();return json(res,201,{invitation});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/invitations\/([^/]+)\/respond$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        const invitation=db.groupInvitations.find(item=>item.id===m[2]&&item.groupId===group.id&&item.inviteeId===user.id&&item.status==='pending');
        if(!invitation)return json(res,404,{error:'Invitation not found.'});
        if(blockedBetween(user.id,invitation.inviterId))return json(res,403,{error:'This invitation is no longer available.'});
        const action=String(input.action||'');
        if(!['accept','decline'].includes(action))return json(res,400,{error:'Choose accept or decline.'});
        invitation.status=action==='accept'?'accepted':'declined';invitation.respondedAt=now();
        if(action==='accept'){setGroupMembership(group,user.id,'member','active');notifyGroupStaff(group,user.id,'group_member',`${user.name||'A member'} joined ${group.name} from an invitation.`);}
        recordGroupAudit(group,'invitation_'+invitation.status,'member',user.id);await saveStore();
        return json(res,200,{invitation,joined:action==='accept'});
      }
      m=p.match(/^\/api\/groups\/([^/]+)$/);
      if(method==='PATCH'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!canManageGroupSettings(group,user.id))return json(res,403,{error:'Only the group owner or an administrator can change group settings.'});
        const allowed=['name','description','category','visibility','discoverable','joinApproval','postApproval','allowMemberInvites'];
        for(const key of allowed){if(input[key]===undefined)continue;const value=input[key];
          if(key==='name'){const v=String(value).trim();if(v.length<3||v.length>80)return json(res,400,{error:'Group name must be 3–80 characters.'});group.name=v;}
          else if(key==='description'){const v=String(value).trim();if(v.length>500)return json(res,400,{error:'Description must be 500 characters or less.'});group.description=v;}
          else if(key==='category')group.category=String(value).trim().slice(0,80);
          else if(key==='visibility'){if(!['public','private','hidden'].includes(value))return json(res,400,{error:'Invalid group privacy.'});group.visibility=value;group.discoverable=value!=='hidden';}
          else if(['discoverable','joinApproval','postApproval','allowMemberInvites'].includes(key)){if(typeof value!=='boolean')return json(res,400,{error:key+' must be true or false.'});group[key]=value;}
        }
        group.updatedAt=now();recordGroupAudit(group,'group_settings_updated','group',group.id,{fields:Object.keys(input).filter(k=>allowed.includes(k))});await saveStore();
        return json(res,200,{group:safeGroupSummary(group)});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/transfer-ownership$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        const targetId=String(input.targetUserId||'');
        if(!canTransferGroupOwnership(group,user.id,targetId))return json(res,403,{error:'Only the current owner can transfer ownership to an active group member.'});
        const previousOwnerId=group.ownerId;
        const targetRecord=group.memberships.find(item=>item.userId===targetId);
        if(!targetRecord||targetRecord.status!=='active')return json(res,404,{error:'Choose an active group member.'});
        group.ownerId=targetId;
        setGroupMembership(group,previousOwnerId,'admin','active');
        setGroupMembership(group,targetId,'owner','active');
        group.updatedAt=now();
        recordGroupAudit(group,'group_ownership_transferred','member',targetId,{previousOwnerId});
        await saveStore();
        return json(res,200,{group:safeGroupSummary(group),previousOwnerId,newOwnerId:targetId});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/delete$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(group.ownerId!==user.id)return json(res,403,{error:'Only the group owner can delete this group.'});
        if(String(input.confirmName||'')!==group.name)return json(res,400,{error:'Type the exact group name to confirm deletion.'});
        group.status='deleted';group.deletedAt=now();group.deletedBy=user.id;group.updatedAt=now();
        recordGroupAudit(group,'group_deleted','group',group.id,{name:group.name});
        await saveStore();
        return json(res,200,{deleted:true,groupId:group.id});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)\/role$/);
      if(method==='PATCH'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        const targetId=m[2],role=String(input.role||'');
        if(!group.members.includes(targetId))return json(res,404,{error:'Active group member not found.'});
        if(!canAssignGroupRole(group,user.id,role))return json(res,403,{error:'You cannot assign this role.'});
        const targetRole=getGroupRole(group,targetId);
        if(getGroupRole(group,user.id)==='admin'&&['owner','admin'].includes(targetRole))return json(res,403,{error:'Administrators cannot change another administrator or owner.'});
        if(targetRole==='owner'||role==='owner')return json(res,403,{error:'Ownership transfer requires the dedicated ownership transfer workflow.'});
        setGroupMembership(group,targetId,role,'active');recordGroupAudit(group,'member_role_changed','member',targetId,{role});await saveStore();return json(res,200,{memberId:targetId,role});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)\/unban$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        const targetId=m[2],record=group.memberships.find(item=>item.userId===targetId&&item.status==='banned');
        if(!record)return json(res,404,{error:'Banned group member not found.'});
        const actorRole=getGroupRole(group,user.id);
        if(!canModerateGroup(group,user.id)||(actorRole==='moderator'&&['admin','moderator','owner'].includes(record.role))||(actorRole==='admin'&&['admin','owner'].includes(record.role)))return json(res,403,{error:'You cannot unban this member.'});
        setGroupMembership(group,targetId,'member','left');recordGroupAudit(group,'member_unbanned','member',targetId);await saveStore();
        return json(res,200,{unbanned:true,memberId:targetId});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        const targetId=m[2],targetRole=getGroupRole(group,targetId);
        if(!targetRole)return json(res,404,{error:'Active group member not found.'});
        if(!canModerateGroup(group,user.id)||targetId===group.ownerId)return json(res,403,{error:'You cannot remove this member.'});
        if(getGroupRole(group,user.id)==='moderator'&&['admin','moderator'].includes(targetRole))return json(res,403,{error:'Moderators cannot remove another moderator or administrator.'});
        if(getGroupRole(group,user.id)==='admin'&&targetRole==='admin')return json(res,403,{error:'Administrators cannot remove another administrator.'});
        setGroupMembership(group,targetId,'member',input.ban===true?'banned':'left');
        db.groupModerationActions.unshift({id:uid(),groupId:group.id,actorId:user.id,targetUserId:targetId,action:input.ban===true?'ban':'remove',reason:String(input.reason||'').slice(0,500),createdAt:now()});
        recordGroupAudit(group,input.ban===true?'member_banned':'member_removed','member',targetId);notify(targetId,user.id,'group_moderation',input.ban===true?`You were banned from ${group.name}.`:`You were removed from ${group.name}.`,{groupId:group.id,groupName:group.name,action:input.ban===true?'ban':'remove'});await saveStore();return json(res,200,{removed:true,banned:input.ban===true});
      }
      db.groupMessages ||= [];
      db.groupPostComments ||= [];
      db.groupPostReactions ||= [];
      m=p.match(/^\/api\/groups\/([^/]+)\/messages$/);
      if(method==='GET'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!getGroupRole(group,user.id))return json(res,403,{error:'Join this group to access its group chat.'});
        const messages=await Promise.all(db.groupMessages.filter(item=>item.groupId===group.id&&!item.deletedAt).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).slice(-100).map(async item=>({...item,author:safeUser(db.users.find(member=>member.id===item.senderId),user.id)})));
        return json(res,200,{messages});
      }
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!getGroupRole(group,user.id))return json(res,403,{error:'Join this group to send messages.'});
        const body=String(input.body||'').trim();
        if(body.length<1||body.length>5000)return json(res,400,{error:'Group messages must contain 1–5000 characters.'});
        const message={id:uid(),groupId:group.id,senderId:user.id,body,createdAt:now()};
        db.groupMessages.push(message);recordGroupAudit(group,'group_message_sent','message',message.id);
        if(db.groupMessages.length>50000)db.groupMessages.splice(0,db.groupMessages.length-50000);
        await saveStore();return json(res,201,{message:{...message,author:safeUser(user)}});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/messages\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        const message=db.groupMessages.find(item=>item.id===m[2]&&item.groupId===group.id&&!item.deletedAt);
        if(!message)return json(res,404,{error:'Group message not found.'});
        if(message.senderId!==user.id&&!canModerateGroup(group,user.id))return json(res,403,{error:'Only the sender or an authorized group moderator can remove this message.'});
        message.deletedAt=now();message.deletedBy=user.id;recordGroupAudit(group,'group_message_removed','message',message.id);await saveStore();
        return json(res,200,{ok:true,id:message.id});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/events$/);
      if(method==='GET'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!canViewGroup(group,user.id)||(!getGroupRole(group,user.id)&&group.visibility!=='public'))return json(res,404,{error:'Group events are private.'});
        const events=db.groupEvents.filter(event=>event.groupId===group.id&&event.status!=='cancelled'&&Date.parse(event.startsAt)>=Date.now()).sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt)).map(event=>({...event,rsvpCounts:{going:db.groupEventRsvps.filter(r=>r.eventId===event.id&&r.response==='going').length,interested:db.groupEventRsvps.filter(r=>r.eventId===event.id&&r.response==='interested').length},myResponse:db.groupEventRsvps.find(r=>r.eventId===event.id&&r.userId===user.id)?.response||null}));
        return json(res,200,{events});
      }
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!canManageGroupEvents(group,user.id))return json(res,403,{error:'You do not have permission to manage group events.'});
        const title=String(input.title||'').trim(),startsAt=Date.parse(input.startsAt),endsAt=input.endsAt?Date.parse(input.endsAt):null;
        if(title.length<3||title.length>160||!Number.isFinite(startsAt)||(endsAt!==null&&(!Number.isFinite(endsAt)||endsAt<startsAt)))return json(res,400,{error:'Provide an event title and valid start/end times.'});
        const event={id:uid(),groupId:group.id,creatorId:user.id,title,description:String(input.description||'').trim().slice(0,2000),startsAt:new Date(startsAt).toISOString(),endsAt:endsAt?new Date(endsAt).toISOString():null,timeZone:String(input.timeZone||'UTC').slice(0,80),status:'scheduled',createdAt:now()};
        db.groupEvents.unshift(event);recordGroupAudit(group,'group_event_created','event',event.id);notifyGroupMembers(group,user.id,'group_event',`A new event was scheduled in ${group.name}: ${title}`,{eventId:event.id});await saveStore();return json(res,201,{event});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/rules$/);
      if(method==='GET'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!getGroupRole(group,user.id)&&group.visibility!=='public')return json(res,404,{error:'Group rules are private.'});
        return json(res,200,{rules:db.groupRules.filter(item=>item.groupId===group.id).sort((a,b)=>a.position-b.position||new Date(a.createdAt)-new Date(b.createdAt))});
      }
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!canModerateGroup(group,user.id))return json(res,403,{error:'Only group moderators can manage community rules.'});
        const title=String(input.title||'').trim(),body=String(input.body||'').trim();
        if(title.length<1||title.length>120||body.length<1||body.length>2000)return json(res,400,{error:'Rule title or description is invalid.'});
        const rule={id:uid(),groupId:group.id,title,body,position:db.groupRules.filter(item=>item.groupId===group.id).length,createdBy:user.id,createdAt:now(),updatedAt:now()};
        db.groupRules.push(rule);recordGroupAudit(group,'group_rule_created','rule',rule.id);await saveStore();return json(res,201,{rule});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/rules\/([^/]+)$/);
      if(method==='DELETE'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!canModerateGroup(group,user.id))return json(res,403,{error:'Only group moderators can manage community rules.'});
        const rule=db.groupRules.find(item=>item.id===m[2]&&item.groupId===group.id);if(!rule)return json(res,404,{error:'Group rule not found.'});
        db.groupRules=db.groupRules.filter(item=>item.id!==rule.id);recordGroupAudit(group,'group_rule_deleted','rule',rule.id);await saveStore();return json(res,200,{deleted:true});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/announcements$/);
      if(method==='GET'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!getGroupRole(group,user.id)&&group.visibility!=='public')return json(res,404,{error:'Group announcements are private.'});
        return json(res,200,{announcements:db.groupAnnouncements.filter(item=>item.groupId===group.id&&item.status==='published').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))});
      }
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!canModerateGroup(group,user.id))return json(res,403,{error:'Only moderators can publish group announcements.'});
        const title=String(input.title||'').trim(),body=String(input.body||'').trim();
        if(title.length<3||title.length>140||body.length<1||body.length>3000)return json(res,400,{error:'Announcement title or message is invalid.'});
        const announcement={id:uid(),groupId:group.id,authorId:user.id,title,body,status:'published',createdAt:now()};
        db.groupAnnouncements.unshift(announcement);recordGroupAudit(group,'announcement_created','announcement',announcement.id);notifyGroupMembers(group,user.id,'group_announcement',`New announcement in ${group.name}: ${title}`,{announcementId:announcement.id});await saveStore();return json(res,201,{announcement});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/audit$/);
      if(method==='GET'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!['owner','admin'].includes(getGroupRole(group,user.id)))return json(res,403,{error:'Only group owners and administrators can view the audit history.'});
        const events=db.groupAuditLogs.filter(item=>item.groupId===group.id).slice(0,100).map(item=>({...item,actor:safeUser(db.users.find(u=>u.id===item.actorId),user.id)}));
        return json(res,200,{events});
      }
      db.groupEventRsvps ||= [];
      m=p.match(/^\/api\/groups\/([^/]+)\/events\/([^/]+)\/rsvp$/);
      if(method==='POST'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        const event=db.groupEvents.find(item=>item.id===m[2]&&item.groupId===group.id);
        if(!event)return json(res,404,{error:'Group event not found.'});
        if(!getGroupRole(group,user.id)&&group.visibility!=='public')return json(res,403,{error:'Join this group to respond to its events.'});
        const response=String(input.response||'');
        if(!['going','interested','not_going'].includes(response))return json(res,400,{error:'Choose going, interested or not going.'});
        let rsvp=db.groupEventRsvps.find(item=>item.eventId===event.id&&item.userId===user.id);
        if(!rsvp){rsvp={id:uid(),groupId:group.id,eventId:event.id,userId:user.id,createdAt:now()};db.groupEventRsvps.push(rsvp);}
        rsvp.response=response;rsvp.updatedAt=now();await saveStore();
        return json(res,200,{rsvp});
      }
      m=p.match(/^\/api\/groups\/([^/]+)\/analytics$/);
      if(method==='GET'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        if(!canModerateGroup(group,user.id))return json(res,403,{error:'Group analytics are available to moderators and administrators.'});
        const since=Date.now()-30*86400000;
        const posts=(db.groupPosts||[]).filter(post=>post.groupId===group.id);
        const requests=db.groupMembershipRequests.filter(item=>item.groupId===group.id);
        const joins=group.memberships.filter(item=>item.status==='active'&&new Date(item.joinedAt||item.updatedAt||0).getTime()>=since).length;
        const departures=group.memberships.filter(item=>item.status==='left'&&new Date(item.updatedAt||0).getTime()>=since).length;
        return json(res,200,{periodDays:30,memberCount:group.members.length,activeMembers:group.members.length,posts:posts.filter(post=>new Date(post.createdAt).getTime()>=since).length,pendingRequests:requests.filter(item=>item.status==='pending').length,newMembers:joins,departures});
      }
      m=p.match(/^\/api\/groups\/([^/]+)$/);
      if(method==='GET'&&m){
        const group=db.groups.find(g=>g.id===m[1]);if(!group)return json(res,404,{error:'Group not found.'});ensureGroupRoles(group);
        const isMember=!!getGroupRole(group,user.id),isPublic=group.visibility==='public';
        if(!canViewGroup(group,user.id)||(!isMember&&group.visibility==='hidden'))return json(res,404,{error:'Group not found.'});
        const fullAccess=isMember;
        const posts=fullAccess||isPublic?await Promise.all((db.groupPosts||[]).filter(post=>post.groupId===group.id&&post.status==='published').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(async post=>{const clean=await publicGroupPost(post);const reactions=db.groupPostReactions.filter(item=>item.postId===post.id);return {...clean,commentCount:db.groupPostComments.filter(item=>item.postId===post.id&&item.status!=='deleted').length,reactionCounts:Object.fromEntries(['like','love','care','haha','wow','sad','angry'].map(type=>[type,reactions.filter(item=>item.reactionType===type).length])),myReaction:reactions.find(item=>item.userId===user.id)?.reactionType||null};})):[];
        const members=fullAccess?group.members.map(id=>{const member=safeUser(db.users.find(u=>u.id===id),user.id);return member?{...member,groupRole:getGroupRole(group,id)||'member'}:null;}).filter(Boolean):[];
        const {memberships,...safeGroup}=group;
        const bannedMembers=canModerateGroup(group,user.id)?group.memberships.filter(item=>item.status==='banned').map(item=>{const member=safeUser(db.users.find(u=>u.id===item.userId),user.id);return member?{...member,groupRole:item.role||'member'}:null;}).filter(Boolean):[];
        return json(res,200,{group:{...safeGroup,owner:safeUser(db.users.find(u=>u.id===group.ownerId),user.id),members,bannedMembers,memberCount:group.members.length,isMember,role:getGroupRole(group,user.id),hasPendingRequest:db.groupMembershipRequests.some(r=>r.groupId===group.id&&r.userId===user.id&&r.status==='pending')},posts,restricted:!fullAccess&&!isPublic});
      }
            if(method==='GET'&&p==='/api/stories'){
        await pruneExpiredStories();
        const visible=(db.stories||[]).filter(story=>canViewStory(user.id,story)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        const stories=await Promise.all(visible.map(story=>publicStory(story,user.id)));
        return json(res,200,{stories});
      }
      if(method==='POST'&&p==='/api/stories'){
        const text=String(input.text||'').trim(),audience=String(input.audience||'public');
        if(input.imageUrl!==undefined&&input.imageUrl!=='')return json(res,400,{error:'Image URLs are not accepted. Choose media from your device.'});
        if(!['public','friends','followers','private'].includes(audience))return json(res,400,{error:'Unsupported story audience.'});
        if(input.mediaIds!==undefined&&!Array.isArray(input.mediaIds))return json(res,400,{error:'Story media must be provided as a list of uploaded files.'});
        const requestedMediaIds=Array.isArray(input.mediaIds)?input.mediaIds:(input.mediaId?[input.mediaId]:[]);
        const mediaIds=[...new Set(requestedMediaIds.map(value=>String(value||'').trim()).filter(Boolean))];
        if(mediaIds.length>10)return json(res,400,{error:'A story can contain up to 10 media attachments.'});
        if(!text&&!mediaIds.length&&!input.soundtrack)return json(res,400,{error:'Add text, a photo/video or a sound to your Story.'});
        if(text.length>1000)return json(res,400,{error:'Story text must be 1000 characters or fewer.'});
        let soundtrack=null;try{soundtrack=resolveSoundtrackForUser(user.id,input.soundtrack);}catch(error){return json(res,error.status||400,{error:error.message});}
        const assets=mediaIds.map(id=>(db.mediaAssets||[]).find(item=>item.id===id&&item.ownerId===user.id&&item.slot==='story'&&item.status==='uploaded'&&['image','video'].includes(item.mediaType)));
        if(assets.some(asset=>!asset))return json(res,400,{error:'One or more selected story files are unavailable. Select them again.'});
        const totalBytes=assets.reduce((total,asset)=>total+Math.max(0,Number(asset.byteSize)||0),0);
        if(totalBytes>500*1024*1024)return json(res,400,{error:'This combined story upload is larger than 500 MB. Remove some files and try again.'});
        const createdAt=now();
        const story={id:uid(),userId:user.id,text,mediaIds,mediaId:mediaIds[0]||null,soundtrack,audience,createdAt,expiresAt:new Date(Date.now()+24*60*60*1000).toISOString()};
        assets.forEach(asset=>{asset.status='attached';asset.attachedTo=story.id;});
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
        db.stories=db.stories.filter(x=>x.id!==story.id);db.storyViews=(db.storyViews||[]).filter(view=>view.storyId!==story.id);
        const mediaIds=Array.isArray(story.mediaIds)&&story.mediaIds.length?story.mediaIds:(story.mediaId?[story.mediaId]:[]);
        mediaIds.forEach(id=>{const asset=(db.mediaAssets||[]).find(item=>item.id===id&&item.ownerId===user.id);if(asset){asset.status='deleted';asset.deletedAt=now();}});
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
        await callSessionCleanupReady;
        try{await reconcileCallPresenceForUsers([user.id]);}
        catch(error){return json(res,503,{error:error.message||'Minglora could not refresh call availability. Try again shortly.'});}
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
        await callSessionCleanupReady;
        try{await reconcileCallPresenceForUsers([user.id]);}
        catch(error){return json(res,503,{error:error.message||'Minglora could not refresh call availability. Try again shortly.'});}
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
        const reservationIds=[...new Set([user.id,...recipientIds])];
        if(reservationIds.some(id=>callCreationReservations.has(id)))return json(res,409,{error:'A call is already being started for one of these members. Finish or cancel it before starting another.'});
        reservationIds.forEach(id=>callCreationReservations.add(id));
        try{
          await callSessionCleanupReady;
          await reconcileCallPresenceForUsers(reservationIds,{force:true});
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
        }catch(error){
          if(Number(error?.status)===503)return json(res,503,{error:error.message||'Minglora could not verify call availability. Try again shortly.'});
          throw error;
        }finally{
          reservationIds.forEach(id=>callCreationReservations.delete(id));
        }
      }
      const callMatch=p.match(/^\/api\/calls\/([^/]+)\/(join|invite|leave|end|decline|cancel)$/);
      if(callMatch&&method==='POST'){
        if(!isLiveKitConfigured())return json(res,503,{error:'Voice and video calls require the Minglora LiveKit service to be configured.'});
        let call=db.calls.find(item=>item.id===callMatch[1]);
        let participant=(db.callParticipants||[]).find(item=>item.callId===callMatch[1]&&item.userId===user.id);
        const action=callMatch[2];
        if(!call)return json(res,404,{error:'Call not found.'});
        if(action==='join'){
          await callSessionCleanupReady;
          try{await reconcileCallPresenceForUsers([user.id],{force:true});}
          catch(error){return json(res,503,{error:error.message||'Minglora could not refresh call availability. Try again shortly.'});}
          call=db.calls.find(item=>item.id===callMatch[1]);
          participant=(db.callParticipants||[]).find(item=>item.callId===callMatch[1]&&item.userId===user.id);
          if(!call||!participant)return json(res,404,{error:'This call invitation is no longer active.'});
          const busyElsewhere=(db.callParticipants||[]).some(item=>item.userId===user.id&&item.callId!==call.id&&isCallParticipantBusy((db.calls||[]).find(entry=>entry.id===item.callId),item));
          if(busyElsewhere)return json(res,409,{error:'Finish your current Minglora call before answering another call.'});
          if(call.status==='ringing'&&expireRingingCall(call,db.callParticipants||[],now())){await saveStore();await cleanupCallRoom(call,'ring-timeout');}
          if(['ended','cancelled','declined','missed'].includes(call.status)||!participant||['declined','missed','cancelled'].includes(participant.status)||(participant.status==='left'&&call.status!=='active'))return json(res,404,{error:'This call invitation is no longer active.'});
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
          participant.status='joined';participant.joinedAt=now();participant.leftAt=null;
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
            (db.callParticipants||[]).filter(item=>item.callId===call.id&&['invited','calling','joined'].includes(item.status)).forEach(item=>{item.status=item.status==='invited'?'cancelled':'left';item.leftAt=item.leftAt||call.endedAt;});
          }
          await saveStore();if(endedNow)await cleanupCallRoom(call,'last-participant-left');return json(res,200,{ok:true,call});
        }
        if(action==='end'){
          if(user.id!==call.createdBy)return json(res,403,{error:'Only the call creator can end this call for everyone.'});
          call.status='ended';call.endedAt=now();
          (db.callParticipants||[]).filter(item=>item.callId===call.id&&item.status!=='left').forEach(item=>{item.status=item.status==='invited'?'cancelled':'left';item.leftAt=call.endedAt;});
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
          return {user:safeUser(db.users.find(member=>member.id===id),user.id),messages,unreadCount,isRequest:!isFriend(user.id,id)&&visibleMessages.length>0&&!visibleMessages.some(item=>item.from===user.id)};
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
        const recipientSettings=getUserSettings(recipient);
        if((recipientSettings.preferences.messengerRestrictedUserIds||[]).includes(user.id))return json(res,403,{error:'This member has restricted messages from your account.'});
        const audience=recipientSettings.privacy.messageAudience;
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
      if(method==='GET'&&p==='/api/notifications'){
        await syncRefundedGiftActivity();
        const prefs=getUserSettings(user).notifications;
        const activeCallIds=new Set((db.callParticipants||[]).filter(item=>item.userId===user.id&&item.status==='invited'&&['ringing','active'].includes((db.calls||[]).find(call=>call.id===item.callId)?.status)).map(item=>item.callId));
        const before=(db.notifications||[]).length;
        db.notifications=(db.notifications||[]).filter(item=>item.userId!==user.id||item.type!=='call'||(item.callId&&activeCallIds.has(item.callId)));
        if(db.notifications.length!==before)await saveStore();
        const notifications=prefs.inApp?db.notifications.filter(n=>n.userId===user.id&&(!n.actorId||!blockedBetween(user.id,n.actorId))&&(n.type==='friend'?prefs.friendRequests:n.type==='message'?prefs.messages:n.type==='profile_view'?prefs.profileViews:['reaction','comment','follow'].includes(n.type)?prefs.interactions:true)).map(n=>({...n,actor:safeUser(db.users.find(u=>u.id===n.actorId))})):[];return json(res,200,{notifications});
      }
      if(method==='POST'&&p==='/api/notifications/read'){db.notifications.filter(n=>n.userId===user.id).forEach(n=>n.read=true);await saveStore();return json(res,200,{ok:true});}
      if(method==='GET'&&p==='/api/search'){
        const rawQuery=String(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100);
        const q=rawQuery.replace(/^@/,'').trim();
        const empty={users:[],posts:[],groups:[],pages:[]};
        if(!q)return json(res,200,empty);
        const users=db.users.filter(member=>member.id!==user.id&&!blockedBetween(user.id,member.id)&&canViewProfile(user.id,member)&&(`${member.name||''} ${member.username||''}`).toLowerCase().includes(q)).slice(0,12).map(member=>safeUser(member,user.id));
        const posts=await Promise.all(db.posts.filter(post=>post.status!=='hidden'&&!post.archivedAt&&!blockedBetween(user.id,post.userId)&&String(post.text||'').toLowerCase().includes(q)).slice(0,20).map(post=>publicPost(post,user.id)));
        const groups=(db.groups||[]).filter(group=>!['private','hidden'].includes(String(group.visibility||group.privacy||'').toLowerCase())||group.members?.includes(user.id)).filter(group=>(String(group.name||'')+' '+String(group.description||'')).toLowerCase().includes(q)).slice(0,12).map(group=>({...group,memberCount:(group.members||[]).length,owner:safeUser(db.users.find(member=>member.id===group.ownerId),user.id)}));
        const pages=(db.pages||[]).filter(page=>page.status==='active'&&!blockedBetween(user.id,page.createdBy)&&(page.title+' '+page.handle+' '+page.description+' '+page.category).toLowerCase().includes(q)).slice(0,12).map(page=>({...page,owner:safeUser(db.users.find(member=>member.id===page.createdBy),user.id),followerCount:(db.pageFollows||[]).filter(follow=>follow.pageId===page.id).length,isFollowing:(db.pageFollows||[]).some(follow=>follow.pageId===page.id&&follow.userId===user.id)}));
        return json(res,200,{users,posts,groups,pages});
      }
      return json(res,404,{error:'API route not found.'});
    } catch(e) {
      if (process.env.NODE_ENV === 'test') return json(res, e.status || 500, { error: e.message, stack: e.stack });
      const status = Number(e.status || 500);
      if (status >= 500) {
        console.error('[Minglora API error]', e);
      } else {
        // Expected authentication and validation rejections are client outcomes,
        // not server faults; keep them out of the error-level incident stream.
        console.info('[Minglora API client response]', JSON.stringify({
          status,
          route: p,
          message: String(e.message || 'Request rejected').slice(0, 160)
        }));
      }
      return json(res, status, { error: e.status ? e.message : 'Internal server error.' });
    }
  }
  if(p==='/assets/gifters-level-up.png'){
    const assetFile=path.join(__dirname,'..','assets','Gifters Level Up.png');
    fs.readFile(assetFile,(error,data)=>{if(error)return json(res,404,{error:'Gifter progression artwork not found.'});res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=3600',...SECURITY_HEADERS});res.end(data);});
    return;
  }
  const rel=p==='/'?'index.html':decodeURIComponent(p.slice(1)); const file=path.resolve(publicDir,rel);
  if(!file.startsWith(publicDir+path.sep)&&file!==path.join(publicDir,'index.html'))return json(res,403,{error:'Forbidden'});
  fs.readFile(file,(err,data)=>{if(err){fs.readFile(path.join(publicDir,'index.html'),(e,d)=>{if(e)return json(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':MIME['.html'],'Cache-Control':'no-store',...SECURITY_HEADERS});res.end(d);});return;}const extension=path.extname(file);const cacheHeaders=extension==='.html'?{'Cache-Control':'no-store'}:(['.js','.css','.webmanifest'].includes(extension)||path.basename(file)==='sw.js')?{'Cache-Control':'no-cache, max-age=0, must-revalidate'}:{};res.writeHead(200,{'Content-Type':MIME[extension]||'application/octet-stream',...cacheHeaders,...SECURITY_HEADERS});res.end(data);});
}
const server=http.createServer((req,res)=>{route(req,res).catch(()=>json(res,500,{error:'Unexpected server error.'}));});
let leagueSettlementInProgress=false;
const leagueSettlementTimer=setInterval(async()=>{
  if(leagueSettlementInProgress)return;
  leagueSettlementInProgress=true;
  const currentTime=Date.now();
  const due=(db.creatorLeagueMatches||[]).some(match=>
    (match.status==='live'&&Date.parse(match.endsAt)<=currentTime)||
    (match.status==='pending'&&Date.parse(match.expiresAt)<=currentTime)
  );
  try{
    const scheduled=settleScheduledCreatorLeagueDays(db,new Date(currentTime));
    if(due)settleExpiredLeagueMatches(db,new Date(currentTime));
    if(due||scheduled.changed)await saveStore();
  }catch(error){
    console.error('[Minglora League settlement] Could not persist scheduled League state.',{message:String(error?.message||'settlement failed').slice(0,180)});
  }finally{
    leagueSettlementInProgress=false;
  }
},10000);
leagueSettlementTimer.unref?.();

let liveRewardSettlementLastWarning=0;
const liveRewardSettlementTimer=setInterval(async()=>{
  if(!isSupabasePersistence())return;
  try{
    await requestSupabaseState('economy_live_reward_settle',{});
  }catch(error){
    const at=Date.now();
    if(at-liveRewardSettlementLastWarning>60000){
      liveRewardSettlementLastWarning=at;
      console.warn('[Minglora LIVE reward settlement] Retry pending.',{message:String(error?.message||'settlement unavailable').slice(0,180)});
    }
  }
},15000);
liveRewardSettlementTimer.unref?.();

server.listen(PORT,'0.0.0.0',async()=>{
  try {
    if (isSupabasePersistence()) {
      const retiredStreamBayCleanup = await requestSupabaseState('streambay_cleanup');
      console.info('[Minglora retired StreamBay cleanup]', JSON.stringify(retiredStreamBayCleanup));
    }
  } catch (error) {
    console.error('[Minglora retired StreamBay cleanup] Pending retry.', { message: error?.message || String(error) });
  }
  callSessionCleanupReady = cleanupPersistedCalls();
  const callCleanup = await callSessionCleanupReady;
  console.info('[Minglora calls cleanup]', JSON.stringify(callCleanup));
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
  const liveVerification = {
    configured: liveHealth.configured,
    connected: liveHealth.connected,
    checkedAt: liveHealth.checkedAt
  };
  if (liveHealth.connected) {
    // Keep the success payload free of an "error" field so structured log
    // ingestion cannot mistake the null error property for an error-level event.
    console.info('[Minglora LiveKit verification]', JSON.stringify(liveVerification));
  } else {
    console.error('[Minglora LiveKit verification failed]', JSON.stringify({
      ...liveVerification,
      verificationError: String(liveHealth.error || 'LiveKit connection failed').slice(0, 240)
    }));
  }
});
