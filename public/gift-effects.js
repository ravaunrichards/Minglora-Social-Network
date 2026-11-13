(() => {
  "use strict";
  let ctx=null;
  function audio(){
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C)return null;
    if(!ctx)ctx=new C();
    return ctx;
  }
  function prime(){void loadCatalogMotionIndex();try{const c=audio();if(c?.state==="suspended")void c.resume();return Boolean(c);}catch{return false;}}
  function hash(value){let h=2166136261;for(const ch of String(value||"")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  let catalogMotionIndex=null;
  let catalogMotionLoadPromise=null;
  let motionPresetAssets=new Map();
  let motionPresetLoadPromise=null;
  const perGiftMotionAssets=new Map();
  async function loadMotionPresetAssets(){
    if(motionPresetAssets.size)return motionPresetAssets.size;
    if(motionPresetLoadPromise)return motionPresetLoadPromise;
    motionPresetLoadPromise=(async()=>{
      try{
        const response=await fetch("/assets/animations/gifts/preset-index.json",{credentials:"same-origin",cache:"force-cache"});
        if(!response.ok)throw new Error("Gift animation preset index unavailable.");
        const index=await response.json();
        const entries=Array.isArray(index?.presets)?index.presets:[];
        const results=await Promise.allSettled(entries.map(async entry=>{
          const id=String(entry?.id||"");
          if(!/^[a-z0-9-]{2,48}$/.test(id))return null;
          const expected="/assets/animations/gifts/presets/"+id+".json";
          if(entry.url!==expected)return null;
          const assetResponse=await fetch(expected,{credentials:"same-origin",cache:"force-cache"});
          if(!assetResponse.ok)return null;
          const asset=await assetResponse.json();
          if(asset?.id!==id||!Array.isArray(asset.keyframes)||asset.keyframes.length<3)return null;
          if(!asset.keyframes.every(frame=>Number.isFinite(frame.offset)&&Number.isFinite(frame.opacity)&&typeof frame.transform==="string"))return null;
          return [id,asset];
        }));
        const loaded=new Map();
        for(const result of results)if(result.status==="fulfilled"&&result.value)loaded.set(result.value[0],result.value[1]);
        motionPresetAssets=loaded;
        return loaded.size;
      }catch(error){
        motionPresetLoadPromise=null;
        return motionPresetAssets.size;
      }
    })();
    return motionPresetLoadPromise;
  }
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
        await loadMotionPresetAssets();
        const response=await fetch("/assets/animations/gifts/catalog-motion-index.json",{credentials:"same-origin",cache:"force-cache"});
        if(!response.ok)throw new Error("Gift motion index is not available yet.");
        const payload=await response.json();
        const records=Array.isArray(payload?.gifts)?payload.gifts:[];
        const next=new Map();
        for(const item of records){
          const code=String(item?.code||"");
          if(!code||item.active!==true||typeof item.motion_preset!=="string")continue;
          if(typeof item.image_url!=="string"||typeof item.model_url!=="string")continue;
          const expectedMotionUrl="/assets/animations/gifts/per-gift/"+code+".json";
          if(item.motion_asset_url!==expectedMotionUrl)item.motion_asset_url=null;
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
    return profile?{...gift,motion_preset:profile.motion_preset,motion_effect:profile.motion_effect,motion_duration_ms:profile.motion_duration_ms,motion_asset_url:profile.motion_asset_url}:gift;
  }
  async function loadPerGiftMotionAsset(gift){
    const code=String(gift?.code||"");
    if(!/^[a-z0-9_-]{1,59}$/.test(code))return null;
    const expected="/assets/animations/gifts/per-gift/"+code+".json";
    if(gift.motion_asset_url!==expected)return null;
    if(perGiftMotionAssets.has(code))return perGiftMotionAssets.get(code);
    const pending=(async()=>{
      try{
        const response=await fetch(expected,{credentials:"same-origin",cache:"force-cache"});
        if(!response.ok)return null;
        const asset=await response.json();
        if(asset?.schema_version!==1||asset?.generator!=="Minglora LIVE per-gift motion generator"||asset.code!==code)return null;
        if(asset.animation_key!==gift.animation_key||!Array.isArray(asset.keyframes)||asset.keyframes.length<3)return null;
        let prior=-1;
        for(const frame of asset.keyframes){
          if(!Number.isFinite(frame.offset)||frame.offset<=prior||frame.offset<0||frame.offset>1)return null;
          if(!Number.isFinite(frame.opacity)||frame.opacity<0||frame.opacity>1)return null;
          if(typeof frame.transform!=="string"||frame.transform.length>360||/url\s*\(/i.test(frame.transform))return null;
          if(typeof frame.filter!=="string"||frame.filter.length>120||/url\s*\(/i.test(frame.filter))return null;
          prior=frame.offset;
        }
        if(asset.keyframes[0].offset!==0||asset.keyframes.at(-1).offset!==1)return null;
        return asset;
      }catch{return null;}
    })();
    perGiftMotionAssets.set(code,pending);
    const asset=await pending;
    if(!asset)perGiftMotionAssets.delete(code);
    return asset;
  }
  function animateGiftSubject(element,gift,values,duration){
    if(!element||typeof element.animate!=="function")return;
    const reduced=Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    void loadPerGiftMotionAsset(gift).then(asset=>{
      if(!element.isConnected)return;
      const frames=asset?.keyframes||buildPreviewFrames(gift.motion_preset||gift.animation_preset||"gift-reveal",values);
      try{
        element.animate(frames,{
          duration:reduced?320:Math.max(950,Math.min(4200,Number(asset?.duration_ms)||Number(gift.motion_duration_ms)||duration||2200)),
          easing:"cubic-bezier(.17,.85,.3,1)",
          fill:"none"
        });
      }catch{}
    });
  }
  function effectHue(effect,seed){
    const base={petals:334,waves:198,rings:46,trail:194,orbits:270,bubbles:178,sparkles:45};
    return ((base[effect]??(seed%360))+(seed%17))%360;
  }
  function buildPreviewFrames(preset,v){
    const {dx,dy,tilt,spin,peak,rebound}=v;
    const externalPreset=motionPresetAssets.get(String(preset||""));
    if(externalPreset&&Array.isArray(externalPreset.keyframes)){
      return externalPreset.keyframes.map(frame=>({offset:frame.offset,opacity:frame.opacity,transform:frame.transform,filter:frame.filter||"none"}));
    }
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
  const profiles={
    flowers:{wave:"sine",notes:[0,7,12,19],base:610,length:.18,pan:.15},
    hearts:{wave:"sine",notes:[0,4,7,12],base:520,length:.2,pan:0},
    animals:{wave:"triangle",notes:[0,3,7,10],base:370,length:.14,pan:-.1},
    vehicles:{wave:"sawtooth",notes:[0,7,12,19],base:260,length:.12,pan:0},
    music:{wave:"triangle",notes:[0,5,7,12,16],base:480,length:.17,pan:.1},
    sports:{wave:"square",notes:[0,7,12],base:310,length:.1,pan:0},
    food_drink:{wave:"sine",notes:[0,3,7,10],base:570,length:.15,pan:-.05},
    fashion_beauty:{wave:"sine",notes:[0,7,12,16],base:690,length:.19,pan:.15},
    luxury:{wave:"sine",notes:[0,4,7,11,16],base:760,length:.22,pan:0},
    celebrations:{wave:"triangle",notes:[0,4,7,12,16],base:540,length:.13,pan:0},
    fantasy:{wave:"sine",notes:[0,7,12,19,24],base:450,length:.24,pan:0},
    nature:{wave:"sine",notes:[0,5,9,12],base:430,length:.22,pan:-.15},
    travel:{wave:"triangle",notes:[0,5,7,12],base:420,length:.16,pan:.1},
    games:{wave:"square",notes:[0,12,19,24],base:340,length:.08,pan:0},
    community:{wave:"triangle",notes:[0,4,7,12],base:490,length:.17,pan:0},
    symbols:{wave:"sine",notes:[0,7,12],base:580,length:.16,pan:0},
    everyday:{wave:"sine",notes:[0,3,7],base:530,length:.21,pan:-.08},
    reactions:{wave:"square",notes:[0,12,19],base:680,length:.07,pan:.04},
    seasonal:{wave:"sine",notes:[0,7,12,16],base:720,length:.2,pan:.12},
    jamaican_culture:{wave:"triangle",notes:[0,3,7,10,12],base:390,length:.13,pan:0},
    other:{wave:"triangle",notes:[0,5,12],base:460,length:.15,pan:0}
  };
  function play(gift){
    if(!gift)return false;
    const c=audio();if(!c)return false;
    try{
      if(c.state==="suspended")void c.resume();
      const p=profiles[gift.category]||profiles.other,seed=hash([gift.sound_preset,gift.code,gift.name].join("|")),variation=(seed%9)-4,now=c.currentTime;
      const base=p.base*(.92+(seed%17)/100);
      p.notes.forEach((step,i)=>{
        const osc=c.createOscillator(),gain=c.createGain(),pan=c.createStereoPanner?.();
        const start=now+i*p.length*.78,duration=p.length*(i===p.notes.length-1?1.35:1);
        osc.type=p.wave;osc.frequency.setValueAtTime(base*Math.pow(2,(step+variation*.12)/12),start);
        gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.12/(1+i*.12),start+.018);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
        if(pan){pan.pan.setValueAtTime(Math.max(-.8,Math.min(.8,p.pan+(i%2?.12:-.12))),start);osc.connect(gain);gain.connect(pan);pan.connect(c.destination);}
        else{osc.connect(gain);gain.connect(c.destination);}
        osc.start(start);osc.stop(start+duration+.03);
      });
      return true;
    }catch{return false;}
  }
  const presets=new Set(["petal-bloom","heart-pulse","creature-entrance","grand-entry","soundwave-ripple","power-impact","delight-pop","glam-spin","royal-shimmer","celebration-burst","cosmic-orbit","nature-rise","horizon-sweep","pixel-burst","warm-wave","spark-float","gift-reveal"]);
  function hasCanonicalGiftArtwork(gift){
    const code=String(gift?.code||"");
    return /^[a-z0-9_-]{1,59}$/.test(code)&&gift.image_url==="/assets/gifts/catalog/"+code+".svg";
  }
  function mount(parent,gift,options={}){
    if(!parent||!gift||!hasCanonicalGiftArtwork(gift))return null;
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
    const code=String(gift.code||"");
    const canonicalModelUrl="/assets/gifts/catalog/"+code+".gltf";
    if(gift.model_url===canonicalModelUrl){
      const model=document.createElement("model-viewer");model.className="minglora-gift-fx-model";model.src=canonicalModelUrl;model.alt=gift.name+" original Minglora gift";
      const fallbackImage=document.createElement("img");
      fallbackImage.className="minglora-gift-fx-model";
      fallbackImage.src=gift.image_url;
      fallbackImage.alt=gift.name+" complete original Minglora artwork";
      fallbackImage.hidden=true;
      let modelFailed=false,fallbackFailed=false;
      model.addEventListener("error",()=>{
        modelFailed=true;
        model.hidden=true;
        if(fallbackImage.complete&&fallbackImage.naturalWidth>0)fallbackImage.hidden=false;
        else if(fallbackFailed||fallbackImage.complete)outer.remove();
      },{once:true});
      fallbackImage.addEventListener("load",()=>{
        if(modelFailed)fallbackImage.hidden=false;
      },{once:true});
      fallbackImage.addEventListener("error",()=>{
        fallbackFailed=true;
        if(modelFailed)outer.remove();
      },{once:true});
      const reducedMotion=Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);if(!reducedMotion){model.setAttribute("auto-rotate","");model.setAttribute("autoplay","");}model.setAttribute("rotation-per-second",rotationSpeed+"deg");model.setAttribute("interaction-prompt","none");model.setAttribute("shadow-intensity",".8");model.setAttribute("exposure","1.18");card.append(model,fallbackImage);
    }else{
      const img=document.createElement("img");img.className="minglora-gift-fx-model";img.src=gift.image_url;img.alt=gift.name+" complete original Minglora artwork";
      img.addEventListener("error",()=>outer.remove(),{once:true});
      card.append(img);
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
    if(motionElement&&gift.motion_preset){
      animateGiftSubject(motionElement,gift,{dx,dy,tilt,spin,peak,rebound},duration);
    }
    if(options.sound!==false)play(gift);
    setTimeout(()=>outer.remove(),duration+250);
    return outer;
  }
  function show(gift,options={}){return mount(document.body,gift,options);}
  function preview(gift){
    if(!gift||!hasCanonicalGiftArtwork(gift))return false;
    gift=withCatalogMotion(gift);
    play(gift);
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
        animateGiftSubject(target,gift,{dx,dy,tilt,spin,peak,rebound},Number(gift.animation_duration_ms)||2200);
      }else{
        target.classList.remove("minglora-gift-preview-pulse");void target.offsetWidth;target.classList.add("minglora-gift-preview-pulse");
      }
    }
    return true;
  }
  void loadCatalogMotionIndex();
  window.MingloraGiftFX={prime,play,show,mount,preview,loadCatalogMotionIndex,loadPerGiftMotionAsset,withCatalogMotion};
})();