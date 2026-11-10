export const SOUND_STUDIO_THEMES = Object.freeze([
  {key:"classic",label:"Classic"},{key:"modern",label:"Modern"},{key:"premium",label:"Premium"},
  {key:"minimal",label:"Minimal"},{key:"digital",label:"Digital"},{key:"cinematic",label:"Cinematic"}
]);
export const SOUND_STUDIO_CATEGORIES = Object.freeze([
  ["private_messages","Private messages"],["group_messages","Group messages"],["new_followers","New followers"],
  ["new_friends","New friends"],["voice_messages","Voice messages"],["replies","Replies"],["reactions","Reactions"],
  ["comments","Comments"],["mentions_tags","Mentions and tags"],["missed_voice_calls","Missed voice calls"],
  ["missed_video_calls","Missed video calls"],["incoming_calls","Incoming calls"],["live_notifications","LIVE notifications"],
  ["meeting_invitations","Meeting invitations"],["meeting_reminders","Meeting reminders"],["gifts_received","Gifts received"],
  ["coins_received","Coins received"],["payments_transactions","Payments and transactions"],["marketplace_orders","Marketplace orders"],
  ["security_alerts","Security alerts"],["login_alerts","Login alerts"],["system_notifications","System notifications"]
].map(([key,label],index)=>Object.freeze({key,label,defaultSoundId:"notification-"+String(index+1).padStart(2,"0")})));
const voiceId=n=>"voice-"+String(n).padStart(2,"0"),videoId=n=>"video-"+String(n).padStart(2,"0"),notificationId=n=>"notification-"+String(n).padStart(2,"0");
const builtinIds=new Set([...Array.from({length:30},(_,i)=>voiceId(i+1)),...Array.from({length:30},(_,i)=>videoId(i+1)),...Array.from({length:60},(_,i)=>notificationId(i+1))]);
const record=value=>value&&typeof value==="object"&&!Array.isArray(value);
export function defaultSoundStudioPreferences(){
  return {theme:"classic",voiceCall:{soundId:"voice-01",enabled:true},videoCall:{soundId:"video-01",enabled:true},
    notifications:Object.fromEntries(SOUND_STUDIO_CATEGORIES.map((category,index)=>[category.key,{soundId:notificationId(index%10+1),enabled:true}])),
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
  base.customSounds=customs;const customIds=new Set(customs.map(item=>item.id)),valid=id=>builtinIds.has(id)||customIds.has(id);
  if(!valid(base.voiceCall.soundId)){base.voiceCall.soundId="voice-01";changed=true;}
  if(!valid(base.videoCall.soundId)){base.videoCall.soundId="video-01";changed=true;}
  for(const call of ["voiceCall","videoCall"])if(typeof base[call].enabled!=="boolean"){base[call].enabled=true;changed=true;}
  for(const category of SOUND_STUDIO_CATEGORIES){
    const item=base.notifications[category.key];
    if(!valid(item.soundId)){item.soundId=category.defaultSoundId;changed=true;}
    if(typeof item.enabled!=="boolean"){item.enabled=true;changed=true;}
  }
  const favorites=base.favorites.filter(valid).slice(0,150);if(favorites.length!==base.favorites.length)changed=true;base.favorites=favorites;
  if(changed||!source||JSON.stringify(source)!==JSON.stringify(base)){user.soundStudio=base;changed=true;}
  return {settings:base,changed};
}
export function buildSoundThemePreset(theme,current=defaultSoundStudioPreferences()){
  const themeIndex=SOUND_STUDIO_THEMES.findIndex(item=>item.key===theme);
  if(themeIndex<0)return {valid:false,error:"Choose one of Minglora's six sound themes."};
  const next={...current,theme,voiceCall:{...(current.voiceCall||{}),soundId:voiceId(themeIndex*5+1)},
    videoCall:{...(current.videoCall||{}),soundId:videoId(themeIndex*5+1)},notifications:{...(current.notifications||{})}};
  for(let i=0;i<SOUND_STUDIO_CATEGORIES.length;i++){const category=SOUND_STUDIO_CATEGORIES[i];next.notifications[category.key]={...(current.notifications?.[category.key]||{}),soundId:notificationId(themeIndex*10+(i%10)+1)};}
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
      const group=key==="voiceCall"?/^voice-\d{2}$/:/^video-\d{2}$/;
      if(Object.hasOwn(value,"soundId")){if(typeof value.soundId!=="string"||(!group.test(value.soundId)&&!customIds.includes(value.soundId)))return {valid:false,error:"Choose a sound from the correct call library."};next[key].soundId=value.soundId;}
      if(Object.hasOwn(value,"enabled")){if(typeof value.enabled!=="boolean")return {valid:false,error:"Call sound enablement must be true or false."};next[key].enabled=value.enabled;}
      continue;
    }
    if(key==="notifications"){
      if(!record(value))return {valid:false,error:"Notification sound assignments are invalid."};
      for(const [categoryKey,assignment] of Object.entries(value)){
        if(!SOUND_STUDIO_CATEGORIES.some(c=>c.key===categoryKey)||!record(assignment)||Object.keys(assignment).some(field=>!["soundId","enabled"].includes(field)))return {valid:false,error:"An unsupported notification category was supplied."};
        if(Object.hasOwn(assignment,"soundId")){if(typeof assignment.soundId!=="string"||(!/^notification-\d{2}$/.test(assignment.soundId)&&!customIds.includes(assignment.soundId)))return {valid:false,error:"Choose a sound from the notification library."};next.notifications[categoryKey]={...next.notifications[categoryKey],soundId:assignment.soundId};}
        if(Object.hasOwn(assignment,"enabled")){if(typeof assignment.enabled!=="boolean")return {valid:false,error:"Notification sound enablement must be true or false."};next.notifications[categoryKey]={...next.notifications[categoryKey],enabled:assignment.enabled};}
      }
      continue;
    }
    if(key==="favorites"){if(!Array.isArray(value)||value.length>150||value.some(id=>typeof id!=="string"||!allowed.has(id)))return {valid:false,error:"Favorites must contain up to 150 available Minglora sounds."};next.favorites=[...new Set(value)];continue;}
    return {valid:false,error:"Unsupported Sound Studio setting: "+key};
  }
  return {valid:true,settings:next};
}
