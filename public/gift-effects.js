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
    if(preset==="rose-unfurl")return [
      {offset:0,opacity:0,transform:"translate3d(0,24px,0) rotateZ(-15deg) scale(.68)",filter:"brightness(.74) saturate(.76)"},
      {offset:.2,opacity:1,transform:"translate3d(0,-9px,0) rotateZ(7deg) scale(1.12)",filter:"brightness(1.34) saturate(1.28)"},
      {offset:.4,opacity:1,transform:"translate3d(0,2px,0) rotateZ(-4deg) scale(.96)",filter:"brightness(1.16) saturate(1.12)"},
      {offset:.63,opacity:1,transform:"translate3d(0,-4px,0) rotateZ(2.5deg) scale(1.055)",filter:"brightness(1.2)"},
      {offset:.84,opacity:1,transform:"translate3d(0,-1px,0) rotateZ(-.7deg) scale(1.012)",filter:"brightness(1.08)"},
      neutral
    ];
    if(preset==="djembe-strike")return [
      {offset:0,opacity:0,transform:"translate3d(0,15px,0) rotateZ(-5deg) scale(.84)",filter:"brightness(.78)"},
      {offset:.16,opacity:1,transform:"translate3d(0,-5px,0) rotateZ(4deg) scale(1.14)",filter:"brightness(1.42) saturate(1.24)"},
      {offset:.34,opacity:1,transform:"translate3d(0,3px,0) rotateZ(-2deg) scale(.94)",filter:"brightness(1.12)"},
      {offset:.58,opacity:1,transform:"translate3d(0,-2px,0) rotateZ(1deg) scale(1.035)",filter:"none"},
      neutral
    ];
    if(preset==="island-tide")return [
      {offset:0,opacity:0,transform:"translate3d(0,20px,0) rotateZ(-3deg) scale(.84)",filter:"brightness(.82) saturate(.86)"},
      {offset:.2,opacity:1,transform:"translate3d(-6px,-8px,0) rotateZ(2.3deg) scale(1.08)",filter:"brightness(1.24) saturate(1.14)"},
      {offset:.42,opacity:1,transform:"translate3d(5px,-2px,0) rotateZ(-2deg) scale(1.025)",filter:"brightness(1.1)"},
      {offset:.64,opacity:1,transform:"translate3d(-4px,2px,0) rotateZ(1.4deg) scale(1.045)",filter:"none"},
      {offset:.84,opacity:1,transform:"translate3d(2px,0,0) rotateZ(-.7deg) scale(1.015)",filter:"none"},
      neutral
    ];
    if(preset==="crocodile-snap")return [
      {offset:0,opacity:0,transform:"translate3d(-9px,18px,0) rotateZ(-5deg) scale(.88)",filter:"brightness(.78) saturate(.86)"},
      {offset:.22,opacity:1,transform:"translate3d(10px,-3px,0) rotateZ(3deg) scale(1.1)",filter:"brightness(1.25) saturate(1.18)"},
      {offset:.34,opacity:1,transform:"translate3d(19px,2px,0) rotateZ(-2deg) scale(1.13)",filter:"brightness(1.38) saturate(1.28)"},
      {offset:.48,opacity:1,transform:"translate3d(-8px,5px,0) rotateZ(2deg) scale(.98)",filter:"brightness(1.12)"},
      {offset:.7,opacity:1,transform:"translate3d(4px,-2px,0) rotateZ(-1deg) scale(1.04)",filter:"none"},
      {offset:.86,opacity:1,transform:"translate3d(0,1px,0) rotateZ(0deg) scale(1.01)",filter:"none"},
      neutral
    ];
    if(preset==="parrot-swoop")return [
      {offset:0,opacity:0,transform:"translate3d(-30px,20px,0) rotateZ(-13deg) scale(.78)",filter:"brightness(.8) saturate(.84)"},
      {offset:.18,opacity:1,transform:"translate3d(-8px,-12px,0) rotateZ(8deg) scale(1.12)",filter:"brightness(1.28) saturate(1.24)"},
      {offset:.39,opacity:1,transform:"translate3d(15px,-8px,0) rotateZ(-5deg) scale(1.08)",filter:"brightness(1.22) saturate(1.2)"},
      {offset:.58,opacity:1,transform:"translate3d(5px,4px,0) rotateZ(3deg) scale(1.03)",filter:"brightness(1.12)"},
      {offset:.78,opacity:1,transform:"translate3d(-3px,-2px,0) rotateZ(-1.5deg) scale(1.025)",filter:"none"},
      neutral
    ];
    if(preset==="dolphin-leap")return [
      {offset:0,opacity:0,transform:"translate3d(-12px,22px,0) rotateZ(-7deg) scale(.82)",filter:"brightness(.82) saturate(.88)"},
      {offset:.18,opacity:1,transform:"translate3d(3px,-12px,0) rotateZ(4deg) scale(1.1)",filter:"brightness(1.24) saturate(1.2)"},
      {offset:.39,opacity:1,transform:"translate3d(12px,-18px,0) rotateZ(8deg) scale(1.08)",filter:"brightness(1.3) saturate(1.24)"},
      {offset:.62,opacity:1,transform:"translate3d(-8px,-5px,0) rotateZ(-5deg) scale(1.02)",filter:"brightness(1.14)"},
      {offset:.82,opacity:1,transform:"translate3d(3px,3px,0) rotateZ(2deg) scale(1.015)",filter:"none"},
      neutral
    ];
    if(preset==="maraca-rhythm")return [
      {offset:0,opacity:0,transform:"translate3d(0,18px,0) rotateZ(-7deg) scale(.82)",filter:"brightness(.82)"},
      {offset:.16,opacity:1,transform:"translate3d(-6px,-3px,0) rotateZ(8deg) scale(1.08)",filter:"brightness(1.25) saturate(1.2)"},
      {offset:.3,opacity:1,transform:"translate3d(7px,2px,0) rotateZ(-9deg) scale(1.04)",filter:"brightness(1.12)"},
      {offset:.46,opacity:1,transform:"translate3d(-5px,-2px,0) rotateZ(7deg) scale(1.06)",filter:"brightness(1.2)"},
      {offset:.62,opacity:1,transform:"translate3d(5px,2px,0) rotateZ(-7deg) scale(1.03)",filter:"brightness(1.14)"},
      {offset:.8,opacity:1,transform:"translate3d(-2px,0,0) rotateZ(2deg) scale(1.02)",filter:"brightness(1.08)"},
      neutral
    ];
    if(preset==="phoenix-rise")return [
      {offset:0,opacity:0,transform:"translate3d(0,32px,0) rotateZ(-10deg) scale(.68)",filter:"brightness(.62) saturate(.72)"},
      {offset:.18,opacity:1,transform:"translate3d(0,-13px,0) rotateZ(5deg) scale(1.16)",filter:"brightness(1.62) saturate(1.55)"},
      {offset:.38,opacity:1,transform:"translate3d(0,3px,0) rotateZ(-3deg) scale(.94)",filter:"brightness(1.32) saturate(1.3)"},
      {offset:.6,opacity:1,transform:"translate3d(0,-8px,0) rotateZ(2deg) scale(1.08)",filter:"brightness(1.22)"},
      {offset:.82,opacity:1,transform:"translate3d(0,-2px,0) rotateZ(-1deg) scale(1.02)",filter:"brightness(1.12)"},
      neutral
    ];
    if(preset==="crown-lustre")return [
      {offset:0,opacity:0,transform:"translate3d(0,18px,0) rotateZ(-8deg) scale(.78)",filter:"brightness(.72) saturate(.72)"},
      {offset:.22,opacity:1,transform:"translate3d(0,-8px,0) rotateZ(4deg) scale(1.12)",filter:"brightness(1.48) saturate(1.34)"},
      {offset:.44,opacity:1,transform:"translate3d(0,2px,0) rotateZ(-2.5deg) scale(.96)",filter:"brightness(1.2) saturate(1.16)"},
      {offset:.68,opacity:1,transform:"translate3d(0,-3px,0) rotateZ(1.6deg) scale(1.04)",filter:"brightness(1.28) saturate(1.2)"},
      {offset:.86,opacity:1,transform:"translate3d(0,0,0) rotateZ(0deg) scale(1)",filter:"brightness(1.08)"},
      neutral
    ];
    if(preset==="lion-scepter-rise")return [
      {offset:0,opacity:0,transform:"translate3d(0,28px,0) rotateZ(-7deg) scale(.76)",filter:"brightness(.68) saturate(.72)"},
      {offset:.2,opacity:1,transform:"translate3d(0,-12px,0) rotateZ(4deg) scale(1.14)",filter:"brightness(1.46) saturate(1.3)"},
      {offset:.38,opacity:1,transform:"translate3d(0,3px,0) rotateZ(-2.5deg) scale(.95)",filter:"brightness(1.2) saturate(1.12)"},
      {offset:.62,opacity:1,transform:"translate3d(0,-5px,0) rotateZ(1.6deg) scale(1.055)",filter:"brightness(1.28)"},
      {offset:.82,opacity:1,transform:"translate3d(0,-1px,0) rotateZ(-.7deg) scale(1.015)",filter:"brightness(1.1)"},
      neutral
    ];
    if(preset==="palm-canopy-sway")return [
      {offset:0,opacity:0,transform:"translate3d(0,18px,0) rotateZ(-4deg) scale(.86)",filter:"brightness(.86)"},
      {offset:.24,opacity:1,transform:"translate3d(-5px,-4px,0) rotateZ(2.8deg) scale(1.045)",filter:"brightness(1.16)"},
      {offset:.49,opacity:1,transform:"translate3d(5px,-1px,0) rotateZ(-3.2deg) scale(1.015)",filter:"none"},
      {offset:.74,opacity:1,transform:"translate3d(-2px,1px,0) rotateZ(1.8deg) scale(1.025)",filter:"none"},
      neutral
    ];
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
    if(preset==="gamer-otter-cheer")return [
      {offset:0,opacity:0,transform:"translate3d(0,26px,0) rotateZ(-12deg) scale(.72)",filter:"brightness(.78) saturate(.8)"},
      {offset:.26,opacity:1,transform:"translate3d(0,-9px,0) rotateZ(7deg) scale(1.13)",filter:"brightness(1.32) saturate(1.35)"},
      {offset:.46,opacity:1,transform:"translate3d(0,2px,0) rotateZ(-5deg) scale(.98)",filter:"brightness(1.12)"},
      {offset:.66,opacity:1,transform:"translate3d(0,-4px,0) rotateZ(4deg) scale(1.045)",filter:"brightness(1.16) saturate(1.1)"},
      {offset:.82,opacity:1,transform:"translate3d(0,0,0) rotateZ(0deg) scale(1)",filter:"none"},
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
  function createGiftNoise(c,seed,durationSeconds){
    const frameCount=Math.max(1,Math.floor(c.sampleRate*durationSeconds));
    const buffer=c.createBuffer(1,frameCount,c.sampleRate),data=buffer.getChannelData(0);
    let state=seed>>>0;
    for(let i=0;i<frameCount;i++){
      state=(Math.imul(state,1664525)+1013904223)>>>0;
      const random=(state/4294967296)*2-1;
      const fade=Math.pow(Math.max(0,1-i/frameCount),2.2);
      data[i]=random*fade;
    }
    return buffer;
  }
  function playDjembe(c,now,seed){
    const noise=c.createBufferSource(),filter=c.createBiquadFilter(),envelope=c.createGain();
    noise.buffer=createGiftNoise(c,seed,0.23);
    filter.type="lowpass";filter.frequency.setValueAtTime(1450,now);filter.Q.setValueAtTime(.72,now);
    envelope.gain.setValueAtTime(.0001,now);envelope.gain.exponentialRampToValueAtTime(.23,now+.006);
    envelope.gain.exponentialRampToValueAtTime(.0001,now+.22);
    noise.connect(filter);filter.connect(envelope);envelope.connect(c.destination);
    noise.start(now);noise.stop(now+.24);
    const body=c.createOscillator(),bodyGain=c.createGain();
    body.type="sine";body.frequency.setValueAtTime(118,now);body.frequency.exponentialRampToValueAtTime(61,now+.17);
    bodyGain.gain.setValueAtTime(.0001,now);bodyGain.gain.exponentialRampToValueAtTime(.28,now+.008);
    bodyGain.gain.exponentialRampToValueAtTime(.0001,now+.21);
    body.connect(bodyGain);bodyGain.connect(c.destination);body.start(now);body.stop(now+.23);
    const rim=c.createOscillator(),rimGain=c.createGain();
    rim.type="triangle";rim.frequency.setValueAtTime(245+(seed%31),now+.018);
    rimGain.gain.setValueAtTime(.0001,now+.018);rimGain.gain.exponentialRampToValueAtTime(.045,now+.025);
    rimGain.gain.exponentialRampToValueAtTime(.0001,now+.12);
    rim.connect(rimGain);rimGain.connect(c.destination);rim.start(now+.018);rim.stop(now+.14);
    return true;
  }
  function playPalmBreeze(c,now,seed){
    const wind=c.createBufferSource(),highpass=c.createBiquadFilter(),lowpass=c.createBiquadFilter(),windGain=c.createGain();
    wind.buffer=createGiftNoise(c,seed,0.82);
    highpass.type="highpass";highpass.frequency.setValueAtTime(190,now);
    lowpass.type="lowpass";lowpass.frequency.setValueAtTime(720,now);lowpass.frequency.exponentialRampToValueAtTime(2050,now+.62);
    windGain.gain.setValueAtTime(.0001,now);windGain.gain.exponentialRampToValueAtTime(.052,now+.14);
    windGain.gain.exponentialRampToValueAtTime(.0001,now+.82);
    wind.connect(highpass);highpass.connect(lowpass);lowpass.connect(windGain);windGain.connect(c.destination);
    wind.start(now);wind.stop(now+.84);
    const notes=[659.25,880,1174.66],delays=[.1,.31,.53];
    notes.forEach((frequency,index)=>{
      const chime=c.createOscillator(),gain=c.createGain(),start=now+delays[index];
      chime.type="sine";chime.frequency.setValueAtTime(frequency*(1+((seed+index)%7-3)*.0015),start);
      gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.024/(index+1),start+.018);
      gain.gain.exponentialRampToValueAtTime(.0001,start+.56);
      chime.connect(gain);gain.connect(c.destination);chime.start(start);chime.stop(start+.58);
    });
    return true;
  }
  function playGamerOtter(c,now,seed){
    const notes=[523.25,659.25,783.99,1046.5],delays=[0,.085,.17,.29];
    notes.forEach((frequency,index)=>{
      const start=now+delays[index],osc=c.createOscillator(),gain=c.createGain(),pan=c.createStereoPanner?.();
      osc.type=index===3?"sine":"square";
      osc.frequency.setValueAtTime(frequency*(1+((seed+index*3)%9-4)*.0012),start);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(index===3 ? .052 : .034,start+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,start+(index===3?.27:.14));
      if(pan){pan.pan.setValueAtTime((index-1.5)*.16,start);osc.connect(gain);gain.connect(pan);pan.connect(c.destination);}
      else{osc.connect(gain);gain.connect(c.destination);}
      osc.start(start);osc.stop(start+(index===3?.29:.16));
    });
    const thump=c.createOscillator(),thumpGain=c.createGain();
    thump.type="sine";thump.frequency.setValueAtTime(132,now);thump.frequency.exponentialRampToValueAtTime(74,now+.12);
    thumpGain.gain.setValueAtTime(.0001,now);thumpGain.gain.exponentialRampToValueAtTime(.09,now+.009);thumpGain.gain.exponentialRampToValueAtTime(.0001,now+.15);
    thump.connect(thumpGain);thumpGain.connect(c.destination);thump.start(now);thump.stop(now+.16);
    return true;
  }
  function playLiveIsland(c,now,seed){
    const surf=c.createBufferSource(),highpass=c.createBiquadFilter(),lowpass=c.createBiquadFilter(),envelope=c.createGain();
    surf.buffer=createGiftNoise(c,seed,1.08);
    highpass.type="highpass";highpass.frequency.setValueAtTime(105,now);
    lowpass.type="lowpass";lowpass.frequency.setValueAtTime(420,now);lowpass.frequency.exponentialRampToValueAtTime(1650,now+.42);lowpass.frequency.exponentialRampToValueAtTime(610,now+.98);
    envelope.gain.setValueAtTime(.0001,now);envelope.gain.exponentialRampToValueAtTime(.065,now+.22);envelope.gain.exponentialRampToValueAtTime(.0001,now+1.08);
    surf.connect(highpass);highpass.connect(lowpass);lowpass.connect(envelope);envelope.connect(c.destination);
    surf.start(now);surf.stop(now+1.1);
    const notes=[392,493.88,587.33,783.99],delays=[.12,.34,.58,.78];
    notes.forEach((frequency,index)=>{
      const start=now+delays[index],tone=c.createOscillator(),gain=c.createGain(),pan=c.createStereoPanner?.();
      tone.type="sine";tone.frequency.setValueAtTime(frequency*(1+((seed+index*5)%9-4)*.0008),start);
      gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.027/(1+index*.18),start+.028);
      gain.gain.exponentialRampToValueAtTime(.0001,start+.52);
      if(pan){pan.pan.setValueAtTime((index-1.5)*.18,start);tone.connect(gain);gain.connect(pan);pan.connect(c.destination);}
      else{tone.connect(gain);gain.connect(c.destination);}
      tone.start(start);tone.stop(start+.55);
    });
    return true;
  }
  function playCrystalCrown(c,now,seed){
    const notes=[523.25,659.25,783.99,1046.5,1318.51],delays=[0,.12,.25,.4,.58];
    notes.forEach((frequency,index)=>{
      const start=now+delays[index],tone=c.createOscillator(),gain=c.createGain(),pan=c.createStereoPanner?.();
      tone.type=index===4?"triangle":"sine";
      tone.frequency.setValueAtTime(frequency*(1+((seed+index*7)%11-5)*.0007),start);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(.026/(1+index*.22),start+.026);
      gain.gain.exponentialRampToValueAtTime(.0001,start+.66);
      if(pan){pan.pan.setValueAtTime((index-2)*.15,start);tone.connect(gain);gain.connect(pan);pan.connect(c.destination);}
      else{tone.connect(gain);gain.connect(c.destination);}
      tone.start(start);tone.stop(start+.69);
    });
    const shimmer=c.createBufferSource(),filter=c.createBiquadFilter(),shimmerGain=c.createGain();
    shimmer.buffer=createGiftNoise(c,seed,0.62);filter.type="highpass";filter.frequency.setValueAtTime(3400,now);
    shimmerGain.gain.setValueAtTime(.0001,now);shimmerGain.gain.exponentialRampToValueAtTime(.009,now+.09);shimmerGain.gain.exponentialRampToValueAtTime(.0001,now+.62);
    shimmer.connect(filter);filter.connect(shimmerGain);shimmerGain.connect(c.destination);shimmer.start(now);shimmer.stop(now+.64);
    return true;
  }
  function playPhoenix(c,now,seed){
    const flame=c.createBufferSource(),band=c.createBiquadFilter(),low=c.createBiquadFilter(),envelope=c.createGain();
    flame.buffer=createGiftNoise(c,seed,1.12);
    band.type="bandpass";band.frequency.setValueAtTime(460,now);band.frequency.exponentialRampToValueAtTime(2450,now+.42);band.frequency.exponentialRampToValueAtTime(820,now+1.08);band.Q.setValueAtTime(.62,now);
    low.type="lowpass";low.frequency.setValueAtTime(2200,now);
    envelope.gain.setValueAtTime(.0001,now);envelope.gain.exponentialRampToValueAtTime(.075,now+.16);envelope.gain.exponentialRampToValueAtTime(.0001,now+1.12);
    flame.connect(band);band.connect(low);low.connect(envelope);envelope.connect(c.destination);flame.start(now);flame.stop(now+1.14);
    const notes=[220,293.66,392,523.25,659.25],delays=[.05,.18,.34,.53,.72];
    notes.forEach((frequency,index)=>{
      const start=now+delays[index],tone=c.createOscillator(),gain=c.createGain(),pan=c.createStereoPanner?.();
      tone.type=index===0?"triangle":"sine";tone.frequency.setValueAtTime(frequency*(1+((seed+index*3)%9-4)*.0009),start);
      gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.038/(1+index*.16),start+.03);gain.gain.exponentialRampToValueAtTime(.0001,start+.48);
      if(pan){pan.pan.setValueAtTime((index-2)*.17,start);tone.connect(gain);gain.connect(pan);pan.connect(c.destination);}else{tone.connect(gain);gain.connect(c.destination);}
      tone.start(start);tone.stop(start+.51);
    });
    return true;
  }
  function playCrocodile(c,now,seed){
    const body=c.createBufferSource(),bodyFilter=c.createBiquadFilter(),bodyGain=c.createGain();
    body.buffer=createGiftNoise(c,seed, .72);
    bodyFilter.type="lowpass";bodyFilter.frequency.setValueAtTime(560,now);bodyFilter.Q.setValueAtTime(.8,now);
    bodyGain.gain.setValueAtTime(.0001,now);
    bodyGain.gain.linearRampToValueAtTime(.046,now+.035);
    bodyGain.gain.exponentialRampToValueAtTime(.0001,now+.34);
    body.connect(bodyFilter);bodyFilter.connect(bodyGain);bodyGain.connect(c.destination);
    body.start(now);body.stop(now+.38);

    const snap=c.createBufferSource(),snapFilter=c.createBiquadFilter(),snapGain=c.createGain();
    snap.buffer=createGiftNoise(c,seed^0x6ac4, .28);
    snapFilter.type="bandpass";snapFilter.frequency.setValueAtTime(1450,now+.16);snapFilter.Q.setValueAtTime(1.2,now+.16);
    snapGain.gain.setValueAtTime(.0001,now+.16);
    snapGain.gain.linearRampToValueAtTime(.052,now+.176);
    snapGain.gain.exponentialRampToValueAtTime(.0001,now+.31);
    snap.connect(snapFilter);snapFilter.connect(snapGain);snapGain.connect(c.destination);
    snap.start(now+.16);snap.stop(now+.34);

    [0,.075,.29].forEach((delay,index)=>{
      const start=now+.16+delay,osc=c.createOscillator(),gain=c.createGain();
      osc.type=index===2?"triangle":"square";
      osc.frequency.setValueAtTime(index===2?92:138+index*27,start);
      osc.frequency.exponentialRampToValueAtTime(index===2?58:78,start+.085);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(index===2?.022:.009,start+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,start+.13);
      osc.connect(gain);gain.connect(c.destination);osc.start(start);osc.stop(start+.15);
    });
    return true;
  }
  function playDolphin(c,now,seed){
    const ocean=c.createBufferSource(),lowpass=c.createBiquadFilter(),wash=c.createGain();
    ocean.buffer=createGiftNoise(c,seed,1.12);
    lowpass.type="lowpass";
    lowpass.frequency.setValueAtTime(1700,now);
    lowpass.frequency.exponentialRampToValueAtTime(520,now+.82);
    lowpass.Q.setValueAtTime(.42,now);
    wash.gain.setValueAtTime(.0001,now);
    wash.gain.linearRampToValueAtTime(.028,now+.13);
    wash.gain.exponentialRampToValueAtTime(.0001,now+.92);
    ocean.connect(lowpass);lowpass.connect(wash);wash.connect(c.destination);
    ocean.start(now);ocean.stop(now+.96);
    const splash=c.createBufferSource(),splashFilter=c.createBiquadFilter(),splashGain=c.createGain();
    splash.buffer=createGiftNoise(c,seed^0x5a17, .48);
    splashFilter.type="highpass";splashFilter.frequency.setValueAtTime(2200,now+.54);
    splashGain.gain.setValueAtTime(.0001,now+.54);
    splashGain.gain.linearRampToValueAtTime(.018,now+.61);
    splashGain.gain.exponentialRampToValueAtTime(.0001,now+.91);
    splash.connect(splashFilter);splashFilter.connect(splashGain);splashGain.connect(c.destination);
    splash.start(now+.54);splash.stop(now+.94);
    [523.25,659.25,783.99].forEach((frequency,index)=>{
      const start=now+.2+index*.19,tone=c.createOscillator(),gain=c.createGain();
      tone.type="sine";tone.frequency.setValueAtTime(frequency,start);
      tone.frequency.exponentialRampToValueAtTime(frequency*1.16,start+.16);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(.012,start+.025);
      gain.gain.exponentialRampToValueAtTime(.0001,start+.23);
      tone.connect(gain);gain.connect(c.destination);tone.start(start);tone.stop(start+.25);
    });
    return true;
  }
  function playMaracas(c,now,seed){
    const rattle=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    rattle.buffer=createGiftNoise(c,seed,.9);
    filter.type="highpass";filter.frequency.setValueAtTime(1180,now);filter.Q.setValueAtTime(.62,now);
    const pulses=[0,.13,.28,.43,.59,.76];
    pulses.forEach((delay,index)=>{
      const start=now+delay,peak=.038-(index%2)*.006;
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.linearRampToValueAtTime(peak,start+.014);
      gain.gain.exponentialRampToValueAtTime(.0001,start+.092);
    });
    rattle.connect(filter);filter.connect(gain);gain.connect(c.destination);rattle.start(now);rattle.stop(now+.92);
    const notes=[392,523.25,659.25],delays=[.1,.39,.67];
    notes.forEach((frequency,index)=>{
      const start=now+delays[index],tone=c.createOscillator(),toneGain=c.createGain(),pan=c.createStereoPanner?.();
      tone.type=index===2?"triangle":"sine";
      tone.frequency.setValueAtTime(frequency*(1+((seed+index*5)%9-4)*.0008),start);
      toneGain.gain.setValueAtTime(.0001,start);
      toneGain.gain.exponentialRampToValueAtTime(.018,start+.018);
      toneGain.gain.exponentialRampToValueAtTime(.0001,start+.24);
      if(pan){pan.pan.setValueAtTime((index-1)*.2,start);tone.connect(toneGain);toneGain.connect(pan);pan.connect(c.destination);}
      else{tone.connect(toneGain);toneGain.connect(c.destination);}
      tone.start(start);tone.stop(start+.26);
    });
    return true;
  }
  function playBeachMaracas(c,now,seed){
    const rattle=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    rattle.buffer=createGiftNoise(c,seed,.92);
    filter.type="highpass";filter.frequency.setValueAtTime(900,now);filter.Q.setValueAtTime(.45,now);
    const pulses=[0,.16,.34,.5,.68];
    gain.gain.setValueAtTime(.0001,now);
    pulses.forEach((delay,index)=>{
      const start=now+delay,peak=.046-(index%2)*.008;
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.linearRampToValueAtTime(peak,start+.018);
      gain.gain.exponentialRampToValueAtTime(.0001,start+.105);
    });
    rattle.connect(filter);filter.connect(gain);gain.connect(c.destination);rattle.start(now);rattle.stop(now+.94);
    const notes=[261.63,392,523.25,659.25],delays=[.08,.29,.51,.7];
    notes.forEach((frequency,index)=>{
      const start=now+delays[index],tone=c.createOscillator(),toneGain=c.createGain(),pan=c.createStereoPanner?.();
      tone.type=index===3?"triangle":"sine";tone.frequency.setValueAtTime(frequency*(1+((seed+index*5)%9-4)*.001),start);
      toneGain.gain.setValueAtTime(.0001,start);toneGain.gain.exponentialRampToValueAtTime(.022,start+.02);toneGain.gain.exponentialRampToValueAtTime(.0001,start+.28);
      if(pan){pan.pan.setValueAtTime((index-1.5)*.2,start);tone.connect(toneGain);toneGain.connect(pan);pan.connect(c.destination);}else{tone.connect(toneGain);toneGain.connect(c.destination);}
      tone.start(start);tone.stop(start+.3);
    });
    return true;
  }
  function playRoyalLionsScepter(c,now,seed){
    const growl=c.createBufferSource(),band=c.createBiquadFilter(),low=c.createBiquadFilter(),envelope=c.createGain();
    growl.buffer=createGiftNoise(c,seed,1.04);
    band.type="bandpass";band.frequency.setValueAtTime(155,now);band.frequency.exponentialRampToValueAtTime(420,now+.24);band.frequency.exponentialRampToValueAtTime(185,now+.92);band.Q.setValueAtTime(.85,now);
    low.type="lowpass";low.frequency.setValueAtTime(950,now);low.frequency.exponentialRampToValueAtTime(620,now+.96);
    envelope.gain.setValueAtTime(.0001,now);envelope.gain.exponentialRampToValueAtTime(.052,now+.13);envelope.gain.exponentialRampToValueAtTime(.0001,now+1.04);
    growl.connect(band);band.connect(low);low.connect(envelope);envelope.connect(c.destination);growl.start(now);growl.stop(now+1.06);
    const rumble=c.createOscillator(),rumbleGain=c.createGain();
    rumble.type="triangle";rumble.frequency.setValueAtTime(92,now);rumble.frequency.exponentialRampToValueAtTime(58,now+.38);
    rumbleGain.gain.setValueAtTime(.0001,now);rumbleGain.gain.exponentialRampToValueAtTime(.042,now+.025);rumbleGain.gain.exponentialRampToValueAtTime(.0001,now+.46);
    rumble.connect(rumbleGain);rumbleGain.connect(c.destination);rumble.start(now);rumble.stop(now+.48);
    const notes=[196,293.66,392,587.33,783.99],delays=[.16,.33,.5,.69,.87];
    notes.forEach((frequency,index)=>{
      const start=now+delays[index],tone=c.createOscillator(),gain=c.createGain(),pan=c.createStereoPanner?.();
      tone.type=index===4?"sine":"triangle";tone.frequency.setValueAtTime(frequency*(1+((seed+index*7)%11-5)*.0008),start);
      gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.034/(1+index*.19),start+.035);gain.gain.exponentialRampToValueAtTime(.0001,start+.58);
      if(pan){pan.pan.setValueAtTime((index-2)*.16,start);tone.connect(gain);gain.connect(pan);pan.connect(c.destination);}else{tone.connect(gain);gain.connect(c.destination);}
      tone.start(start);tone.stop(start+.61);
    });
    const shimmer=c.createBufferSource(),filter=c.createBiquadFilter(),shimmerGain=c.createGain();
    shimmer.buffer=createGiftNoise(c,seed,0.58);filter.type="highpass";filter.frequency.setValueAtTime(3150,now+.12);
    shimmerGain.gain.setValueAtTime(.0001,now+.12);shimmerGain.gain.exponentialRampToValueAtTime(.007,now+.24);shimmerGain.gain.exponentialRampToValueAtTime(.0001,now+.68);
    shimmer.connect(filter);filter.connect(shimmerGain);shimmerGain.connect(c.destination);shimmer.start(now+.12);shimmer.stop(now+.7);
    return true;
  }
  function playRose(c,now,seed){
    const rustle=c.createBufferSource(),highpass=c.createBiquadFilter(),lowpass=c.createBiquadFilter(),rustleGain=c.createGain();
    rustle.buffer=createGiftNoise(c,seed,0.52);
    highpass.type="highpass";highpass.frequency.setValueAtTime(680,now);
    lowpass.type="lowpass";lowpass.frequency.setValueAtTime(1950,now);lowpass.frequency.exponentialRampToValueAtTime(4600,now+.34);
    rustleGain.gain.setValueAtTime(.0001,now);rustleGain.gain.exponentialRampToValueAtTime(.026,now+.075);
    rustleGain.gain.exponentialRampToValueAtTime(.0001,now+.52);
    rustle.connect(highpass);highpass.connect(lowpass);lowpass.connect(rustleGain);rustleGain.connect(c.destination);
    rustle.start(now);rustle.stop(now+.54);
    const notes=[523.25,659.25,783.99,1046.5,1318.51],delays=[0,.12,.255,.415,.595];
    notes.forEach((frequency,index)=>{
      const start=now+delays[index],tone=c.createOscillator(),gain=c.createGain(),pan=c.createStereoPanner?.();
      tone.type=index===4?"triangle":"sine";
      tone.frequency.setValueAtTime(frequency*(1+((seed+index*5)%9-4)*.00065),start);
      gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.021/(1+index*.24),start+.03);
      gain.gain.exponentialRampToValueAtTime(.0001,start+.62);
      if(pan){pan.pan.setValueAtTime((index-2)*.13,start);tone.connect(gain);gain.connect(pan);pan.connect(c.destination);}
      else{tone.connect(gain);gain.connect(c.destination);}
      tone.start(start);tone.stop(start+.65);
    });
    return true;
  }
  function playPopParrot(c,now,seed){
    const notes=[1046.5,1318.51,1567.98,1174.66,1760],delays=[0,.14,.31,.52,.72];
    notes.forEach((frequency,index)=>{
      const start=now+delays[index],tone=c.createOscillator(),gain=c.createGain(),pan=c.createStereoPanner?.();
      tone.type=index===2?"triangle":"sine";
      tone.frequency.setValueAtTime(frequency*(1+((seed+index*11)%13-6)*.0007),start);
      tone.frequency.exponentialRampToValueAtTime(frequency*1.13,start+.1);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(.034/(1+index*.18),start+.022);
      gain.gain.exponentialRampToValueAtTime(.0001,start+.19);
      if(pan){pan.pan.setValueAtTime((index-2)*.18,start);tone.connect(gain);gain.connect(pan);pan.connect(c.destination);}
      else{tone.connect(gain);gain.connect(c.destination);}
      tone.start(start);tone.stop(start+.21);
    });
    const flutter=c.createBufferSource(),filter=c.createBiquadFilter(),flutterGain=c.createGain();
    flutter.buffer=createGiftNoise(c,seed^0x2c91,.34);
    filter.type="highpass";filter.frequency.setValueAtTime(2600,now);
    flutterGain.gain.setValueAtTime(.0001,now+.18);
    flutterGain.gain.exponentialRampToValueAtTime(.006,now+.24);
    flutterGain.gain.exponentialRampToValueAtTime(.0001,now+.49);
    flutter.connect(filter);filter.connect(flutterGain);flutterGain.connect(c.destination);
    flutter.start(now+.18);flutter.stop(now+.52);
    return true;
  }
  function play(gift){
    if(!gift)return false;
    const c=audio();if(!c)return false;
    try{
      if(c.state==="suspended")void c.resume();
      const seed=hash([gift.sound_preset,gift.code,gift.name].join("|")),now=c.currentTime;
      if(gift.code==="rose-4ieccm")return playRose(c,now,seed);
      if(gift.code==="djembe-master-1v3jzkm")return playDjembe(c,now,seed);
      if(gift.code==="palm-breeze-gknyt0")return playPalmBreeze(c,now,seed);
      if(gift.code==="gamer-otter-100-mgl")return playGamerOtter(c,now,seed);
      if(gift.code==="live-island-rmn3mc")return playLiveIsland(c,now,seed);
      if(gift.code==="crystal-crown-1itryeu")return playCrystalCrown(c,now,seed);
      if(gift.code==="phoenix-wep6uk")return playPhoenix(c,now,seed);
      if(gift.code==="crocodile-tnyf2j")return playCrocodile(c,now,seed);
      if(gift.code==="dolphin-4bkejj")return playDolphin(c,now,seed);
      if(gift.code==="maracas-1wegi7n")return playMaracas(c,now,seed);
      if(gift.code==="beach-maracas-1exxoag")return playBeachMaracas(c,now,seed);
      if(gift.code==="royal-lions-scepter-15000-mgl")return playRoyalLionsScepter(c,now,seed);
      if(gift.code==="pop-parrot-alp4e8")return playPopParrot(c,now,seed);
      const p=profiles[gift.category]||profiles.other,variation=(seed%9)-4;
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
  const presets=new Set(["rose-unfurl","petal-bloom","heart-pulse","creature-entrance","grand-entry","soundwave-ripple","power-impact","delight-pop","glam-spin","royal-shimmer","celebration-burst","cosmic-orbit","nature-rise","horizon-sweep","pixel-burst","warm-wave","spark-float","gift-reveal","dolphin-leap","parrot-swoop"]);
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
    const createUnavailableNotice=(message)=>{
      const notice=document.createElement("span");notice.className="minglora-gift-fx-unavailable";notice.setAttribute("role","status");notice.textContent=message;
      notice.style.cssText="display:grid;place-items:center;min-height:120px;max-width:100%;padding:12px;color:#fff;background:rgba(17,24,39,.72);border-radius:14px;font:600 13px/1.4 system-ui,sans-serif;text-align:center;";
      return notice;
    };
    const createArtworkFallback=()=>{
      const image=document.createElement("img");image.className="minglora-gift-fx-model";image.alt=gift.name||"Minglora gift";
      image.addEventListener("error",()=>{if(image.isConnected)image.replaceWith(createUnavailableNotice("Gift artwork unavailable"));},{once:true});
      return image;
    };
    if(gift.model_url){
      const model=document.createElement("model-viewer");model.className="minglora-gift-fx-model";model.alt=gift.name+" original Minglora gift";
      const reducedMotion=Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);if(!reducedMotion){model.setAttribute("auto-rotate","");model.setAttribute("autoplay","");}model.setAttribute("rotation-per-second",rotationSpeed+"deg");model.setAttribute("interaction-prompt","none");model.setAttribute("shadow-intensity",".8");model.setAttribute("exposure","1.18");
      model.addEventListener("error",(event)=>{
        if(!model.isConnected)return;
        if(gift.image_url){
          const fallbackImage=createArtworkFallback();model.replaceWith(fallbackImage);fallbackImage.src=gift.image_url;
        }else{
          const message=event?.detail?.type==="webglcontextlost"?"3D preview unavailable on this device":"3D gift unavailable";
          model.replaceWith(createUnavailableNotice(message));
        }
      },{once:true});
      card.append(model);model.src=gift.model_url;
    }else if(gift.image_url){
      const fallbackImage=createArtworkFallback();card.append(fallbackImage);fallbackImage.src=gift.image_url;
    }else{
      card.append(createUnavailableNotice("Gift artwork unavailable"));
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
    if(motionElement&&(gift.motion_preset||gift.code==="rose-4ieccm")&&typeof motionElement.animate==="function"){
      const reduced=Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
      const visualPreset=gift.code==="rose-4ieccm"?"rose-unfurl":gift.code==="crocodile-tnyf2j"?"crocodile-snap":gift.code==="djembe-master-1v3jzkm"?"djembe-strike":gift.code==="palm-breeze-gknyt0"?"palm-canopy-sway":gift.code==="gamer-otter-100-mgl"?"gamer-otter-cheer":gift.code==="live-island-rmn3mc"?"island-tide":gift.code==="crystal-crown-1itryeu"?"crown-lustre":gift.code==="phoenix-wep6uk"?"phoenix-rise":gift.code==="dolphin-4bkejj"?"dolphin-leap":gift.code==="pop-parrot-alp4e8"?"parrot-swoop":gift.code==="maracas-1wegi7n"?"maraca-rhythm":gift.code==="beach-maracas-1exxoag"?"maraca-rhythm":gift.code==="royal-lions-scepter-15000-mgl"?"lion-scepter-rise":gift.motion_preset;
      const semanticFrames=buildPreviewFrames(visualPreset,{dx,dy,tilt,spin,peak,rebound});
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
    play(gift);
    const target=document.getElementById("minglora-gift-selected-model")||document.getElementById("minglora-gift-selected-image")||document.getElementById("live-gift-preview-model")||document.getElementById("live-gift-preview-image");
    if(target){
      const identity=String(gift.animation_key||gift.code||gift.name||"minglora-gift");
      const seed=hash([identity,gift.code,gift.name].join("|"));
      const dx=(seed%121)-60,dy=-24-((seed>>>7)%76),tilt=(seed>>>13)%81-40;
      const spin=((seed>>>19)%2?1:-1)*(70+((seed>>>20)%420));
      const peak=(108+((seed>>>3)%31))/100,rebound=(88+((seed>>>11)%19))/100;
      const preset=gift.code==="rose-4ieccm"?"rose-unfurl":gift.motion_preset||gift.animation_preset||"gift-reveal";
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