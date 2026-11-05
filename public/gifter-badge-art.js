(() => {
"use strict";
let instance=0;
const P=[
{light:"#e9fbff",mid:"#56a9d2",dark:"#174b78",edge:"#f7fdff",metalLight:"#f6fbff",metalMid:"#8caec5",metalDark:"#294d69",glow:"rgba(77,184,235,.42)"},
{light:"#ffe4bf",mid:"#c17a3b",dark:"#6d351d",edge:"#fff3e0",metalLight:"#fff0d8",metalMid:"#c58a4d",metalDark:"#683a1c",glow:"rgba(222,139,64,.42)"},
{light:"#fff",mid:"#a9bfd5",dark:"#425d7b",edge:"#fff",metalLight:"#fff",metalMid:"#a9bbcf",metalDark:"#42546c",glow:"rgba(175,205,235,.42)"},
{light:"#fff5bd",mid:"#dfa928",dark:"#75470b",edge:"#fffbe5",metalLight:"#fff6c9",metalMid:"#dca33a",metalDark:"#70420c",glow:"rgba(244,194,61,.45)"},
{light:"#f7ebff",mid:"#a78bd7",dark:"#4b327f",edge:"#fff7ff",metalLight:"#fff4ff",metalMid:"#9b83c9",metalDark:"#47356f",glow:"rgba(180,139,245,.45)"},
{light:"#e0fcff",mid:"#53c2e9",dark:"#155b99",edge:"#f4ffff",metalLight:"#f1ffff",metalMid:"#6eaccb",metalDark:"#245477",glow:"rgba(74,202,244,.46)"},
{light:"#ffe1f0",mid:"#d15c9a",dark:"#70234e",edge:"#fff4fa",metalLight:"#fff0f7",metalMid:"#c47d9d",metalDark:"#71334e",glow:"rgba(232,101,170,.46)"},
{light:"#eee2ff",mid:"#9867db",dark:"#49227d",edge:"#fff7ff",metalLight:"#f7efff",metalMid:"#9272c2",metalDark:"#3d286b",glow:"rgba(164,105,242,.5)"},
{light:"#ddfff3",mid:"#43b995",dark:"#145c50",edge:"#f1fff9",metalLight:"#edfff8",metalMid:"#5aaf94",metalDark:"#205a4b",glow:"rgba(62,211,167,.48)"},
{light:"#fff5db",mid:"#e1a9ed",dark:"#71358c",edge:"#fff",metalLight:"#fff",metalMid:"#d9c2ee",metalDark:"#64427e",glow:"rgba(236,151,219,.58)"}
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const levelOf=v=>clamp(Math.floor(Number(v)||1),1,50);
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function designProfile(value){
const level=levelOf(value),progress=(level-1)/49;
return Object.freeze({level,progress,tier:Math.ceil(level/5),crownPoints:3+Math.round(progress*4),wingFeathers:2+Math.round(progress*7),orbitRings:1+Math.floor(progress*2.99),accentGems:3+Math.round(progress*10),facetLines:4+Math.round(progress*8),gemScale:Number((.88+progress*.18).toFixed(4)),relief:Number((1+progress*1.9).toFixed(4)),glow:Number((.42+progress*.54).toFixed(4))});
}
function crown(n,p){
const start=54,end=126,step=(end-start)/Math.max(1,n-1),pts=[];
for(let i=0;i<n;i++){const x=start+step*i,y=i%2===0?20-p*5:33-p*2;pts.push(x.toFixed(1)+" "+y.toFixed(1));}
const d="M49 48L"+pts.join("L")+"L131 48L122 58H58Z";
const jewels=Array.from({length:n},(_,i)=>{const x=start+step*i,y=i%2===0?22-p*5:34-p*2;return '<circle class="gp-crest-crown-stone" cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+(1.7+p*.7).toFixed(2)+'"/>';}).join("");
return '<g class="gp-crest-crown"><path class="gp-crest-crown-shadow" d="'+d+'" transform="translate(0 4)"/><path class="gp-crest-crown-face" d="'+d+'"/><path class="gp-crest-crown-band" d="M54 46H126L121 58H59Z"/>'+jewels+'<path class="gp-crest-crown-glint" d="M58 45L66 25M83 44L90 17M108 44L116 25"/></g>';
}
function wings(n){
const feathers=[];
for(let i=0;i<n;i++){const t=i/Math.max(1,n-1),x=59-t*15,y=59+t*24,ex=8+t*39,ey=37+t*43;feathers.push('<path class="gp-crest-feather" d="M'+x.toFixed(1)+' '+y.toFixed(1)+' Q'+(36-t*3).toFixed(1)+' '+(39+t*31).toFixed(1)+' '+ex.toFixed(1)+' '+ey.toFixed(1)+'"/>');}
const base='<path class="gp-crest-wing-base" d="M65 70C47 50 27 39 8 43C19 53 24 61 28 67C18 63 9 64 3 70C22 72 35 83 52 96L68 92Z"/><path class="gp-crest-wing-highlight" d="M61 70C43 53 26 48 15 49M57 79C39 65 24 64 12 67M53 87C37 78 28 77 20 79"/>'+feathers.join("");
return '<g class="gp-crest-wing" transform="translate(180 0) scale(-1 1)">'+base+'</g><g class="gp-crest-wing">'+base+'</g>';
}
function ornaments(n){
const a=[[48,58],[132,58],[42,82],[138,82],[49,105],[131,105],[59,126],[121,126],[68,31],[112,31],[34,96],[146,96],[77,137],[103,137],[90,12]];
return a.slice(0,n).map((p,i)=>'<path class="gp-crest-accent" style="--gp-accent-delay:'+(-i*.17)+'s" d="M'+p[0]+' '+(p[1]-2.5)+'l1.5 1.4 2.5 1.1-2.5 1.1-1.5 1.4-1.5-1.4-2.5-1.1 2.5-1.1Z"/>').join("");
}
function orbits(n){return Array.from({length:n},(_,i)=>'<ellipse class="gp-crest-orbit gp-crest-orbit-'+(i+1)+'" cx="90" cy="83" rx="'+(78-i*(5+i*.5))+'" ry="'+(57-i*(5+i*.5)*.62)+'" transform="rotate('+(-18+i*34)+' 90 83)"/>').join("");}
function facets(n){return Array.from({length:n},(_,i)=>{const a=Math.PI*2*i/n,x=90+Math.cos(a)*18,y=75+Math.sin(a)*23;return '<path class="gp-crest-gem-facet" d="M90 75L'+x.toFixed(1)+' '+y.toFixed(1)+'"/>';}).join("");}
function svg(p,inline){
const pal=P[p.tier-1],id="minglora-crest-"+(++instance),s=p.gemScale,top=48-(s-.88)*22,bottom=105+(s-.88)*20;
return '<svg class="gp-crest-svg'+(inline?' gp-crest-svg--inline':'')+'" viewBox="0 0 180 160" aria-hidden="true" focusable="false"><defs>'+
'<linearGradient id="'+id+'-metal" x1="8%" y1="0%" x2="92%" y2="100%"><stop stop-color="'+pal.metalLight+'"/><stop offset="32%" stop-color="'+pal.metalMid+'"/><stop offset="58%" stop-color="'+pal.metalLight+'"/><stop offset="100%" stop-color="'+pal.metalDark+'"/></linearGradient>'+
'<linearGradient id="'+id+'-gold" x1="5%" y1="0%" x2="95%" y2="100%"><stop stop-color="#fff4bd"/><stop offset="38%" stop-color="#e0b34a"/><stop offset="70%" stop-color="#9c641c"/><stop offset="100%" stop-color="#fff0a1"/></linearGradient>'+
'<linearGradient id="'+id+'-face" x1="10%" y1="0%" x2="90%" y2="100%"><stop stop-color="'+pal.light+'"/><stop offset="48%" stop-color="'+pal.mid+'"/><stop offset="100%" stop-color="'+pal.dark+'"/></linearGradient>'+
'<linearGradient id="'+id+'-gem" x1="8%" y1="0%" x2="92%" y2="100%"><stop stop-color="#fff"/><stop offset="25%" stop-color="'+pal.light+'"/><stop offset="58%" stop-color="'+pal.mid+'"/><stop offset="100%" stop-color="'+pal.dark+'"/></linearGradient>'+
'<radialGradient id="'+id+'-aura"><stop stop-color="'+pal.light+'" stop-opacity=".9"/><stop offset="56%" stop-color="'+pal.mid+'" stop-opacity=".22"/><stop offset="100%" stop-color="'+pal.dark+'" stop-opacity="0"/></radialGradient>'+
'<filter id="'+id+'-shadow" x="-35%" y="-35%" width="170%" height="185%"><feGaussianBlur in="SourceAlpha" stdDeviation="3.5" result="b"/><feOffset dy="5"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'+
'<ellipse class="gp-crest-aura" cx="90" cy="82" rx="'+(54+p.progress*10).toFixed(1)+'" ry="'+(57+p.progress*7).toFixed(1)+'" fill="url(#'+id+'-aura)"/>'+orbits(p.orbitRings)+wings(p.wingFeathers)+
'<g filter="url(#'+id+'-shadow)"><path class="gp-crest-extrusion" d="M90 20C106 24 124 32 134 47L130 99C127 120 111 137 90 149C69 137 53 120 50 99L46 47C56 32 74 24 90 20Z" transform="translate(0 6)"/>'+
'<path class="gp-crest-rim-outer" fill="url(#'+id+'-gold)" d="M90 17C107 21 126 30 137 46L132 101C129 124 112 141 90 153C68 141 51 124 48 101L43 46C54 30 73 21 90 17Z"/>'+
'<path class="gp-crest-rim-inner" fill="url(#'+id+'-metal)" d="M90 25C105 29 120 36 129 49L125 98C122 116 108 130 90 140C72 130 58 116 55 98L51 49C60 36 75 29 90 25Z"/>'+
'<path class="gp-crest-face" fill="url(#'+id+'-face)" d="M90 31C104 35 116 41 122 52L119 96C116 111 105 124 90 133C75 124 64 111 61 96L58 52C64 41 76 35 90 31Z"/>'+
'<path class="gp-crest-face-gloss" d="M61 53C68 42 78 37 90 33C102 37 112 42 119 53L116 64C107 54 99 50 90 47C81 50 73 54 64 64Z"/>'+
'<path class="gp-crest-side-facet" d="M58 52L72 61L68 112L61 96Z"/><path class="gp-crest-side-facet gp-crest-side-facet--right" d="M122 52L108 61L112 112L119 96Z"/>'+
'<path class="gp-crest-filigree" d="M62 75C71 67 76 67 80 71M118 75C109 67 104 67 100 71M68 112C75 120 82 124 90 128C98 124 105 120 112 112"/>'+
'<path class="gp-crest-gem-shadow" d="M90 '+(top+4).toFixed(1)+'L'+(110*s+90*(1-s)).toFixed(1)+' 76L90 '+(bottom+4).toFixed(1)+'L'+(70*s+90*(1-s)).toFixed(1)+' 76Z"/>'+
'<path class="gp-crest-gem" fill="url(#'+id+'-gem)" d="M90 '+top.toFixed(1)+'L'+(110*s+90*(1-s)).toFixed(1)+' 75L90 '+bottom.toFixed(1)+'L'+(70*s+90*(1-s)).toFixed(1)+' 75Z"/>'+
'<path class="gp-crest-gem-facet gp-crest-gem-facet--top" d="M90 '+top.toFixed(1)+'L'+(110*s+90*(1-s)).toFixed(1)+' 75L90 75Z"/>'+
'<path class="gp-crest-gem-facet gp-crest-gem-facet--left" d="M90 '+top.toFixed(1)+'L90 75L'+(70*s+90*(1-s)).toFixed(1)+' 75Z"/>'+facets(p.facetLines)+
'<path class="gp-crest-gem-highlight" d="M78 66L88 '+(top+7).toFixed(1)+'L84 78Z"/>'+crown(p.crownPoints,p.progress)+ornaments(p.accentGems)+
'<path class="gp-crest-bottom-glint" d="M71 132Q90 145 109 132"/><path class="gp-crest-rune" d="M90 111L94 117L90 123L86 117Z"/></g></svg>';
}
function render(options){
options=options||{};
const p=designProfile(options.level),pal=P[p.tier-1],name=esc(options.badgeName||("Gifter LV "+p.level));
const style='--gp-progress:'+p.progress.toFixed(4)+';--gp-relief:'+p.relief.toFixed(3)+';--gp-glow:'+p.glow.toFixed(3)+';--gp-glow-blur:'+(3+p.progress*8).toFixed(2)+'px;--gp-orbit-opacity:' +(.32+p.progress*.42).toFixed(3)+';--gp-feather-opacity:' +(.36+p.progress*.38).toFixed(3)+';--gp-wing-highlight-opacity:' +(.48+p.progress*.34).toFixed(3)+';--gp-metal-light:'+pal.metalLight+';--gp-metal-mid:'+pal.metalMid+';--gp-metal-dark:'+pal.metalDark+';--gp-gem-light:'+pal.light+';--gp-gem-mid:'+pal.mid+';--gp-gem-dark:'+pal.dark+';--gp-gem-edge:'+pal.edge;
const artwork=svg(p,Boolean(options.inline));
if(options.inline)return '<span class="gp-inline-badge gp-tier-'+p.tier+' gp-level-'+p.level+'" data-gp-level="'+p.level+'" style="'+style+'" role="img" aria-label="'+name+'" title="'+name+'"><span class="gp-inline-art">'+artwork+'</span><strong>'+p.level+'</strong></span>';
const cls='gp-badge gp-tier-'+p.tier+' gp-level-'+p.level+(options.compact?' gp-badge--small':'');
return '<span class="'+cls+'" data-gp-level="'+p.level+'" style="'+style+'" role="img" aria-label="'+name+'" title="'+name+'"><span class="gp-crest-stage">'+artwork+'<i class="gp-crest-spark gp-crest-spark--one"></i><i class="gp-crest-spark gp-crest-spark--two"></i></span>'+(options.compact?'':'<span class="gp-badge-level">LV <b>'+p.level+'</b></span><span class="gp-badge-caption">GIFTER</span>')+'</span>';
}
window.MingloraGifterBadgeArt=Object.freeze({render,designProfile});
})();