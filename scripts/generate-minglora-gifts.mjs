import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "data", "minglora-gift-catalog.json");
const ASSET_DIR = path.join(ROOT, "public", "assets", "gifts", "catalog");

function hash32(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function palette(gift) {
  const palettes = {
    flowers: ["#f76e9c", "#8f2f78", "#ffd37a"],
    hearts: ["#ff5d89", "#a72d70", "#ffc2d3"],
    animals: ["#39b8ad", "#205f88", "#ffd18c"],
    vehicles: ["#ff9d43", "#a84164", "#9ce8f2"],
    music: ["#9676ff", "#3d4aa0", "#ffb6dd"],
    sports: ["#e7a43c", "#8b4b26", "#d4f17c"],
    food_drink: ["#f7a35e", "#a94c45", "#ffe2a4"],
    fashion_beauty: ["#f28ab8", "#783b85", "#ffe0ae"],
    luxury: ["#e7bb55", "#81572e", "#fff0a8"],
    celebrations: ["#f36d74", "#8b3d9e", "#ffe18b"],
    fantasy: ["#8f83ff", "#3d367d", "#9cf6ee"],
    nature: ["#4cae7c", "#24614f", "#f2d37d"],
    travel: ["#4f9ad8", "#254a88", "#ffc66d"],
    games: ["#6b8cff", "#3e3b91", "#ffcf70"],
    community: ["#e08a58", "#854a61", "#ffe2a0"],
    symbols: ["#65b9d8", "#335d92", "#f7da81"],
    other: ["#8c83d8", "#45436f", "#f4c879"]
  };
  const list = palettes[gift.category] || palettes.other;
  const seed = hash32(gift.code);
  const shift = (seed % 17) - 8;
  return list.map((hex, index) => {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + shift));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + shift));
    const b = Math.max(0, Math.min(255, (num & 255) + shift));
    return "#" + [r,g,b].map(v => v.toString(16).padStart(2,"0")).join("");
  });
}
function symbolFor(gift) {
  const name = gift.name.toLowerCase();
  const rules = [
    [/rose|flower|tulip|bouquet|hibiscus|blossom|sakura|orchid|lotus/,"🌹"],
    [/cnc coin/,"🪙"], [/easter heart/,"💖"], [/fighting|boxing glove|boxing/,"🥊"],
    [/kitty pillow/,"🐱"], [/otter/,"🦦"], [/four leaf clover|clover/,"🍀"],
    [/dj headphone|headphone/,"🎧"], [/yalla sahel/,"👋"], [/merdeka|festival/,"🎊"],
    [/pop, don/,"🎈"], [/house hat/,"🎩"], [/let.?s be friends/,"🤝"],
    [/audience laughter/,"😂"], [/star hero stage/,"🌟"], [/picture perfect/,"📸"],
    [/championship hall/,"🏆"], [/klcc|jakarta roundabout/,"🏙️"],
    [/alpha wolves/,"🐺"], [/golden falcons|falcon/,"🦅"], [/keeper of atlantis/,"🔱"],
    [/noble stallions|stallion/,"🐎"], [/royal lions|lion/,"🦁"],
    [/ultimate match/,"⚔️"], [/goal of glory/,"🏆"], [/flamenco dancers/,"💃"],
    [/baseball/,"⚾"], [/basketball/,"🏀"], [/football|soccer/,"⚽"], [/volleyball/,"🏐"],
    [/tennis/,"🎾"], [/cricket/,"🏏"], [/boxing glove|boxing/,"🥊"], [/golf/,"⛳"],
    [/cat|kitten/,"🐱"], [/dog|puppy|shiba|corgi/,"🐶"], [/bear|panda/,"🐻"],
    [/lion/,"🦁"], [/tiger/,"🐯"], [/fox/,"🦊"], [/rabbit|bunny/,"🐰"],
    [/horse|unicorn|pegasus/,"🦄"], [/dragon/,"🐉"], [/dinosaur|t.rex|trex/,"🦖"],
    [/whale/,"🐳"], [/dolphin/,"🐬"], [/shark/,"🦈"], [/fish/,"🐠"],
    [/eagle|falcon/,"🦅"], [/parrot/,"🦜"], [/swan|dove/,"🕊️"], [/penguin/,"🐧"],
    [/butterfly/,"🦋"], [/bee/,"🐝"], [/frog/,"🐸"], [/turtle/,"🐢"],
    [/car|vehicle|sports car|truck|bus/,"🏎️"], [/motorcycle|motorbike/,"🏍️"],
    [/bicycle|bike|cycling/,"🚲"], [/helicopter/,"🚁"], [/train/,"🚂"],
    [/plane|jet|aircraft|shuttle/,"✈️"], [/boat|ship|yacht/,"🛥️"], [/rocket/,"🚀"],
    [/guitar/,"🎸"], [/drum/,"🥁"], [/piano|keyboard/,"🎹"], [/mic|microphone/,"🎤"],
    [/music|headphone|speaker|melody|beat/,"🎵"], [/trophy|medal|champion|award/,"🏆"],
    [/ice cream|gelato|popsicle/,"🍦"], [/cake|cupcake|birthday/,"🎂"], [/pizza/,"🍕"],
    [/coffee/,"☕"], [/tea/,"🫖"], [/juice|smoothie/,"🧃"], [/watermelon/,"🍉"],
    [/mango/,"🥭"], [/cherry/,"🍒"], [/corn/,"🌽"], [/chili|chilli|pepper/,"🌶️"],
    [/perfume/,"🧴"], [/diamond|crystal|gem/,"💎"], [/crown|tiara/,"👑"],
    [/ring|necklace|jewelry/,"💍"], [/money|cash|coin|gold mine/,"💰"],
    [/firework|confetti|balloon|party|celebration/,"🎉"], [/tree|forest|garden|island/,"🌳"],
    [/star|moon|sun|galaxy|universe|space|nebula/,"🌌"], [/alien/,"👽"],
    [/game|gaming|controller|arcade/,"🎮"], [/camera|photo/,"📸"],
    [/clapperboard|movie|film/,"🎬"], [/book|study|school/,"📚"],
    [/castle|palace|kingdom/,"🏰"], [/house|home/,"🏠"], [/flag|jamaica|parish/,"🇯🇲"],
    [/umbrella/,"☂️"], [/clock|watch|time/,"⌚"], [/phone|mobile/,"📱"]
  ];
  for (const pair of rules) if (pair[0].test(name)) return pair[1];
  return gift.emoji || "🎁";
}
function svgArt(gift) {
  const colors = palette(gift);
  const seed = hash32(gift.code);
  const symbol = symbolFor(gift);
  const name = String(gift.name || "").toLowerCase();
  const rot = (seed % 31) - 15;
  const star1 = 45 + (seed % 50);
  const star2 = 370 + (seed % 60);
  const ring = 185 + (seed % 35);
  const bg1 = colors[1], bg2 = colors[0], shine = colors[2];
  const icon = (gift.category === "hearts" ? "heart" :
    gift.category === "flowers" ? "petal" :
    gift.category === "animals" ? "creature" :
    gift.category === "vehicles" ? "motion" :
    gift.category === "music" ? "sound" :
    gift.category === "sports" ? "sport" :
    gift.category === "food_drink" ? "delight" :
    gift.category === "luxury" || gift.category === "fashion_beauty" ? "jewel" :
    gift.category === "fantasy" ? "cosmic" :
    gift.category === "nature" ? "leaf" :
    gift.category === "travel" ? "horizon" :
    gift.category === "games" ? "pixel" :
    gift.category === "community" ? "bond" : "spark");
  let shape = "";
  if (/^rose$|^white rose$|^crystal rose$|^my first rose$/.test(name)) {
    shape = '<path d="M256 304v122m0-78c-58-39-81 8-81 8 40 37 62 12 81-8zm0 31c57-42 81 7 81 7-41 37-62 12-81-7z" fill="none" stroke="#58c27b" stroke-width="17" stroke-linecap="round"/><path d="M246 325q-52-39-43-82m65 82q52-39 43-82" fill="none" stroke="#429c68" stroke-width="7"/><g fill="url(#main)" stroke="#fff" stroke-opacity=".7" stroke-width="5"><ellipse cx="256" cy="208" rx="37" ry="79"/><ellipse cx="256" cy="208" rx="37" ry="79" transform="rotate(55 256 256)"/><ellipse cx="256" cy="208" rx="37" ry="79" transform="rotate(110 256 256)"/><ellipse cx="256" cy="208" rx="37" ry="79" transform="rotate(165 256 256)"/></g><circle cx="256" cy="256" r="39" fill="url(#shine)"/>';
  } else if (/cnc coin/.test(name)) {
    shape = '<circle cx="256" cy="256" r="145" fill="url(#main)" stroke="#fff" stroke-width="13"/><circle cx="256" cy="256" r="115" fill="none" stroke="url(#shine)" stroke-width="12"/><path d="M256 166v180m-43-143h58q38 0 38 33t-38 33h-46q-37 0-37 32t38 32h59" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round"/><path d="M256 126v-24m0 308v-24" stroke="#fff" stroke-width="8" stroke-linecap="round"/>';
  } else if (/fighting/.test(name)) {
    shape = '<path d="M163 311q-13-22 5-43l39-49q14-16 31-5l20 13 23-43q15-24 34-9 13 10 5 29l-19 45 24-33q17-20 34-5 13 12 1 31l-26 42q25-19 40-1 12 15-3 33l-48 61q-23 30-62 28l-59-7q-40-7-50-43z" fill="url(#main)" stroke="#fff" stroke-width="10" stroke-linejoin="round"/><path d="M162 346l-34 28 41 59 37-30" fill="#f3b2c9" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="M225 253l25 20m21-47 24 19m21-17 22 18" fill="none" stroke="url(#shine)" stroke-width="13" stroke-linecap="round"/>';
  } else if (/baseball/.test(name)) {
    shape = '<circle cx="256" cy="252" r="132" fill="#fff" stroke="#d6e2ef" stroke-width="12"/><path d="M158 154q98 98 0 196m196-196q-98 98 0 196" fill="none" stroke="#d84854" stroke-width="12" stroke-linecap="round"/><path d="M165 173l-15 15m34 14-15 15m34 14-15 15m34 14-15 15m34 14-15 15m34 14-15 15m34-173 15 15m-34 14 15 15m-34 14 15 15m-34 14 15 15m-34 14 15 15m-34 14 15 15" stroke="#d84854" stroke-width="7" stroke-linecap="round"/>';
  } else if (/ice cream|gelato|popsicle/.test(name)) {
    shape = '<path d="M186 252h140l-65 174q-5 13-12 0z" fill="#b87b48" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="M186 256q-28-18-28-56 0-75 98-75t98 75q0 38-28 56z" fill="url(#main)" stroke="#fff" stroke-width="9"/><circle cx="224" cy="193" r="14" fill="#fff" fill-opacity=".6"/><circle cx="277" cy="174" r="10" fill="#fff" fill-opacity=".7"/>';
  } else if (/coffee/.test(name)) {
    shape = '<path d="M167 209h177l-18 165q-4 28-31 28h-79q-27 0-31-28z" fill="url(#main)" stroke="#fff" stroke-width="9"/><path d="M344 241h42q52 0 42 60-9 50-63 48" fill="none" stroke="#fff" stroke-width="18"/><path d="M218 175q-28-38 0-69m52 69q-28-38 0-69m52 69q-28-38 0-69" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="10" stroke-linecap="round"/>';
  } else if (icon === "heart") {
    shape = '<path d="M256 356C198 309 132 259 132 194c0-43 31-73 72-73 25 0 43 13 52 32 11-19 30-32 55-32 42 0 73 31 73 73 0 65-66 115-128 162z" fill="url(#main)" stroke="#fff" stroke-opacity=".7" stroke-width="8"/>';
  } else if (icon === "petal") {
    shape = '<g fill="url(#main)" stroke="#fff" stroke-opacity=".68" stroke-width="5"><ellipse cx="256" cy="181" rx="34" ry="81"/><ellipse cx="256" cy="181" rx="34" ry="81" transform="rotate(45 256 256)"/><ellipse cx="256" cy="181" rx="34" ry="81" transform="rotate(90 256 256)"/><ellipse cx="256" cy="181" rx="34" ry="81" transform="rotate(135 256 256)"/></g><circle cx="256" cy="256" r="48" fill="url(#shine)"/><path d="M256 304v111m0-64c-58-42-80 6-80 6 40 37 62 13 80-6zm0 22c57-42 81 8 81 8-41 37-62 12-81-8z" fill="none" stroke="#72d39c" stroke-width="16" stroke-linecap="round"/>';
  } else if (icon === "creature") {
    shape = '<ellipse cx="256" cy="288" rx="104" ry="91" fill="url(#main)" stroke="#fff" stroke-opacity=".65" stroke-width="7"/><circle cx="256" cy="205" r="82" fill="url(#shine)" stroke="#fff" stroke-opacity=".75" stroke-width="7"/><path d="M198 155l-20-67 70 38m48 29 21-67-71 38" fill="url(#main)" stroke="#fff" stroke-opacity=".6" stroke-width="7" stroke-linejoin="round"/><ellipse cx="226" cy="207" rx="10" ry="15" fill="#26334d"/><ellipse cx="286" cy="207" rx="10" ry="15" fill="#26334d"/><path d="M238 245q18 18 36 0" fill="none" stroke="#26334d" stroke-width="8" stroke-linecap="round"/>';
  } else if (icon === "motion") {
    shape = '<path d="M114 278h285l-24-77h-64l-36-47h-85l-40 58z" fill="url(#main)" stroke="#fff" stroke-opacity=".75" stroke-width="8" stroke-linejoin="round"/><path d="M203 164h69l33 42H174z" fill="#d8f5ff" fill-opacity=".82"/><circle cx="181" cy="305" r="39" fill="#303956" stroke="#fff" stroke-width="10"/><circle cx="342" cy="305" r="39" fill="#303956" stroke="#fff" stroke-width="10"/><path d="M78 230h50m-65 27h69" stroke="url(#shine)" stroke-width="13" stroke-linecap="round"/>';
  } else if (icon === "sound") {
    shape = '<path d="M151 283V222q0-24 26-24t26 24v61q0 66-52 66t-52-66v-38" fill="none" stroke="url(#main)" stroke-width="25" stroke-linecap="round"/><path d="M203 260h101m-101 42h101m-101 42h101" stroke="url(#shine)" stroke-width="12" stroke-linecap="round"/><path d="M303 207v155m42-184v213m42-168v123" stroke="url(#main)" stroke-width="17" stroke-linecap="round"/>';
  } else if (icon === "sport") {
    shape = '<path d="M181 127h150l-16 124q-7 63-59 63t-59-63z" fill="url(#main)" stroke="#fff" stroke-width="8"/><path d="M181 158h-48q-10 78 74 86m144-86h48q10 78-74 86" fill="none" stroke="url(#shine)" stroke-width="18"/><rect x="232" y="310" width="48" height="66" rx="8" fill="url(#main)"/><path d="M176 386h160v30H176z" fill="url(#shine)"/>';
  } else if (icon === "delight") {
    shape = '<path d="M141 218h230l-28 132H169z" fill="url(#main)" stroke="#fff" stroke-width="8"/><path d="M126 210q130-93 260 0" fill="none" stroke="url(#shine)" stroke-width="20" stroke-linecap="round"/><path d="M205 146q-15-54 30-74m38 75q-15-55 31-76" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/><circle cx="224" cy="258" r="16" fill="#fff" fill-opacity=".75"/><circle cx="278" cy="293" r="13" fill="#fff" fill-opacity=".75"/><circle cx="320" cy="250" r="11" fill="#fff" fill-opacity=".75"/>';
  } else if (icon === "jewel") {
    shape = '<path d="M256 111l133 125-133 175-133-175z" fill="url(#main)" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="M256 111v300m-133-175h266m-133-125l-71 125 71 175 71-175z" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="6"/>';
  } else if (icon === "cosmic") {
    shape = '<path d="M256 111l34 95 100 4-79 64 28 100-83-56-83 56 28-100-79-64 100-4z" fill="url(#main)" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><ellipse cx="256" cy="254" rx="165" ry="60" transform="rotate(-23 256 254)" fill="none" stroke="url(#shine)" stroke-width="13"/>';
  } else if (icon === "leaf") {
    shape = '<path d="M128 337q-28-184 177-225 83-16 118-11-8 234-194 258-56 7-101-22z" fill="url(#main)" stroke="#fff" stroke-width="8"/><path d="M124 385q94-125 260-238M197 309l-10-90m87 26 49-60" fill="none" stroke="#d5fff1" stroke-width="13" stroke-linecap="round"/>';
  } else if (icon === "horizon") {
    shape = '<circle cx="256" cy="236" r="108" fill="url(#shine)"/><path d="M80 296q88-88 176 0t176 0v98H80z" fill="url(#main)" stroke="#fff" stroke-width="8"/><path d="M88 346q84-50 168 0t168 0" fill="none" stroke="#e2fbff" stroke-width="13"/>';
  } else if (icon === "pixel") {
    shape = '<rect x="124" y="166" width="264" height="174" rx="44" fill="url(#main)" stroke="#fff" stroke-width="9"/><path d="M168 225h42v42h-42zm83-12h42v42h-42zm83 12h42v42h-42zm-125 70h84v23h-84z" fill="url(#shine)"/><circle cx="346" cy="293" r="11" fill="#fff"/>';
  } else if (icon === "bond") {
    shape = '<circle cx="194" cy="202" r="64" fill="url(#main)" stroke="#fff" stroke-width="8"/><circle cx="318" cy="202" r="64" fill="url(#shine)" stroke="#fff" stroke-width="8"/><path d="M105 354q10-89 89-89t89 89v38H105zm119 0q10-89 89-89t89 89v38H224z" fill="url(#main)" stroke="#fff" stroke-width="8"/>';
  } else {
    shape = '<path d="M256 110l38 99 107 5-83 69 29 105-91-59-91 59 29-105-83-69 107-5z" fill="url(#main)" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><circle cx="256" cy="250" r="42" fill="url(#shine)"/>';
  }
  const spark = '<path d="M'+star1+' 110l9 20 20 9-20 9-9 20-9-20-20-9 20-9zM'+star2+' 332l8 18 18 8-18 8-8 18-8-18-18-8 18-8z" fill="'+shine+'" opacity=".9"/>';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="'+String(gift.name).replace(/&/g,"&amp;").replace(/</g,"&lt;")+'">'+
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+bg1+'"/><stop offset="1" stop-color="'+bg2+'"/></linearGradient><linearGradient id="main" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+shine+'"/><stop offset=".55" stop-color="'+bg2+'"/><stop offset="1" stop-color="'+bg1+'"/></linearGradient><radialGradient id="shine" cx=".28" cy=".2" r=".85"><stop stop-color="#fff"/><stop offset=".35" stop-color="'+shine+'"/><stop offset="1" stop-color="'+bg1+'"/></radialGradient><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter></defs>'+
    '<rect width="512" height="512" rx="82" fill="url(#bg)"/><circle cx="256" cy="257" r="'+ring+'" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="22"/><circle cx="256" cy="265" r="160" fill="#100d36" opacity=".17" filter="url(#shadow)"/>'+
    '<ellipse cx="256" cy="408" rx="132" ry="21" fill="#081a3b" opacity=".22"/>'+
    '<g transform="rotate('+rot+' 256 256)">'+shape+'</g>'+spark+
    '<circle cx="392" cy="108" r="7" fill="#fff" opacity=".9"/><circle cx="115" cy="390" r="6" fill="#fff" opacity=".75"/>'+
    '<text x="256" y="286" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif" font-size="118" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#fff" stroke-opacity=".2" stroke-width="4">'+symbol+'</text>'+
    '<path d="M90 72q90-48 174-26" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="10" stroke-linecap="round"/>'+
    '</svg>';
}

// The GLB-ready scene geometry is authored as simple original meshes, not imported models.
function modelDocument(gift) {
  const seed = hash32(gift.code);
  const hue = seed % 360;
  const colors = palette(gift);
  const base = colors[0], light = colors[2], dark = colors[1];
  const parts = [];
  function addPart(vertices, indices, color) {
    const normals = [];
    for (let i=0;i<vertices.length;i+=3) {
      const n = Math.hypot(vertices[i],vertices[i+1],vertices[i+2]) || 1;
      normals.push(vertices[i]/n,vertices[i+1]/n,vertices[i+2]/n);
    }
    parts.push({positions:vertices,normals,indices,color});
  }
  function sphere(cx,cy,cz,sx,sy,sz,color,seg=14,rings=9) {
    const v=[],idx=[];
    for(let y=0;y<=rings;y++){
      const phi=Math.PI*y/rings;
      for(let x=0;x<=seg;x++){
        const theta=2*Math.PI*x/seg;
        const nx=Math.sin(phi)*Math.cos(theta),ny=Math.cos(phi),nz=Math.sin(phi)*Math.sin(theta);
        v.push(cx+nx*sx,cy+ny*sy,cz+nz*sz);
      }
    }
    for(let y=0;y<rings;y++)for(let x=0;x<seg;x++){
      const a=y*(seg+1)+x,b=a+seg+1;
      idx.push(a,b,a+1,a+1,b,b+1);
    }
    const norms=[];
    for(let y=0;y<=rings;y++)for(let x=0;x<=seg;x++){
      const phi=Math.PI*y/rings,theta=2*Math.PI*x/seg;
      norms.push(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta));
    }
    parts.push({positions:v,normals:norms,indices:idx,color});
  }
  function box(cx,cy,cz,sx,sy,sz,color) {
    const faces=[
      [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[0,0,1]],
      [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1],[0,0,-1]],
      [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,0,0]],
      [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1],[1,0,0]],
      [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1],[0,1,0]],
      [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[0,-1,0]]
    ];
    const v=[],n=[],idx=[];
    for(const f of faces){
      const baseIdx=v.length/3;
      for(let j=0;j<4;j++){
        const p=f[j];v.push(cx+p[0]*sx/2,cy+p[1]*sy/2,cz+p[2]*sz/2);
        n.push(f[4][0],f[4][1],f[4][2]);
      }
      idx.push(baseIdx,baseIdx+1,baseIdx+2,baseIdx,baseIdx+2,baseIdx+3);
    }
    parts.push({positions:v,normals:n,indices:idx,color});
  }
  function cylinder(cx,cy,cz,r,h,color,seg=16,rt=r) {
    const v=[],n=[],idx=[];
    for(let i=0;i<=seg;i++){
      const a=2*Math.PI*i/seg,x=Math.cos(a),z=Math.sin(a);
      v.push(cx+x*r,cy-h/2,cz+z*r,cx+x*rt,cy+h/2,cz+z*rt);
      n.push(x,0,z,x,0,z);
    }
    for(let i=0;i<seg;i++){const a=i*2,b=a+2;idx.push(a,b,a+1,a+1,b,b+1);}
    const baseIdx=v.length/3;
    v.push(cx,cy-h/2,cz);n.push(0,-1,0);
    for(let i=0;i<=seg;i++){const a=2*Math.PI*i/seg;v.push(cx+Math.cos(a)*r,cy-h/2,cz+Math.sin(a)*r);n.push(0,-1,0);}
    for(let i=0;i<seg;i++)idx.push(baseIdx,baseIdx+i+1,baseIdx+i+2);
    parts.push({positions:v,normals:n,indices:idx,color});
  }
  function torus(cx,cy,cz,major,minor,color,seg=24,sides=8) {
    const v=[],n=[],idx=[];
    for(let i=0;i<=seg;i++)for(let j=0;j<=sides;j++){
      const u=2*Math.PI*i/seg,q=2*Math.PI*j/sides;
      const x=(major+minor*Math.cos(q))*Math.cos(u),z=(major+minor*Math.cos(q))*Math.sin(u),y=minor*Math.sin(q);
      v.push(cx+x,cy+y,cz+z);n.push(Math.cos(q)*Math.cos(u),Math.sin(q),Math.cos(q)*Math.sin(u));
    }
    for(let i=0;i<seg;i++)for(let j=0;j<sides;j++){
      const a=i*(sides+1)+j,b=a+sides+1;idx.push(a,b,a+1,a+1,b,b+1);
    }
    parts.push({positions:v,normals:n,indices:idx,color});
  }
  function cone(cx,cy,cz,r,h,color,seg=14){cylinder(cx,cy,cz,r,h,color,seg,0.002);}
  function jewel(){sphere(0,.48,0,.24,.29,.24,light,12,8);cone(0,.74,0,.22,.28,base,12);}
  function heart(){
    sphere(-.16,.17,0,.22,.23,.17,base);
    sphere(.16,.17,0,.22,.23,.17,base);
    cone(0,-.08,0,.29,.55,base,12);
    sphere(0,.27,.14,.07,.06,.04,light,10,6);
  }
  // A common plinth anchors each independent 3D sculpture.
  cylinder(0,-.68,0,.64,.12,dark,28);
  torus(0,-.59,0,.55,.035,light,28,8);
  const c=gift.category,n=gift.name.toLowerCase();
  if(/cnc coin/.test(n)){
    cylinder(0,.02,0,.43,.13,"#d7a83d",32,.025);
    cylinder(0,.02,.075,.4,.07,"#f3d36d",32,.02);
    torus(0,.02,0,.4,.025,"#fff0a8",32,8);
    sphere(0,.1,.12,.075,.075,.035,"#fff4bb",10,7);
  } else if(/fighting/.test(n)){
    sphere(0,.17,0,.34,.28,.3,"#d85c73",18,10);
    sphere(.21,.3,.04,.19,.17,.19,"#f0788d",14,9);
    sphere(.03,.39,.03,.17,.16,.17,"#f0788d",14,9);
    sphere(-.14,.34,.02,.16,.15,.16,"#f0788d",14,9);
    cylinder(-.12,-.12,0,.23,.25,"#b33d5a",16,.03);
    torus(0,.12,0,.34,.025,light,24,7);
  } else if(/four leaf clover/.test(n)){
    for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2;sphere(Math.cos(a)*.18,.34+Math.sin(a)*.04,Math.sin(a)*.18,.19,.19,.16,"#55b96d",12,8);}
    cylinder(0,-.08,0,.025,.5,"#36894e",10,.005);
  } else if(/dj headphone/.test(n)){
    torus(0,.28,0,.34,.055,"#6d70ba",24,8);
    sphere(-.34,.08,0,.11,.2,.12,"#4a4d9c",12,8);
    sphere(.34,.08,0,.11,.2,.12,"#4a4d9c",12,8);
    sphere(-.34,.08,.13,.06,.12,.04,light,10,7);
    sphere(.34,.08,.13,.06,.12,.04,light,10,7);
  } else if(/^rose$|^white rose$|^crystal rose$|^my first rose$/.test(n)){
    cylinder(0,-.28,0,.035,.76,"#55b975",12);
    sphere(-.23,-.34,0,.24,.075,.12,"#6cc88a");
    sphere(.21,-.18,0,.23,.075,.12,"#72d99a");
    for(let ring=0;ring<3;ring++)for(let i=0;i<6;i++){
      const a=2*Math.PI*i/6+(ring*.48),r=.09+ring*.095;
      sphere(Math.cos(a)*r,.4+ring*.055,Math.sin(a)*r,.12,.095,.15,ring===2?light:base,10,7);
    }
    sphere(0,.51,0,.12,.12,.12,light,12,8);
  } else if(/baseball/.test(n)){
    sphere(0,.18,0,.43,.43,.43,"#f8f8f4",18,12);
    torus(0,.18,0,.39,.018,"#d94f59",24,6);
    torus(0,.18,0,.27,.014,"#d94f59",24,6);
    for(let i=0;i<7;i++){const y=-.16+i*.055;sphere(-.34,y,.19,.025,.012,.012,"#d94f59",7,4);sphere(.34,y,-.19,.025,.012,.012,"#d94f59",7,4);}
  } else if(/basketball/.test(n)){
    sphere(0,.18,0,.43,.43,.43,"#df873e",18,12);
    torus(0,.18,0,.42,.018,"#302d34",24,6);
    torus(0,.18,0,.29,.018,"#302d34",24,6);
  } else if(/ice cream|gelato|popsicle/.test(n)){
    cylinder(0,-.03,0,.23,.5,"#ba854e",18,.015);
    sphere(0,.37,0,.31,.28,.3,base,16,10);
    sphere(-.12,.49,.13,.06,.05,.05,light,8,5);
  } else if(/coffee/.test(n)){
    cylinder(0,.05,0,.27,.42,base,20,.24);
    torus(.28,.11,0,.16,.045,light,16,7);
    cylinder(0,.3,0,.25,.07,dark,20);
    sphere(0,.46,0,.07,.12,.06,light,9,6);
  } else if(c==="flowers"||/flower|tulip|bouquet|hibiscus|sakura|blossom|orchid|lotus/.test(n)){
    cylinder(0,-.28,0,.045,.72,"#55b975",12);
    sphere(-.23,-.34,0,.24,.08,.12,"#6cc88a");
    sphere(.21,-.18,0,.23,.08,.12,"#72d99a");
    for(let ring=0;ring<2;ring++)for(let i=0;i<8;i++){
      const a=2*Math.PI*i/8+(ring*.37),r=ring?.27:.16;
      sphere(Math.cos(a)*r,.42+ring*.04,Math.sin(a)*r,.14,.09,.19,ring?light:base,10,7);
    }
    sphere(0,.48,0,.13,.13,.13,light,12,8);
  } else if(c==="hearts"||/heart|love|kiss|cupid|hug/.test(n)){
    heart();torus(0,.18,0,.43,.025,light,24,8);
  } else if(c==="animals"||/animal|pet|alien/.test(n)){
    sphere(0,-.1,0,.43,.43,.34,base);
    sphere(0,.38,.02,.33,.31,.31,light);
    cone(-.2,.68,0,.14,.3,base,10);cone(.2,.68,0,.14,.3,base,10);
    sphere(-.12,.41,.29,.045,.06,.03,dark,8,5);sphere(.12,.41,.29,.045,.06,.03,dark,8,5);
    sphere(0,.27,.31,.12,.08,.05,light,10,6);
    torus(.39,-.15,0,.12,.035,light,12,6);
  } else if(c==="vehicles"){
    box(0,-.12,0,1.05,.34,.56,base);
    box(.05,.15,0,.58,.32,.49,light);
    for(const x of [-.35,.35])for(const z of [-.3,.3]){
      sphere(x,-.38,z,.17,.17,.11,dark,12,8);
      sphere(x,-.38,z+.04,.07,.07,.04,light,10,6);
    }
    if(/plane|jet|aircraft|shuttle/.test(n)){box(0,.3,0,.22,.72,.16,base);box(0,.05,0,1.22,.08,.38,light);cone(0,.71,0,.12,.34,base);}
    if(/rocket/.test(n)){cylinder(0,.12,0,.18,.75,base,14,.08);cone(0,.58,0,.18,.32,light);cone(0,-.32,0,.15,.35,"#f28b49");}
    if(/ship|boat|yacht/.test(n)){box(0,-.24,0,1.05,.16,.4,dark);box(0,.08,0,.5,.42,.36,light);cone(0,.7,0,.28,.65,base);}
  } else if(c==="music"){
    sphere(-.18,.02,0,.28,.35,.16,base);
    box(.22,.18,0,.54,.09,.11,light);
    cylinder(.46,.25,0,.055,.35,dark,10);
    sphere(-.18,.4,.04,.16,.13,.1,light,10,6);
    torus(-.17,-.11,.12,.18,.025,light,16,6);
  } else if(c==="sports"){
    if(/trophy|cup|medal|champion|award/.test(n)){
      cylinder(0,.14,0,.29,.5,light,18,.2);
      cylinder(0,-.25,0,.08,.28,base,12);
      cylinder(0,-.4,0,.32,.08,light,18);
      torus(-.29,.26,0,.15,.04,base);torus(.29,.26,0,.15,.04,base);
    } else {
      sphere(0,.16,0,.43,.43,.43,base,16,10);
      torus(0,.16,0,.43,.018,light,22,6);
      torus(0,.16,0,.32,.018,dark,22,6);
      sphere(.1,.34,.35,.05,.05,.03,light,8,5);
    }
  } else if(c==="food_drink"){
    if(/donut|doughnut|ring/.test(n)){torus(0,.18,0,.32,.15,base,24,10);sphere(.18,.34,.17,.06,.035,.04,light,8,5);}
    else if(/cup|coffee|tea|drink|soda|juice/.test(n)){
      cylinder(0,.03,0,.28,.58,base,18,.21);torus(0,.34,0,.22,.035,light,18,6);
      torus(.31,.09,0,.12,.035,light,16,6);sphere(0,.38,0,.2,.035,.2,dark,12,6);
    } else {
      cylinder(0,-.02,0,.42,.22,light,20);
      cylinder(0,.17,0,.36,.22,base,20);
      sphere(-.12,.33,.06,.13,.12,.12,light,10,6);
      sphere(.12,.34,-.04,.13,.12,.12,light,10,6);
    }
  } else if(c==="luxury"||c==="fashion_beauty"){
    if(/ring|bracelet|necklace/.test(n)){torus(0,.13,0,.4,.065,light,28,10);jewel();}
    else if(/crown|tiara|king|queen|royal/.test(n)){
      cylinder(0,.04,0,.38,.12,light,20);
      for(let i=0;i<5;i++){const x=(i-2)*.16;cone(x,.28,0,.11,.5,base,10);sphere(x,.55,0,.055,.055,.055,light,8,5);}
      cylinder(0,-.08,0,.38,.12,dark,20);
    } else if(/perfume|bottle/.test(n)){box(0,.13,0,.5,.56,.32,base);cylinder(0,.49,0,.11,.2,light,12);box(0,-.19,0,.58,.12,.38,light);}
    else{jewel();torus(0,.2,0,.4,.045,light,24,8);}
  } else if(c==="celebrations"){
    box(0,.02,0,.76,.68,.68,base);box(0,.02,.35,.12,.7,.08,light);
    box(0,.03,0,.8,.1,.74,light);
    torus(-.15,.47,0,.16,.045,light,14,7);torus(.15,.47,0,.16,.045,light,14,7);
    sphere(0,.51,0,.1,.09,.1,base,10,6);
  } else if(c==="fantasy"){
    cone(0,.1,0,.32,.9,base);cone(-.23,-.03,0,.18,.65,light);cone(.23,-.03,0,.18,.65,light);
    torus(0,.15,0,.53,.03,light,26,7);sphere(0,.66,0,.1,.1,.1,light,10,6);
  } else if(c==="games"){
    box(0,.08,0,.95,.43,.32,base);
    box(-.27,.13,.2,.24,.06,.045,light);
    sphere(.25,.22,.2,.07,.07,.045,light,8,5);sphere(.39,.08,.2,.07,.07,.045,light,8,5);
    torus(0,-.13,0,.42,.025,light,20,6);
  } else if(c==="nature"){
    cylinder(0,-.02,0,.08,.55,"#7f553a",12);
    sphere(0,.35,0,.38,.4,.35,"#4fbd78");
    sphere(-.2,.52,.02,.24,.24,.23,light);
    sphere(.2,.52,0,.24,.24,.23,base);
  } else if(c==="travel"){
    sphere(0,.14,0,.42,.42,.42,base,16,10);
    torus(0,.14,0,.52,.035,light,26,8);
    torus(0,.14,0,.58,.025,dark,26,8);
    sphere(.21,.28,.35,.08,.08,.07,light,10,6);
  } else if(c==="community"){
    sphere(-.26,.15,0,.21,.23,.2,base);
    sphere(0,.33,0,.23,.25,.21,light);
    sphere(.26,.15,0,.21,.23,.2,dark);
    torus(0,-.08,0,.45,.03,light,22,7);
  } else if(c==="symbols"){
    jewel();torus(0,.17,0,.43,.03,light,24,7);
  } else {
    sphere(0,.15,0,.39,.43,.33,base,14,9);
    torus(0,.15,0,.52,.035,light,24,8);
    cone(0,.63,0,.16,.3,light,12);
    sphere(-.22,-.12,.2,.11,.11,.1,light,10,6);
    sphere(.22,-.12,-.2,.1,.1,.1,dark,10,6);
  }
  // A small unique signature gem distinguishes objects that share a shape family.
  sphere(.48,.58,.1,.07,.07,.07,light,9,6);

  const binParts=[],bufferViews=[],accessors=[],primitives=[],materials=[];
  let byteOffset=0;
  function align4(buf){const pad=(4-(buf.length%4))%4;return pad?Buffer.concat([buf,Buffer.alloc(pad)]):buf;}
  function addBuffer(buf,target){
    const padded=align4(buf);
    const viewIndex=bufferViews.length;
    bufferViews.push({buffer:0,byteOffset,byteLength:buf.length,target});
    binParts.push(padded);byteOffset+=padded.length;return viewIndex;
  }
  for(const p of parts){
    if(!p.indices.length)continue;
    const pos=Buffer.from(new Float32Array(p.positions).buffer);
    const nor=Buffer.from(new Float32Array(p.normals).buffer);
    const maxIndex=Math.max(...p.indices);
    const use32=maxIndex>65535;
    const ind=use32?Buffer.from(new Uint32Array(p.indices).buffer):Buffer.from(new Uint16Array(p.indices).buffer);
    const pv=addBuffer(pos,34962),nv=addBuffer(nor,34962),iv=addBuffer(ind,34963);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<p.positions.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p.positions[i+k]);max[k]=Math.max(max[k],p.positions[i+k]);}
    const pa=accessors.length;
    accessors.push({bufferView:pv,componentType:5126,count:p.positions.length/3,type:"VEC3",min,max});
    const na=accessors.length;accessors.push({bufferView:nv,componentType:5126,count:p.normals.length/3,type:"VEC3"});
    const ia=accessors.length;accessors.push({bufferView:iv,componentType:use32?5125:5123,count:p.indices.length,type:"SCALAR"});
    const color=p.color.startsWith("#")?p.color:"#ffffff";
    const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
    const materialIndex=primitives.length;
    const materialsRef=materials.length;
    materials.push({name:"Minglora "+gift.name+" finish "+(materialsRef+1),pbrMetallicRoughness:{baseColorFactor:[rgb[0],rgb[1],rgb[2],1],metallicFactor:.45,roughnessFactor:.28}});
    primitives.push({attributes:{POSITION:pa,NORMAL:na},indices:ia,material:materialIndex,mode:4});
  }
  const bin=Buffer.concat(binParts);
  return {
    asset:{version:"2.0",generator:"Minglora Gift Studio"},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:"Minglora "+gift.name}],
    meshes:[{name:gift.name,primitives}],
    materials,
    buffers:[{byteLength:bin.length,uri:"data:application/octet-stream;base64,"+bin.toString("base64")}],
    bufferViews,accessors
  };
}
function writeAsset(file,content,checkOnly){
  if(checkOnly){if(!fs.existsSync(file)||fs.readFileSync(file,"utf8")!==content)throw new Error("Generated gift asset mismatch: "+file);return;}
  fs.writeFileSync(file,content);
}
function main(){
  const checkOnly=process.argv.includes("--check");
  const data=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));
  if(!Array.isArray(data.gifts)||data.gifts.length!==data.gift_count)throw new Error("Gift catalogue manifest count does not match its records.");
  const codes=new Set(),namePricePairs=new Set(),imagePaths=new Set(),modelPaths=new Set();
  for(const gift of data.gifts){
    if(!gift||typeof gift!=="object")throw new Error("Gift catalogue contains a non-object record.");
    if(!Number.isSafeInteger(gift.coin_price)||gift.coin_price<1)throw new Error("Invalid coin price: "+gift.name);
    if(!/^[a-z0-9_-]{1,59}$/.test(String(gift.code||"")))throw new Error("Invalid gift code: "+gift.code);
    if(!String(gift.name||"").trim()||!String(gift.category||"").trim())throw new Error("Gift is missing its name or category: "+gift.code);
    if(!String(gift.animation_preset||"").trim()||!String(gift.sound_preset||"").trim())throw new Error("Gift is missing its animation or sound profile: "+gift.code);
    const pair=gift.name.toLocaleLowerCase("en-US")+"|"+gift.coin_price;
    if(codes.has(gift.code))throw new Error("Duplicate gift code: "+gift.code);
    if(namePricePairs.has(pair))throw new Error("Duplicate gift name and price: "+pair);
    if(gift.image_url!=="/assets/gifts/catalog/"+gift.code+".svg"||gift.model_url!=="/assets/gifts/catalog/"+gift.code+".gltf")throw new Error("Gift asset paths are not canonical: "+gift.code);
    if(imagePaths.has(gift.image_url)||modelPaths.has(gift.model_url))throw new Error("Duplicate gift asset path: "+gift.code);
    codes.add(gift.code);namePricePairs.add(pair);imagePaths.add(gift.image_url);modelPaths.add(gift.model_url);
  }
  fs.mkdirSync(ASSET_DIR,{recursive:true});
  let count=0;
  for(const gift of data.gifts){
    const svg=svgArt(gift);
    const gltf=JSON.stringify(modelDocument(gift));
    writeAsset(path.join(ASSET_DIR,gift.code+".svg"),svg,checkOnly);
    writeAsset(path.join(ASSET_DIR,gift.code+".gltf"),gltf,checkOnly);
    count++;
  }
  const stamp={version:1,giftCount:count,svgAssets:count,gltfAssets:count,generatedAt:String(data.generated_at||"unspecified")};
  const stampText=JSON.stringify(stamp,null,2);
  writeAsset(path.join(ASSET_DIR,"catalog-build.json"),stampText,checkOnly);
  process.stdout.write("[Minglora Gift Studio] "+(checkOnly?"verified ":"generated ")+count+" individual SVG artworks and "+count+" 3D GLTF gift models.\n");
}
main();
