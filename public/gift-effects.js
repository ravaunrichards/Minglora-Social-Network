(() => {
  "use strict";
  let ctx=null;
  function audio(){
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C)return null;
    if(!ctx)ctx=new C();
    return ctx;
  }
  function hash(value){let h=2166136261;for(const ch of String(value||"")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  let soundMapPromise=null;
  const soundBuffers=new Map();
  const activeSources=new Set();
  const activeElements=new Set();
  const SOUND_MAP_URL="/assets/Gift%20Sounds/gift-code-map.json";
  const SOUND_BASE_PATH="/assets/Gift Sounds/";
  const MAX_ACTIVE_GIFT_SOUNDS=4;
  function slugify(value){
    return String(value||"").toLowerCase().normalize("NFKD")
      .replace(/[\u0300-\u036f]/g,"").replace(/&/g," and ")
      .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  }
  function safeSoundUrl(value){
    try{
      const url=new URL(String(value||""),window.location.href);
      const path=decodeURIComponent(url.pathname);
      if(url.origin!==window.location.origin||!path.startsWith(SOUND_BASE_PATH)||!path.endsWith("/sound.mp3"))return "";
      return url.href;
    }catch{return "";}
  }
  async function soundMap(){
    if(!soundMapPromise){
      soundMapPromise=fetch(SOUND_MAP_URL,{credentials:"same-origin",cache:"force-cache"})
        .then(response=>{
          if(!response.ok)throw new Error("Gift sound map unavailable.");
          return response.json();
        })
        .then(value=>{
          const byCode=value&&value.gifts_by_code&&typeof value.gifts_by_code==="object"?value.gifts_by_code:{};
          const bySlug=new Map();
          for(const entry of Object.values(byCode)){
            if(entry&&entry.slug)bySlug.set(String(entry.slug),entry);
          }
          return {byCode,bySlug};
        })
        .catch(error=>{soundMapPromise=null;throw error;});
    }
    return soundMapPromise;
  }
  function prime(){
    try{
      const c=audio();
      if(c?.state==="suspended")void c.resume();
      void soundMap().catch(()=>null);
      return Boolean(c);
    }catch{return false;}
  }
  async function resolveGiftSound(gift){
    if(!gift||typeof gift!=="object")return null;
    const direct=safeSoundUrl(gift.sound_url||gift.soundUrl||gift.audioUrl||"");
    if(direct)return {url:direct,volume:Number(gift.sound_volume)||.68,slug:slugify(gift.name||gift.giftName)};
    try{
      const map=await soundMap();
      const code=String(gift.code||gift.giftCode||gift.gift_code||"").trim();
      let entry=code?map.byCode[code]:null;
      const nameSlug=slugify(gift.name||gift.giftName||gift.gift_name||"");
      if(!entry&&nameSlug)entry=map.bySlug.get(nameSlug)||null;
      if(!entry)return null;
      const url=safeSoundUrl(entry.audioUrl);
      return url?{url,volume:Number(entry.volume)||.68,slug:entry.slug,sourceId:entry.sourceId}:null;
    }catch{return null;}
  }
  async function loadSoundBuffer(url,c){
    if(soundBuffers.has(url))return soundBuffers.get(url);
    const pending=fetch(url,{credentials:"same-origin",cache:"force-cache"})
      .then(response=>{
        if(!response.ok)throw new Error("Gift sound file unavailable.");
        return response.arrayBuffer();
      })
      .then(bytes=>c.decodeAudioData(bytes.slice(0)));
    soundBuffers.set(url,pending);
    try{return await pending;}
    catch(error){soundBuffers.delete(url);throw error;}
  }
  function rememberSource(source){
    activeSources.add(source);
    while(activeSources.size>MAX_ACTIVE_GIFT_SOUNDS){
      const oldest=activeSources.values().next().value;
      try{oldest.stop();}catch{}
      activeSources.delete(oldest);
    }
    source.addEventListener?.("ended",()=>activeSources.delete(source),{once:true});
  }
  function rememberElement(element){
    activeElements.add(element);
    while(activeElements.size>MAX_ACTIVE_GIFT_SOUNDS){
      const oldest=activeElements.values().next().value;
      oldest.pause();
      oldest.currentTime=0;
      activeElements.delete(oldest);
    }
    element.addEventListener("ended",()=>activeElements.delete(element),{once:true});
  }
  async function play(gift,options={}){
    const entry=await resolveGiftSound(gift);
    if(!entry)return false;
    const volume=Math.max(0,Math.min(1,Number(options.volume??entry.volume)||.68));
    const durationLimit=Math.max(.35,Math.min(6,Number(options.durationSeconds)||4.5));
    const identity=String(gift.code||gift.giftCode||gift.name||entry.slug||"gift");
    const panValue=Number.isFinite(Number(options.pan))?Math.max(-1,Math.min(1,Number(options.pan))):((hash(identity)%31)-15)/100;
    const c=audio();
    if(!c){
      try{
        const element=new Audio(entry.url);
        element.preload="auto";
        element.volume=volume;
        element.currentTime=0;
        rememberElement(element);
        await element.play();
        return true;
      }catch{return false;}
    }
    try{
      if(c.state==="suspended")await c.resume();
      const buffer=await loadSoundBuffer(entry.url,c);
      const source=c.createBufferSource();
      const gain=c.createGain();
      const panner=c.createStereoPanner?.();
      const now=c.currentTime;
      const duration=Math.min(buffer.duration,durationLimit);
      if(!Number.isFinite(duration)||duration<=.05)return false;
      source.buffer=buffer;
      gain.gain.setValueAtTime(.0001,now);
      gain.gain.linearRampToValueAtTime(volume,now+.035);
      gain.gain.setValueAtTime(volume,Math.max(now+.04,now+duration-.16));
      gain.gain.linearRampToValueAtTime(.0001,now+duration);
      source.connect(gain);
      if(panner){
        panner.pan.setValueAtTime(panValue,now);
        gain.connect(panner);
        panner.connect(c.destination);
      }else gain.connect(c.destination);
      rememberSource(source);
      source.start(now,0,duration);
      return true;
    }catch{return false;}
  }
  const presets=new Set(["petal-bloom","heart-pulse","creature-entrance","grand-entry","soundwave-ripple","power-impact","delight-pop","glam-spin","royal-shimmer","celebration-burst","cosmic-orbit","nature-rise","horizon-sweep","pixel-burst","warm-wave","spark-float","gift-reveal"]);
  function mount(parent,gift,options={}){
    if(!parent||!gift)return null;
    const duration=Math.max(900,Math.min(8000,Number(options.duration)||Number(gift.animation_duration_ms)||2600));
    const requestedPreset=gift.animation_preset||"gift-reveal";
    const preset=presets.has(requestedPreset)?requestedPreset:"gift-reveal";
    const animationIdentity=String(gift.animation_key||gift.code||gift.name||"minglora-gift");
    const motionSeed=hash([animationIdentity,gift.code,gift.name].join("|"));
    const dx=(motionSeed%81)-40,dy=-18-((motionSeed>>>7)%65),tilt=(motionSeed>>>13)%71-35;
    const spin=((motionSeed>>>19)%2?1:-1)*(50+((motionSeed>>>20)%311));
    const peak=(104+((motionSeed>>>3)%27))/100,rebound=(90+((motionSeed>>>11)%15))/100;
    const outer=document.createElement("div");
    outer.className="minglora-gift-fx minglora-fx-"+preset;
    outer.dataset.giftAnimation=animationIdentity;
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
      model.setAttribute("auto-rotate","");model.setAttribute("rotation-per-second",rotationSpeed+"deg");model.setAttribute("interaction-prompt","none");model.setAttribute("shadow-intensity",".8");model.setAttribute("exposure","1.18");card.append(model);
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
      particle.style.setProperty("--minglora-particle-hue",String((motionSeed+i*47)%360));
      particle.style.setProperty("--minglora-particle-duration",(720+(ps%1200))+"ms");
      particle.style.setProperty("--minglora-particle-delay",(i*65)+"ms");
      particle.style.setProperty("--minglora-particle-spin",((ps%2?1:-1)*(90+(ps%540)))+"deg");
      particles.append(particle);
    }
    outer.append(card,rays,particles);parent.append(outer);
    if(options.sound!==false)void play(gift,options.soundOptions||{});
    setTimeout(()=>outer.remove(),duration+250);
    return outer;
  }
  function show(gift,options={}){return mount(document.body,gift,options);}
  function preview(gift){
    if(!gift)return false;
    void play(gift);
    const target=document.getElementById("minglora-gift-selected-model")||document.getElementById("minglora-gift-selected-image")||document.getElementById("live-gift-preview-model")||document.getElementById("live-gift-preview-image");
    if(target){
      const identity=String(gift.animation_key||gift.code||gift.name||"minglora-gift");
      const seed=hash([identity,gift.code,gift.name].join("|"));
      const dx=(seed%121)-60,dy=-24-((seed>>>7)%76),tilt=(seed>>>13)%81-40;
      const spin=((seed>>>19)%2?1:-1)*(70+((seed>>>20)%420));
      const peak=(108+((seed>>>3)%31))/100,rebound=(88+((seed>>>11)%19))/100;
      const frames=[
        {offset:0,opacity:0,transform:"translate3d(0,22px,0) rotateZ("+(-tilt*.6)+"deg) scale(.68)",filter:"brightness(.78) saturate(.8)"},
        {offset:.2,opacity:1,transform:"translate3d("+dx+"px,"+dy+"px,0) rotateZ("+tilt+"deg) scale("+peak+")",filter:"brightness(1.3) saturate(1.35)"},
        {offset:.52,opacity:1,transform:"translate3d("+(-dx*.62)+"px,"+(-dy*.16)+"px,0) rotateZ("+spin+"deg) scale("+rebound+")",filter:"brightness(1.12) saturate(1.12)"},
        {offset:.76,opacity:1,transform:"translate3d("+(dx*.18)+"px,"+(dy*.08)+"px,0) rotateZ("+(-tilt*.25)+"deg) scale(1.035)",filter:"brightness(1.05) saturate(1.05)"},
        {offset:1,opacity:1,transform:"translate3d(0,0,0) rotateZ(0deg) scale(1)",filter:"none"}
      ];
      if(typeof target.animate==="function"){
        const reduced=Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
        target.animate(frames,{duration:reduced?320:Math.max(950,Math.min(4200,Number(gift.animation_duration_ms)||2200)),easing:"cubic-bezier(.17,.85,.3,1)",fill:"none"});
      }else{
        target.classList.remove("minglora-gift-preview-pulse");void target.offsetWidth;target.classList.add("minglora-gift-preview-pulse");
      }
    }
    return true;
  }
  window.MingloraGiftFX={prime,play,show,mount,preview};
})();