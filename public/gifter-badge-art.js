(() => {
  "use strict";
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const levelOf=value=>clamp(Math.floor(Number(value)||1),1,50);
  const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const tierForLevel=level=>level>=50?6:level>=40?5:level>=30?4:level>=20?3:level>=10?2:1;
  const tierLabels=Object.freeze(["Levels 1–9","Levels 10–19","Levels 20–29","Levels 30–39","Levels 40–49","Level 50+"]);
  function designProfile(value){
    const level=levelOf(value),stage=tierForLevel(level);
    return Object.freeze({level,progress:(level-1)/49,tier:Math.ceil(level/5),stage,stageLabel:tierLabels[stage-1]});
  }
  function render(options={}){
    const profile=designProfile(options.level);
    const placement=options.gallery?"gallery":options.inline?"inline":options.compact?"compact":"profile";
    const sizes={profile:[48,21],inline:[44,20],compact:[40,18],gallery:[170,76]};
    const size=sizes[placement],level=String(profile.level).padStart(2,"0");
    const label=escapeHtml(options.badgeName||("Level "+profile.level+" Gifter badge"));
    return '<span class="gp-original-badge gp-original-badge--'+placement+' gp-level-'+profile.level+
      '" data-gp-level="'+profile.level+'" data-gp-stage="'+profile.stage+'" role="img" aria-label="'+label+'" title="'+label+'">'+
      '<img class="gp-profile-level-badge gp-profile-level-badge--'+placement+'" src="/assets/gifter-badges/level_'+level+
      '.png" alt="" loading="lazy" decoding="async" width="'+size[0]+'" height="'+size[1]+'"></span>';
  }
  window.MingloraGifterBadgeArt=Object.freeze({render,designProfile});
})();
