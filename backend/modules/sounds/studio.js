export const SOUND_STUDIO_THEMES = Object.freeze(["Classic","Modern","Premium","Minimal","Digital","Cinematic"]);
export const SOUND_STUDIO_CATEGORIES = Object.freeze([
  ["privateMessages","Private messages"],["groupMessages","Group messages"],["newFollowers","New followers"],
  ["newFriends","New friends"],["voiceMessages","Voice messages"],["replies","Replies"],["reactions","Reactions"],
  ["comments","Comments"],["mentionsTags","Mentions and tags"],["missedVoiceCalls","Missed voice calls"],
  ["missedVideoCalls","Missed video calls"],["incomingCalls","Incoming calls"],["live","LIVE notifications"],
  ["meetingInvitations","Meeting invitations"],["meetingReminders","Meeting reminders"],["giftReceived","Gift received"],
  ["coinsReceived","Coins received"],["paymentsTransactions","Payments and transactions"],["marketplaceOrders","Marketplace orders"],
  ["securityAlerts","Security alerts"],["loginAlerts","Login alerts"],["systemNotifications","System notifications"]
].map(([id,label])=>Object.freeze({id,label})));
const CATEGORY_IDS = new Set(SOUND_STUDIO_CATEGORIES.map(item=>item.id));
export const DEFAULT_SOUND_STUDIO_SETTINGS = Object.freeze({
  theme:"Classic", voiceRingtoneId:"voice-01", videoRingtoneId:"video-01",
  notifications:Object.freeze(Object.fromEntries(SOUND_STUDIO_CATEGORIES.map((item,index)=>[item.id,"notification-"+String(index+1).padStart(2,"0")]))),
  favorites:Object.freeze([]), ringtoneVolume:80, notificationVolume:75,
  vibrationEnabled:true, vibrationPattern:"standard", silentMode:false,
  enabled:Object.freeze({voiceCall:true,videoCall:true,notifications:Object.freeze(Object.fromEntries(SOUND_STUDIO_CATEGORIES.map(item=>[item.id,true])))}),
  doNotDisturb:Object.freeze({enabled:false,start:"22:00",end:"07:00",days:Object.freeze([0,1,2,3,4,5,6])})
});
const isRecord = value => Boolean(value && typeof value==="object" && !Array.isArray(value));
const isClock = value => typeof value==="string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const numeric = (value,min,max) => Number.isInteger(value) && value>=min && value<=max;
const validSoundId = (value,kind,customIds) => {
  if(typeof value!=="string") return false;
  if(customIds.has(value)) return true;
  if(kind==="voice") return /^voice-(?:0[1-9]|[12]\d|30)$/.test(value);
  if(kind==="video") return /^video-(?:0[1-9]|[12]\d|30)$/.test(value);
  return /^notification-(?:0[1-9]|[1-5]\d|60)$/.test(value);
};
export function normalizeSoundStudioSettings(value={},ownedCustomIds=[]) {
  const customIds=ownedCustomIds instanceof Set?ownedCustomIds:new Set(ownedCustomIds||[]);
  const input=isRecord(value)?value:{};
  const base=DEFAULT_SOUND_STUDIO_SETTINGS;
  const notifications={};
  const enabledNotifications={};
  for(const category of SOUND_STUDIO_CATEGORIES){
    const selected=input.notifications?.[category.id];
    notifications[category.id]=validSoundId(selected,"notification",customIds)?selected:base.notifications[category.id];
    enabledNotifications[category.id]=typeof input.enabled?.notifications?.[category.id]==="boolean"?input.enabled.notifications[category.id]:true;
  }
  const days=Array.isArray(input.doNotDisturb?.days)?[...new Set(input.doNotDisturb.days.filter(day=>numeric(day,0,6)))].sort():[0,1,2,3,4,5,6];
  const vibrationPatterns=["standard","pulse","double","heartbeat","long"];
  const favorites=Array.isArray(input.favorites)?[...new Set(input.favorites.filter(id=>validSoundId(id,"notification",customIds)||validSoundId(id,"voice",customIds)||validSoundId(id,"video",customIds)))].slice(0,200):[];
  return {
    theme:SOUND_STUDIO_THEMES.includes(input.theme)?input.theme:base.theme,
    voiceRingtoneId:validSoundId(input.voiceRingtoneId,"voice",customIds)?input.voiceRingtoneId:base.voiceRingtoneId,
    videoRingtoneId:validSoundId(input.videoRingtoneId,"video",customIds)?input.videoRingtoneId:base.videoRingtoneId,
    notifications, favorites,
    ringtoneVolume:numeric(input.ringtoneVolume,0,100)?input.ringtoneVolume:base.ringtoneVolume,
    notificationVolume:numeric(input.notificationVolume,0,100)?input.notificationVolume:base.notificationVolume,
    vibrationEnabled:typeof input.vibrationEnabled==="boolean"?input.vibrationEnabled:base.vibrationEnabled,
    vibrationPattern:vibrationPatterns.includes(input.vibrationPattern)?input.vibrationPattern:base.vibrationPattern,
    silentMode:typeof input.silentMode==="boolean"?input.silentMode:false,
    enabled:{
      voiceCall:typeof input.enabled?.voiceCall==="boolean"?input.enabled.voiceCall:true,
      videoCall:typeof input.enabled?.videoCall==="boolean"?input.enabled.videoCall:true,
      notifications:enabledNotifications
    },
    doNotDisturb:{
      enabled:input.doNotDisturb?.enabled===true,
      start:isClock(input.doNotDisturb?.start)?input.doNotDisturb.start:base.doNotDisturb.start,
      end:isClock(input.doNotDisturb?.end)?input.doNotDisturb.end:base.doNotDisturb.end,
      days:days.length?days:[0,1,2,3,4,5,6]
    }
  };
}
export function validateSoundStudioSettings(input,current=DEFAULT_SOUND_STUDIO_SETTINGS,ownedCustomIds=[]) {
  if(!isRecord(input)) return {valid:false,error:"Sound settings must be an object.",settings:null};
  const allowed=new Set(["theme","voiceRingtoneId","videoRingtoneId","notifications","favorites","ringtoneVolume","notificationVolume","vibrationEnabled","vibrationPattern","silentMode","enabled","doNotDisturb"]);
  if(Object.keys(input).some(key=>!allowed.has(key))) return {valid:false,error:"Unsupported Sound Studio setting.",settings:null};
  const customIds=ownedCustomIds instanceof Set?ownedCustomIds:new Set(ownedCustomIds||[]);
  const candidate={...normalizeSoundStudioSettings(current,customIds),...input};
  if(!SOUND_STUDIO_THEMES.includes(candidate.theme))return {valid:false,error:"Choose a supported sound theme.",settings:null};
  if(!validSoundId(candidate.voiceRingtoneId,"voice",customIds))return {valid:false,error:"Choose a valid voice-call ringtone.",settings:null};
  if(!validSoundId(candidate.videoRingtoneId,"video",customIds))return {valid:false,error:"Choose a valid video-call ringtone.",settings:null};
  if(!isRecord(candidate.notifications)||Object.keys(candidate.notifications).some(key=>!CATEGORY_IDS.has(key)))return {valid:false,error:"Notification sound categories are invalid.",settings:null};
  for(const category of SOUND_STUDIO_CATEGORIES)if(!validSoundId(candidate.notifications[category.id],"notification",customIds))return {valid:false,error:"Choose a valid sound for "+category.label+".",settings:null};
  if(!Array.isArray(candidate.favorites)||candidate.favorites.length>200||candidate.favorites.some(id=>!validSoundId(id,"notification",customIds)&&!validSoundId(id,"voice",customIds)&&!validSoundId(id,"video",customIds)))return {valid:false,error:"Sound favorites are invalid.",settings:null};
  if(!numeric(candidate.ringtoneVolume,0,100)||!numeric(candidate.notificationVolume,0,100))return {valid:false,error:"Sound volumes must be between 0 and 100.",settings:null};
  if(typeof candidate.vibrationEnabled!=="boolean"||typeof candidate.silentMode!=="boolean")return {valid:false,error:"Vibration and silent-mode settings must be enabled or disabled.",settings:null};
  if(!["standard","pulse","double","heartbeat","long"].includes(candidate.vibrationPattern))return {valid:false,error:"Choose a supported vibration pattern.",settings:null};
  if(!isRecord(candidate.enabled)||typeof candidate.enabled.voiceCall!=="boolean"||typeof candidate.enabled.videoCall!=="boolean"||!isRecord(candidate.enabled.notifications))return {valid:false,error:"Sound-category switches are invalid.",settings:null};
  for(const category of SOUND_STUDIO_CATEGORIES)if(typeof candidate.enabled.notifications[category.id]!=="boolean")return {valid:false,error:"Choose whether "+category.label+" sounds are enabled.",settings:null};
  const dnd=candidate.doNotDisturb;
  if(!isRecord(dnd)||typeof dnd.enabled!=="boolean"||!isClock(dnd.start)||!isClock(dnd.end)||!Array.isArray(dnd.days)||dnd.days.some(day=>!numeric(day,0,6)))return {valid:false,error:"Do Not Disturb schedule is invalid.",settings:null};
  return {valid:true,error:null,settings:normalizeSoundStudioSettings(candidate,customIds)};
}
