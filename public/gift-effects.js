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
    const preset=presets.has(gift.animation_preset||gift.animation_key)?(gift.animation_preset||gift.animation_key):"gift-reveal";
    const outer=document.createElement("div");outer.className="minglora-gift-fx minglora-fx-"+preset;outer.style.setProperty("--minglora-gift-duration",duration+"ms");
    const card=document.createElement("div");card.className="minglora-gift-fx-card";
    if(gift.model_url){
      const model=document.createElement("model-viewer");model.className="minglora-gift-fx-model";model.src=gift.model_url;model.alt=gift.name+" original Minglora gift";
      model.setAttribute("auto-rotate","");model.setAttribute("rotation-per-second","60deg");model.setAttribute("interaction-prompt","none");model.setAttribute("shadow-intensity",".8");model.setAttribute("exposure","1.18");card.append(model);
    }else if(gift.image_url){
      const img=document.createElement("img");img.className="minglora-gift-fx-model";img.src=gift.image_url;img.alt=gift.name;card.append(img);
    }else{
      const emoji=document.createElement("span");emoji.className="minglora-gift-fx-emoji";emoji.textContent=gift.emoji||"🎁";card.append(emoji);
    }
    const caption=document.createElement("strong");caption.className="minglora-gift-fx-caption";caption.textContent=gift.name||"Minglora Gift";card.append(caption);
    const rays=document.createElement("span");rays.className="minglora-gift-fx-rays";outer.append(card,rays);parent.append(outer);
    if(options.sound!==false)play(gift);
    setTimeout(()=>outer.remove(),duration+250);
    return outer;
  }
  function show(gift,options={}){return mount(document.body,gift,options);}
  function preview(gift){
    if(!gift)return false;
    play(gift);
    const target=document.getElementById("minglora-gift-selected-model")||document.getElementById("minglora-gift-selected-image");
    if(target){target.classList.remove("minglora-gift-preview-pulse");void target.offsetWidth;target.classList.add("minglora-gift-preview-pulse");}
    return true;
  }
  window.MingloraGiftFX={prime,play,show,mount,preview};
})();