(() => {
  "use strict";
  let ctx=null;
  function audio(){
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C)return null;
    if(!ctx)ctx=new C();
    return ctx;
  }
  function prime(){try{const c=audio();if(c?.state==="suspended")void c.resume();return Boolean(c);}catch{return false;}}
  function hash(value){let h=2166136261;for(const ch of String(value||"")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
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
    if(options.sound!==false)play(gift);
    setTimeout(()=>outer.remove(),duration+250);
    return outer;
  }
  function show(gift,options={}){return mount(document.body,gift,options);}
  function preview(gift){
    if(!gift)return false;
    play(gift);
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