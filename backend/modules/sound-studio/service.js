export const SOUND_STUDIO_THEMES=Object.freeze(["Classic","Modern","Premium","Minimal","Digital","Cinematic"]);
export const SOUND_NOTIFICATION_CATEGORIES=Object.freeze([
Object.freeze({id:"private_messages",label:"Private messages"}),
Object.freeze({id:"group_messages",label:"Group messages"}),
Object.freeze({id:"new_followers",label:"New followers"}),
Object.freeze({id:"new_friends",label:"New friends"}),
Object.freeze({id:"voice_messages",label:"Voice messages"}),
Object.freeze({id:"replies",label:"Replies"}),
Object.freeze({id:"reactions",label:"Reactions"}),
Object.freeze({id:"comments",label:"Comments"}),
Object.freeze({id:"mentions",label:"Mentions and tags"}),
Object.freeze({id:"missed_voice_calls",label:"Missed voice calls"}),
Object.freeze({id:"missed_video_calls",label:"Missed video calls"}),
Object.freeze({id:"incoming_calls",label:"Incoming calls"}),
Object.freeze({id:"live_notifications",label:"LIVE notifications"}),
Object.freeze({id:"meeting_invitations",label:"Meeting invitations"}),
Object.freeze({id:"meeting_reminders",label:"Meeting reminders"}),
Object.freeze({id:"gifts_received",label:"Gifts received"}),
Object.freeze({id:"coins_received",label:"Coins received"}),
Object.freeze({id:"payments_transactions",label:"Payments and transactions"}),
Object.freeze({id:"marketplace_orders",label:"Marketplace orders"}),
Object.freeze({id:"security_alerts",label:"Security alerts"}),
Object.freeze({id:"login_alerts",label:"Login alerts"}),
Object.freeze({id:"system_notifications",label:"System notifications"})
]);
export const SOUND_STUDIO_SOUND_IDS=Object.freeze(new Set([
...Array.from({length:30},(_,i)=>"voice-"+String(i+1).padStart(2,"0")),
...Array.from({length:30},(_,i)=>"video-"+String(i+1).padStart(2,"0")),
...Array.from({length:60},(_,i)=>"notification-"+String(i+1).padStart(2,"0"))
]));
const DEFAULT_NOTIFICATION_SOUNDS=Object.freeze(Object.fromEntries(SOUND_NOTIFICATION_CATEGORIES.map((c,i)=>[c.id,"notification-"+String(i+1).padStart(2,"0")])));
const DEFAULT_NOTIFICATION_ENABLED=Object.freeze(Object.fromEntries(SOUND_NOTIFICATION_CATEGORIES.map(c=>[c.id,true])));
const validId=(id,custom=[])=>SOUND_STUDIO_SOUND_IDS.has(String(id||""))||custom.some(x=>x?.id===String(id||""));
const validSoundType=(id,type,custom=[])=>custom.some(x=>x?.id===String(id||""))||(SOUND_STUDIO_SOUND_IDS.has(String(id||""))&&String(id).startsWith(type+"-"));
const validTime=v=>typeof v==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const days=new Set(["mon","tue","wed","thu","fri","sat","sun"]);
const validVolume=v=>Number.isInteger(v)&&v>=0&&v<=100;
export const DEFAULT_SOUND_STUDIO_PREFERENCES=Object.freeze({
 soundTheme:"Classic",voiceRingtoneId:"voice-01",videoRingtoneId:"video-01",
 notificationSounds:DEFAULT_NOTIFICATION_SOUNDS,notificationEnabled:DEFAULT_NOTIFICATION_ENABLED,
 favoriteIds:[],ringtoneVolume:80,notificationVolume:80,vibrationEnabled:true,vibrationPattern:"standard",
 silentMode:false,doNotDisturb:Object.freeze({enabled:false,startTime:"22:00",endTime:"07:00",days:["mon","tue","wed","thu","fri","sat","sun"]}),customSounds:[]
});
export function normalizeSoundStudioPreferences(input={},previous={}){
 const prev=previous&&typeof previous==="object"&&!Array.isArray(previous)?previous:{};
 const raw=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
 const customSounds=Array.isArray(prev.customSounds)?prev.customSounds:[];
 const base={...DEFAULT_SOUND_STUDIO_PREFERENCES,...prev,
  notificationSounds:{...DEFAULT_NOTIFICATION_SOUNDS,...(prev.notificationSounds||{})},
  notificationEnabled:{...DEFAULT_NOTIFICATION_ENABLED,...(prev.notificationEnabled||{})},
  doNotDisturb:{...DEFAULT_SOUND_STUDIO_PREFERENCES.doNotDisturb,...(prev.doNotDisturb||{})},
  favoriteIds:Array.isArray(prev.favoriteIds)?prev.favoriteIds:[],customSounds};
 const next={...base,...raw,customSounds,
  notificationSounds:{...base.notificationSounds,...(raw.notificationSounds||{})},
  notificationEnabled:{...base.notificationEnabled,...(raw.notificationEnabled||{})},
  doNotDisturb:{...base.doNotDisturb,...(raw.doNotDisturb||{})}};
 if(!SOUND_STUDIO_THEMES.includes(next.soundTheme))next.soundTheme="Classic";
 if(!validSoundType(next.voiceRingtoneId,"voice",customSounds))next.voiceRingtoneId="voice-01";
 if(!validSoundType(next.videoRingtoneId,"video",customSounds))next.videoRingtoneId="video-01";
 for(const c of SOUND_NOTIFICATION_CATEGORIES){
  if(!validSoundType(next.notificationSounds[c.id],"notification",customSounds))next.notificationSounds[c.id]=DEFAULT_NOTIFICATION_SOUNDS[c.id];
  if(typeof next.notificationEnabled[c.id]!=="boolean")next.notificationEnabled[c.id]=true;
 }
 next.favoriteIds=[...new Set(next.favoriteIds.filter(id=>validId(id,customSounds)))].slice(0,120);
 if(!validVolume(next.ringtoneVolume))next.ringtoneVolume=80;
 if(!validVolume(next.notificationVolume))next.notificationVolume=80;
 if(typeof next.vibrationEnabled!=="boolean")next.vibrationEnabled=true;
 if(!["short","standard","pulse","heartbeat"].includes(next.vibrationPattern))next.vibrationPattern="standard";
 if(typeof next.silentMode!=="boolean")next.silentMode=false;
 if(typeof next.doNotDisturb.enabled!=="boolean")next.doNotDisturb.enabled=false;
 if(!validTime(next.doNotDisturb.startTime))next.doNotDisturb.startTime="22:00";
 if(!validTime(next.doNotDisturb.endTime))next.doNotDisturb.endTime="07:00";
 if(!Array.isArray(next.doNotDisturb.days)||next.doNotDisturb.days.some(d=>!days.has(d)))next.doNotDisturb.days=["mon","tue","wed","thu","fri","sat","sun"];
 next.doNotDisturb.days=[...new Set(next.doNotDisturb.days)];
 return next;
}
export function validateSoundStudioPreferences(input,current={}){
 if(!input||typeof input!=="object"||Array.isArray(input))return {valid:false,error:"Sound Studio settings must be an object."};
 const allowed=new Set(["soundTheme","voiceRingtoneId","videoRingtoneId","notificationSounds","notificationEnabled","favoriteIds","ringtoneVolume","notificationVolume","vibrationEnabled","vibrationPattern","silentMode","doNotDisturb"]);
 for(const key of Object.keys(input))if(!allowed.has(key))return {valid:false,error:"Unsupported Sound Studio setting: "+key};
 const custom=Array.isArray(current.customSounds)?current.customSounds:[];
 const next=normalizeSoundStudioPreferences(input,current);
 if(input.soundTheme!==undefined&&!SOUND_STUDIO_THEMES.includes(input.soundTheme))return {valid:false,error:"Choose a supported Sound Studio theme."};
 for(const [key,type] of [["voiceRingtoneId","voice"],["videoRingtoneId","video"]])if(input[key]!==undefined&&!validSoundType(input[key],type,custom))return {valid:false,error:"Choose a "+type+" call ringtone or one of your custom sounds."};
 for(const key of ["ringtoneVolume","notificationVolume"])if(input[key]!==undefined&&!validVolume(input[key]))return {valid:false,error:"Volume must be a whole number from 0 to 100."};
 for(const key of ["vibrationEnabled","silentMode"])if(input[key]!==undefined&&typeof input[key]!=="boolean")return {valid:false,error:key+" must be true or false."};
 if(input.vibrationPattern!==undefined&&!["short","standard","pulse","heartbeat"].includes(input.vibrationPattern))return {valid:false,error:"Choose a supported vibration pattern."};
 if(input.notificationSounds!==undefined){
  if(!input.notificationSounds||typeof input.notificationSounds!=="object"||Array.isArray(input.notificationSounds))return {valid:false,error:"Notification assignments must be an object."};
  for(const [c,id] of Object.entries(input.notificationSounds))if(!SOUND_NOTIFICATION_CATEGORIES.some(x=>x.id===c)||!validSoundType(id,"notification",custom))return {valid:false,error:"Choose a notification sound for each notification category."};
 }
 if(input.notificationEnabled!==undefined){
  if(!input.notificationEnabled||typeof input.notificationEnabled!=="object"||Array.isArray(input.notificationEnabled))return {valid:false,error:"Notification switches must be an object."};
  for(const [c,v] of Object.entries(input.notificationEnabled))if(!SOUND_NOTIFICATION_CATEGORIES.some(x=>x.id===c)||typeof v!=="boolean")return {valid:false,error:"Choose a valid notification switch."};
 }
 if(input.favoriteIds!==undefined&&(!Array.isArray(input.favoriteIds)||input.favoriteIds.length>120||input.favoriteIds.some(id=>!validId(id,custom))))return {valid:false,error:"Favorites must refer to sounds available to this account."};
 if(input.doNotDisturb!==undefined){
  const d=input.doNotDisturb;
  if(!d||typeof d!=="object"||Array.isArray(d))return {valid:false,error:"Do Not Disturb must be an object."};
  if(d.enabled!==undefined&&typeof d.enabled!=="boolean")return {valid:false,error:"Do Not Disturb enabled must be true or false."};
  if(d.startTime!==undefined&&!validTime(d.startTime))return {valid:false,error:"Enter a valid Do Not Disturb start time."};
  if(d.endTime!==undefined&&!validTime(d.endTime))return {valid:false,error:"Enter a valid Do Not Disturb end time."};
  if(d.days!==undefined&&(!Array.isArray(d.days)||d.days.length>7||d.days.some(x=>!days.has(x))))return {valid:false,error:"Choose valid Do Not Disturb days."};
 }
 return {valid:true,value:next};
}
export function isWithinDoNotDisturb(schedule,date=new Date()){
 if(!schedule?.enabled)return false;
 const dayIndex=date.getDay(),day=["sun","mon","tue","wed","thu","fri","sat"][dayIndex],previousDay=["sun","mon","tue","wed","thu","fri","sat"][(dayIndex+6)%7];
 const mins=v=>{const [h,m]=String(v||"").split(":").map(Number);return h*60+m;};
 const now=date.getHours()*60+date.getMinutes(),start=mins(schedule.startTime),end=mins(schedule.endTime);
 if(start===end)return !Array.isArray(schedule.days)||schedule.days.includes(day);
 if(start<end)return (!Array.isArray(schedule.days)||schedule.days.includes(day))&&now>=start&&now<end;
 if(now>=start)return !Array.isArray(schedule.days)||schedule.days.includes(day);
 return now<end&&(!Array.isArray(schedule.days)||schedule.days.includes(previousDay));
}
export function countSoundCatalogue(items=[]){return {voice:items.filter(x=>x.type==="voice").length,video:items.filter(x=>x.type==="video").length,notification:items.filter(x=>x.type==="notification").length,total:items.length};}
