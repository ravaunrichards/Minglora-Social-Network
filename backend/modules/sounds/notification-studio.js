import fs from "node:fs";

export const SOUND_STUDIO_THEMES = Object.freeze([
  {key:"classic",label:"Classic"},{key:"modern",label:"Modern"},{key:"premium",label:"Premium"},
  {key:"minimal",label:"Minimal"},{key:"digital",label:"Digital"},{key:"cinematic",label:"Cinematic"}
]);
const record=value=>value&&typeof value==="object"&&!Array.isArray(value);
const approvedRecord=item=>item&&item.acceptanceStatus==="approved"&&item.authenticRecording===true&&
  item.commercialUseAllowed===true&&item.redistributionAllowed===true&&/^[a-f0-9]{64}$/i.test(String(item.sha256||""));
function readApprovedManifest(){
  try{return JSON.parse(fs.readFileSync(new URL("../../../public/assets/sound-studio/manifest.json",import.meta.url),"utf8"));}
  catch{return {};}
}
const approvedManifest=readApprovedManifest();
const voiceIds=new Set((approvedManifest.voiceRingtones||[]).filter(approvedRecord).map(item=>item.id));
const videoIds=new Set((approvedManifest.videoRingtones||[]).filter(approvedRecord).map(item=>item.id));
const notificationIds=new Set((approvedManifest.notifications||[]).filter(approvedRecord).map(item=>item.id));
const builtinIds=new Set([...voiceIds,...videoIds,...notificationIds]);
const first=set=>set.values().next().value||null;

export const SOUND_STUDIO_CATEGORIES = Object.freeze([
  ["private_messages","Private messages"],["group_messages","Group messages"],["new_followers","New followers"],
  ["new_friends","New friends"],["voice_messages","Voice messages"],["replies","Replies"],["reactions","Reactions"],
  ["comments","Comments"],["mentions_tags","Mentions and tags"],["missed_voice_calls","Missed voice calls"],
  ["missed_video_calls","Missed video calls"],["incoming_calls","Incoming calls"],["live_notifications","LIVE notifications"],
  ["meeting_invitations","Meeting invitations"],["meeting_reminders","Meeting reminders"],["gifts_received","Gifts received"],
  ["coins_received","Coins received"],["payments_transactions","Payments and transactions"],["marketplace_orders","Marketplace orders"],
  ["security_alerts","Security alerts"],["login_alerts","Login alerts"],["system_notifications","System notifications"]
].map(([key,label])=>Object.freeze({key,label,defaultSoundId:first(notificationIds)})));

export function defaultSoundStudioPreferences(){
  return {theme:"classic",voiceCall:{soundId:first(voiceIds),enabled:true},videoCall:{soundId:first(videoIds),enabled:true},
    notifications:Object.fromEntries(SOUND_STUDIO_CATEGORIES.map(category=>[category.key,{soundId:category.defaultSoundId,enabled:true}])),
    favorites:[],customSounds:[]};
}
export function normalizeSoundStudioPreferences(user,mediaAssets=[]){
  const source=record(user?.soundStudio)?user.soundStudio:null,base=defaultSoundStudioPreferences();
  const owned=(mediaAssets||[]).filter(asset=>asset?.ownerId===user?.id&&asset?.slot==="ringtone"&&asset?.bucket==="minglora-ringtones"&&asset?.status==="attached"&&["account:sound-studio","account:call-ringtone"].includes(asset?.attachedTo));
  const byId=new Map(owned.map(asset=>[asset.id,asset]));let changed=!source;
  if(source){
    base.theme=SOUND_STUDIO_THEMES.some(t=>t.key===source.theme)?source.theme:"classic";
    base.voiceCall={...base.voiceCall,...(record(source.voiceCall)?source.voiceCall:{})};
    base.videoCall={...base.videoCall,...(record(source.videoCall)?source.videoCall:{})};
    if(record(source.notifications))for(const category of SOUND_STUDIO_CATEGORIES)base.notifications[category.key]={...base.notifications[category.key],...(record(source.notifications[category.key])?source.notifications[category.key]:{})};
    base.favorites=Array.isArray(source.favorites)?[...new Set(source.favorites.filter(id=>typeof id==="string"))]:[];
  }
  const customs=[];
  for(const item of (source&&Array.isArray(source.customSounds)?source.customSounds:[])){
    const asset=byId.get(String(item?.assetId||""));if(!asset){changed=true;continue;}
    customs.push({id:"custom:"+asset.id,assetId:asset.id,title:String(item.title||asset.originalName||"Custom sound").slice(0,100),mimeType:asset.mimeType,durationMs:Number(item.durationMs||asset.durationMs||0)});
  }
  const legacy=user?.callRingtoneAssetId?byId.get(user.callRingtoneAssetId):null;
  if(legacy&&!customs.some(item=>item.assetId===legacy.id)){
    customs.push({id:"custom:"+legacy.id,assetId:legacy.id,title:String(legacy.originalName||"Previous custom ringtone").slice(0,100),mimeType:legacy.mimeType,durationMs:Number(legacy.durationMs||0)});
    if(!source)base.voiceCall.soundId="custom:"+legacy.id;changed=true;
  }
  base.customSounds=customs;
  const customIds=new Set(customs.map(item=>item.id));
  const validVoice=id=>voiceIds.has(id)||customIds.has(id);
  const validVideo=id=>videoIds.has(id)||customIds.has(id);
  const validNotification=id=>notificationIds.has(id)||customIds.has(id);
  const valid=id=>builtinIds.has(id)||customIds.has(id);
  if(!validVoice(base.voiceCall.soundId)){if(base.voiceCall.soundId!==first(voiceIds))changed=true;base.voiceCall.soundId=first(voiceIds);}
  if(!validVideo(base.videoCall.soundId)){if(base.videoCall.soundId!==first(videoIds))changed=true;base.videoCall.soundId=first(videoIds);}
  for(const call of ["voiceCall","videoCall"])if(typeof base[call].enabled!=="boolean"){base[call].enabled=true;changed=true;}
  for(const category of SOUND_STUDIO_CATEGORIES){
    const item=base.notifications[category.key];
    if(!validNotification(item.soundId)){if(item.soundId!==category.defaultSoundId)changed=true;item.soundId=category.defaultSoundId;}
    if(typeof item.enabled!=="boolean"){item.enabled=true;changed=true;}
  }
  const favorites=base.favorites.filter(valid).slice(0,150);if(favorites.length!==base.favorites.length)changed=true;base.favorites=favorites;
  if(changed||!source||JSON.stringify(source)!==JSON.stringify(base)){user.soundStudio=base;changed=true;}
  return {settings:base,changed};
}
export function buildSoundThemePreset(theme,current=defaultSoundStudioPreferences()){
  const themeIndex=SOUND_STUDIO_THEMES.findIndex(item=>item.key===theme);
  if(themeIndex<0)return {valid:false,error:"Choose one of Minglora's six sound themes."};
  const voice=first(voiceIds),video=first(videoIds),notification=first(notificationIds);
  if(!voice||!video||!notification)return {valid:false,error:"Theme presets are unavailable until authentic recordings are approved and installed."};
  const next={...current,theme,voiceCall:{...(current.voiceCall||{}),soundId:voice},
    videoCall:{...(current.videoCall||{}),soundId:video},notifications:{...(current.notifications||{})}};
  for(const category of SOUND_STUDIO_CATEGORIES)next.notifications[category.key]={...(current.notifications?.[category.key]||{}),soundId:notification};
  return {valid:true,settings:next};
}
export function validateSoundStudioPatch(current,patch,customIds=[]){
  if(!record(patch))return {valid:false,error:"Sound preferences must be an object."};
  const defaults=defaultSoundStudioPreferences(),next={...defaults,...(record(current)?current:{}),
    voiceCall:{...defaults.voiceCall,...(record(current?.voiceCall)?current.voiceCall:{})},
    videoCall:{...defaults.videoCall,...(record(current?.videoCall)?current.videoCall:{})},
    notifications:{...(current?.notifications||{})},favorites:Array.isArray(current?.favorites)?[...current.favorites]:[],
    customSounds:Array.isArray(current?.customSounds)?[...current.customSounds]:[]};
  const allowed=new Set([...builtinIds,...customIds]);
  for(const [key,value] of Object.entries(patch)){
    if(key==="theme"){if(!SOUND_STUDIO_THEMES.some(t=>t.key===value))return {valid:false,error:"Choose a supported sound theme."};next.theme=value;continue;}
    if(key==="voiceCall"||key==="videoCall"){
      if(!record(value)||Object.keys(value).some(field=>!["soundId","enabled"].includes(field)))return {valid:false,error:"Call sound settings are invalid."};
      const library=key==="voiceCall"?voiceIds:videoIds;
      if(Object.hasOwn(value,"soundId")){if(value.soundId!==null&&(typeof value.soundId!=="string"||(!library.has(value.soundId)&&!customIds.includes(value.soundId))))return {valid:false,error:"Choose an approved authentic recording or a private custom sound for this call type."};next[key].soundId=value.soundId;}
      if(Object.hasOwn(value,"enabled")){if(typeof value.enabled!=="boolean")return {valid:false,error:"Call sound enablement must be true or false."};next[key].enabled=value.enabled;}
      continue;
    }
    if(key==="notifications"){
      if(!record(value))return {valid:false,error:"Notification sound assignments are invalid."};
      for(const [categoryKey,assignment] of Object.entries(value)){
        if(!SOUND_STUDIO_CATEGORIES.some(c=>c.key===categoryKey)||!record(assignment)||Object.keys(assignment).some(field=>!["soundId","enabled"].includes(field)))return {valid:false,error:"An unsupported notification category was supplied."};
        if(Object.hasOwn(assignment,"soundId")){if(assignment.soundId!==null&&(typeof assignment.soundId!=="string"||(!notificationIds.has(assignment.soundId)&&!customIds.includes(assignment.soundId))))return {valid:false,error:"Choose an approved authentic recording or a private custom sound for this notification."};next.notifications[categoryKey]={...next.notifications[categoryKey],soundId:assignment.soundId};}
        if(Object.hasOwn(assignment,"enabled")){if(typeof assignment.enabled!=="boolean")return {valid:false,error:"Notification sound enablement must be true or false."};next.notifications[categoryKey]={...next.notifications[categoryKey],enabled:assignment.enabled};}
      }
      continue;
    }
    if(key==="favorites"){if(!Array.isArray(value)||value.length>150||value.some(id=>typeof id!=="string"||!allowed.has(id)))return {valid:false,error:"Favorites must contain up to 150 available Minglora sounds."};next.favorites=[...new Set(value)];continue;}
    return {valid:false,error:"Unsupported Sound Studio setting: "+key};
  }
  return {valid:true,settings:next};
}
