export const AUDIO_CATEGORIES = Object.freeze([
  ["notifications","Notifications"],
  ["messaging","Messaging"],
  ["voice_calls","Voice calls"],
  ["video_calls","Video calls"],
  ["meetwave","MeetWave"],
  ["live_streaming","LIVE streaming"],
  ["live_gifts","LIVE gifts"],
  ["coins_transactions","Coins and transactions"],
  ["posts","Posts"],
  ["reels","Reels"],
  ["stories","Stories"],
  ["photos_albums","Photos and albums"],
  ["videos","Videos"],
  ["gaming","Gaming"],
  ["marketplace","Marketplace"],
  ["payments","Payments"],
  ["security","Security"],
  ["navigation","Navigation"],
  ["accessibility","Accessibility"],
  ["creator_studio","Creator Studio"],
  ["ai_network","AI Network"],
  ["music","Music"],
  ["sound_effects","Sound effects"],
  ["voice_recordings","Voice recordings"],
  ["environmental_recordings","Environmental recordings"],
  ["cultural_recordings","Cultural and traditional recordings"]
].map(([key,label],index)=>Object.freeze({key,label,sortOrder:index+1})));

export const AUDIO_EVENTS = Object.freeze([
  ["notification.incoming","notifications","Incoming notification"],
  ["notification.system","notifications","System notification"],
  ["message.incoming","messaging","Incoming private message"],
  ["message.outgoing","messaging","Outgoing message"],
  ["message.group_incoming","messaging","Incoming group message"],
  ["message.voice_received","messaging","Voice message received"],
  ["message.voice_sent","messaging","Voice message sent"],
  ["message.reaction","messaging","Message reaction"],
  ["message.error","messaging","Message error"],
  ["call.incoming_voice","voice_calls","Incoming voice call"],
  ["call.outgoing_voice","voice_calls","Outgoing voice call"],
  ["call.incoming_video","video_calls","Incoming video call"],
  ["call.outgoing_video","video_calls","Outgoing video call"],
  ["call.connecting","voice_calls","Call connecting"],
  ["call.connected","voice_calls","Call connected"],
  ["call.participant_joined","voice_calls","Participant joined"],
  ["call.participant_left","voice_calls","Participant left"],
  ["call.muted","voice_calls","Microphone muted"],
  ["call.unmuted","voice_calls","Microphone unmuted"],
  ["call.ended","voice_calls","Call ended"],
  ["call.missed","voice_calls","Missed call"],
  ["meetwave.invitation","meetwave","Meeting invitation"],
  ["meetwave.reminder","meetwave","Meeting reminder"],
  ["meetwave.participant_joined","meetwave","Meeting participant joined"],
  ["live.started","live_streaming","LIVE started"],
  ["live.viewer_joined","live_streaming","Viewer joined LIVE"],
  ["live.viewer_left","live_streaming","Viewer left LIVE"],
  ["live.host_notice","live_streaming","Host notice"],
  ["live.ended","live_streaming","LIVE ended"],
  ["gift.received","live_gifts","Gift received"],
  ["gift.special_received","live_gifts","Special gift received"],
  ["coin.received","coins_transactions","Coins received"],
  ["coin.purchase_success","coins_transactions","Coin purchase successful"],
  ["payment.success","payments","Payment successful"],
  ["payment.failure","payments","Payment failed"],
  ["post.published","posts","Post published"],
  ["reel.published","reels","Reel published"],
  ["story.published","stories","Story published"],
  ["photo.uploaded","photos_albums","Photo uploaded"],
  ["video.uploaded","videos","Video uploaded"],
  ["gaming.match_found","gaming","Game match found"],
  ["gaming.session_event","gaming","Game session event"],
  ["security.login_alert","security","Login alert"],
  ["security.account_alert","security","Account security alert"],
  ["navigation.action_feedback","navigation","Navigation feedback"],
  ["accessibility.spoken_feedback","accessibility","Accessible spoken feedback"],
  ["creator.export_ready","creator_studio","Creator export ready"],
  ["ai.response_received","ai_network","AI response received"],
  ["marketplace.order_update","marketplace","Marketplace order update",false]
].map(([key,categoryKey,label,enabled=true])=>Object.freeze({key,categoryKey,label,enabled})));

export const AUDIO_FILE_EXTENSIONS = Object.freeze(["mp3","m4a","ogg","opus","wav","flac","aac","webm"]);
export const AUDIO_MIME_TYPES = Object.freeze([
  "audio/mpeg","audio/mp4","audio/ogg","audio/opus","audio/wav","audio/x-wav",
  "audio/flac","audio/aac","audio/webm"
]);

export const ACCEPTED_RECORDING_TYPES = Object.freeze([
  "field_recording","studio_recording","voice_recording","instrument_recording",
  "environmental_recording","wildlife_recording","cultural_recording",
  "user_original_recording","creator_original_recording"
]);

const CATEGORY_KEYS = new Set(AUDIO_CATEGORIES.map(item=>item.key));
const EVENT_BY_KEY = new Map(AUDIO_EVENTS.map(item=>[item.key,item]));
const RECORDING_TYPES = new Set(ACCEPTED_RECORDING_TYPES);
const BLOCKED_ORIGINS = new Set([
  "synthetic","synthesized","procedural","ai_generated","text_to_speech",
  "oscillator","generated_tone","robotic_voice","unknown"
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const safeText = (value,max=500) => String(value ?? "").trim().slice(0,max);
const validHttpsUrl = value => {
  try { const url=new URL(String(value)); return url.protocol==="https:"; }
  catch { return false; }
};
const safeDate = value => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};
const validFileName = value => /^[a-z0-9]+(?:_[a-z0-9]+){2,}_v[0-9]{3,}\\.(mp3|m4a|ogg|opus|wav|flac|aac|webm)$/i.test(String(value||""));

export function validateAudioAssetMetadata(input={}) {
  const scope = safeText(input.scope,24);
  const categoryKey = safeText(input.categoryKey,80);
  const eventKey = safeText(input.eventKey,100);
  const originalFilename = safeText(input.originalFilename,180);
  const fileFormat = safeText(input.fileFormat,12).toLowerCase().replace(/^\\./,"");
  const originType = safeText(input.originType,40).toLowerCase();
  const authenticityStatus = safeText(input.authenticityStatus,40).toLowerCase() || "unverified";
  const reviewStatus = safeText(input.reviewStatus,32).toLowerCase() || "draft";
  const title = safeText(input.title,120);
  const description = safeText(input.description,1000);
  const sourceWebsite = safeText(input.sourceWebsite,120);
  const originalDownloadPage = safeText(input.originalDownloadPage,500);
  const licenseName = safeText(input.licenseName,120);
  const licenseUrl = safeText(input.licenseUrl,500);
  const attributionText = safeText(input.attributionText,1000);
  const downloadDate = input.downloadDate ? safeDate(input.downloadDate) : null;
  const byteSize = Number(input.byteSize);
  const durationMs = Number(input.durationMs);
  const sampleRateHz = Number(input.sampleRateHz || 0);
  const bitRateBps = Number(input.bitRateBps || 0);
  const channelCount = Number(input.channelCount || 0);
  const sha256 = safeText(input.sha256,64).toLowerCase();
  const commercialUseAllowed = input.commercialUseAllowed === true;
  const redistributionAllowed = input.redistributionAllowed === true;
  const attributionRequired = input.attributionRequired === true;
  const licenseVerified = input.licenseVerified === true;
  const rightsConfirmed = input.rightsConfirmed === true;
  const errors = [];

  if (title.length < 2) errors.push("Audio title must contain at least 2 characters.");
  if (!["platform","creator","private_user"].includes(scope)) errors.push("Choose a valid audio ownership scope.");
  if (!CATEGORY_KEYS.has(categoryKey)) errors.push("Choose a registered audio category.");
  if (eventKey && (!EVENT_BY_KEY.has(eventKey) || EVENT_BY_KEY.get(eventKey).categoryKey !== categoryKey)) errors.push("The selected event does not belong to this audio category.");
  if (!validFileName(originalFilename)) errors.push("Use category_event_description_v001.ext filename format.");
  if (!AUDIO_FILE_EXTENSIONS.includes(fileFormat) || !originalFilename.toLowerCase().endsWith("."+fileFormat)) errors.push("The filename extension and supported audio format must match.");
  if (!RECORDING_TYPES.has(originType) || BLOCKED_ORIGINS.has(originType)) errors.push("Only authentic recorded audio can enter the accepted audio library.");
  if (!["unverified","verified_authentic","rejected_synthetic","rejected_ai","rejected_fake"].includes(authenticityStatus)) errors.push("The authenticity review status is invalid.");
  if (!["draft","pending_review","approved","rejected","inactive","archived"].includes(reviewStatus)) errors.push("The audio review status is invalid.");
  if (authenticityStatus === "rejected_synthetic" || authenticityStatus === "rejected_ai" || authenticityStatus === "rejected_fake") errors.push("Synthetic, AI-generated and falsely represented recordings are not accepted.");
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > 50*1024*1024) errors.push("Audio file size must be between 1 byte and 50 MB.");
  if (!Number.isSafeInteger(durationMs) || durationMs < 100 || durationMs > 60*60*1000) errors.push("Audio duration must be between 100 ms and 60 minutes.");
  if (sampleRateHz && (!Number.isSafeInteger(sampleRateHz) || sampleRateHz < 8000 || sampleRateHz > 384000)) errors.push("Audio sample rate is invalid.");
  if (bitRateBps && (!Number.isSafeInteger(bitRateBps) || bitRateBps < 8000 || bitRateBps > 2000000)) errors.push("Audio bitrate is invalid.");
  if (channelCount && (!Number.isSafeInteger(channelCount) || channelCount < 1 || channelCount > 8)) errors.push("Audio channel count is invalid.");
  if (!SHA256_PATTERN.test(sha256)) errors.push("A valid SHA-256 checksum is required.");
  if (!rightsConfirmed) errors.push("Confirm that the upload is authentic and that its publication rights have been checked.");

  if (scope === "platform") {
    if (!sourceWebsite || !validHttpsUrl(originalDownloadPage)) errors.push("Platform audio requires its original website and source download page.");
    if (!licenseName || !validHttpsUrl(licenseUrl)) errors.push("Platform audio requires the exact licence name and licence URL.");
    if (!licenseVerified) errors.push("The licence must be individually verified before platform publication.");
    if (!commercialUseAllowed) errors.push("The licence does not confirm commercial use.");
    if (!redistributionAllowed) errors.push("The licence does not confirm redistribution or platform delivery.");
    if (attributionRequired && !attributionText) errors.push("Required creator attribution is missing.");
    if (!downloadDate) errors.push("Record the date the file was obtained.");
  }
  if (scope === "creator" && !rightsConfirmed) errors.push("Creator audio requires an explicit ownership or permission confirmation.");
  if (scope === "private_user" && !rightsConfirmed) errors.push("Private uploads require an explicit ownership or permission confirmation.");

  const value = errors.length ? null : {
    title,description,scope,categoryKey,eventKey:eventKey||null,originalFilename,fileFormat,
    originType,authenticityStatus,reviewStatus,sourceWebsite,originalDownloadPage,
    licenseName,licenseUrl,attributionText,downloadDate,byteSize,durationMs,
    sampleRateHz:sampleRateHz||null,bitRateBps:bitRateBps||null,channelCount:channelCount||null,
    sha256,commercialUseAllowed,redistributionAllowed,attributionRequired,licenseVerified,rightsConfirmed
  };
  return {valid:errors.length===0,errors,value};
}

export function isProductionAudioEligible(asset={}) {
  return Boolean(
    asset.scope === "platform" &&
    asset.reviewStatus === "approved" &&
    asset.authenticityStatus === "verified_authentic" &&
    asset.licenseVerified === true &&
    asset.commercialUseAllowed === true &&
    asset.redistributionAllowed === true &&
    asset.attributionRequired !== true || (
      asset.scope === "platform" &&
      asset.reviewStatus === "approved" &&
      asset.authenticityStatus === "verified_authentic" &&
      asset.licenseVerified === true &&
      asset.commercialUseAllowed === true &&
      asset.redistributionAllowed === true &&
      asset.attributionRequired === true &&
      Boolean(String(asset.attributionText||"").trim())
    )
  );
}

export function validateAudioAssignment(input={}) {
  const eventKey=safeText(input.eventKey,100);
  const assetId=safeText(input.assetId,80);
  const volume=Number(input.volume ?? 1);
  const enabled=input.enabled !== false;
  const loop=input.loop === true;
  const errors=[];
  if(!EVENT_BY_KEY.has(eventKey))errors.push("Choose a registered Minglora audio event.");
  else if(EVENT_BY_KEY.get(eventKey).enabled===false)errors.push("This event is not active in the current Minglora runtime.");
  if(!assetId)errors.push("Choose an approved audio asset.");
  if(!Number.isFinite(volume)||volume<0||volume>1)errors.push("Audio volume must be between 0 and 100%.");
  return {valid:errors.length===0,errors,value:errors.length?null:{eventKey,assetId,volume,enabled,loop}};
}
