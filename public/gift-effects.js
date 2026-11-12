(() => {
  "use strict";
  let ctx=null;
  function audio(){
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C)return null;
    if(!ctx)ctx=new C();
    return ctx;
  }
  function prime(){void loadCatalogMotionIndex();void loadGiftSoundMap().catch(()=>null);try{const c=audio();if(c?.state==="suspended")void c.resume();return Boolean(c);}catch{return false;}}
  function hash(value){let h=2166136261;for(const ch of String(value||"")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  let catalogMotionIndex=null;
  let catalogMotionLoadPromise=null;
  const semanticChoreography={
    "firework-burst":"celebration-burst",
    "rocket-launch":"grand-entry",
    "sky-flight":"horizon-sweep",
    "speed-drift":"horizon-sweep",
    "butterfly-flutter":"petal-bloom",
    "winged-flight":"creature-entrance",
    "playful-creature":"creature-entrance",
    "blossom-bloom":"petal-bloom",
    "gentle-float":"spark-float",
    "music-rhythm":"soundwave-ripple",
    "ocean-drift":"warm-wave",
    "sweet-pop":"delight-pop",
    "victory-impact":"power-impact",
    "magic-orbit":"cosmic-orbit",
    "island-wave":"warm-wave",
    "seasonal-shimmer":"royal-shimmer"
  };
  async function loadCatalogMotionIndex(){
    if(catalogMotionIndex)return catalogMotionIndex.size;
    if(catalogMotionLoadPromise)return catalogMotionLoadPromise;
    catalogMotionLoadPromise=(async()=>{
      try{
        const response=await fetch("/assets/animations/gifts/catalog-motion-index.json",{credentials:"same-origin",cache:"force-cache"});
        if(!response.ok)throw new Error("Gift motion index is not available yet.");
        const payload=await response.json();
        const records=Array.isArray(payload?.gifts)?payload.gifts:[];
        const next=new Map();
        for(const item of records){
          const code=String(item?.code||"");
          if(!code||item.active!==true||typeof item.motion_preset!=="string")continue;
          if(typeof item.image_url!=="string"||typeof item.model_url!=="string")continue;
          next.set(code,item);
        }
        catalogMotionIndex=next;
        return next.size;
      }catch(error){
        catalogMotionLoadPromise=null;
        return 0;
      }
    })();
    return catalogMotionLoadPromise;
  }
  function withCatalogMotion(gift){
    if(!gift||!catalogMotionIndex)return gift;
    const profile=catalogMotionIndex.get(String(gift.code||""));
    return profile?{...gift,motion_preset:profile.motion_preset,motion_effect:profile.motion_effect,motion_duration_ms:profile.motion_duration_ms}:gift;
  }
  function effectHue(effect,seed){
    const base={petals:334,waves:198,rings:46,trail:194,orbits:270,bubbles:178,sparkles:45};
    return ((base[effect]??(seed%360))+(seed%17))%360;
  }
  function buildPreviewFrames(preset,v){
    const {dx,dy,tilt,spin,peak,rebound}=v;
    const neutral={offset:1,opacity:1,transform:"translate3d(0,0,0) rotateZ(0deg) scale(1)",filter:"none"};
    if(preset==="firework-burst"||preset==="celebration-burst")return [
      {offset:0,opacity:0,transform:"scale(.22) rotateZ(-18deg)",filter:"brightness(.7)"},
      {offset:.28,opacity:1,transform:"scale(1.24) rotateZ(9deg)",filter:"brightness(1.55) saturate(1.4)"},
      {offset:.58,opacity:1,transform:"scale(.94) rotateZ(-6deg)",filter:"brightness(1.2)"},
      neutral
    ];
    if(preset==="rocket-launch")return [
      {offset:0,opacity:0,transform:"translate3d(0,34px,0) rotateZ(-7deg) scale(.72)",filter:"brightness(.8)"},
      {offset:.24,opacity:1,transform:"translate3d(0,-22px,0) rotateZ(4deg) scale(1.08)",filter:"brightness(1.3)"},
      {offset:.72,opacity:1,transform:"translate3d(0,-48px,0) rotateZ(-2deg) scale(.94)",filter:"brightness(1.12)"},
      neutral
    ];
    if(preset==="sky-flight"||preset==="speed-drift")return [
      {offset:0,opacity:0,transform:"translate3d(-52px,18px,0) rotateZ(-8deg) scale(.8)",filter:"brightness(.82)"},
      {offset:.32,opacity:1,transform:"translate3d(8px,-10px,0) rotateZ(5deg) scale(1.08)",filter:"brightness(1.25)"},
      {offset:.72,opacity:1,transform:"translate3d(26px,4px,0) rotateZ(-3deg) scale(.96)",filter:"brightness(1.08)"},
      neutral
    ];
    if(preset==="butterfly-flutter"||preset==="winged-flight")return [
      {offset:0,opacity:0,transform:"translate3d(0,18px,0) rotateZ(-tiltdeg) scale(.75)".replace("tiltdeg",String(Math.abs(tilt))),filter:"brightness(.82)"},
      {offset:.22,opacity:1,transform:"translate3d("+(-dx*.3)+"px,"+(dy*.55)+"px,0) rotateZ("+tilt+"deg) scale(1.08)",filter:"brightness(1.22)"},
      {offset:.48,opacity:1,transform:"translate3d("+dx+"px,"+(dy*.2)+"px,0) rotateZ("+(-tilt)+"deg) scale(.96)",filter:"brightness(1.12)"},
      {offset:.74,opacity:1,transform:"translate3d("+(-dx*.4)+"px,"+(dy*.3)+"px,0) rotateZ("+(tilt*.5)+"deg) scale(1.02)",filter:"none"},
      neutral
    ];
    if(preset==="blossom-bloom"||preset==="petal-bloom")return [
      {offset:0,opacity:0,transform:"scale(.55) rotateZ(-24deg)",filter:"brightness(.85)"},
      {offset:.35,opacity:1,transform:"scale(1.15) rotateZ(9deg)",filter:"brightness(1.24)"},
      {offset:.7,opacity:1,transform:"scale(.98) rotateZ(-4deg)",filter:"brightness(1.08)"},
      neutral
    ];
    if(preset==="heart-pulse")return [
      {offset:0,opacity:0,transform:"scale(.7)",filter:"brightness(.9)"},
      {offset:.28,opacity:1,transform:"scale(1.16)",filter:"brightness(1.2)"},
      {offset:.48,opacity:1,transform:"scale(.94)",filter:"none"},
      {offset:.68,opacity:1,transform:"scale(1.08)",filter:"brightness(1.12)"},
      neutral
    ];
    if(preset==="royal-shimmer"||preset==="seasonal-shimmer")return [
      {offset:0,opacity:0,transform:"scale(.78) rotateZ(-5deg)",filter:"brightness(.72) saturate(.8)"},
      {offset:.3,opacity:1,transform:"scale(1.08) rotateZ(4deg)",filter:"brightness(1.55) saturate(1.35)"},
      {offset:.68,opacity:1,transform:"scale(1) rotateZ(-2deg)",filter:"brightness(1.24)"},
      neutral
    ];
    if(preset==="gentle-float"||preset==="nature-rise")return [
      {offset:0,opacity:0,transform:"translate3d(0,24px,0) scale(.82)",filter:"brightness(.9)"},
      {offset:.3,opacity:1,transform:"translate3d(0,-12px,0) scale(1.05)",filter:"brightness(1.14)"},
      {offset:.68,opacity:1,transform:"translate3d(0,-4px,0) scale(.98)",filter:"none"},
      neutral
    ];
    if(preset==="music-rhythm"||preset==="soundwave-ripple")return [
      {offset:0,opacity:0,transform:"translate3d(0,12px,0) rotateZ(-8deg) scale(.86)",filter:"brightness(.84)"},
      {offset:.25,opacity:1,transform:"translate3d(0,-7px,0) rotateZ(8deg) scale(1.08)",filter:"brightness(1.22)"},
      {offset:.5,opacity:1,transform:"translate3d(0,5px,0) rotateZ(-6deg) scale(.96)",filter:"none"},
      {offset:.75,opacity:1,transform:"translate3d(0,-4px,0) rotateZ(5deg) scale(1.03)",filter:"none"},
      neutral
    ];
    if(preset==="ocean-drift"||preset==="island-wave"||preset==="warm-wave")return [
      {offset:0,opacity:0,transform:"translate3d(-24px,12px,0) rotateZ(-5deg) scale(.86)",filter:"brightness(.85)"},
      {offset:.3,opacity:1,transform:"translate3d(12px,-8px,0) rotateZ(5deg) scale(1.06)",filter:"brightness(1.16)"},
      {offset:.65,opacity:1,transform:"translate3d(-8px,3px,0) rotateZ(-3deg) scale(.98)",filter:"none"},
      neutral
    ];
    if(preset==="sweet-pop"||preset==="delight-pop")return [
      {offset:0,opacity:0,transform:"scale(.18) translateY(18px)",filter:"brightness(.8)"},
      {offset:.38,opacity:1,transform:"scale(1.2) translateY(-7px)",filter:"brightness(1.25)"},
      {offset:.7,opacity:1,transform:"scale(.94) translateY(2px)",filter:"none"},
      neutral
    ];
    if(preset==="victory-impact"||preset==="power-impact")return [
      {offset:0,opacity:0,transform:"translate3d(0,-34px,0) scale(.7)",filter:"brightness(.8)"},
      {offset:.34,opacity:1,transform:"translate3d(0,7px,0) scale(1.17)",filter:"brightness(1.35)"},
      {offset:.55,opacity:1,transform:"translate3d(0,-4px,0) scale(.96)",filter:"brightness(1.1)"},
      neutral
    ];
    if(preset==="magic-orbit"||preset==="cosmic-orbit")return [
      {offset:0,opacity:0,transform:"rotateZ(-70deg) scale(.58)",filter:"brightness(.8)"},
      {offset:.35,opacity:1,transform:"rotateZ(18deg) scale(1.12)",filter:"brightness(1.3)"},
      {offset:.7,opacity:1,transform:"rotateZ(-12deg) scale(.97)",filter:"brightness(1.08)"},
      neutral
    ];
    return [
      {offset:0,opacity:0,transform:"translate3d(0,22px,0) rotateZ("+(-tilt*.6)+"deg) scale(.68)",filter:"brightness(.78) saturate(.8)"},
      {offset:.2,opacity:1,transform:"translate3d("+dx+"px,"+dy+"px,0) rotateZ("+tilt+"deg) scale("+peak+")",filter:"brightness(1.3) saturate(1.35)"},
      {offset:.52,opacity:1,transform:"translate3d("+(-dx*.62)+"px,"+(-dy*.16)+"px,0) rotateZ("+spin+"deg) scale("+rebound+")",filter:"brightness(1.12) saturate(1.12)"},
      {offset:.76,opacity:1,transform:"translate3d("+(dx*.18)+"px,"+(dy*.08)+"px,0) rotateZ("+(-tilt*.25)+"deg) scale(1.035)",filter:"brightness(1.05) saturate(1.05)"},
      neutral
    ];
  }
  let giftSoundMapPromise=null;
  const giftSoundBuffers=new Map();
  const activeGiftSoundSources=new Set();
  const activeGiftSoundElements=new Set();
  const GIFT_SOUND_MAP_URL="/assets/Gift%20Sounds/gift-code-map.json";
  const GIFT_SOUND_BASE_PATH="/assets/Gift Sounds/";
  const MAX_ACTIVE_GIFT_SOUNDS=4;
  function loadGiftSoundMap(){
    if(!giftSoundMapPromise){
      giftSoundMapPromise=fetch(GIFT_SOUND_MAP_URL,{credentials:"same-origin",cache:"force-cache"})
        .then(response=>{
          if(!response.ok)throw new Error("Gift sound map unavailable.");
          return response.json();
        })
        .then(payload=>{
          const byCode=payload&&payload.gifts_by_code&&typeof payload.gifts_by_code==="object"?payload.gifts_by_code:{};
          const bySlug=new Map();
          for(const entry of Object.values(byCode)){
            if(entry&&typeof entry.slug==="string")bySlug.set(entry.slug,entry);
          }
          return {byCode,bySlug};
        })
        .catch(error=>{giftSoundMapPromise=null;throw error;});
    }
    return giftSoundMapPromise;
  }
  function safeGiftSoundUrl(value){
    try{
      const url=new URL(String(value||""),window.location.href);
      const decodedPath=decodeURIComponent(url.pathname);
      if(url.origin!==window.location.origin||!decodedPath.startsWith(GIFT_SOUND_BASE_PATH)||!decodedPath.endsWith("/sound.mp3"))return "";
      return url.href;
    }catch{return "";}
  }
  async function resolveGiftSound(gift){
    if(!gift||typeof gift!=="object")return null;
    try{
      const map=await loadGiftSoundMap();
      const code=String(gift.code||gift.giftCode||gift.gift_code||"").trim();
      let entry=code?map.byCode[code]:null;
      if(!entry){
        const slug=String(gift.slug||gift.asset_slug||"").trim();
        if(slug)entry=map.bySlug.get(slug)||null;
      }
      if(!entry)return null;
      const url=safeGiftSoundUrl(entry.audioUrl);
      return url?{url,volume:Number(entry.volume)||.68,slug:entry.slug,sourceId:entry.sourceId,playbackEnabled:entry.playbackEnabled===true}:null;
    }catch{return null;}
  }
  async function loadGiftSoundBuffer(url,c){
    if(giftSoundBuffers.has(url))return giftSoundBuffers.get(url);
    const pending=fetch(url,{credentials:"same-origin",cache:"force-cache"})
      .then(response=>{
        if(!response.ok)throw new Error("Gift sound file unavailable.");
        return response.arrayBuffer();
      })
      .then(bytes=>c.decodeAudioData(bytes.slice(0)));
    giftSoundBuffers.set(url,pending);
    try{return await pending;}
    catch(error){giftSoundBuffers.delete(url);throw error;}
  }
  function trackGiftSoundSource(source){
    activeGiftSoundSources.add(source);
    while(activeGiftSoundSources.size>MAX_ACTIVE_GIFT_SOUNDS){
      const oldest=activeGiftSoundSources.values().next().value;
      try{oldest.stop();}catch{}
      activeGiftSoundSources.delete(oldest);
    }
    source.addEventListener?.("ended",()=>activeGiftSoundSources.delete(source),{once:true});
  }
  function trackGiftSoundElement(element){
    activeGiftSoundElements.add(element);
    while(activeGiftSoundElements.size>MAX_ACTIVE_GIFT_SOUNDS){
      const oldest=activeGiftSoundElements.values().next().value;
      oldest.pause();
      oldest.currentTime=0;
      activeGiftSoundElements.delete(oldest);
    }
    element.addEventListener("ended",()=>activeGiftSoundElements.delete(element),{once:true});
  }
  async function play(gift,options={}){
    if(!gift)return false;
    const entry=await resolveGiftSound(gift);
    if(!entry||(!entry.playbackEnabled&&options.review!==true))return false;
    const requestedVolume=Number(options.volume??entry.volume);
    const volume=Number.isFinite(requestedVolume)?Math.max(0,Math.min(1,requestedVolume)):.68;
    const durationValue=Number(options.durationSeconds);
    const durationLimit=Number.isFinite(durationValue)&&durationValue>0?Math.max(.35,Math.min(8,durationValue)):5.5;
    const c=audio();
    if(!c){
      try{
        const element=new Audio(entry.url);
        element.preload="auto";
        element.volume=volume;
        element.currentTime=0;
        trackGiftSoundElement(element);
        await element.play();
        return true;
      }catch{return false;}
    }
    try{
      if(c.state==="suspended")await c.resume();
      const buffer=await loadGiftSoundBuffer(entry.url,c);
      const source=c.createBufferSource();
      const gain=c.createGain();
      const panner=c.createStereoPanner?.();
      const now=c.currentTime;
      const duration=Math.min(buffer.duration,durationLimit);
      if(!Number.isFinite(duration)||duration<=.05)return false;
      source.buffer=buffer;
      gain.gain.setValueAtTime(.0001,now);
      gain.gain.linearRampToValueAtTime(volume,now+.035);
      gain.gain.setValueAtTime(volume,Math.max(now+.04,now+duration-.18));
      gain.gain.linearRampToValueAtTime(.0001,now+duration);
      source.connect(gain);
      if(panner){
        const identity=String(gift.code||gift.name||entry.slug);
        const pan=((hash(identity)%31)-15)/100;
        panner.pan.setValueAtTime(pan,now);
        gain.connect(panner);
        panner.connect(c.destination);
      }else gain.connect(c.destination);
      trackGiftSoundSource(source);
      source.start(now,0,duration);
      return true;
    }catch{return false;}
  }
  const presets=new Set(["petal-bloom","heart-pulse","creature-entrance","grand-entry","soundwave-ripple","power-impact","delight-pop","glam-spin","royal-shimmer","celebration-burst","cosmic-orbit","nature-rise","horizon-sweep","pixel-burst","warm-wave","spark-float","gift-reveal"]);
  function mount(parent,gift,options={}){
    if(!parent||!gift)return null;
    const originalGift=gift;
    gift=withCatalogMotion(gift);
    // Keep the catalogue's original choreography as the outer gift entrance.
    // The new subject-aware motion runs on the original artwork/model inside it.
    const duration=Math.max(900,Math.min(8000,Number(options.duration)||Number(gift.animation_duration_ms)||Number(gift.motion_duration_ms)||2600));
    const requestedPreset=gift.motion_preset||gift.animation_preset||"gift-reveal";
    const originalPreset=gift.animation_preset||"gift-reveal";
    const fallbackPreset=semanticChoreography[requestedPreset]||requestedPreset;
    const preset=presets.has(originalPreset)?originalPreset:presets.has(fallbackPreset)?fallbackPreset:"gift-reveal";
    const animationIdentity=String(gift.animation_key||gift.code||gift.name||"minglora-gift");
    const motionSeed=hash([animationIdentity,gift.code,gift.name].join("|"));
    const particleHue=effectHue(String(gift.motion_effect||"sparkles"),motionSeed);
    const dx=(motionSeed%81)-40,dy=-18-((motionSeed>>>7)%65),tilt=(motionSeed>>>13)%71-35;
    const spin=((motionSeed>>>19)%2?1:-1)*(50+((motionSeed>>>20)%311));
    const peak=(104+((motionSeed>>>3)%27))/100,rebound=(90+((motionSeed>>>11)%15))/100;
    const outer=document.createElement("div");
    outer.className="minglora-gift-fx minglora-fx-"+preset;
    outer.dataset.giftAnimation=animationIdentity;
    outer.dataset.giftCode=String(originalGift.code||"");
    outer.dataset.motionPreset=requestedPreset;
    outer.dataset.motionEffect=String(gift.motion_effect||"sparkles");
    outer.style.setProperty("--minglora-gift-duration",duration+"ms");
    outer.style.setProperty("--minglora-gift-dx",dx+"px");
    outer.style.setProperty("--minglora-gift-dy",dy+"px");
    outer.style.setProperty("--minglora-gift-tilt",tilt+"deg");
    outer.style.setProperty("--minglora-gift-start-tilt",(-tilt*.55)+"deg");
    outer.style.setProperty("--minglora-gift-spin",spin+"deg");
    outer.style.setProperty("--minglora-gift-peak",String(peak));
    outer.style.setProperty("--minglora-gift-rebound",String(rebound));
    outer.style.setProperty("--minglora-gift-rays-duration",(750+((motionSeed>>>9)%1400))+"ms");
    outer.style.setProperty("--minglora-gift-rays-delay",(-((motionSeed>>>21)%1000))+"ms");
    outer.style.setProperty("--minglora-gift-rays-angle",(motionSeed%360)+"deg");
    const rotationSpeed=24+((motionSeed>>>15)%90);
    const card=document.createElement("div");card.className="minglora-gift-fx-card";
    if(gift.model_url){
      const model=document.createElement("model-viewer");model.className="minglora-gift-fx-model";model.src=gift.model_url;model.alt=gift.name+" original Minglora gift";
      const reducedMotion=Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);if(!reducedMotion){model.setAttribute("auto-rotate","");model.setAttribute("autoplay","");}model.setAttribute("rotation-per-second",rotationSpeed+"deg");model.setAttribute("interaction-prompt","none");model.setAttribute("shadow-intensity",".8");model.setAttribute("exposure","1.18");card.append(model);
    }else if(gift.image_url){
      const img=document.createElement("img");img.className="minglora-gift-fx-model";img.src=gift.image_url;img.alt=gift.name;card.append(img);
    }else{
      const emoji=document.createElement("span");emoji.className="minglora-gift-fx-emoji";emoji.textContent=gift.emoji||"🎁";card.append(emoji);
    }
    const caption=document.createElement("strong");caption.className="minglora-gift-fx-caption";caption.textContent=gift.name||"Minglora Gift";card.append(caption);
    const rays=document.createElement("span");rays.className="minglora-gift-fx-rays";
    const particles=document.createElement("span");particles.className="minglora-gift-fx-particles";
    const particleCount=5+((motionSeed>>>24)%4);
    for(let i=0;i<particleCount;i++){
      const ps=hash(animationIdentity+"|particle|"+i),angle=(ps%360)*Math.PI/180,distance=76+(ps%118);
      const particle=document.createElement("span");particle.className="minglora-gift-fx-particle";
      particle.style.setProperty("--minglora-particle-x",Math.round(Math.cos(angle)*distance)+"px");
      particle.style.setProperty("--minglora-particle-y",Math.round(Math.sin(angle)*distance)+"px");
      particle.style.setProperty("--minglora-particle-size",(4+(ps%9))+"px");
      const particleColor="hsl("+((particleHue+i*19)%360)+" 96% 70%)";
      const motionEffect=String(gift.motion_effect||"sparkles");
      particle.style.setProperty("--minglora-particle-hue",String((particleHue+i*19)%360));
      if(motionEffect==="petals"){
        particle.style.borderRadius="62% 0 62% 62%";
        particle.style.width="calc(var(--minglora-particle-size,6px) * .72)";
        particle.style.height="calc(var(--minglora-particle-size,6px) * 1.5)";
      }else if(motionEffect==="waves"){
        particle.style.width="calc(var(--minglora-particle-size,6px) * 2.4)";
        particle.style.height="3px";
        particle.style.borderRadius="999px";
        particle.style.filter="drop-shadow(0 0 4px "+particleColor+")";
      }else if(motionEffect==="rings"||motionEffect==="orbits"){
        particle.style.background="transparent";
        particle.style.border="1.5px solid "+particleColor;
        particle.style.borderRadius="50%";
        particle.style.boxShadow="inset 0 0 7px "+particleColor;
      }else if(motionEffect==="bubbles"){
        particle.style.border="1px solid rgba(255,255,255,.72)";
        particle.style.background="radial-gradient(circle at 30% 25%,rgba(255,255,255,.95),"+particleColor+" 42%,transparent 78%)";
        particle.style.boxShadow="0 0 12px "+particleColor;
      }else if(motionEffect==="sparkles"){
        particle.style.borderRadius="0";
        particle.style.clipPath="polygon(50% 0,62% 36%,100% 50%,62% 64%,50% 100%,38% 64%,0 50%,38% 36%)";
      }
      particle.style.setProperty("--minglora-particle-duration",(720+(ps%1200))+"ms");
      particle.style.setProperty("--minglora-particle-delay",(i*65)+"ms");
      particle.style.setProperty("--minglora-particle-spin",((ps%2?1:-1)*(90+(ps%540)))+"deg");
      particles.append(particle);
    }
    outer.append(card,rays,particles);parent.append(outer);
    const motionElement=card.querySelector(".minglora-gift-fx-model");
    if(motionElement&&gift.motion_preset&&typeof motionElement.animate==="function"){
      const reduced=Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
      const semanticFrames=buildPreviewFrames(gift.motion_preset,{dx,dy,tilt,spin,peak,rebound});
      motionElement.animate(semanticFrames,{
        duration:reduced?320:Math.max(950,Math.min(4200,Number(gift.motion_duration_ms)||duration)),
        easing:"cubic-bezier(.17,.85,.3,1)",
        fill:"none"
      });
    }
    if(options.sound!==false)play(gift);
    setTimeout(()=>outer.remove(),duration+250);
    return outer;
  }
  function show(gift,options={}){return mount(document.body,gift,options);}
  function preview(gift){
    if(!gift)return false;
    gift=withCatalogMotion(gift);
    void play(gift,{review:true});
    const target=document.getElementById("minglora-gift-selected-model")||document.getElementById("minglora-gift-selected-image")||document.getElementById("live-gift-preview-model")||document.getElementById("live-gift-preview-image");
    if(target){
      const identity=String(gift.animation_key||gift.code||gift.name||"minglora-gift");
      const seed=hash([identity,gift.code,gift.name].join("|"));
      const dx=(seed%121)-60,dy=-24-((seed>>>7)%76),tilt=(seed>>>13)%81-40;
      const spin=((seed>>>19)%2?1:-1)*(70+((seed>>>20)%420));
      const peak=(108+((seed>>>3)%31))/100,rebound=(88+((seed>>>11)%19))/100;
      const preset=gift.motion_preset||gift.animation_preset||"gift-reveal";
      const frames=buildPreviewFrames(preset,{dx,dy,tilt,spin,peak,rebound});
      if(typeof target.animate==="function"){
        const reduced=Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
        target.animate(frames,{duration:reduced?320:Math.max(950,Math.min(4200,Number(gift.motion_duration_ms)||Number(gift.animation_duration_ms)||2200)),easing:"cubic-bezier(.17,.85,.3,1)",fill:"none"});
      }else{
        target.classList.remove("minglora-gift-preview-pulse");void target.offsetWidth;target.classList.add("minglora-gift-preview-pulse");
      }
    }
    return true;
  }
  void loadCatalogMotionIndex();
  window.MingloraGiftFX={prime,play,show,mount,preview,loadCatalogMotionIndex,withCatalogMotion};
})();